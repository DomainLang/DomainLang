/**
 * Tests for outdated command.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, flushAsync } from '../../src/test-utils/render.js';
import { Outdated, runOutdated } from '../../src/commands/outdated.js';
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

function normalizeOutput(output: string): string {
    let plain = '';
    let inEscapeSequence = false;

    for (const current of output) {
        if (inEscapeSequence) {
            if (current === 'm') {
                inEscapeSequence = false;
            }
            continue;
        }

        if ((current.codePointAt(0) ?? -1) === 27) {
            inEscapeSequence = true;
            continue;
        }

        plain += current;
    }

    return plain.replaceAll(/\s+/g, ' ').trim();
}

function createTestWorkspace(): string {
    const workspaceDir = path.join(tmpdir(), `dlang-test-outdated-${Date.now()}`);
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
// Outdated Component Tests
// ============================================================================

describe('Outdated component', () => {
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
        const { lastFrame } = render(<Outdated context={context} />);
        await flushAsync();
        const output = normalizeOutput(lastFrame() ?? '');

        // Assert
        expect(output).toContain('Check failed');
        expect(output).toContain('No model.lock found');
    });

    test('shows empty state when no dependencies', async () => {
        // Arrange - lock file with no dependencies
        await createLockFile(workspaceDir, {});

        // Act
        const { lastFrame } = render(<Outdated context={context} />);
        await flushAsync();
        const output = normalizeOutput(lastFrame() ?? '');

        // Assert
        expect(output).toContain('Outdated Dependencies');
        expect(output).toContain('No dependencies found');
    });

    test('displays summary counts for pinned commit dependencies', async () => {
        // Arrange
        await createLockFile(workspaceDir, {
            'test/commit-repo': {
                ref: 'abc123def',
                refType: 'commit',
                resolved: 'https://api.github.com/repos/test/commit-repo/tarball/abc123',
                commit: 'abc123def456ghi789',
                integrity: 'sha512-...',
            },
        });

        // Act
        const { lastFrame } = render(<Outdated context={context} />);
        await flushAsync();
        const output = normalizeOutput(lastFrame() ?? '');

        // Assert
        expect(output).toContain('Outdated Dependencies');
        expect(output).toContain('1 pinned');
    });

    test('component remains rich-mode rendering even when context mode is json', async () => {
        // Arrange
        await createLockFile(workspaceDir, {});

        const jsonContext = { ...context, mode: 'json' as const };

        // Act
        const { lastFrame } = render(<Outdated context={jsonContext} />);
        await flushAsync();
        const output = normalizeOutput(lastFrame() ?? '');

        // Assert
        expect(output).toContain('Outdated Dependencies');
        expect(output).toContain('No dependencies found');
    });
});

// ============================================================================
// runOutdated Function Tests
// ============================================================================

describe('runOutdated function', () => {
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
        await runOutdated(context);

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
        await runOutdated(jsonContext);

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
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const quietContext = { ...context, mode: 'quiet' as const };
        
        await createLockFile(workspaceDir, {});

        // Act
        await runOutdated(quietContext);

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(0);
        const output = String(stdoutSpy.mock.calls[0]?.[0] ?? '');
        expect(output).toMatch(/\d+ upgrades, \d+ branches behind, \d+ pinned/); // NOSONAR

        exitSpy.mockRestore();
        stdoutSpy.mockRestore();
    });

    test('success case with empty dependencies', async () => {
        // Arrange
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const quietContext = { ...context, mode: 'quiet' as const };
        
        await createLockFile(workspaceDir, {});

        // Act
        await runOutdated(quietContext);

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(stdoutSpy).toHaveBeenCalledWith('0 upgrades, 0 branches behind, 0 pinned\n');

        exitSpy.mockRestore();
        stdoutSpy.mockRestore();
    });
});
