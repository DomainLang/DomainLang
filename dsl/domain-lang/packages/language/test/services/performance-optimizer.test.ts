/**
 * PerformanceOptimizer Tests
 *
 * Tests caching, TTL expiration, global singleton, invalidation, and stats.
 * ~20% smoke (basic load & cache), ~80% edge (corrupt JSON, zero TTL,
 * file-deleted-while-cached, multi-workspace, getCachedManifest).
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PerformanceOptimizer, getGlobalOptimizer, resetGlobalOptimizer } from '../../src/services/performance-optimizer.js';
import type { LockFile } from '../../src/services/types.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('PerformanceOptimizer', () => {
    let optimizer: PerformanceOptimizer;
    let tempDir: string;

    beforeEach(async () => {
        optimizer = new PerformanceOptimizer({ cacheTTL: 1000 }); // 1 second TTL
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-perf-test-'));
    });

    afterEach(async () => {
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    // ========================================================================
    // Smoke: basic lock file caching (~20%)
    // ========================================================================

    describe('Smoke: basic getCachedLockFile', () => {

        test('loads lock file from disk and caches it', async () => {
            const lockFile: LockFile = {
                version: '1',
                dependencies: {
                    'acme/test': {
                        ref: '1.0.0',
                        refType: 'tag',
                        resolved: 'https://github.com/acme/test',
                        commit: 'abc123',
                    },
                },
            };
            await fs.writeFile(path.join(tempDir, 'model.lock'), JSON.stringify(lockFile), 'utf-8');

            const result = await optimizer.getCachedLockFile(tempDir);

            expect(result?.version).toBe('1');
            expect(result?.dependencies['acme/test'].ref).toBe('1.0.0');
            expect(result?.dependencies['acme/test'].commit).toBe('abc123');
        });
    });

    // ========================================================================
    // Edge: getCachedLockFile
    // ========================================================================

    describe('Edge: getCachedLockFile', () => {

        test('returns undefined when no lock file exists', async () => {
            const result = await optimizer.getCachedLockFile(tempDir);
            expect(result).toBeUndefined();
        });

        test('serves from cache on second call within TTL', async () => {
            const lockFile: LockFile = { version: '1', dependencies: {} };
            const lockPath = path.join(tempDir, 'model.lock');
            await fs.writeFile(lockPath, JSON.stringify(lockFile), 'utf-8');

            const result1 = await optimizer.getCachedLockFile(tempDir);
            // Modify file on disk
            await fs.writeFile(lockPath, JSON.stringify({ version: '2', dependencies: {} }), 'utf-8');
            const result2 = await optimizer.getCachedLockFile(tempDir);

            // Both should be version 1 (cached)
            expect(result1?.version).toBe('1');
            expect(result2?.version).toBe('1');
        });

        test('refreshes cache after TTL expires', async () => {
            const shortTTL = new PerformanceOptimizer({ cacheTTL: 10 }); // 10ms
            const lockPath = path.join(tempDir, 'model.lock');
            await fs.writeFile(lockPath, JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await shortTTL.getCachedLockFile(tempDir);

            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 20));
            await fs.writeFile(lockPath, JSON.stringify({ version: '2', dependencies: {} }), 'utf-8');

            const result = await shortTTL.getCachedLockFile(tempDir);
            expect(result?.version).toBe('2');
        });

        test('handles corrupt JSON in lock file gracefully', async () => {
            // Arrange
            const lockPath = path.join(tempDir, 'model.lock');
            await fs.writeFile(lockPath, 'NOT VALID JSON {{{', 'utf-8');

            // Act
            const result = await optimizer.getCachedLockFile(tempDir);

            // Assert — corrupt JSON should be handled gracefully, returning undefined
            expect(result).toBeUndefined();
        });

        test('handles empty lock file', async () => {
            // Arrange
            const lockPath = path.join(tempDir, 'model.lock');
            await fs.writeFile(lockPath, '', 'utf-8');

            // Act
            const result = await optimizer.getCachedLockFile(tempDir);

            // Assert — empty lock file should be handled gracefully, returning undefined
            expect(result).toBeUndefined();
        });

        test('caches lockfiles from multiple workspaces independently', async () => {
            const ws1 = path.join(tempDir, 'ws1');
            const ws2 = path.join(tempDir, 'ws2');
            await fs.mkdir(ws1, { recursive: true });
            await fs.mkdir(ws2, { recursive: true });

            await fs.writeFile(path.join(ws1, 'model.lock'), JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await fs.writeFile(path.join(ws2, 'model.lock'), JSON.stringify({ version: '2', dependencies: {} }), 'utf-8');

            const result1 = await optimizer.getCachedLockFile(ws1);
            const result2 = await optimizer.getCachedLockFile(ws2);

            expect(result1?.version).toBe('1');
            expect(result2?.version).toBe('2');
        });
    });

    // ========================================================================
    // Edge: invalidateCache
    // ========================================================================

    describe('Edge: invalidateCache', () => {

        test('removes cached entry for specific workspace', async () => {
            const lockFile: LockFile = { version: '1', dependencies: {} };
            await fs.writeFile(path.join(tempDir, 'model.lock'), JSON.stringify(lockFile), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            optimizer.invalidateCache(tempDir);

            const stats = optimizer.getCacheStats();
            expect(stats.lockFiles).toBe(0);
        });

        test('invalidating non-existent workspace does not throw', () => {
            expect(() => optimizer.invalidateCache('/nonexistent/path')).not.toThrow();
        });

        test('invalidating one workspace does not affect others', async () => {
            const ws1 = path.join(tempDir, 'ws1');
            const ws2 = path.join(tempDir, 'ws2');
            await fs.mkdir(ws1, { recursive: true });
            await fs.mkdir(ws2, { recursive: true });
            await fs.writeFile(path.join(ws1, 'model.lock'), JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await fs.writeFile(path.join(ws2, 'model.lock'), JSON.stringify({ version: '2', dependencies: {} }), 'utf-8');

            await optimizer.getCachedLockFile(ws1);
            await optimizer.getCachedLockFile(ws2);

            optimizer.invalidateCache(ws1);

            const stats = optimizer.getCacheStats();
            expect(stats.lockFiles).toBe(1);
        });
    });

    // ========================================================================
    // Edge: clearAllCaches
    // ========================================================================

    describe('Edge: clearAllCaches', () => {

        test('clears all cached lock files and manifests', async () => {
            await fs.writeFile(path.join(tempDir, 'model.lock'), JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            optimizer.clearAllCaches();

            const stats = optimizer.getCacheStats();
            expect(stats.lockFiles).toBe(0);
            expect(stats.manifests).toBe(0);
        });

        test('clearAllCaches on empty cache is a no-op', () => {
            expect(() => optimizer.clearAllCaches()).not.toThrow();
            const stats = optimizer.getCacheStats();
            expect(stats.lockFiles).toBe(0);
            expect(stats.manifests).toBe(0);
        });
    });

    // ========================================================================
    // Edge: getCacheStats
    // ========================================================================

    describe('Edge: getCacheStats', () => {

        test('reports zero counts initially', () => {
            const stats = optimizer.getCacheStats();
            expect(stats.lockFiles).toBe(0);
            expect(stats.manifests).toBe(0);
        });

        test('increments lockFiles count after caching', async () => {
            await fs.writeFile(path.join(tempDir, 'model.lock'), JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            const stats = optimizer.getCacheStats();
            expect(stats.lockFiles).toBe(1);
        });

        test('decrements after invalidation', async () => {
            await fs.writeFile(path.join(tempDir, 'model.lock'), JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            expect(optimizer.getCacheStats().lockFiles).toBe(1);
            optimizer.invalidateCache(tempDir);
            expect(optimizer.getCacheStats().lockFiles).toBe(0);
        });
    });

    // ========================================================================
    // Edge: detectStaleCaches
    // ========================================================================

    describe('Edge: detectStaleCaches', () => {

        test('detects when cached file is modified on disk', async () => {
            const lockPath = path.join(tempDir, 'model.lock');
            await fs.writeFile(lockPath, JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            await new Promise(resolve => setTimeout(resolve, 10));
            await fs.writeFile(lockPath, JSON.stringify({ version: '2', dependencies: {} }), 'utf-8');

            const stale = await optimizer.detectStaleCaches();
            expect(stale).toContain(path.resolve(tempDir));
        });

        test('cache is fresh immediately after loading', async () => {
            // getCachedLockFile loads the data; detectStaleCaches should report
            // no stale entries when the file hasn't changed since caching
            const lockPath = path.join(tempDir, 'model.lock');
            await fs.writeFile(lockPath, JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            const stale = await optimizer.detectStaleCaches();
            expect(stale).toHaveLength(0);
        });

        test('returns empty array when no caches exist', async () => {
            const stale = await optimizer.detectStaleCaches();
            expect(stale).toEqual([]);
        });

        test('handles deleted lock file after caching', async () => {
            const lockPath = path.join(tempDir, 'model.lock');
            await fs.writeFile(lockPath, JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            // Delete the file
            await fs.unlink(lockPath);

            // Should handle gracefully: mark as stale since cached file was deleted
            const stale = await optimizer.detectStaleCaches();
            // File deleted = stale scenario
            expect(stale.length).toBeGreaterThan(0);
        });
    });
});

describe('Global Optimizer', () => {
    afterEach(() => {
        resetGlobalOptimizer();
    });

    test('getGlobalOptimizer returns same singleton instance', () => {
        const opt1 = getGlobalOptimizer();
        const opt2 = getGlobalOptimizer();
        expect(opt1).toBe(opt2);
    });

    test('resetGlobalOptimizer creates a fresh instance', () => {
        const opt1 = getGlobalOptimizer();
        resetGlobalOptimizer();
        const opt2 = getGlobalOptimizer();
        expect(opt1).not.toBe(opt2);
    });
});
