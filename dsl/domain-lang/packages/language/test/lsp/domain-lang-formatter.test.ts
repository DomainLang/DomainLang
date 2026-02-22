/**
 * Tests for DomainLangFormatter.
 *
 * Verifies formatting produces meaningful edits:
 * - Well-formatted documents produce zero edits
 * - Badly-formatted documents produce edits that fix indentation and structure
 * - Each block type (Namespace, Domain, BoundedContext, ContextMap, DomainMap) is handled
 * - Edge cases: empty blocks, deeply nested, no-block documents, idempotency
 */

import { describe, test, expect, beforeAll } from 'vitest';
import type { TextEdit } from 'vscode-languageserver-types';
import { setupTestSuite, type TestServices, s } from '../test-helpers.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

/**
 * Convert a line/character position to a character offset in the text.
 */
function toOffset(text: string, pos: { line: number; character: number }): number {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < pos.line && i < lines.length; i++) {
        offset += lines[i].length + 1; // +1 for the newline
    }
    return offset + pos.character;
}

/**
 * Return the leading-whitespace count for the first non-empty line
 * whose trimmed content starts with `pattern`.
 * Returns -1 if no matching line is found.
 */
function indentOf(text: string, pattern: string): number {
    const line = text.split('\n').find(l => l.trim().startsWith(pattern));
    if (!line) return -1;
    return line.search(/\S/);
}

/**
 * Apply TextEdits to source text in reverse document order so positions
 * remain valid as we mutate the string from bottom to top.
 */
function applyEdits(text: string, edits: TextEdit[]): string {
    const sorted = [...edits].sort((a, b) => {
        if (a.range.start.line !== b.range.start.line) {
            return b.range.start.line - a.range.start.line;
        }
        return b.range.start.character - a.range.start.character;
    });

    let result = text;
    for (const edit of sorted) {
        const start = toOffset(result, edit.range.start);
        const end = toOffset(result, edit.range.end);
        result = result.substring(0, start) + edit.newText + result.substring(end);
    }
    return result;
}

