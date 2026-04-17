/**
 * Tests for DomainLangHoverProvider.
 *
 * Verifies hover functionality for DomainLang elements including
 * type labels, element names, code signatures, documentation comments,
 * and edge cases.
 *
 * Organized around:
 * - Hover content shape verification (via test.each for major types)
 * - Special cases (nested domains, full signatures with attributes)
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestSuite, type TestServices, s } from '../test-helpers.js';
import type { HoverParams } from 'vscode-languageserver';
import { Position } from 'vscode-languageserver';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

/** Typed hover result matching the provider's return shape. */
interface HoverResult {
    contents: { kind: string; value: string };
}

describe('DomainLangHoverProvider', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    /**
     * Helper to get hover content at a specific position.
     */
    const getHoverAt = async (
        text: string,
        line: number,
        character: number
    ): Promise<HoverResult | undefined> => {
        const document = await testServices.parse(text);
        const hoverProvider = testServices.services.DomainLang.lsp.HoverProvider;

        if (!hoverProvider) {
            throw new Error('HoverProvider not available');
        }

        const params: HoverParams = {
            textDocument: { uri: document.textDocument.uri },
            position: Position.create(line, character)
        };

        return hoverProvider.getHoverContent(document, params) as Promise<HoverResult | undefined>;
    };

    // ================================================================
    // Smoke: verify markdown structure and type labels for major types
    // ================================================================

    interface HoverCase {
        readonly elementType: string;
        readonly input: string;
        readonly line: number;
        readonly character: number;
        readonly expectedLabel: string;
        readonly expectedType: string;
    }

    const hoverCases: readonly HoverCase[] = [
        {
            elementType: 'Domain',
            input: s`Domain Sales { vision: "Customer sales management" }`,
            line: 0,
            character: 7, // 'S' in Sales
            expectedLabel: 'Sales',
            expectedType: '(domain)',
        },
        {
            elementType: 'BoundedContext',
            input: s`
                Domain Sales {}
                bc OrderContext for Sales {}
            `,
            line: 1,
            character: 3, // 'O' in OrderContext
            expectedLabel: 'OrderContext',
            expectedType: '(bounded context)',
        },
        {
            elementType: 'Team',
            input: s`Team SalesTeam {}`,
            line: 0,
            character: 5, // 'S' in SalesTeam
            expectedLabel: 'SalesTeam',
            expectedType: '(team)',
        },
        {
            elementType: 'Classification',
            input: s`Classification Core {}`,
            line: 0,
            character: 15, // 'C' in Core
            expectedLabel: 'Core',
            expectedType: '(classification)',
        },
    ];

    test.each(hoverCases)('$elementType shows markdown with type label and name', async ({
        input,
        line,
        character,
        expectedLabel,
        expectedType,
    }) => {
        // Arrange & Act
        const hover = await getHoverAt(input, line, character);

        // Assert
        expect(hover!.contents.kind).toBe('markdown');
        expect(hover!.contents.value).toContain(expectedType);
        expect(hover!.contents.value).toContain(expectedLabel);
    });

    // ================================================================
    // SMOKE: code block with signature
    // ================================================================
    test('Domain shows markdown with code block containing domain signature', async () => {
        // Arrange & Act
        const hover = await getHoverAt(
            s`Domain Sales {}`,
            0,
            7
        );

        // Assert
        expect(hover?.contents.kind).toBe('markdown');
        expect(hover!.contents.value).toContain('```domain-lang');
        expect(hover!.contents.value).toContain('Domain Sales');
    });

    // ================================================================
    // EDGE: nested domains include parent in signature
    // ================================================================
    test('nested Domain includes parent reference in signature', async () => {
        // Arrange & Act
        const hover = await getHoverAt(
            s`
                Domain Finance {}
                Domain Accounting in Finance {}
            `,
            1,
            7 // 'A' in Accounting
        );

        // Assert
        expect(hover?.contents.kind).toBe('markdown');
        const value = hover!.contents.value;
        expect(value).toContain('(domain)');
        expect(value).toContain('Accounting');
        expect(value).toContain('Domain Accounting in Finance');
    });

    // ================================================================
    // EDGE: Domain vision appears in hover
    // ================================================================
    test('Domain vision text appears in hover fields', async () => {
        // Arrange & Act
        const hover = await getHoverAt(
            s`Domain Sales { vision: "Streamlined sales process" }`,
            0,
            7
        );

        // Assert
        expect(hover?.contents.kind).toBe('markdown');
        expect(hover!.contents.value).toContain('Streamlined sales process');
    });

    // ================================================================
    // EDGE: BC full signature with all attributes
    // ================================================================
    test('BoundedContext signature includes for/as/by clauses when present', async () => {
        // Arrange & Act
        const hover = await getHoverAt(
            s`
                Domain Sales {}
                Team TeamA {}
                Classification Core {}
                bc OrderContext for Sales as Core by TeamA {}
            `,
            3,
            3 // 'O' in OrderContext
        );

        // Assert
        expect(hover?.contents.kind).toBe('markdown');
        const value = hover!.contents.value;
        expect(value).toContain('(bounded context)');
        expect(value).toContain('```domain-lang');
        expect(value).toContain('BoundedContext OrderContext');
        expect(value).toContain('for Sales');
        expect(value).toContain('as Core');
        expect(value).toContain('by TeamA');
    });

    // ================================================================
    // EDGE: BC description appears in hover
    // ================================================================
    test('BoundedContext description text appears in hover fields', async () => {
        // Arrange & Act
        const hover = await getHoverAt(
            s`
                Domain Sales {}
                bc OrderContext for Sales { description: "Manages order lifecycle" }
            `,
            1,
            3
        );

        // Assert
        expect(hover?.contents.kind).toBe('markdown');
        expect(hover!.contents.value).toContain('Manages order lifecycle');
    });
});