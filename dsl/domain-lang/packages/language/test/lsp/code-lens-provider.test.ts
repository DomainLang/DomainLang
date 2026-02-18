import { beforeAll, describe, expect, test } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';

let testServices: TestServices;
let provider: NonNullable<(typeof testServices)['services']['DomainLang']['lsp']['CodeLensProvider']>;

beforeAll(() => {
    testServices = setupTestSuite();
    const resolved = testServices.services.DomainLang.lsp.CodeLensProvider;
    if (!resolved) throw new Error('CodeLensProvider not available');
    provider = resolved;
});

describe('DomainLangCodeLensProvider', () => {
    test('returns an "Open diagram" lens for each ContextMap in the document', async () => {
        // Arrange
        const document = await testServices.parse(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                bc Billing for Sales {}

                ContextMap SalesSystem {
                    contains Orders, Billing
                }

                ContextMap SalesSummary {
                    contains Orders
                }
            `
        );

        // Act
        const lenses = await provider.provideCodeLens(document, {
            textDocument: { uri: document.uri.toString() },
        });

        // Assert
        expect(lenses).toHaveLength(2);
        expect(lenses?.every((lens) => lens.command?.title === 'Open diagram')).toBe(true);
        expect(lenses?.every((lens) => lens.command?.command === 'domainlang.diagram.open')).toBe(true);
    });

    test('returns empty list when no ContextMap is defined', async () => {
        // Arrange
        const document = await testServices.parse(
            s`Domain Sales { vision: "v" }`
        );

        // Act
        const lenses = await provider.provideCodeLens(document, {
            textDocument: { uri: document.uri.toString() },
        });

        // Assert
        expect(lenses ?? []).toHaveLength(0);
    });

    test('passes document URI in lens command arguments', async () => {
        // Arrange
        const document = await testServices.parse(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}

                ContextMap SalesSystem {
                    contains Orders
                }
            `
        );

        // Act
        const lenses = await provider.provideCodeLens(document, {
            textDocument: { uri: document.uri.toString() },
        });

        // Assert
        expect(lenses).toHaveLength(1);
        const args = lenses?.[0].command?.arguments?.[0] as { uri: string };
        expect(args.uri).toBe(document.uri.toString());
    });

    test('positions the lens at the start of the ContextMap keyword line', async () => {
        // Arrange
        const document = await testServices.parse(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}

                ContextMap SalesSystem {
                    contains Orders
                }
            `
        );

        // Act
        const lenses = await provider.provideCodeLens(document, {
            textDocument: { uri: document.uri.toString() },
        });

        // Assert
        expect(lenses).toHaveLength(1);
        expect(lenses?.[0].range.start.character).toBe(0);
        expect(lenses?.[0].range.end.character).toBe(0);
    });

    test('returns a single lens for the one ContextMap in the document', async () => {
        // Arrange
        const document = await testServices.parse(
            s`
                Domain Sales { vision: "v" }
                bc Orders for Sales {}

                ContextMap SalesSystem {
                    contains Orders
                }
            `
        );

        // Act
        const lenses = await provider.provideCodeLens(document, {
            textDocument: { uri: document.uri.toString() },
        });

        // Assert
        expect(lenses).toHaveLength(1);
        expect(lenses?.[0].command?.title).toBe('Open diagram');
    });
});
