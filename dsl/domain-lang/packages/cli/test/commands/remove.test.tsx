/**
 * Tests for remove command
 */
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { runRemove } from '../../src/commands/remove.js';
import type { CommandContext } from '../../src/commands/types.js';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from 'yaml';

// Create temp workspace
function createTempWorkspace(): string {
    const tempDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
    if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
}

// Cleanup temp workspace
async function cleanupWorkspace(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true });
}

// Create test context
function createContext(mode: 'rich' | 'json' | 'quiet' = 'quiet'): CommandContext {
    return {
        mode,
        version: '0.1.0',
        isFirstRun: false,
        noColor: true,
        cwd: process.cwd(),
    };
}

describe('Remove command', () => {
    let workspace: string;

    beforeEach(() => {
        workspace = createTempWorkspace();
    });

    afterEach(async () => {
        await cleanupWorkspace(workspace);
    });

    test('verifies error when model.yaml does not exist', async () => {
        // Arrange - No model.yaml in workspace
        const context = createContext('json');
        const originalCwd = process.cwd();
        const originalStdout = process.stdout.write;
        const originalExit = process.exit;
        let output = '';
        
        process.chdir(workspace);
        process.stdout.write = vi.fn((chunk: string) => {
            output += chunk;
            return true;
        }) as typeof process.stdout.write;
        process.exit = vi.fn() as unknown as typeof process.exit;

        try {
            // Act - Run remove without model.yaml
            await runRemove('owner/repo', context);

            // Assert - Expect error
            const result = JSON.parse(output);
            expect(result.success).toBe(false);
            expect(result.error).toContain('No model.yaml found');
            expect(process.exit).toHaveBeenCalledWith(1);
        } finally {
            process.chdir(originalCwd);
            process.stdout.write = originalStdout;
            process.exit = originalExit;
        }
    });

    test('verifies error when package not found in dependencies', async () => {
        // Arrange - Create model.yaml without the package
        const manifestPath = resolve(workspace, 'model.yaml');
        await fs.writeFile(
            manifestPath,
            YAML.stringify({
                name: 'test',
                version: '1.0.0',
                dependencies: { 'other/package': 'v1.0.0' },
            }),
            'utf-8'
        );
        
        const context = createContext('json');
        const originalCwd = process.cwd();
        const originalStdout = process.stdout.write;
        const originalExit = process.exit;
        let output = '';
        
        process.chdir(workspace);
        process.stdout.write = vi.fn((chunk: string) => {
            output += chunk;
            return true;
        }) as typeof process.stdout.write;
        process.exit = vi.fn() as unknown as typeof process.exit;

        try {
            // Act - Try to remove non-existent package
            await runRemove('owner/repo', context);

            // Assert - Expect error
            const result = JSON.parse(output);
            expect(result.success).toBe(false);
            expect(result.error).toContain('not found in model.yaml');
            expect(process.exit).toHaveBeenCalledWith(1);
        } finally {
            process.chdir(originalCwd);
            process.stdout.write = originalStdout;
            process.exit = originalExit;
        }
    });

    test('verifies model.yaml is updated when package is removed', async () => {
        // Arrange - Create model.yaml with a dependency
        const manifestPath = resolve(workspace, 'model.yaml');
        await fs.writeFile(
            manifestPath,
            YAML.stringify({
                name: 'test',
                version: '1.0.0',
                dependencies: {
                    'owner/repo': 'v1.0.0',
                    'other/package': 'v2.0.0',
                },
            }),
            'utf-8'
        );

        // Create lock file
        const lockPath = resolve(workspace, 'model.lock');
        await fs.writeFile(
            lockPath,
            JSON.stringify({
                version: '1',
                dependencies: {
                    'owner/repo': {
                        ref: 'v1.0.0',
                        refType: 'tag',
                        commit: 'abc123',
                        integrity: 'sha512-test',
                    },
                    'other/package': {
                        ref: 'v2.0.0',
                        refType: 'tag',
                        commit: 'def456',
                        integrity: 'sha512-test2',
                    },
                },
            }),
            'utf-8'
        );

        const context = createContext('quiet');
        const originalCwd = process.cwd();
        const originalStdout = process.stdout.write;
        const originalExit = process.exit;
        let output = '';
        
        process.chdir(workspace);
        process.stdout.write = vi.fn((chunk: string) => {
            output += chunk;
            return true;
        }) as typeof process.stdout.write;
        process.exit = vi.fn() as unknown as typeof process.exit;

        try {
            // Act - Remove the package
            await runRemove('owner/repo', context);

            // Assert - Check model.yaml was updated
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const manifest = YAML.parse(manifestContent);
            expect(manifest.dependencies['owner/repo']).toBeUndefined();
            expect(manifest.dependencies['other/package']).toBe('v2.0.0');

            // Assert - Check lock file was updated
            const lockContent = await fs.readFile(lockPath, 'utf-8');
            const lock = JSON.parse(lockContent);
            expect(lock.dependencies['owner/repo']).toBeUndefined();
            expect(lock.dependencies['other/package']).toBeDefined();

            expect(output).toContain('Removed owner/repo');
        } finally {
            process.chdir(originalCwd);
            process.stdout.write = originalStdout;
            process.exit = originalExit;
        }
    });

    test('verifies cache is cleaned when package is removed', async () => {
        // Arrange - Create model.yaml, lock file, and cache directory
        const manifestPath = resolve(workspace, 'model.yaml');
        await fs.writeFile(
            manifestPath,
            YAML.stringify({
                name: 'test',
                version: '1.0.0',
                dependencies: { 'owner/repo': 'v1.0.0' },
            }),
            'utf-8'
        );

        const lockPath = resolve(workspace, 'model.lock');
        await fs.writeFile(
            lockPath,
            JSON.stringify({
                version: '1',
                dependencies: {
                    'owner/repo': {
                        ref: 'v1.0.0',
                        refType: 'tag',
                        commit: 'abc123',
                        integrity: 'sha512-test',
                    },
                },
            }),
            'utf-8'
        );

        // Create cache directory
        const cachePath = resolve(workspace, '.dlang', 'packages', 'owner/repo');
        mkdirSync(cachePath, { recursive: true });
        await fs.writeFile(resolve(cachePath, 'test.dlang'), 'test', 'utf-8');

        const context = createContext('json');
        const originalCwd = process.cwd();
        const originalStdout = process.stdout.write;
        const originalExit = process.exit;
        let output = '';
        
        process.chdir(workspace);
        process.stdout.write = vi.fn((chunk: string) => {
            output += chunk;
            return true;
        }) as typeof process.stdout.write;
        process.exit = vi.fn() as unknown as typeof process.exit;

        try {
            // Act - Remove the package
            await runRemove('owner/repo', context);

            // Assert - Check cache was cleaned
            expect(existsSync(cachePath)).toBe(false);
            
            const result = JSON.parse(output);
            expect(result.success).toBe(true);
            expect(result.cacheCleared).toBe(true);
        } finally {
            process.chdir(originalCwd);
            process.stdout.write = originalStdout;
            process.exit = originalExit;
        }
    });

    test('handles package name with @ version suffix', async () => {
        // Arrange - Create model.yaml with a dependency
        const manifestPath = resolve(workspace, 'model.yaml');
        await fs.writeFile(
            manifestPath,
            YAML.stringify({
                name: 'test',
                version: '1.0.0',
                dependencies: { 'owner/repo': 'v1.0.0' },
            }),
            'utf-8'
        );

        const context = createContext('quiet');
        const originalCwd = process.cwd();
        const originalStdout = process.stdout.write;
        const originalExit = process.exit;
        let output = '';
        
        process.chdir(workspace);
        process.stdout.write = vi.fn((chunk: string) => {
            output += chunk;
            return true;
        }) as typeof process.stdout.write;
        process.exit = vi.fn() as unknown as typeof process.exit;

        try {
            // Act - Remove using name@version format (should strip version)
            await runRemove('owner/repo@v1.0.0', context);

            // Assert - Package should be removed
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const manifest = YAML.parse(manifestContent);
            // After removing the last dependency, dependencies is null (rendered as empty YAML key)
            expect(manifest.dependencies).toBeNull();
            expect(output).toContain('Removed owner/repo');
        } finally {
            process.chdir(originalCwd);
            process.stdout.write = originalStdout;
            process.exit = originalExit;
        }
    });
});
