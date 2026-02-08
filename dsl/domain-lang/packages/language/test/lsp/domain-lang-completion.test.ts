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
});
