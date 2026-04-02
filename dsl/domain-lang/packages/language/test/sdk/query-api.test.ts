/**
 * SDK Query API Tests
 * 
 * Comprehensive tests for the Query interface and QueryBuilder implementation.
 * Tests all public APIs for querying DomainLang models.
 */

import { describe, test, expect } from 'vitest';
import { loadModelFromText } from '../../src/sdk/loader.js';

describe('SDK Query API', () => {
    
    describe('Query.boundedContext() and bc()', () => {

        test('finds bounded context by simple name', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
                bc PaymentContext for Sales
            `);

            // Act & Assert — two BCs, query selects the correct one
            expect(query.boundedContext('OrderContext')?.name).toBe('OrderContext');
            expect(query.bc('PaymentContext')?.name).toBe('PaymentContext');
        });

    });

    describe('Query.domain()', () => {

        test('finds domain by simple name disambiguates between multiple', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                Domain Finance { vision: "v" }
            `);

            // Act & Assert — queries for Sales, not Finance
            const domain = query.domain('Sales');
            expect(domain?.name).toBe('Sales');
        });

    });

    describe('Query.fqn()', () => {

        test('returns empty string for nodes without name property', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
            `);

            // Act
            const fqn = query.fqn({} as any);

            // Assert
            expect(fqn).toBe('');
        });
    });

    // ========================================================================
    // RELATIONSHIPS
    // ========================================================================

    describe('Query.relationships()', () => {

        test('returns relationships from context maps', async () => {
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
                bc PaymentContext for Sales
                ContextMap SalesMap {
                    contains OrderContext, PaymentContext
                    OrderContext [OHS] -> [CF] PaymentContext
                }
            `);
            const rels = [...query.relationships()];
            expect(rels).toHaveLength(1);
            const rel = rels[0];
            expect(rel.left.context.name).toBe('OrderContext');
            expect(rel.right.context.name).toBe('PaymentContext');
            expect(rel.type).toBe('directional');
            if (rel.type === 'directional') {
                expect(rel.arrow).toBe('->');
            }
            expect(rel.source).toBe('ContextMap');
        });

        test('returns relationships from bounded contexts using this', async () => {
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc PaymentContext for Sales
                bc OrderContext for Sales {
                    relationships {
                        this [OHS] -> [CF] PaymentContext
                    }
                }
            `);
            const rels = [...query.relationships()];
            expect(rels).toHaveLength(1);
            expect(rels[0].left.context.name).toBe('OrderContext');
            expect(rels[0].right.context.name).toBe('PaymentContext');
            expect(rels[0].source).toBe('BoundedContext');
        });

    });

    // ========================================================================
    // RELATIONSHIP VIEW — directional
    // ========================================================================

    describe('RelationshipView — directional', () => {

        test('single pattern each side: upstream/downstream sides and patterns are correct', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain D { vision: "v" }
                bc Catalog for D
                bc Orders for D
                ContextMap M {
                    contains Catalog, Orders
                    Catalog [OHS] -> [CF] Orders
                }
            `);

            // Act
            const rels = [...query.relationships()];

            // Assert
            expect(rels).toHaveLength(1);
            const rel = rels[0];
            expect(rel.type).toBe('directional');
            if (rel.type !== 'directional') return;
            expect(rel.kind).toBe('UpstreamDownstream');
            expect(rel.arrow).toBe('->');
            expect(rel.left.context.name).toBe('Catalog');
            expect(rel.right.context.name).toBe('Orders');
            expect(rel.upstream?.context.name).toBe('Catalog');
            expect(rel.upstream?.patterns.map(p => p.$type)).toEqual(['OpenHostService']);
            expect(rel.downstream?.context.name).toBe('Orders');
            expect(rel.downstream?.patterns.map(p => p.$type)).toEqual(['Conformist']);
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

        test('customer/supplier patterns resolve kind to CustomerSupplier', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain D { vision: "v" }
                bc Orders for D
                bc Inventory for D
                ContextMap M {
                    contains Orders, Inventory
                    Orders [S] -> [C] Inventory
                }
            `);

            // Act
            const rel = [...query.relationships()][0];

            // Assert
            expect(rel.type).toBe('directional');
            if (rel.type !== 'directional') return;
            expect(rel.kind).toBe('CustomerSupplier');
            expect(rel.upstream?.context.name).toBe('Orders');
            expect(rel.upstream?.patterns.map(p => p.$type)).toContain('Supplier');
            expect(rel.downstream?.context.name).toBe('Inventory');
            expect(rel.downstream?.patterns.map(p => p.$type)).toContain('Customer');
        });

        test('reverse arrow (<-): upstream and downstream sides are swapped relative to left/right', async () => {
            // Arrange — Shipping [CF] <- [OHS] Catalog  means Catalog is upstream, Shipping is downstream
            const { query } = await loadModelFromText(`
                Domain D { vision: "v" }
                bc Shipping for D
                bc Catalog for D
                ContextMap M {
                    contains Shipping, Catalog
                    Shipping [CF] <- [OHS] Catalog
                }
            `);

            // Act
            const rel = [...query.relationships()][0];

            // Assert
            expect(rel.type).toBe('directional');
            if (rel.type !== 'directional') return;
            expect(rel.kind).toBe('UpstreamDownstream');
            expect(rel.arrow).toBe('<-');
            expect(rel.left.context.name).toBe('Shipping');
            expect(rel.right.context.name).toBe('Catalog');
            // Upstream is the right side (provider), downstream is the left side (consumer)
            expect(rel.upstream?.context.name).toBe('Catalog');
            expect(rel.upstream?.patterns.map(p => p.$type)).toContain('OpenHostService');
            expect(rel.downstream?.context.name).toBe('Shipping');
            expect(rel.downstream?.patterns.map(p => p.$type)).toContain('Conformist');
        });

        test('bidirectional (<->): kind is Bidirectional, upstream and downstream are undefined', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain D { vision: "v" }
                bc Orders for D
                bc Billing for D
                ContextMap M {
                    contains Orders, Billing
                    Orders [OHS] <-> [CF] Billing
                }
            `);

            // Act
            const rel = [...query.relationships()][0];

            // Assert
            expect(rel.type).toBe('directional');
            if (rel.type !== 'directional') return;
            expect(rel.kind).toBe('Bidirectional');
            expect(rel.arrow).toBe('<->');
            expect(rel.upstream).toBeUndefined();
            expect(rel.downstream).toBeUndefined();
            expect(rel.left.patterns.map(p => p.$type)).toContain('OpenHostService');
            expect(rel.right.patterns.map(p => p.$type)).toContain('Conformist');
        });
    });

    // ========================================================================
    // RELATIONSHIP VIEW — symmetric
    // ========================================================================

    describe('RelationshipView — symmetric', () => {

        test.each([
            { pattern: '[P]',  expectedKind: 'Partnership'   },
            { pattern: '[SK]', expectedKind: 'SharedKernel'  },
            { pattern: '[SW]', expectedKind: 'SeparateWays'  },
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
            expect(rel.left.patterns).toHaveLength(0);
            expect(rel.right.patterns).toHaveLength(0);
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
    });

    // ========================================================================
    // CONTEXT MAPS
    // ========================================================================

    describe('Query.namespaces()', () => {

        test('returns nested namespaces as flat collection', async () => {
            const { query } = await loadModelFromText(`
                Namespace com.example {
                    Domain Sales { vision: "v" }
                    Namespace inner {
                        Domain Finance { vision: "v" }
                    }
                }
            `);
            // Nested namespace 'inner' must appear in the flat list alongside parent
            const ns = [...query.namespaces()];
            expect(ns).toHaveLength(2);
            expect(ns.some(n => n.name === 'inner')).toBe(true);
        });
    });

    // ========================================================================
    // BY FQN LOOKUP
    // ========================================================================

    describe('Query.byFqn()', () => {

        test('finds element by fully qualified name', async () => {
            const { query } = await loadModelFromText(`
                Namespace com.example {
                    Domain Sales { vision: "v" }
                }
                Domain Sales { vision: "v" }
            `);
            // Two 'Sales' domains exist; FQN lookup must select the namespaced one
            const domain = query.byFqn('com.example.Sales');
            const topLevel = query.byFqn('Sales');
            expect(domain).not.toBeUndefined();
            expect(topLevel).not.toBeUndefined();
            // They must be distinct objects
            expect(domain).not.toBe(topLevel);
        });

        test('returns undefined for non-existent FQN', async () => {
            const { query } = await loadModelFromText(`Domain Sales { vision: "v" }`);
            expect(query.byFqn('does.not.exist')).toBeUndefined();
        });
    });
});
