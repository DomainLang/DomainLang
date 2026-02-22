/**
 * Tests for DomainLang DocumentSymbolProvider and NodeKindProvider.
 *
 * Smoke (~20%):
 * - All major AST types map to correct SymbolKinds
 * - Basic detail text rendering
 *
 * Edge/error (~80%):
 * - Empty document yields no symbols
 * - Namespace nesting produces correct parent-child hierarchy
 * - BC without collections has empty children array
 * - BC with multiple collection types creates all synthetic folders with correct item counts
 * - Deeply nested namespaces produce correct symbol tree
 * - Domain without body still produces a symbol
 */

import { describe, test, beforeAll, expect } from 'vitest';
import { SymbolKind } from 'vscode-languageserver';
import type { DocumentSymbol } from 'vscode-languageserver';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

/** Helper to get document symbols from parsed text. */
async function getSymbols(input: string): Promise<DocumentSymbol[]> {
    const document = await testServices.parse(input);
    const provider = testServices.services.DomainLang.lsp.DocumentSymbolProvider;
    if (!provider) {
        throw new Error('DocumentSymbolProvider not available');
    }
    return provider.getSymbols(document, {
        textDocument: { uri: document.uri.toString() }
    }) as Promise<DocumentSymbol[]>;
}

/** Recursively find a symbol by name in the tree. */
function findSymbol(symbols: DocumentSymbol[], name: string): DocumentSymbol | undefined {
    for (const sym of symbols) {
        if (sym.name === name) return sym;
        if (sym.children) {
            const found = findSymbol(sym.children, name);
            if (found) return found;
        }
    }
    return undefined;
}

/**
 * Asserts a symbol was found and narrows its type for subsequent assertions.
 */
function expectSymbol(symbols: DocumentSymbol[], name: string): DocumentSymbol {
    const sym = findSymbol(symbols, name);
    expect(sym, `Expected symbol "${name}" to be present`).not.toBeUndefined();
    return sym as DocumentSymbol;
}

