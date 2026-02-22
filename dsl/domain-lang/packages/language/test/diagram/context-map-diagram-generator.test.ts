import { beforeAll, describe, expect, test } from 'vitest';
import type { SEdge, SModelElement } from 'sprotty-protocol';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ─────────────────────────────────────────────────────────────────────────────
// Diagram generation helpers
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function generateDiagram(source: string, documentUri: string, selectedContextMapFqn?: string) {
    const document = await testServices.parse(source, { documentUri });
    const generator = testServices.services.DomainLang.diagram.DiagramGenerator;
    return generator.generate({
        options: { sourceUri: document.uri.toString(), ...(selectedContextMapFqn !== undefined ? { selectedContextMapFqn } : {}) },
        state: {
            options: {},
            currentRoot: { type: 'graph', id: 'current-root', children: [] },
            revision: 0,
        },
    });
}

function getEdges(model: { children?: SModelElement[] }): SEdge[] {
    return (model.children ?? []).filter((c): c is SEdge => c.type === 'edge') as SEdge[];
}

function getEdgeChildren(edge: SEdge, type: string): Array<SModelElement & { text?: string }> {
    return ((edge as SEdge & { children?: SModelElement[] }).children ?? [])
        .filter(c => c.type === type) as Array<SModelElement & { text?: string }>;
}

function getAllBadges(model: { children?: SModelElement[] }): string[] {
    const edges = getEdges(model);
    return edges.flatMap(edge => getEdgeChildren(edge, 'label:ud-badge').map(c => c.text ?? ''));
}

function getAllEdgeLabels(model: { children?: SModelElement[] }): string[] {
    const edges = getEdges(model);
    return edges.flatMap(edge => getEdgeChildren(edge, 'label:edge').map(c => c.text ?? ''));
}

