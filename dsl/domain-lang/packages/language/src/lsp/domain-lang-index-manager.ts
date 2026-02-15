import type { LangiumDocument, LangiumSharedCoreServices, URI } from 'langium';
import { DefaultIndexManager, DocumentState } from 'langium';
import { CancellationToken } from 'vscode-jsonrpc';
import { resolveImportPath } from '../utils/import-utils.js';
import type { Model } from '../generated/ast.js';
import type { ImportResolver } from '../services/import-resolver.js';
import type { DomainLangServices } from '../domain-lang-module.js';
import type { ImportInfo } from '../services/types.js';
import { createLogger } from '../services/lsp-logger.js';

const log = createLogger('IndexManager');

/**
 * Custom IndexManager that extends Langium's default to:
 * 1. Automatically load imported documents during indexing
 * 2. Track import dependencies for cross-file revalidation
 * 3. Export-signature diffing to prevent unnecessary cascading (PRS-017 R2)
 * 4. Import cycle detection with diagnostics (PRS-017 R3)
 * 5. Targeted ImportResolver cache invalidation (PRS-017 R1)
 * 
 * **Why this exists:**
 * Langium's `DefaultIndexManager.isAffected()` only checks cross-references
 * (elements declared with `[Type]` grammar syntax). DomainLang's imports use
 * string literals (`import "path"`), which are not cross-references.
 * 
 * **How it works:**
 * - When a document is indexed, we ensure all its imports are also loaded
 * - Maintains a reverse dependency graph: importedUri → Set<importingUri>
 * - Also tracks import specifiers to detect when file moves affect resolution
 * - Overrides `isAffected()` to also check this graph
 * - This integrates with Langium's native `DocumentBuilder.update()` flow
 * 
 * **Integration with Langium:**
 * This approach is idiomatic because:
 * 1. `updateContent()` is called for EVERY document during build
 * 2. We load imports during indexing, BEFORE linking/validation
 * 3. `DocumentBuilder.shouldRelink()` calls `IndexManager.isAffected()`
 * 4. No need for separate lifecycle service - this IS the central place
 */
export class DomainLangIndexManager extends DefaultIndexManager {
    /**
     * Reverse dependency graph: maps a document URI to all documents that import it.
     * Key: imported document URI (string)
     * Value: Set of URIs of documents that import the key document
     */
    private readonly importDependencies = new Map<string, Set<string>>();
    
    /**
     * Maps document URI to its import information (specifier, alias, resolved URI).
     * Used for scope resolution with aliases and detecting when file moves affect imports.
     * Key: importing document URI
     * Value: Array of ImportInfo objects
     */
    private readonly documentImportInfo = new Map<string, ImportInfo[]>();
    
    /**
     * Tracks documents that have had their imports loaded to avoid redundant work.
     * Cleared on workspace config changes.
     */
    private readonly importsLoaded = new Set<string>();

    /**
     * Per-cycle cache for the transitive affected set computation.
     * Uses `changedUris` Set identity as cache key — Langium creates a fresh Set
     * for each `DocumentBuilder.update()` cycle, so reference equality naturally
     * invalidates the cache between cycles.
     */
    private transitiveAffectedCache: { key: Set<string>; result: Set<string> } | undefined;

    /**
     * Export snapshot cache (PRS-017 R2): maps document URI to its exported symbol
     * signatures. Used to detect whether a document's public interface actually
     * changed, preventing cascading revalidation for implementation-only changes.
     * Signature = "nodeType:qualifiedName" for each exported symbol.
     */
    private readonly exportSnapshots = new Map<string, Set<string>>();

    /**
     * Tracks which URIs had their exports actually change during the current
     * update cycle. Reset before each updateContent() call. Used by isAffected()
     * to skip transitive invalidation when exports are unchanged.
     */
    private readonly changedExports = new Set<string>();

    /**
     * Detected import cycles (PRS-017 R3): maps document URI to the cycle path.
     * Populated during trackImportDependencies(). Consumed by ImportValidator.
     */
    private readonly detectedCycles = new Map<string, string[]>();
    
    /**
     * Reference to shared services for accessing LangiumDocuments.
     */
    private readonly sharedServices: LangiumSharedCoreServices;

    /**
     * DI-injected import resolver. Set via late-binding because
     * IndexManager (shared module) is created before ImportResolver (language module).
     * Falls back to standalone resolveImportPath when not set.
     */
    private importResolver: ImportResolver | undefined;

