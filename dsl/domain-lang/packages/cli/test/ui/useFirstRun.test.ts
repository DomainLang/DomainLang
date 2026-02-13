/**
 * Tests for first-run detection utilities (non-React functions only).
 *
 * @module ui/useFirstRun.test
 */
import { describe, test, expect, vi } from 'vitest';
import type { FileSystemService } from '../../src/services/filesystem.js';
import { isFirstRun, markFirstRunComplete } from '../../src/ui/hooks/useFirstRun.js';

function createMockFileSystem(): FileSystemService {
    const existingPaths = new Set<string>();

    return {
        existsSync: (path: string) => existingPaths.has(path),
        readFileSync: vi.fn(),
        writeFileSync: (path: string) => {
            existingPaths.add(path);
        },
        mkdirSync: (path: string) => {
            existingPaths.add(path);
        },
        createWriteStream: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        readdir: vi.fn(),
        stat: vi.fn(),
        mkdir: vi.fn(),
        rm: vi.fn(),
        rmdir: vi.fn(),
        rename: vi.fn(),
        unlink: vi.fn(),
        copyFile: vi.fn(),
    } as unknown as FileSystemService;
}

describe('First-run detection (filesystem logic)', () => {
    test('isFirstRun returns true when marker file is missing', () => {
        // Arrange
        const fs = createMockFileSystem();

        // Act
        const result = isFirstRun(fs);

        // Assert
        expect(result).toBe(true);
    });

    test('markFirstRunComplete makes subsequent isFirstRun false', () => {
        // Arrange
        const fs = createMockFileSystem();

        // Act
        markFirstRunComplete(fs);

        // Assert
        expect(isFirstRun(fs)).toBe(false);
    });

    test('markFirstRunComplete swallows filesystem errors', () => {
        // Arrange
        const failingFs = {
            existsSync: () => false,
            mkdirSync: () => {
                throw new Error('permission denied');
            },
            writeFileSync: vi.fn(),
        } as unknown as FileSystemService;

        // Act
        const call = (): void => markFirstRunComplete(failingFs);

        // Assert
        expect(call).not.toThrow();
    });
});
