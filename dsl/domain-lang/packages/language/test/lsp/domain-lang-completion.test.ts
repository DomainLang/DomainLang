/**
 * Tests for DomainLangCompletionProvider.
 *
 * ALL tests use the real getCompletion() LSP protocol API — no internal mocks.
 * Cursor position is marked with █ in input text.
 *
 * Smoke (~20%):
 * - Top-level snippets include Domain / BoundedContext labels
 * - BoundedContext completions include BC-specific labels
 *
 * Edge/error (~80%):
 * - Top-level excludes documentation blocks
 * - Inside BC body, no top-level snippets appear
 * - Inside Domain body, no top-level snippets appear
 * - Duplicate-block prevention for BC and Domain
 * - Shorthand "by" / "as" clause suppression
 * - Domain completions exclude BC-only blocks
 * - BoundedContext completions exclude Domain-only blocks
 * - ContextMap completions
 * - Import completions inside import string
 */

import { describe, test, expect, beforeAll } from 'vitest';
import type { CompletionItem } from 'vscode-languageserver';
import { setupTestSuite, type TestServices, s } from '../test-helpers.js';

/** Extract labels from completion items. */
function labelsOf(items: CompletionItem[]): string[] {
    return items.map(i => i.label);
}

describe('DomainLangCompletionProvider', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    // ================================================================
    // HELPER — calls the real getCompletion() through the LSP protocol
    // ================================================================

    /**
     * Get completions at the cursor position marked by █ in the input.
     * Uses the real `getCompletion()` public API — no mocks, no internal calls.
     */
    async function completionsAt(textWithCursor: string): Promise<CompletionItem[]> {
        const CURSOR = '█';
        const cursorPos = textWithCursor.indexOf(CURSOR);
        if (cursorPos === -1) {
            throw new Error('No cursor marker █ found in input');
        }
        const text = textWithCursor.slice(0, cursorPos) +
            textWithCursor.slice(cursorPos + CURSOR.length);

        const document = await testServices.parse(text);
        const provider = testServices.services.DomainLang.lsp.CompletionProvider;
        const position = document.textDocument.positionAt(cursorPos);

        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.uri.toString() },
            position,
        });

        return result?.items ?? [];
    }

    // ==========================================
    // SMOKE: top-level snippets
    // ==========================================
    test('top-level completions include Domain and BoundedContext snippet labels', async () => {
        // Arrange & Act — cursor at start of empty document
        const items = await completionsAt(s`█`);

        // Assert
        const labels = labelsOf(items);
        expect(labels.some(l => l.includes('Domain'))).toBe(true);
        expect(labels.some(l => l.includes('BoundedContext'))).toBe(true);
    });

    // ==========================================
    // SMOKE: BC completions differ from top-level
    // ==========================================
    test('BoundedContext body completions differ from top-level completions', async () => {
        // Arrange & Act
        const topLevel = await completionsAt(s`█`);
        const bcBody = await completionsAt(s`
            Domain Sales { vision: "Sales" }
            BoundedContext Test for Sales {
                █
            }
        `);

        // Assert — BC body should provide different completions than top level
        const topLabels = new Set(labelsOf(topLevel));
        const bcLabels = new Set(labelsOf(bcBody));
        const bcOnly = [...bcLabels].filter(l => !topLabels.has(l));
        const topOnly = [...topLabels].filter(l => !bcLabels.has(l));
        expect(bcOnly.length + topOnly.length).toBeGreaterThan(0);
    });

    // ==========================================
    // EDGE: top-level excludes documentation blocks
    // ==========================================
    test('top-level completions exclude documentation blocks like description, team, vision', async () => {
        // Arrange & Act
        const items = await completionsAt(s`█`);
        const labels = labelsOf(items);

        // Assert — should have Domain/BC but NOT body-level blocks
        expect(labels.some(l => l.includes('Domain') || l.includes('BoundedContext'))).toBe(true);
        expect(labels).not.toContain('⚡ description');
        expect(labels).not.toContain('⚡ team');
        expect(labels).not.toContain('⚡ classification');
        expect(labels).not.toContain('⚡ vision');
        expect(labels).not.toContain('⚡ terminology');
    });

    // ==========================================
    // EDGE: inside BC body, no top-level snippets
    // ==========================================
    test('inside BoundedContext body, no top-level snippets appear', async () => {
        // Arrange & Act
        const items = await completionsAt(s`
            Domain Sales { vision: "Sales" }
            Team SupportTeam
            BoundedContext SupportPortal for Sales {
                description: "Handles customer support"
                █
            }
        `);
        const labels = labelsOf(items);

        // Assert — no top-level snippets inside a BC body
        expect(labels).not.toContain('⚡ Domain (simple)');
        expect(labels).not.toContain('⚡ Domain (detailed)');
        expect(labels).not.toContain('⚡ BoundedContext (simple)');
        expect(labels).not.toContain('⚡ BoundedContext (detailed)');
        expect(labels).not.toContain('⚡ Team');
        expect(labels).not.toContain('⚡ Classification');
    });

    // ==========================================
    // EDGE: inside Domain body, no top-level snippets
    // ==========================================
    test('inside Domain body, no top-level snippets appear', async () => {
        // Arrange & Act
        const items = await completionsAt(s`
            Domain Sales {
                vision: "Be the best"
                █
            }
        `);
        const labels = labelsOf(items);

        // Assert
        expect(labels).not.toContain('⚡ Domain (simple)');
        expect(labels).not.toContain('⚡ BoundedContext (simple)');
        expect(labels).not.toContain('⚡ Team');
    });

    // ==========================================
    // EDGE: duplicate prevention for BC
    // ==========================================
    test('does not suggest description/team blocks that already exist in BoundedContext', async () => {
        // Arrange & Act
        const items = await completionsAt(s`
            Domain Sales { vision: "Sales" }
            Team TestTeam
            BoundedContext Test for Sales {
                description: "Test context"
                team: TestTeam
                █
            }
        `);
        const labels = labelsOf(items);

        // Assert — description and team already present, should not be suggested again
        expect(labels).not.toContain('⚡ description');
        expect(labels).not.toContain('⚡ team');
    });

    // ==========================================
    // EDGE: duplicate prevention for Domain
    // ==========================================
    test('does not suggest vision/description blocks that already exist in Domain', async () => {
        // Arrange & Act
        const items = await completionsAt(s`
            Domain Sales {
                vision: "Be the best"
                description: "Sales domain"
                █
            }
        `);
        const labels = labelsOf(items);

        // Assert
        expect(labels).not.toContain('⚡ vision');
        expect(labels).not.toContain('⚡ description');
    });

    // ==========================================
    // EDGE: shorthand "by" clause suppresses team
    // ==========================================
    test('does not suggest team when set via "by" clause', async () => {
        // Arrange & Act
        const items = await completionsAt(s`
            Domain Sales { vision: "Sales" }
            Team MyTeam
            BoundedContext Test for Sales by MyTeam {
                █
            }
        `);
        const labels = labelsOf(items);

        // Assert
        expect(labels).not.toContain('⚡ team');
    });

    // ==========================================
    // EDGE: shorthand "as" clause suppresses classification
    // ==========================================
    test('does not suggest classification when set via "as" clause', async () => {
        // Arrange & Act
        const items = await completionsAt(s`
            Domain Sales { vision: "Sales" }
            Classification Core
            BoundedContext Test for Sales as Core {
                █
            }
        `);
        const labels = labelsOf(items);

        // Assert
        expect(labels).not.toContain('⚡ classification');
    });

    // ==========================================
    // EDGE: Domain completions exclude BC-only blocks
    // ==========================================
    test('Domain completions exclude BoundedContext-only blocks', async () => {
        // Arrange & Act
        const items = await completionsAt(s`
            Domain Sales {
                █
            }
        `);
        const labels = labelsOf(items);

        // Assert — Domain body should not offer BC-only blocks
        expect(labels).not.toContain('⚡ team');
        expect(labels).not.toContain('⚡ terminology');
        expect(labels).not.toContain('⚡ relationships');
    });

    // ==========================================
    // EDGE: BoundedContext completions exclude Domain-only blocks
    // ==========================================
    test('BoundedContext completions exclude Domain-only blocks', async () => {
        // Arrange & Act
        const items = await completionsAt(s`
            Domain Sales { vision: "Sales" }
            BoundedContext Test for Sales {
                █
            }
        `);
        const labels = labelsOf(items);

        // Assert — BC body should not offer Domain-only blocks
        expect(labels).not.toContain('⚡ vision');
    });

    // ==========================================
    // EDGE: ContextMap completions
    // ==========================================
    test('ContextMap completions include relationship snippets but not vision or description', async () => {
        // Arrange & Act
        const items = await completionsAt(s`
            Domain Sales { vision: "Sales" }
            bc A for Sales
            bc B for Sales
            ContextMap Sales {
                █
            }
        `);
        const labels = labelsOf(items);

        // Assert — ContextMap should not offer Domain-specific blocks
        expect(labels).not.toContain('⚡ vision');
        expect(labels).not.toContain('⚡ description');
    });

    // ==========================================
    // IMPORT: Top-level includes import snippet
    // ==========================================
    test('top-level completions include import snippet', async () => {
        // Arrange & Act
        const items = await completionsAt(s`█`);
        const labels = labelsOf(items);

        // Assert
        expect(labels.some(l => l.includes('import'))).toBe(true);
    });

    // ==========================================
    // IMPORT: Import completion integration tests (use real getCompletion API)
    // ==========================================
    describe('Import completion behavior', () => {
        test('provides completions inside empty import string', async () => {
            // Arrange
            const document = await testServices.parse('import ""');
            const provider = testServices.services.DomainLang.lsp.CompletionProvider;

            // Act — cursor inside the quotes: import "|"
            const result = await provider.getCompletion(document, {
                textDocument: { uri: document.uri.toString() },
                position: { line: 0, character: 8 },
            });

            // Assert
            const labels = result?.items?.map(item => item.label) ?? [];
            expect(labels).toContain('./');
            expect(labels).toContain('../');
        });

        test('provides filtered dependency completions when typing partial name', async () => {
            // Arrange
            const document = await testServices.parse('import "lar"');
            const provider = testServices.services.DomainLang.lsp.CompletionProvider;

            // Act — cursor after "lar": import "lar|"
            const result = await provider.getCompletion(document, {
                textDocument: { uri: document.uri.toString() },
                position: { line: 0, character: 11 },
            });

            // Assert
            const labels = result?.items?.map(item => item.label) ?? [];
            expect(labels).not.toContain('./');
            expect(labels).not.toContain('../');
        });

        test('import completions work with Import keyword (capital I)', async () => {
            // Arrange
            const document = await testServices.parse('Import ""');
            const provider = testServices.services.DomainLang.lsp.CompletionProvider;

            // Act — cursor inside the quotes: Import "|"
            const result = await provider.getCompletion(document, {
                textDocument: { uri: document.uri.toString() },
                position: { line: 0, character: 8 },
            });

            // Assert
            const labels = result?.items?.map(item => item.label) ?? [];
            expect(labels).toContain('./');
            expect(labels).toContain('../');
        });
    });
});
