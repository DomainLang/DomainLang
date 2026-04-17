/**
 * SDK Query API Tests
 * 
 * Comprehensive tests for the Query interface and QueryBuilder implementation.
 * Tests all public APIs for querying DomainLang models.
 */

import { describe, test, expect } from 'vitest';
import { loadModelFromText } from '../../src/sdk/loader.js';

describe('SDK Query API', () => {

    // ═════════════════════════════════════════════════════════════════════════════════
    // Simple Lookups: boundedContext, domain, fqn
    // ═════════════════════════════════════════════════════════════════════════════════

    test('finds bounded context by simple name', async () => {
        // Arrange
        const { query } = await loadModelFromText(`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales
            bc PaymentContext for Sales
        `);

        // Act & Assert
        expect(query.boundedContext('OrderContext')?.name).toBe('OrderContext');
        expect(query.bc('PaymentContext')?.name).toBe('PaymentContext');
    });

    test('finds domain by simple name', async () => {
        // Arrange
        const { query } = await loadModelFromText(`
            Domain Sales { vision: "v" }
            Domain Finance { vision: "v" }
        `);

        // Act & Assert
        expect(query.domain('Sales')?.name).toBe('Sales');
        expect(query.domain('Finance')?.name).toBe('Finance');
    });

    test('returns FQN for a named element', async () => {
        // Arrange
        const { query } = await loadModelFromText(`
            Namespace acme.sales {
                Domain Sales { vision: "v" }
            }
        `);

        // Act
        const domain = query.domain('Sales');
        if (!domain) throw new Error('Expected Sales domain to be defined');
        const fqn = query.fqn(domain);

        // Assert
        expect(fqn).toBe('acme.sales.Sales');
    });

    test('finds element by fully qualified name (byFqn)', async () => {
        // Arrange
        const { query } = await loadModelFromText(`
            Namespace com.example {
                Domain Sales { vision: "v" }
            }
            Domain Sales { vision: "v" }
        `);

        // Act
        const namespaced = query.byFqn('com.example.Sales');
        const topLevel = query.byFqn('Sales');

        // Assert
        expect(namespaced).not.toBeUndefined();
        expect(topLevel).not.toBeUndefined();
        expect(namespaced).not.toBe(topLevel);
        expect(query.byFqn('does.not.exist')).toBeUndefined();
    });

    // ═════════════════════════════════════════════════════════════════════════════════
    // Relationships: parsing from ContextMaps and BCs
    // ═════════════════════════════════════════════════════════════════════════════════

    test('returns relationships from context maps and BCs', async () => {
        // Arrange & Act
        const { query } = await loadModelFromText(`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales
            bc PaymentContext for Sales
            ContextMap SalesMap {
                contains OrderContext, PaymentContext
                OrderContext [OHS] -> [CF] PaymentContext
            }
        `);

        // Assert
        const rels = [...query.relationships()];
        expect(rels).toHaveLength(1);
        expect(rels[0].left.context.name).toBe('OrderContext');
        expect(rels[0].right.context.name).toBe('PaymentContext');
        expect(rels[0].source).toBe('ContextMap');
    });

    test('returns relationships from BC using this', async () => {
        // Arrange & Act
        const { query } = await loadModelFromText(`
            Domain Sales { vision: "v" }
            bc PaymentContext for Sales
            bc OrderContext for Sales {
                relationships { this [OHS] -> [CF] PaymentContext }
            }
        `);

        // Assert
        const rels = [...query.relationships()];
        expect(rels).toHaveLength(1);
        expect(rels[0].left.context.name).toBe('OrderContext');
        expect(rels[0].source).toBe('BoundedContext');
    });

    // ═════════════════════════════════════════════════════════════════════════════════
    // Directional Relationships: arrows, patterns, upstream/downstream
    // ═════════════════════════════════════════════════════════════════════════════════

    interface DirectionalCase {
        name: string;
        dlang: string;
        expectedArrow: string;
        expectedKind: string;
        expectedUpstreamContext?: string;
        expectedDownstreamContext?: string;
    }

    test.each<DirectionalCase>([
        {
            name: 'OHS -> CF (upstream/downstream)',
            dlang: `
                Domain D { vision: "v" }
                bc Catalog for D
                bc Orders for D
                ContextMap M {
                    contains Catalog, Orders
                    Catalog [OHS] -> [CF] Orders
                }
            `,
            expectedArrow: '->',
            expectedKind: 'UpstreamDownstream',
            expectedUpstreamContext: 'Catalog',
            expectedDownstreamContext: 'Orders'
        },
        {
            name: 'reverse arrow (<-)',
            dlang: `
                Domain D { vision: "v" }
                bc Shipping for D
                bc Catalog for D
                ContextMap M {
                    contains Shipping, Catalog
                    Shipping [CF] <- [OHS] Catalog
                }
            `,
            expectedArrow: '<-',
            expectedKind: 'UpstreamDownstream',
            expectedUpstreamContext: 'Catalog',
            expectedDownstreamContext: 'Shipping'
        },
        {
            name: 'bidirectional (<->)',
            dlang: `
                Domain D { vision: "v" }
                bc Orders for D
                bc Billing for D
                ContextMap M {
                    contains Orders, Billing
                    Orders [OHS] <-> [CF] Billing
                }
            `,
            expectedArrow: '<->',
            expectedKind: 'Bidirectional'
        },
        {
            name: 'customer/supplier (S -> C)',
            dlang: `
                Domain D { vision: "v" }
                bc Orders for D
                bc Inventory for D
                ContextMap M {
                    contains Orders, Inventory
                    Orders [S] -> [C] Inventory
                }
            `,
            expectedArrow: '->',
            expectedKind: 'CustomerSupplier',
            expectedUpstreamContext: 'Orders',
            expectedDownstreamContext: 'Inventory'
        },
    ])('$name', async ({ dlang, expectedArrow, expectedKind, expectedUpstreamContext, expectedDownstreamContext }) => {
        // Arrange
        const { query } = await loadModelFromText(dlang);

        // Act
        const rel = [...query.relationships()][0];

        // Assert
        expect(rel.type).toBe('directional');
        if (rel.type !== 'directional') return;
        expect(rel.arrow).toBe(expectedArrow);
        expect(rel.kind).toBe(expectedKind);
        if (expectedUpstreamContext) {
            expect(rel.upstream?.context.name).toBe(expectedUpstreamContext);
        }
        if (expectedDownstreamContext) {
            expect(rel.downstream?.context.name).toBe(expectedDownstreamContext);
        }
        if (expectedKind !== 'Bidirectional') {
            expect(rel.upstream).not.toBeUndefined();
            expect(rel.downstream).not.toBeUndefined();
        } else {
            expect(rel.upstream).toBeUndefined();
            expect(rel.downstream).toBeUndefined();
        }
    });

    test('multiple patterns per side are all captured', async () => {
        // Arrange
        const { query } = await loadModelFromText(`
            Domain D { vision: "v" }
            bc Catalog for D
            bc Billing for D
            ContextMap M {
                contains Catalog, Billing
                Catalog [OHS, PL] -> [CF, ACL] Billing
            }
        `);

        // Act
        const rel = [...query.relationships()][0];

        // Assert
        expect(rel.type).toBe('directional');
        if (rel.type !== 'directional') return;
        expect(rel.upstream?.patterns.map(p => p.$type)).toEqual(
            expect.arrayContaining(['OpenHostService', 'PublishedLanguage'])
        );
        expect(rel.downstream?.patterns.map(p => p.$type)).toEqual(
            expect.arrayContaining(['Conformist', 'AntiCorruptionLayer'])
        );
    });

    // ═════════════════════════════════════════════════════════════════════════════════
    // Symmetric Relationships
    // ═════════════════════════════════════════════════════════════════════════════════

    test.each([
        { pattern: '[P]', expectedKind: 'Partnership' },
        { pattern: '[SK]', expectedKind: 'SharedKernel' },
        { pattern: '[SW]', expectedKind: 'SeparateWays' },
    ])('$pattern resolves kind to $expectedKind', async ({ pattern, expectedKind }) => {
        // Arrange
        const { query } = await loadModelFromText(`
            Domain D { vision: "v" }
            bc Orders for D
            bc Catalog for D
            ContextMap M {
                contains Orders, Catalog
                Orders ${pattern} Catalog
            }
        `);

        // Act
        const rel = [...query.relationships()][0];

        // Assert
        expect(rel.type).toBe('symmetric');
        if (rel.type !== 'symmetric') return;
        expect(rel.kind).toBe(expectedKind);
        expect(rel.left.context.name).toBe('Orders');
        expect(rel.right.context.name).toBe('Catalog');
    });

    test('>< shorthand resolves to SeparateWays', async () => {
        // Arrange
        const { query } = await loadModelFromText(`
            Domain D { vision: "v" }
            bc Orders for D
            bc Payments for D
            ContextMap M {
                contains Orders, Payments
                Orders >< Payments
            }
        `);

        // Act
        const rel = [...query.relationships()][0];

        // Assert
        expect(rel.type).toBe('symmetric');
        if (rel.type !== 'symmetric') return;
        expect(rel.kind).toBe('SeparateWays');
    });

    // ═════════════════════════════════════════════════════════════════════════════════
    // Namespaces
    // ═════════════════════════════════════════════════════════════════════════════════

    test('returns nested namespaces as flat collection', async () => {
        // Arrange
        const { query } = await loadModelFromText(`
            Namespace com.example {
                Domain Sales { vision: "v" }
                Namespace inner {
                    Domain Finance { vision: "v" }
                }
            }
        `);

        // Act
        const ns = [...query.namespaces()];

        // Assert
        expect(ns).toHaveLength(2);
        expect(ns.some(n => n.name === 'inner')).toBe(true);
    });
});