import fs from 'node:fs/promises';
import path from 'node:path';
import { DocumentCache, SimpleCache, URI, type LangiumDocument, type LangiumSharedCoreServices } from 'langium';
import { ManifestManager } from './workspace-manager.js';
import type { DomainLangServices } from '../domain-lang-module.js';
import type { LockFile } from './types.js';
import { getLspRuntimeSettings } from './lsp-runtime-settings.js';

// --- PRS-017 R8: Structured import resolution errors ---

/**
 * Resolution failure reason codes for programmatic handling.
 */
export type ImportResolutionReason =
    | 'file-not-found'
    | 'unknown-alias'
    | 'missing-manifest'
    | 'not-installed'
    | 'dependency-not-found'
    | 'missing-entry'
    | 'unresolvable';

/**
 * Structured error for import resolution failures.
 *
 * Carries the specifier, attempted paths, a reason code, and
 * a human-readable hint so callers can build precise diagnostics
 * without parsing error message strings.
 */
export class ImportResolutionError extends Error {
    /** The import specifier that failed to resolve. */
    readonly specifier: string;
    /** Paths that were tried during resolution (in order). */
    readonly attemptedPaths: readonly string[];
    /** Machine-readable failure reason. */
    readonly reason: ImportResolutionReason;
    /** Human-readable suggestion for fixing the problem. */
    readonly hint: string;

    constructor(opts: {
        specifier: string;
        attemptedPaths?: string[];
        reason: ImportResolutionReason;
        hint: string;
        message?: string;
    }) {
        const msg = opts.message ?? `Cannot resolve import '${opts.specifier}': ${opts.hint}`;
        super(msg);
        this.name = 'ImportResolutionError';
        this.specifier = opts.specifier;
        this.attemptedPaths = Object.freeze(opts.attemptedPaths ?? []);
        this.reason = opts.reason;
        this.hint = opts.hint;
    }
}

/**
 * Cache interface for import resolution.
 * In LSP mode: DocumentCache segments cache per-document URI, auto-invalidating only
 * the changed document's sub-map. Cross-document invalidation (when an imported file
 * moves/deletes) is handled by DomainLangIndexManager calling invalidateForDocuments().
 * In standalone mode: SimpleCache with manual invalidation via clearCache().
 */
type ResolverCache = DocumentCache<string, URI> | SimpleCache<string, URI>;

/**
 * ImportResolver resolves import statements using manifest-centric rules (PRS-010).
 *
 * Import Types (PRS-010):
 * - Local relative: ./path, ../path → Directory-first resolution
 * - Path aliases: @/path, @alias/path → Configurable in model.yaml paths section
 * - External: dependency key → Manifest dependencies (key can be owner/package or an alias that maps to source)
 *
 * Directory-First Resolution:
 * - ./types → ./types/index.dlang → ./types.dlang
 * - Module entry defaults to index.dlang (no model.yaml required)
 * 
 * Caching Strategy (PRS-017 R1 — uses Langium standard infrastructure):
 * - LSP mode: Uses `DocumentCache` keyed by importing document URI
 *   Each document's import resolutions are cached independently.
 *   When a document changes, only ITS cache entries are auto-cleared.
 *   Cross-document invalidation (when an imported file moves/deletes) is
 *   handled by DomainLangIndexManager calling `invalidateForDocuments()`
 *   with the reverse dependency graph.
 * - Standalone mode: Uses `SimpleCache` - manual invalidation via clearCache()
 * 
 * Why DocumentCache with manual cross-invalidation (not WorkspaceCache)?
 * - WorkspaceCache clears the ENTIRE cache on ANY document change
 * - In a 50-file workspace, editing one file caused ~50 redundant re-resolutions
 * - DocumentCache + targeted invalidation via reverse dep graph only clears
 *   the changed file and its direct/transitive importers
 * - This matches gopls' per-package invalidation strategy
 * 
 * @see https://langium.org/docs/recipes/caching/ for Langium caching patterns
 */
export class ImportResolver {
    private readonly workspaceManager: ManifestManager;
    /**
     * Per-document cache for resolved import URIs.
     * In LSP mode: DocumentCache - clears only the changed document's entries.
     *   Cross-document invalidation handled by DomainLangIndexManager.
     * In standalone mode: SimpleCache - manual invalidation via clearCache().
     */
    private readonly resolverCache: ResolverCache;
    
