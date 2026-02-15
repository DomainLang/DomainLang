/**
 * Tests for DomainLangIndexManager.
 *
 * Verifies import dependency tracking, transitive change detection via isAffected(),
 * and specifier-sensitive matching for file renames/moves.
 * 
 * Tests real-world scenarios with parsed documents and import relationships.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
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

    // ========================================================================
    // isAffected() - TRANSITIVE + SPECIFIER DEPENDENCY DETECTION
    // ========================================================================

    describe('isAffected()', () => {
        // Clear dependency graph before each test to isolate state
        beforeEach(() => {
            indexManager.clearImportDependencies();
        });

        test('returns false when document has no relationship to changed files', async () => {
            // Arrange: Parse two independent documents
            const docA = await testServices.parse(s`
                Domain Alpha { vision: "Independent domain" }
            `);
            const docB = await testServices.parse(s`
                Domain Beta { vision: "Also independent" }
            `);

            // Act: Check if docA is affected by changes to docB
            const changedUris = new Set([docB.uri.toString()]);
            const result = indexManager.isAffected(docA, changedUris);

            // Assert: No import relationship → not affected
            expect(result).toBe(false);
        });

        test('detects direct import dependency', async () => {
            // Arrange: Parse shared document, then document that imports it
            const shared = await testServices.parse(s`
                Domain SharedDomain { vision: "Shared" }
            `);
            const importer = await testServices.parse(s`
                import "${shared.uri.path}"
                Domain Importer { vision: "Uses shared" }
            `);

            // Act: Check if importer is affected by change to shared
            const changedUris = new Set([shared.uri.toString()]);
            const result = indexManager.isAffected(importer, changedUris);

            // Assert: Direct import → affected
            expect(result).toBe(true);
        });

        test('detects transitive import dependency (A→B→C, C changes)', async () => {
            // Arrange: Build a chain: C ← B ← A
            const docC = await testServices.parse(s`
                Domain LeafDomain { vision: "Leaf" }
            `);
            const docB = await testServices.parse(s`
                import "${docC.uri.path}"
                Domain MiddleDomain { vision: "Middle" }
            `);
            const docA = await testServices.parse(s`
                import "${docB.uri.path}"
                Domain RootDomain { vision: "Root" }
            `);

            // Act: C changes — A is two hops away
            const changedUris = new Set([docC.uri.toString()]);
            const resultA = indexManager.isAffected(docA, changedUris);
            const resultB = indexManager.isAffected(docB, changedUris);

            // Assert: Both A and B are transitively affected by C changing
            expect(resultB).toBe(true);
            expect(resultA).toBe(true);
        });

        test('caches affected set across multiple isAffected() calls in same cycle', async () => {
            // Arrange: Create documents with a dependency chain
            const leaf = await testServices.parse(s`
                Domain Leaf { vision: "Changed file" }
            `);
            const mid = await testServices.parse(s`
                import "${leaf.uri.path}"
                Domain Mid { vision: "Mid" }
            `);
            const root = await testServices.parse(s`
                import "${mid.uri.path}"
                Domain Root { vision: "Root" }
            `);

            // Act: Use the SAME changedUris Set for multiple calls
            // (simulates Langium's update() cycle which reuses the Set)
            const changedUris = new Set([leaf.uri.toString()]);
            const result1 = indexManager.isAffected(mid, changedUris);
            const result2 = indexManager.isAffected(root, changedUris);

            // Assert: Both correctly detected as affected
            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });

        test('different changedUris Set invalidates cache', async () => {
            // Arrange: Two independent documents
            const docX = await testServices.parse(s`
                Domain DocX { vision: "X" }
            `);
            const docY = await testServices.parse(s`
                Domain DocY { vision: "Y" }
            `);

            // Act: Two separate update cycles (different Set instances)
            const changedUris1 = new Set([docX.uri.toString()]);
            const changedUris2 = new Set([docY.uri.toString()]);
            const result1 = indexManager.isAffected(docY, changedUris1);
            const result2 = indexManager.isAffected(docX, changedUris2);

            // Assert: Neither is affected by the other
            expect(result1).toBe(false);
            expect(result2).toBe(false);
        });

        test('handles diamond import pattern (A→B, A→C, B→D, C→D)', async () => {
            // Arrange: Diamond: D ← B ← A and D ← C ← A
            const docD = await testServices.parse(s`
                Domain Diamond { vision: "Shared leaf" }
            `);
            const docB = await testServices.parse(s`
                import "${docD.uri.path}"
                Domain BranchB { vision: "Branch B" }
            `);
            const docC = await testServices.parse(s`
                import "${docD.uri.path}"
                Domain BranchC { vision: "Branch C" }
            `);
            const docA = await testServices.parse(s`
                import "${docB.uri.path}"
                import "${docC.uri.path}"
                Domain Root { vision: "Root" }
            `);

            // Act: D changes
            const changedUris = new Set([docD.uri.toString()]);
            const resultA = indexManager.isAffected(docA, changedUris);
            const resultB = indexManager.isAffected(docB, changedUris);
            const resultC = indexManager.isAffected(docC, changedUris);

            // Assert: All three are affected by D changing
            expect(resultB).toBe(true);
            expect(resultC).toBe(true);
            expect(resultA).toBe(true);
        });

        test('getAllAffectedDocuments returns transitive dependents', async () => {
            // Arrange: C ← B ← A chain
            const docC = await testServices.parse(s`
                Domain TransC { vision: "Leaf" }
            `);
            const docB = await testServices.parse(s`
                import "${docC.uri.path}"
                Domain TransB { vision: "Middle" }
            `);
            const docA = await testServices.parse(s`
                import "${docB.uri.path}"
                Domain TransA { vision: "Root" }
            `);

            // Act: Get all affected when C changes
            const affected = indexManager.getAllAffectedDocuments([docC.uri.toString()]);

            // Assert: Both B and A are transitively affected
            expect(affected.has(docB.uri.toString())).toBe(true);
            expect(affected.has(docA.uri.toString())).toBe(true);
            // C itself should NOT be in the result (it's the changed file)
            expect(affected.has(docC.uri.toString())).toBe(false);
        });

        test('getDependentDocuments returns direct importers only', async () => {
            // Arrange: C ← B ← A chain
            const docC = await testServices.parse(s`
                Domain DepC { vision: "Leaf" }
            `);
            const docB = await testServices.parse(s`
                import "${docC.uri.path}"
                Domain DepB { vision: "Middle" }
            `);
            await testServices.parse(s`
                import "${docB.uri.path}"
                Domain DepA { vision: "Root" }
            `);

            // Act: Get direct dependents of C
            const dependents = indexManager.getDependentDocuments(docC.uri.toString());

            // Assert: Only B directly imports C
            expect(dependents.has(docB.uri.toString())).toBe(true);
            expect(dependents.size).toBe(1);
        });
    });

    // ========================================================================
    // CLEANUP ON REMOVAL
    // ========================================================================

    describe('Cleanup on removal', () => {
        test('removeContent clears import info for removed document', async () => {
            // Arrange
            const doc = await testServices.parse(s`
                import "./something"
                Domain Cleanup {}
            `);
            const uri = doc.uri;
            expect(indexManager.getImportInfo(uri.toString()).length).toBeGreaterThan(0);

            // Act
            indexManager.removeContent(uri);

            // Assert
            expect(indexManager.getImportInfo(uri.toString())).toEqual([]);
        });

        test('remove clears import info for removed document', async () => {
            // Arrange
            const doc = await testServices.parse(s`
                import "./dep"
                Domain RemoveTest {}
            `);
            const uri = doc.uri;
            expect(indexManager.getImportInfo(uri.toString()).length).toBeGreaterThan(0);

            // Act
            indexManager.remove(uri);

            // Assert
            expect(indexManager.getImportInfo(uri.toString())).toEqual([]);
        });
    });
});
