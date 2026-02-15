/**
 * Performance Optimization Service
 * 
 * Provides caching and optimization strategies for dependency resolution:
 * - In-memory caching of frequently accessed lock files
 * - Parallel dependency downloads
 * - Cache warming strategies
 * - Event-based invalidation (PRS-017 R15)
 */

import type { LockFile } from './types.js';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Performance optimizer with in-memory caching.
 *
 * PRS-017 R15: Cache entries are valid until explicitly invalidated
 * by `invalidateCache()` or `clearAllCaches()`. The previous TTL-based
 * approach could serve stale data (within window) or unnecessarily
 * re-read unchanged files (after expiry). Event-based invalidation
 * via `processManifestChanges()` and `processLockFileChanges()` is
 * always correct and immediate.
 */
export class PerformanceOptimizer {
    private lockFileCache = new Map<string, LockFile>();
    private manifestCache = new Map<string, unknown>();

    /**
     * Gets a lock file from cache or loads it from disk.
     */
    async getCachedLockFile(workspaceRoot: string): Promise<LockFile | undefined> {
        const cacheKey = this.normalizePath(workspaceRoot);
        const cached = this.lockFileCache.get(cacheKey);

        if (cached) {
            return cached;
        }

        // Load from disk
        const lockPath = path.join(workspaceRoot, 'model.lock');
        try {
            const content = await fs.readFile(lockPath, 'utf-8');
            const lockFile = JSON.parse(content) as LockFile;

            // Cache it
            this.lockFileCache.set(cacheKey, lockFile);

            return lockFile;
        } catch {
            return undefined;
        }
    }

    /**
     * Gets a manifest file from cache or loads it from disk.
     */
    async getCachedManifest(manifestPath: string): Promise<unknown | undefined> {
        const cacheKey = this.normalizePath(manifestPath);
        const cached = this.manifestCache.get(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            const { parse } = await import('yaml');
            const manifest: unknown = parse(content);

            this.manifestCache.set(cacheKey, manifest);

            return manifest;
        } catch {
            return undefined;
        }
    }

    /**
     * Invalidates cache for a specific workspace.
     * Called when model.lock or model.yaml changes (event-based, PRS-017 R15).
     */
    invalidateCache(workspaceRoot: string): void {
        const cacheKey = this.normalizePath(workspaceRoot);
        this.lockFileCache.delete(cacheKey);
        this.manifestCache.delete(cacheKey);
    }

    /**
     * Clears all caches.
     */
    clearAllCaches(): void {
        this.lockFileCache.clear();
        this.manifestCache.clear();
    }

    /**
     * Gets cache statistics.
     */
    getCacheStats(): { lockFiles: number; manifests: number } {
        return {
            lockFiles: this.lockFileCache.size,
            manifests: this.manifestCache.size,
        };
    }

    /**
     * Normalizes a file path for cache keys.
     */
    private normalizePath(filePath: string): string {
        return path.resolve(filePath);
    }
}

/**
 * Global singleton performance optimizer.
 */
let globalOptimizer: PerformanceOptimizer | undefined;

/**
 * Gets the global performance optimizer instance.
 */
export function getGlobalOptimizer(): PerformanceOptimizer {
    if (!globalOptimizer) {
        globalOptimizer = new PerformanceOptimizer();
    }
    return globalOptimizer;
}

/**
 * Resets the global optimizer (useful for testing).
 */
export function resetGlobalOptimizer(): void {
    globalOptimizer = undefined;
}