    constructor(services: LangiumSharedCoreServices) {
        super(services);
        this.sharedServices = services;
    }

    /**
     * Late-binds the language-specific services after DI initialization.
     * Called from `createDomainLangServices()` after the language module is created.
     *
     * This is necessary because the IndexManager lives in the shared module,
     * which is created before the language module that provides ImportResolver.
     */
    setLanguageServices(services: DomainLangServices): void {
        this.importResolver = services.imports.ImportResolver;
    }

    /**
     * Resolves an import path using the DI-injected ImportResolver when available,
     * falling back to the standalone resolver for backwards compatibility.
     */
    private async resolveImport(document: LangiumDocument, specifier: string): Promise<URI> {
        if (this.importResolver) {
            return this.importResolver.resolveForDocument(document, specifier);
        }
        // Fallback for contexts where language services aren't wired (e.g., tests)
        return resolveImportPath(document, specifier);
    }

    /**
     * Extends the default content update to:
     * 1. Capture export snapshot before update (PRS-017 R2)
     * 2. Ensure all imported documents are loaded
     * 3. Track import dependencies for change propagation
     * 4. Compare export snapshot to detect interface changes (PRS-017 R2)
     * 5. Detect import cycles (PRS-017 R3)
     * 6. Trigger targeted ImportResolver cache invalidation (PRS-017 R1)
     * 
     * Called by Langium during the IndexedContent build phase.
     * This is BEFORE linking/validation, so imports are available for resolution.
     */
    override async updateContent(document: LangiumDocument, cancelToken = CancellationToken.None): Promise<void> {
        const uri = document.uri.toString();
        
        // R2: Capture export snapshot BEFORE re-indexing
        const oldExports = this.exportSnapshots.get(uri);
        
        // Standard content indexing
        await super.updateContent(document, cancelToken);

        // R2: Capture new export snapshot and compare
        const newExports = this.captureExportSnapshot(uri);
        this.exportSnapshots.set(uri, newExports);
        const exportsChanged = !oldExports || !this.setsEqual(oldExports, newExports);
        if (exportsChanged) {
            this.changedExports.add(uri);
            log.info('exports changed', { uri });
        } else {
            // R2: Remove from changedExports when exports stabilize.
            // Without this, the set accumulates indefinitely and the
            // anyExportsChanged() gate stays permanently open.
            this.changedExports.delete(uri);
        }

        // Ensure imports are loaded and track dependencies
        await this.ensureImportsLoaded(document);
        await this.trackImportDependencies(document);

        // R3: Detect import cycles after tracking dependencies
        this.detectAndStoreCycles(uri);

        // R1: Targeted ImportResolver cache invalidation
        this.invalidateImportResolverCache(uri);
    }

    /**
     * Extends the default remove to also clean up import dependencies.
     */
    override remove(uri: URI): void {
        super.remove(uri);
        const uriString = uri.toString();
        this.removeImportDependencies(uriString);
        this.importsLoaded.delete(uriString);
    }

    /**
     * Extends the default content removal to also clean up import dependencies.
     */
    override removeContent(uri: URI): void {
        super.removeContent(uri);
        const uriString = uri.toString();
        this.removeImportDependencies(uriString);
        this.importsLoaded.delete(uriString);
    }

    /**
     * Extends `isAffected` to check import dependencies — direct, transitive,
     * and specifier-sensitive.
     * 
     * A document is affected if:
     * 1. It has cross-references to any changed document (default Langium behavior)
     * 2. It directly or transitively imports any changed document whose exports
     *    actually changed (PRS-017 R2 — export-signature diffing)
     * 3. Its import specifiers match changed file paths (handles renames/moves)
     * 
     * The transitive affected set is computed once per `update()` cycle and cached
     * using `changedUris` Set identity (Langium creates a fresh Set per cycle).
     * This avoids redundant BFS walks when `isAffected()` is called for every
     * loaded document in the workspace.
     */
    override isAffected(document: LangiumDocument, changedUris: Set<string>): boolean {
        // First check Langium's default: cross-references
        if (super.isAffected(document, changedUris)) {
            return true;
        }

        // R2: If no changed URIs had their exports change, skip transitive check.
        // This prevents cascading revalidation for implementation-only changes
        // (e.g., editing a domain's vision string).
        const hasExportChanges = this.anyExportsChanged(changedUris);
        if (!hasExportChanges) {
            // Still check specifier matches for file renames/moves
            const changedPaths = this.extractPathSegments(changedUris);
            for (const changedPath of changedPaths) {
                const infos = this.documentImportInfo.get(document.uri.toString());
                if (infos && this.hasMatchingSpecifierOrResolvedUri(infos, new Set([changedPath]))) {
                    return true;
                }
            }
            return false;
        }

        // Then check our import dependency graph (direct + transitive + specifier)
        const affectedSet = this.computeAffectedSet(changedUris);
        return affectedSet.has(document.uri.toString());
    }

