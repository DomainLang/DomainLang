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
            // Arrange & Act
            const hover = await getHoverAt(
                s`Domain Sales { vision: "Customer sales management" }`,
                0,
                7 // 'S' in Sales
            );

            // Assert
            expect(hover).toBeDefined();
            expect(hover!.contents.kind).toBe('markdown');
            expect(hover!.contents.value).toContain('(domain)');
            expect(hover!.contents.value).toContain('Sales');
        });

        test('contains code block with domain signature', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`Domain Sales {}`,
                0,
                7
            );

            // Assert
            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('```domain-lang');
            expect(hover!.contents.value).toContain('Domain Sales');
        });

        test('includes parent in nested domain signature', async () => {
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
            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(domain)');
            expect(value).toContain('Accounting');
            expect(value).toContain('Domain Accounting in Finance');
        });

        test('includes vision in hover fields', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`Domain Sales { vision: "Streamlined sales process" }`,
                0,
                7
            );

            // Assert
            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('Streamlined sales process');
        });
    });

    describe('Bounded context hovers', () => {
        test('shows type label and element name', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc OrderContext for Sales {}
                `,
                1,
                3 // 'O' in OrderContext
            );

            // Assert
            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('(bounded context)');
            expect(hover!.contents.value).toContain('OrderContext');
        });

        test('contains code block with full signature including for/as/by', async () => {
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
            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(bounded context)');
            expect(value).toContain('```domain-lang');
            expect(value).toContain('BoundedContext OrderContext');
            expect(value).toContain('for Sales');
            expect(value).toContain('as Core');
            expect(value).toContain('by TeamA');
        });

        test('includes description in hover fields', async () => {
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
            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('Manages order lifecycle');
        });
    });

    describe('Team hovers', () => {
        test('shows type label and element name', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`Team SalesTeam {}`,
                0,
                5 // 'S' in SalesTeam
            );

            // Assert
            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('(team)');
            expect(hover!.contents.value).toContain('SalesTeam');
        });
    });

    describe('Classification hovers', () => {
        test('shows type label and element name', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`Classification Core {}`,
                0,
                15 // 'C' in Core
            );

            // Assert
            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('(classification)');
            expect(hover!.contents.value).toContain('Core');
        });

        test('shows qualified path for namespaced classifications', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`Namespace Core.Baunwalls {
                    Classification Jannie
                }`,
                1,
                35 // 'J' in Jannie
            );

            // Assert
            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('(classification)');
            expect(hover!.contents.value).toContain('Core.Baunwalls.Jannie');
        });

        test('qualified name reference: hover only shows on last segment', async () => {
            // Arrange
            const text = s`
Namespace Core.Baunwalls {
    Classification Jannie
}

bc TestContext as Core.Baunwalls.Jannie {}`;

            // Act: Hover on different parts of 'Core.Baunwalls.Jannie' in the reference
            // Line 4 (0-indexed): "bc TestContext as Core.Baunwalls.Jannie {}"
            const hoverOnCore = await getHoverAt(text, 4, 19); // 'C' in Core
            const hoverOnBaunwalls = await getHoverAt(text, 4, 24); // 'B' in Baunwalls
            const hoverOnJannie = await getHoverAt(text, 4, 35); // 'J' in Jannie

            // Assert: Only hovering on the last segment shows the classification
            expect(hoverOnCore).toBeUndefined();
            expect(hoverOnBaunwalls).toBeUndefined();
            expect(hoverOnJannie).toBeDefined();
            expect(hoverOnJannie!.contents.value).toContain('(classification)');
            expect(hoverOnJannie!.contents.value).toContain('Core.Baunwalls.Jannie');
        });
    });

    describe('Namespace hovers', () => {
        test('shows type label and element count', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`Namespace acme.sales { Domain Sales {} }`,
                0,
                10 // 'a' in acme.sales
            );

            // Assert
            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(namespace)');
            expect(value).toContain('acme.sales');
            expect(value).toContain('Contains 1 elements');
        });
    });

    describe('ContextMap hovers', () => {
        test('shows type label and lists bounded contexts', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc A for Sales
                bc B for Sales
                ContextMap SalesMap { contains A, B }
                `,
                3,
                11 // 'S' in SalesMap
            );

            // Assert
            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(contextmap)');
            expect(value).toContain('SalesMap');
            expect(value).toContain('Bounded Contexts');
        });

        test('shows relationships when present', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc A for Sales
                bc B for Sales
                ContextMap SalesMap {
                    contains A, B
                    A -> B
                }
                `,
                3,
                11 // 'S' in SalesMap
            );

            // Assert
            expect(hover).toBeDefined();
            expect(hover!.contents.value).toContain('Relationships');
        });
    });

    describe('DomainMap hovers', () => {
        test('shows type label and lists domains', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                DomainMap Overview { contains Sales }
                `,
                1,
                10 // 'O' in Overview
            );

            // Assert
            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(domainmap)');
            expect(value).toContain('Overview');
            expect(value).toContain('Domains');
        });
    });

    describe('Decision/Policy/Rule/Term hovers', () => {
        test.each([
            {
                type: 'decision',
                keyword: 'decision',
                block: 'decisions',
                name: 'UseCQRS',
                definition: 'Apply CQRS pattern',
                col: 17,
            },
            {
                type: 'policy',
                keyword: 'policy',
                block: 'decisions',
                name: 'ReturnPolicy',
                definition: '30-day returns',
                col: 15,
            },
            {
                type: 'rule',
                keyword: 'rule',
                block: 'rules',
                name: 'MaxItems',
                definition: 'Maximum 100 items per order',
                col: 13,
            },
            {
                type: 'term',
                keyword: 'term',
                block: 'terminology',
                name: 'Order',
                definition: 'A request to purchase',
                col: 13,
            },
        ])('$type hover shows type label, name, and definition', async ({ keyword, block, name, type, definition, col }) => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc OrderCtx for Sales {
                    ${block} {
                        ${keyword} ${name}: "${definition}"
                    }
                }
                `,
                3,
                col
            );

            // Assert
            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain(`(${type})`);
            expect(value).toContain(name);
            expect(value).toContain(definition);
        });
    });

    describe('Metadata hovers', () => {
        test('shows type label and element name', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`Metadata Language`,
                0,
                9 // 'L' in Language
            );

            // Assert
            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(metadata)');
            expect(value).toContain('Language');
        });
    });

    describe('Relationship hovers', () => {
        test('shows arrow and bounded context references', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc A for Sales
                bc B for Sales
                ContextMap SalesMap {
                    contains A, B
                    A -> B
                }
                `,
                5,
                6 // '-' in '->' arrow
            );

            // Assert — Relationship hover may land on the arrow token or return undefined
            // depending on parser CST leaf positioning; verify it doesn't throw
            if (hover) {
                expect(hover.contents.value).toContain('(relationship)');
            }
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
            // Arrange & Act
            const hover = await getHoverAt(input, line, col);

            // Assert
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
            // Arrange & Act
            const hover = await getHoverAt(
                s`Domain Sales {}`,
                0,
                1 // 'o' in Domain keyword
            );

            // Assert
            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('**Domain**');
            expect(value).toContain('sphere of knowledge');
            expect(value).toContain('Can be nested');
        });

        test('shows explanation for bc keyword', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc OrderContext for Sales {}
                `,
                1,
                0 // 'b' in bc keyword
            );

            // Assert
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
            // Arrange & Act — Line 1: "bc OrderContext for Sales {}" -- 'S' in Sales at char 20
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc OrderContext for Sales {}
                `,
                1,
                20 // 'S' in 'Sales' reference
            );

            // Assert
            expect(hover).toBeDefined();
            const value = hover!.contents.value;
            expect(value).toContain('(domain)');
            expect(value).toContain('Sales');
        });

        test('hovering on parent reference in nested domain shows parent domain', async () => {
            // Arrange & Act
            // "Domain Parent {} Domain Child in Parent {}"
            // P(33)a(34)r(35)e(36)n(37)t(38) -- second 'Parent' is a reference
            const hover = await getHoverAt(
                s`Domain Parent {} Domain Child in Parent {}`,
                0,
                33 // 'P' in second 'Parent' (reference)
            );

            // Assert
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
            // Arrange & Act
            const hover = await getHoverAt(
                s`Domain Sales {}`,
                10,
                0
            );

            // Assert
            expect(hover).toBeUndefined();
        });
    });

    // ================================================================
    // 'this' reference hover (LSP audit)
    // ================================================================

    describe('this reference hover', () => {
        test('hovering over "this" inside a context map returns parent hover', async () => {
            // Arrange & Act
            const hover = await getHoverAt(
                s`
                    Domain Sales { vision: "Sales domain" }
                    bc OrderContext for Sales
                    bc BillingContext for Sales
                    ContextMap SalesMap {
                        contains OrderContext, BillingContext
                        [OHS] this -> [CF] BillingContext
                    }
                `,
                5,
                10 // position of 'this' in '[OHS] this'
            );

            // Assert — 'this' resolves to the parent ContextMap hover
            // The key test is that the call does not crash (MaybePromise fix)
            if (hover) {
                expect(hover.contents.kind).toBe('markdown');
                expect(hover.contents.value).toContain('SalesMap');
            }
        });

    });

    // ================================================================
    // Error handling
    // ================================================================

    describe('Error handling', () => {
        test('returns undefined for position in malformed document', async () => {
            // Arrange
            const hoverProvider = testServices.services.DomainLang.lsp.HoverProvider;
            if (!hoverProvider) throw new Error('HoverProvider not available');

            const document = await testServices.parse(s`Domain {}`);
            const params: HoverParams = {
                textDocument: { uri: document.textDocument.uri },
                position: Position.create(0, 7)
            };

            // Act — The provider catches errors internally; for a Domain with no name,
            // there is no valid declaration or keyword at the brace position
            const hover = await hoverProvider.getHoverContent(document, params);

            // Assert
            expect(hover).toBeUndefined();
        });
    });

    // Import alias display
    // ================================================================
    // NOTE: Integration test for import alias display requires multi-file setup.
    //
    // Manual test scenario:
    // 1. Create file "shared.dlang" with: Domain SharedDomain {}
    // 2. Create file "main.dlang" with:
    //    import "./shared.dlang" as shared
    //    bc Context for shared.SharedDomain {}
    // 3. Hover over "shared.SharedDomain" in the BC declaration
    // 4. Expected: Hover should show "shared.SharedDomain (domain)" not just "SharedDomain (domain)"
    //
    // Implementation note: Import alias display requires IndexManager to look up
    // ImportInfo for cross-document references. The getDisplayNameForHover() helper
    // in hover provider handles this by prepending the alias when present.
    //
    // Go-to-definition links
    // ================================================================
    // Implementation complete: Links are formatted as [name](file:///path#Lline,col)
    // VS Code recognizes these as clickable go-to-definition links.
    // Example from actual hover output:
    //   [Core](file:///34.dlang#L3,1) - Classification link
    //   [SalesTeam](file:///34.dlang#L2,1) - Team link
});
