/**
 * Tests for cache-clear command.
 * 
 * This file uses dependency injection to test filesystem operations
 * instead of mocking node:fs (which causes OOM in Vitest forks pool).
 * 
 * The core functions (clearCache, calculateDirectorySize, countPackages) 
 * accept an optional FileSystemService parameter for testing.
 * Component tests that need the default filesystem are handled via 
 * mocking clearCache at the module level.
 * 
 * @module commands/cache-clear.test
 */
import { describe, test, expect, beforeEach, vi, type MockInstance } from 'vitest';
import { render, flushAsync } from '../../src/test-utils/index.js';
import { 
    CacheClear, 
    runCacheClear, 
    calculateDirectorySize,
    countPackages,
    type CacheClearProps, 
    type CacheClearResult,
} from '../../src/commands/cache-clear.js';
import { PackageCache } from '../../src/services/package-cache.js';
import type { FileSystemService, DirEntry } from '../../src/services/filesystem.js';

// Only mock PackageCache - NOT node:fs!
vi.mock('../../src/services/package-cache.js');

// Mock clearCache for component tests (so they don't hit real filesystem)
const mockClearCacheResult: CacheClearResult = { packagesRemoved: 0, bytesFreed: 0 };
vi.mock('../../src/commands/cache-clear.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/commands/cache-clear.js')>();
    return {
        ...actual,
        // Override clearCache to return mock result in component tests
        clearCache: vi.fn(async () => mockClearCacheResult),
    };
});

/**
 * Create a mock FileSystemService for testing.
 */
function createMockFs(overrides: Partial<FileSystemService> = {}): FileSystemService {
    return {
        existsSync: vi.fn(() => true),
        readdir: vi.fn(async () => []),
        stat: vi.fn(async () => ({ size: 0 })),
        ...overrides,
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

// Get the mocked defaultFileSystem for component tests
let mockDefaultFs: FileSystemService;

beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get fresh reference to the mocked defaultFileSystem
    const fsModule = await import('../../src/services/filesystem.js');
    mockDefaultFs = fsModule.defaultFileSystem;
    
    // Reset default implementations
    vi.mocked(mockDefaultFs.existsSync).mockReturnValue(true);
    vi.mocked(mockDefaultFs.readdir).mockResolvedValue([]);
    vi.mocked(mockDefaultFs.stat).mockResolvedValue({ size: 0 });
    vi.mocked(PackageCache.prototype.clear).mockResolvedValue(undefined);
});

describe('CacheClear command component', () => {
    const mockContext: CacheClearProps['context'] = {
        mode: 'rich',
        version: '0.1.0',
        isFirstRun: false,
        noColor: false,
        cwd: '/test/project',
    };

    test('shows loading state initially', () => {
        // Arrange
        const props: CacheClearProps = { context: mockContext };

        //Act
        const { lastFrame } = render(<CacheClear {...props} />);

        // Assert
        const frame = lastFrame();
        expect(frame).toContain('Clearing');
    });

    test('shows success message after clearing cache', async () => {
        // Arrange
        vi.mocked(mockDefaultFs.existsSync).mockReturnValue(true);
        vi.mocked(mockDefaultFs.readdir).mockImplementation(async (path: string) => {
            if (path.includes('.dlang/packages') && !path.includes('owner')) {
                return [createDirEntry('owner', true)];
            }
            if (path.includes('owner') && !path.includes('repo')) {
                return [createDirEntry('repo', true)];
            }
            return [createDirEntry('commit123', true)];
        });
        vi.mocked(mockDefaultFs.stat).mockResolvedValue({ size: 1024 });
        
        const props: CacheClearProps = { context: mockContext };

        // Act
        const { lastFrame } = render(<CacheClear {...props} />);
        await flushAsync();

        // Assert
        const frame = lastFrame();
        expect(frame).toContain('Cache cleared');
    });

    test('shows zero packages when cache does not exist', async () => {
        // Arrange
        vi.mocked(mockDefaultFs.existsSync).mockReturnValue(false);
        const props: CacheClearProps = { context: mockContext };

        // Act
        const { lastFrame } = render(<CacheClear {...props} />);
        await flushAsync();

        // Assert
        const frame = lastFrame();
        expect(frame).toContain('0 packages');
    });

    test('shows error message when clearing fails', async () => {
        // Arrange
        const errorMessage = 'Permission denied';
        vi.mocked(PackageCache.prototype.clear).mockRejectedValue(new Error(errorMessage));
        const props: CacheClearProps = { context: mockContext };

        // Act
        const { lastFrame } = render(<CacheClear {...props} />);
        await flushAsync();

        // Assert
        const frame = lastFrame();
        expect(frame).toContain(errorMessage);
    });
});