    /**
     * Computes the full set of document URIs affected by changes.
     * Cached per `changedUris` identity to avoid recomputation across multiple
     * `isAffected()` calls within the same `DocumentBuilder.update()` cycle.
     * 
     * Combines two dependency strategies:
     * 1. **Reverse graph walk** — direct and transitive importers via `importDependencies`
     * 2. **Specifier matching** — documents whose import specifiers match changed file
     *    paths (handles file renames/moves that change how imports resolve)
     */
    private computeAffectedSet(changedUris: Set<string>): Set<string> {
        // Cache hit: same changedUris Set reference means same update() cycle
        if (this.transitiveAffectedCache?.key === changedUris) {
            return this.transitiveAffectedCache.result;
        }

        const affected = new Set<string>();
        this.addTransitiveDependents(changedUris, affected);
        this.addSpecifierMatches(changedUris, affected);

        this.transitiveAffectedCache = { key: changedUris, result: affected };
        return affected;
    }

    /**
     * BFS through the reverse dependency graph to find all transitive importers.
     * If C changes and B imports C and A imports B, both A and B are added.
     */
    private addTransitiveDependents(changedUris: Set<string>, affected: Set<string>): void {
        const toProcess = [...changedUris];
        let uri: string | undefined;
        while ((uri = toProcess.pop()) !== undefined) {
            const dependents = this.importDependencies.get(uri);
            if (!dependents) {
                continue;
            }
            for (const dep of dependents) {
                if (!affected.has(dep) && !changedUris.has(dep)) {
                    affected.add(dep);
                    toProcess.push(dep);
                }
            }
        }
    }

    /**
     * Finds documents whose import specifiers fuzzy-match changed file paths.
     * Handles file renames/moves where the resolved URI hasn't been updated yet.
     */
    private addSpecifierMatches(changedUris: Set<string>, affected: Set<string>): void {
        const changedPaths = this.extractPathSegments(changedUris);
        for (const [docUri, importInfoList] of this.documentImportInfo) {
            if (!affected.has(docUri) && !changedUris.has(docUri)
                && this.hasMatchingSpecifierOrResolvedUri(importInfoList, changedPaths)) {
                affected.add(docUri);
            }
        }
    }

    /**
     * Tracks import dependencies for a document.
     * For each import in the document, records:
     * 1. That the imported URI is depended upon (for direct change detection)
     * 2. The import specifier and alias (for scope resolution)
     */
    private async trackImportDependencies(document: LangiumDocument): Promise<void> {
        const importingUri = document.uri.toString();
        
        // First, remove old dependencies from this document
        // (in case imports changed)
        this.removeDocumentFromDependencies(importingUri);
        this.documentImportInfo.delete(importingUri);

        // Skip if document isn't ready (no parse result)
        if (document.state < DocumentState.Parsed) {
            return;
        }

        const model = document.parseResult.value as unknown as Model;
        if (!model.imports) {
            return;
        }

        const importInfoList: ImportInfo[] = [];
        
        for (const imp of model.imports) {
            if (!imp.uri) continue;
            const info = await this.resolveAndTrackImport(document, imp, importingUri);
            importInfoList.push(info);
        }
        
        if (importInfoList.length > 0) {
            this.documentImportInfo.set(importingUri, importInfoList);
        }
    }

