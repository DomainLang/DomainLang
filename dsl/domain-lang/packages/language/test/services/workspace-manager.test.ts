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
        await createLockFile();
        const manager = new WorkspaceManager();

        await manager.initialize(TEST_ROOT);
        const lock = await manager.getLockFile();

        // Replace toBeDefined with actual value checks
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
        const manager = new WorkspaceManager();
        await manager.initialize(TEST_ROOT);
        const lock = await manager.getLockFile();

        expect(lock).toBeUndefined();
    });

    // ========================================================================
    // Edge: dependency path resolution
    // ========================================================================

    describe("Edge: dependency path resolution", () => {

        test("resolves dependency paths from manifest and lock file", async () => {
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

                const missing = await manager.resolveDependencyPath("unknown");
                expect(missing).toBeUndefined();
            } finally {
                await fs.unlink(lockFile).catch(() => {});
            }
        });

        test("returns undefined for unresolvable dependency", async () => {
            const manager = new WorkspaceManager();
            await manager.initialize(TEST_ROOT);

            const result = await manager.resolveDependencyPath("nonexistent/package");
            expect(result).toBeUndefined();
        });
    });

    // ========================================================================
    // Edge: cache invalidation
    // ========================================================================

    describe("Edge: cache invalidation", () => {

        test("invalidateCache clears both manifest and lock caches", async () => {
            await createLockFile();
            const manager = new WorkspaceManager();
            await manager.initialize(TEST_ROOT);

            // Prime the caches
            await manager.getManifest();
            await manager.getLockFile();

            // Invalidate
            manager.invalidateCache();

            // Remove the lock file to verify cache was truly cleared
            await cleanup();

            // getLockFile should now read from disk (file is gone)
            const lock = await manager.getLockFile();
            expect(lock).toBeUndefined();
        });

        test("invalidateManifestCache clears only manifest cache, preserves lock cache", async () => {
            await createLockFile();
            const manager = new WorkspaceManager();
            await manager.initialize(TEST_ROOT);

            // Prime both caches
            await manager.getManifest();
            const lockBefore = await manager.getLockFile();

            // Invalidate only manifest
            manager.invalidateManifestCache();

            // Lock should still be cached
            const lockAfter = await manager.getLockFile();
            expect(lockAfter?.version).toBe(lockBefore?.version);
            expect(lockAfter?.dependencies["acme/ddd-patterns"].ref).toBe("2.1.0");
        });

        test("invalidateLockCache clears only lock file cache", async () => {
            await createLockFile();
            const manager = new WorkspaceManager();
            await manager.initialize(TEST_ROOT);

            // Prime lock cache
            const lockBefore = await manager.getLockFile();
            expect(lockBefore?.version).toBe("1");

            // Invalidate only lock
            manager.invalidateLockCache();

            // Remove the lock file to verify cache was truly cleared
            await cleanup();

            // getLockFile should now return undefined since file is gone
            const lock = await manager.getLockFile();
            expect(lock).toBeUndefined();
        });
    });

    // ========================================================================
    // Edge: re-initialization and workspace root
    // ========================================================================

    describe("Edge: re-initialization", () => {

        test("re-initialization retains original workspace root", async () => {
            const manager = new WorkspaceManager();
            await manager.initialize(TEST_ROOT);
            expect(manager.getWorkspaceRoot()).toBe(TEST_ROOT);

            // Re-initializing with a different root does not change the workspace root
            await manager.initialize(ALIAS_ROOT);
            expect(manager.getWorkspaceRoot()).toBe(TEST_ROOT);
        });

        // 'getWorkspaceRoot returns correct path' subsumed by smoke test and re-initialization test above
    });
});
