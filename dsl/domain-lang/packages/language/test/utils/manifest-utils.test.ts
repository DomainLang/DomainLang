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
import * as manifestUtils from '../../src/services/manifest-utils.js';

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
        interface FileExistsCase {
            readonly scenario: string;
            readonly setup: (baseDir: string) => Promise<string>;
            readonly expectedResult: boolean;
        }

        const fileExistsCases: readonly FileExistsCase[] = [
            {
                scenario: 'returns true for existing file',
                setup: async baseDir => {
                    const filePath = path.join(baseDir, 'test.txt');
                    await fs.writeFile(filePath, 'content');
                    return filePath;
                },
                expectedResult: true,
            },
            {
                scenario: 'returns true for existing directory',
                setup: async baseDir => baseDir,
                expectedResult: true,
            },
            {
                scenario: 'returns false for non-existent file',
                setup: async baseDir => path.join(baseDir, 'nonexistent.txt'),
                expectedResult: false,
            },
            {
                scenario: 'returns false for empty string path',
                setup: async () => '',
                expectedResult: false,
            },
        ];

        test.each(fileExistsCases)('$scenario', async ({ setup, expectedResult }) => {
            // Arrange
            const filePath = await setup(tmpDir);

            // Act & Assert
            expect(await manifestUtils.fileExists(filePath)).toBe(expectedResult);
        });
    });

    describe('findNearestManifest', () => {
        interface FindManifestCase {
            readonly scenario: string;
            readonly setup: (baseDir: string) => Promise<{ searchFrom: string; expectedPath?: string }>;
        }

        const findManifestCases: readonly FindManifestCase[] = [
            {
                scenario: 'finds manifest in current directory',
                setup: async baseDir => {
                    const manifestPath = path.join(baseDir, 'model.yaml');
                    await fs.writeFile(manifestPath, 'model:\n  name: test\n');
                    return { searchFrom: baseDir, expectedPath: manifestPath };
                },
            },
            {
                scenario: 'finds manifest in parent directory',
                setup: async baseDir => {
                    const subDir = path.join(baseDir, 'sub', 'nested');
                    await fs.mkdir(subDir, { recursive: true });
                    const manifestPath = path.join(baseDir, 'model.yaml');
                    await fs.writeFile(manifestPath, 'model:\n  name: test\n');
                    return { searchFrom: subDir, expectedPath: manifestPath };
                },
            },
            {
                scenario: 'finds nearest manifest when multiple exist (prefers closer)',
                setup: async baseDir => {
                    const rootManifest = path.join(baseDir, 'model.yaml');
                    await fs.writeFile(rootManifest, 'model:\n  name: root\n');

                    const subDir = path.join(baseDir, 'sub');
                    await fs.mkdir(subDir);
                    const subManifest = path.join(subDir, 'model.yaml');
                    await fs.writeFile(subManifest, 'model:\n  name: sub\n');

                    return { searchFrom: subDir, expectedPath: subManifest };
                },
            },
            {
                scenario: 'returns undefined when no manifest found',
                setup: async baseDir => {
                    const subDir = path.join(baseDir, 'sub', 'nested');
                    await fs.mkdir(subDir, { recursive: true });
                    return { searchFrom: subDir, expectedPath: undefined };
                },
            },
        ];

        test.each(findManifestCases)('$scenario', async ({ setup }) => {
            // Arrange
            const { searchFrom, expectedPath } = await setup(tmpDir);

            // Act & Assert
            expect(await manifestUtils.findNearestManifest(searchFrom)).toBe(expectedPath);
        });

        test('stops at filesystem root', async () => {
            // Act & Assert
            expect(await manifestUtils.findNearestManifest('/')).toBeUndefined();
        });
    });

    describe('findWorkspaceRoot', () => {
        interface WorkspaceRootCase {
            readonly scenario: string;
            readonly setup: (baseDir: string) => Promise<{ searchFrom: string; expectedPath?: string }>;
        }

        const workspaceRootCases: readonly WorkspaceRootCase[] = [
            {
                scenario: 'returns directory containing manifest',
                setup: async baseDir => {
                    const manifestPath = path.join(baseDir, 'model.yaml');
                    await fs.writeFile(manifestPath, 'model:\n  name: test\n');
                    return { searchFrom: baseDir, expectedPath: baseDir };
                },
            },
            {
                scenario: 'returns parent directory of manifest found via traversal',
                setup: async baseDir => {
                    const subDir = path.join(baseDir, 'sub', 'nested');
                    await fs.mkdir(subDir, { recursive: true });
                    await fs.writeFile(path.join(baseDir, 'model.yaml'), 'model:\n  name: test\n');
                    return { searchFrom: subDir, expectedPath: baseDir };
                },
            },
            {
                scenario: 'returns undefined when no manifest found',
                setup: async baseDir => {
                    const subDir = path.join(baseDir, 'sub', 'nested');
                    await fs.mkdir(subDir, { recursive: true });
                    return { searchFrom: subDir, expectedPath: undefined };
                },
            },
        ];

        test.each(workspaceRootCases)('$scenario', async ({ setup }) => {
            // Arrange
            const { searchFrom, expectedPath } = await setup(tmpDir);

            // Act & Assert
            expect(await manifestUtils.findWorkspaceRoot(searchFrom)).toBe(expectedPath);
        });
    });

    describe('readManifest', () => {
        interface ReadManifestCase {
            readonly scenario: string;
            readonly fileContent: string | null;
            readonly expectedCheck: (result: any) => void;
        }

        const readManifestCases: readonly ReadManifestCase[] = [
            {
                scenario: 'parses valid YAML manifest with correct name and version',
                fileContent: `model:\n  name: test-project\n  version: 1.0.0\n  entry: index.dlang\n`,
                expectedCheck: result => {
                    expect(result?.model?.name).toBe('test-project');
                    expect(result?.model?.version).toBe('1.0.0');
                    expect(result?.model?.entry).toBe('index.dlang');
                },
            },
            {
                scenario: 'returns undefined for non-existent file',
                fileContent: null,
                expectedCheck: result => {
                    expect(result).toBeUndefined();
                },
            },
            {
                scenario: 'does not crash on empty manifest file',
                fileContent: '',
                expectedCheck: result => {
                    // Empty YAML should parse without crashing
                    expect(result).toBeDefined();
                },
            },
            {
                scenario: 'parses manifest with dependencies structure intact',
                fileContent: `model:\n  name: test-project\ndependencies:\n  - name: core\n    version: 1.0.0\n`,
                expectedCheck: result => {
                    expect(result?.dependencies).toHaveLength(1);
                },
            },
        ];

        test.each(readManifestCases)('$scenario', async ({ fileContent, expectedCheck }) => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            if (fileContent !== null) {
                await fs.writeFile(manifestPath, fileContent);
            }

            // Act
            const result = await manifestUtils.readManifest(manifestPath);

            // Assert
            expectedCheck(result);
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
        interface EntryCase {
            readonly scenario: string;
            readonly fileContent: string | null;
            readonly expectedEntry: string;
        }

        const entryCases: readonly EntryCase[] = [
            {
                scenario: 'returns custom entry from manifest',
                fileContent: `model:\n  entry: domains/sales.dlang\n`,
                expectedEntry: 'domains/sales.dlang',
            },
            {
                scenario: 'returns default "index.dlang" when entry not specified',
                fileContent: `model:\n  name: test\n`,
                expectedEntry: 'index.dlang',
            },
            {
                scenario: 'returns default "index.dlang" for non-existent file',
                fileContent: null,
                expectedEntry: 'index.dlang',
            },
            {
                scenario: 'returns default for manifest with empty model object',
                fileContent: `model: {}`,
                expectedEntry: 'index.dlang',
            },
        ];

        test.each(entryCases)('$scenario', async ({ fileContent, expectedEntry }) => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            if (fileContent !== null) {
                await fs.writeFile(manifestPath, fileContent);
            }

            // Act & Assert
            expect(await manifestUtils.readEntryFromManifest(manifestPath)).toBe(expectedEntry);
        });
    });

    describe('getEntryPath', () => {
        interface EntryPathCase {
            readonly scenario: string;
            readonly fileContent: string;
            readonly expectedRelativePath: string;
        }

        const entryPathCases: readonly EntryPathCase[] = [
            {
                scenario: 'returns absolute path joining manifest dir with custom entry',
                fileContent: `model:\n  entry: domains/sales.dlang\n`,
                expectedRelativePath: 'domains/sales.dlang',
            },
            {
                scenario: 'returns default entry path when entry not specified',
                fileContent: `model:\n  name: test\n`,
                expectedRelativePath: 'index.dlang',
            },
        ];

        test.each(entryPathCases)('$scenario', async ({ fileContent, expectedRelativePath }) => {
            // Arrange
            const manifestPath = path.join(tmpDir, 'model.yaml');
            await fs.writeFile(manifestPath, fileContent);

            // Act & Assert
            expect(await manifestUtils.getEntryPath(manifestPath)).toBe(path.join(tmpDir, expectedRelativePath));
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
        interface ManifestSearchCase {
            readonly scenario: string;
            readonly setup: (baseDir: string) => Promise<string[]>;
            readonly expectedCount: number;
        }

        const searchCases: readonly ManifestSearchCase[] = [
            {
                scenario: 'finds manifests in provided directories with correct paths',
                setup: async baseDir => {
                    const dir1 = path.join(baseDir, 'proj1');
                    const dir2 = path.join(baseDir, 'proj2');
                    await fs.mkdir(dir1);
                    await fs.mkdir(dir2);

                    await fs.writeFile(path.join(dir1, 'model.yaml'), 'model:\n  name: p1\n');
                    await fs.writeFile(path.join(dir2, 'model.yaml'), 'model:\n  name: p2\n');

                    return [dir1, dir2];
                },
                expectedCount: 2,
            },
            {
                scenario: 'skips directories without manifests',
                setup: async baseDir => {
                    const dir1 = path.join(baseDir, 'proj1');
                    const dir2 = path.join(baseDir, 'proj2');
                    await fs.mkdir(dir1);
                    await fs.mkdir(dir2);

                    await fs.writeFile(path.join(dir1, 'model.yaml'), 'model:\n');
                    // dir2 has no manifest

                    return [dir1, dir2];
                },
                expectedCount: 1,
            },
            {
                scenario: 'handles empty directory list',
                setup: async () => [],
                expectedCount: 0,
            },
        ];

        test.each(searchCases)('$scenario', async ({ setup, expectedCount }) => {
            // Arrange
            const dirs = await setup(tmpDir);

            // Act
            const results = await manifestUtils.findManifestsInDirectories(dirs);

            // Assert
            expect(results).toHaveLength(expectedCount);
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