describe('DomainLangContextMapDiagramGenerator', () => {
    test('generates a context-map graph for the selected map fqn', async () => {
        // Arrange
        const document = await testServices.parse(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                bc Support for Sales {}

                ContextMap SalesLandscape {
                    contains Orders, Billing
                    [OHS] Orders -> [CF] Billing
                }

                ContextMap SupportLandscape {
                    contains Support
                }
            `,
            { documentUri: 'file:///diagram-selected-map.dlang' }
        );

        const generator = testServices.services.DomainLang.diagram.DiagramGenerator;

        // Act
        const model = await generator.generate({
            options: {
                sourceUri: document.uri.toString(),
                selectedContextMapFqn: 'SupportLandscape',
            },
            state: {
                options: {},
                currentRoot: {
                    type: 'graph',
                    id: 'current-root',
                    children: [],
                },
                revision: 0,
            },
        });

        // Assert
        const root = model;
        const labels = (root.children ?? [])
            .flatMap((child) => child.children ?? [])
            .filter((child): child is typeof child & { text: string } => child.type === 'label' && typeof Reflect.get(child, 'text') === 'string')
            .map((child) => child.text);
        expect(labels).toContain('Support');
    });

    test('returns an empty graph when no context maps exist', async () => {
        // Arrange
        const document = await testServices.parse(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
            `,
            { documentUri: 'file:///diagram-no-context-map.dlang' }
        );

        const generator = testServices.services.DomainLang.diagram.DiagramGenerator;

        // Act
        const model = await generator.generate({
            options: {
                sourceUri: document.uri.toString(),
            },
            state: {
                options: {},
                currentRoot: {
                    type: 'graph',
                    id: 'current-root',
                    children: [],
                },
                revision: 0,
            },
        });

        // Assert
        const root = model;
        expect(root.type).toBe('graph');
        expect(root.children ?? []).toHaveLength(0);
    });

    test('keeps unresolved context references visible as placeholder nodes', async () => {
        // Arrange
        const document = await testServices.parse(
            s`
                ContextMap SalesLandscape {
                    contains MissingContext
                }
            `,
            { documentUri: 'file:///diagram-unresolved-context.dlang' }
        );

        const generator = testServices.services.DomainLang.diagram.DiagramGenerator;

        // Act
        const model = await generator.generate({
            options: {
                sourceUri: document.uri.toString(),
                selectedContextMapName: 'SalesLandscape',
            },
            state: {
                options: {},
                currentRoot: {
                    type: 'graph',
                    id: 'current-root',
                    children: [],
                },
                revision: 0,
            },
        });

        // Assert
        const labels = (model.children ?? [])
            .flatMap((child) => child.children ?? [])
            .filter((child): child is typeof child & { text: string } => child.type === 'label' && typeof Reflect.get(child, 'text') === 'string')
            .map((child) => child.text);

        expect(labels).toContain('MissingContext');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Relationship edge generation
// ═══════════════════════════════════════════════════════════════════════════════

describe('DomainLangContextMapDiagramGenerator – relationship edges', () => {

    // ── U/D badges for UpstreamDownstream ────────────────────────────────────

    test('generates U|OHS and D|CF badges, no center label for UpstreamDownstream', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders [OHS] -> [CF] Billing
                }
            `,
            'file:///diagram-ud-badges.dlang'
        );

        // Assert
        const badges = getAllBadges(model);
        expect(badges).toContain('U|OHS');
        expect(badges).toContain('D|CF');
        const centerLabels = getAllEdgeLabels(model);
        expect(centerLabels).not.toContain('UpstreamDownstream');
        expect(centerLabels).not.toContain('Upstream/Downstream');
    });

    test('generates reversed U/D badges for <- arrow', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders [CF] <- [OHS] Billing
                }
            `,
            'file:///diagram-ud-badges-reverse.dlang'
        );

        // Assert
        const badges = getAllBadges(model);
        expect(badges).toContain('U|OHS');
        expect(badges).toContain('D|CF');
    });

    test('no center label for UpstreamDownstream relationship', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders [OHS] -> [CF] Billing
                }
            `,
            'file:///diagram-ud-no-label.dlang'
        );

        // Assert — center label should NOT say UpstreamDownstream
        const centerLabels = getAllEdgeLabels(model);
        expect(centerLabels).not.toContain('UpstreamDownstream');
        expect(centerLabels).not.toContain('Upstream/Downstream');
    });

    // ── S/C badges for CustomerSupplier ──────────────────────────────────────

    test('generates S| and C| badges without duplication for CustomerSupplier', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders [Supplier] -> [Customer] Billing
                }
            `,
            'file:///diagram-cs-badges.dlang'
        );

        // Assert — role badge text should be "S|" and "C|", not "S|S" or "C|C"
        const badges = getAllBadges(model);
        expect(badges).toContain('S|');
        expect(badges).toContain('C|');
        expect(badges).not.toContain('S|S');
        expect(badges).not.toContain('C|C');
        const centerLabels = getAllEdgeLabels(model);
        expect(centerLabels).not.toContain('CustomerSupplier');
        expect(centerLabels).not.toContain('Customer/Supplier');
    });

    // ── BBoM node type ────────────────────────────────────────────────────────

    test('renders context with BBoM pattern as node:bbom node type', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Legacy for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Legacy, Billing
                    Legacy [BBoM] -> Billing
                }
            `,
            'file:///diagram-bbom-node.dlang'
        );

        // Assert
        const nodes = (model.children ?? []).filter(c => c.type === 'node' || c.type === 'node:bbom');
        const bbomNodes = nodes.filter(c => c.type === 'node:bbom');
        expect(bbomNodes.length).toBeGreaterThanOrEqual(1);
    });

    test('does not include BBoM in badge patterns (shown on node, not in badge)', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Legacy for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Legacy, Billing
                    Legacy [BBoM, OHS] -> [CF] Billing
                }
            `,
            'file:///diagram-bbom-badge.dlang'
        );

        // Assert — BBoM should not appear in badge text; OHS should be present
        const badges = getAllBadges(model);
        expect(badges.join(' ')).not.toContain('BBoM');
        expect(badges.join(' ')).not.toContain('BigBallOfMud');
        expect(badges).toContain('U|OHS');
    });

    // ── Symmetric relationships ───────────────────────────────────────────────

    test('generates "Shared Kernel" center label for SharedKernel relationship', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders [SK] Billing
                }
            `,
            'file:///diagram-sk-label.dlang'
        );

        // Assert
        const centerLabels = getAllEdgeLabels(model);
        expect(centerLabels).toContain('Shared Kernel');
    });

    test('generates "Partnership" center label and partnership CSS class', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders [P] Billing
                }
            `,
            'file:///diagram-p-label.dlang'
        );

        // Assert
        const edges = getEdges(model);
        const centerLabels = getAllEdgeLabels(model);
        expect(centerLabels).toContain('Partnership');
        expect(edges.some(e => (e.cssClasses ?? []).includes('partnership'))).toBe(true);
    });

    test('generates edge with separate-ways CSS class for >< relationship', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders >< Billing
                }
            `,
            'file:///diagram-sw-edge.dlang'
        );

        // Assert
        const edges = getEdges(model);
        expect(edges.some(e => (e.cssClasses ?? []).includes('separate-ways'))).toBe(true);
    });

    test('generates "Separate Ways" center label for >< relationship', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders >< Billing
                }
            `,
            'file:///diagram-sw-label.dlang'
        );

        // Assert
        const centerLabels = getAllEdgeLabels(model);
        expect(centerLabels).toContain('Separate Ways');
    });

    // ── Bidirectional (<->) ───────────────────────────────────────────────────

    test('generates positional pattern badges for bidirectional <-> relationship', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders [OHS] <-> [ACL] Billing
                }
            `,
            'file:///diagram-bidir-badges.dlang'
        );

        // Assert — bidirectional has no role prefix, just patterns
        const badges = getAllBadges(model);
        expect(badges).toContain('|OHS');
        expect(badges).toContain('|ACL');
    });

    test('generates partnership CSS class for <-> relationship', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders <-> Billing
                }
            `,
            'file:///diagram-bidir-css.dlang'
        );

        // Assert
        const edges = getEdges(model);
        expect(edges.some(e => (e.cssClasses ?? []).includes('partnership'))).toBe(true);
    });

    // ── No-pattern edge ───────────────────────────────────────────────────────

    test('generates role-only badges (U| and D|) when no patterns are specified', async () => {
        // Arrange & Act
        const model = await generateDiagram(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}
                ContextMap M {
                    contains Orders, Billing
                    Orders -> Billing
                }
            `,
            'file:///diagram-no-patterns.dlang'
        );

        // Assert — edge should exist with role-only badges (no pattern text after the pipe)
        const edges = getEdges(model);
        expect(edges).toHaveLength(1);
        const badges = getAllBadges(model);
        expect(badges).toContain('U|');
        expect(badges).toContain('D|');
    });
});
