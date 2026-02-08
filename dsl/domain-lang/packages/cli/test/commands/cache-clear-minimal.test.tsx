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

    test('can render component', () => {
        const { lastFrame } = render(<CacheClear context={mockContext} />);
        expect(lastFrame()).toContain('Clearing');
    });

    test('second test', async () => {
        const { lastFrame } = render(<CacheClear context={mockContext} />);
        await flushAsync();
        expect(lastFrame()).toBeDefined();
    });

    test('third test', async () => {
        const { lastFrame } = render(<CacheClear context={mockContext} />);
        await flushAsync();
        expect(lastFrame()).toBeDefined();
    });
});
