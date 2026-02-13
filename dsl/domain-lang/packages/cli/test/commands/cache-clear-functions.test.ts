/**
 * Tests for cache-clear core functions.
 * 
 * Uses dependency injection to test filesystem operations without mocking node:fs.
 * Each function accepts an optional FileSystemService parameter for testing.
 * 
 * @module commands/cache-clear-functions.test
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { 
    calculateDirectorySize,
    countPackages,
    clearCache,
} from '../../src/commands/cache-clear.js';
import { PackageCache } from '../../src/services/package-cache.js';
import type { FileSystemService, DirEntry, FileStats } from '../../src/services/filesystem.js';

// Mock PackageCache at the TOP LEVEL (not inside describe)
// This is required because vi.mock is hoisted and must be set up before module load
vi.mock('../../src/services/package-cache.js');

let mockCacheClear: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
    mockCacheClear = vi.fn(async () => undefined);

    vi.mocked(PackageCache).mockImplementation(class {
        clear = mockCacheClear;
    } as any);
});

/**
 * Create a mock FileSystemService for testing.
 */
function createMockFs(overrides: Partial<FileSystemService> = {}): FileSystemService {
    const defaultStats = {
        size: 0,
        isDirectory: () => false,
        isFile: () => true,
        mtime: new Date(),
    };
    return {
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => ''),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        createWriteStream: vi.fn(() => ({
            write: vi.fn(() => true),
            end: vi.fn(),
            on: vi.fn().mockReturnThis(),
            close: vi.fn(),
        })),
        readFile: vi.fn(async () => ''),
        writeFile: vi.fn(async () => undefined),
        readdir: vi.fn(async () => []),
        stat: vi.fn(async () => defaultStats),
        mkdir: vi.fn(async () => undefined),
        rm: vi.fn(async () => undefined),
        rmdir: vi.fn(async () => undefined),
        rename: vi.fn(async () => undefined),
        unlink: vi.fn(async () => undefined),
        copyFile: vi.fn(async () => undefined),
        ...overrides,
    };
}

/**
 * Create a FileStats for testing.
 */
function createFileStats(size: number): FileStats {
    return {
        size,
        isDirectory: () => false,
        isFile: () => true,
        mtime: new Date(),
    };
}

/**
 * Create a DirEntry for testing.
 */
function createDirEntry(name: string, isDir: boolean): DirEntry {
    return {
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
    };
}

describe('calculateDirectorySize', () => {
    test('returns 0 for non-existent directory', async () => {
        const mockFs = createMockFs({
            existsSync: vi.fn(() => false),
        });

        const size = await calculateDirectorySize('/nonexistent', mockFs);

        expect(size).toBe(0);
    });

    test('calculates size of single file', async () => {
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async () => [createDirEntry('file.txt', false)]),
            stat: vi.fn(async () => createFileStats(1024)),
        });

        const size = await calculateDirectorySize('/dir', mockFs);

        expect(size).toBe(1024);
    });

    test('calculates size of files recursively', async () => {
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async (path: string) => {
                if (path === '/dir') {
                    return [
                        createDirEntry('file1.txt', false),
                        createDirEntry('subdir', true),
                    ];
                }
                if (path === '/dir/subdir') {
                    return [createDirEntry('file2.txt', false)];
                }
                return [];
            }),
            stat: vi.fn(async () => createFileStats(100)),
        });

        const size = await calculateDirectorySize('/dir', mockFs);

        expect(size).toBe(200); // 2 files * 100 bytes
    });

    test('ignores errors in subdirectories', async () => {
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async () => {
                throw new Error('Permission denied');
            }),
        });

        const size = await calculateDirectorySize('/dir', mockFs);

        expect(size).toBe(0);
    });

    test('only counts files, not directories', async () => {
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async (path: string) => {
                // MUST use exact path matching to prevent infinite recursion!
                if (path === '/dir') {
                    return [
                        createDirEntry('emptydir', true),
                        createDirEntry('file.txt', false),
                    ];
                }
                // /dir/emptydir is an empty directory
                return [];
            }),
            stat: vi.fn(async () => createFileStats(500)),
        });

        const size = await calculateDirectorySize('/dir', mockFs);

        // Only the file should be counted, empty dir has no child files
        expect(size).toBe(500);
    });
});

