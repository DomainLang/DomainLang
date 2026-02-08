/**
 * Tests for DomainLangNodeKindProvider — AST type to icon kind mapping.
 *
 * The NodeKindProvider maps each DomainLang AST type to a SymbolKind (outline,
 * breadcrumbs, Go to Symbol) and a CompletionItemKind (auto-complete list).
 *
 * These tests verify:
 * - Every mapped AST type returns the expected SymbolKind
 * - Every mapped AST type returns the expected CompletionItemKind
 * - Unmapped AST types fall back to Langium defaults
 * - AstNodeDescription inputs resolve correctly
 */

import { describe, test, beforeAll, expect } from 'vitest';
import { CompletionItemKind, SymbolKind } from 'vscode-languageserver';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s, expectValidDocument } from '../test-helpers.js';
import { AstUtils } from 'langium';
import type { AstNode } from 'langium';
import {
    isDomain,
    isBoundedContext,
    isTeam,
    isClassification,
    isMetadata,
    isContextMap,
    isDomainMap,
    isNamespaceDeclaration,
    isRelationship,
    isDomainTerm,
    isDecision,
    isPolicy,
    isBusinessRule,
} from '../../src/generated/ast.js';
import { DomainLangNodeKindProvider } from '../../src/lsp/domain-lang-node-kind-provider.js';

let testServices: TestServices;
let provider: DomainLangNodeKindProvider;

beforeAll(() => {
    testServices = setupTestSuite();
    provider = new DomainLangNodeKindProvider();
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
// SymbolKind mapping tests
// ============================================================================

describe('NodeKindProvider SymbolKind mapping', () => {
    test('Domain maps to SymbolKind.Namespace', async () => {
        const node = await findFirst(s`Domain Sales {}`, isDomain);
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Namespace);
    });

    test('BoundedContext maps to SymbolKind.Package', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               bc OrderCtx for Sales`,
            isBoundedContext
        );
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Package);
    });

    test('Team maps to SymbolKind.Interface', async () => {
        const node = await findFirst(s`Team SalesTeam`, isTeam);
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Interface);
    });

    test('Classification maps to SymbolKind.Enum', async () => {
        const node = await findFirst(s`Classification Core`, isClassification);
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Enum);
    });

    test('Metadata maps to SymbolKind.Enum', async () => {
        const node = await findFirst(
            s`Metadata Language`,
            isMetadata
        );
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Enum);
    });

    test('ContextMap maps to SymbolKind.Package', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               bc A for Sales
               bc B for Sales
               ContextMap SalesMap { contains A, B }`,
            isContextMap
        );
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Package);
    });

    test('DomainMap maps to SymbolKind.Package', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               DomainMap Overview { contains Sales }`,
            isDomainMap
        );
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Package);
    });

    test('Namespace maps to SymbolKind.Namespace', async () => {
        const node = await findFirst(
            s`Namespace acme.sales { Domain Sales {} }`,
            isNamespaceDeclaration
        );
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Namespace);
    });

    test('Relationship maps to SymbolKind.Interface', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               bc A for Sales
               bc B for Sales
               ContextMap SalesMap {
                 contains A, B
                 A -> B
               }`,
            isRelationship
        );
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Interface);
    });

    test('DomainTerm maps to SymbolKind.Field', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               bc OrderCtx for Sales {
                   terminology {
                       term Order: "A request to purchase"
                   }
               }`,
            isDomainTerm
        );
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Field);
    });

    test('Decision maps to SymbolKind.Field', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               bc OrderCtx for Sales {
                   decisions {
                       decision UseCQRS: "Apply CQRS pattern"
                   }
               }`,
            isDecision
        );
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Field);
    });

    test('Policy maps to SymbolKind.Field', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               bc OrderCtx for Sales {
                   decisions {
                       policy ReturnPolicy: "30-day returns"
                   }
               }`,
            isPolicy
        );
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Field);
    });

    test('BusinessRule maps to SymbolKind.Field', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               bc OrderCtx for Sales {
                   rules {
                       rule MaxItems: "Maximum 100 items per order"
                   }
               }`,
            isBusinessRule
        );
        expect(provider.getSymbolKind(node)).toBe(SymbolKind.Field);
    });
});

// ============================================================================
// CompletionItemKind mapping tests
// ============================================================================

describe('NodeKindProvider CompletionItemKind mapping', () => {
    test('Domain maps to CompletionItemKind.Folder', async () => {
        const node = await findFirst(s`Domain Sales {}`, isDomain);
        expect(provider.getCompletionItemKind(node)).toBe(CompletionItemKind.Folder);
    });

    test('BoundedContext maps to CompletionItemKind.Module', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               bc OrderCtx for Sales`,
            isBoundedContext
        );
        expect(provider.getCompletionItemKind(node)).toBe(CompletionItemKind.Module);
    });

    test('Team maps to CompletionItemKind.Interface', async () => {
        const node = await findFirst(s`Team SalesTeam`, isTeam);
        expect(provider.getCompletionItemKind(node)).toBe(CompletionItemKind.Interface);
    });

    test('Classification maps to CompletionItemKind.Enum', async () => {
        const node = await findFirst(s`Classification Core`, isClassification);
        expect(provider.getCompletionItemKind(node)).toBe(CompletionItemKind.Enum);
    });

    test('ContextMap maps to CompletionItemKind.Module', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               bc A for Sales
               bc B for Sales
               ContextMap SalesMap { contains A, B }`,
            isContextMap
        );
        expect(provider.getCompletionItemKind(node)).toBe(CompletionItemKind.Module);
    });

    test('Namespace maps to CompletionItemKind.Module', async () => {
        const node = await findFirst(
            s`Namespace acme.sales { Domain Sales {} }`,
            isNamespaceDeclaration
        );
        expect(provider.getCompletionItemKind(node)).toBe(CompletionItemKind.Module);
    });

    test('Relationship maps to CompletionItemKind.Interface', async () => {
        const node = await findFirst(
            s`Domain Sales {}
               bc A for Sales
               bc B for Sales
               ContextMap SalesMap {
                 contains A, B
                 A -> B
               }`,
            isRelationship
        );
        expect(provider.getCompletionItemKind(node)).toBe(CompletionItemKind.Interface);
    });
});

// ============================================================================
// AstNodeDescription handling
// ============================================================================

describe('NodeKindProvider AstNodeDescription handling', () => {
    test('resolves AstNodeDescription with attached node', async () => {
        const domainNode = await findFirst(s`Domain Sales {}`, isDomain);
        // Create an AstNodeDescription-like object
        const description = {
            name: 'Sales',
            type: 'Domain',
            documentUri: { toString: (): string => 'file:///test.dlang' } as any,
            path: '',
            node: domainNode,
        };
        expect(provider.getSymbolKind(description)).toBe(SymbolKind.Namespace);
    });

    test('falls back to default for AstNodeDescription without node', () => {
        const description = {
            name: 'Unknown',
            type: 'SomeType',
            documentUri: { toString: (): string => 'file:///test.dlang' } as any,
            path: '',
            node: undefined,
        };
        // Should call super.getSymbolKind which returns a default
        const kind = provider.getSymbolKind(description);
        expect(kind).toBeDefined();
    });
});