    /**
     * Resolves a single import and registers it in the reverse dependency graph.
     * Falls back to searching loaded documents when the filesystem resolver fails.
     */
    private async resolveAndTrackImport(
        document: LangiumDocument,
        imp: { uri?: string; alias?: string },
        importingUri: string
    ): Promise<ImportInfo> {
        const specifier = imp.uri ?? '';

        try {
            const resolvedUri = await this.resolveImport(document, specifier);
            const importedUri = resolvedUri.toString();
            this.addToDependencyGraph(importedUri, importingUri);
            return { specifier, alias: imp.alias, resolvedUri: importedUri };
        } catch {
            // Filesystem resolution failed (e.g., unsaved file, EmptyFileSystem).
            // Try to find a loaded document whose URI path matches the specifier.
            const matchedUri = this.findLoadedDocumentByPath(specifier, importingUri);
            if (matchedUri) {
                this.addToDependencyGraph(matchedUri, importingUri);
            }
            return { specifier, alias: imp.alias, resolvedUri: matchedUri };
        }
    }

    /**
     * Adds an edge to the reverse dependency graph: importedUri → importingUri.
     */
    private addToDependencyGraph(importedUri: string, importingUri: string): void {
        let dependents = this.importDependencies.get(importedUri);
        if (!dependents) {
            dependents = new Set();
            this.importDependencies.set(importedUri, dependents);
        }
        dependents.add(importingUri);
    }

    /**
     * Ensures all imported documents are loaded and available.
     * This is called during indexing, BEFORE linking/validation,
     * so that cross-file references can be resolved.
     * 
     * Works for both workspace files and standalone files.
     */
    private async ensureImportsLoaded(document: LangiumDocument): Promise<void> {
        const uriString = document.uri.toString();
        
        // Skip if already processed (avoid redundant work and infinite loops)
        if (this.importsLoaded.has(uriString)) {
            return;
        }
        this.importsLoaded.add(uriString);

        // Skip if document isn't ready (no parse result)
        if (document.state < DocumentState.Parsed) {
            return;
        }

        const model = document.parseResult.value as unknown as Model;
        if (!model.imports || model.imports.length === 0) {
            return;
        }

        const langiumDocuments = this.sharedServices.workspace.LangiumDocuments;
        const documentBuilder = this.sharedServices.workspace.DocumentBuilder;
        const newDocs: LangiumDocument[] = [];

        for (const imp of model.imports) {
            if (!imp.uri) continue;

            try {
                const resolvedUri = await this.resolveImport(document, imp.uri);
                const importedUriString = resolvedUri.toString();
                
                // Skip if already loaded
                if (this.importsLoaded.has(importedUriString)) {
                    continue;
                }

                // Load or create the imported document
                const importedDoc = await langiumDocuments.getOrCreateDocument(resolvedUri);
                
                // If document is not yet validated, add to batch for building
                // This ensures all imported documents reach Validated state,
                // preventing "workspace state is already Validated" errors
                if (importedDoc.state < DocumentState.Validated) {
                    newDocs.push(importedDoc);
                }
            } catch {
                // Import resolution failed - validation will report the error
            }
        }

        // Build any newly discovered documents to Validated state
        // This triggers indexing which will recursively load their imports
        if (newDocs.length > 0) {
            await documentBuilder.build(newDocs, { validation: true });
        }
    }

    /**
     * Removes a document from the import dependencies graph entirely.
     * Called when a document is deleted.
     */
    private removeImportDependencies(uri: string): void {
        // Remove as an imported document (reverse graph entry)
        this.importDependencies.delete(uri);
        
        // Remove import info for this document (forward graph entry)
        this.documentImportInfo.delete(uri);
        
        // Remove from all dependency sets (as an importer of other files)
        this.removeDocumentFromDependencies(uri);
        
        // Clean up PRS-017 caches
        this.exportSnapshots.delete(uri);
        this.changedExports.delete(uri);
        this.detectedCycles.delete(uri);
        
        // Invalidate the per-cycle cache since the graph changed
        this.transitiveAffectedCache = undefined;
    }

    /**
     * Removes a document from all dependency sets.
     * Called when a document's imports change or it's deleted.
     */
    private removeDocumentFromDependencies(uri: string): void {
        for (const deps of this.importDependencies.values()) {
            deps.delete(uri);
        }
    }

    /**
     * Clears all import-related caches.
     * Call this when workspace configuration changes.
     */
    clearImportDependencies(): void {
        this.importDependencies.clear();
        this.documentImportInfo.clear();
        this.importsLoaded.clear();
        this.transitiveAffectedCache = undefined;
        this.exportSnapshots.clear();
        this.changedExports.clear();
        this.detectedCycles.clear();
    }

