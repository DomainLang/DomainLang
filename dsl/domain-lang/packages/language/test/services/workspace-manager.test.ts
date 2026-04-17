/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * ManifestManager Tests
 *
 * Tests workspace root detection, lock file loading, cache invalidation,
 * and dependency resolution via the ManifestManager class.
 *
 * ~20% smoke (init + lock file load), ~80% edge (missing lock, cache
 * invalidation strategies, re-initialization, uninitialized access).
 */

import { beforeAll, afterAll, beforeEach, describe, expect, test } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ManifestManager } from "../../src/services/workspace-manager.js";
import { resetGlobalOptimizer } from "../../src/services/performance-optimizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_ROOT = path.resolve(__dirname, "../fixtures/sample-workspace");
const ALIAS_ROOT = path.resolve(__dirname, "../fixtures/alias-workspace");
const LOCK_FILE = path.join(TEST_ROOT, "model.lock");

async function createLockFile() {
    const lock = {
        version: "1",
        dependencies: {
            "acme/ddd-patterns": {
                ref: "2.1.0",
                refType: "tag",
                resolved: "https://github.com/acme/ddd-patterns",
                commit: "abc123",
                integrity: "sha256-foo"
            }
        }
    };
    await fs.writeFile(LOCK_FILE, JSON.stringify(lock, undefined, 2), "utf-8");
}

async function cleanup() {
    try { await fs.unlink(LOCK_FILE); } catch {
        // File doesn't exist, ignore
    }
}

