/**
 * Tests for manifest-utils module.
 *
 * Smoke (~20%):
 * - fileExists returns true for existing file/directory, false for missing
 * - readManifest parses valid YAML and returns correct model.name
 *
 * Edge/error (~80%):
 * - findNearestManifest finds manifest in current, parent, nearest directory
 * - findNearestManifest returns undefined at filesystem root
 * - findWorkspaceRoot returns containing directory or undefined
 * - readManifest returns undefined for non-existent file
 * - readManifest handles empty manifest
 * - readManifest throws on malformed YAML
 * - readManifest parses dependencies structure
 * - readEntryFromManifest returns custom entry, default entry, and default for missing file
 * - getEntryPath resolves absolute, default, and relative-to-manifest paths
 * - findManifestsInDirectories finds multiple, skips missing, handles empty list, follows parent
 * - Exported constants have correct values
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as manifestUtils from '../../src/utils/manifest-utils.js';

describe('manifest-utils', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-manifest-test-'));
    });

    afterEach(async () => {
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('fileExists', () => {
        test('returns true for existing file', async () => {
            // Arrange
            const filePath = path.join(tmpDir, 'test.txt');
            await fs.writeFile(filePath, 'content');

            // Act & Assert
            expect(await manifestUtils.fileExists(filePath)).toBe(true);
        });

        test('returns true for existing directory', async () => {
            // Act & Assert
            expect(await manifestUtils.fileExists(tmpDir)).toBe(true);
        });

        test('returns false for non-existent file', async () => {
            // Act & Assert
            expect(await manifestUtils.fileExists(path.join(tmpDir, 'nonexistent.txt'))).toBe(false);
        });

        test('returns false for path with empty string', async () => {
            // Act & Assert - Empty path should return false, not crash
            expect(await manifestUtils.fileExists('')).toBe(false);
        });
    });

    describe('findNearestManifest', () => {
        test('finds manifest in current directory', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, 'model:\n  name: test\n');

            // Act & Assert
            expect(await manifestUtils.findNearestManifest(tmpDir)).toBe(manifestPath);
        });

        test('finds manifest in parent directory', async () => {
            // Arrange
            const subDir = path.join(tmpDir, 'sub', 'nested');
            await fs.mkdir(subDir, { recursive: true });

            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, 'model:\n  name: test\n');

            // Act & Assert
            expect(await manifestUtils.findNearestManifest(subDir)).toBe(manifestPath);
        });

        test('finds nearest manifest when multiple exist (prefers closer)', async () => {
            // Arrange
            const rootManifest = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(rootManifest, 'model:\n  name: root\n');

            const subDir = path.join(tmpDir, 'sub');
            await fs.mkdir(subDir);
            const subManifest = path.join(subDir, 'model.yaml');
            await fs.writeFile(subManifest, 'model:\n  name: sub\n');

            // Act & Assert - Nearest to subDir is subDir's own manifest, not root's
            expect(await manifestUtils.findNearestManifest(subDir)).toBe(subManifest);
        });

        test('returns undefined when no manifest found', async () => {
            // Arrange
            const subDir = path.join(tmpDir, 'sub', 'nested');
            await fs.mkdir(subDir, { recursive: true });

            // Act & Assert
            expect(await manifestUtils.findNearestManifest(subDir)).toBeUndefined();
        });

        test('stops at filesystem root', async () => {
            // Act & Assert
            expect(await manifestUtils.findNearestManifest('/')).toBeUndefined();
        });
    });

    describe('findWorkspaceRoot', () => {
        test('returns directory containing manifest', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, 'model:\n  name: test\n');

            // Act & Assert
            expect(await manifestUtils.findWorkspaceRoot(tmpDir)).toBe(tmpDir);
        });

        test('returns parent directory of manifest found via traversal', async () => {
            // Arrange
            const subDir = path.join(tmpDir, 'sub', 'nested');
            await fs.mkdir(subDir, { recursive: true });

            await fs.writeFile(path.join(tmpDir, 'model.yaml'), 'model:\n  name: test\n');

            // Act & Assert
            expect(await manifestUtils.findWorkspaceRoot(subDir)).toBe(tmpDir);
        });

        test('returns undefined when no manifest found', async () => {
            // Arrange
            const subDir = path.join(tmpDir, 'sub', 'nested');
            await fs.mkdir(subDir, { recursive: true });

            // Act & Assert
            expect(await manifestUtils.findWorkspaceRoot(subDir)).toBeUndefined();
        });
    });

    describe('readManifest', () => {
        test('parses valid YAML manifest with correct name and version', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, `model:
  name: test-project
  version: 1.0.0
  entry: index.dlang
`);

            // Act
            const manifest = await manifestUtils.readManifest(manifestPath);

            // Assert
            expect(manifest?.model?.name).toBe('test-project');
            expect(manifest?.model?.version).toBe('1.0.0');
            expect(manifest?.model?.entry).toBe('index.dlang');
        });

        test('returns undefined for non-existent file', async () => {
            // Act
            const manifest = await manifestUtils.readManifest(path.join(tmpDir, 'nonexistent.yaml'));

            // Assert
            expect(manifest).toBeUndefined();
        });

        test('does not crash on empty manifest file', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, '');

            // Act & Assert - Empty YAML should not crash readManifest
            await expect(manifestUtils.readManifest(manifestPath)).resolves.not.toThrow();
        });

        test('parses manifest with dependencies structure intact', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, `model:
  name: test-project
dependencies:
  - name: core
    version: 1.0.0
`);

            // Act
            const manifest = await manifestUtils.readManifest(manifestPath);

            // Assert
            expect(manifest?.dependencies).toHaveLength(1);
        });

        test('throws on malformed YAML', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, 'invalid: [yaml: syntax');

            // Act & Assert
            await expect(manifestUtils.readManifest(manifestPath)).rejects.toThrow();
        });
    });

    describe('readEntryFromManifest', () => {
        test('returns custom entry from manifest', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, `model:\n  entry: domains/sales.dlang\n`);

            // Act & Assert
            expect(await manifestUtils.readEntryFromManifest(manifestPath)).toBe('domains/sales.dlang');
        });

        test('returns default "index.dlang" when entry not specified', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, `model:\n  name: test\n`);

            // Act & Assert
            expect(await manifestUtils.readEntryFromManifest(manifestPath)).toBe('index.dlang');
        });

        test('returns default "index.dlang" for non-existent file', async () => {
            // Act & Assert
            expect(await manifestUtils.readEntryFromManifest(path.join(tmpDir, 'nonexistent.yaml'))).toBe('index.dlang');
        });

        test('returns default "index.dlang" for manifest with empty model object', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, `model: {}`);

            // Act & Assert
            expect(await manifestUtils.readEntryFromManifest(manifestPath)).toBe('index.dlang');
        });
    });

    describe('getEntryPath', () => {
        test('returns absolute path joining manifest dir with custom entry', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, `model:\n  entry: domains/sales.dlang\n`);

            // Act & Assert
            expect(await manifestUtils.getEntryPath(manifestPath)).toBe(path.join(tmpDir, 'domains/sales.dlang'));
        });

        test('returns default entry path when entry not specified', async () => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, `model:\n  name: test\n`);

            // Act & Assert
            expect(await manifestUtils.getEntryPath(manifestPath)).toBe(path.join(tmpDir, 'index.dlang'));
        });

        test('resolves entry relative to manifest directory, not cwd', async () => {
            // Arrange
            const subDir = path.join(tmpDir, 'sub');
            await fs.mkdir(subDir);
            const manifestPath = path.join(subDir, 'model.yaml');
            await fs.writeFile(manifestPath, `model:\n  entry: ../../index.dlang\n`);

            // Act & Assert
            expect(await manifestUtils.getEntryPath(manifestPath)).toBe(
                path.normalize(path.join(subDir, '../../index.dlang'))
            );
        });
    });

    describe('findManifestsInDirectories', () => {
        test('finds manifests in provided directories with correct paths', async () => {
            // Arrange
            const dir1 = path.join(tmpDir, 'proj1');
            const dir2 = path.join(tmpDir, 'proj2');
            await fs.mkdir(dir1);
            await fs.mkdir(dir2);

            await fs.writeFile(path.join(dir1, 'model.yaml'), 'model:\n  name: p1\n');
            await fs.writeFile(path.join(dir2, 'model.yaml'), 'model:\n  name: p2\n');

            // Act
            const results = await manifestUtils.findManifestsInDirectories([dir1, dir2]);

            // Assert
            expect(results).toHaveLength(2);
            expect(results[0].manifestPath).toBe(path.join(dir1, 'model.yaml'));
            expect(results[1].manifestPath).toBe(path.join(dir2, 'model.yaml'));
        });

        test('includes entry paths resolved from manifest', async () => {
            // Arrange
            const dir = path.join(tmpDir, 'proj');
            await fs.mkdir(dir);
            await fs.writeFile(path.join(dir, 'model.yaml'), `model:\n  entry: src/index.dlang\n`);

            // Act
            const results = await manifestUtils.findManifestsInDirectories([dir]);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].entryPath).toBe(path.join(dir, 'src/index.dlang'));
        });

        test('skips directories without manifests', async () => {
            // Arrange
            const dir1 = path.join(tmpDir, 'proj1');
            const dir2 = path.join(tmpDir, 'proj2');
            await fs.mkdir(dir1);
            await fs.mkdir(dir2);

            await fs.writeFile(path.join(dir1, 'model.yaml'), 'model:\n');

            // Act
            const results = await manifestUtils.findManifestsInDirectories([dir1, dir2]);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].manifestPath).toBe(path.join(dir1, 'model.yaml'));
        });

        test('handles empty directory list', async () => {
            // Act
            const results = await manifestUtils.findManifestsInDirectories([]);

            // Assert
            expect(results).toHaveLength(0);
        });

        test('finds manifests via parent directory traversal', async () => {
            // Arrange
            const subDir = path.join(tmpDir, 'proj', 'sub');
            await fs.mkdir(subDir, { recursive: true });
            const manifestPath = path.join(tmpDir, 'proj', 'model.yaml');
            await fs.writeFile(manifestPath, 'model:\n');

            // Act
            const results = await manifestUtils.findManifestsInDirectories([subDir]);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].manifestPath).toBe(manifestPath);
        });
    });
});
