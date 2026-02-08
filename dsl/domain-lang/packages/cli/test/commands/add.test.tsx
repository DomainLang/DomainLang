/**
 * Tests for add command
 */
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { runAdd } from '../../src/commands/add.js';
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
    };
}

describe('Add command', () => {
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
        process.exit = vi.fn() as typeof process.exit;

        try {
            // Act - Run add without model.yaml
            await runAdd('owner/repo@v1.0.0', context);

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

    test('verifies error when package specifier is invalid', async () => {
        // Arrange - Create empty model.yaml
        await fs.writeFile(
            resolve(workspace, 'model.yaml'),
            YAML.stringify({ name: 'test', version: '1.0.0' }),
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
        process.exit = vi.fn() as typeof process.exit;

        try {
            // Act - Run add with invalid specifier
            await runAdd('invalid-specifier', context);

            // Assert - Expect error
            const result = JSON.parse(output);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid package URL');
            expect(process.exit).toHaveBeenCalledWith(1);
        } finally {
            process.chdir(originalCwd);
            process.stdout.write = originalStdout;
            process.exit = originalExit;
        }
    });

});
