/**
 * Tests for cache-clear command.
 * 
 * @module commands/cache-clear.test
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, flushAsync } from '../../src/test-utils/index.js';
import { CacheClear, runCacheClear, type CacheClearProps } from '../../src/commands/cache-clear.js';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { PackageCache } from '../../src/services/package-cache.js';

// Mock filesystem operations
vi.mock('node:fs/promises');
vi.mock('node:fs');
vi.mock('../../src/services/package-cache.js');

describe('CacheClear command component', () => {
    const mockContext: CacheClearProps['context'] = {
        mode: 'rich',
        version: '0.1.0',
        isFirstRun: false,
        noColor: false,
        cwd: '/test/project',
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock implementations
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(PackageCache.prototype.clear).mockResolvedValue(undefined);
        vi.mocked(fs.readdir).mockResolvedValue([]);
        vi.mocked(fs.stat).mockResolvedValue({ size: 0 } as any);
    });

    test('shows loading state initially', () => {
        // Arrange
        const props: CacheClearProps = { context: mockContext };

        //Act
        const { lastFrame } = render(<CacheClear {...props} />);

        // Assert
        const frame = lastFrame();
        expect(frame).toContain('Clearing package cache');
    });

    test('shows success message after clearing cache', async () => {
        // Arrange
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
            if (path.includes('.dlang/packages') && !path.includes('/')) {
                return [{ name: 'owner', isDirectory: () => true }] as any;
            }
            if (path.includes('owner')) {
                return [{ name: 'repo', isDirectory: () => true }] as any;
            }
            return [{ name: 'commit123', isDirectory: () => true }] as any;
        });
        vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
        
        const props: CacheClearProps = { context: mockContext };

        // Act
        const { lastFrame } = render(<CacheClear {...props} />);
        await flushAsync();

        // Assert
        const frame = lastFrame();
        expect(frame).toContain('✓');
        expect(frame).toContain('Cache cleared successfully');
        expect(frame).toContain('1 package');
    });

    test('shows empty cache message when cache does not exist', async () => {
        // Arrange
        vi.mocked(existsSync).mockReturnValue(false);
        const props: CacheClearProps = { context: mockContext };

        // Act
        const { lastFrame } = render(<CacheClear {...props} />);
        await flushAsync();

        // Assert
        const frame = lastFrame();
        expect(frame).toContain('Cache is already empty');
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
        expect(frame).toContain('✗');
        expect(frame).toContain('Failed to clear cache');
        expect(frame).toContain(errorMessage);
    });

    test('outputs JSON when mode is json', async () => {
        // Arrange
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
            if (path.includes('.dlang/packages') && !path.includes('/')) {
                return [{ name: 'owner', isDirectory: () => true }] as any;
            }
            if (path.includes('owner')) {
                return [{ name: 'repo', isDirectory: () => true }] as any;
            }
            return [{ name: 'commit', isDirectory: () => true }] as any;
        });
        vi.mocked(fs.stat).mockResolvedValue({ size: 2048 } as any);
        
        const props: CacheClearProps = { 
            context: { ...mockContext, mode: 'json' } 
        };

        // Act
        const { lastFrame } = render(<CacheClear {...props} />);
        await flushAsync();

        // Assert
        const frame = lastFrame();
        const json = JSON.parse(frame!);
        expect(json).toHaveProperty('success', true);
        expect(json).toHaveProperty('packagesRemoved');
        expect(json).toHaveProperty('bytesFreed');
    });

    test('outputs nothing in quiet mode', async () => {
        // Arrange
        vi.mocked(existsSync).mockReturnValue(true);
        const props: CacheClearProps = { 
            context: { ...mockContext, mode: 'quiet' } 
        };

        // Act
        const { lastFrame } = render(<CacheClear {...props} />);
        await flushAsync();

        // Assert
        const frame = lastFrame();
        expect(frame).toBe('');
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

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(PackageCache.prototype.clear).mockResolvedValue(undefined);
        vi.mocked(fs.readdir).mockResolvedValue([]);
        vi.mocked(fs.stat).mockResolvedValue({ size: 0 } as any);
    });

    test('clears cache successfully in rich mode', async () => {
        // Arrange
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
            if (path.includes('.dlang/packages') && !path.includes('/')) {
                return [{ name: 'owner', isDirectory: () => true }] as any;
            }
            if (path.includes('owner')) {
                return [{ name: 'repo', isDirectory: () => true }] as any;
            }
            return [{ name: 'commit', isDirectory: () => true }] as any;
        });
        vi.mocked(fs.stat).mockResolvedValue({ size: 512 } as any);

        // Act
        const result = await runCacheClear(mockContext);

        // Assert
        expect(result).toEqual({
            success: true,
            packagesRemoved: 1,
            bytesFreed: 512,
        });
        expect(PackageCache.prototype.clear).toHaveBeenCalled();
    });

    test('returns JSON output in json mode', async () => {
        // Arrange
        const jsonContext = { ...mockContext, mode: 'json' as const };
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(fs.readdir).mockResolvedValue([]);

        // Act
        const result = await runCacheClear(jsonContext);

        // Assert
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('packagesRemoved');
        expect(result).toHaveProperty('bytesFreed');
    });

    test('works in quiet mode', async () => {
        // Arrange
        const quietContext = { ...mockContext, mode: 'quiet' as const };
        vi.mocked(existsSync).mockReturnValue(false);

        // Act
        const result = await runCacheClear(quietContext);

        // Assert
        expect(result).toEqual({
            success: true,
            packagesRemoved: 0,
            bytesFreed: 0,
        });
    });

    test('throws error when cache clear fails', async () => {
        // Arrange
        const errorMessage = 'Cache clear failed';
        vi.mocked(PackageCache.prototype.clear).mockRejectedValue(new Error(errorMessage));

        // Act & Assert
        await expect(runCacheClear(mockContext)).rejects.toThrow(errorMessage);
    });
});
