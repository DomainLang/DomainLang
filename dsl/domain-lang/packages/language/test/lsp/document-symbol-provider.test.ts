/**
 * Tests for DomainLang DocumentSymbolProvider and NodeKindProvider.
 *
 * Verifies that the Outline view, breadcrumbs, and Go to Symbol present
 * DDD-appropriate icons (SymbolKind) and detail text for each AST type.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import { SymbolKind } from 'vscode-languageserver';
import type { DocumentSymbol } from 'vscode-languageserver';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

/** Helper to get document symbols from parsed text. */
async function getSymbols(input: string): Promise<DocumentSymbol[]> {
    const document = await testServices.parse(input);
    const provider = testServices.services.DomainLang.lsp.DocumentSymbolProvider;
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
    expect(sym, `Expected symbol "${name}" to be present`).toBeDefined();
    return sym as DocumentSymbol;
}

describe('DocumentSymbolProvider', () => {

    describe('Symbol kinds', () => {
        test('Domain is Namespace', async () => {
            const symbols = await getSymbols(s`Domain Sales { vision: "Sales" }`);
            const sym = expectSymbol(symbols, 'Sales');
            expect(sym.kind).toBe(SymbolKind.Namespace);
        });

        test('BoundedContext is Package', async () => {
            const symbols = await getSymbols(s`
                Domain Sales {}
                bc OrderContext for Sales
            `);
            const sym = expectSymbol(symbols, 'OrderContext');
            expect(sym.kind).toBe(SymbolKind.Package);
        });

        test('Team is Interface', async () => {
            const symbols = await getSymbols(s`Team SalesTeam`);
            const sym = expectSymbol(symbols, 'SalesTeam');
            expect(sym.kind).toBe(SymbolKind.Interface);
        });

        test('Classification is Enum', async () => {
            const symbols = await getSymbols(s`Classification Core`);
            const sym = expectSymbol(symbols, 'Core');
            expect(sym.kind).toBe(SymbolKind.Enum);
        });

        test('Metadata is Enum', async () => {
            const symbols = await getSymbols(s`Metadata Language`);
            const sym = expectSymbol(symbols, 'Language');
            expect(sym.kind).toBe(SymbolKind.Enum);
        });

        test('ContextMap is Package', async () => {
            const symbols = await getSymbols(s`
                Domain Sales {}
                bc OrderContext for Sales
                ContextMap SalesMap {
                    contains OrderContext
                }
            `);
            const sym = expectSymbol(symbols, 'SalesMap');
            expect(sym.kind).toBe(SymbolKind.Package);
        });

        test('DomainMap is Package', async () => {
            const symbols = await getSymbols(s`
                Domain Sales {}
                DomainMap Overview {
                    contains Sales
                }
            `);
            const sym = expectSymbol(symbols, 'Overview');
            expect(sym.kind).toBe(SymbolKind.Package);
        });

        test('Namespace is Namespace', async () => {
            const symbols = await getSymbols(s`Namespace acme.sales { Domain Sales {} }`);
            const sym = expectSymbol(symbols, 'acme.sales');
            expect(sym.kind).toBe(SymbolKind.Namespace);
        });
    });

    describe('Detail text', () => {
        test('Domain shows vision as detail', async () => {
            const symbols = await getSymbols(s`Domain Sales { vision: "Handle all sales" }`);
            const sym = expectSymbol(symbols, 'Sales');
            expect(sym.detail).toBe('Domain — Handle all sales');
        });

        test('Domain shows description when no vision', async () => {
            const symbols = await getSymbols(s`Domain Sales { description: "Sales domain" }`);
            const sym = expectSymbol(symbols, 'Sales');
            expect(sym.detail).toBe('Domain — Sales domain');
        });

        test('BoundedContext shows domain and description', async () => {
            const symbols = await getSymbols(s`
                Domain Sales {}
                bc OrderContext for Sales { description: "Order processing" }
            `);
            const sym = expectSymbol(symbols, 'OrderContext');
            expect(sym.detail).toContain('Sales');
            expect(sym.detail).toContain('Order processing');
        });

        test('ContextMap shows context count', async () => {
            const symbols = await getSymbols(s`
                Domain Sales {}
                bc OrderContext for Sales
                bc PaymentContext for Sales
                ContextMap SalesMap {
                    contains OrderContext, PaymentContext
                }
            `);
            const sym = expectSymbol(symbols, 'SalesMap');
            expect(sym.detail).toBe('2 contexts');
        });

        test('DomainMap shows domain count', async () => {
            const symbols = await getSymbols(s`
                Domain Sales {}
                Domain Billing {}
                DomainMap Overview {
                    contains Sales, Billing
                }
            `);
            const sym = expectSymbol(symbols, 'Overview');
            expect(sym.detail).toBe('2 domains');
        });
    });

    describe('Nesting', () => {
        test('Namespace contains nested symbols as children', async () => {
            const symbols = await getSymbols(s`Namespace acme.sales { Domain Sales { vision: "Sales" } Team SalesTeam }`);
            const ns = expectSymbol(symbols, 'acme.sales');
            expect(ns.children).toBeDefined();
            const children = ns.children as DocumentSymbol[];
            expect(children.length).toBeGreaterThanOrEqual(2);

            const domain = expectSymbol(children, 'Sales');
            expect(domain.kind).toBe(SymbolKind.Namespace);

            const team = expectSymbol(children, 'SalesTeam');
            expect(team.kind).toBe(SymbolKind.Interface);
        });

        test('BoundedContext groups decisions under synthetic folder', async () => {
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
            expect(bc.children).toBeDefined();
            const children = bc.children as DocumentSymbol[];

            const decisionsFolder = expectSymbol(children, 'decisions');
            expect(decisionsFolder.kind).toBe(SymbolKind.Object);
            expect(decisionsFolder.detail).toBe('2 items');
            expect(decisionsFolder.children).toBeDefined();
            expect(decisionsFolder.children?.length).toBe(2);
        });

        test('BoundedContext groups terminology under synthetic folder', async () => {
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
            expect(bc.children).toBeDefined();
            const children = bc.children as DocumentSymbol[];

            const termFolder = expectSymbol(children, 'terminology');
            expect(termFolder.kind).toBe(SymbolKind.Object);
            expect(termFolder.detail).toBe('2 items');
            expect(termFolder.children).toBeDefined();
            expect(termFolder.children?.length).toBe(2);
        });

        test('BoundedContext groups relationships under synthetic folder', async () => {
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
            expect(bc.children).toBeDefined();
            const children = bc.children as DocumentSymbol[];

            const relFolder = expectSymbol(children, 'relationships');
            expect(relFolder.kind).toBe(SymbolKind.Object);
            expect(relFolder.detail).toBe('2 items');
            expect(relFolder.children).toBeDefined();
            expect(relFolder.children?.length).toBe(2);
        });

        test('BoundedContext groups metadata under synthetic folder', async () => {
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
            expect(bc.children).toBeDefined();
            const children = bc.children as DocumentSymbol[];

            const metaFolder = expectSymbol(children, 'metadata');
            expect(metaFolder.kind).toBe(SymbolKind.Object);
            expect(metaFolder.detail).toBe('2 items');
            expect(metaFolder.children).toBeDefined();
            expect(metaFolder.children?.length).toBe(2);
        });

        test('BoundedContext with multiple collection types creates all folders', async () => {
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
            expect(bc.children).toBeDefined();
            const children = bc.children as DocumentSymbol[];

            // Should have 3 folders
            expect(expectSymbol(children, 'decisions')).toBeDefined();
            expect(expectSymbol(children, 'terminology')).toBeDefined();
            expect(expectSymbol(children, 'metadata')).toBeDefined();
        });

        test('BoundedContext without collections shows no folders', async () => {
            const symbols = await getSymbols(s`
                Domain Sales {}
                bc OrderContext for Sales { description: "Simple BC" }
            `);
            const bc = expectSymbol(symbols, 'OrderContext');
            
            // Should have no children or empty children
            const childCount = bc.children?.length ?? 0;
            expect(childCount).toBe(0);
        });
    });
});
