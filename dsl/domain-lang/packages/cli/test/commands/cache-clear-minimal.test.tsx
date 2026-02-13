/**
 * Minimal import test to diagnose OOM issue.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, flushAsync } from '../../src/test-utils/index.js';
import { CacheClear, type CacheClearProps } from '../../src/commands/cache-clear.js';
import { PackageCache } from '../../src/services/package-cache.js';
import React from 'react';

// Mock package-cache
vi.mock('../../src/services/package-cache.js');

// Mock the filesystem service to avoid real fs operations
vi.mock('../../src/services/filesystem.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/services/filesystem.js')>();
    return {
        ...actual,
        defaultFileSystem: {
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async () => []),
            stat: vi.fn(async () => ({ size: 0 })),
        },
    };
});

describe('minimal test', () => {
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
    });

    test('shows loading state while clear operation is pending', () => {
        // Arrange
        vi.mocked(PackageCache.prototype.clear).mockReturnValue(new Promise(() => {}));

        // Act
        const { lastFrame } = render(<CacheClear context={mockContext} />);

        // Assert
        expect(lastFrame()).toContain('Clearing');
    });

    test('renders success summary and clears package cache', async () => {
        // Arrange
        const clearSpy = vi.mocked(PackageCache.prototype.clear).mockResolvedValue(undefined);

        // Act
        const { lastFrame } = render(<CacheClear context={mockContext} />);
        await flushAsync();

        // Assert
        const output = lastFrame() ?? '';
        expect(output).toContain('Removed');
        expect(output).toContain('.dlang/packages/');
        expect(output).toContain('0 packages');
        expect(clearSpy).toHaveBeenCalledTimes(1);
    });
});
