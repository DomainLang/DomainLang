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
import { parse as parseYaml } from 'yaml';

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
    private readonly lockFileCache = new Map<string, LockFile>();
    private readonly manifestCache = new Map<string, unknown>();

    /**
     * Gets a lock file from cache or loads it from disk.
     */
    async getCachedLockFile(workspaceRoot: string): Promise<LockFile | undefined> {
        const cacheKey = this.normalizePath(workspaceRoot);
        return this.getCached(this.lockFileCache, cacheKey,
            path.join(workspaceRoot, 'model.lock'),
            content => JSON.parse(content) as LockFile);
    }

    /**
     * Gets a manifest file from cache or loads it from disk.
     */
    async getCachedManifest(manifestPath: string): Promise<unknown> {
        // Key by workspaceRoot (parent dir) so invalidateCache(workspaceRoot) hits the right entry
        const cacheKey = this.normalizePath(path.dirname(manifestPath));
        return this.getCached(this.manifestCache, cacheKey, manifestPath, parseYaml);
    }

    private async getCached<T>(
        cache: Map<string, T>,
        cacheKey: string,
        filePath: string,
        parser: (content: string) => T
    ): Promise<T | undefined> {
        const cached = cache.get(cacheKey);
        if (cached) return cached;
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const result = parser(content);
            cache.set(cacheKey, result);
            return result;
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
    globalOptimizer ??= new PerformanceOptimizer();
    return globalOptimizer;
}

/**
 * Resets the global optimizer (useful for testing).
 */
export function resetGlobalOptimizer(): void {
    globalOptimizer = undefined;
}
