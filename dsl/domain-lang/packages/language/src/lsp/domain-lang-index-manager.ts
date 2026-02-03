import type { LangiumDocument, LangiumSharedCoreServices, URI } from 'langium';
import { DefaultIndexManager, DocumentState } from 'langium';
import { CancellationToken } from 'vscode-jsonrpc';
import { resolveImportPath } from '../utils/import-utils.js';
import type { Model } from '../generated/ast.js';

/**
 * Custom IndexManager that extends Langium's default to:
 * 1. Automatically load imported documents during indexing
 * 2. Track import dependencies for cross-file revalidation
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
     * Maps document URI to its import specifiers and their resolved URIs.
     * Used to detect when file moves could affect import resolution.
     * Key: importing document URI
     * Value: Map of import specifier → resolved URI
     */
    private readonly documentImportSpecifiers = new Map<string, Map<string, string>>();
    
    /**
     * Tracks documents that have had their imports loaded to avoid redundant work.
     * Cleared on workspace config changes.
     */
    private readonly importsLoaded = new Set<string>();
    
    /**
     * Reference to shared services for accessing LangiumDocuments.
     */
    private readonly sharedServices: LangiumSharedCoreServices;

    constructor(services: LangiumSharedCoreServices) {
        super(services);
        this.sharedServices = services;
    }

    /**
     * Extends the default content update to:
     * 1. Ensure all imported documents are loaded
     * 2. Track import dependencies for change propagation
     * 
     * Called by Langium during the IndexedContent build phase.
     * This is BEFORE linking/validation, so imports are available for resolution.
     */
    override async updateContent(document: LangiumDocument, cancelToken = CancellationToken.None): Promise<void> {
        // First, do the standard content indexing
        await super.updateContent(document, cancelToken);

        // Then, ensure imports are loaded and track dependencies
        await this.ensureImportsLoaded(document);
        await this.trackImportDependencies(document);
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
     * Extends `isAffected` to also check import dependencies.
     * 
     * A document is affected if:
     * 1. It has cross-references to any changed document (default Langium behavior)
     * 2. It imports any of the changed documents (our extension)
     */
    override isAffected(document: LangiumDocument, changedUris: Set<string>): boolean {
        // First check Langium's default: cross-references
        if (super.isAffected(document, changedUris)) {
            return true;
        }

        // Then check our import dependencies
        const docUri = document.uri.toString();
        for (const changedUri of changedUris) {
            const dependents = this.importDependencies.get(changedUri);
            if (dependents?.has(docUri)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Tracks import dependencies for a document.
     * For each import in the document, records:
     * 1. That the imported URI is depended upon (for direct change detection)
     * 2. The import specifier used (for file move detection)
     */
    private async trackImportDependencies(document: LangiumDocument): Promise<void> {
        const importingUri = document.uri.toString();
        
        // First, remove old dependencies from this document
        // (in case imports changed)
        this.removeDocumentFromDependencies(importingUri);
        this.documentImportSpecifiers.delete(importingUri);

        // Skip if document isn't ready (no parse result)
        if (document.state < DocumentState.Parsed) {
            return;
        }

        const model = document.parseResult.value as unknown as Model;
        if (!model.imports) {
            return;
        }

        const specifierMap = new Map<string, string>();
        
        for (const imp of model.imports) {
            if (!imp.uri) continue;

            try {
                const resolvedUri = await resolveImportPath(document, imp.uri);
                const importedUri = resolvedUri.toString();

                // Track the specifier → resolved URI mapping
                specifierMap.set(imp.uri, importedUri);

                // Add to reverse dependency graph: importedUri → importingUri
                let dependents = this.importDependencies.get(importedUri);
                if (!dependents) {
                    dependents = new Set();
                    this.importDependencies.set(importedUri, dependents);
                }
                dependents.add(importingUri);
            } catch {
                // Import resolution failed - still track the specifier with empty resolution
                specifierMap.set(imp.uri, '');
            }
        }
        
        if (specifierMap.size > 0) {
            this.documentImportSpecifiers.set(importingUri, specifierMap);
        }
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
                const resolvedUri = await resolveImportPath(document, imp.uri);
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
        // Remove as an imported document
        this.importDependencies.delete(uri);
        
        // Remove from all dependency sets (as an importer)
        this.removeDocumentFromDependencies(uri);
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
        this.documentImportSpecifiers.clear();
        this.importsLoaded.clear();
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
        const specifierMap = this.documentImportSpecifiers.get(documentUri);
        if (!specifierMap) {
            return new Set();
        }
        
        const resolved = new Set<string>();
        for (const resolvedUri of specifierMap.values()) {
            // Only include successfully resolved imports (non-empty string)
            if (resolvedUri) {
                resolved.add(resolvedUri);
            }
        }
        return resolved;
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

        for (const [docUri, specifierMap] of this.documentImportSpecifiers) {
            if (this.hasMatchingSpecifierOrResolvedUri(specifierMap, changedPaths)) {
                affected.add(docUri);
            }
        }

        return affected;
    }

    /**
     * Checks if any specifier OR its resolved URI matches the changed paths.
     * 
     * This handles both regular imports and path aliases:
     * - Regular: `./domains/sales.dlang` matches path `sales.dlang`
     * - Aliased: `@domains/sales.dlang` resolves to `/full/path/domains/sales.dlang`
     *   When the file moves, the resolved URI matches but the specifier doesn't
     * 
     * We check both to ensure moves of aliased imports trigger revalidation.
     */
    private hasMatchingSpecifierOrResolvedUri(specifierMap: Map<string, string>, changedPaths: Set<string>): boolean {
        for (const [specifier, resolvedUri] of specifierMap.entries()) {
            const normalizedSpecifier = specifier.replace(/^[.@/]+/, '');
            
            for (const changedPath of changedPaths) {
                // Check the raw specifier (handles relative imports)
                if (specifier.includes(changedPath) || changedPath.endsWith(normalizedSpecifier)) {
                    return true;
                }
                
                // Check the resolved URI (handles path aliases like @domains/...)
                // The resolved URI contains the full file path which matches moved files
                if (resolvedUri?.includes(changedPath)) {
                    return true;
                }
            }
        }
        return false;
    }
}
