/**
 * Integration test: validate and help command flows.
 *
 * Exercises the real CLI binary (`node bin/cli.js`) and verifies
 * documented command behavior for `validate` and `help` in JSON mode.
 *
 * @module test/integration/validate-help-command
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI_BIN = resolve(__dirname, '../../bin/cli.js');

function createWorkspace(): string {
    return mkdtempSync(join(tmpdir(), 'dlang-validate-help-test-'));
}

function runCli(
    args: string,
    cwd: string,
    options: { expectFailure?: boolean } = {},
): string {
    const cmd = `node ${CLI_BIN} ${args}`;

    try {
        return execSync(cmd, {
            cwd,
            encoding: 'utf-8',
            timeout: 30_000,
            env: { ...process.env, NO_COLOR: '1' },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } catch (error: unknown) {
        if (options.expectFailure) {
            const execError = error as { stdout?: string; stderr?: string };
            return execError.stdout ?? execError.stderr ?? '';
        }

        const execError = error as { stdout?: string; stderr?: string; message?: string };
        throw new Error(
            `CLI command failed: ${cmd}\n` +
            `stdout: ${execError.stdout ?? ''}\n` +
            `stderr: ${execError.stderr ?? ''}\n` +
            `error: ${execError.message ?? ''}`,
        );
    }
}

describe('validate/help integration', () => {
    let workspace: string;

    beforeEach(() => {
        workspace = createWorkspace();
    });

    afterEach(() => {
        rmSync(workspace, { recursive: true, force: true });
    });

    it('validate reports imported-file diagnostics in json mode', () => {
        // Arrange
        const entryFile = join(workspace, 'index.dlang');
        const importedFile = join(workspace, 'shared.dlang');

        writeFileSync(importedFile, 'Domain Shared {}\n');
        writeFileSync(
            entryFile,
            'import "./shared.dlang"\n' +
            'Domain Sales { vision: "Sales" }\n' +
            'bc Orders for Sales { description: "Orders" }\n',
        );

        // Act
        const output = runCli('validate index.dlang --json', workspace);

        // Assert
        const json = JSON.parse(output) as {
            success: boolean;
            warnings: Array<{ file: string; message: string }>;
            errors: unknown[];
            fileCount: number;
        };

        expect(json.success).toBe(true);
        expect(json.errors).toHaveLength(0);
        expect(json.fileCount).toBeGreaterThanOrEqual(2);
        expect(json.warnings.some(warning => warning.file.endsWith('shared.dlang'))).toBe(true);
    });

    it('help returns documented commands in json mode', () => {
        // Arrange

        // Act
        const output = runCli('help --json', workspace);

        // Assert
        const json = JSON.parse(output) as {
            version: string;
            commands: Array<{ name: string; description: string }>;
            options: Array<{ flags: string; description: string }>;
        };

        const commandNames = json.commands.map(command => command.name);
        expect(json.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(commandNames.some(name => name.startsWith('validate'))).toBe(true);
        expect(commandNames.some(name => name.startsWith('query'))).toBe(true);
        expect(commandNames.some(name => name.startsWith('cache-clear'))).toBe(true);

        const flags = json.options.map(option => option.flags);
        expect(flags).toContain('--json');
        expect(flags).toContain('--quiet, -q');
    });

    it('unknown command fails safely with json error payload', () => {
        // Arrange

        // Act
        const output = runCli('not-a-command --json', workspace, { expectFailure: true });

        // Assert
        const json = JSON.parse(output) as { success: boolean; error: string };
        expect(json.success).toBe(false);
        expect(json.error.length).toBeGreaterThan(0);
    });
});
