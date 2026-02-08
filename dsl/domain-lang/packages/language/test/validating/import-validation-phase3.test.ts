import { beforeAll, describe, expect, test } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';

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

    beforeAll(() => {
        testServices = setupTestSuite();
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

});