    /**
     * Whether the cache is a DocumentCache (LSP mode) for targeted invalidation.
     */
    private readonly isDocumentCache: boolean;

    /**
     * Creates an ImportResolver.
     * 
     * @param services - DomainLang services. If `services.shared` is present, uses DocumentCache
     *                   for per-document invalidation. Otherwise uses SimpleCache for standalone mode.
     */
    constructor(services: DomainLangServices) {
        this.workspaceManager = services.imports.ManifestManager;
        
        // Use Langium's DocumentCache when shared services are available (LSP mode)
        // Fall back to SimpleCache for standalone utilities (SDK, CLI)
        const shared = (services as DomainLangServices & { shared?: LangiumSharedCoreServices }).shared;
        if (shared) {
            // LSP mode: DocumentCache — per-document sub-maps (PRS-017 R1)
            //
            // Each document's import resolutions are cached in a separate sub-map.
            // When a document changes, only ITS sub-map is auto-cleared.
            // Cross-document invalidation (imported file moved/deleted) is handled
            // by DomainLangIndexManager calling invalidateForDocuments() with the
            // reverse dependency graph.
            //
            // This replaces the previous WorkspaceCache which cleared EVERYTHING
            // on any change, causing redundant re-resolutions across the workspace.
            this.resolverCache = new DocumentCache<string, URI>(shared);
            this.isDocumentCache = true;
        } else {
            // Standalone mode: simple key-value cache, manual invalidation
            this.resolverCache = new SimpleCache<string, URI>();
            this.isDocumentCache = false;
        }
    }

    /**
     * Clears the entire import resolution cache.
     * Call explicitly when model.yaml or model.lock changes.
     */
    clearCache(): void {
        this.resolverCache.clear();
    }

    /**
     * Invalidates cached import resolutions for specific documents (PRS-017 R1).
     * 
     * Called by DomainLangIndexManager when files change, using the reverse
     * dependency graph to determine which documents' caches need clearing.
     * This provides targeted invalidation instead of clearing the entire cache.
     * 
     * @param uris - Document URIs whose import resolution caches should be cleared
     */
    invalidateForDocuments(uris: Iterable<string>): void {
        if (this.isDocumentCache) {
            const docCache = this.resolverCache as DocumentCache<string, URI>;
            for (const uri of uris) {
                docCache.clear(URI.parse(uri));
            }
        }
    }

    /**
     * Resolve an import specifier relative to a Langium document.
     * Results are cached per-document using DocumentCache (PRS-017 R1).
     */
    async resolveForDocument(document: LangiumDocument, specifier: string): Promise<URI> {
        if (this.isDocumentCache) {
            // LSP mode: DocumentCache with (documentUri, specifier) as two-part key
            const docCache = this.resolverCache as DocumentCache<string, URI>;
            const cached = docCache.get(document.uri, specifier);
            if (cached) {
                this.trace(`[cache hit] ${specifier} from ${document.uri.fsPath}`);
                return cached;
            }
            const baseDir = path.dirname(document.uri.fsPath);
            const result = await this.resolveFrom(baseDir, specifier);
            this.trace(`[resolved] ${specifier} from ${document.uri.fsPath} → ${result.fsPath}`);
            docCache.set(document.uri, specifier, result);
            return result;
        }
        
        // Standalone mode: SimpleCache with composite key
        const simpleCache = this.resolverCache as SimpleCache<string, URI>;
        const cacheKey = `${document.uri.toString()}|${specifier}`;
        const cached = simpleCache.get(cacheKey);
        if (cached) {
            this.trace(`[cache hit] ${specifier}`);
            return cached;
        }
        const baseDir = path.dirname(document.uri.fsPath);
        const result = await this.resolveFrom(baseDir, specifier);
        this.trace(`[resolved] ${specifier} → ${result.fsPath}`);
        simpleCache.set(cacheKey, result);
        return result;
    }

