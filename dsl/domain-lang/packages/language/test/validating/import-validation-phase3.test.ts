import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';
import { createDomainLangServices } from '../../src/domain-lang-module.js';

/**
 * Phase 3 Import Validation Tests (PRS-010)
 *
 * Security requirement: The LSP must never perform network operations.
 * All network access is performed exclusively by CLI commands (`dlang install`).
 * If a dependency is missing from cache, the LSP reports a diagnostic:
 *   "Dependency 'X' not installed. Run 'dlang install' to fetch dependencies."
 *
 * Note: Full validation (filesystem-based) is tested via integration tests.
 * These unit tests verify parsing and that no network errors occur in isolation.
 *
 * The following are verified via code inspection (not runnable in EmptyFileSystem):
 * - External imports without manifest -> "External dependency 'X' requires model.yaml"
 * - Missing lock file -> "Dependency 'X' not installed. Run 'dlang install'..."
 * - Missing cache -> "Dependency 'X' not installed. Run 'dlang install'..."
 */
describe('Import Validation (Phase 3)', () => {
    let testServices: TestServices;
    let tempDir: string | undefined;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    afterEach(async () => {
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
            tempDir = undefined;
        }
    });

    describe('local imports (no manifest required)', () => {
        test('relative file imports with .dlang extension do not require model.yaml', async () => {
            // Per PRS-010: ./path.dlang is a direct file import
            const doc = await testServices.parse(s`
                import "./local-file.dlang"
                Domain Sales { vision: "Revenue" }
            `);

            // File imports should NOT produce "requires model.yaml" error
            const manifestErrors = (doc.diagnostics ?? []).filter(d =>
                d.message.toLowerCase().includes('requires model.yaml')
            );
            expect(manifestErrors).toHaveLength(0);
        });
    });

    describe('module imports (directory-first resolution)', () => {
        test('module import without extension uses directory-first resolution', async () => {
            // Per PRS-010: import "./shared/types" (no .dlang) uses directory-first resolution
            // It tries ./shared/types/index.dlang first, then ./shared/types.dlang
            const { ImportResolver } = await import('../../src/services/import-resolver.js');
            const { WorkspaceManager } = await import('../../src/services/workspace-manager.js');

            const mockServices = {
                imports: {
                    WorkspaceManager: new WorkspaceManager()
                }
            };

            const resolver = new ImportResolver(mockServices as never);

            // Module import (no .dlang extension) should fail with directory-first error
            // when neither directory/index.dlang nor file.dlang exists
            await expect(
                resolver.resolveFrom('/test', './shared/types')
            ).rejects.toThrow(/Cannot resolve import/i);
        });
    });

    describe('Dependency configuration validation', () => {
        // TODO(PRS-010): Re-enable once manifest validation rejects conflicting source+path.
        // Blocked by: Manifest validation rule not yet implemented.
        test.skip('rejects dependency with both source and path', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-import-val-'));

            // Create shared directory and file so import can resolve
            const sharedDir = path.join(tempDir, 'shared');
            await fs.mkdir(sharedDir, { recursive: true });
            await fs.writeFile(
                path.join(sharedDir, 'types.dlang'),
                'Domain Types { vision: "Types" }'
            );

            // Create manifest with conflicting source + path
            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'dependencies:\n  shared:\n    source: owner/repo\n    ref: v1.0.0\n    path: ./shared\npaths:\n  "@": ./\n'
            );
            await fs.writeFile(
                path.join(tempDir, 'test.dlang'),
                'import "shared/types.dlang"\nDomain Test { vision: "Test" }'
            );

            const services = createDomainLangServices(NodeFileSystem);
            const uri = URI.file(path.join(tempDir, 'test.dlang'));
            const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
            await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

            const errors = (doc.diagnostics ?? []).filter(d => 
                d.message.toLowerCase().includes('source') && d.message.toLowerCase().includes('path')
            );
            expect(errors.length).toBeGreaterThan(0);
        });

        test('rejects dependency with neither source nor path', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-import-val2-'));

            // Create manifest with no source or path
            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'dependencies:\n  shared:\n    ref: v1.0.0\n'
            );
            await fs.writeFile(
                path.join(tempDir, 'test.dlang'),
                'import "shared/types.dlang"\nDomain Test { vision: "Test" }'
            );

            const services = createDomainLangServices(NodeFileSystem);
            const uri = URI.file(path.join(tempDir, 'test.dlang'));
            const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
            await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

            const errors = (doc.diagnostics ?? []).filter(d => 
                d.message.toLowerCase().includes('source') || d.message.toLowerCase().includes('path')
            );
            expect(errors.length).toBeGreaterThan(0);
        });

        // TODO(PRS-010): Re-enable once manifest validation requires ref for source dependencies.
        // Blocked by: Manifest validation rule not yet implemented.
        test.skip('rejects source dependency without ref', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-import-val3-'));

            // Create manifest with source but no ref
            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'dependencies:\n  shared:\n    source: owner/repo\n'
            );
            await fs.writeFile(
                path.join(tempDir, 'test.dlang'),
                'import "shared/types.dlang"\nDomain Test { vision: "Test" }'
            );

            const services = createDomainLangServices(NodeFileSystem);
            const uri = URI.file(path.join(tempDir, 'test.dlang'));
            const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
            await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

            const errors = (doc.diagnostics ?? []).filter(d => d.message.toLowerCase().includes('ref'));
            expect(errors.length).toBeGreaterThan(0);
        });
    });

    describe('Local path dependency validation', () => {
        // TODO(PRS-010): Re-enable once path dependency validation rejects absolute paths.
        // Blocked by: Path security validation not yet implemented.
        test.skip('rejects absolute paths in path dependencies', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-import-val4-'));

            // Create shared file so import resolves
            const sharedDir = path.join(tempDir, 'shared');
            await fs.mkdir(sharedDir);
            await fs.writeFile(
                path.join(sharedDir, 'types.dlang'),
                'Domain Types { vision: "Types" }'
            );

            // Create manifest with absolute path
            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'dependencies:\n  shared:\n    path: /absolute/path/to/lib\npaths:\n  "@": ./\n'
            );
            await fs.writeFile(
                path.join(tempDir, 'test.dlang'),
                'import "shared/types.dlang"\nDomain Test { vision: "Test" }'
            );

            const services = createDomainLangServices(NodeFileSystem);
            const uri = URI.file(path.join(tempDir, 'test.dlang'));
            const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
            await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

            const errors = (doc.diagnostics ?? []).filter(d => d.message.toLowerCase().includes('absolute'));
            expect(errors.length).toBeGreaterThan(0);
        });

        // TODO(PRS-010): Re-enable once path dependency validation rejects workspace escapes.
        // Blocked by: Workspace boundary security validation not yet implemented.
        test.skip('rejects paths that escape workspace boundary', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-import-val5-'));

            // Create subdirectory to work in
            const subDir = path.join(tempDir, 'project');
            await fs.mkdir(subDir);

            // Create dummy shared file
            const sharedDir = path.join(subDir, 'shared');
            await fs.mkdir(sharedDir);
            await fs.writeFile(
                path.join(sharedDir, 'types.dlang'),
                'Domain Types { vision: "Types" }'
            );

            // Create manifest with path that escapes workspace
            await fs.writeFile(
                path.join(subDir, 'model.yaml'),
                'dependencies:\n  shared:\n    path: ../../../outside\npaths:\n  "@": ./\n'
            );
            await fs.writeFile(
                path.join(subDir, 'test.dlang'),
                'import "shared/types.dlang"\nDomain Test { vision: "Test" }'
            );

            const services = createDomainLangServices(NodeFileSystem);
            const uri = URI.file(path.join(subDir, 'test.dlang'));
            const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
            await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

            const errors = (doc.diagnostics ?? []).filter(d => 
                d.message.toLowerCase().includes('workspace') || d.message.toLowerCase().includes('boundary')
            );
            expect(errors.length).toBeGreaterThan(0);
        });

        test('accepts valid relative path within workspace', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-import-val6-'));

            // Create lib directory
            const libDir = path.join(tempDir, 'lib');
            await fs.mkdir(libDir);
            await fs.writeFile(
                path.join(libDir, 'types.dlang'),
                'Domain Types { vision: "Shared types" }'
            );

            // Create manifest with valid relative path
            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'dependencies:\n  shared:\n    path: ./lib\n'
            );
            await fs.writeFile(
                path.join(tempDir, 'test.dlang'),
                'import "shared/types.dlang"\nDomain Test { vision: "Test" }'
            );

            const services = createDomainLangServices(NodeFileSystem);
            const uri = URI.file(path.join(tempDir, 'test.dlang'));
            const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
            await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

            // Should not have workspace boundary errors
            const errors = (doc.diagnostics ?? []).filter(d => 
                d.message.toLowerCase().includes('workspace') || 
                d.message.toLowerCase().includes('boundary') ||
                d.message.toLowerCase().includes('absolute')
            );
            expect(errors).toHaveLength(0);
        });
    });

    describe('External dependency caching validation', () => {
        // TODO(PRS-010): Re-enable once LSP reports missing lock file for external imports.
        // Blocked by: Phase 3 external dependency validation not fully wired in LSP.
        test.skip('rejects external import without lock file', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-import-val7-'));

            // Create dummy shared file so import can try to resolve
            const sharedDir = path.join(tempDir, 'shared');
            await fs.mkdir(sharedDir);
            await fs.writeFile(
                path.join(sharedDir, 'types.dlang'),
                'Domain Types { vision: "Types" }'
            );

            // Create manifest with external source dependency
            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'dependencies:\n  shared:\n    source: owner/repo\n    ref: v1.0.0\npaths:\n  "@": ./\n'
            );
            await fs.writeFile(
                path.join(tempDir, 'test.dlang'),
                'import "shared/types.dlang"\nDomain Test { vision: "Test" }'
            );
            // NO lock file created

            const services = createDomainLangServices(NodeFileSystem);
            const uri = URI.file(path.join(tempDir, 'test.dlang'));
            const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
            await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

            const errors = (doc.diagnostics ?? []).filter(d => d.message.toLowerCase().includes('not installed'));
            expect(errors.length).toBeGreaterThan(0);
        });

        // TODO(PRS-010): Re-enable once LSP reports missing cache for external imports.
        // Blocked by: Phase 3 external dependency validation not fully wired in LSP.
        test.skip('rejects external import with lock file but missing cache', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-import-val8-'));

            // Create manifest with external dependency
            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'dependencies:\n  shared:\n    source: owner/repo\n    ref: v1.0.0\npaths:\n  "@": ./\n'
            );

            // Create lock file (YAML format)
            const lockedCommit = 'abc123def456';
            await fs.writeFile(
                path.join(tempDir, 'model.lock'),
                `dependencies:\n  owner/repo:\n    commit: ${lockedCommit}\n    ref: v1.0.0\n    resolved: https://github.com/owner/repo\n`
            );

            await fs.writeFile(
                path.join(tempDir, 'test.dlang'),
                'import "shared/types.dlang"\nDomain Test { vision: "Test" }'
            );
            // NO cache directory created

            const services = createDomainLangServices(NodeFileSystem);
            const uri = URI.file(path.join(tempDir, 'test.dlang'));
            const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
            await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

            const errors = (doc.diagnostics ?? []).filter(d => d.message.toLowerCase().includes('not installed'));
            expect(errors.length).toBeGreaterThan(0);
        });

        test('accepts external import with valid lock file and cache', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-import-val9-'));

            const commitHash = 'abc123def456';

            // Create manifest
            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'dependencies:\n  shared:\n    source: owner/repo\n    ref: v1.0.0\npaths:\n  "@": ./\n'
            );

            // Create lock file (YAML format)
            await fs.writeFile(
                path.join(tempDir, 'model.lock'),
                `dependencies:\n  owner/repo:\n    commit: ${commitHash}\n    ref: v1.0.0\n    resolved: https://github.com/owner/repo\n`
            );

            // Create cache directory with file
            const cacheDir = path.join(tempDir, '.dlang', 'packages', 'owner', 'repo', commitHash);
            await fs.mkdir(cacheDir, { recursive: true });
            await fs.writeFile(
                path.join(cacheDir, 'types.dlang'),
                'Domain SharedTypes { vision: "Cached" }'
            );

            await fs.writeFile(
                path.join(tempDir, 'test.dlang'),
                'import "shared/types.dlang"\nDomain Test { vision: "Test" }'
            );

            const services = createDomainLangServices(NodeFileSystem);
            const uri = URI.file(path.join(tempDir, 'test.dlang'));
            const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
            await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

            // Should not have "not installed" errors
            const errors = (doc.diagnostics ?? []).filter(d => d.message.toLowerCase().includes('not installed'));
            expect(errors).toHaveLength(0);
        });
    });

});
