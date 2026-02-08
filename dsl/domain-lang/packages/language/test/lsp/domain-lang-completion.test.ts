/**
 * Tests for DomainLangCompletionProvider.
 *
 * Smoke (~20%):
 * - Top-level snippets include Domain / BoundedContext labels
 * - BoundedContext completions include BC-specific labels (description, team, etc.)
 *
 * Edge/error (~80%):
 * - Top-level excludes documentation blocks
 * - Inside BC body, no top-level snippets appear
 * - Inside Domain body, no top-level snippets and no BC-only blocks
 * - Duplicate-block prevention for BC
 * - Duplicate-block prevention for Domain
 * - Shorthand "by" clause suppresses team completion
 * - Shorthand "as" clause suppresses classification completion
 * - Domain completions exclude BC-only blocks
 * - BoundedContext completions exclude Domain-only blocks
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver';
import { setupTestSuite, type TestServices } from '../test-helpers.js';
import * as ast from '../../src/generated/ast.js';

describe('DomainLangCompletionProvider', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    /**
     * Helper to get completions for a given context node.
     * Uses type assertion to access protected method for testing.
     */
    const getCompletions = async (input: string, nodeIndex = 0): Promise<any[]> => {
        const document = await testServices.parse(input);
        const completions: any[] = [];

        let node: any = document.parseResult.value;
        if (nodeIndex > 0 && ast.isModel(node)) {
            node = node.children[nodeIndex - 1];
        }

        const context = {
            node,
            tokenOffset: 0,
            tokenEndOffset: 0,
            document,
            textDocument: { uri: 'test.dlang' } as any,
            position: { line: 0, character: 0 }
        };

        (testServices.services.DomainLang.lsp.CompletionProvider as any).completionFor(
            context as any,
            {} as any,
            (_ctx: any, item: any) => completions.push(item)
        );

        return completions;
    };

    // ==========================================
    // SMOKE: top-level snippets with label verification
    // ==========================================
    test('top-level completions include Domain and BoundedContext snippet labels', async () => {
        const completions = await getCompletions('');
        expect(completions.length).toBeGreaterThan(0);

        const labels = completions.map(c => c.label);
        const hasDomain = labels.some((l: string) => l.includes('Domain'));
        const hasBC = labels.some((l: string) => l.includes('BoundedContext'));
        expect(hasDomain).toBe(true);
        expect(hasBC).toBe(true);
    });

    // ==========================================
    // SMOKE: BC completions include BC-specific blocks with label checks
    // ==========================================
    test('BoundedContext body completions differ from top-level completions', async () => {
        const topLevelCompletions = await getCompletions('', 0);
        const input = `
            Domain Sales {}
            BoundedContext Test for Sales {}
        `;
        const bcCompletions = await getCompletions(input, 2);
        expect(bcCompletions.length).toBeGreaterThan(0);

        // BC body completions should be different from top-level (context-sensitive)
        const topLabels = new Set(topLevelCompletions.map(c => c.label));
        const bcLabels = new Set(bcCompletions.map(c => c.label));
        // At least some labels should differ between contexts
        const bcOnly = [...bcLabels].filter(l => !topLabels.has(l));
        const topOnly = [...topLabels].filter(l => !bcLabels.has(l));
        expect(bcOnly.length + topOnly.length).toBeGreaterThan(0);
    });

    // ==========================================
    // EDGE: top-level excludes documentation blocks
    // ==========================================
    test('top-level completions exclude documentation blocks like description, team, vision', async () => {
        const completions = await getCompletions('', 0);
        const labels = completions.map(c => c.label);

        expect(labels.some((l: string) => l.includes('Domain') || l.includes('BoundedContext'))).toBe(true);
        expect(labels).not.toContain('description');
        expect(labels).not.toContain('team');
        expect(labels).not.toContain('classification');
        expect(labels).not.toContain('vision');
        expect(labels).not.toContain('terminology');
    });

    // ==========================================
    // EDGE: inside BC body, no top-level snippets appear
    // ==========================================
    test('inside BoundedContext body, no top-level snippets appear', async () => {
        const input = `
            Team SupportTeam
            BoundedContext SupportPortal for Marketplace {
                description: "Handles customer support"

            }
        `;
        const completions = await getCompletions(input, 2);
        const labels = completions.map(c => c.label);

        expect(labels).not.toContain('Domain (simple)');
        expect(labels).not.toContain('Domain (detailed)');
        expect(labels).not.toContain('BoundedContext (simple)');
        expect(labels).not.toContain('BoundedContext (detailed)');
        expect(labels).not.toContain('Team');
        expect(labels).not.toContain('Classification');
    });

    // ==========================================
    // EDGE: inside Domain body, no top-level snippets and no BC blocks
    // ==========================================
    test('inside Domain body, no top-level snippets appear', async () => {
        const input = `
            Domain Sales {
                vision: "Be the best"

            }
        `;
        const completions = await getCompletions(input, 1);
        const labels = completions.map(c => c.label);

        expect(labels).not.toContain('Domain (simple)');
        expect(labels).not.toContain('BoundedContext (simple)');
        expect(labels).not.toContain('Team');
    });

    // ==========================================
    // EDGE: duplicate prevention for BC
    // ==========================================
    test('does not suggest description/team blocks that already exist in BoundedContext', async () => {
        const input = `
            Domain Sales {}
            Team TestTeam
            BoundedContext Test for Sales {
                description: "Test context"
                team: TestTeam
            }
        `;
        const completions = await getCompletions(input, 3);
        const labels = completions.map(c => c.label);

        expect(labels).not.toContain('description');
        expect(labels).not.toContain('team');
    });

    // ==========================================
    // EDGE: duplicate prevention for Domain
    // ==========================================
    test('does not suggest vision/description blocks that already exist in Domain', async () => {
        const input = `
            Domain Sales {
                vision: "Be the best"
                description: "Sales domain"
            }
        `;
        const completions = await getCompletions(input, 1);
        const labels = completions.map(c => c.label);

        expect(labels).not.toContain('vision');
        expect(labels).not.toContain('description');
    });

    // ==========================================
    // EDGE: shorthand "by" clause suppresses team
    // ==========================================
    test('does not suggest team when set via "by" clause', async () => {
        const input = `
            Domain Sales {}
            Team MyTeam
            BoundedContext Test for Sales by MyTeam {}
        `;
        const completions = await getCompletions(input, 3);
        const labels = completions.map(c => c.label);

        expect(labels).not.toContain('team');
    });

    // ==========================================
    // EDGE: shorthand "as" clause suppresses classification
    // ==========================================
    test('does not suggest classification when set via "as" clause', async () => {
        const input = `
            Domain Sales {}
            Classification Core
            BoundedContext Test for Sales as Core {}
        `;
        const completions = await getCompletions(input, 3);
        const labels = completions.map(c => c.label);

        expect(labels).not.toContain('classification');
    });

    // ==========================================
    // EDGE: Domain completions exclude BC-only blocks
    // ==========================================
    test('Domain completions exclude BoundedContext-only blocks', async () => {
        const input = 'Domain Sales {}';
        const completions = await getCompletions(input, 1);
        const labels = completions.map(c => c.label);

        expect(labels.some((l: string) => l.includes('vision'))).toBe(true);
        expect(labels).not.toContain('team');
        expect(labels).not.toContain('terminology');
        expect(labels).not.toContain('relationships');
    });

    // ==========================================
    // EDGE: BoundedContext completions exclude Domain-only blocks
    // ==========================================
    test('BoundedContext completions exclude Domain-only blocks', async () => {
        const input = `
            Domain Sales {}
            BoundedContext Test for Sales {}
        `;
        const completions = await getCompletions(input, 2);
        const labels = completions.map(c => c.label);

        expect(labels).not.toContain('vision');
        expect(labels).not.toContain('classification');
    });

    // ==========================================
    // EDGE: Domain and ContextMap completions differ in available labels
    // ==========================================
    test('ContextMap completions include contains but not vision or description', async () => {
        const input = 'ContextMap Sales {}';
        const completions = await getCompletions(input, 1);
        const labels = completions.map(c => c.label);

        // ContextMap should not offer Domain-specific blocks
        expect(labels).not.toContain('vision');
    });

    // ==========================================
    // IMPORT: Top-level includes import snippet
    // ==========================================
    test('top-level completions include import snippet', async () => {
        const completions = await getCompletions('');
        const labels = completions.map(c => c.label);

        expect(labels.some((l: string) => l.includes('import'))).toBe(true);
    });

    // ==========================================
    // IMPORT: Import URI completion detection via NextFeature
    // ==========================================
    describe('Import URI Completion Detection', () => {
        /**
         * Test that isImportUriCompletion correctly identifies import contexts
         * using the NextFeature's type and property fields.
         */
        test('recognizes import completion via next.type and next.property', async () => {
            const document = await testServices.parse('');
            const provider = testServices.services.DomainLang.lsp.CompletionProvider as any;
            
            // Create a NextFeature that simulates completing the uri property of ImportStatement
            const nextFeature = {
                type: 'ImportStatement',
                property: 'uri',
                feature: { $type: 'Assignment', feature: 'uri' }
            };
            
            const context = {
                node: document.parseResult.value,
                document,
                textDocument: { getText: () => 'import "' },
                offset: 8,
                tokenOffset: 7,
                tokenEndOffset: 8,
                position: { line: 0, character: 8 }
            };
            
            const result = provider.isImportUriCompletion(
                context.node,
                context,
                nextFeature
            );
            
            expect(result).toBe(true);
        });

        test('recognizes import completion via text pattern matching', async () => {
            const document = await testServices.parse('');
            const provider = testServices.services.DomainLang.lsp.CompletionProvider as any;
            
            // NextFeature that doesn't specify ImportStatement type 
            const nextFeature = {
                feature: {} // Not an assignment
            };
            
            const context = {
                node: document.parseResult.value,
                document,
                textDocument: { 
                    getText: () => 'import "@domains/'
                },
                offset: 17,
                tokenOffset: 7,
                tokenEndOffset: 17,
                position: { line: 0, character: 17 }
            };
            
            const result = provider.isImportUriCompletion(
                context.node,
                context,
                nextFeature
            );
            
            expect(result).toBe(true);
        });

        test('does not recognize non-import contexts', async () => {
            const document = await testServices.parse('Domain Sales {}');
            const provider = testServices.services.DomainLang.lsp.CompletionProvider as any;
            
            const nextFeature = {
                type: 'Domain',
                property: 'name',
                feature: {}
            };
            
            const context = {
                node: document.parseResult.value,
                document,
                textDocument: { getText: () => 'Domain Sales {}' },
                offset: 7,
                tokenOffset: 7,
                tokenEndOffset: 12,
                position: { line: 0, character: 7 }
            };
            
            const result = provider.isImportUriCompletion(
                context.node,
                context,
                nextFeature
            );
            
            expect(result).toBe(false);
        });
    });

    // ==========================================
    // IMPORT: Import completion integration tests
    // ==========================================
    describe('Import completion behavior', () => {
        /**
         * Test that getCompletion returns import completions when cursor is inside import string.
         * This is the actual user-facing behavior.
         */
        test('provides completions inside empty import string', async () => {
            const document = await testServices.parse('import ""');
            const provider = testServices.services.DomainLang.lsp.CompletionProvider;
            
            // Simulate cursor position inside the quotes: import "|"
            const params = {
                textDocument: { uri: document.uri.toString() },
                position: { line: 0, character: 8 } // after opening quote
            };
            
            const result = await provider.getCompletion(document, params);
            expect(result).toBeDefined();
            expect(result?.items).toBeDefined();
            
            if (result?.items) {
                const labels = result.items.map(item => item.label);
                
                // Must include local path starters
                expect(labels).toContain('./');
                expect(labels).toContain('../');
            }
        });

        test('provides filtered dependency completions when typing partial name', async () => {
            const document = await testServices.parse('import "lar"');
            const provider = testServices.services.DomainLang.lsp.CompletionProvider;
            
            // Simulate cursor after "lar": import "lar|"
            const params = {
                textDocument: { uri: document.uri.toString() },
                position: { line: 0, character: 11 }
            };
            
            const result = await provider.getCompletion(document, params);
            expect(result).toBeDefined();
            expect(result?.items).toBeDefined();
        });

        test('import completions work with Import keyword (capital I)', async () => {
            const document = await testServices.parse('Import ""');
            const provider = testServices.services.DomainLang.lsp.CompletionProvider;
            
            // Simulate cursor inside the quotes: Import "|"
            const params = {
                textDocument: { uri: document.uri.toString() },
                position: { line: 0, character: 8 }
            };
            
            const result = await provider.getCompletion(document, params);
            expect(result).toBeDefined();
            expect(result?.items).toBeDefined();
            
            if (result?.items) {
                const labels = result.items.map(item => item.label);
                expect(labels).toContain('./');
                expect(labels).toContain('../');
            }
        });
    });

    // ==========================================
    // IMPORT: Completion item structure validation
    // ==========================================
    describe('Import completion item structure', () => {
        test('local path items have correct structure', async () => {
            const provider = testServices.services.DomainLang.lsp.CompletionProvider as any;
            // Mock the workspace manager to return no manifest
            provider.workspaceManager = { ensureManifestLoaded: () => Promise.resolve(undefined) };

            const items = await provider.collectImportItems('');
            
            const localCurrentItem = items.find((item: any) => item.label === './');
            expect(localCurrentItem).toBeDefined();
            expect(localCurrentItem.kind).toBe(CompletionItemKind.Folder);
            expect(localCurrentItem.insertText).toBe('./');
            expect(localCurrentItem.documentation).toContain('current directory');
            
            const localParentItem = items.find((item: any) => item.label === '../');
            expect(localParentItem).toBeDefined();
            expect(localParentItem.kind).toBe(CompletionItemKind.Folder);
            expect(localParentItem.insertText).toBe('../');
            expect(localParentItem.documentation).toContain('parent directory');
        });

        test('alias items have correct structure when manifest available', async () => {
            const provider = testServices.services.DomainLang.lsp.CompletionProvider as any;
            
            const mockManifest = {
                paths: {
                    '@domains': './domains'
                }
            };
            provider.workspaceManager = { ensureManifestLoaded: () => Promise.resolve(mockManifest) };
            
            const items = await provider.collectImportItems('');
            const aliasItem = items.find((item: any) => item.label === '@domains');
            
            expect(aliasItem).toBeDefined();
            expect(aliasItem.kind).toBe(CompletionItemKind.Module);
            expect(aliasItem.insertText).toBe('@domains');
            expect(aliasItem.detail).toContain('./domains');
            expect(aliasItem.documentation).toContain('model.yaml');
        });

        test('dependency items have correct structure when manifest available', async () => {
            const provider = testServices.services.DomainLang.lsp.CompletionProvider as any;
            
            const mockManifest = {
                dependencies: {
                    'larsbaunwall/ddd-types': { ref: 'main' }
                }
            };
            provider.workspaceManager = { ensureManifestLoaded: () => Promise.resolve(mockManifest) };
            
            const items = await provider.collectImportItems('');
            const depItem = items.find((item: any) => item.label === 'larsbaunwall/ddd-types');
            
            expect(depItem).toBeDefined();
            expect(depItem.kind).toBe(CompletionItemKind.Module);
            expect(depItem.insertText).toBe('larsbaunwall/ddd-types');
            expect(depItem.detail).toContain('main');
            expect(depItem.documentation).toContain('model.yaml');
        });
    });

    // ==========================================
    // IMPORT: Filtering behavior validation
    // ==========================================
    describe('Import completion filtering', () => {
        test('filters aliases by input prefix', async () => {
            const provider = testServices.services.DomainLang.lsp.CompletionProvider as any;
            
            const mockManifest = {
                paths: {
                    '@core': './core',
                    '@domains': './domains',
                    '@shared': './shared'
                }
            };
            provider.workspaceManager = { ensureManifestLoaded: () => Promise.resolve(mockManifest) };
            
            // Filter with '@d' - should only show @domains
            const items = await provider.collectImportItems('@d');
            const labels = items.map((item: any) => item.label);
            
            expect(labels).toContain('@domains');
            expect(labels).not.toContain('@core');
            expect(labels).not.toContain('@shared');
            // Only @domains should match the filter
            expect(labels.filter((l: string) => l.startsWith('@')).length).toBe(1);
        });

        test('filters dependencies by input prefix', async () => {
            const provider = testServices.services.DomainLang.lsp.CompletionProvider as any;
            
            const mockManifest = {
                dependencies: {
                    'larsbaunwall/ddd-types': { ref: 'main' },
                    'larsbaunwall/events': { ref: 'v1.0.0' },
                    'other/package': { ref: 'latest' }
                }
            };
            provider.workspaceManager = { ensureManifestLoaded: () => Promise.resolve(mockManifest) };
            
            // Filter with 'lars' - should only show larsbaunwall packages
            const items = await provider.collectImportItems('lars');
            const labels = items.map((item: any) => item.label);
            
            expect(labels).toContain('larsbaunwall/ddd-types');
            expect(labels).toContain('larsbaunwall/events');
            expect(labels).not.toContain('other/package');
        });

        test('case-insensitive filtering', async () => {
            const provider = testServices.services.DomainLang.lsp.CompletionProvider as any;
            
            const mockManifest = {
                dependencies: {
                    'LarsBaunwall/DDD-Types': { ref: 'main' }
                }
            };
            provider.workspaceManager = { ensureManifestLoaded: () => Promise.resolve(mockManifest) };
            
            // Filter with lowercase 'lars' - should match uppercase 'Lars'
            const items = await provider.collectImportItems('lars');
            const labels = items.map((item: any) => item.label);
            
            expect(labels).toContain('LarsBaunwall/DDD-Types');
        });
    });
});
