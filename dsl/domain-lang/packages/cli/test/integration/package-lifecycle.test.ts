/**
 * Integration test: full package lifecycle against a real GitHub repository.
 *
 * Exercises the **actual CLI binary** (`node bin/cli.js`) using subprocess
 * invocations with `--json` output mode so we can parse structured results.
 *
 * Flow: init → add → install → frozen-install → update (force) → remove → no-op install
 *
 * Uses `DomainLang/Patterns` (public repo, branch-only, default branch: main).
 *
 * These tests make real HTTP calls and require network access.
 *
 * **CI Behavior:** Skipped by default in CI environments (set INTEGRATION_TESTS=true to run).
 * **Local Run:** Set environment variable to skip: `INTEGRATION_TESTS=false npm test`
 *
 * @module test/integration/package-lifecycle
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LockFile, ModelManifest } from '@domainlang/language';
import YAML from 'yaml';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const PACKAGE = 'DomainLang/Patterns';
const REF = 'main';

/** Absolute path to the CLI entry point. */
const CLI_BIN = resolve(__dirname, '../../bin/cli.js');

/** Create an isolated temp workspace. */
function createWorkspace(suffix: string): string {
    const dir = resolve(tmpdir(), `dlang-integ-${suffix}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * Run a `dlang` CLI command as a subprocess.
 *
 * Always appends `--json` so the output is machine-parseable.
 *
 * @returns Parsed JSON output from stdout
 */
function dlang(
    args: string,
    cwd: string,
    options: { expectFailure?: boolean } = {},
): Record<string, unknown> {
    const cmd = `node ${CLI_BIN} ${args} --json`;
    try {
        const stdout = execSync(cmd, { // NOSONAR
            cwd,
            encoding: 'utf-8',
            timeout: 60_000,
            env: { ...process.env, NO_COLOR: '1' },
            // Capture stderr to avoid polluting test output
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return parseJsonOutput(stdout);
    } catch (error: unknown) {
        if (options.expectFailure) {
            // Extract stdout from the thrown error object
            const execError = error as { stdout?: string; stderr?: string };
            return parseJsonOutput(execError.stdout ?? '');
        }
        // Re-throw with helpful context
        const execError = error as { stdout?: string; stderr?: string; message?: string };
        throw new Error(
            `CLI command failed: ${cmd}\n` +
            `stdout: ${execError.stdout ?? ''}\n` +
            `stderr: ${execError.stderr ?? ''}\n` +
            `error: ${execError.message ?? ''}`,
        );
    }
}

/**
 * Extract the last JSON object from CLI output.
 *
 * The CLI may emit multi-line pretty-printed JSON or embed it after
 * Ink rendering noise.  We scan backwards for a `{…}` block.
 */
function parseJsonOutput(raw: string): Record<string, unknown> {
    const trimmed = raw.trim();

    // Fast path: the entire output is valid JSON
    try {
        return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
        // fallthrough to slower extraction
    }

    // Slower path: find the last JSON object in the output
    const lastBrace = trimmed.lastIndexOf('}');
    if (lastBrace === -1) {
        throw new Error(`No JSON object found in output:\n${trimmed}`);
    }

    // Walk backwards to find the matching opening brace
    let depth = 0;
    for (let i = lastBrace; i >= 0; i--) {
        if (trimmed[i] === '}') depth++;
        if (trimmed[i] === '{') depth--;
        if (depth === 0) {
            return JSON.parse(trimmed.slice(i, lastBrace + 1)) as Record<string, unknown>;
        }
    }

    throw new Error(`Malformed JSON in output:\n${trimmed}`);
}

/** Read & parse model.yaml from a workspace. */
function readManifest(root: string): ModelManifest {
    return YAML.parse(readFileSync(join(root, 'model.yaml'), 'utf-8')) as ModelManifest;
}

/** Read & parse model.lock from a workspace. */
function readLock(root: string): LockFile {
    return JSON.parse(readFileSync(join(root, 'model.lock'), 'utf-8')) as LockFile;
}

/** Return relative paths of all files under `dir` (recursive). */
function readDirRecursive(dir: string): string[] {
    const results: string[] = [];

    function walk(current: string, prefix: string): void {
        for (const entry of readdirSync(current)) {
            const full = resolve(current, entry);
            const rel = prefix ? `${prefix}/${entry}` : entry;
            if (statSync(full).isDirectory()) {
                walk(full, rel);
            } else {
                results.push(rel);
            }
        }
    }

    walk(dir, '');
    return results;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const shouldSkipIntegration = 
    process.env.CI === 'true' && process.env.INTEGRATION_TESTS !== 'true';

describe.skipIf(shouldSkipIntegration)('Package lifecycle integration via CLI (DomainLang/Patterns)', () => {
    let workspace: string;

    beforeAll(() => {
        workspace = createWorkspace('lifecycle');
    });

    afterAll(() => {
        if (workspace && existsSync(workspace)) {
            rmSync(workspace, { recursive: true, force: true });
        }
    });

    // ------------------------------------------------------------------
    // 1. Init a new project
    // ------------------------------------------------------------------
    it('dlang init scaffolds a new project', { timeout: 10_000 }, () => {
        // Arrange — workspace is an empty temp dir

        // Act
        const result = dlang('init my-project --yes', workspace);

        // Assert — CLI reports success
        expect(result.success).toBe(true);
        expect(result.files).toEqual(
            expect.arrayContaining(['model.yaml', 'index.dlang', '.gitignore']),
        );

        // Assert — files actually exist on disk
        const projectDir = join(workspace, 'my-project');
        expect(existsSync(join(projectDir, 'model.yaml'))).toBe(true);
        expect(existsSync(join(projectDir, 'index.dlang'))).toBe(true);
        expect(existsSync(join(projectDir, '.gitignore'))).toBe(true);
        expect(existsSync(join(projectDir, 'domains', '.gitkeep'))).toBe(true);

        // Assert — model.yaml has expected content
        const manifest = readManifest(projectDir);
        expect(manifest.model?.name).toBe('my-project');
        expect(manifest.model?.entry).toBe('index.dlang');
    });

    // ------------------------------------------------------------------
    // 2. Add a dependency
    // ------------------------------------------------------------------
    it('dlang add installs a dependency and creates lock file', { timeout: 30_000 }, () => {
        // Arrange — use the project created in step 1
        const projectDir = join(workspace, 'my-project');

        // Act
        const result = dlang(`add ${PACKAGE}@${REF}`, projectDir);

        // Assert — CLI reports success
        expect(result.success).toBe(true);
        expect(result.package).toBe(PACKAGE);
        expect(result.ref).toBe(REF);
        expect(result.commit).toMatch(/^[0-9a-f]{7,40}$/);
        expect(result.integrity).toMatch(/^sha512-/);

        // Assert — model.yaml updated with dependency
        const manifest = readManifest(projectDir);
        expect(manifest.dependencies?.[PACKAGE]).toBe(REF);

        // Assert — model.lock created with pinned commit
        expect(existsSync(join(projectDir, 'model.lock'))).toBe(true);
        const lock = readLock(projectDir);
        expect(lock.dependencies[PACKAGE]?.ref).toBe(REF);

        const locked = lock.dependencies[PACKAGE];
        expect(locked.ref).toBe(REF);
        expect(locked.refType).toBe('branch');
        expect(locked.commit).toMatch(/^[0-9a-f]{40}$/);
        expect(locked.integrity).toMatch(/^sha512-/);
        expect(locked.resolved).toContain('github.com');

        // Assert — cached package contains .dlang files
        const cachePath = join(projectDir, '.dlang', 'packages', PACKAGE);
        expect(existsSync(cachePath)).toBe(true);
        const dlangFiles = readDirRecursive(cachePath).filter(f => f.endsWith('.dlang'));
        expect(dlangFiles.length).toBeGreaterThan(0);
    });

    // ------------------------------------------------------------------
    // 3. Install (should use cache — packages already present)
    // ------------------------------------------------------------------
    it('dlang install uses cache for already-resolved packages', { timeout: 60_000 }, () => {
        // Arrange
        const projectDir = join(workspace, 'my-project');

        // Act
        const result = dlang('install', projectDir);

        // Assert
        expect(result.success).toBe(true);
        expect(result.cached).toBeGreaterThanOrEqual(1);
    });

    // ------------------------------------------------------------------
    // 4. Frozen install succeeds when lock is in sync
    // ------------------------------------------------------------------
    it('dlang install --frozen succeeds when lock matches manifest', { timeout: 60_000 }, () => {
        // Arrange
        const projectDir = join(workspace, 'my-project');

        // Act
        const result = dlang('install --frozen', projectDir);

        // Assert
        expect(result.success).toBe(true);
        expect(result.lockFileModified).toBe(false);
    });

    // ------------------------------------------------------------------
    // 5. Force install re-resolves branch HEAD (simulates update)
    // ------------------------------------------------------------------
    it('dlang install --force re-resolves branch dependencies', { timeout: 60_000 }, () => {
        // Arrange
        const projectDir = join(workspace, 'my-project');
        const lockBefore = readLock(projectDir);
        expect(lockBefore.dependencies[PACKAGE].commit).toMatch(/^[0-9a-f]{40}$/);

        // Act
        const result = dlang('install --force', projectDir);

        // Assert
        expect(result.success).toBe(true);

        const lockAfter = readLock(projectDir);
        expect(lockAfter.dependencies[PACKAGE].commit).toMatch(/^[0-9a-f]{40}$/);
        expect(lockAfter.dependencies[PACKAGE].integrity).toMatch(/^sha512-/);
    });

    // ------------------------------------------------------------------
    // 6. Remove the dependency
    // ------------------------------------------------------------------
    it('dlang remove cleans up manifest, lock, and cache', { timeout: 30_000 }, () => {
        // Arrange
        const projectDir = join(workspace, 'my-project');

        // Act
        const result = dlang(`remove ${PACKAGE}`, projectDir);

        // Assert — CLI reports success
        expect(result.success).toBe(true);
        expect(result.package).toBe(PACKAGE);

        // Assert — dependency removed from model.yaml
        const manifest = readManifest(projectDir);
        expect(manifest.dependencies?.[PACKAGE]).toBeUndefined();

        // Assert — dependency removed from model.lock
        const lock = readLock(projectDir);
        expect(lock.dependencies[PACKAGE]).toBeUndefined();

        // Assert — cache directory cleaned
        const cachePath = join(projectDir, '.dlang', 'packages', PACKAGE);
        expect(existsSync(cachePath)).toBe(false);
    });

    // ------------------------------------------------------------------
    // 7. Install with empty dependencies is a clean no-op
    // ------------------------------------------------------------------
    it('dlang install with no deps is a no-op', { timeout: 30_000 }, () => {
        // Arrange
        const projectDir = join(workspace, 'my-project');

        // Act
        const result = dlang('install', projectDir);

        // Assert
        expect(result.success).toBe(true);
        expect(result.installed).toBe(0);
        expect(result.cached).toBe(0);
    });
});
