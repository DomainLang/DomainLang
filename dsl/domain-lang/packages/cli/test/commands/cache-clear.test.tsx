/**
 * Tests for cache-clear command component and runCacheClear function.
 * 
 * This file tests the React component and CLI runner.
 * Core function tests (calculateDirectorySize, countPackages, clearCache)
 * are in cache-clear-functions.test.ts which uses dependency injection.
 * 
 * @module commands/cache-clear.test
 */
import { describe, test, expect, beforeEach, vi, type MockInstance } from 'vitest';
import React from 'react';
import { render, flushAsync } from '../../src/test-utils/index.js';
import { CacheClear, runCacheClear, type CacheClearProps } from '../../src/commands/cache-clear.js';
import { PackageCache } from '../../src/services/package-cache.js';

// Mock PackageCache
vi.mock('../../src/services/package-cache.js');

// Mock the filesystem service to avoid real fs operations and prevent OOM
// This replaces the defaultFileSystem singleton with a mock object
vi.mock('../../src/services/filesystem.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/services/filesystem.js')>();
    return {
        ...actual,
        defaultFileSystem: {
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async () => []),
            stat: vi.fn(async () => ({ size: 0, isDirectory: () => false, isFile: () => true, mtime: new Date() })),
        },
    };
});

// Get mocked defaultFileSystem for configuring in tests
import { defaultFileSystem } from '../../src/services/filesystem.js';

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
        vi.mocked(PackageCache.prototype.clear).mockResolvedValue(undefined);
        // Reset filesystem mock to default state
        vi.mocked(defaultFileSystem.existsSync).mockReturnValue(true);
        vi.mocked(defaultFileSystem.readdir).mockResolvedValue([]);
    });

    test('shows loading state initially', () => {
        const props: CacheClearProps = { context: mockContext };
        const { lastFrame } = render(<CacheClear {...props} />);
        
        expect(lastFrame()).toContain('Clearing');
    });

    test('shows success message after clearing cache', async () => {
        const props: CacheClearProps = { context: mockContext };
        const { lastFrame } = render(<CacheClear {...props} />);
        await flushAsync();
        
        expect(lastFrame()).toContain('Cache cleared');
    });

    test('shows zero packages when cache does not exist', async () => {
        vi.mocked(defaultFileSystem.existsSync).mockReturnValue(false);
        const props: CacheClearProps = { context: mockContext };
        
        const { lastFrame } = render(<CacheClear {...props} />);
        await flushAsync();
        
        expect(lastFrame()).toContain('0 packages');
    });

    test('shows error message when clearing fails', async () => {
        const errorMessage = 'Permission denied';
        vi.mocked(PackageCache.prototype.clear).mockRejectedValue(new Error(errorMessage));
        const props: CacheClearProps = { context: mockContext };

        const { lastFrame } = render(<CacheClear {...props} />);
        await flushAsync();

        expect(lastFrame()).toContain(errorMessage);
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
        vi.clearAllMocks();
        vi.mocked(PackageCache.prototype.clear).mockResolvedValue(undefined);
        vi.mocked(defaultFileSystem.existsSync).mockReturnValue(true);
        vi.mocked(defaultFileSystem.readdir).mockResolvedValue([]);
        
        // runCacheClear → runDirect calls process.exit() and process.stdout.write().
        // We must intercept process.exit to prevent killing the test worker.
        writeStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        writeStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('exit');
        });
    });

    test('clears cache successfully in rich mode', async () => {
        try {
            await runCacheClear(mockContext);
        } catch { /* expected: process.exit throws */ }

        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(PackageCache.prototype.clear).toHaveBeenCalled();
    });

    test('returns JSON output in json mode', async () => {
        const jsonContext = { ...mockContext, mode: 'json' as const };

        try {
            await runCacheClear(jsonContext);
        } catch { /* expected: process.exit throws */ }

        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(writeStdout).toHaveBeenCalledWith(
            expect.stringContaining('"success":true')
        );
    });

    test('works in quiet mode', async () => {
        const quietContext = { ...mockContext, mode: 'quiet' as const };
        vi.mocked(defaultFileSystem.existsSync).mockReturnValue(false);

        try {
            await runCacheClear(quietContext);
        } catch { /* expected: process.exit throws */ }

        expect(exitSpy).toHaveBeenCalledWith(0);
    });

    test('exits with code 1 when cache clear fails', async () => {
        const errorMessage = 'Cache clear failed';
        vi.mocked(PackageCache.prototype.clear).mockRejectedValue(new Error(errorMessage));

        try {
            await runCacheClear(mockContext);
        } catch { /* expected: process.exit throws */ }

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(writeStderr).toHaveBeenCalledWith(
            expect.stringContaining(errorMessage)
        );
    });
});