    /**
     * Fallback for import resolution: searches loaded documents for one whose
     * URI path matches the import specifier. Used when the filesystem-based
     * resolver fails (e.g., unsaved files, EmptyFileSystem in tests).
     */
    private findLoadedDocumentByPath(specifier: string, excludeUri: string): string {
        const langiumDocuments = this.sharedServices.workspace.LangiumDocuments;
        for (const doc of langiumDocuments.all) {
            const docUri = doc.uri.toString();
            if (docUri === excludeUri) {
                continue;
            }
            if (doc.uri.path === specifier || doc.uri.path.endsWith(`/${specifier}`)) {
                return docUri;
            }
        }
        return '';
    }

    /**
     * Marks a document as needing import re-loading.
     * Called when a document's content changes.
     */
    markForReprocessing(uri: string): void {
        this.importsLoaded.delete(uri);
    }

    /**
     * Gets all documents that import the given URI.
     * Used to find documents that need rebuilding when a file changes.
     * 
     * @param uri - The URI of the changed/deleted file
     * @returns Set of URIs (as strings) of documents that import this file
     */
    getDependentDocuments(uri: string): Set<string> {
        return this.importDependencies.get(uri) ?? new Set();
    }

    /**
     * Gets the resolved import URIs for a document.
     * Returns only URIs where import resolution succeeded (non-empty resolved URI).
     * 
     * @param documentUri - The URI of the document
     * @returns Set of resolved import URIs, or empty set if none
     */
    getResolvedImports(documentUri: string): Set<string> {
        const importInfoList = this.documentImportInfo.get(documentUri);
        if (!importInfoList) {
            return new Set();
        }
        
        const resolved = new Set<string>();
        for (const info of importInfoList) {
            // Only include successfully resolved imports (non-empty string)
            if (info.resolvedUri) {
                resolved.add(info.resolvedUri);
            }
        }
        return resolved;
    }

    /**
     * Gets the full import information (including aliases) for a document.
     * Used by the scope provider to implement alias-prefixed name resolution.
     * 
     * @param documentUri - The URI of the document
     * @returns Array of ImportInfo objects, or empty array if none
     */
    getImportInfo(documentUri: string): ImportInfo[] {
        return this.documentImportInfo.get(documentUri) ?? [];
    }

    /**
     * Gets all documents that would be affected by changes to the given URIs.
     * This includes direct dependents and transitive dependents.
     * 
     * @param changedUris - URIs of changed/deleted files
     * @returns Set of all affected document URIs
     */
    getAllAffectedDocuments(changedUris: Iterable<string>): Set<string> {
        const affected = new Set<string>();
        const toProcess = [...changedUris];
        
        while (toProcess.length > 0) {
            const uri = toProcess.pop();
            if (!uri) {
                continue;
            }
            const dependents = this.importDependencies.get(uri);
            if (dependents) {
                for (const dep of dependents) {
                    if (!affected.has(dep)) {
                        affected.add(dep);
                        // Also check transitive dependents
                        toProcess.push(dep);
                    }
                }
            }
        }
        
        return affected;
    }

    /**
     * Gets documents that have import specifiers which might be affected by file moves.
     * 
     * When a file is moved/renamed, import specifiers that previously resolved to it
     * (or could now resolve to it) need to be re-evaluated. This method finds documents
     * whose imports might resolve differently after the file system change.
     * 
     * @param changedUris - URIs of changed/deleted/created files
     * @returns Set of document URIs that should be rebuilt
     */
    getDocumentsWithPotentiallyAffectedImports(changedUris: Iterable<string>): Set<string> {
        const changedPaths = this.extractPathSegments(changedUris);
        return this.findDocumentsMatchingPaths(changedPaths);
    }

    /**
     * Extracts path segments from URIs for fuzzy matching.
     */
    private extractPathSegments(uris: Iterable<string>): Set<string> {
        const paths = new Set<string>();
        
        for (const uri of uris) {
            this.addPathSegmentsFromUri(uri, paths);
        }
        
        return paths;
    }

