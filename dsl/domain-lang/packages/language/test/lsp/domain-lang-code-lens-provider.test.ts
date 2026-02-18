import { beforeAll, describe, expect, test } from 'vitest';
import type { CodeLens } from 'vscode-languageserver';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

async function getCodeLens(input: string): Promise<CodeLens[]> {
    const document = await testServices.parse(input);
    const provider = testServices.services.DomainLang.lsp.CodeLensProvider;
    if (!provider) {
        throw new Error('CodeLensProvider not available');
    }

    const codeLens = await provider.provideCodeLens(document, {
        textDocument: { uri: document.uri.toString() },
    });

    return codeLens ?? [];
}

describe('DomainLangCodeLensProvider', () => {
    test('creates open-diagram code lens for each context map', async () => {
        // Arrange
        const input = s`
            Domain Sales { vision: "v" }
            bc Orders for Sales {}
            ContextMap SalesSystem {
                contains Orders
            }
        `;

        // Act
        const codeLenses = await getCodeLens(input);

        // Assert
        expect(codeLenses).toHaveLength(1);
        expect(codeLenses[0].command).toEqual(expect.objectContaining({
            title: 'Open diagram',
            command: 'domainlang.diagram.open',
        }));
        expect(codeLenses[0].command?.arguments?.[0]).toEqual(
            expect.objectContaining({
                uri: expect.any(String),
            })
        );
    });

    test('returns no code lens when no context maps exist', async () => {
        // Arrange
        const input = s`
            Domain Sales { vision: "v" }
            bc Orders for Sales {}
        `;

        // Act
        const codeLenses = await getCodeLens(input);

        // Assert
        expect(codeLenses).toHaveLength(0);
    });

    test('creates code lens for context maps inside namespace blocks', async () => {
        // Arrange
        const input = s`
            namespace acme.sales {
                Domain Sales { vision: "v" }
                bc Orders for Sales {}
                ContextMap SalesSystem {
                    contains Orders
                }
            }
        `;

        // Act
        const codeLenses = await getCodeLens(input);

        // Assert
        expect(codeLenses).toHaveLength(1);
        expect(codeLenses[0].command).toEqual(expect.objectContaining({
            title: 'Open diagram',
            command: 'domainlang.diagram.open',
        }));
    });
});
