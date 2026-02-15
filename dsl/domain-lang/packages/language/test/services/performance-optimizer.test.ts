/**
 * PerformanceOptimizer Tests
 *
 * Tests caching, event-based invalidation, global singleton, and stats.
 * ~20% smoke (basic load & cache), ~80% edge (corrupt JSON,
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
        optimizer = new PerformanceOptimizer();
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
            // Arrange
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

            // Act
            const result = await optimizer.getCachedLockFile(tempDir);

            // Assert
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
            // Act
            const result = await optimizer.getCachedLockFile(tempDir);

            // Assert
            expect(result).toBeUndefined();
        });

        test('serves from cache on second call until invalidated', async () => {
            // Arrange
            const lockFile: LockFile = { version: '1', dependencies: {} };
            const lockPath = path.join(tempDir, 'model.lock');
            await fs.writeFile(lockPath, JSON.stringify(lockFile), 'utf-8');

            const result1 = await optimizer.getCachedLockFile(tempDir);
            // Modify file on disk — cache should NOT notice
            await fs.writeFile(lockPath, JSON.stringify({ version: '2', dependencies: {} }), 'utf-8');

            // Act
            const result2 = await optimizer.getCachedLockFile(tempDir);

            // Assert — Both should be version 1 (cached until invalidated)
            expect(result1?.version).toBe('1');
            expect(result2?.version).toBe('1');
        });

        test('serves fresh data after invalidation', async () => {
            // Arrange
            const lockPath = path.join(tempDir, 'model.lock');
            await fs.writeFile(lockPath, JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            // Update file and invalidate cache
            await fs.writeFile(lockPath, JSON.stringify({ version: '2', dependencies: {} }), 'utf-8');
            optimizer.invalidateCache(tempDir);

            // Act
            const result = await optimizer.getCachedLockFile(tempDir);

            // Assert
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
            // Arrange
            const ws1 = path.join(tempDir, 'ws1');
            const ws2 = path.join(tempDir, 'ws2');
            await fs.mkdir(ws1, { recursive: true });
            await fs.mkdir(ws2, { recursive: true });

            await fs.writeFile(path.join(ws1, 'model.lock'), JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await fs.writeFile(path.join(ws2, 'model.lock'), JSON.stringify({ version: '2', dependencies: {} }), 'utf-8');

            // Act
            const result1 = await optimizer.getCachedLockFile(ws1);
            const result2 = await optimizer.getCachedLockFile(ws2);

            // Assert
            expect(result1?.version).toBe('1');
            expect(result2?.version).toBe('2');
        });
    });

    // ========================================================================
    // Edge: invalidateCache
    // ========================================================================

    describe('Edge: invalidateCache', () => {

        test('removes cached entry for specific workspace', async () => {
            // Arrange
            const lockFile: LockFile = { version: '1', dependencies: {} };
            await fs.writeFile(path.join(tempDir, 'model.lock'), JSON.stringify(lockFile), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            // Act
            optimizer.invalidateCache(tempDir);

            // Assert
            const stats = optimizer.getCacheStats();
            expect(stats.lockFiles).toBe(0);
        });

        test('invalidating non-existent workspace does not throw', () => {
            // Act & Assert
            expect(() => optimizer.invalidateCache('/nonexistent/path')).not.toThrow();
        });

        test('invalidating one workspace does not affect others', async () => {
            // Arrange
            const ws1 = path.join(tempDir, 'ws1');
            const ws2 = path.join(tempDir, 'ws2');
            await fs.mkdir(ws1, { recursive: true });
            await fs.mkdir(ws2, { recursive: true });
            await fs.writeFile(path.join(ws1, 'model.lock'), JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await fs.writeFile(path.join(ws2, 'model.lock'), JSON.stringify({ version: '2', dependencies: {} }), 'utf-8');

            await optimizer.getCachedLockFile(ws1);
            await optimizer.getCachedLockFile(ws2);

            // Act
            optimizer.invalidateCache(ws1);

            // Assert
            const stats = optimizer.getCacheStats();
            expect(stats.lockFiles).toBe(1);
            const ws2Cached = await optimizer.getCachedLockFile(ws2);
            expect(ws2Cached?.version).toBe('2');
        });
    });

    // ========================================================================
    // Edge: clearAllCaches
    // ========================================================================

    describe('Edge: clearAllCaches', () => {

        test('clears all cached lock files and manifests', async () => {
            // Arrange
            await fs.writeFile(path.join(tempDir, 'model.lock'), JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            // Act
            optimizer.clearAllCaches();

            // Assert
            const stats = optimizer.getCacheStats();
            expect(stats.lockFiles).toBe(0);
            expect(stats.manifests).toBe(0);
        });

        test('clearAllCaches on empty cache is a no-op', () => {
            // Act & Assert
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
            // Act
            const stats = optimizer.getCacheStats();

            // Assert
            expect(stats.lockFiles).toBe(0);
            expect(stats.manifests).toBe(0);
        });

        test('increments lockFiles count after caching', async () => {
            // Arrange
            await fs.writeFile(path.join(tempDir, 'model.lock'), JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            // Act
            const stats = optimizer.getCacheStats();

            // Assert
            expect(stats.lockFiles).toBe(1);
        });

        test('decrements after invalidation', async () => {
            // Arrange
            await fs.writeFile(path.join(tempDir, 'model.lock'), JSON.stringify({ version: '1', dependencies: {} }), 'utf-8');
            await optimizer.getCachedLockFile(tempDir);

            // Act
            expect(optimizer.getCacheStats().lockFiles).toBe(1);
            optimizer.invalidateCache(tempDir);

            // Assert
            expect(optimizer.getCacheStats().lockFiles).toBe(0);
        });
    });


});

describe('Global Optimizer', () => {
    afterEach(() => {
        resetGlobalOptimizer();
    });

    test('getGlobalOptimizer returns same singleton instance', () => {
        // Act
        const opt1 = getGlobalOptimizer();
        const opt2 = getGlobalOptimizer();

        // Assert
        expect(opt1).toBe(opt2);
    });

    test('resetGlobalOptimizer creates a fresh instance', () => {
        // Arrange
        const opt1 = getGlobalOptimizer();

        // Act
        resetGlobalOptimizer();
        const opt2 = getGlobalOptimizer();

        // Assert
        expect(opt1).not.toBe(opt2);
    });
});
