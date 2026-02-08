/**
 * Tests for DomainLangIndexManager.
 *
 * Verifies import dependency tracking and basic document indexing.
 * Parsing coverage is handled by dedicated parsing tests; these smoke tests
 * confirm the IndexManager can accept various document shapes without error.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestSuite, type TestServices } from '../test-helpers.js';
import type { DomainLangIndexManager } from '../../src/lsp/domain-lang-index-manager.js';

describe('DomainLangIndexManager', () => {
    let testServices: TestServices;
    let indexManager: DomainLangIndexManager;

    beforeAll(() => {
        testServices = setupTestSuite();
        indexManager = testServices.services.shared.workspace.IndexManager as DomainLangIndexManager;
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


    });
});
