import path from 'node:path';
import fs from 'node:fs/promises';
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
    readonly mtimeMs: number;
}

interface LoadedLockFile {
    readonly lockFile: LockFile;
    readonly filePath: string;
}

/**
 * Coordinates workspace discovery and manifest/lock file reading.
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
export class WorkspaceManager {
    private readonly manifestFiles: readonly string[];
    private readonly lockFiles: readonly string[];
    private workspaceRoot: string | undefined;
    private lockFile: LockFile | undefined;
    private initializePromise: Promise<void> | undefined;
    private manifestCache: ManifestCache | undefined;

    constructor(options: WorkspaceManagerOptions = {}) {
        this.manifestFiles = options.manifestFiles ?? [...DEFAULT_MANIFEST_FILES];
        this.lockFiles = options.lockFiles ?? [...DEFAULT_LOCK_FILES];
    }

    /**
     * Finds the workspace root and loads any existing lock file.
     * Repeated calls await the same initialization work.
     */
    async initialize(startPath: string): Promise<void> {
        this.initializePromise ??= this.performInitialization(startPath);
        await this.initializePromise;
    }

    /**
     * Returns the absolute path of the workspace root.
     * @throws Error if {@link initialize} has not completed successfully.
     */
    getWorkspaceRoot(): string {
        if (!this.workspaceRoot) {
            throw new Error('WorkspaceManager not initialized. Call initialize() first.');
        }
        return this.workspaceRoot;
    }

    /**
     * Returns the project-local package cache directory.
     * Per PRS-010: .dlang/packages/
     */
    getCacheDir(): string {
        if (!this.workspaceRoot) {
            throw new Error('WorkspaceManager not initialized. Call initialize() first.');
        }
        return path.join(this.workspaceRoot, '.dlang', 'packages');
    }

    /**
     * Resolves the manifest file path within the workspace, if present.
     */
    async getManifestPath(): Promise<string | undefined> {
        await this.ensureInitialized();
        const root = this.workspaceRoot;
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
     * Gets the currently cached lock file.
     * Returns undefined if no lock file exists (run `dlang install` to create one).
     */
    async getLockFile(): Promise<LockFile | undefined> {
        await this.ensureInitialized();
        return this.lockFile;
    }

    /**
     * Reloads the lock file from disk.
     */
    async refreshLockFile(): Promise<LockFile | undefined> {
        await this.ensureInitialized();
        const loaded = await this.loadLockFileFromDisk();
        if (loaded) {
            this.lockFile = loaded.lockFile;
        } else {
            this.lockFile = undefined;
        }
        return this.lockFile;
    }

    /**
     * Invalidates all cached data (manifest and lock file).
     * Call this when config files change externally (e.g., from CLI commands).
     * 
     * After invalidation, the next call to getManifest() or getLockFile()
     * will re-read from disk.
     */
    invalidateCache(): void {
        this.manifestCache = undefined;
        this.lockFile = undefined;
    }

    /**
     * Invalidates only the manifest cache.
     * Call this when model.yaml changes.
     */
    invalidateManifestCache(): void {
        this.manifestCache = undefined;
    }

    /**
     * Invalidates only the lock file cache.
     * Call this when model.lock changes.
     */
    invalidateLockCache(): void {
        this.lockFile = undefined;
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
        
        if (!this.lockFile) {
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
                const locked = this.lockFile.dependencies[normalized.source];
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

    private async performInitialization(startPath: string): Promise<void> {
        this.workspaceRoot = await this.findWorkspaceRoot(startPath) ?? path.resolve(startPath);
        const loaded = await this.loadLockFileFromDisk();
        if (loaded) {
            this.lockFile = loaded.lockFile;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (this.initializePromise) {
            await this.initializePromise;
        } else if (!this.workspaceRoot) {
            throw new Error('WorkspaceManager not initialized. Call initialize() first.');
        }
    }

    private async loadLockFileFromDisk(): Promise<LoadedLockFile | undefined> {
        if (!this.workspaceRoot) {
            return undefined;
        }

        // Try performance optimizer cache first
        const optimizer = getGlobalOptimizer();
        const cached = await optimizer.getCachedLockFile(this.workspaceRoot);
        if (cached) {
            return { lockFile: cached, filePath: path.join(this.workspaceRoot, 'model.lock') };
        }

        for (const filename of this.lockFiles) {
            const filePath = path.join(this.workspaceRoot, filename);
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
        const manifestPath = await this.getManifestPath();
        if (!manifestPath) {
            this.manifestCache = undefined;
            return undefined;
        }

        try {
            const stat = await fs.stat(manifestPath);
            if (this.manifestCache?.path === manifestPath &&
                this.manifestCache.mtimeMs === stat.mtimeMs) {
                return this.manifestCache.manifest;
            }

            const content = await fs.readFile(manifestPath, 'utf-8');
            const manifest = (YAML.parse(content) ?? {}) as ModelManifest;
            
            // Validate manifest structure
            this.validateManifest(manifest, manifestPath);
            
            this.manifestCache = {
                manifest,
                path: manifestPath,
                mtimeMs: stat.mtimeMs,
            };
            return manifest;
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                this.manifestCache = undefined;
                return undefined;
            }
            throw error;
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
        const workspaceRoot = this.workspaceRoot || manifestDir;

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
     */
    private async findWorkspaceRoot(startPath: string): Promise<string | undefined> {
        // Use shared utility for default case (single manifest file)
        if (this.manifestFiles.length === 1 && this.manifestFiles[0] === 'model.yaml') {
            return findWorkspaceRootUtil(startPath);
        }

        // Custom logic for multiple or non-default manifest files
        let current = path.resolve(startPath);
        const { root } = path.parse(current);

        while (true) {
            if (await this.containsManifest(current)) {
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
}
