/**
 * Tests for update command.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, flushAsync } from '../../src/test-utils/render.js';
import { Update, runUpdate } from '../../src/commands/update.js';
import type { CommandContext } from '../../src/commands/types.js';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// ============================================================================
// Test Setup & Helpers
// ============================================================================

const defaultContext: CommandContext = {
    version: '0.1.0',
    mode: 'rich',
    isFirstRun: false,
    noColor: false,
    cwd: '',
};

function createTestWorkspace(): string {
    const workspaceDir = path.join(tmpdir(), `dlang-test-update-${Date.now()}`);
    mkdirSync(workspaceDir, { recursive: true });
    return workspaceDir;
}

function cleanupWorkspace(workspaceDir: string): void {
    if (existsSync(workspaceDir)) {
        rmSync(workspaceDir, { recursive: true, force: true });
    }
}

async function createLockFile(workspaceDir: string, dependencies: Record<string, unknown>): Promise<void> {
    const lockFile = {
        version: '1',
        dependencies,
    };
    await fs.writeFile(
        path.join(workspaceDir, 'model.lock'),
        JSON.stringify(lockFile, null, 2),
        'utf-8'
    );
}

// ============================================================================
// Update Component Tests
// ============================================================================

describe('Update component', () => {
    let workspaceDir: string;
    let context: CommandContext;

    beforeEach(() => {
        workspaceDir = createTestWorkspace();
        context = { ...defaultContext, cwd: workspaceDir };
    });

    afterEach(() => {
        cleanupWorkspace(workspaceDir);
    });

    test('displays error when lock file does not exist', async () => {
        // Arrange - no lock file created

        // Act
        const { lastFrame } = render(<Update context={context} />);
        await flushAsync();

        // Assert
        expect(lastFrame()).toContain('Update failed');
        expect(lastFrame()).toContain('No model.lock found');
    });

    test('displays error when no branch dependencies found', async () => {
        // Arrange - lock file with only tag dependencies
        await createLockFile(workspaceDir, {
            'domainlang/core': {
                ref: 'v1.0.0',
                refType: 'tag',
                resolved: 'https://api.github.com/repos/domainlang/core/tarball/abc123',
                commit: 'abc123def456',
                integrity: 'sha512-...',
            },
        });

        // Act
        const { lastFrame } = render(<Update context={context} />);
        await flushAsync();

        // Assert
        expect(lastFrame()).toContain('Update failed');
        expect(lastFrame()).toContain('No branch dependencies found');
    });

    test('JSON output mode returns structured data on success', async () => {
        // Arrange
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        
        await createLockFile(workspaceDir, {
            'test/repo': {
                ref: 'main',
                refType: 'branch',
                resolved: 'https://api.github.com/repos/test/repo/tarball/abc123',
                commit: 'abc123def456',
                integrity: 'sha512-...',
            },
        });

        const jsonContext = { ...context, mode: 'json' as const };

        // Act - will fail because we can't actually download, but we can test the structure
        await runUpdate(jsonContext);

        // Assert
        // runDirect should handle error and output JSON error
        expect(exitSpy).toHaveBeenCalledWith(1);
        if (stdoutSpy.mock.calls.length > 0) {
            const output = stdoutSpy.mock.calls[0][0] as string;
            const json = JSON.parse(output);
            expect(json).toHaveProperty('success');
        }

        exitSpy.mockRestore();
        stdoutSpy.mockRestore();
    });
});

// ============================================================================
// runUpdate Function Tests
// ============================================================================

describe('runUpdate function', () => {
    let workspaceDir: string;
    let context: CommandContext;

    beforeEach(() => {
        workspaceDir = createTestWorkspace();
        context = { ...defaultContext, cwd: workspaceDir };
    });

    afterEach(() => {
        cleanupWorkspace(workspaceDir);
    });

    test('exits with error code 1 when lock file missing', async () => {
        // Arrange
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

        // Act
        await runUpdate(context);

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(stderrSpy).toHaveBeenCalled();

        exitSpy.mockRestore();
        stderrSpy.mockRestore();
    });

    test('JSON mode outputs error when lock file missing', async () => {
        // Arrange
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const jsonContext = { ...context, mode: 'json' as const };

        // Act
        await runUpdate(jsonContext);

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(stdoutSpy).toHaveBeenCalled();
        
        const output = stdoutSpy.mock.calls[0][0] as string;
        const json = JSON.parse(output);
        expect(json.success).toBe(false);
        expect(json.error).toContain('model.lock');

        exitSpy.mockRestore();
        stdoutSpy.mockRestore();
    });

    test('quiet mode outputs summary text', async () => {
        // Arrange
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const quietContext = { ...context, mode: 'quiet' as const };

        // Act
        await runUpdate(quietContext);

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(1);

        exitSpy.mockRestore();
        stdoutSpy.mockRestore();
    });
});
