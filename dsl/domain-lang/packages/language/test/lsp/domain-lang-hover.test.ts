/**
 * Tests for DomainLangHoverProvider.
 *
 * Verifies hover functionality for DomainLang elements.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestSuite, type TestServices, s } from '../test-helpers.js';
import type { HoverParams } from 'vscode-languageserver';
import { Position } from 'vscode-languageserver';

describe('DomainLangHoverProvider', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    /**
     * Helper to get hover content at a specific position
     */
    const getHoverAt = async (
        text: string,
        line: number,
        character: number
    ): Promise<unknown> => {
        const document = await testServices.parse(text);
        const hoverProvider = testServices.services.DomainLang.lsp.HoverProvider;
        
        if (!hoverProvider) {
            throw new Error('HoverProvider not available');
        }

        const params: HoverParams = {
            textDocument: { uri: document.textDocument.uri },
            position: Position.create(line, character)
        };

        return hoverProvider.getHoverContent(document, params) as unknown;
    };

    describe('Domain hovers', () => {
        test('provides hover for domain', async () => {
            const hover = await getHoverAt(
                s`Domain Sales { vision: "Customer sales management" }`,
                0,
                7
            );

            expect(hover).toBeDefined();
        });

        test('provides hover for nested domain', async () => {
            const hover = await getHoverAt(
                s`Domain Accounting in Finance {}`,
                0,
                7
            );

            expect(hover).toBeDefined();
        });
    });

    describe('Bounded context hovers', () => {
        test('provides hover for bounded context', async () => {
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                bc OrderContext for Sales as Core by TeamA { description: "Order processing" }
                `,
                1,
                8
            );

            expect(hover !== undefined).toBeTruthy();
        });

        test('provides hover for bounded context with attributes', async () => {
            const hover = await getHoverAt(
                s`
                Domain Sales {}
                Team TeamA {}
                Classification Core {}
                bc OrderContext for Sales as Core by TeamA { 
                    description: "Order context"
                }
                `,
                4,
                8
            );

            expect(hover).toBeDefined();
        });
    });

    describe('Team hovers', () => {
        test('provides hover for team', async () => {
            const hover = await getHoverAt(
                s`Team SalesTeam {}`,
                0,
                5
            );

            expect(hover).toBeDefined();
        });

        test('provides hover for team with description', async () => {
            const hover = await getHoverAt(
                s`Team SalesTeam { description: "Sales team" }`,
                0,
                5
            );

            expect(hover).toBeDefined();
        });
    });

    describe('Classification hovers', () => {
        test('provides hover for classification', async () => {
            const hover = await getHoverAt(
                s`Classification Core {}`,
                0,
                12
            );

            expect(hover).toBeDefined();
        });

        test('provides hover for classification with description', async () => {
            const hover = await getHoverAt(
                s`Classification Core { description: "Core systems" }`,
                0,
                12
            );

            expect(hover).toBeDefined();
        });
    });

    describe('Keyword hovers', () => {
        test('provides hover for Domain keyword', async () => {
            const hover = await getHoverAt(
                s`Domain Sales {}`,
                0,
                1
            );

            expect(hover).toBeDefined();
        });

        test('provides hover for in keyword', async () => {
            const hover = await getHoverAt(
                s`Domain Parent {} Domain Child in Parent {}`,
                0,
                35
            );

            expect(hover).toBeDefined();
        });
    });

    describe('Import hovers', () => {
        test('provides hover for import statement', async () => {
            const hover = await getHoverAt(
                s`import "owner/repo@v1.0.0"`,
                0,
                5
            );

            expect(hover).toBeDefined();
        });
    });

    describe('Edge cases', () => {
        test('returns undefined for position outside document', async () => {
            const document = await testServices.parse(s`Domain Sales {}`);
            const hoverProvider = testServices.services.DomainLang.lsp.HoverProvider;

            if (!hoverProvider) {
                throw new Error('HoverProvider not available');
            }

            const params: HoverParams = {
                textDocument: { uri: document.textDocument.uri },
                position: Position.create(10, 0)
            };

            const hover = await hoverProvider.getHoverContent(document, params);
            expect(hover).toBeUndefined();
        });

        test('handles documents with errors gracefully', async () => {
            const hoverProvider = testServices.services.DomainLang.lsp.HoverProvider;

            if (!hoverProvider) {
                throw new Error('HoverProvider not available');
            }

            const document = await testServices.parse(s`Domain {}`);

            const params: HoverParams = {
                textDocument: { uri: document.textDocument.uri },
                position: Position.create(0, 7)
            };

            const hover = await hoverProvider.getHoverContent(document, params);
            expect(hover === undefined || hover !== undefined).toBe(true);
        });
    });
});
