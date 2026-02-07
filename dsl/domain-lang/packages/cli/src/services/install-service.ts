/**
 * Package Installation Service
 * 
 * Handles dependency installation with integrity verification, frozen mode,
 * and force mode support as specified in PRS-012.
 * 
 * Features:
 * - Integrity verification using SHA-512 hashes
 * - --frozen mode for CI (prevents lock file modification)
 * - --force mode for re-resolution (bypasses cache)
 * - Lock file upgrade (adds integrity to legacy lock files)
 * - Clear error messages with actionable hints
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ModelManifest, LockFile, LockedDependency } from '@domainlang/language';
import { PackageDownloader } from './package-downloader.js';
import { PackageCache } from './package-cache.js';
import { CredentialProvider } from './credential-provider.js';

/**
 * Installation options.
 */
export interface InstallOptions {
    /** Frozen mode: prevent lock file modification, fail on mismatch */
    frozen?: boolean;
    /** Force mode: re-resolve all dependencies, bypass cache */
    force?: boolean;
    /** Workspace root directory */
    workspaceRoot: string;
    /** Pre-parsed manifest to skip re-reading model.yaml */
    manifest?: ModelManifest;
    /** Progress callback for UI updates */
    onProgress?: (event: InstallProgressEvent) => void;
    /** Maximum concurrent downloads (default: 4) */
    concurrency?: number;
}

/**
 * Progress event during installation.
 */
export type InstallProgressEvent =
    | { type: 'start'; total: number; packages: string[] }
    | { type: 'package-start'; pkg: string; status: 'resolving' | 'downloading' | 'verifying' }
    | { type: 'package-progress'; pkg: string; bytesReceived: number; totalBytes?: number }
    | { type: 'package-complete'; pkg: string; cached: boolean }
    | { type: 'package-error'; pkg: string; error: string }
    | { type: 'complete'; installed: number; cached: number };

/**
 * Installation result.
 */
export interface InstallResult {
    /** Number of packages installed */
    installed: number;
    /** Number of packages from cache */
    cached: number;
    /** Whether lock file was modified */
    lockFileModified: boolean;
    /** Warning messages */
    warnings: string[];
    /** Lock file dependency data (avoids callers re-reading model.lock) */
    lockData?: Record<string, LockedDependency>;
}

/**
 * Dependency mismatch error for frozen mode.
 */
export class FrozenMismatchError extends Error {
    constructor(
        public readonly added: string[],
        public readonly removed: string[],
        public readonly changed: Array<{ pkg: string; manifestRef: string; lockRef: string }>
    ) {
        super('Lock file is out of sync with model.yaml (--frozen mode)');
        this.name = 'FrozenMismatchError';
    }
}

/**
 * Integrity verification error.
 */
export class IntegrityError extends Error {
    constructor(
        public readonly pkg: string,
        public readonly expected: string,
        public readonly actual: string
    ) {
        super(`Integrity check failed for '${pkg}'`);
        this.name = 'IntegrityError';
    }
}

/**
 * Service for installing packages with integrity verification.
 */
