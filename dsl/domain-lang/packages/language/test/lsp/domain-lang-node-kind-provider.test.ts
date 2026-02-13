/**
 * Tests for DomainLangNodeKindProvider — AST type to icon kind mapping.
 *
 * Note: SymbolKind mappings are tested through the full LSP pipeline in
 * document-symbol-provider.test.ts. This file focuses on CompletionItemKind
 * mappings and AstNodeDescription handling which are only covered here.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import { CompletionItemKind, SymbolKind } from 'vscode-languageserver';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s, expectValidDocument } from '../test-helpers.js';
import { AstUtils, URI } from 'langium';
import type { AstNode, AstNodeDescription } from 'langium';
import {
    isDomain,
    isBoundedContext,
    isTeam,
    isClassification,
    isContextMap,
    isNamespaceDeclaration,
    isRelationship,
} from '../../src/generated/ast.js';
import type { DomainLangNodeKindProvider } from '../../src/lsp/domain-lang-node-kind-provider.js';

let testServices: TestServices;
let provider: DomainLangNodeKindProvider;

beforeAll(() => {
    testServices = setupTestSuite();
    // Use DI-injected provider from Langium shared services (not direct instantiation)
    // This ensures the provider is configured exactly as the LSP server uses it
    provider = testServices.services.shared.lsp.NodeKindProvider as DomainLangNodeKindProvider;
});

/**
 * Parse a DomainLang snippet and return the first AST node matching a guard.
 */
async function findFirst(
    input: string,
    guard: (n: AstNode) => boolean
): Promise<AstNode> {
    const doc = await testServices.parse(input);
    expectValidDocument(doc);
    for (const node of AstUtils.streamAllContents(doc.parseResult.value)) {
        if (guard(node)) return node;
    }
    throw new Error(`No node matching guard found in: ${input}`);
}

// ============================================================================
// CompletionItemKind mapping tests
// ============================================================================

describe('NodeKindProvider CompletionItemKind mapping', () => {
    test.each([
        { input: 'Domain Sales {}', guard: isDomain, expected: CompletionItemKind.Folder, label: 'Domain' },
        { input: 'Domain Sales {}\nbc OrderCtx for Sales', guard: isBoundedContext, expected: CompletionItemKind.Module, label: 'BoundedContext' },
        { input: 'Team SalesTeam', guard: isTeam, expected: CompletionItemKind.Interface, label: 'Team' },
        { input: 'Classification Core', guard: isClassification, expected: CompletionItemKind.Enum, label: 'Classification' },
        { input: 'Domain Sales {}\nbc A for Sales\nbc B for Sales\nContextMap SalesMap { contains A, B }', guard: isContextMap, expected: CompletionItemKind.Module, label: 'ContextMap' },
        { input: 'Namespace acme.sales { Domain Sales {} }', guard: isNamespaceDeclaration, expected: CompletionItemKind.Module, label: 'Namespace' },
        { input: 'Domain Sales {}\nbc A for Sales\nbc B for Sales\nContextMap SalesMap {\n  contains A, B\n  A -> B\n}', guard: isRelationship, expected: CompletionItemKind.Interface, label: 'Relationship' },
    ])('$label maps to correct CompletionItemKind', async ({ input, guard, expected }) => {
        // Arrange / Act
        const node = await findFirst(s`${input}`, guard);

        // Assert
        expect(provider.getCompletionItemKind(node)).toBe(expected);
    });
});

// ============================================================================
// AstNodeDescription handling
// ============================================================================

describe('NodeKindProvider AstNodeDescription handling', () => {
    test('resolves AstNodeDescription with attached node', async () => {
        // Arrange
        const domainNode = await findFirst(s`Domain Sales {}`, isDomain);
        const description: AstNodeDescription = {
            name: 'Sales',
            type: 'Domain',
            documentUri: URI.parse('file:///test.dlang'),
            path: '',
            node: domainNode,
        };

        // Act & Assert
        expect(provider.getSymbolKind(description)).toBe(SymbolKind.Namespace);
    });

    test('falls back to default for AstNodeDescription without node', () => {
        // Arrange
        const description: AstNodeDescription = {
            name: 'Unknown',
            type: 'SomeType',
            documentUri: URI.parse('file:///test.dlang'),
            path: '',
            node: undefined,
        };

        // Act
        const kind = provider.getSymbolKind(description);

        // Assert
        expect(kind).toBe(SymbolKind.Field);
    });
});
