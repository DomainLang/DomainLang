import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { getGlobalOptimizer } from './performance-optimizer.js';
import { fileExists as checkFileExists, findWorkspaceRoot as findWorkspaceRootUtil } from '../utils/manifest-utils.js';
import type { 
    LockFile, 
    LockedDependency, 
    ModelManifest, 
    DependencySpec, 
    ExtendedDependencySpec, 
    PathAliases,
    WorkspaceManagerOptions 
} from './types.js';

const DEFAULT_MANIFEST_FILES = [
    'model.yaml'
] as const;

const DEFAULT_LOCK_FILES = [
    'model.lock'
] as const;

interface ManifestCache {
    readonly manifest: ModelManifest;
    readonly path: string;
    /** SHA-256 content hash for reliable change detection (PRS-017 R5) */
    readonly contentHash: string;
}

interface LoadedLockFile {
    readonly lockFile: LockFile;
    readonly filePath: string;
}

/**
 * Cached context for a single workspace (directory containing model.yaml).
 * Each workspace root has its own independent state.
 */
interface WorkspaceContext {
    /** The resolved workspace root path */
    readonly root: string;
    /** Cached lock file for this workspace */
    lockFile: LockFile | undefined;
    /** Cached manifest for this workspace */
    manifestCache: ManifestCache | undefined;
    /** Initialization promise for this context */
    initPromise: Promise<void> | undefined;
}

/**
 * Coordinates workspace discovery and manifest/lock file reading.
 * 
 * **Multi-Root Support:**
 * Maintains separate contexts for each workspace root (directory with model.yaml).
 * This enables correct resolution in multi-project setups where sub-projects
 * have their own model.yaml files.
 * 
 * This is a read-only service for the LSP - it does NOT:
 * - Generate lock files (use CLI: `dlang install`)
 * - Download packages (use CLI: `dlang install`)
 * - Make network requests
 * 
 * The LSP uses this to:
 * - Find the workspace root (where model.yaml is)
 * - Read manifest configuration (path aliases, dependencies)
 * - Read lock file (to resolve cached package locations)
 */
export class ManifestManager {
    private readonly manifestFiles: readonly string[];
    private readonly lockFiles: readonly string[];
    
    /** 
     * Cache of workspace contexts by resolved workspace root path.
     * Supports multiple independent workspaces in a single session.
     */
    private readonly workspaceContexts = new Map<string, WorkspaceContext>();
    
    /**
     * Cache mapping start paths to their resolved workspace roots.
     * Avoids repeated directory tree walking for the same paths.
     */
    private readonly pathToRootCache = new Map<string, string>();

    /**
     * PRS-017 R11: Cached set of directories known to contain a manifest file.
     * Populated during `findWorkspaceRoot()` walks and updated incrementally
     * when manifest creation/deletion events arrive via `onManifestEvent()`.
     * Prevents redundant filesystem walks for paths already explored.
     */
    private readonly knownManifestDirs = new Set<string>();
    
    /**
     * The currently active workspace root (set by last initialize() call).
     * Used by methods like getWorkspaceRoot(), getManifest(), etc.
     */
    private activeRoot: string | undefined;

    constructor(options: WorkspaceManagerOptions = {}) {
        this.manifestFiles = options.manifestFiles ?? [...DEFAULT_MANIFEST_FILES];
        this.lockFiles = options.lockFiles ?? [...DEFAULT_LOCK_FILES];
    }

    /**
     * Returns the active workspace context, or undefined if not initialized.
     * All methods that need context should call this after ensureInitialized().
     */
    private getActiveContext(): WorkspaceContext | undefined {
        if (!this.activeRoot) return undefined;
        return this.workspaceContexts.get(this.activeRoot);
    }