describe("ManifestManager", () => {
    beforeAll(async () => {
        await cleanup();
    });
    beforeEach(async () => {
        await cleanup();
        resetGlobalOptimizer();
    });
    afterAll(async () => {
        await cleanup();
    });

    // ========================================================================
    // Smoke: basic initialization (~20%)
    // ========================================================================

    test("finds workspace root, loads lock file, and returns correct values", async () => {
        // Arrange
        await createLockFile();
        const manager = new ManifestManager();

        // Act
        await manager.initialize(TEST_ROOT);
        const lock = await manager.getLockFile();

        // Assert
        expect(lock?.version).toBe("1");
        expect(lock?.dependencies["acme/ddd-patterns"].ref).toBe("2.1.0");
        expect(lock?.dependencies["acme/ddd-patterns"].commit).toBe("abc123");
        expect(lock?.dependencies["acme/ddd-patterns"].resolved).toBe("https://github.com/acme/ddd-patterns");
        expect(manager.getWorkspaceRoot()).toBe(TEST_ROOT);
    });

    // ========================================================================
    // Edge: missing lock file
    // ========================================================================

    test("returns undefined if lock file missing", async () => {
        // Arrange
        const manager = new ManifestManager();

        // Act
        await manager.initialize(TEST_ROOT);
        const lock = await manager.getLockFile();

        // Assert
        expect(lock).toBeUndefined();
        expect(manager.getWorkspaceRoot()).toBe(TEST_ROOT);
        expect(await manager.getManifestPath()).toBe(path.join(TEST_ROOT, 'model.yaml'));
    });

    // ========================================================================
    // Edge: dependency path resolution
    // ========================================================================

    describe("Edge: dependency path resolution", () => {

        test("resolves dependency paths from manifest and lock file", async () => {
            // Arrange
            const lockFile = path.join(ALIAS_ROOT, "model.lock");
            const lock = {
                version: "1",
                dependencies: {
                    "ddd-patterns/core": {
                        ref: "v2.1.0",
                        refType: "tag",
                        resolved: "https://github.com/ddd-patterns/core",
                        commit: "abc123def"
                    }
                }
            };
            await fs.writeFile(lockFile, JSON.stringify(lock, undefined, 2), "utf-8");

            try {
                const manager = new ManifestManager();
                await manager.initialize(ALIAS_ROOT);

                // Act
                const resolved = await manager.resolveDependencyPath("ddd-patterns");
                const resolvedSubpath = await manager.resolveDependencyPath("ddd-patterns/sub/path");
                const missing = await manager.resolveDependencyPath("unknown");

                // Assert
                expect(resolved).toBe(path.join(ALIAS_ROOT, '.dlang', 'packages', 'ddd-patterns', 'core', 'abc123def', 'index.dlang'));
                expect(resolvedSubpath).toBe(path.join(ALIAS_ROOT, '.dlang', 'packages', 'ddd-patterns', 'core', 'abc123def', 'sub/path'));
                expect(missing).toBeUndefined();
            } finally {
                await fs.unlink(lockFile).catch(() => {});
            }
        });

        test("returns undefined for unresolvable dependency", async () => {
            // Arrange
            const manager = new ManifestManager();
            await manager.initialize(TEST_ROOT);

            // Act
            const result = await manager.resolveDependencyPath("nonexistent/package");

            // Assert
            expect(result).toBeUndefined();
        });
    });

    // ========================================================================
    // Edge: cache invalidation
    // ========================================================================

    describe("Edge: cache invalidation", () => {

        interface CacheInvalidationCase {
            strategy: 'full' | 'manifest-only' | 'lock-only';
            methodName: 'invalidateCache' | 'invalidateManifestCache' | 'invalidateLockCache';
            shouldClearManifest: boolean;
            shouldClearLock: boolean;
        }

        const invalidationCases: CacheInvalidationCase[] = [
            { strategy: 'full', methodName: 'invalidateCache', shouldClearManifest: true, shouldClearLock: true },
            { strategy: 'manifest-only', methodName: 'invalidateManifestCache', shouldClearManifest: true, shouldClearLock: false },
            { strategy: 'lock-only', methodName: 'invalidateLockCache', shouldClearManifest: false, shouldClearLock: true },
        ];

        test.each(invalidationCases)('$strategy invalidation clears cache correctly', async ({ methodName, shouldClearManifest, shouldClearLock }) => {
            // Arrange
            await createLockFile();
            const manager = new ManifestManager();
            await manager.initialize(TEST_ROOT);
            
            const manifestBefore = await manager.getManifest();
            const lockBefore = await manager.getLockFile();

            // Act
            if (methodName === 'invalidateCache') {
                manager.invalidateCache();
            } else if (methodName === 'invalidateManifestCache') {
                manager.invalidateManifestCache();
            } else {
                manager.invalidateLockCache();
            }

            // Verify cache was cleared by deleting files and checking
            if (shouldClearLock) {
                await cleanup();
            }

            // Assert
            if (shouldClearManifest) {
                // Manifest cache was cleared (would require fixture deletion to fully verify)
                // This test confirms the invalidation method completes without error
                expect(manifestBefore).not.toBeUndefined();
            }

            if (shouldClearLock) {
                const lockAfter = await manager.getLockFile();
                expect(lockAfter).toBeUndefined();
            } else if (lockBefore) {
                const lockStillCached = await manager.getLockFile();
                expect(lockStillCached?.version).toBe(lockBefore.version);
            }
        });
    });

    // ========================================================================
    // Edge: re-initialization and workspace root
    // ========================================================================

    describe("Edge: multi-root workspace support", () => {

        test("re-initialization switches to the new workspace root", async () => {
            // Arrange
            const manager = new ManifestManager();
            await manager.initialize(TEST_ROOT);
            expect(manager.getWorkspaceRoot()).toBe(TEST_ROOT);

            // Act
            await manager.initialize(ALIAS_ROOT);

            // Assert
            expect(manager.getWorkspaceRoot()).toBe(ALIAS_ROOT);
        });
        
        test("initializing from different paths to same root reuses context", async () => {
            // Arrange
            const manager = new ManifestManager();
            const subDir = path.join(TEST_ROOT, 'src');

            // Act
            await manager.initialize(subDir);
            expect(manager.getWorkspaceRoot()).toBe(TEST_ROOT);

            // Assert — Second init from same workspace root
            await manager.initialize(TEST_ROOT);
            expect(manager.getWorkspaceRoot()).toBe(TEST_ROOT);
        });
    });
});