    /**
     * Resolve an import specifier from a base directory (non-LSP contexts).
     */
    async resolveFrom(baseDir: string, specifier: string): Promise<URI> {
        await this.workspaceManager.initialize(baseDir);

        // Local relative paths (./path or ../path) - directory-first resolution
        if (specifier.startsWith('./') || specifier.startsWith('../')) {
            const resolved = path.resolve(baseDir, specifier);
            return this.resolveLocalPath(resolved, specifier);
        }

        // Path aliases (@/path or @alias/path)
        if (specifier.startsWith('@')) {
            return this.resolvePathAlias(specifier);
        }

        // External dependency via manifest (owner/package format)
        return this.resolveExternalDependency(specifier);
    }

    /**
     * Resolves a path alias import.
     * 
     * @param specifier - Import specifier starting with @ (e.g., "@/lib", "@shared/types")
     */
    private async resolvePathAlias(specifier: string): Promise<URI> {
        const aliases = await this.workspaceManager.getPathAliases();
        const root = this.workspaceManager.getWorkspaceRoot();

        // Find matching alias
        const aliasMatch = this.findMatchingAlias(specifier, aliases);

        if (aliasMatch) {
            const { alias: _alias, targetPath, remainder } = aliasMatch;
            const manifestPath = await this.workspaceManager.getManifestPath();
            const manifestDir = manifestPath ? path.dirname(manifestPath) : root;
            const resolvedBase = path.resolve(manifestDir, targetPath);
            const resolved = remainder ? path.join(resolvedBase, remainder) : resolvedBase;
            return this.resolveLocalPath(resolved, specifier);
        }

        // Default: @/ maps to workspace root (implicit)
        if (specifier.startsWith('@/')) {
            const relativePath = specifier.slice(2);
            const resolved = path.join(root, relativePath);
            return this.resolveLocalPath(resolved, specifier);
        }

        throw new ImportResolutionError({
            specifier,
            reason: 'unknown-alias',
            hint: `Define it in model.yaml paths section:\n  paths:\n    "${specifier.split('/')[0]}": "./some/path"`,
            message: `Unknown path alias '${specifier.split('/')[0]}' in import '${specifier}'.\nHint: Define it in model.yaml paths section.`
        });
    }

    /**
     * Finds the longest matching alias for a specifier.
     */
    private findMatchingAlias(
        specifier: string,
        aliases: Record<string, string> | undefined
    ): { alias: string; targetPath: string; remainder: string } | undefined {
        if (!aliases) {
            return undefined;
        }

        // Sort by length descending to match most specific alias first
        const sortedAliases = Object.entries(aliases)
            .sort(([a], [b]) => b.length - a.length);

        for (const [alias, targetPath] of sortedAliases) {
            // Exact match
            if (specifier === alias) {
                return { alias, targetPath, remainder: '' };
            }
            // Prefix match (alias + /)
            if (specifier.startsWith(`${alias}/`)) {
                return { alias, targetPath, remainder: specifier.slice(alias.length + 1) };
            }
        }

        return undefined;
    }

    /**
     * Resolves an external dependency via manifest.
     * 
        * Import specifier is a dependency key from model.yaml.
        * - Recommended: key is owner/package.
        * - Optional: key is an alias with an explicit source.
     * The LSP only resolves to cached packages - no network calls.
     */
    private async resolveExternalDependency(specifier: string): Promise<URI> {
        const manifest = await this.workspaceManager.getManifest();
        if (!manifest) {
            throw new ImportResolutionError({
                specifier,
                reason: 'missing-manifest',
                hint: `Create model.yaml and add the dependency:\n  dependencies:\n    ${specifier}:\n      ref: v1.0.0`,
                message: `External dependency '${specifier}' requires model.yaml.`
            });
        }

        const lock = await this.workspaceManager.getLockFile();
        if (!lock) {
            throw new ImportResolutionError({
                specifier,
                reason: 'not-installed',
                hint: "Run 'dlang install' to fetch dependencies and generate model.lock.",
                message: `Dependency '${specifier}' not installed.`
            });
        }

        // Use WorkspaceManager to resolve from cache (read-only, no network)
        const resolved = await this.workspaceManager.resolveDependencyPath(specifier);
        if (!resolved) {
            throw new ImportResolutionError({
                specifier,
                reason: 'dependency-not-found',
                hint: `Add it to your dependencies:\n  dependencies:\n    ${specifier}:\n      ref: v1.0.0\nThen run 'dlang install' to fetch it.`,
                message: `Dependency '${specifier}' not found in model.yaml or not installed.`
            });
        }

        return URI.file(resolved);
    }

