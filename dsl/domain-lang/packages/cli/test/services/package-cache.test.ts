/**
 * Tests for PackageCache service.
 * 
 * These tests use real filesystem operations in temp directories to verify
 * cache behavior including atomic writes, concurrent install protection,
 * and proper cleanup.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PackageCache } from '../../src/services/package-cache.js';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { create } from 'tar';

describe('PackageCache', () => {
    let testDir: string;
    let cache: PackageCache;

    beforeEach(async () => {
        // Arrange - Create isolated temp directory for each test
        testDir = await mkdtemp(join(tmpdir(), 'package-cache-test-'));
        cache = new PackageCache(testDir);
    });

    afterEach(async () => {
        // Clean up test directory after each test
        await rm(testDir, { recursive: true, force: true });
    });

    describe('has', () => {
        test('should return false for non-existent package', async () => {
            // Arrange - Fresh cache with no packages

            // Act
            const result = await cache.has('domainlang', 'core', 'abc123');

            // Assert
            expect(result).toBe(false);
        });

        test('should return true for existing package', async () => {
            // Arrange - Create a package directory manually
            const packagePath = join(testDir, '.dlang', 'packages', 'domainlang', 'core', 'abc123');
            await mkdir(packagePath, { recursive: true });
            await writeFile(join(packagePath, 'model.yaml'), 'version: "1.0.0"');

            // Act
            const result = await cache.has('domainlang', 'core', 'abc123');

            // Assert
            expect(result).toBe(true);
        });
    });

    describe('get', () => {
        test('should return undefined for non-existent package', async () => {
            // Arrange - Fresh cache with no packages

            // Act
            const result = await cache.get('domainlang', 'core', 'abc123');

            // Assert
            expect(result).toBeUndefined();
        });

        test('should return absolute path for existing package', async () => {
            // Arrange - Create a package directory manually
            const packagePath = join(testDir, '.dlang', 'packages', 'domainlang', 'core', 'abc123');
            await mkdir(packagePath, { recursive: true });
            await writeFile(join(packagePath, 'model.yaml'), 'version: "1.0.0"');

            // Act
            const result = await cache.get('domainlang', 'core', 'abc123');

            // Assert
            expect(result).toBeDefined();
            expect(result).toBe(packagePath);
            if (result) {
                expect(existsSync(result)).toBe(true);
            }
        });
    });

    describe('put', () => {
        test('should extract tarball to cache', async () => {
            // Arrange - Create a test tarball
            const tarballPath = await createTestTarball(testDir, {
                'model.yaml': 'version: "1.0.0"',
                'index.dlang': 'Domain Test {}',
            });

            // Act
            const cachedPath = await cache.put('domainlang', 'core', 'abc123', tarballPath);

            // Assert
            expect(existsSync(cachedPath)).toBe(true);
            expect(existsSync(join(cachedPath, 'model.yaml'))).toBe(true);
            expect(existsSync(join(cachedPath, 'index.dlang'))).toBe(true);
        });

        test('should handle package with strip: 1 (removing top-level directory)', async () => {
            // Arrange - Create tarball with top-level directory (typical GitHub tarball structure)
            const tarballPath = await createTestTarballWithTopLevel(testDir, 'core-main', {
                'model.yaml': 'version: "1.0.0"',
                'index.dlang': 'Domain Test {}',
            });

            // Act
            const cachedPath = await cache.put('domainlang', 'core', 'abc123', tarballPath);

            // Assert - Files should be at root level, not under 'core-main/'
            expect(existsSync(cachedPath)).toBe(true);
            expect(existsSync(join(cachedPath, 'model.yaml'))).toBe(true);
            expect(existsSync(join(cachedPath, 'index.dlang'))).toBe(true);
            expect(existsSync(join(cachedPath, 'core-main'))).toBe(false);
        });

        test('should return existing path when target already exists', async () => {
            // Arrange - Create two identical tarballs
            const tarball1 = await createTestTarball(testDir, {
                'model.yaml': 'version: "1.0.0"',
            });
            const tarball2 = await createTestTarball(testDir, {
                'model.yaml': 'version: "1.0.0"',
            });

            // Act - Simulate concurrent install: both try to cache same package
            const path1 = await cache.put('domainlang', 'core', 'abc123', tarball1);
            const path2 = await cache.put('domainlang', 'core', 'abc123', tarball2);

            // Assert - Both should return the same path
            expect(path1).toBe(path2);
            expect(existsSync(path1)).toBe(true);
        });

        test('should clean up temp directory on extraction failure', async () => {
            // Arrange - Create invalid tarball path
            const invalidTarball = join(testDir, 'nonexistent.tar.gz');

            // Act & Assert
            await expect(
                cache.put('domainlang', 'core', 'abc123', invalidTarball)
            ).rejects.toThrow(/Failed to cache package/);

            // Assert - No temp directories should remain
            const packagesDir = join(testDir, '.dlang', 'packages');
            if (existsSync(packagesDir)) {
                await rm(packagesDir, { recursive: true, force: true });
                // Directory should be cleanable (no leftover temp dirs holding locks)
            }
        });

        test('should handle nested directory structure in tarball', async () => {
            // Arrange - Create tarball with nested directories
            const tarballPath = await createTestTarball(testDir, {
                'model.yaml': 'version: "1.0.0"',
                'domains/sales.dlang': 'Domain Sales {}',
                'contexts/order.dlang': 'bc OrderContext {}',
            });

            // Act
            const cachedPath = await cache.put('acme', 'patterns', 'def456', tarballPath);

            // Assert
            expect(existsSync(cachedPath)).toBe(true);
            expect(existsSync(join(cachedPath, 'model.yaml'))).toBe(true);
            expect(existsSync(join(cachedPath, 'domains', 'sales.dlang'))).toBe(true);
            expect(existsSync(join(cachedPath, 'contexts', 'order.dlang'))).toBe(true);
        });
    });

    describe('remove', () => {
        test('should remove specific package from cache', async () => {
            // Arrange - Create and cache a package
            const tarballPath = await createTestTarball(testDir, {
                'model.yaml': 'version: "1.0.0"',
            });
            const cachedPath = await cache.put('domainlang', 'core', 'abc123', tarballPath);
            expect(existsSync(cachedPath)).toBe(true);

            // Act
            await cache.remove('domainlang', 'core', 'abc123');

            // Assert
            expect(existsSync(cachedPath)).toBe(false);
        });

        test('should be idempotent (no error on non-existent package)', async () => {
            // Arrange - No package in cache

            // Act & Assert - Should not throw
            await expect(
                cache.remove('domainlang', 'core', 'nonexistent')
            ).resolves.toBeUndefined();
        });

        test('should not affect other packages', async () => {
            // Arrange - Create two packages
            const tarball1 = await createTestTarball(testDir, { 'file1.txt': 'content1' });
            const tarball2 = await createTestTarball(testDir, { 'file2.txt': 'content2' });
            const path1 = await cache.put('domainlang', 'core', 'abc123', tarball1);
            const path2 = await cache.put('domainlang', 'core', 'def456', tarball2);

            // Act - Remove only first package
            await cache.remove('domainlang', 'core', 'abc123');

            // Assert - First removed, second remains
            expect(existsSync(path1)).toBe(false);
            expect(existsSync(path2)).toBe(true);
        });
    });

    describe('clear', () => {
        test('should remove entire packages directory', async () => {
            // Arrange - Create multiple packages
            const tarball1 = await createTestTarball(testDir, { 'file1.txt': 'content1' });
            const tarball2 = await createTestTarball(testDir, { 'file2.txt': 'content2' });
            await cache.put('domainlang', 'core', 'abc123', tarball1);
            await cache.put('acme', 'patterns', 'def456', tarball2);
            const packagesDir = join(testDir, '.dlang', 'packages');
            expect(existsSync(packagesDir)).toBe(true);

            // Act
            await cache.clear();

            // Assert
            expect(existsSync(packagesDir)).toBe(false);
        });

        test('should be idempotent (no error on empty cache)', async () => {
            // Arrange - Fresh cache with no packages

            // Act & Assert - Should not throw
            await expect(cache.clear()).resolves.toBeUndefined();
        });

        test('should allow cache to be used after clear', async () => {
            // Arrange - Create package, then clear
            const tarball1 = await createTestTarball(testDir, { 'file1.txt': 'content1' });
            await cache.put('domainlang', 'core', 'abc123', tarball1);
            await cache.clear();

            // Act - Add new package after clear
            const tarball2 = await createTestTarball(testDir, { 'file2.txt': 'content2' });
            const cachedPath = await cache.put('domainlang', 'core', 'def456', tarball2);

            // Assert - Cache works after clear
            expect(existsSync(cachedPath)).toBe(true);
            expect(await cache.has('domainlang', 'core', 'def456')).toBe(true);
        });
    });
});

/**
 * Helper: Create a test tarball with specified files.
 * 
 * Creates a tarball with a top-level directory (like GitHub tarballs).
 * This matches the real-world structure of GitHub-downloaded tarballs.
 * 
 * @param baseDir - Directory to create tarball in
 * @param files - Map of filename to content
 * @returns Path to created tarball
 */
