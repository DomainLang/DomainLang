/**
 * Cached Package Resolution E2E Tests
 *
 * Tests that files opened from .dlang/packages cache resolve imports correctly:
 * - Path aliases from the cached package's model.yaml
 * - Relative imports within the cached package
 * - External dependencies (transitive) resolved from top-level cache
 *
 * Smoke (~20%):
 * - Opening a cached package file resolves relative imports
 *
 * Edge (~80%):
 * - Cached package's path aliases work correctly
 * - Transitive dependencies resolve to top-level cache, not nested cache
 * - getCacheDir() returns project root cache when inside a cached package
 */
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { ImportResolver } from '../../src/services/import-resolver.js';
import { WorkspaceManager } from '../../src/services/workspace-manager.js';
import type { DomainLangServices } from '../../src/domain-lang-module.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('Cached Package Resolution E2E', () => {
    let tempDir: string;
    let projectRoot: string;
    let cacheRoot: string;

    beforeAll(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-cache-test-'));
        projectRoot = path.join(tempDir, 'my-project');
        cacheRoot = path.join(projectRoot, '.dlang', 'packages');
        
        // Create project structure
        await fs.mkdir(projectRoot, { recursive: true });
    });

    afterAll(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    function createResolver(): { resolver: ImportResolver; workspaceManager: WorkspaceManager } {
        const workspaceManager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
        const services = { imports: { WorkspaceManager: workspaceManager } } as DomainLangServices;
        const resolver = new ImportResolver(services);
        return { resolver, workspaceManager };
    }

    // ==========================================
    // SMOKE: Relative imports within cached package
    // ==========================================
    describe('Scenario 1: Relative imports within cached package', () => {
        test('relative import within cached package resolves correctly', async () => {
            // Setup: Create a cached package with internal structure
            const pkgDir = path.join(cacheRoot, 'acme', 'lib', 'abc123');
            await fs.mkdir(pkgDir, { recursive: true });

            // Create package manifest
            await fs.writeFile(path.join(pkgDir, 'model.yaml'), `
model:
  name: acme/lib
  version: 1.0.0
  entry: index.dlang
`);

            // Create index.dlang that imports types.dlang
            await fs.writeFile(path.join(pkgDir, 'index.dlang'), 'Domain Acme {}');
            
            // Create types.dlang in same directory
            await fs.writeFile(path.join(pkgDir, 'types.dlang'), 'Domain Types {}');

            const { resolver } = createResolver();
            
            // Resolve from index.dlang's directory (simulating file opened in cache)
            const uri = await resolver.resolveFrom(pkgDir, './types.dlang');
            expect(uri.fsPath).toBe(path.join(pkgDir, 'types.dlang'));
        });
    });

    // ==========================================
    // EDGE: Path aliases from cached package manifest
    // ==========================================
    describe('Scenario 2: Path aliases within cached package', () => {
        test('path alias from cached package manifest resolves correctly', async () => {
            const pkgDir = path.join(cacheRoot, 'acme', 'core', 'def456');
            await fs.mkdir(pkgDir, { recursive: true });

            // Create package with path alias
            await fs.writeFile(path.join(pkgDir, 'model.yaml'), `
model:
  name: acme/core
  entry: index.dlang

paths:
  "@utils": ./utils
`);

            await fs.writeFile(path.join(pkgDir, 'index.dlang'), 'Domain Core {}');
            
            // Create utils directory with helper file
            const utilsDir = path.join(pkgDir, 'utils');
            await fs.mkdir(utilsDir, { recursive: true });
            await fs.writeFile(path.join(utilsDir, 'helpers.dlang'), 'Domain Helpers {}');

            const { resolver } = createResolver();
            
            // Resolve @utils/helpers.dlang from within cached package
            const uri = await resolver.resolveFrom(pkgDir, '@utils/helpers.dlang');
            expect(uri.fsPath).toBe(path.join(utilsDir, 'helpers.dlang'));
        });
    });

    // ==========================================
    // EDGE: Transitive dependencies (cached → cached)
    // ==========================================
    describe('Scenario 3: Transitive dependency resolution', () => {
        test('cached package importing another cached package resolves to top-level cache', async () => {
            // Setup package A (depends on package B)
            const pkgADir = path.join(cacheRoot, 'owner-a', 'repo-a', 'commit-a');
            await fs.mkdir(pkgADir, { recursive: true });

            await fs.writeFile(path.join(pkgADir, 'model.yaml'), `
model:
  name: owner-a/repo-a
  entry: index.dlang

dependencies:
  owner-b/repo-b: "v1.0.0"
`);

            await fs.writeFile(path.join(pkgADir, 'index.dlang'), 'Domain A {}');

            // Create lock file for package A (in cache)
            await fs.writeFile(path.join(pkgADir, 'model.lock'), JSON.stringify({
                version: '1',
                dependencies: {
                    'owner-b/repo-b': {
                        ref: 'v1.0.0',
                        refType: 'tag',
                        resolved: 'https://github.com/owner-b/repo-b',
                        commit: 'commit-b'
                    }
                }
            }, null, 2));

            // Setup package B (in same top-level cache)
            const pkgBDir = path.join(cacheRoot, 'owner-b', 'repo-b', 'commit-b');
            await fs.mkdir(pkgBDir, { recursive: true });

            await fs.writeFile(path.join(pkgBDir, 'model.yaml'), `
model:
  name: owner-b/repo-b
  entry: index.dlang
`);

            await fs.writeFile(path.join(pkgBDir, 'index.dlang'), 'Domain B {}');

            const { resolver } = createResolver();
            
            // Resolve from package A trying to import package B
            const uri = await resolver.resolveFrom(pkgADir, 'owner-b/repo-b');
            
            // Should resolve to package B in TOP-LEVEL cache, not nested cache
            expect(uri.fsPath).toBe(path.join(pkgBDir, 'index.dlang'));
            
            // Verify it's using top-level cache (not pkgADir/.dlang/packages)
            expect(uri.fsPath).toContain(path.join(projectRoot, '.dlang', 'packages'));
            expect(uri.fsPath).not.toContain(path.join(pkgADir, '.dlang'));
        });
    });

    // ==========================================
    // EDGE: getCacheDir() returns project root cache
    // ==========================================
    describe('Scenario 4: getCacheDir() from cached package', () => {
        test('getCacheDir() returns project root cache when initialized from cached package', async () => {
            const pkgDir = path.join(cacheRoot, 'test', 'pkg', 'abc123');
            await fs.mkdir(pkgDir, { recursive: true });

            await fs.writeFile(path.join(pkgDir, 'model.yaml'), `
model:
  name: test/pkg
  entry: index.dlang
`);

            const { workspaceManager } = createResolver();
            
            // Initialize from inside cached package
            await workspaceManager.initialize(pkgDir);
            
            // getCacheDir() should return top-level project cache
            const cacheDir = workspaceManager.getCacheDir();
            
            expect(cacheDir).toBe(cacheRoot);
            expect(cacheDir).not.toContain(path.join(pkgDir, '.dlang'));
        });

        test('getCacheDir() works correctly from nested subdirectory in cached package', async () => {
            const pkgDir = path.join(cacheRoot, 'test', 'nested', 'xyz789');
            const subDir = path.join(pkgDir, 'src', 'deep', 'nested');
            await fs.mkdir(subDir, { recursive: true });

            await fs.writeFile(path.join(pkgDir, 'model.yaml'), `
model:
  name: test/nested
  entry: index.dlang
`);

            const { workspaceManager } = createResolver();
            
            // Initialize from deeply nested directory
            await workspaceManager.initialize(subDir);
            
            // Should still return top-level project cache
            const cacheDir = workspaceManager.getCacheDir();
            expect(cacheDir).toBe(cacheRoot);
        });
    });

    // ==========================================
    // EDGE: Regular project (not in cache) still works
    // ==========================================
    describe('Scenario 5: Regular project behavior unchanged', () => {
        test('getCacheDir() works normally for non-cached projects', async () => {
            const regularProject = path.join(tempDir, 'regular-project');
            await fs.mkdir(regularProject, { recursive: true });

            await fs.writeFile(path.join(regularProject, 'model.yaml'), `
model:
  name: regular-project
  entry: index.dlang
`);

            const { workspaceManager } = createResolver();
            await workspaceManager.initialize(regularProject);
            
            const cacheDir = workspaceManager.getCacheDir();
            expect(cacheDir).toBe(path.join(regularProject, '.dlang', 'packages'));
        });
    });
});
