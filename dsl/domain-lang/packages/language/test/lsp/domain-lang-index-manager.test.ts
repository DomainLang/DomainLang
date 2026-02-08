/**
 * Tests for DomainLangIndexManager.
 *
 * Verifies import dependency tracking and basic document indexing.
 * Parsing coverage is handled by dedicated parsing tests; these smoke tests
 * confirm the IndexManager can accept various document shapes without error.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { DocumentState } from 'langium';
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
    // SMOKE TESTS - confirm indexing works for representative document shapes
    // ========================================================================

    describe('Document indexing (smoke tests)', () => {
        test('indexes a fully featured document without errors', async () => {
            const document = await testServices.parse(s`
                import "core/framework@v1.0.0"

                Domain Sales { vision: "Customer sales" }
                Team SalesTeam
                Classification Core

                bc OrderContext for Sales as Core by SalesTeam {
                    description: "Order processing"
                }
                bc PaymentContext for Sales {
                    description: "Payment processing"
                }

                ContextMap SalesMap {
                    contains OrderContext, PaymentContext
                    [OHS] PaymentContext <- [CF] OrderContext
                }
            `);

            expect(document.parseResult.lexerErrors).toHaveLength(0);
            expect(document.parseResult.parserErrors).toHaveLength(0);
            expect(document.state).toBeGreaterThanOrEqual(DocumentState.IndexedContent);
        });

        test('indexes document with namespace and imports', async () => {
            const document = await testServices.parse(s`
                import "core/base@v1.0.0"
                Namespace acme.sales {
                    Domain Sales { vision: "Sales" }
                    bc OrderContext for Sales
                }
            `);

            expect(document.parseResult.lexerErrors).toHaveLength(0);
            expect(document.parseResult.parserErrors).toHaveLength(0);
            expect(document.state).toBeGreaterThanOrEqual(DocumentState.IndexedContent);
        });

        test('indexes multiple documents without errors', async () => {
            const doc1 = await testServices.parse(s`Domain First { vision: "v" }`);
            const doc2 = await testServices.parse(s`Domain Second { vision: "v" }`);

            expect(doc1.parseResult.parserErrors).toHaveLength(0);
            expect(doc1.state).toBeGreaterThanOrEqual(DocumentState.IndexedContent);

            expect(doc2.parseResult.parserErrors).toHaveLength(0);
            expect(doc2.state).toBeGreaterThanOrEqual(DocumentState.IndexedContent);
        });
    });

    // ========================================================================
    // IMPORT DEPENDENCY TRACKING - tests the actual IndexManager API surface
    // ========================================================================

    describe('Import dependency tracking', () => {
        test('getDependentDocuments returns empty set for unknown URI', () => {
            const result = indexManager.getDependentDocuments('file:///unknown/path.dlang');
            expect(result.size).toBe(0);
        });

        test('getAllAffectedDocuments returns empty set for empty input', () => {
            const result = indexManager.getAllAffectedDocuments([]);
            expect(result.size).toBe(0);
        });

        test('getAllAffectedDocuments handles single URI without dependents', () => {
            const result = indexManager.getAllAffectedDocuments(['file:///unknown/path.dlang']);
            expect(result.size).toBe(0);
        });

        test('getAllAffectedDocuments accumulates multiple URIs without dependents', () => {
            const result = indexManager.getAllAffectedDocuments([
                'file:///a.dlang',
                'file:///b.dlang'
            ]);
            expect(result.size).toBe(0);
        });

        test('getDocumentsWithPotentiallyAffectedImports returns empty for no matches', () => {
            const result = indexManager.getDocumentsWithPotentiallyAffectedImports([
                'file:///project/domains/index.dlang'
            ]);
            expect(result.size).toBe(0);
        });

        test('getDocumentsWithPotentiallyAffectedImports handles empty input', () => {
            const result = indexManager.getDocumentsWithPotentiallyAffectedImports([]);
            expect(result.size).toBe(0);
        });

        test('getDocumentsWithPotentiallyAffectedImports handles invalid URIs gracefully', () => {
            const result = indexManager.getDocumentsWithPotentiallyAffectedImports([
                'not-a-valid-uri',
                ':::invalid:::'
            ]);
            expect(result.size).toBe(0);
        });

        test('getResolvedImports returns empty set for unknown document', () => {
            const result = indexManager.getResolvedImports('file:///unknown/doc.dlang');
            expect(result.size).toBe(0);
        });

        test('clearImportDependencies does not throw', () => {
            // Verify it doesn't throw even with no prior state
            indexManager.getDependentDocuments('file:///a.dlang');
            // Clear should not throw
            expect(() => indexManager.clearImportDependencies()).not.toThrow();
        });

        test('markForReprocessing does not throw for unknown URI', () => {
            expect(() => indexManager.markForReprocessing('file:///unknown.dlang')).not.toThrow();
        });
    });
});
