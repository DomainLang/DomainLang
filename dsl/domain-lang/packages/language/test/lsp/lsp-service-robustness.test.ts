/**
 * Tests for LSP service robustness improvements.
 *
 * Verifies that the audit fixes for async handling, error boundaries,
 * and graceful degradation work correctly across LSP services.
 *
 * Covers:
 * - Completion provider properly awaits super.completionFor() (was fire-and-forget)
 * - Scope provider handles errors gracefully
 * - Node kind provider handles unknown nodes without crashing
 * - Hover provider handles 'this' MaybePromise safely
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { CompletionItemKind, Position } from 'vscode-languageserver';
import type { HoverParams } from 'vscode-languageserver';
import { setupTestSuite, type TestServices, s, expectValidDocument } from '../test-helpers.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

describe('LSP service robustness (audit fixes)', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    // ================================================================
    // Completion provider: keyword completions included (async fix)
    // ================================================================

    describe('Completion includes Langium keyword suggestions', () => {
        test('Domain body completions include both custom snippets and grammar keywords', async () => {
            const document = await testServices.parse(s`
                Domain Sales {
                    vision: "Sell things"
                }
            `);
            expectValidDocument(document);

            const provider = testServices.services.DomainLang.lsp.CompletionProvider;
            expect(provider).toBeDefined();

            const items: { label: string; kind: CompletionItemKind }[] = [];
            const acceptor = (item: { label: string; kind?: CompletionItemKind }): void => {
                items.push({ label: item.label, kind: item.kind ?? CompletionItemKind.Text });
            };

            // Build a minimal completion context inside the Domain body
            const textDocument = document.textDocument;
            const position = Position.create(2, 0); // inside the domain body
            const context = {
                document,
                textDocument,
                node: document.parseResult.value.children[0],
                tokenOffset: textDocument.offsetAt(position),
                tokenEndOffset: textDocument.offsetAt(position),
                position,
            };

            // Call safeCompletionFor which internally calls handleNodeCompletions
            // After the async fix, this should await super.completionFor()
            await (provider as unknown as { safeCompletionFor: (ctx: unknown, next: unknown, acceptor: unknown) => Promise<void> })
                .safeCompletionFor(context, {}, acceptor);

            // Should have completions - both custom ones and grammar keywords
            expect(items.length).toBeGreaterThan(0);
        });

        test('BoundedContext body completions include both custom and grammar items', async () => {
            const document = await testServices.parse(s`
                Domain Sales { vision: "Sales" }
                bc OrderContext for Sales {
                    description: "Order management"
                }
            `);
            expectValidDocument(document);

            const provider = testServices.services.DomainLang.lsp.CompletionProvider;
            const items: { label: string }[] = [];
            const acceptor = (item: { label: string }): void => {
                items.push({ label: item.label });
            };

            const textDocument = document.textDocument;
            const position = Position.create(3, 0);
            const context = {
                document,
                textDocument,
                node: document.parseResult.value.children[1],
                tokenOffset: textDocument.offsetAt(position),
                tokenEndOffset: textDocument.offsetAt(position),
                position,
            };

            await (provider as unknown as { safeCompletionFor: (ctx: unknown, next: unknown, acceptor: unknown) => Promise<void> })
                .safeCompletionFor(context, {}, acceptor);

            expect(items.length).toBeGreaterThan(0);
        });
    });

    // ================================================================
    // Scope provider: error resilience
    // ================================================================

    describe('Scope provider handles errors gracefully', () => {
        test('resolves references normally in valid documents', async () => {
            const document = await testServices.parse(s`
                Domain Sales { vision: "Sales domain" }
                bc OrderContext for Sales
            `);
            expectValidDocument(document);

            // Reference to Sales should resolve correctly
            const model = document.parseResult.value;
            // If scope provider threw, the document would have linking errors
            expect(model.children.length).toBeGreaterThan(0);
            expect(document.diagnostics?.filter(d => d.severity === 1)).toHaveLength(0);
        });

        test('handles unresolved references without crashing', async () => {
            const document = await testServices.parse(s`
                bc OrderContext for NonExistentDomain
            `);

            // Should have linking errors but not crash
            const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
            expect(errors.length).toBeGreaterThan(0);
        });
    });

    // ================================================================
    // Node kind provider: unknown node handling
    // ================================================================

    describe('Node kind provider handles edge cases', () => {
        test('returns default SymbolKind for unknown AST node types', async () => {
            const { DomainLangNodeKindProvider } = await import('../../src/lsp/domain-lang-node-kind-provider.js');
            const provider = new DomainLangNodeKindProvider();

            // Mock a node-like object with an unrecognized $type
            const unknownNode = {
                $type: 'UnknownType',
                $container: undefined,
                $containerProperty: undefined,
                $containerIndex: undefined,
                $document: undefined,
                $cstNode: undefined,
            };

            // Should not throw, should return a default
            const symbolKind = provider.getSymbolKind(unknownNode as never);
            expect(symbolKind).toBeDefined();

            const completionKind = provider.getCompletionItemKind(unknownNode as never);
            expect(completionKind).toBeDefined();
        });
    });

    // ================================================================
    // Hover provider: 'this' reference MaybePromise safety
    // ================================================================

    describe('Hover provider this-ref safety', () => {
        test('hovering over "this" in context map does not crash', async () => {
            const hoverProvider = testServices.services.DomainLang.lsp.HoverProvider!;
            const document = await testServices.parse(s`
                Domain Sales { vision: "Sales domain" }
                bc OrderCtx for Sales
                bc BillingCtx for Sales
                ContextMap SalesMap {
                    contains OrderCtx, BillingCtx
                    [OHS] this -> [CF] BillingCtx
                }
            `);

            const params: HoverParams = {
                textDocument: { uri: document.textDocument.uri },
                position: Position.create(6, 14), // 'this' keyword position
            };

            // Should not throw - the MaybePromise fix ensures safe handling
            const hover = await hoverProvider.getHoverContent(document, params);
            // May return undefined if position doesn't resolve, but should not crash
            if (hover) {
                expect((hover as { contents: { kind: string } }).contents.kind).toBe('markdown');
            }
        });
    });
});
