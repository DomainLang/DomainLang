import { beforeAll, describe, expect, test } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

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