    /**
     * Finds the workspace root and loads any existing lock file.
     * 
     * **Multi-Root Support:**
     * Each call may switch to a different workspace context based on the startPath.
     * The workspace root is the nearest ancestor directory containing model.yaml.
     * 
     * @param startPath - Directory to start searching from (usually document directory)
     */
    async initialize(startPath: string): Promise<void> {
        const normalizedStart = path.resolve(startPath);
        
        // Fast path: check if we've already resolved this path
        let workspaceRoot = this.pathToRootCache.get(normalizedStart);
        
        if (!workspaceRoot) {
            // Find workspace root by walking up directory tree
            workspaceRoot = await this.findWorkspaceRoot(normalizedStart) ?? normalizedStart;
            this.pathToRootCache.set(normalizedStart, workspaceRoot);
        }
        
        // Switch to this workspace's context
        this.activeRoot = workspaceRoot;
        
        // Get or create context for this workspace
        let context = this.workspaceContexts.get(workspaceRoot);
        if (!context) {
            context = {
                root: workspaceRoot,
                lockFile: undefined,
                manifestCache: undefined,
                initPromise: undefined
            };
            this.workspaceContexts.set(workspaceRoot, context);
        }
        
        // Initialize this context (lazy, once per context)
        context.initPromise ??= this.initializeContext(context);
        await context.initPromise;
    }
    
    /**
     * Initializes a workspace context by loading its lock file.
     */
    private async initializeContext(context: WorkspaceContext): Promise<void> {
        const loaded = await this.loadLockFileFromDisk(context.root);
        if (loaded) {
            context.lockFile = loaded.lockFile;
        }
    }

    /**
     * Returns the absolute path of the workspace root.
     * @throws Error if {@link initialize} has not completed successfully.
     */
    getWorkspaceRoot(): string {
        if (!this.activeRoot) {
            throw new Error('ManifestManager not initialized. Call initialize() first.');
        }
        return this.activeRoot;
    }

    /**
     * Returns the project-local package cache directory.
     * Per PRS-010: .dlang/packages/
     * 
     * If the current workspace root is inside a cached package,
     * walks up to find the actual project root's cache directory.
     */
    getCacheDir(): string {
        if (!this.activeRoot) {
            throw new Error('ManifestManager not initialized. Call initialize() first.');
        }
        
        // If workspace root is inside .dlang/packages, find the project root
        const projectRoot = this.findProjectRootFromCache(this.activeRoot);
        return path.join(projectRoot, '.dlang', 'packages');
    }
    
    /**
     * Finds the actual project root when inside a cached package.
     * 
     * Cached packages are stored in: <project>/.dlang/packages/<owner>/<repo>/<commit>/
     * If workspaceRoot is inside this structure, returns <project>
     * Otherwise returns workspaceRoot unchanged.
     */
    private findProjectRootFromCache(currentRoot: string): string {
        // Normalize path for cross-platform compatibility
        const normalized = currentRoot.split(path.sep);
        
        // Find last occurrence of .dlang in the path
        const dlangIndex = normalized.lastIndexOf('.dlang');
        
        // Check if we're inside .dlang/packages/...
        if (dlangIndex !== -1 && 
            dlangIndex + 1 < normalized.length && 
            normalized[dlangIndex + 1] === 'packages') {
            // Return the directory containing .dlang (the project root)
            return normalized.slice(0, dlangIndex).join(path.sep);
        }
        
        // Not in a cached package, return as-is
        return currentRoot;
    }

    /**
     * Resolves the manifest file path within the workspace, if present.
     */
    async getManifestPath(): Promise<string | undefined> {
        await this.ensureInitialized();
        const root = this.activeRoot;
        if (!root) {
            return undefined;
        }

        for (const manifest of this.manifestFiles) {
            const candidate = path.join(root, manifest);
            if (await checkFileExists(candidate)) {
                return candidate;
            }
        }

        return undefined;
    }

    /**
     * Returns the parsed manifest when present, otherwise undefined.
     * Uses cached contents when unchanged on disk.
     */
    async getManifest(): Promise<ModelManifest | undefined> {
        await this.ensureInitialized();
        return this.loadManifest();
    }