export class InstallService {
    private readonly workspaceRoot: string;
    private readonly packageCache: PackageCache;
    private readonly downloader: PackageDownloader;
    private readonly credentialProvider: CredentialProvider;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.packageCache = new PackageCache(workspaceRoot);
        this.credentialProvider = new CredentialProvider();
        this.downloader = new PackageDownloader(
            this.credentialProvider,
            this.packageCache,
            (event) => this.handleDownloadEvent(event)
        );
    }

    /**
     * Install dependencies according to model.yaml and model.lock.
     * 
     * @param options - Installation options
     * @returns Installation result
     * @throws {FrozenMismatchError} If --frozen and lock file doesn't match manifest
     * @throws {IntegrityError} If integrity verification fails
     * @throws {Error} If --frozen and --force are both specified
     */
    async install(options: InstallOptions): Promise<InstallResult> {
        this.validateOptions(options);

        const { frozen = false, force = false } = options;
        const isFrozen = frozen || process.env['DLANG_FROZEN'] === '1';

        // Load manifest (use pre-parsed if provided) and lock file
        const manifest = options.manifest ?? await this.loadManifest();
        const { lock, lockExists } = await this.loadLockFile();

        // Validate manifest has dependencies
        if (!manifest.dependencies || Object.keys(manifest.dependencies).length === 0) {
            console.log('No dependencies declared in model.yaml');
            return { installed: 0, cached: 0, lockFileModified: false, warnings: [] };
        }

        // Frozen mode validation
        if (isFrozen) {
            this.validateFrozenMode(manifest, lock);
        }

        // Force mode: clear cache
        if (force) {
            console.log('Force mode: clearing cache and re-resolving all dependencies...');
            await this.packageCache.clear();
        }

        // Install dependencies (parallel with progress callback)
        const result = await this.installDependencies(manifest, lock, force, options.onProgress, options.concurrency);

        // Write updated lock file
        if (!isFrozen) {
            await this.writeLockFile(result.dependencies);
            result.lockFileModified = !lockExists || JSON.stringify(lock?.dependencies) !== JSON.stringify(result.dependencies);
        }

        return {
            installed: result.installed,
            cached: result.cached,
            lockFileModified: result.lockFileModified,
            warnings: result.warnings,
            lockData: result.dependencies,
        };
    }

    /**
     * Validate installation options.
     */
    private validateOptions(options: InstallOptions): void {
        if (options.frozen && options.force) {
            throw new Error('Cannot use --frozen and --force together (mutually exclusive)');
        }
    }

    /**
     * Load and parse model.yaml manifest.
     */
    private async loadManifest(): Promise<ModelManifest> {
        const manifestPath = path.join(this.workspaceRoot, 'model.yaml');
        if (!existsSync(manifestPath)) {
            throw new Error('No model.yaml found in workspace');
        }

        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        return YAML.parse(manifestContent) as ModelManifest;
    }

    /**
     * Load model.lock if it exists.
     */
    private async loadLockFile(): Promise<{ lock: LockFile | undefined; lockExists: boolean }> {
        const lockPath = path.join(this.workspaceRoot, 'model.lock');
        
        if (!existsSync(lockPath)) {
            return { lock: undefined, lockExists: false };
        }

        const lockContent = await fs.readFile(lockPath, 'utf-8');
        return {
            lock: JSON.parse(lockContent) as LockFile,
            lockExists: true,
        };
    }

    /**
     * Validate frozen mode requirements.
     */
    private validateFrozenMode(manifest: ModelManifest, lock: LockFile | undefined): void {
        if (!lock) {
            throw new Error(
                'Lock file does not exist (--frozen mode)\n' +
                'Run `dlang install` without --frozen to create the lock file.'
            );
        }

        const mismatches = this.detectLockMismatches(manifest, lock);
        if (mismatches.added.length > 0 || mismatches.removed.length > 0 || mismatches.changed.length > 0) {
            throw new FrozenMismatchError(mismatches.added, mismatches.removed, mismatches.changed);
        }
    }

    /**
     * Install all dependencies from manifest.
     * Downloads are performed in parallel with configurable concurrency.
     */
    private async installDependencies(
        manifest: ModelManifest,
        lock: LockFile | undefined,
        force: boolean,
        onProgress?: (event: InstallProgressEvent) => void,
        concurrency = 4
    ): Promise<{
        dependencies: Record<string, LockedDependency>;
        installed: number;
        cached: number;
        lockFileModified: boolean;
        warnings: string[];
    }> {
        const warnings: string[] = [];

        // Manifest dependencies should exist at this point (validated in install method)
        const dependencies = manifest.dependencies || {};
        const depEntries = Object.entries(dependencies);

        // Emit start event
        const packageNames = depEntries.map(([alias, depSpec]) => {
            const source = typeof depSpec === 'string' ? alias : ((depSpec as { source?: string }).source || alias);
            return source;
        });
        onProgress?.({ type: 'start', total: depEntries.length, packages: packageNames });

        // Prepare download tasks
        const tasks = depEntries.map(([alias, depSpec]) => ({
            alias,
            depSpec,
            ...this.parseDependencySpec(alias, depSpec),
            locked: lock?.dependencies[typeof depSpec === 'string' ? alias : ((depSpec as { source?: string }).source || alias)],
        }));

        // Process in parallel with concurrency limit using a task queue
        type TaskResult = { source: string; dep: LockedDependency; wasCached: boolean; warning?: string };
        const results: TaskResult[] = [];
        let taskIndex = 0;

        const processNext = async (): Promise<void> => {
            while (taskIndex < tasks.length) {
                const currentIndex = taskIndex++;
                const task = tasks[currentIndex];
                if (!task) break;

                const result = await this.processSingleTask(task, force, onProgress);
                results[currentIndex] = result;
            }
        };

        // Run workers in parallel
        const workerCount = Math.min(concurrency, tasks.length);
        await Promise.all(Array.from({ length: workerCount }, () => processNext()));

        // Aggregate results
        let installed = 0;
        let cached = 0;
        const updatedDeps: Record<string, LockedDependency> = {};

        for (const result of results) {
            if (result) {
                updatedDeps[result.source] = result.dep;
                if (result.wasCached) cached++;
                else installed++;
                if (result.warning) warnings.push(result.warning);
            }
        }

        onProgress?.({ type: 'complete', installed, cached });

        return {
            dependencies: updatedDeps,
            installed,
            cached,
            lockFileModified: false,
            warnings,
        };
    }

    /**
     * Process a single dependency task (verify cached or download).
     */
    private async processSingleTask(
        task: { ref: string; source: string; owner: string; repo: string; locked?: LockedDependency },
        force: boolean,
        onProgress?: (event: InstallProgressEvent) => void
    ): Promise<{ source: string; dep: LockedDependency; wasCached: boolean; warning?: string }> {
        const { ref, source, owner, repo, locked } = task;

        try {
            if (locked && !force) {
                return await this.verifyCachedDependency(source, owner, repo, locked, onProgress);
            }
            return await this.downloadDependency(source, owner, repo, ref, onProgress);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            onProgress?.({ type: 'package-error', pkg: source, error: errorMsg });
            throw error;
        }
    }

    /**
     * Verify a cached dependency with integrity check.
     */
    private async verifyCachedDependency(
        source: string,
        owner: string,
        repo: string,
        locked: LockedDependency,
        onProgress?: (event: InstallProgressEvent) => void
    ): Promise<{ source: string; dep: LockedDependency; wasCached: boolean; warning?: string }> {
        onProgress?.({ type: 'package-start', pkg: source, status: 'verifying' });

        let warning: string | undefined;
        if (locked.integrity) {
            await this.verifyIntegrity(owner, repo, locked);
        } else {
            warning = `Dependency '${source}' has no integrity hash (legacy lock file)`;
        }

        onProgress?.({ type: 'package-complete', pkg: source, cached: true });
        return { source, dep: locked, wasCached: true, warning };
    }

    /**
     * Download a dependency and create lock entry.
     */
    private async downloadDependency(
        source: string,
        owner: string,
        repo: string,
        ref: string,
        onProgress?: (event: InstallProgressEvent) => void
    ): Promise<{ source: string; dep: LockedDependency; wasCached: boolean }> {
        onProgress?.({ type: 'package-start', pkg: source, status: 'resolving' });

        const downloadResult = await this.downloader.download(owner, repo, ref);
        const refType = this.detectRefType(ref);

        onProgress?.({ type: 'package-complete', pkg: source, cached: false });
        return {
            source,
            dep: {
                ref,
                refType,
                resolved: downloadResult.resolved,
                commit: downloadResult.commitSha,
                integrity: downloadResult.integrity,
            },
            wasCached: false,
        };
    }

    /**
     * Parse and validate a dependency spec.
     */
    private parseDependencySpec(
        alias: string,
        depSpec: string | { ref?: string; source?: string }
    ): { ref: string; source: string; owner: string; repo: string } {
        const ref = typeof depSpec === 'string' ? depSpec : depSpec.ref;
        const source = typeof depSpec === 'string' ? alias : (depSpec.source || alias);

        if (!ref) {
            throw new Error(`Missing ref for dependency '${alias}'`);
        }

        const [owner, repo] = source.split('/');
        if (!owner || !repo) {
            throw new Error(`Invalid dependency source format: ${source}. Expected 'owner/repo'.`);
        }

        return { ref, source, owner, repo };
    }

    /**
     * Write updated lock file to disk.
     */
    private async writeLockFile(dependencies: Record<string, LockedDependency>): Promise<void> {
        const lockPath = path.join(this.workspaceRoot, 'model.lock');
        const lock: LockFile = {
            version: '1',
            dependencies,
        };

        await fs.writeFile(lockPath, JSON.stringify(lock, null, 2), 'utf-8');
    }

    /**
     * Verify integrity of a locked dependency.
     * 
     * @param owner - Package owner
     * @param repo - Repository name
     * @param locked - Locked dependency with integrity hash
     * @throws {IntegrityError} If integrity verification fails
     */
    private async verifyIntegrity(owner: string, repo: string, locked: LockedDependency): Promise<void> {
        if (!locked.integrity) {
            return; // No integrity to verify (legacy lock file)
        }

        // Get cached metadata
        const metadata = await this.packageCache.getMetadata(owner, repo, locked.commit);

        if (!metadata) {
            // Package not cached or metadata missing - will download and verify
            console.log(`Package ${owner}/${repo}@${locked.commit} not in cache, downloading...`);
            const downloadResult = await this.downloader.download(owner, repo, locked.ref);

            // Verify integrity matches
            if (downloadResult.integrity !== locked.integrity) {
                throw new IntegrityError(`${owner}/${repo}`, locked.integrity, downloadResult.integrity);
            }

            return;
        }

        // Verify cached integrity matches lock file
        if (metadata.integrity !== locked.integrity) {
            throw new IntegrityError(`${owner}/${repo}`, locked.integrity, metadata.integrity);
        }
    }

    /**
     * Detect mismatches between manifest and lock file.
     * 
     * @param manifest - Package manifest
     * @param lock - Lock file
     * @returns Lists of added, removed, and changed dependencies
     */
    private detectLockMismatches(
        manifest: ModelManifest,
        lock: LockFile
    ): { added: string[]; removed: string[]; changed: Array<{ pkg: string; manifestRef: string; lockRef: string }> } {
        const added: string[] = [];
        const removed: string[] = [];
        const changed: Array<{ pkg: string; manifestRef: string; lockRef: string }> = [];

        const manifestDeps = manifest.dependencies || {};
        const lockDeps = lock.dependencies || {};

        // Check for added and changed dependencies
        for (const [alias, depSpec] of Object.entries(manifestDeps)) {
            const ref = typeof depSpec === 'string' ? depSpec : depSpec.ref;
            const source = typeof depSpec === 'string' ? alias : (depSpec.source || alias);

            if (!ref) {
                // Skip invalid entries (validation will catch this during install)
                continue;
            }

            if (!lockDeps[source]) {
                added.push(`${source}@${ref}`);
            } else if (lockDeps[source].ref !== ref) {
                changed.push({
                    pkg: source,
                    manifestRef: ref,
                    lockRef: lockDeps[source].ref,
                });
            }
        }

        // Check for removed dependencies
        for (const source of Object.keys(lockDeps)) {
            const isInManifest = Object.entries(manifestDeps).some(([alias, depSpec]) => {
                const depSource = typeof depSpec === 'string' ? alias : (depSpec.source || alias);
                return depSource === source;
            });

            if (!isInManifest) {
                removed.push(source);
            }
        }

        return { added, removed, changed };
    }

    /**
     * Detect ref type from ref string.
     */
    private detectRefType(ref: string): 'tag' | 'branch' | 'commit' {
        // If ref is a commit SHA (40 hex chars), it's a commit
        if (/^[0-9a-f]{40}$/i.test(ref)) {
            return 'commit';
        }

        // If ref matches SemVer pattern, it's likely a tag
        if (/^v?\d+\.\d+\.\d+/.test(ref)) {
            return 'tag';
        }

        // Otherwise, assume it's a branch
        return 'branch';
    }

    /**
     * Handle download events for progress reporting.
     */
    private handleDownloadEvent(
        event: { type: string; pkg?: string; bytesReceived?: number; totalBytes?: number }
    ): void {
        // For now, just log to console
        // In the future, we could emit these for UI progress bars
        if (event.type === 'downloading') {
            const { pkg, bytesReceived, totalBytes } = event;
            if (totalBytes && bytesReceived !== undefined) {
                const percent = Math.round((bytesReceived / totalBytes) * 100);
                process.stdout.write(`\r  Downloading ${pkg}: ${percent}%`);
            }
        } else if (event.type === 'complete') {
            process.stdout.write('\r'); // Clear progress line
        }
    }
}
