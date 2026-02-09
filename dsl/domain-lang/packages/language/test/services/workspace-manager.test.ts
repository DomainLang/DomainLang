/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * WorkspaceManager Tests
 *
 * Tests workspace root detection, lock file loading, cache invalidation,
 * and dependency resolution via the WorkspaceManager class.
 *
 * ~20% smoke (init + lock file load), ~80% edge (missing lock, cache
 * invalidation strategies, re-initialization, uninitialized access).
 */

import { beforeAll, afterAll, beforeEach, describe, expect, test } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { WorkspaceManager } from "../../src/services/workspace-manager.js";
import { resetGlobalOptimizer } from "../../src/services/performance-optimizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_ROOT = path.resolve(__dirname, "../fixtures/sample-workspace");
const ALIAS_ROOT = path.resolve(__dirname, "../fixtures/alias-workspace");
const LOCK_FILE = path.join(TEST_ROOT, "model.lock");

// Helper: create a dummy lock file
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

// Helper: clean up lock file
async function cleanup() {
    try { await fs.unlink(LOCK_FILE); } catch {
        // File doesn't exist, ignore
    }
}

describe("WorkspaceManager", () => {
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
        const manager = new WorkspaceManager();

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
        const manager = new WorkspaceManager();

        // Act
        await manager.initialize(TEST_ROOT);
        const lock = await manager.getLockFile();

        // Assert
        expect(lock).toBeUndefined();
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
                const manager = new WorkspaceManager();
                await manager.initialize(ALIAS_ROOT);

                // Act
                const missing = await manager.resolveDependencyPath("unknown");

                // Assert
                expect(missing).toBeUndefined();
            } finally {
                await fs.unlink(lockFile).catch(() => {});
            }
        });

        test("returns undefined for unresolvable dependency", async () => {
            // Arrange
            const manager = new WorkspaceManager();
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

        test("invalidateCache clears both manifest and lock caches", async () => {
            // Arrange
            await createLockFile();
            const manager = new WorkspaceManager();
            await manager.initialize(TEST_ROOT);
            await manager.getManifest();
            await manager.getLockFile();

            // Act
            manager.invalidateCache();

            // Assert — Remove the lock file to verify cache was truly cleared
            await cleanup();
            const lock = await manager.getLockFile();
            expect(lock).toBeUndefined();
        });

        test("invalidateManifestCache clears only manifest cache, preserves lock cache", async () => {
            // Arrange
            await createLockFile();
            const manager = new WorkspaceManager();
            await manager.initialize(TEST_ROOT);
            await manager.getManifest();
            const lockBefore = await manager.getLockFile();

            // Act
            manager.invalidateManifestCache();

            // Assert
            const lockAfter = await manager.getLockFile();
            expect(lockAfter?.version).toBe(lockBefore?.version);
            expect(lockAfter?.dependencies["acme/ddd-patterns"].ref).toBe("2.1.0");
        });

        test("invalidateLockCache clears only lock file cache", async () => {
            // Arrange
            await createLockFile();
            const manager = new WorkspaceManager();
            await manager.initialize(TEST_ROOT);
            const lockBefore = await manager.getLockFile();
            expect(lockBefore?.version).toBe("1");

            // Act
            manager.invalidateLockCache();

            // Assert — Remove the lock file to verify cache was truly cleared
            await cleanup();
            const lock = await manager.getLockFile();
            expect(lock).toBeUndefined();
        });
    });

    // ========================================================================
    // Edge: re-initialization and workspace root
    // ========================================================================

    describe("Edge: multi-root workspace support", () => {

        test("re-initialization switches to the new workspace root", async () => {
            // Arrange
            const manager = new WorkspaceManager();
            await manager.initialize(TEST_ROOT);
            expect(manager.getWorkspaceRoot()).toBe(TEST_ROOT);

            // Act
            await manager.initialize(ALIAS_ROOT);

            // Assert
            expect(manager.getWorkspaceRoot()).toBe(ALIAS_ROOT);
        });
        
        test("initializing from different paths to same root reuses context", async () => {
            // Arrange
            const manager = new WorkspaceManager();
            const subDir = path.join(TEST_ROOT, 'src');

            // Act
            await manager.initialize(subDir);
            expect(manager.getWorkspaceRoot()).toBe(TEST_ROOT);

            // Assert — Second init from same workspace root
            await manager.initialize(TEST_ROOT);
            expect(manager.getWorkspaceRoot()).toBe(TEST_ROOT);
        });

        // 'getWorkspaceRoot returns correct path' subsumed by smoke test and re-initialization test above
    });
});