    /**
     * Returns the cached manifest synchronously (if available).
     * Used by LSP features that need synchronous access (like completion).
     * Returns undefined if manifest hasn't been loaded yet.
     */
    getCachedManifest(): ModelManifest | undefined {
        return this.getActiveContext()?.manifestCache?.manifest;
    }

    /**
     * Ensures the manifest is loaded and returns it.
     * Use this over getCachedManifest() when you need to guarantee the manifest
     * is available (e.g., in async LSP operations like completions).
     * 
     * @returns The manifest or undefined if no model.yaml exists
     */
    async ensureManifestLoaded(): Promise<ModelManifest | undefined> {
        // If we already have a cached manifest, return it immediately
        const context = this.getActiveContext();
        if (context?.manifestCache?.manifest) {
            return context.manifestCache.manifest;
        }
        // Otherwise load it (this also populates the cache)
        return this.getManifest();
    }

    /**
     * Gets the currently cached lock file.
     * Returns undefined if no lock file exists (run `dlang install` to create one).
     */
    async getLockFile(): Promise<LockFile | undefined> {
        await this.ensureInitialized();
        return this.getActiveContext()?.lockFile;
    }

    /**
     * Reloads the lock file from disk.
     */
    async refreshLockFile(): Promise<LockFile | undefined> {
        await this.ensureInitialized();
        const context = this.getActiveContext();
        const loaded = await this.loadLockFileFromDisk();
        if (context) {
            context.lockFile = loaded?.lockFile;
        }
        return loaded?.lockFile;
    }

    /**
     * Invalidates all cached data (manifest and lock file).
     * Call this when config files change externally (e.g., from CLI commands).
     * 
     * After invalidation, the next call to getManifest() or getLockFile()
     * will re-read from disk.
     */
    invalidateCache(): void {
        const context = this.getActiveContext();
        if (context) {
            context.manifestCache = undefined;
            context.lockFile = undefined;
        }
    }

    /**
     * Invalidates only the manifest cache.
     * Call this when model.yaml changes.
     */
    invalidateManifestCache(): void {
        const context = this.getActiveContext();
        if (context) {
            context.manifestCache = undefined;
        }
    }

    /**
     * Invalidates only the lock file cache.
     * Call this when model.lock changes.
     */
    invalidateLockCache(): void {
        const context = this.getActiveContext();
        if (context) {
            context.lockFile = undefined;
        }
    }

    /**
     * PRS-017 R11: Incrementally updates the workspace layout cache
     * when a manifest file is created or deleted.
     *
     * @param manifestDir - Directory where the manifest was created/deleted
     * @param created - true if manifest was created, false if deleted
     */
    onManifestEvent(manifestDir: string, created: boolean): void {
        const normalized = path.resolve(manifestDir);
        if (created) {
            this.knownManifestDirs.add(normalized);
        } else {
            this.knownManifestDirs.delete(normalized);
            // Invalidate path-to-root cache entries that pointed to this dir
            for (const [startPath, root] of this.pathToRootCache) {
                if (root === normalized) {
                    this.pathToRootCache.delete(startPath);
                }
            }
        }
    }

    /**
     * Returns the path aliases from the manifest, if present.
     */
    async getPathAliases(): Promise<PathAliases | undefined> {
        const manifest = await this.getManifest();
        return manifest?.paths;
    }

    /**
     * Normalizes a dependency entry to its extended form.
     * Handles both short form (string version) and extended form (object).
     * 
     * In the new format, the key IS the owner/package, so source is derived from key
     * ONLY for git dependencies (not for path-based local dependencies).
     */
    normalizeDependency(key: string, dep: DependencySpec): ExtendedDependencySpec {
        if (typeof dep === 'string') {
            // Short form: "owner/package": "v1.0.0" or "main"
            // Key is the source (owner/package format)
            return { source: key, ref: dep };
        }
        // Extended form:
        // - If has source: use as-is
        // - If has path: it's a local dep, don't set source
        // - If neither: derive source from key (owner/package becomes source)
        if (dep.source || dep.path) {
            return dep;
        }
        return { ...dep, source: key };
    }