describe('countPackages', () => {
    test('returns 0 for non-existent directory', async () => {
        const mockFs = createMockFs({
            existsSync: vi.fn(() => false),
        });

        const count = await countPackages('/nonexistent', mockFs);

        expect(count).toBe(0);
    });

    test('counts commit directories at owner/repo/commit level', async () => {
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async (path: string) => {
                if (path === '/packages') {
                    return [createDirEntry('owner1', true)];
                }
                if (path === '/packages/owner1') {
                    return [
                        createDirEntry('repo1', true), 
                        createDirEntry('repo2', true),
                    ];
                }
                // Each repo has 2 commits
                return [
                    createDirEntry('abc123', true), 
                    createDirEntry('def456', true),
                ];
            }),
        });

        const count = await countPackages('/packages', mockFs);

        expect(count).toBe(4); // 2 repos * 2 commits each
    });

    test('ignores hidden directories', async () => {
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async (path: string) => {
                if (path === '/packages') {
                    return [
                        createDirEntry('.hidden', true),
                        createDirEntry('owner', true),
                    ];
                }
                if (path === '/packages/owner') {
                    return [createDirEntry('repo', true)];
                }
                return [createDirEntry('commit', true)];
            }),
        });

        const count = await countPackages('/packages', mockFs);

        expect(count).toBe(1); // Hidden owner ignored
    });

    test('ignores files in owner directory', async () => {
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async (path: string) => {
                if (path === '/packages') {
                    return [
                        createDirEntry('owner', true),
                        createDirEntry('metadata.json', false), // File, should be ignored
                    ];
                }
                if (path === '/packages/owner') {
                    return [createDirEntry('repo', true)];
                }
                return [createDirEntry('commit', true)];
            }),
        });

        const count = await countPackages('/packages', mockFs);

        expect(count).toBe(1);
    });

    test('ignores errors', async () => {
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async () => {
                throw new Error('Permission denied');
            }),
        });

        const count = await countPackages('/packages', mockFs);

        expect(count).toBe(0);
    });
});

describe('clearCache', () => {
    test('calculates size and count before clearing', async () => {
        // Arrange
        // Use EXACT path matching to prevent infinite recursion
        // Broad includes() checks caused OOM by matching recursive subdirectory calls
        const packagesPath = '/workspace/.dlang/packages';
        const ownerPath = `${packagesPath}/owner`;
        const repoPath = `${ownerPath}/repo`;
        
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async (path: string) => {
                if (path === packagesPath) {
                    return [createDirEntry('owner', true)];
                }
                if (path === ownerPath) {
                    return [createDirEntry('repo', true)];
                }
                if (path === repoPath) {
                    return [createDirEntry('commit', true)];
                }
                return []; // Empty for any other path
            }),
            stat: vi.fn(async () => createFileStats(0)),
        });

        // Act
        const result = await clearCache('/workspace', mockFs);

        // Assert
        expect(result.packagesRemoved).toBe(1);
        expect(result.bytesFreed).toBe(0);
        expect(PackageCache).toHaveBeenCalledWith('/workspace');
        expect(mockCacheClear).toHaveBeenCalledTimes(1);
    });

    test('returns zero when cache directory does not exist', async () => {
        // Arrange
        const mockFs = createMockFs({
            existsSync: vi.fn(() => false),
        });

        // Act
        const result = await clearCache('/workspace', mockFs);

        // Assert
        expect(result.packagesRemoved).toBe(0);
        expect(result.bytesFreed).toBe(0);
        expect(PackageCache).toHaveBeenCalledWith('/workspace');
        expect(mockCacheClear).toHaveBeenCalledTimes(1);
    });

    test('calculates bytes freed from files', async () => {
        // Arrange
        // Use EXACT path matching to prevent infinite recursion
        const packagesPath = '/workspace/.dlang/packages';
        const ownerPath = `${packagesPath}/owner`;
        const repoPath = `${ownerPath}/repo`;
        const commitPath = `${repoPath}/commit`;
        
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async (path: string) => {
                if (path === packagesPath) {
                    return [createDirEntry('owner', true)];
                }
                if (path === ownerPath) {
                    return [createDirEntry('repo', true)];
                }
                if (path === repoPath) {
                    return [
                        createDirEntry('commit', true),
                        createDirEntry('data.json', false),
                    ];
                }
                if (path === commitPath) {
                    return []; // Empty commit dir
                }
                return [];
            }),
            stat: vi.fn(async () => createFileStats(2048)),
        });

        // Act
        const result = await clearCache('/workspace', mockFs);

        // Assert
        expect(result.bytesFreed).toBe(2048);
        expect(PackageCache).toHaveBeenCalledWith('/workspace');
        expect(mockCacheClear).toHaveBeenCalledTimes(1);
    });
});
