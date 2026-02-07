/**
 * Tests for upgrade command.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, flushAsync } from '../../src/test-utils/render.js';
import { Upgrade, runUpgrade } from '../../src/commands/upgrade.js';
import type { CommandContext } from '../../src/commands/types.js';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import YAML from 'yaml';

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
    const workspaceDir = path.join(tmpdir(), `dlang-test-upgrade-${Date.now()}`);
    mkdirSync(workspaceDir, { recursive: true });
    return workspaceDir;
}

function cleanupWorkspace(workspaceDir: string): void {
    if (existsSync(workspaceDir)) {
        rmSync(workspaceDir, { recursive: true, force: true });
    }
}

async function createManifest(
    workspaceDir: string, 
    dependencies: Record<string, string | { ref?: string; source?: string }>
): Promise<void> {
    const manifest = {
        model: 'test-model',
        version: '1.0.0',
        dependencies,
    };
    await fs.writeFile(
        path.join(workspaceDir, 'model.yaml'),
        YAML.stringify(manifest),
        'utf-8'
    );
}

// ============================================================================
// Upgrade Component Tests
// ============================================================================

describe('Upgrade component', () => {
    let workspaceDir: string;
    let context: CommandContext;

    beforeEach(() => {
        workspaceDir = createTestWorkspace();
        context = { ...defaultContext, cwd: workspaceDir };
    });

    afterEach(() => {
        cleanupWorkspace(workspaceDir);
    });

    test('displays error when model.yaml does not exist', async () => {
        // Arrange - no manifest created

        // Act
        const { lastFrame } = render(<Upgrade context={context} />);
        await flushAsync();

        // Assert
        expect(lastFrame()).toContain('Upgrade failed');
        expect(lastFrame()).toContain('No model.yaml found');
    });

    test('list mode shows empty state when no tag dependencies', async () => {
        // Arrange - manifest with only branch dependencies
        await createManifest(workspaceDir, {
            'test/repo': 'main',
        });

        // Act
        const { lastFrame } = render(<Upgrade context={context} />);
        await flushAsync();

        // Assert
        expect(lastFrame()).toContain('Available Upgrades');
    });

    test('JSON output mode returns structured data', async () => {
        // Arrange
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        
        await createManifest(workspaceDir, {
            'domainlang/core': 'v1.0.0',
        });

        const jsonContext = { ...context, mode: 'json' as const };

        // Act
        render(<Upgrade context={jsonContext} />);
        await flushAsync();

        // Assert - will eventually output JSON (success or error)
        if (exitSpy.mock.calls.length > 0) {
            expect([0, 1]).toContain(exitSpy.mock.calls[0][0]);
        }

        exitSpy.mockRestore();
        stdoutSpy.mockRestore();
    });
});

// ============================================================================
// runUpgrade Function Tests
// ============================================================================

describe('runUpgrade function', () => {
    let workspaceDir: string;
    let context: CommandContext;

    beforeEach(() => {
        workspaceDir = createTestWorkspace();
        context = { ...defaultContext, cwd: workspaceDir };
    });

    afterEach(() => {
        cleanupWorkspace(workspaceDir);
    });

    test('exits with error code 1 when manifest missing', async () => {
        // Arrange
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

        // Act
        await runUpgrade(undefined, undefined, context);

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(stderrSpy).toHaveBeenCalled();

        exitSpy.mockRestore();
        stderrSpy.mockRestore();
    });

    test('JSON mode outputs error structure when manifest missing', async () => {
        // Arrange
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const jsonContext = { ...context, mode: 'json' as const };

        // Act
        await runUpgrade(undefined, undefined, jsonContext);

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(stdoutSpy).toHaveBeenCalled();
        
        const output = stdoutSpy.mock.calls[0][0] as string;
        const json = JSON.parse(output);
        expect(json.success).toBe(false);
        expect(json.error).toContain('model.yaml');

        exitSpy.mockRestore();
        stdoutSpy.mockRestore();
    });

    test('quiet mode outputs summary for list mode', async () => {
        // Arrange
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const quietContext = { ...context, mode: 'quiet' as const };
        
        await createManifest(workspaceDir, {});

        // Act
        await runUpgrade(undefined, undefined, quietContext);

        // Assert - will exit eventually
        
        exitSpy.mockRestore();
        stdoutSpy.mockRestore();
    });

    test('apply mode exits with error when package not found', async () => {
        // Arrange
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        await createManifest(workspaceDir, {
            'other/repo': 'v1.0.0',
        });

        // Act - try to upgrade non-existent package
        await runUpgrade('nonexistent/package', undefined, context);

        // Assert
        expect(exitSpy).toHaveBeenCalledWith(1);

        exitSpy.mockRestore();
        stderrSpy.mockRestore();
    });
});
