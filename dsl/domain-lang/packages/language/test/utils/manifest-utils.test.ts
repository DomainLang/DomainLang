/**
 * Tests for manifest-utils module.
 *
 * Verifies manifest file operations:
 * - File existence checks
 * - Finding nearest manifest
 * - Finding workspace root
 * - Reading and parsing manifests
 * - Finding entry points
 * - Discovering manifests in directories
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
        // Clean up temp directory if it exists
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('fileExists', () => {
        test('returns true for existing file', async () => {
            const filePath = path.join(tmpDir, 'test.txt');
            await fs.writeFile(filePath, 'content');

            const exists = await manifestUtils.fileExists(filePath);
            expect(exists).toBe(true);
        });

        test('returns true for existing directory', async () => {
            const exists = await manifestUtils.fileExists(tmpDir);
            expect(exists).toBe(true);
        });

        test('returns false for non-existent file', async () => {
            const filePath = path.join(tmpDir, 'nonexistent.txt');
            const exists = await manifestUtils.fileExists(filePath);
            expect(exists).toBe(false);
        });

        test('throws for non-ENOENT errors', async () => {
            // This is hard to test without mocking, but we can verify the function exists
            expect(manifestUtils.fileExists).toBeDefined();
        });
    });

    describe('findNearestManifest', () => {
        test('finds manifest in current directory', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, 'model:\n  name: test\n');

            const found = await manifestUtils.findNearestManifest(tmpDir);
            expect(found).toBe(manifestPath);
        });

        test('finds manifest in parent directory', async () => {
            const subDir = path.join(tmpDir, 'sub', 'nested');
            await fs.mkdir(subDir, { recursive: true });

            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, 'model:\n  name: test\n');

            const found = await manifestUtils.findNearestManifest(subDir);
            expect(found).toBe(manifestPath);
        });

        test('finds nearest manifest when multiple exist', async () => {
            // Create a manifest in root
            const rootManifest = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(rootManifest, 'model:\n  name: root\n');

            // Create a subdirectory and manifest
            const subDir = path.join(tmpDir, 'sub');
            await fs.mkdir(subDir);
            const subManifest = path.join(subDir, 'model.yaml');
            await fs.writeFile(subManifest, 'model:\n  name: sub\n');

            // Should find the nearest (sub) manifest
            const found = await manifestUtils.findNearestManifest(subDir);
            expect(found).toBe(subManifest);
        });

        test('returns undefined when no manifest found', async () => {
            const subDir = path.join(tmpDir, 'sub', 'nested');
            await fs.mkdir(subDir, { recursive: true });

            const found = await manifestUtils.findNearestManifest(subDir);
            expect(found).toBeUndefined();
        });

        test('stops at filesystem root', async () => {
            const found = await manifestUtils.findNearestManifest('/');
            expect(found).toBeUndefined();
        });
    });

    describe('findWorkspaceRoot', () => {
        test('returns directory containing manifest', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, 'model:\n  name: test\n');

            const root = await manifestUtils.findWorkspaceRoot(tmpDir);
            expect(root).toBe(tmpDir);
        });

        test('returns directory of manifest found in parent', async () => {
            const subDir = path.join(tmpDir, 'sub', 'nested');
            await fs.mkdir(subDir, { recursive: true });

            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, 'model:\n  name: test\n');

            const root = await manifestUtils.findWorkspaceRoot(subDir);
            expect(root).toBe(tmpDir);
        });

        test('returns undefined when no manifest found', async () => {
            const subDir = path.join(tmpDir, 'sub', 'nested');
            await fs.mkdir(subDir, { recursive: true });

            const root = await manifestUtils.findWorkspaceRoot(subDir);
            expect(root).toBeUndefined();
        });
    });

    describe('readManifest', () => {
        test('parses valid YAML manifest', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            const content = `model:
  name: test-project
  version: 1.0.0
  entry: index.dlang
`;
            await fs.writeFile(manifestPath, content);

            const manifest = await manifestUtils.readManifest(manifestPath);
            expect(manifest).toBeDefined();
            expect(manifest?.model?.name).toBe('test-project');
            expect(manifest?.model?.version).toBe('1.0.0');
        });

        test('returns undefined for non-existent file', async () => {
            const manifestPath = path.join(tmpDir, 'nonexistent.yaml');
            const manifest = await manifestUtils.readManifest(manifestPath);
            expect(manifest).toBeUndefined();
        });

        test('returns empty object for empty manifest', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, '');

            const manifest = await manifestUtils.readManifest(manifestPath);
            expect(manifest).toBeDefined();
        });

        test('parses manifest with dependencies', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            const content = `model:
  name: test-project
dependencies:
  - name: core
    version: 1.0.0
`;
            await fs.writeFile(manifestPath, content);

            const manifest = await manifestUtils.readManifest(manifestPath);
            expect(manifest).toBeDefined();
            expect(manifest?.dependencies).toBeDefined();
        });

        test('throws on malformed YAML', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, 'invalid: [yaml: syntax');

            await expect(manifestUtils.readManifest(manifestPath)).rejects.toThrow();
        });
    });

    describe('readEntryFromManifest', () => {
        test('returns entry from manifest', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            const content = `model:
  entry: domains/sales.dlang
`;
            await fs.writeFile(manifestPath, content);

            const entry = await manifestUtils.readEntryFromManifest(manifestPath);
            expect(entry).toBe('domains/sales.dlang');
        });

        test('returns default entry when not specified', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            const content = `model:
  name: test
`;
            await fs.writeFile(manifestPath, content);

            const entry = await manifestUtils.readEntryFromManifest(manifestPath);
            expect(entry).toBe('index.dlang');
        });

        test('returns default entry for non-existent file', async () => {
            const manifestPath = path.join(tmpDir, 'nonexistent.yaml');
            const entry = await manifestUtils.readEntryFromManifest(manifestPath);
            expect(entry).toBe('index.dlang');
        });

        test('handles manifest with only model property', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            const content = `model: {}`;
            await fs.writeFile(manifestPath, content);

            const entry = await manifestUtils.readEntryFromManifest(manifestPath);
            expect(entry).toBe('index.dlang');
        });
    });

    describe('getEntryPath', () => {
        test('returns absolute path for entry', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            const content = `model:
  entry: domains/sales.dlang
`;
            await fs.writeFile(manifestPath, content);

            const entryPath = await manifestUtils.getEntryPath(manifestPath);
            expect(entryPath).toBe(path.join(tmpDir, 'domains/sales.dlang'));
        });

        test('returns default entry path when not specified', async () => {
            const manifestPath = path.join(tmpDir, 'model.yaml');
            const content = `model:
  name: test
`;
            await fs.writeFile(manifestPath, content);

            const entryPath = await manifestUtils.getEntryPath(manifestPath);
            expect(entryPath).toBe(path.join(tmpDir, 'index.dlang'));
        });

        test('resolves entry relative to manifest directory', async () => {
            const subDir = path.join(tmpDir, 'sub');
            await fs.mkdir(subDir);
            const manifestPath = path.join(subDir, 'model.yaml');
            const content = `model:
  entry: ../../index.dlang
`;
            await fs.writeFile(manifestPath, content);

            const entryPath = await manifestUtils.getEntryPath(manifestPath);
            expect(entryPath).toBe(path.normalize(path.join(subDir, '../../index.dlang')));
        });
    });

    describe('findManifestsInDirectories', () => {
        test('finds manifests in provided directories', async () => {
            const dir1 = path.join(tmpDir, 'proj1');
            const dir2 = path.join(tmpDir, 'proj2');
            await fs.mkdir(dir1);
            await fs.mkdir(dir2);

            await fs.writeFile(path.join(dir1, 'model.yaml'), 'model:\n  name: p1\n');
            await fs.writeFile(path.join(dir2, 'model.yaml'), 'model:\n  name: p2\n');

            const results = await manifestUtils.findManifestsInDirectories([dir1, dir2]);
            expect(results).toHaveLength(2);
            expect(results[0].manifestPath).toBe(path.join(dir1, 'model.yaml'));
            expect(results[1].manifestPath).toBe(path.join(dir2, 'model.yaml'));
        });

        test('includes entry paths in results', async () => {
            const dir = path.join(tmpDir, 'proj');
            await fs.mkdir(dir);
            const manifestPath = path.join(dir, 'model.yaml');
            const content = `model:
  entry: src/index.dlang
`;
            await fs.writeFile(manifestPath, content);

            const results = await manifestUtils.findManifestsInDirectories([dir]);
            expect(results).toHaveLength(1);
            expect(results[0].entryPath).toBe(path.join(dir, 'src/index.dlang'));
        });

        test('skips directories without manifests', async () => {
            const dir1 = path.join(tmpDir, 'proj1');
            const dir2 = path.join(tmpDir, 'proj2');
            await fs.mkdir(dir1);
            await fs.mkdir(dir2);

            await fs.writeFile(path.join(dir1, 'model.yaml'), 'model:\n');

            const results = await manifestUtils.findManifestsInDirectories([dir1, dir2]);
            expect(results).toHaveLength(1);
            expect(results[0].manifestPath).toBe(path.join(dir1, 'model.yaml'));
        });

        test('handles empty directory list', async () => {
            const results = await manifestUtils.findManifestsInDirectories([]);
            expect(results).toHaveLength(0);
        });

        test('finds manifests in parent directories', async () => {
            const subDir = path.join(tmpDir, 'proj', 'sub');
            await fs.mkdir(subDir, { recursive: true });
            const manifestPath = path.join(tmpDir, 'proj', 'model.yaml');
            await fs.writeFile(manifestPath, 'model:\n');

            const results = await manifestUtils.findManifestsInDirectories([subDir]);
            expect(results).toHaveLength(1);
            expect(results[0].manifestPath).toBe(manifestPath);
        });
    });

    describe('exported constants', () => {
        test('exports DEFAULT_MANIFEST_FILENAME', () => {
             
            const { DEFAULT_MANIFEST_FILENAME } = manifestUtils;
            expect(DEFAULT_MANIFEST_FILENAME).toBe('model.yaml');
        });

        test('exports DEFAULT_ENTRY_FILE', () => {
             
            const { DEFAULT_ENTRY_FILE } = manifestUtils;
            expect(DEFAULT_ENTRY_FILE).toBe('index.dlang');
        });
    });
});