    /**
     * Resolves a local path using directory-first resolution.
     * 
     * Per PRS-010 (updated design):
     * - If path ends with .dlang → direct file import
     * - If no extension → directory-first:
     *   1. Try ./path/index.dlang (module default, no model.yaml required)
     *   2. Try ./path.dlang (file fallback)
     */
    private async resolveLocalPath(resolved: string, original: string): Promise<URI> {
        const ext = path.extname(resolved);

        if (ext === '.dlang') {
            // Direct file import
            await assertFileExists(resolved, original);
            return URI.file(resolved);
        }

        if (ext && ext !== '.dlang') {
            throw new ImportResolutionError({
                specifier: original,
                attemptedPaths: [resolved],
                reason: 'unresolvable',
                hint: `DomainLang files must use the .dlang extension.`,
                message: `Invalid file extension '${ext}' in import '${original}'.`
            });
        }

        // No extension → directory-first resolution
        return this.resolveDirectoryFirst(resolved, original);
    }

    /**
     * Directory-first resolution: ./types → ./types/index.dlang → ./types.dlang
     * 
     * Module entry defaults to index.dlang without requiring model.yaml.
     * If the directory has model.yaml with custom entry, use that.
     */
    private async resolveDirectoryFirst(resolved: string, original: string): Promise<URI> {
        // Step 1: Check if directory exists with index.dlang (or custom entry)
        const isDirectory = await this.isDirectory(resolved);
        if (isDirectory) {
            // Check for model.yaml to get custom entry point
            const moduleManifestPath = path.join(resolved, 'model.yaml');
            const entryPoint = await this.readModuleEntry(moduleManifestPath);
            const entryFile = path.join(resolved, entryPoint);
            
            if (await this.fileExists(entryFile)) {
                return URI.file(entryFile);
            }

            // Directory exists but no entry file
            throw new ImportResolutionError({
                specifier: original,
                attemptedPaths: [path.join(resolved, entryPoint)],
                reason: 'missing-entry',
                hint: `Create '${entryPoint}' in the module directory, or specify a custom entry in model.yaml:\n  model:\n    entry: main.dlang`
            });
        }

        // Step 2: Try .dlang file fallback
        const fileWithExt = `${resolved}.dlang`;
        if (await this.fileExists(fileWithExt)) {
            return URI.file(fileWithExt);
        }

        // Neither directory nor file found
        throw new ImportResolutionError({
            specifier: original,
            attemptedPaths: [`${resolved}/index.dlang`, `${resolved}.dlang`],
            reason: 'file-not-found',
            hint: 'Check that the path is correct and the file exists.'
        });
    }

    /**
     * Reads the entry point from a module's model.yaml.
     * Defaults to index.dlang if no manifest or no entry specified.
     */
    private async readModuleEntry(manifestPath: string): Promise<string> {
        try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            const YAML = await import('yaml');
            const manifest = YAML.parse(content) as { model?: { entry?: string } };
            return manifest?.model?.entry ?? 'index.dlang';
        } catch {
            return 'index.dlang';
        }
    }

    /**
     * Checks if a path is a directory.
     */
    private async isDirectory(targetPath: string): Promise<boolean> {
        try {
            const stat = await fs.stat(targetPath);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * Checks if a file exists.
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the current lock file (if loaded).
     */
    async getLockFile(): Promise<LockFile | undefined> {
        return this.workspaceManager.getLockFile();
    }

    // --- PRS-017 R10: Import resolution tracing ---

    /**
        * Logs an import resolution trace message when `domainlang.lsp.traceImports` is enabled.
     * Output goes to stderr so it's visible in the LSP output channel.
     */
    private trace(message: string): void {
        if (getLspRuntimeSettings().traceImports) {
            console.warn(`[ImportResolver] ${message}`);
        }
    }
}

async function assertFileExists(filePath: string, original: string): Promise<void> {
    try {
        await fs.access(filePath);
    } catch {
        throw new ImportResolutionError({
            specifier: original,
            attemptedPaths: [filePath],
            reason: 'file-not-found',
            hint: 'Check that the file exists and the path is correct.'
        });
    }
}