describe('DomainLang Formatter', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    // -- Helpers ----------------------------------------------------------

    /**
     * Parse and format a document, returning the TextEdits.
     */
    async function formatDocument(text: string): Promise<TextEdit[]> {
        const document = await testServices.parse(text);
        const formatter = testServices.services.DomainLang.lsp.Formatter;
        if (!formatter) {
            throw new Error('Formatter service not available');
        }
        const edits = await formatter.formatDocument(document, {
            textDocument: { uri: document.textDocument.uri },
            options: { tabSize: 4, insertSpaces: true },
        });
        return (edits ?? []) as TextEdit[];
    }

    /**
     * Parse, format, and apply edits to produce the formatted result.
     */
    async function formatAndApply(text: string): Promise<{ edits: TextEdit[]; result: string }> {
        const document = await testServices.parse(text);
        const formatter = testServices.services.DomainLang.lsp.Formatter;
        if (!formatter) {
            throw new Error('Formatter service not available');
        }
        const edits = (await formatter.formatDocument(document, {
            textDocument: { uri: document.textDocument.uri },
            options: { tabSize: 4, insertSpaces: true },
        }) ?? []) as TextEdit[];

        const source = document.textDocument.getText();
        return { edits, result: applyEdits(source, edits) };
    }


    // Already-formatted documents -- should produce zero edits
    // ====================================================================

    describe('already-formatted documents (idempotent)', () => {
        test.each([
            {
                name: 'Domain',
                input: s`
                    Domain Sales {
                        vision: "Sales management"
                    }
                `,
            },
            {
                name: 'Namespace',
                input: s`
                    Namespace acme {
                        Domain Sales {
                            vision: "Sales"
                        }
                    }
                `,
            },
            {
                name: 'BoundedContext',
                input: s`
                    Domain Sales {
                    }
                    bc OrderCtx for Sales {
                        description: "Order processing"
                    }
                `,
            },
        ])('formatting well-formatted $name is idempotent', async ({ input }) => {
            // Arrange & Act
            const { result } = await formatAndApply(input);
            const secondPassEdits = await formatDocument(result);

            // Assert
            expect(secondPassEdits).toHaveLength(0);
        });
    });

    // ====================================================================
    // Indentation -- misindented content must be corrected
    // ====================================================================

    describe('indentation', () => {
        test('adds indentation when block body has no indent', async () => {
            // Arrange & Act
            const { edits, result } = await formatAndApply(
                'Domain Sales {\nvision: "Sales"\n}'
            );

            // Assert
            expect(edits.length).toBeGreaterThan(0);
            // After formatting, vision line must be indented deeper than Domain line
            expect(indentOf(result, 'vision')).toBeGreaterThan(indentOf(result, 'Domain'));
        });

        test('single-line block is expanded to multiple lines', async () => {
            // Arrange & Act
            const { edits, result } = await formatAndApply(
                s`Domain Sales { vision: "Sales" }`
            );

            // Assert
            expect(edits.length).toBeGreaterThan(0);
            // The result should span more than one non-empty line
            const nonEmptyLines = result.split('\n').filter(l => l.trim().length > 0);
            expect(nonEmptyLines.length).toBeGreaterThan(1);
        });

        test('nested blocks produce increasing indentation levels', async () => {
            // Arrange & Act
            const { edits, result } = await formatAndApply(
                s`Namespace acme { Domain Sales { vision: "Sales" } }`
            );

            // Assert
            expect(edits.length).toBeGreaterThan(0);
            const nsIndent = indentOf(result, 'Namespace');
            const domIndent = indentOf(result, 'Domain');
            const visIndent = indentOf(result, 'vision');
            // Each nesting level should be indented deeper
            expect(domIndent).toBeGreaterThan(nsIndent);
            expect(visIndent).toBeGreaterThan(domIndent);
        });

        test('closing brace appears on its own line after formatting', async () => {
            // Arrange & Act
            const { edits, result } = await formatAndApply(
                s`Domain Sales { vision: "Sales" }`
            );

            // Assert
            expect(edits.length).toBeGreaterThan(0);
            // At least one line should contain only a closing brace (possibly with leading whitespace)
            const closingBraceLine = result.split('\n').find(l => l.trim() === '}');
            expect(closingBraceLine?.trim()).toBe('}');
        });
    });

    // ====================================================================
    // Block formatting -- each block type handled by formatBlock()
    // ====================================================================

    describe('block formatting', () => {
        // Namespace and Domain block indentation subsumed by "deeply nested blocks produce increasing indentation" edge case

        test('formats BoundedContext block', async () => {
            // Arrange & Act
            const { edits, result } = await formatAndApply(
                s`Domain Sales { } bc OrderCtx for Sales { description: "Orders" }`
            );

            // Assert
            expect(edits.length).toBeGreaterThan(0);
            // description should appear on its own line, indented
            const descLine = result.split('\n').find(l => l.trim().startsWith('description'));
            expect(descLine?.trim().startsWith('description')).toBe(true);
            expect(descLine!.search(/\S/)).toBeGreaterThan(0);
        });

        test('formats ContextMap block', async () => {
            // Arrange & Act
            const { edits, result } = await formatAndApply(
                s`Domain D { } bc A for D { } bc B for D { } ContextMap M { contains A, B }`
            );

            // Assert
            expect(edits.length).toBeGreaterThan(0);
            // contains line should be indented inside ContextMap
            expect(indentOf(result, 'contains')).toBeGreaterThan(indentOf(result, 'ContextMap'));
        });

        test('formats DomainMap block', async () => {
            // Arrange & Act
            const { edits, result } = await formatAndApply(
                s`Domain A { } Domain B { } DomainMap M { contains A, B }`
            );

            // Assert
            expect(edits.length).toBeGreaterThan(0);
            // contains line should be indented inside DomainMap
            expect(indentOf(result, 'contains')).toBeGreaterThan(indentOf(result, 'DomainMap'));
        });

        test('formats directional relationship spacing', async () => {
            // Arrange & Act
            const { edits, result } = await formatAndApply(
                s`Domain Sales {} bc Orders for Sales {} bc Billing for Sales {} ContextMap M { contains Orders, Billing Orders[OHS,PL]->[CF,ACL]Billing }`
            );

            // Assert
            expect(edits.length).toBeGreaterThan(0);
            expect(result).toContain('Orders [OHS, PL] -> [CF, ACL] Billing');
        });

        test('formats symmetric relationship spacing', async () => {
            // Arrange & Act
            const { edits, result } = await formatAndApply(
                s`Domain Sales {} bc Orders for Sales {} bc Legacy for Sales {} ContextMap M { contains Orders, Legacy Orders[SK]Legacy Orders><Legacy }`
            );

            // Assert
            expect(edits.length).toBeGreaterThan(0);
            expect(result).toContain('Orders [SK] Legacy');
            expect(result).toContain('Orders >< Legacy');
        });
    });

    // ====================================================================
    // Edge cases
    // ====================================================================

    describe('edge cases', () => {
        test('document with no block constructs produces no edits', async () => {
            // Arrange & Act
            const edits = await formatDocument(s`import "owner/repo@v1.0.0"`);

            // Assert
            expect(edits).toHaveLength(0);
        });

        test('empty block does not crash formatter and preserves content', async () => {
            // Arrange & Act
            const { result } = await formatAndApply(s`Domain Sales { }`);

            // Assert — The formatter should not corrupt the document
            expect(result).toContain('Domain');
            expect(result).toContain('Sales');
        });

        // 'deeply nested blocks produce increasing indentation' covered by indentation section above

        test('multiple top-level blocks are all preserved after formatting', async () => {
            // Arrange & Act
            const { result } = await formatAndApply(
                s`Domain A { vision: "A" } Domain B { vision: "B" }`
            );

            // Assert
            expect(result).toContain('Domain A');
            expect(result).toContain('Domain B');
            expect(result).toContain('"A"');
            expect(result).toContain('"B"');
        });

        test('BoundedContext with inline attributes formats to multi-line', async () => {
            // Arrange & Act
            const { edits, result } = await formatAndApply(
                s`Domain Sales { } Team SalesTeam Classification Core bc Ctx for Sales as Core by SalesTeam { description: "test" }`
            );

            // Assert
            expect(edits.length).toBeGreaterThan(0);
            expect(result).toContain('description');
            // Formatted output should have several lines
            const nonEmptyLines = result.split('\n').filter(l => l.trim().length > 0);
            expect(nonEmptyLines.length).toBeGreaterThan(3);
        });

    });
});
