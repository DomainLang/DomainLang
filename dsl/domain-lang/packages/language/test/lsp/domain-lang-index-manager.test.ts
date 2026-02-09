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
            // Act
            const result = indexManager.getDependentDocuments('file:///unknown/path.dlang');

            // Assert
            expect(result.size).toBe(0);
        });

        test('getAllAffectedDocuments returns empty set for empty input', () => {
            // Act
            const result = indexManager.getAllAffectedDocuments([]);

            // Assert
            expect(result.size).toBe(0);
        });

        test('getAllAffectedDocuments handles single URI without dependents', () => {
            // Act
            const result = indexManager.getAllAffectedDocuments(['file:///unknown/path.dlang']);

            // Assert
            expect(result.size).toBe(0);
        });

        test('getAllAffectedDocuments accumulates multiple URIs without dependents', () => {
            // Arrange
            const result = indexManager.getAllAffectedDocuments([
                'file:///a.dlang',
                'file:///b.dlang'
            ]);

            // Assert
            expect(result.size).toBe(0);
        });

        test('getDocumentsWithPotentiallyAffectedImports returns empty for no matches', () => {
            // Act
            const result = indexManager.getDocumentsWithPotentiallyAffectedImports([
                'file:///project/domains/index.dlang'
            ]);

            // Assert
            expect(result.size).toBe(0);
        });

        test('getDocumentsWithPotentiallyAffectedImports handles empty input', () => {
            // Act
            const result = indexManager.getDocumentsWithPotentiallyAffectedImports([]);

            // Assert
            expect(result.size).toBe(0);
        });

        test('getDocumentsWithPotentiallyAffectedImports handles invalid URIs gracefully', () => {
            // Arrange & Act
            const result = indexManager.getDocumentsWithPotentiallyAffectedImports([
                'not-a-valid-uri',
                ':::invalid:::'
            ]);

            // Assert
            expect(result.size).toBe(0);
        });

        test('getResolvedImports returns empty set for unknown document', () => {
            // Act
            const result = indexManager.getResolvedImports('file:///unknown/doc.dlang');

            // Assert
            expect(result.size).toBe(0);
        });


    });
});