describe('DocumentSymbolProvider', () => {

    // ==========================================
    // SMOKE: consolidated symbol kind verification
    // ==========================================
    test('all major AST types map to correct SymbolKinds', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`
            Namespace acme.sales {
                Domain Sales { vision: "Sales" }
                Team SalesTeam
                Classification Core
                Metadata Language
                bc OrderContext for Sales
                ContextMap SalesMap {
                    contains OrderContext
                }
            }
            Domain Billing {}
            DomainMap Overview {
                contains Billing
            }
        `);

        // Assert
        expect(expectSymbol(symbols, 'acme.sales').kind).toBe(SymbolKind.Namespace);
        expect(expectSymbol(symbols, 'Sales').kind).toBe(SymbolKind.Namespace);
        expect(expectSymbol(symbols, 'SalesTeam').kind).toBe(SymbolKind.Interface);
        expect(expectSymbol(symbols, 'Core').kind).toBe(SymbolKind.Enum);
        expect(expectSymbol(symbols, 'Language').kind).toBe(SymbolKind.Enum);
        expect(expectSymbol(symbols, 'OrderContext').kind).toBe(SymbolKind.Package);
        expect(expectSymbol(symbols, 'SalesMap').kind).toBe(SymbolKind.Package);
        expect(expectSymbol(symbols, 'Overview').kind).toBe(SymbolKind.Package);
    });

    // ==========================================
    // SMOKE: detail text rendering
    // ==========================================
    test('detail text includes vision, description, and counts', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`
            Domain Sales { vision: "Handle all sales" }
            Domain Billing { description: "Billing domain" }
            bc OrderContext for Sales { description: "Order processing" }
            bc PaymentContext for Sales
            ContextMap SalesMap {
                contains OrderContext, PaymentContext
            }
            DomainMap Overview {
                contains Sales, Billing
            }
        `);

        // Assert — Domain shows vision as detail
        expect(expectSymbol(symbols, 'Sales').detail).toBe('Domain \u2014 Handle all sales');
        // Domain shows description when no vision
        expect(expectSymbol(symbols, 'Billing').detail).toBe('Domain \u2014 Billing domain');
        // BC includes domain and description
        const bcDetail = expectSymbol(symbols, 'OrderContext').detail;
        expect(bcDetail).toContain('Sales');
        expect(bcDetail).toContain('Order processing');
        // ContextMap shows context count
        expect(expectSymbol(symbols, 'SalesMap').detail).toBe('2 contexts');
        // DomainMap shows domain count
        expect(expectSymbol(symbols, 'Overview').detail).toBe('2 domains');
    });

    // ==========================================
    // EDGE: empty document returns no symbols
    // ==========================================
    test('empty document yields no symbols', async () => {
        // Arrange & Act
        const symbols = await getSymbols('');

        // Assert
        expect(symbols).toHaveLength(0);
    });

    // ==========================================
    // EDGE: domain without body still produces a symbol
    // ==========================================
    test('minimal domain without body still produces a symbol with Namespace kind', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`Domain Sales {}`);
        const sym = expectSymbol(symbols, 'Sales');

        // Assert
        expect(sym.kind).toBe(SymbolKind.Namespace);
        // Range should be valid (start <= end)
        expect(sym.range.start.line).toBeLessThanOrEqual(sym.range.end.line);
    });

    // ==========================================
    // EDGE: namespace nesting hierarchy
    // ==========================================
    test('Namespace children are nested under parent, not at root level', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`Namespace acme.sales { Domain Sales { vision: "Sales" } Team SalesTeam }`);

        // Assert
        const ns = expectSymbol(symbols, 'acme.sales');
        const children = ns.children!;
        expect(children.length).toBeGreaterThanOrEqual(2);

        // Children should be found under the namespace, not at root
        const domain = expectSymbol(children, 'Sales');
        expect(domain.kind).toBe(SymbolKind.Namespace);
        const team = expectSymbol(children, 'SalesTeam');
        expect(team.kind).toBe(SymbolKind.Interface);

        // Root should not directly contain Sales or SalesTeam (they're nested)
        const rootSales = symbols.find(s => s.name === 'Sales');
        expect(rootSales).toBeUndefined();
    });

    // ==========================================
    // EDGE: BC synthetic folders with correct item counts and kinds
    // ==========================================
    test('BC decisions folder has correct kind, item count, and child count', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`
            Domain Sales {}
            Classification Core
            bc OrderContext for Sales {
                decisions {
                    Decision UseEventSourcing: "Use event sourcing",
                    Policy RefundPolicy: "Refund within 30 days"
                }
            }
        `);
        const bc = expectSymbol(symbols, 'OrderContext');
        const children = bc.children!;
        const decisionsFolder = expectSymbol(children, 'decisions');

        // Assert
        expect(decisionsFolder.kind).toBe(SymbolKind.Object);
        expect(decisionsFolder.detail).toBe('2 items');
        expect(decisionsFolder.children).toHaveLength(2);
    });

    test('BC terminology folder has correct kind and item count', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`
            Domain Sales {}
            bc OrderContext for Sales {
                terminology {
                    Term Order: "A customer purchase",
                    Term LineItem: "Product in order"
                }
            }
        `);
        const bc = expectSymbol(symbols, 'OrderContext');
        const termFolder = expectSymbol(bc.children!, 'terminology');

        // Assert
        expect(termFolder.kind).toBe(SymbolKind.Object);
        expect(termFolder.detail).toBe('2 items');
        expect(termFolder.children).toHaveLength(2);
    });

    test('BC relationships folder has correct kind and item count', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`
            Domain Sales {}
            bc OrderContext for Sales {
                relationships {
                    [OHS] this -> [CF] PaymentContext,
                    this -> ShippingContext
                }
            }
            bc PaymentContext for Sales
            bc ShippingContext for Sales
        `);
        const bc = expectSymbol(symbols, 'OrderContext');
        const relFolder = expectSymbol(bc.children!, 'relationships');

        // Assert
        expect(relFolder.kind).toBe(SymbolKind.Object);
        expect(relFolder.detail).toBe('2 items');
        expect(relFolder.children).toHaveLength(2);
    });

    test('BC metadata folder has correct kind and item count', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`
            Domain Sales {}
            Metadata Language
            Metadata Framework
            bc OrderContext for Sales {
                metadata {
                    Language: "TypeScript",
                    Framework: "Node.js"
                }
            }
        `);
        const bc = expectSymbol(symbols, 'OrderContext');
        const metaFolder = expectSymbol(bc.children!, 'metadata');

        // Assert
        expect(metaFolder.kind).toBe(SymbolKind.Object);
        expect(metaFolder.detail).toBe('2 items');
        expect(metaFolder.children).toHaveLength(2);
    });

    // ==========================================
    // EDGE: multiple collection types create all folders
    // ==========================================
    test('BC with all collection types creates decisions, terminology, and metadata folders', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`
            Domain Sales {}
            Metadata Language
            Classification Core
            bc OrderContext for Sales {
                decisions {
                    Decision UseCQRS: "Use CQRS"
                }
                terminology {
                    Term Order: "Purchase"
                }
                metadata {
                    Language: "Java"
                }
            }
        `);
        const bc = expectSymbol(symbols, 'OrderContext');
        const children = bc.children!;

        // Assert — All three folders should exist with kind Object and 1 item each
        const decisionsFolder = expectSymbol(children, 'decisions');
        expect(decisionsFolder.kind).toBe(SymbolKind.Object);
        expect(decisionsFolder.detail).toBe('1 items');

        const termFolder = expectSymbol(children, 'terminology');
        expect(termFolder.kind).toBe(SymbolKind.Object);
        expect(termFolder.detail).toBe('1 items');

        const metaFolder = expectSymbol(children, 'metadata');
        expect(metaFolder.kind).toBe(SymbolKind.Object);
        expect(metaFolder.detail).toBe('1 items');
    });

    // ==========================================
    // EDGE: BC without collections has no children
    // ==========================================
    test('BC without any collections shows no children', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`
            Domain Sales {}
            bc OrderContext for Sales { description: "Simple BC" }
        `);
        const bc = expectSymbol(symbols, 'OrderContext');
        const childCount = bc.children?.length ?? 0;

        // Assert
        expect(childCount).toBe(0);
    });

    // ==========================================
    // EDGE: deeply nested namespace hierarchy
    // ==========================================
    test('deeply nested namespaces produce correctly nested symbol tree', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`
            Namespace com {
                Namespace company {
                    Domain Sales { vision: "Nested deep" }
                }
            }
        `);

        // Assert
        const com = expectSymbol(symbols, 'com');
        expect(com.kind).toBe(SymbolKind.Namespace);
        const company = expectSymbol(com.children!, 'company');
        expect(company.kind).toBe(SymbolKind.Namespace);
        const sales = expectSymbol(company.children!, 'Sales');
        expect(sales.kind).toBe(SymbolKind.Namespace);
        expect(sales.detail).toBe('Domain \u2014 Nested deep');
    });

    // ==========================================
    // EDGE: Individual node kind mappings (NodeKindProvider coverage)
    // ==========================================
    test('all decision/terminology/metadata/relationship elements have correct SymbolKind', async () => {
        // Arrange & Act
        const symbols = await getSymbols(s`
            Domain Sales {}
            Metadata Language
            bc OrderContext for Sales {
                decisions {
                    Policy RefundPolicy
                    Decision UseCQRS [strategic]
                    Rule DiscountRule
                }
                terminology {
                    Term Buyer "A person who buys"
                }
                metadata {
                    Language: "TypeScript"
                }
                relationships {
                    this [OHS] -> [CF] External
                }
            }
            bc External for Sales {}
        `);
        const bc = expectSymbol(symbols, 'OrderContext');
        if (!bc.children) throw new Error('Expected BC to have children');

        // Assert — Decisions: Policy, Decision, Rule → all Field
        const decisionsFolder = expectSymbol(bc.children, 'decisions');
        if (!decisionsFolder.children) throw new Error('Expected decisions folder to have children');
        const policy = expectSymbol(decisionsFolder.children, 'RefundPolicy');
        expect(policy.kind).toBe(SymbolKind.Field);
        const decision = expectSymbol(decisionsFolder.children, 'UseCQRS');
        expect(decision.kind).toBe(SymbolKind.Field);
        const rule = expectSymbol(decisionsFolder.children, 'DiscountRule');
        expect(rule.kind).toBe(SymbolKind.Field);

        // Terminology: DomainTerm → Field
        const termFolder = expectSymbol(bc.children, 'terminology');
        if (!termFolder.children) throw new Error('Expected terminology folder to have children');
        const term = expectSymbol(termFolder.children, 'Buyer');
        expect(term.kind).toBe(SymbolKind.Field);

        // Metadata: MetadataEntry → Field
        const metaFolder = expectSymbol(bc.children, 'metadata');
        expect(Array.isArray(metaFolder.children)).toBe(true);
        const entry = metaFolder.children![0];
        expect(entry.kind).toBe(SymbolKind.Field);

        // Relationship → Interface
        const relFolder = expectSymbol(bc.children, 'relationships');
        expect(Array.isArray(relFolder.children)).toBe(true);
        expect(relFolder.children!.length).toBeGreaterThan(0);
        const rel = relFolder.children![0];
        expect(rel.kind).toBe(SymbolKind.Interface);
    });

    test.each([
        ['ContextMap', 'SalesMap', '3 contexts', s`
            Domain Sales {}
            bc Orders for Sales {}
            bc Billing for Sales {}
            bc Shipping for Sales {}
            ContextMap SalesMap {
                contains Orders, Billing, Shipping
            }
        `],
        ['DomainMap', 'Enterprise', '3 domains', s`
            Domain Sales {}
            Domain Marketing {}
            Domain Support {}
            DomainMap Enterprise {
                contains Sales, Marketing, Support
            }
        `],
    ])('%s with members shows correct detail', async (_type, name, expectedDetail, source) => {
        // Arrange & Act
        const symbols = await getSymbols(source);
        const sym = expectSymbol(symbols, name);

        // Assert
        expect(sym.detail).toBe(expectedDetail);
        expect(sym.kind).toBe(SymbolKind.Package);
    });

    test.each([
        ['ContextMap', s`ContextMap EmptyMap {}`],
        ['DomainMap', s`DomainMap EmptyMap {}`],
    ])('empty %s has undefined detail (pluralize returns undefined for 0)', async (_type, source) => {
        // Arrange & Act
        const symbols = await getSymbols(source);
        const sym = expectSymbol(symbols, 'EmptyMap');

        // Assert
        expect(sym.detail).toBeUndefined();
    });
});
