/**
 * Tests for DomainLangIndexManager.
 *
 * Verifies import dependency tracking and document indexing with actual imports.
 * Tests real-world scenarios with parsed documents and import relationships.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestSuite, type TestServices, s } from '../test-helpers.js';
import type { DomainLangIndexManager } from '../../src/lsp/domain-lang-index-manager.js';

describe('DomainLangIndexManager', () => {
    let testServices: TestServices;
    let indexManager: DomainLangIndexManager;

    beforeAll(() => {
        testServices = setupTestSuite();
        indexManager = testServices.services.shared.workspace.IndexManager as DomainLangIndexManager;
    });

    // ========================================================================
    // IMPORT DEPENDENCY TRACKING - tests with actual documents
    // ========================================================================

    describe('Import dependency tracking', () => {
        test('tracks import info for documents with imports', async () => {
            // Arrange: Parse a document with an import
            const document = await testServices.parse(s`
                import "./shared/common"
                Domain Sales { vision: "Sales domain" }
            `);

            // Act
            const importInfo = indexManager.getImportInfo(document.uri.toString());

            // Assert: Should have recorded the import
            expect(importInfo.length).toBe(1);
            expect(importInfo[0].specifier).toBe('./shared/common');
        });

        test('tracks import info with aliases', async () => {
            // Arrange: Parse a document with aliased import
            const document = await testServices.parse(s`
                import "ddd-core" as ddd
                Domain Sales { classification: ddd.CoreDomain }
            `);

            // Act
            const importInfo = indexManager.getImportInfo(document.uri.toString());

            // Assert: Should have recorded the import with alias
            expect(importInfo.length).toBe(1);
            expect(importInfo[0].specifier).toBe('ddd-core');
            expect(importInfo[0].alias).toBe('ddd');
        });

        test('tracks multiple imports in same document', async () => {
            // Arrange: Parse a document with multiple imports
            const document = await testServices.parse(s`
                import "./domains/sales"
                import "./domains/billing" as billing
                import "external-package"
                Domain Main {}
            `);

            // Act
            const importInfo = indexManager.getImportInfo(document.uri.toString());

            // Assert: Should have recorded all three imports
            expect(importInfo.length).toBe(3);
            expect(importInfo.map(i => i.specifier)).toContain('./domains/sales');
            expect(importInfo.map(i => i.specifier)).toContain('./domains/billing');
            expect(importInfo.map(i => i.specifier)).toContain('external-package');
        });

        test('returns empty import info for documents without imports', async () => {
            // Arrange: Parse a document without imports
            const document = await testServices.parse(s`
                Domain Sales { vision: "Standalone domain" }
            `);

            // Act
            const importInfo = indexManager.getImportInfo(document.uri.toString());

            // Assert: Should return empty array, not undefined
            expect(importInfo).toEqual([]);
        });

        test('clears import dependencies when requested', async () => {
            // Arrange: Parse a document with imports
            const document = await testServices.parse(s`
                import "./shared/common"
                Domain Sales {}
            `);
            
            const uriString = document.uri.toString();
            const initialInfo = indexManager.getImportInfo(uriString);
            expect(initialInfo.length).toBeGreaterThan(0);

            // Act
            indexManager.clearImportDependencies();

            // Assert: Import info should be cleared
            const clearedInfo = indexManager.getImportInfo(uriString);
            expect(clearedInfo).toEqual([]);
        });

        test('handles documents with parser errors gracefully', async () => {
            // Arrange: Parse a document with syntax errors
            const document = await testServices.parse(s`
                import "./broken
                Domain Sales {
            `);

            // Act & Assert: Should not throw when accessing import info
            const importInfo = indexManager.getImportInfo(document.uri.toString());
            expect(Array.isArray(importInfo)).toBe(true);
        });

        test('markForReprocessing accepts valid document URI', async () => {
            // Arrange: Parse a document
            const document = await testServices.parse(s`
                Domain Sales {}
            `);

            // Act & Assert: Should not throw
            expect(() => {
                indexManager.markForReprocessing(document.uri.toString());
            }).not.toThrow();
        });

        test('markForReprocessing handles unknown document URI gracefully', () => {
            // Act & Assert: Should not throw for unknown URIs
            expect(() => {
                indexManager.markForReprocessing('file:///unknown/path.dlang');
            }).not.toThrow();
        });
    });
});