    /**
     * Adds path segments from a single URI to the set.
     */
    private addPathSegmentsFromUri(uri: string, paths: Set<string>): void {
        try {
            const url = new URL(uri);
            const pathParts = url.pathname.split('/').filter(p => p.length > 0);
            
            // Add filename
            const fileName = pathParts.at(-1);
            if (fileName) {
                paths.add(fileName);
            }
            
            // Add parent/filename combination
            if (pathParts.length >= 2) {
                paths.add(pathParts.slice(-2).join('/'));
            }
            
            // Add grandparent/parent/filename combination
            if (pathParts.length >= 3) {
                paths.add(pathParts.slice(-3).join('/'));
            }
        } catch {
            // Invalid URI, skip
        }
    }

    /**
     * Finds documents with import specifiers matching any of the given paths.
     */
    private findDocumentsMatchingPaths(changedPaths: Set<string>): Set<string> {
        const affected = new Set<string>();

        for (const [docUri, importInfoList] of this.documentImportInfo) {
            if (this.hasMatchingSpecifierOrResolvedUri(importInfoList, changedPaths)) {
                affected.add(docUri);
            }
        }

        return affected;
    }

    /**
     * Checks if any specifier OR its resolved URI matches the changed paths (PRS-017 R4).
     * 
     * Uses exact filename matching instead of substring matching to prevent
     * false positives (e.g., changing `sales.dlang` should NOT trigger
     * revalidation of a file importing `pre-sales.dlang`).
     * 
     * This handles both regular imports and path aliases:
     * - Regular: `./domains/sales.dlang` matches path `sales.dlang`
     * - Aliased: `@domains/sales.dlang` resolves to `/full/path/domains/sales.dlang`
     *   When the file moves, the resolved URI matches but the specifier doesn't
     * 
     * We check both to ensure moves of aliased imports trigger revalidation.
     */
    private hasMatchingSpecifierOrResolvedUri(importInfoList: ImportInfo[], changedPaths: Set<string>): boolean {
        for (const info of importInfoList) {
            if (this.matchesAnyChangedPath(info, changedPaths)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if a single import info matches any of the changed paths.
     * Extracted to reduce cognitive complexity of hasMatchingSpecifierOrResolvedUri.
     */
    private matchesAnyChangedPath(info: ImportInfo, changedPaths: Set<string>): boolean {
        for (const changedPath of changedPaths) {
            if (this.matchesChangedPath(info, changedPath)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if a single import info matches a single changed path.
     */
    private matchesChangedPath(info: ImportInfo, changedPath: string): boolean {
        const changedFileName = this.extractFileName(changedPath);
        if (!changedFileName) return false;

        // Check the resolved URI first (most reliable — already normalized)
        if (info.resolvedUri && this.matchesResolvedUri(info.resolvedUri, changedFileName, changedPath)) {
            return true;
        }

        // Check the specifier (handles relative imports)
        return this.matchesSpecifier(info.specifier, changedFileName, changedPath);
    }

    /**
     * Checks if a resolved URI matches a changed path by exact filename comparison.
     */
    private matchesResolvedUri(resolvedUri: string, changedFileName: string, changedPath: string): boolean {
        const resolvedFileName = this.extractFileName(resolvedUri);
        if (resolvedFileName && changedFileName === resolvedFileName) {
            return this.pathEndsWith(resolvedUri, changedPath);
        }
        return false;
    }

    /**
     * Checks if an import specifier matches a changed path by exact filename comparison.
     */
    private matchesSpecifier(specifier: string, changedFileName: string, changedPath: string): boolean {
        const specifierFileName = this.extractFileName(specifier);
        if (specifierFileName && changedFileName === specifierFileName) {
            const normalizedSpecifier = specifier.replace(/^[.@/]+/, '');
            return this.pathEndsWith(changedPath, normalizedSpecifier) ||
                this.pathEndsWith(normalizedSpecifier, changedPath);
        }
        return false;
    }

    /**
     * Extracts the filename (without extension) from a path or URI string.
     */
    private extractFileName(pathOrUri: string): string | undefined {
        // Handle URI paths and regular paths
        const lastSlash = Math.max(pathOrUri.lastIndexOf('/'), pathOrUri.lastIndexOf('\\'));
        const fileName = lastSlash >= 0 ? pathOrUri.slice(lastSlash + 1) : pathOrUri;
        return fileName.replace(/\.dlang$/, '') || undefined;
    }

    /**
     * Checks if longPath ends with shortPath, comparing path segments.
     * Prevents substring false positives (e.g., "pre-sales" matching "sales").
     */
    private pathEndsWith(longPath: string, shortPath: string): boolean {
        const normalizedLong = longPath.replaceAll('\\', '/').replace(/\.dlang$/, '');
        const normalizedShort = shortPath.replaceAll('\\', '/').replace(/\.dlang$/, '');
        return normalizedLong === normalizedShort ||
            normalizedLong.endsWith(`/${normalizedShort}`);
    }

    // --- PRS-017 R2: Export-signature diffing ---

    /**
     * Captures a snapshot of exported symbol signatures for a document.
     * Signature = "nodeType:qualifiedName" for each exported symbol.
     * Used to detect whether a document's public interface actually changed.
     */
    private captureExportSnapshot(uri: string): Set<string> {
        const descriptions = this.symbolIndex.get(uri) ?? [];
        const signatures = new Set<string>();
        for (const desc of descriptions) {
            signatures.add(`${desc.type}:${desc.name}`);
        }
        return signatures;
    }

    /**
     * Checks if two sets of strings are equal (same size and same elements).
     */
    private setsEqual(a: Set<string>, b: Set<string>): boolean {
        if (a.size !== b.size) return false;
        for (const item of a) {
            if (!b.has(item)) return false;
        }
        return true;
    }

    /**
     * Returns true if any of the changed URIs had their exports actually change.
     * Used by isAffected() to skip transitive invalidation when only
     * implementation details changed (e.g., editing a vision string).
     */
    private anyExportsChanged(changedUris: Set<string>): boolean {
        for (const uri of changedUris) {
            if (this.changedExports.has(uri)) {
                return true;
            }
        }
        return false;
    }

    // --- PRS-017 R3: Import cycle detection ---

    /**
     * Detects import cycles starting from a given document URI.
     * Uses DFS with a recursion stack to find back-edges in the import graph.
     * Stores detected cycles for reporting by ImportValidator.
     */
    private detectAndStoreCycles(startUri: string): void {
        // Clear any previous cycle for this document
        this.detectedCycles.delete(startUri);

        const cycle = this.findCycle(startUri);
        if (cycle) {
            // Store the cycle for each participant (skip last element which is the
            // duplicate that closes the cycle, e.g. [A, B, C, A] → store for A, B, C)
            for (let i = 0; i < cycle.length - 1; i++) {
                this.detectedCycles.set(cycle[i], cycle);
            }
        }
    }

    /**
     * DFS to find a cycle in the forward import graph starting from startUri.
     * Returns the cycle path (e.g., [A, B, C, A]) if found, undefined otherwise.
     */
    private findCycle(startUri: string): string[] | undefined {
        const visited = new Set<string>();
        const stack = new Set<string>();
        const path: string[] = [];

        const dfs = (uri: string): string[] | undefined => {
            if (stack.has(uri)) {
                // Found cycle — extract the cycle path from the stack
                const cycleStart = path.indexOf(uri);
                return [...path.slice(cycleStart), uri];
            }
            if (visited.has(uri)) return undefined;

            visited.add(uri);
            stack.add(uri);
            path.push(uri);

            const imports = this.documentImportInfo.get(uri);
            if (imports) {
                for (const imp of imports) {
                    if (imp.resolvedUri) {
                        const cycle = dfs(imp.resolvedUri);
                        if (cycle) return cycle;
                    }
                }
            }

            stack.delete(uri);
            path.pop();
            return undefined;
        };

        return dfs(startUri);
    }

    /**
     * Gets the detected import cycle for a document, if any.
     * Returns the cycle path as an array of URIs, or undefined if no cycle.
     * Used by ImportValidator to report cycle diagnostics (PRS-017 R3).
     */
    getCycleForDocument(uri: string): string[] | undefined {
        return this.detectedCycles.get(uri);
    }

    // --- PRS-017 R1: Targeted ImportResolver cache invalidation ---

    /**
     * Invalidates the ImportResolver cache for the changed document and its dependents.
     * This provides surgical cache invalidation instead of clearing the entire cache.
     */
    private invalidateImportResolverCache(changedUri: string): void {
        if (!this.importResolver) return;

        const affectedUris = [changedUri];
        const dependents = this.importDependencies.get(changedUri);
        if (dependents) {
            affectedUris.push(...dependents);
        }
        this.importResolver.invalidateForDocuments(affectedUris);
    }
}