    /**
     * Resolves a dependency import specifier to its cached package path.
     * 
     * @param specifier - Import specifier (owner/package format, may include subpaths)
     * @returns Path to the cached package entry point, or undefined if not found
     */
    async resolveDependencyPath(specifier: string): Promise<string | undefined> {
        await this.ensureInitialized();
        
        const context = this.getActiveContext();
        if (!context?.lockFile) {
            return undefined;
        }

        const manifest = await this.loadManifest();
        const dependencies = manifest?.dependencies;

        if (!dependencies) {
            return undefined;
        }

        // Find matching dependency
        for (const [key, dep] of Object.entries(dependencies)) {
            const normalized = this.normalizeDependency(key, dep);
            
            // Skip path-based dependencies (handled by path aliases)
            if (normalized.path) {
                continue;
            }

            if (!normalized.source) {
                continue;
            }

            // Match if specifier equals key or starts with key/
            if (specifier === key || specifier.startsWith(`${key}/`)) {
                // Find in lock file
                const locked = context.lockFile.dependencies[normalized.source];
                if (!locked) {
                    return undefined;
                }

                // Compute cache path
                const [owner, repo] = normalized.source.split('/');
                const packageDir = path.join(this.getCacheDir(), owner, repo, locked.commit);

                // Handle subpaths
                const suffix = specifier.slice(key.length);
                if (suffix) {
                    // Import with subpath: owner/package/subpath
                    return path.join(packageDir, suffix);
                }

                // Read entry point from package's model.yaml
                const entryPoint = await this.readPackageEntry(packageDir);
                return path.join(packageDir, entryPoint);
            }
        }

        return undefined;
    }

