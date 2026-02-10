/**
 * Integration test: query command path resolution.
 *
 * Tests the actual CLI binary (`node bin/cli.js`) with real file system operations
 * to ensure directory-to-entry-file resolution works correctly.
 *
 * **Why integration tests for CLI commands?**
 * - Unit tests mock `loadModel()` and never catch real path resolution bugs
 * - Directory vs. file handling requires testing against real FS operations
 * - model.yaml parsing for entry file resolution needs integration testing
 * - These tests verify the complete user workflow: `dlang query domains ./my-project`
 *
 * @module test/integration/query-command
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from 'yaml';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

/** Absolute path to the CLI entry point. */
const CLI_BIN = resolve(__dirname, '../../bin/cli.js');

/** Create an isolated temp workspace. */
function createWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dlang-query-test-'));
    return dir;
}

/**
 * Run a `dlang query` command as a subprocess.
 *
 * @param args - Full query command arguments (e.g., "domains ./workspace")
 * @param cwd - Working directory
 * @param expectFailure - If true, don't throw on non-zero exit
 * @returns stdout text
 */
function dlangQuery(
    args: string,
    cwd: string,
    options: { expectFailure?: boolean; useJson?: boolean } = {},
): string {
    const jsonFlag = options.useJson ? ' --json' : '';
    const cmd = `node ${CLI_BIN} query ${args}${jsonFlag}`;
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
            return execError.stderr ?? execError.stdout ?? '';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('query command integration', () => {
    let workspace: string;

    beforeEach(() => {
        workspace = createWorkspace();
    });

    afterEach(() => {
        rmSync(workspace, { recursive: true, force: true });
    });

    describe('directory path resolution', () => {
        it('should query a workspace directory with default index.dlang', () => {
            // Arrange - Create a workspace with index.dlang (default entry)
            const mainFile = join(workspace, 'index.dlang');
            writeFileSync(
                mainFile,
                'Domain Sales { vision: "Sales operations" }\n' +
                'Domain Billing { vision: "Billing operations" }',
            );

            // Act - Query the directory (not the file)
            const output = dlangQuery('domains', workspace, { useJson: true });

            // Assert - Should find both domains
            const json = JSON.parse(output) as { count: number; results: Array<{ name: string }> };
            expect(json.count).toBe(2);
            expect(json.results.map(r => r.name)).toEqual(['Sales', 'Billing']);
        });

        it('should respect model.yaml entry field for custom entry file', () => {
            // Arrange - Create model.yaml with custom entry
            const manifestPath = join(workspace, 'model.yaml');
            writeFileSync(
                manifestPath,
                YAML.stringify({
                    model: {
                        entry: 'main.dlang',
                    },
                }),
            );

            // Create the custom entry file
            const mainFile = join(workspace, 'main.dlang');
            writeFileSync(
                mainFile,
                'Domain CustomerSupport { vision: "Support customers" }',
            );

            // Create a decoy index.dlang that should be ignored
            const decoyFile = join(workspace, 'index.dlang');
            writeFileSync(
                decoyFile,
                'Domain DecoyDomain { vision: "Should not be loaded" }',
            );

            // Act - Query the directory
            const output = dlangQuery('domains', workspace, { useJson: true });

            // Assert - Should load main.dlang, not index.dlang
            const json = JSON.parse(output) as { count: number; results: Array<{ name: string }> };
            expect(json.count).toBe(1);
            expect(json.results[0].name).toBe('CustomerSupport');
        });

        it('should query a specific .dlang file directly', () => {
            // Arrange - Create a specific file
            const specificFile = join(workspace, 'mydomains.dlang');
            writeFileSync(
                specificFile,
                'Domain Operations { vision: "Operations domain" }',
            );

            // Act - Query the file directly
            const output = dlangQuery(`domains ${specificFile}`, workspace, { useJson: true });

            // Assert - Should load the specified file
            const json = JSON.parse(output) as { count: number; results: Array<{ name: string }> };
            expect(json.count).toBe(1);
            expect(json.results[0].name).toBe('Operations');
        });

        it('should fail with clear error when directory has no entry file', () => {
            // Arrange - Empty workspace (no index.dlang, no model.yaml)
            // workspace is already created but empty

            // Act & Assert - Should fail with helpful error
            const output = dlangQuery('domains', workspace, { expectFailure: true });
            expect(output).toContain('Entry file not found');
            expect(output).toContain('index.dlang');
        });

        it('should fail with clear error when custom entry file is missing', () => {
            // Arrange - model.yaml points to non-existent file
            const manifestPath = join(workspace, 'model.yaml');
            writeFileSync(
                manifestPath,
                YAML.stringify({
                    model: {
                        entry: 'missing.dlang',
                    },
                }),
            );

            // Act & Assert - Should fail with helpful error
            const output = dlangQuery('domains', workspace, { expectFailure: true });
            expect(output).toContain('Entry file not found');
            expect(output).toContain('missing.dlang');
        });

        it('should use cwd when no path argument provided', () => {
            // Arrange - Create index.dlang in the workspace (which will be cwd)
            const mainFile = join(workspace, 'index.dlang');
            writeFileSync(
                mainFile,
                'Domain CwdDomain { vision: "From current directory" }',
            );

            // Act - Run query without path argument, cwd=workspace
            const output = dlangQuery('domains', workspace, { useJson: true });

            // Assert - Should load from cwd
            const json = JSON.parse(output) as { count: number; results: Array<{ name: string }> };
            expect(json.count).toBe(1);
            expect(json.results[0].name).toBe('CwdDomain');
        });
    });

    describe('query with filters', () => {
        beforeEach(() => {
            // Create a standard test workspace
            const mainFile = join(workspace, 'index.dlang');
            writeFileSync(
                mainFile,
                'Classification Core\n' +
                'Classification Supporting\n' +
                'Domain Sales { vision: "v" }\n' +
                'Domain Support { vision: "v" }\n' +
                'bc OrderContext for Sales as Core {}\n' +
                'bc SupportContext for Support as Supporting {}',
            );
        });

        it('should filter bounded contexts by domain when using directory path', () => {
            // Act
            const output = dlangQuery('bcs --domain Sales', workspace, { useJson: true });

            // Assert
            const json = JSON.parse(output) as { count: number; results: Array<{ name: string }> };
            expect(json.count).toBe(1);
            expect(json.results[0].name).toBe('OrderContext');
        });

        it('should filter bounded contexts by classification when using directory path', () => {
            // Act
            const output = dlangQuery('bcs --classification Core', workspace, { useJson: true });

            // Assert
            const json = JSON.parse(output) as { count: number; results: Array<{ name: string }> };
            expect(json.count).toBe(1);
            expect(json.results[0].name).toBe('OrderContext');
        });

        it('should support --count flag with directory path', () => {
            // Act
            const output = dlangQuery('domains --count', workspace, { useJson: true });

            // Assert
            const json = JSON.parse(output) as { count: number };
            expect(json.count).toBe(2);
        });
    });

    describe('entity type aliases', () => {
        beforeEach(() => {
            // Create test workspace
            const mainFile = join(workspace, 'index.dlang');
            writeFileSync(
                mainFile,
                'Domain Sales { vision: "v" }\n' +
                'bc OrderContext for Sales {}',
            );
        });

        it('should accept "bounded-contexts" alias', () => {
            // Act
            const output = dlangQuery('bounded-contexts', workspace, { useJson: true });

            // Assert
            const json = JSON.parse(output) as { count: number };
            expect(json.count).toBe(1);
        });

        it('should accept "contexts" alias', () => {
            // Act
            const output = dlangQuery('contexts', workspace, { useJson: true });

            // Assert
            const json = JSON.parse(output) as { count: number };
            expect(json.count).toBe(1);
        });
    });

    describe('FQN output for namespaced entities', () => {
        beforeEach(() => {
            // Create test workspace with namespaced teams and classifications
            const mainFile = join(workspace, 'index.dlang');
            writeFileSync(
                mainFile,
                'Namespace Core.Baunwalls {\n' +
                '    Team Jannie\n' +
                '    Classification Strategic\n' +
                '}\n' +
                'Domain Sales { vision: "v" }',
            );
        });

        it('should output FQN for teams (e.g., "Core.Baunwalls.Jannie" not "Jannie")', () => {
            // Act
            const output = dlangQuery('teams', workspace, { useJson: true });

            // Assert
            const json = JSON.parse(output) as {
                count: number;
                results: Array<{ name: string; fqn: string }>;
            };
            expect(json.count).toBe(1);
            expect(json.results[0].fqn).toBe('Core.Baunwalls.Jannie');
            // Name should still be simple name
            expect(json.results[0].name).toBe('Jannie');
        });

        it('should output FQN for classifications', () => {
            // Act
            const output = dlangQuery('classifications', workspace, { useJson: true });

            // Assert
            const json = JSON.parse(output) as {
                count: number;
                results: Array<{ name: string; fqn: string }>;
            };
            expect(json.count).toBe(1);
            expect(json.results[0].fqn).toBe('Core.Baunwalls.Strategic');
            expect(json.results[0].name).toBe('Strategic');
        });
    });
});