describe('clearCache function', () => {
    test('calculates size and count before clearing', async () => {
        // Arrange
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async (path: string) => {
                if (path.includes('packages') && !path.includes('owner')) {
                    return [createDirEntry('owner', true)];
                }
                if (path.includes('owner') && !path.includes('repo')) {
                    return [createDirEntry('repo', true)];
                }
                if (path.includes('repo')) {
                    return [createDirEntry('file.txt', false)];
                }
                return [];
            }),
            stat: vi.fn(async () => ({ size: 2048 })),
        });

        // Act
        const result = await clearCache('/workspace', mockFs);

        // Assert
        expect(result.packagesRemoved).toBe(0); // No commit directories
        expect(result.bytesFreed).toBe(2048);
        expect(PackageCache.prototype.clear).toHaveBeenCalled();
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
    });
});

describe('calculateDirectorySize function', () => {
    test('returns 0 for non-existent directory', async () => {
        // Arrange
        const mockFs = createMockFs({
            existsSync: vi.fn(() => false),
        });

        // Act
        const size = await calculateDirectorySize('/nonexistent', mockFs);

        // Assert
        expect(size).toBe(0);
    });

    test('calculates size of files recursively', async () => {
        // Arrange
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
            stat: vi.fn(async () => ({ size: 100 })),
        });

        // Act
        const size = await calculateDirectorySize('/dir', mockFs);

        // Assert
        expect(size).toBe(200); // 2 files * 100 bytes each
    });

    test('ignores errors in subdirectories', async () => {
        // Arrange
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async () => {
                throw new Error('Permission denied');
            }),
        });

        // Act
        const size = await calculateDirectorySize('/dir', mockFs);

        // Assert
        expect(size).toBe(0);
    });
});

describe('countPackages function', () => {
    test('returns 0 for non-existent directory', async () => {
        // Arrange
        const mockFs = createMockFs({
            existsSync: vi.fn(() => false),
        });

        // Act
        const count = await countPackages('/nonexistent', mockFs);

        // Assert
        expect(count).toBe(0);
    });

    test('counts commit directories at owner/repo/commit level', async () => {
        // Arrange
        const mockFs = createMockFs({
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async (path: string) => {
                if (path === '/packages') {
                    return [createDirEntry('owner1', true)];
                }
                if (path === '/packages/owner1') {
                    return [createDirEntry('repo1', true), createDirEntry('repo2', true)];
                }
                if (path.includes('repo')) {
                    return [createDirEntry('abc123', true), createDirEntry('def456', true)];
                }
                return [];
            }),
        });

        // Act
        const count = await countPackages('/packages', mockFs);

        // Assert
        expect(count).toBe(4); // 2 repos * 2 commits each
    });

    test('ignores hidden directories', async () => {
        // Arrange
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

        // Act
        const count = await countPackages('/packages', mockFs);

        // Assert
        expect(count).toBe(1); // Only the non-hidden owner counted
    });
});

describe('runCacheClear function', () => {
    const mockContext = {
        mode: 'rich' as const,
        version: '0.1.0',
        isFirstRun: false,
        noColor: false,
        cwd: '/test/project',
    };

    let writeStdout: MockInstance;
    let writeStderr: MockInstance;
    let exitSpy: MockInstance;

    beforeEach(() => {
        // runCacheClear → runDirect calls process.exit() and process.stdout.write().
        // We must intercept process.exit to prevent killing the forks worker.
        writeStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        writeStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('exit');
        });
    });

    test('clears cache successfully in rich mode', async () => {
        // Arrange
        vi.mocked(mockDefaultFs.existsSync).mockReturnValue(true);
        vi.mocked(mockDefaultFs.readdir).mockResolvedValue([]);

        // Act — rich mode uses runDirect which calls process.exit
        try {
            await runCacheClear(mockContext);
        } catch { /* expected: process.exit throws */ }

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(PackageCache.prototype.clear).toHaveBeenCalled();
    });

    test('returns JSON output in json mode', async () => {
        // Arrange
        const jsonContext = { ...mockContext, mode: 'json' as const };
        vi.mocked(mockDefaultFs.existsSync).mockReturnValue(true);
        vi.mocked(mockDefaultFs.readdir).mockResolvedValue([]);

        // Act
        try {
            await runCacheClear(jsonContext);
        } catch { /* expected: process.exit throws */ }

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(writeStdout).toHaveBeenCalledWith(
            expect.stringContaining('"success":true')
        );
    });

    test('works in quiet mode', async () => {
        // Arrange
        const quietContext = { ...mockContext, mode: 'quiet' as const };
        vi.mocked(mockDefaultFs.existsSync).mockReturnValue(false);

        // Act
        try {
            await runCacheClear(quietContext);
        } catch { /* expected: process.exit throws */ }

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    test('exits with code 1 when cache clear fails', async () => {
        // Arrange
        const errorMessage = 'Cache clear failed';
        vi.mocked(PackageCache.prototype.clear).mockRejectedValue(new Error(errorMessage));

        // Act
        try {
            await runCacheClear(mockContext);
        } catch { /* expected: process.exit throws */ }

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(writeStderr).toHaveBeenCalledWith(
            expect.stringContaining(errorMessage)
        );
    });
});
