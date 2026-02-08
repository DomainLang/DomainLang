/**
 * Tests for DomainLangHoverProvider.
 *
 * Verifies hover functionality for DomainLang elements including
 * type labels, element names, code signatures, documentation comments,
 * keyword explanations, references, and edge cases.
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
    // Smoke tests: verify type label and name for each major type
    // ================================================================

    describe('Domain hovers', () => {
        test('shows markdown content with type label and element name', async () => {
            const hover = await getHoverAt(
                s`Domain Sales { vision: "Customer sales management" }`,
                0,
                7 // 'S' in Sales
            );

            expect(hover).toBeDefined();
            expect(hover!.contents.kind).toBe('markdown');
            expect(hover!.contents.value).toContain('(domain)');
            expect(hover!.contents.value).toContain('Sales');
        });

        test('contains code block with domain signature', async () => {
            const hover = await getHoverAt(
                s`Domain Sales {}`,
                0,
                7
            );

            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('```domain-lang');
            expect(hover!.contents.value).toContain('Domain Sales');
        });

        test('includes parent in nested domain signature', async () => {
            const hover = await getHoverAt(
                s`
                Domain Finance {}
                Domain Accounting in Finance {}
                `,
                1,
                7 // 'A' in Accounting
            );

            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(domain)');
            expect(value).toContain('Accounting');
            expect(value).toContain('Domain Accounting in Finance');
        });

        test('includes vision in hover fields', async () => {
            const hover = await getHoverAt(
                s`Domain Sales { vision: "Streamlined sales process" }`,
                0,
                7
            );

            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('Streamlined sales process');
        });
    });

    describe('Bounded context hovers', () => {
        test('shows type label and element name', async () => {
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc OrderContext for Sales {}
                `,
                1,
                3 // 'O' in OrderContext
            );

            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('(boundedcontext)');
            expect(hover!.contents.value).toContain('OrderContext');
        });

        test('contains code block with full signature including for/as/by', async () => {
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

            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(boundedcontext)');
            expect(value).toContain('```domain-lang');
            expect(value).toContain('BoundedContext OrderContext');
            expect(value).toContain('for Sales');
            expect(value).toContain('as Core');
            expect(value).toContain('by TeamA');
        });

        test('includes description in hover fields', async () => {
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc OrderContext for Sales { description: "Manages order lifecycle" }
                `,
                1,
                3
            );

            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('Manages order lifecycle');
        });
    });

    describe('Team hovers', () => {
        test('shows type label and element name', async () => {
            const hover = await getHoverAt(
                s`Team SalesTeam {}`,
                0,
                5 // 'S' in SalesTeam
            );

            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('(team)');
            expect(hover!.contents.value).toContain('SalesTeam');
        });
    });

    describe('Classification hovers', () => {
        test('shows type label and element name', async () => {
            const hover = await getHoverAt(
                s`Classification Core {}`,
                0,
                15 // 'C' in Core
            );

            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('(classification)');
            expect(hover!.contents.value).toContain('Core');
        });
    });

    // ================================================================
    // Documentation comments
    // ================================================================

    describe('Documentation comments in hover', () => {
        test.each([
            {
                construct: 'domain',
                input: s`/**
 * The commerce domain handles all commercial operations
 */
Domain Commerce {}`,
                line: 3,
                col: 7,
                typeLabel: '(domain)',
                name: 'Commerce',
                docSnippets: ['commerce domain', 'commercial operations'],
            },
            {
                construct: 'team',
                input: s`/**
 * This is the sales team responsible for customer acquisition
 */
Team SalesTeam`,
                line: 3,
                col: 5,
                typeLabel: '(team)',
                name: 'SalesTeam',
                docSnippets: ['sales team', 'customer acquisition'],
            },
            {
                construct: 'classification',
                input: s`/**
 * Core domain - essential for business success
 */
Classification Core`,
                line: 3,
                col: 15,
                typeLabel: '(classification)',
                name: 'Core',
                docSnippets: ['Core domain', 'business success'],
            },
        ])('includes doc comment in $construct hover', async ({ input, line, col, typeLabel, name, docSnippets }) => {
            const hover = await getHoverAt(input, line, col);

            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain(typeLabel);
            expect(value).toContain(name);
            for (const snippet of docSnippets) {
                expect(value).toContain(snippet);
            }
        });
    });

    // ================================================================
    // Keyword hovers
    // ================================================================

    describe('Keyword hovers', () => {
        test('shows explanation for Domain keyword', async () => {
            const hover = await getHoverAt(
                s`Domain Sales {}`,
                0,
                1 // 'o' in Domain keyword
            );

            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('**Domain**');
            expect(value).toContain('sphere of knowledge');
            expect(value).toContain('Can be nested');
        });

        test('shows explanation for bc keyword', async () => {
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc OrderContext for Sales {}
                `,
                1,
                0 // 'b' in bc keyword
            );

            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('**BoundedContext**');
            expect(value).toContain('managing complexity');
        });
    });

    // ================================================================
    // Reference hovers: hovering on a reference shows the target element
    // ================================================================

    describe('Reference hovers', () => {
        test('hovering on domain reference in BC shows domain info', async () => {
            // Line 1: "bc OrderContext for Sales {}" -- 'S' in Sales at char 20
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc OrderContext for Sales {}
                `,
                1,
                20 // 'S' in 'Sales' reference
            );

            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(domain)');
            expect(value).toContain('Sales');
        });

        test('hovering on parent reference in nested domain shows parent domain', async () => {
            // "Domain Parent {} Domain Child in Parent {}"
            // P(33)a(34)r(35)e(36)n(37)t(38) -- second 'Parent' is a reference
            const hover = await getHoverAt(
                s`Domain Parent {} Domain Child in Parent {}`,
                0,
                33 // 'P' in second 'Parent' (reference)
            );

            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(domain)');
            expect(value).toContain('Parent');
        });
    });

    // ================================================================
    // Non-element positions (should return undefined)
    // ================================================================

    describe('Non-element positions', () => {
        test('returns undefined for position outside document bounds', async () => {
            const hover = await getHoverAt(
                s`Domain Sales {}`,
                10,
                0
            );

            expect(hover).toBeUndefined();
        });

        test('returns undefined for empty line between elements', async () => {
            const hover = await getHoverAt(
                s`
                Domain Sales {}

                Team TeamA {}
                `,
                1, // the empty line
                0
            );

            expect(hover).toBeUndefined();
        });
    });

    // ================================================================
    // Error handling
    // ================================================================

    describe('Error handling', () => {
        test('returns undefined for position in malformed document', async () => {
            const hoverProvider = testServices.services.DomainLang.lsp.HoverProvider;
            if (!hoverProvider) throw new Error('HoverProvider not available');

            const document = await testServices.parse(s`Domain {}`);
            const params: HoverParams = {
                textDocument: { uri: document.textDocument.uri },
                position: Position.create(0, 7)
            };

            // The provider catches errors internally; for a Domain with no name,
            // there is no valid declaration or keyword at the brace position
            const hover = await hoverProvider.getHoverContent(document, params);
            expect(hover).toBeUndefined();
        });
    });
});
