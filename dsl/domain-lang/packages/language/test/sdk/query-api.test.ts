/**
 * SDK Query API Tests
 * 
 * Comprehensive tests for the Query interface and QueryBuilder implementation.
 * Tests all public APIs for querying DomainLang models.
 */

import { describe, test, expect } from 'vitest';
import { loadModelFromText } from '../../src/sdk/loader.js';
import type { Domain } from '../../src/generated/ast.js';

describe('SDK Query API', () => {
    
    describe('Query.domains()', () => {
        
        test('returns all domains in model', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "Sales" }
                Domain Finance { vision: "Finance" }
                Domain Inventory { vision: "Inventory" }
            `);
            
            // Act
            const domains = [...query.domains()];
            
            // Assert
            expect(domains.length).toBe(3);
            expect(domains.map(d => d.name)).toEqual(expect.arrayContaining(['Sales', 'Finance', 'Inventory']));
        });
        
        test('returns empty iterator for model with no domains', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Team TeamA
                Team TeamB
            `);
            
            // Act
            const domains = [...query.domains()];
            
            // Assert
            expect(domains.length).toBe(0);
        });
    });
    
    describe('Query.boundedContexts()', () => {
        
        test('returns all bounded contexts in model', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
                bc ShippingContext for Sales
                bc PaymentContext for Sales
            `);
            
            // Act
            const bcs = [...query.boundedContexts()];
            
            // Assert
            expect(bcs.length).toBe(3);
            expect(bcs.map(bc => bc.name)).toEqual(expect.arrayContaining(['OrderContext', 'ShippingContext', 'PaymentContext']));
        });
        
        // BcQueryBuilder chaining covered by bc-query-builder.test.ts
    });
    
    describe('Query.teams()', () => {
        
        test('returns all teams in model', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Team SalesTeam
                Team PaymentTeam
                Team WarehouseTeam
            `);
            
            // Act
            const teams = [...query.teams()];
            
            // Assert
            expect(teams.length).toBe(3);
            expect(teams.map(t => t.name)).toEqual(expect.arrayContaining(['SalesTeam', 'PaymentTeam', 'WarehouseTeam']));
        });
        
        test('returns empty iterator when no teams defined', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
            `);
            
            // Act
            const teams = [...query.teams()];
            
            // Assert
            expect(teams.length).toBe(0);
        });
    });
    
    describe('Query.classifications()', () => {
        
        test('returns all classifications in model', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Classification Core
                Classification Supporting
                Classification Generic
            `);
            
            // Act
            const classifications = [...query.classifications()];
            
            // Assert
            expect(classifications.length).toBe(3);
            expect(classifications.map(c => c.name)).toEqual(expect.arrayContaining(['Core', 'Supporting', 'Generic']));
        });
    });
    
    describe('Query.boundedContext() and bc()', () => {
        
        test('finds bounded context by simple name', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
                bc PaymentContext for Sales
            `);
            
            // Act
            const bc = query.boundedContext('OrderContext');
            const bcShort = query.bc('PaymentContext');
            
            // Assert
            expect(bc?.name).toBe('OrderContext');
            expect(bcShort?.name).toBe('PaymentContext');
        });
        
        test('returns undefined for non-existent context', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
            `);
            
            // Act
            const result = query.boundedContext('NonExistent');
            
            // Assert
            expect(result).toBeUndefined();
        });
    });
    
    describe('Query.domain()', () => {
        
        test('finds domain by simple name', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                Domain Finance { vision: "v" }
            `);
            
            // Act
            const domain = query.domain('Sales');
            
            // Assert
            expect(domain?.name).toBe('Sales');
        });
        
        test('returns undefined for non-existent domain', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
            `);
            
            // Act
            const result = query.domain('NonExistent');
            
            // Assert
            expect(result).toBeUndefined();
        });
    });
    
    describe('Query.team()', () => {
        
        test('finds team by name', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Team SalesTeam
                Team PaymentTeam
            `);
            
            // Act
            const team = query.team('SalesTeam');
            
            // Assert
            expect(team?.name).toBe('SalesTeam');
        });
        
        test('returns undefined for non-existent team', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Team SalesTeam
            `);
            
            // Act
            const result = query.team('NonExistentTeam');
            
            // Assert
            expect(result).toBeUndefined();
        });
    });
    
    describe('Query.fqn()', () => {

        test('computes fully qualified name for top-level node', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
            `);
            const domain = [...query.domains()][0];

            // Act
            const fqn = query.fqn(domain);

            // Assert
            expect(fqn).toBe('Sales');
        });

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

        test('returns empty for model with no relationships', async () => {
            const { query } = await loadModelFromText(`Domain Sales { vision: "v" }`);
            expect([...query.relationships()]).toHaveLength(0);
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

    describe('Query.contextMaps()', () => {

        test('returns all context maps', async () => {
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc A for Sales
                bc B for Sales
                ContextMap Map1 { contains A, B }
                ContextMap Map2 { contains A }
            `);
            const maps = [...query.contextMaps()];
            expect(maps).toHaveLength(2);
            expect(maps.map(m => m.name)).toContain('Map1');
            expect(maps.map(m => m.name)).toContain('Map2');
        });

        test('returns empty when no context maps', async () => {
            const { query } = await loadModelFromText(`Domain Sales { vision: "v" }`);
            expect([...query.contextMaps()]).toHaveLength(0);
        });
    });

    // ========================================================================
    // DOMAIN MAPS
    // ========================================================================

    describe('Query.domainMaps()', () => {

        test('returns all domain maps', async () => {
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                Domain Finance { vision: "v" }
                DomainMap BusinessMap {
                    contains Sales, Finance
                }
            `);
            const maps = [...query.domainMaps()];
            expect(maps).toHaveLength(1);
            expect(maps[0].name).toBe('BusinessMap');
        });

        test('returns empty when no domain maps', async () => {
            const { query } = await loadModelFromText(`Domain Sales { vision: "v" }`);
            expect([...query.domainMaps()]).toHaveLength(0);
        });
    });

    // ========================================================================
    // NAMESPACES
    // ========================================================================

    describe('Query.namespaces()', () => {

        test('returns all namespaces including nested', async () => {
            const { query } = await loadModelFromText(`
                Namespace com.example {
                    Domain Sales { vision: "v" }
                    Namespace inner {
                        Domain Finance { vision: "v" }
                    }
                }
            `);
            const ns = [...query.namespaces()];
            expect(ns).toHaveLength(2);
            expect(ns.map(n => n.name)).toContain('com.example');
            expect(ns.map(n => n.name)).toContain('inner');
        });

        test('returns empty when no namespaces', async () => {
            const { query } = await loadModelFromText(`Domain Sales { vision: "v" }`);
            expect([...query.namespaces()]).toHaveLength(0);
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
            `);
            const domain = query.byFqn<Domain>('com.example.Sales');
            expect(domain).not.toBeUndefined();
            expect(domain?.name).toBe('Sales');
        });

        test('returns undefined for non-existent FQN', async () => {
            const { query } = await loadModelFromText(`Domain Sales { vision: "v" }`);
            expect(query.byFqn('does.not.exist')).toBeUndefined();
        });
    });
});
