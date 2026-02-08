/**
 * E2E Import Resolution Tests
 *
 * Smoke (~20%):
 * - External import with lock file and cache resolves correctly
 * - Local file import with .dlang extension resolves directly
 *
 * Edge/error (~80%):
 * - External import without manifest rejects with "requires model.yaml"
 * - External import without lock file rejects with "not installed"
 * - Local file import without ./ prefix treated as external
 * - Missing local file produces clear error
 * - Local module with index.dlang works without model.yaml
 * - Local module with model.yaml resolves to custom entry point
 * - Path alias import resolves through model.yaml paths config
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { ImportResolver } from '../../src/services/import-resolver.js';
import { WorkspaceManager } from '../../src/services/workspace-manager.js';
import type { DomainLangServices } from '../../src/domain-lang-module.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('Import Resolution E2E', () => {
    let tempDir: string;

    beforeAll(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-e2e-'));
    });

    function createResolver(): { resolver: ImportResolver; workspaceManager: WorkspaceManager } {
        const workspaceManager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
        const services = { imports: { WorkspaceManager: workspaceManager } } as DomainLangServices;
        const resolver = new ImportResolver(services);
        return { resolver, workspaceManager };
    }

    // ==========================================
    // SMOKE: external import with full cache
    // ==========================================
    describe('Scenario 1: External import from manifest', () => {
        test('external import with lock file and cache resolves to correct fsPath', async () => {
            const projectDir = path.join(tempDir, 'external-with-cache');
            await fs.mkdir(projectDir, { recursive: true });

            await fs.writeFile(path.join(projectDir, 'model.yaml'), `
model:
  name: test-project
  entry: index.dlang

dependencies:
  std:
    source: domainlang/core
    ref: v1.0.0
`);

            const lockFile = {
                version: '1',
                dependencies: {
                    'domainlang/core': {
                        ref: 'v1.0.0',
                        refType: 'tag',
                        resolved: 'https://github.com/domainlang/core',
                        commit: 'abc123def456'
                    }
                }
            };
            await fs.writeFile(path.join(projectDir, 'model.lock'), JSON.stringify(lockFile, null, 2));

            const cacheDir = path.join(projectDir, '.dlang', 'packages', 'domainlang', 'core', 'abc123def456');
            await fs.mkdir(cacheDir, { recursive: true });

            await fs.writeFile(path.join(cacheDir, 'model.yaml'), `
model:
  name: core
  entry: index.dlang
`);
            await fs.writeFile(path.join(cacheDir, 'index.dlang'), `
Namespace domainlang.core {
    Metadata Language
}
`);

            const { resolver } = createResolver();
            const uri = await resolver.resolveFrom(projectDir, 'std');
            expect(uri.fsPath).toBe(path.join(cacheDir, 'index.dlang'));
        });

        // EDGE: external import without manifest covered by import-resolver.test.ts

        // EDGE: external import without lock file
        test('external import without lock file rejects with "not installed"', async () => {
            const projectDir = path.join(tempDir, 'external-no-lock');
            await fs.mkdir(projectDir, { recursive: true });

            await fs.writeFile(path.join(projectDir, 'model.yaml'), `
model:
  name: test-project
  entry: index.dlang

dependencies:
  std:
    source: domainlang/core
    ref: v1.0.0
`);

            const { resolver } = createResolver();
            await expect(
                resolver.resolveFrom(projectDir, 'std/core')
            ).rejects.toThrow(/not installed/i);
        });
    });

    // ==========================================
    // SMOKE: local file import resolves directly
    // ==========================================
    // Scenario 2 (local file, no-prefix, missing file) covered by import-resolver.test.ts

    describe('Scenario 2: Local file import', () => {
        // EDGE: import without ./ prefix treated as external
        test('import without ./ prefix is treated as external and rejects without manifest', async () => {
            const projectDir = path.join(tempDir, 'no-prefix');
            await fs.mkdir(projectDir, { recursive: true });

            await fs.writeFile(path.join(projectDir, 'types.dlang'), `Domain Types {}`);

            const { resolver } = createResolver();
            await expect(
                resolver.resolveFrom(projectDir, 'types.dlang')
            ).rejects.toThrow(/requires model\.yaml/i);
        });
    });

    describe('Scenario 3: Local module import (directory-first)', () => {
        // EDGE: local module with index.dlang works without model.yaml
        test('local module import with index.dlang works without model.yaml', async () => {
            const projectDir = path.join(tempDir, 'local-module-no-manifest');
            const moduleDir = path.join(projectDir, 'shared', 'types');
            await fs.mkdir(moduleDir, { recursive: true });

            await fs.writeFile(path.join(moduleDir, 'index.dlang'), `Domain Types {}`);

            const { resolver } = createResolver();
            const uri = await resolver.resolveFrom(projectDir, './shared/types');
            expect(uri.fsPath).toBe(path.join(moduleDir, 'index.dlang'));
        });

        // EDGE: model.yaml with custom entry overrides default
        test('local module with model.yaml resolves to custom entry point', async () => {
            const projectDir = path.join(tempDir, 'local-module-with-manifest');
            const moduleDir = path.join(projectDir, 'shared', 'types');
            await fs.mkdir(moduleDir, { recursive: true });

            await fs.writeFile(path.join(moduleDir, 'model.yaml'), `
model:
  name: shared-types
  entry: main.dlang
`);

            await fs.writeFile(path.join(moduleDir, 'main.dlang'), `
Namespace shared.types {
    Domain SharedTypes { vision: "Shared type definitions" }
}
`);

            const { resolver } = createResolver();
            const uri = await resolver.resolveFrom(projectDir, './shared/types');
            expect(uri.fsPath).toBe(path.join(moduleDir, 'main.dlang'));
        });

        // EDGE: model.yaml without entry field still falls back to index.dlang
        test('local module with model.yaml but no entry field falls back to index.dlang', async () => {
            const projectDir = path.join(tempDir, 'local-module-default-entry');
            const moduleDir = path.join(projectDir, 'utils');
            await fs.mkdir(moduleDir, { recursive: true });

            await fs.writeFile(path.join(moduleDir, 'model.yaml'), `
model:
  name: utils
`);

            await fs.writeFile(path.join(moduleDir, 'index.dlang'), `
Namespace utils {
    Domain Utilities { vision: "Utility definitions" }
}
`);

            const { resolver } = createResolver();
            const uri = await resolver.resolveFrom(projectDir, './utils');
            expect(uri.fsPath).toBe(path.join(moduleDir, 'index.dlang'));
        });
    });

    // Scenario 4 (path alias resolution) covered by import-resolver.test.ts
});
