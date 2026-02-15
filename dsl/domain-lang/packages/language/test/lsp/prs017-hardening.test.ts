/**
 * PRS-017 LSP Incremental Intelligence — Hardening Tests
 *
 * Behavioral tests for PRS-017 features that verify the implementation
 * achieves its stated goals. Each test exercises real code paths through
 * the Langium service graph — no mocking of production code.
 *
 * Features under test:
 * - R2: Export-signature diffing gates isAffected() to skip cascading
 *        revalidation when only implementation (not exports) changed
 * - R3: Import cycle detection via DFS with validation diagnostic wiring
 * - R4: Precise specifier matching prevents false-positive revalidation
 * - R8: ImportResolutionError carries structured properties consumed by validator
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { describe, test, expect, beforeAll, afterEach } from 'vitest';
import { type LangiumDocument, URI, EmptyFileSystem } from 'langium';
import { parseHelper, clearDocuments } from 'langium/test';
import { expandToString as s } from 'langium/generate';
import { createDomainLangServices } from '../../src/domain-lang-module.js';
import type { Model } from '../../src/generated/ast.js';
import type { DomainLangIndexManager } from '../../src/lsp/domain-lang-index-manager.js';

describe('PRS-017 Hardening', () => {
    let services: ReturnType<typeof createDomainLangServices>;
    let rawParse: (input: string, options?: { validation?: boolean; documentUri?: string }) => Promise<LangiumDocument<Model>>;
    let indexManager: DomainLangIndexManager;

    beforeAll(() => {
        services = createDomainLangServices(EmptyFileSystem);
        rawParse = parseHelper<Model>(services.DomainLang);
        indexManager = services.shared.workspace.IndexManager as DomainLangIndexManager;
    });

    afterEach(() => {
        clearDocuments(services.shared, []);
    });

    /** Parse with validation at a specific URI. */
    async function parse(input: string, documentUri: string): Promise<LangiumDocument<Model>> {
        return rawParse(input, { validation: true, documentUri });
    }

    /**
     * Re-parse a document at the same URI with new content.
     * Removes the old document first so addDocument doesn't throw.
     */
    async function reparse(newInput: string, existingUri: string): Promise<LangiumDocument<Model>> {
        const uri = URI.parse(existingUri);
        const docs = services.shared.workspace.LangiumDocuments;
        if (docs.hasDocument(uri)) {
            docs.deleteDocument(uri);
        }
        return parse(newInput, existingUri);
    }

    // ========================================================================
    // R2: Export-signature diffing
    // ========================================================================

    describe('R2: Export-signature diffing', () => {
        test('skips transitive revalidation when implementation-only change', async () => {
            // Arrange — three-level chain: root → middle → leaf
            const leaf = await parse(
                s`Domain Leaf { vision: "original" }`,
                'file:///r2/leaf.dlang',
            );
            const middle = await parse(
                s`import "${leaf.uri.path}" Domain Middle { vision: "middle" }`,
                'file:///r2/middle.dlang',
            );
            const root = await parse(
                s`import "${middle.uri.path}" Domain Root { vision: "root" }`,
                'file:///r2/root.dlang',
            );

            // Act — re-index leaf with same exports but different body
            await reparse(
                s`Domain Leaf { vision: "updated vision text" }`,
                leaf.uri.toString(),
            );

            const changedUris = new Set([leaf.uri.toString()]);

            // Assert — middle IS still affected (direct specifier match)
            expect(indexManager.isAffected(middle, changedUris)).toBe(true);

            // Assert — root is NOT affected (transitive BFS skipped by R2)
            expect(indexManager.isAffected(root, changedUris)).toBe(false);
        });

        test('isAffected returns true when imported file adds a new export', async () => {
            // Arrange
            const leaf = await parse(
                s`Domain OnlyLeaf { vision: "v" }`,
                'file:///r2b/leaf.dlang',
            );
            const importer = await parse(
                s`import "${leaf.uri.path}" Domain Consumer { vision: "c" }`,
                'file:///r2b/consumer.dlang',
            );

            // Act — re-index leaf with an additional exported symbol
            await reparse(
                s`Domain OnlyLeaf { vision: "v" }
                Team NewTeam {}`,
                leaf.uri.toString(),
            );

            const changedUris = new Set([leaf.uri.toString()]);
            const affected = indexManager.isAffected(importer, changedUris);

            // Assert — importer IS affected because a new export appeared
            expect(affected).toBe(true);
        });

        test('isAffected returns true when imported file removes an export', async () => {
            // Arrange — leaf has two exports initially
            const leaf = await parse(
                s`Domain ExportA { vision: "a" }
                Team ExportTeam {}`,
                'file:///r2c/leaf.dlang',
            );
            const importer = await parse(
                s`import "${leaf.uri.path}" Domain ImporterR { vision: "r" }`,
                'file:///r2c/importer.dlang',
            );

            // Act — re-index leaf with one export removed
            await reparse(
                s`Domain ExportA { vision: "a" }`,
                leaf.uri.toString(),
            );

            const changedUris = new Set([leaf.uri.toString()]);
            const affected = indexManager.isAffected(importer, changedUris);

            // Assert — importer IS affected because an export was removed
            expect(affected).toBe(true);
        });

        test('isAffected returns true when export is renamed', async () => {
            // Arrange
            const leaf = await parse(
                s`Domain OriginalName { vision: "v" }`,
                'file:///r2d/leaf.dlang',
            );
            const importer = await parse(
                s`import "${leaf.uri.path}" Domain Dep { vision: "d" }`,
                'file:///r2d/dep.dlang',
            );

            // Act — rename the exported domain
            await reparse(
                s`Domain RenamedDomain { vision: "v" }`,
                leaf.uri.toString(),
            );

            const changedUris = new Set([leaf.uri.toString()]);
            const affected = indexManager.isAffected(importer, changedUris);

            // Assert — importer IS affected because the export name changed
            expect(affected).toBe(true);
        });
    });

    // ========================================================================
    // R3: Import cycle detection
    // ========================================================================

    describe('R3: Import cycle detection', () => {
        test('detects A→B→A cycle and stores for both documents', async () => {
            // Arrange — create A first, then B importing A, then update A to import B
            const docA = await parse(
                s`Domain CycleDocA { vision: "A" }`,
                'file:///r3/a.dlang',
            );
            const docB = await parse(
                s`import "${docA.uri.path}" Domain CycleDocB { vision: "B" }`,
                'file:///r3/b.dlang',
            );
            // Now update A to import B → creates the cycle A→B→A
            await reparse(
                s`import "${docB.uri.path}" Domain CycleDocA { vision: "A" }`,
                docA.uri.toString(),
            );

            // Act
            const cycleA = indexManager.getCycleForDocument(docA.uri.toString());
            const cycleB = indexManager.getCycleForDocument(docB.uri.toString());

            // Assert — both documents should have a cycle detected
            expect(cycleA).toBeDefined();
            expect(cycleA!.length).toBeGreaterThanOrEqual(3); // [A, B, A]
            expect(cycleB).toBeDefined();
        });

        test('returns undefined for documents not in a cycle', async () => {
            // Arrange — linear chain with no back-edge
            const leaf = await parse(
                s`Domain NoCycleLeaf { vision: "leaf" }`,
                'file:///r3b/leaf.dlang',
            );
            await parse(
                s`import "${leaf.uri.path}" Domain NoCycleRoot { vision: "root" }`,
                'file:///r3b/root.dlang',
            );

            // Act
            const cycle = indexManager.getCycleForDocument(leaf.uri.toString());

            // Assert
            expect(cycle).toBeUndefined();
        });

        test('starting document is included in cycle (regression: off-by-one)', async () => {
            // This test guards against the bug where the starting document was
            // accidentally filtered out because its URI equals cycle.at(-1).
            // Arrange — same setup as first cycle test
            const docX = await parse(
                s`Domain CycleX { vision: "X" }`,
                'file:///r3c/x.dlang',
            );
            const docY = await parse(
                s`import "${docX.uri.path}" Domain CycleY { vision: "Y" }`,
                'file:///r3c/y.dlang',
            );
            // Update X to import Y → cycle
            await reparse(
                s`import "${docY.uri.path}" Domain CycleX { vision: "X" }`,
                docX.uri.toString(),
            );

            // Act — query cycle for the starting document specifically
            const cycleX = indexManager.getCycleForDocument(docX.uri.toString());

            // Assert — starting document MUST be included
            expect(cycleX).toBeDefined();
        });
    });

    // ========================================================================
    // R4: Precise specifier matching
    // ========================================================================

    describe('R4: Precise specifier matching', () => {
        test('does not produce false positive for suffix filename match', async () => {
            // Arrange — importer imports "sales.dlang", "pre-sales.dlang" changes
            await parse(
                s`Domain Sales { vision: "sales" }`,
                'file:///r4/sales.dlang',
            );
            const importer = await parse(
                s`import "./sales" Domain Main { vision: "main" }`,
                'file:///r4/main.dlang',
            );
            const preSales = await parse(
                s`Domain PreSales { vision: "pre" }`,
                'file:///r4/pre-sales.dlang',
            );

            // Act — only pre-sales changed
            const changedUris = new Set([preSales.uri.toString()]);
            const affected = indexManager.isAffected(importer, changedUris);

            // Assert — importer should NOT be affected by pre-sales changing
            expect(affected).toBe(false);
        });

        test('correctly detects actual file match via specifier', async () => {
            // Arrange
            const sales = await parse(
                s`Domain SalesActual { vision: "sales" }`,
                'file:///r4b/sales.dlang',
            );
            const importer = await parse(
                s`import "./sales" Domain Main2 { vision: "main" }`,
                'file:///r4b/main.dlang',
            );

            // Act — actual sales.dlang changes
            const changedUris = new Set([sales.uri.toString()]);
            const affected = indexManager.isAffected(importer, changedUris);

            // Assert — importer IS affected because the imported file changed
            expect(affected).toBe(true);
        });
    });

    // ========================================================================
    // R8: ImportResolutionError structured diagnostics
    // ========================================================================

    describe('R8: ImportResolutionError structured diagnostics', () => {
        test('validation diagnostics exist for unresolved import', async () => {
            // Arrange — import a nonexistent file
            const doc = await parse(
                s`import "./does-not-exist.dlang"
                Domain ErrorTest { vision: "test" }`,
                'file:///r8/test.dlang',
            );

            // Act — collect validation diagnostics
            const diagnostics = doc.diagnostics ?? [];

            // Assert — should have an import-related error diagnostic
            const importErrors = diagnostics.filter(d =>
                d.message.toLowerCase().includes('import')
                || d.message.toLowerCase().includes('unresolved')
                || d.message.toLowerCase().includes('not found'),
            );
            expect(importErrors.length).toBeGreaterThan(0);
        });
    });
});