    /**
     * Reads the entry point from a cached package's model.yaml.
     */
    private async readPackageEntry(packageDir: string): Promise<string> {
        const manifestPath = path.join(packageDir, 'model.yaml');
        try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            const manifest = YAML.parse(content) as { model?: { entry?: string } };
            return manifest?.model?.entry ?? 'index.dlang';
        } catch {
            return 'index.dlang';
        }
    }

    private async ensureInitialized(): Promise<void> {
        // Check if we have an active workspace context
        if (this.activeRoot) {
            const context = this.workspaceContexts.get(this.activeRoot);
            if (context?.initPromise) {
                await context.initPromise;
                return;
            }
        }
        
        throw new Error('ManifestManager not initialized. Call initialize() first.');
    }

    private async loadLockFileFromDisk(root?: string): Promise<LoadedLockFile | undefined> {
        const workspaceRoot = root ?? this.activeRoot;
        if (!workspaceRoot) {
            return undefined;
        }

        // Try performance optimizer cache first
        const optimizer = getGlobalOptimizer();
        const cached = await optimizer.getCachedLockFile(workspaceRoot);
        if (cached) {
            return { lockFile: cached, filePath: path.join(workspaceRoot, 'model.lock') };
        }

        for (const filename of this.lockFiles) {
            const filePath = path.join(workspaceRoot, filename);
            const lockFile = await this.tryReadLockFile(filePath);
            if (lockFile) {
                return { lockFile, filePath };
            }
        }

        return undefined;
    }

    private async tryReadLockFile(filePath: string): Promise<LockFile | undefined> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return this.parseJsonLockFile(content);
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
    }

    private async loadManifest(): Promise<ModelManifest | undefined> {
        const context = this.getActiveContext();
        const manifestPath = await this.getManifestPath();
        if (!manifestPath) {
            this.clearManifestCache(context);
            return undefined;
        }

        try {
            return await this.readAndCacheManifest(manifestPath, context);
        } catch (error) {
            return this.handleManifestError(error, manifestPath, context);
        }
    }

    /**
     * Reads, validates, and caches a manifest file.
     */
    private async readAndCacheManifest(
        manifestPath: string, 
        context: WorkspaceContext | undefined
    ): Promise<ModelManifest> {
        // PRS-017 R5: Use content hash instead of mtime for reliable change detection.
        // Content hashing is immune to mtime skew after git operations or on NFS.
        const content = await fs.readFile(manifestPath, 'utf-8');
        const contentHash = this.computeHash(content);

        if (context?.manifestCache?.path === manifestPath &&
            context.manifestCache.contentHash === contentHash) {
            return context.manifestCache.manifest;
        }

        const manifest = (YAML.parse(content) ?? {}) as ModelManifest;
        
        // Validate manifest structure
        this.validateManifest(manifest, manifestPath);
        
        if (context) {
            context.manifestCache = {
                manifest,
                path: manifestPath,
                contentHash,
            };
        }
        return manifest;
    }

    /**
     * Handles errors from manifest loading, distinguishing recoverable
     * errors (missing file, parse errors) from unexpected ones.
     */
    private handleManifestError(
        error: unknown,
        manifestPath: string,
        context: WorkspaceContext | undefined
    ): ModelManifest | undefined {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            this.clearManifestCache(context);
            return undefined;
        }
        // YAML parse errors should not crash the LSP
        if (error instanceof Error && 
            (error.name === 'YAMLParseError' || error.name === 'YAMLSyntaxError')) {
            console.error(`Invalid model.yaml at ${manifestPath}: ${error.message}`);
            this.clearManifestCache(context);
            return undefined;
        }
        // Validation errors from validateManifest should not crash the LSP
        if (error instanceof Error) {
            console.error(`Manifest validation error at ${manifestPath}: ${error.message}`);
            this.clearManifestCache(context);
            return undefined;
        }
        throw error;
    }

    /**
     * Clears the manifest cache on the given context, if available.
     */
    private clearManifestCache(context: WorkspaceContext | undefined): void {
        if (context) {
            context.manifestCache = undefined;
        }
    }

    /**
     * Validates manifest structure and dependency configurations.
     * Throws detailed errors for invalid manifests.
     * 
     * Supports both new format (owner/package: version) and extended format.
     */
    private validateManifest(manifest: ModelManifest, manifestPath: string): void {
        // Validate path aliases
        if (manifest.paths) {
            this.validatePathAliases(manifest.paths, manifestPath);
        }

        if (!manifest.dependencies) {
            return; // No dependencies to validate
        }

        for (const [key, dep] of Object.entries(manifest.dependencies)) {
            const normalized = this.normalizeDependency(key, dep);

            // Validate mutually exclusive source and path
            if (normalized.source && normalized.path) {
                throw new Error(
                    `Invalid dependency '${key}' in ${manifestPath}:\n` +
                    `Cannot specify both 'source' and 'path'.\n` +
                    `Hint: Use 'source' for git dependencies or 'path' for local workspace dependencies.`
                );
            }

            // For string format, source is always derived from key (valid)
            // For extended format without source or path, error
            if (typeof dep !== 'string' && !normalized.source && !normalized.path) {
                throw new Error(
                    `Invalid dependency '${key}' in ${manifestPath}:\n` +
                    `Must specify either 'source' or 'path'.\n` +
                    `Hint: Add 'source: owner/repo' for git dependencies, or 'path: ./local/path' for local packages.`
                );
            }

            // Validate path is relative and within workspace
            if (normalized.path) {
                this.validateLocalPath(normalized.path, key, manifestPath);
            }

            // Validate source has ref when specified
            if (normalized.source && !normalized.ref) {
                throw new Error(
                    `Invalid dependency '${key}' in ${manifestPath}:\n` +
                    `Git dependencies must specify a 'ref' (git reference).\n` +
                    `Hint: Add 'ref: v1.0.0' (tag), 'ref: main' (branch), or a commit SHA.`
                );
            }
        }
    }

    /**
     * Validates path aliases for security and correctness.
     */
    private validatePathAliases(paths: PathAliases, manifestPath: string): void {
        for (const [alias, targetPath] of Object.entries(paths)) {
            // Validate alias starts with @
            if (!alias.startsWith('@')) {
                throw new Error(
                    `Invalid path alias '${alias}' in ${manifestPath}:\n` +
                    `Path aliases must start with '@'.\n` +
                    `Hint: Rename to '@${alias}' in your model.yaml paths section.`
                );
            }

            // Validate target path doesn't escape workspace
            this.validateLocalPath(targetPath, alias, manifestPath);
        }
    }

    /**
     * Validates local path dependencies for security.
     * Ensures paths don't escape workspace boundary.
     */
    private validateLocalPath(localPath: string, alias: string, manifestPath: string): void {
        // Reject absolute paths
        if (path.isAbsolute(localPath)) {
            throw new Error(
                `Invalid local path '${alias}' in ${manifestPath}:\n` +
                `Cannot use absolute path '${localPath}'.\n` +
                `Hint: Use relative paths (e.g., './lib', '../shared') for local dependencies.`
            );
        }

        // Resolve path relative to manifest directory
        const manifestDir = path.dirname(manifestPath);
        const resolvedPath = path.resolve(manifestDir, localPath);
        const workspaceRoot = this.activeRoot || manifestDir;

        // Check if resolved path is within workspace
        const relativePath = path.relative(workspaceRoot, resolvedPath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            throw new Error(
                `Invalid local path '${alias}' in ${manifestPath}:\n` +
                `Path '${localPath}' resolves outside workspace boundary.\n` +
                `Resolved: ${resolvedPath}\n` +
                `Workspace: ${workspaceRoot}\n` +
                `Hint: Local dependencies must be within the workspace. Consider moving the dependency or using a git-based source.`
            );
        }
    }

    private parseJsonLockFile(content: string): LockFile {
        const parsed = JSON.parse(content) as Partial<LockFile> & {
            dependencies?: Record<string, Partial<LockedDependency>>;
        };

        const version = typeof parsed.version === 'string' ? parsed.version : '1';
        const dependencies: Record<string, LockedDependency> = {};

        for (const [key, value] of Object.entries(parsed.dependencies ?? {})) {
            if (!value || typeof value.ref !== 'string' || typeof value.resolved !== 'string' || typeof value.commit !== 'string') {
                continue;
            }
            dependencies[key] = {
                ref: value.ref,
                refType: value.refType ?? 'commit', // Default to commit for backwards compatibility
                resolved: value.resolved,
                commit: value.commit,
                integrity: value.integrity,
            };
        }

        return { version, dependencies };
    }

    /**
     * Finds workspace root by walking up from startPath looking for model.yaml.
     * Uses configurable manifest files if specified in constructor options.
     * PRS-017 R11: Consults `knownManifestDirs` before hitting the filesystem.
     */
    private async findWorkspaceRoot(startPath: string): Promise<string | undefined> {
        // Use shared utility for default case (single manifest file)
        if (this.manifestFiles.length === 1 && this.manifestFiles[0] === 'model.yaml') {
            const result = await findWorkspaceRootUtil(startPath);
            if (result) this.knownManifestDirs.add(result);
            return result;
        }

        // Custom logic for multiple or non-default manifest files
        let current = path.resolve(startPath);
        const { root } = path.parse(current);

        while (true) {
            // R11: Check cached knowledge first
            if (this.knownManifestDirs.has(current)) {
                return current;
            }

            if (await this.containsManifest(current)) {
                this.knownManifestDirs.add(current);
                return current;
            }

            if (current === root) {
                return undefined;
            }

            const parent = path.dirname(current);
            if (parent === current) {
                return undefined;
            }

            current = parent;
        }
    }

    private async containsManifest(dir: string): Promise<boolean> {
        for (const manifest of this.manifestFiles) {
            if (await checkFileExists(path.join(dir, manifest))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Computes a SHA-256 hex digest of the given content.
     * Used for content-hash based cache validation (PRS-017 R5).
     */
    private computeHash(content: string): string {
        return createHash('sha256').update(content).digest('hex');
    }
}