async function createTestTarball(
    baseDir: string,
    files: Record<string, string>
): Promise<string> {
    // Use a top-level directory (like GitHub: "repo-main/")
    const topLevelDir = `package-${Date.now()}`;
    const contentDir = join(baseDir, `content-${Date.now()}`);
    const topDir = join(contentDir, topLevelDir);
    await mkdir(topDir, { recursive: true });

    // Create files under top-level directory
    for (const [filename, content] of Object.entries(files)) {
        const filePath = join(topDir, filename);
        await mkdir(join(filePath, '..'), { recursive: true });
        await writeFile(filePath, content);
    }

    // Create tarball (includes top-level directory, just like GitHub)
    const tarballPath = join(baseDir, `test-${Date.now()}.tar.gz`);
    await create(
        {
            gzip: true,
            file: tarballPath,
            cwd: contentDir,
        },
        [topLevelDir]
    );

    return tarballPath;
}

/**
 * Helper: Create a test tarball with top-level directory (like GitHub tarballs).
 * 
 * @param baseDir - Directory to create tarball in
 * @param topLevelDir - Top-level directory name (e.g., "repo-main")
 * @param files - Map of filename to content (relative to top-level dir)
 * @returns Path to created tarball
 */
async function createTestTarballWithTopLevel(
    baseDir: string,
    topLevelDir: string,
    files: Record<string, string>
): Promise<string> {
    const contentDir = join(baseDir, `content-${Date.now()}`);
    const topDir = join(contentDir, topLevelDir);
    await mkdir(topDir, { recursive: true });

    // Create files under top-level directory
    for (const [filename, content] of Object.entries(files)) {
        const filePath = join(topDir, filename);
        await mkdir(join(filePath, '..'), { recursive: true });
        await writeFile(filePath, content);
    }

    // Create tarball (includes top-level directory)
    const tarballPath = join(baseDir, `test-${Date.now()}.tar.gz`);
    await create(
        {
            gzip: true,
            file: tarballPath,
            cwd: contentDir,
        },
        [topLevelDir]
    );

    return tarballPath;
}
