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
                    [OHS] OrderContext -> [CF] PaymentContext : CustomerSupplier
                }
            `);
            const rels = [...query.relationships()];
            expect(rels).toHaveLength(1);
            expect(rels[0].left.name).toBe('OrderContext');
            expect(rels[0].right.name).toBe('PaymentContext');
            expect(rels[0].arrow).toBe('->');
            expect(rels[0].source).toBe('ContextMap');
        });

        test('returns relationships from bounded contexts using this', async () => {
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc PaymentContext for Sales
                bc OrderContext for Sales {
                    relationships {
                        [OHS] this -> [CF] PaymentContext : CustomerSupplier
                    }
                }
            `);
            const rels = [...query.relationships()];
            expect(rels).toHaveLength(1);
            expect(rels[0].left.name).toBe('OrderContext');
            expect(rels[0].right.name).toBe('PaymentContext');
            expect(rels[0].source).toBe('BoundedContext');
        });

        test('returns empty for model with no relationships', async () => {
            const { query } = await loadModelFromText(`Domain Sales { vision: "v" }`);
            expect([...query.relationships()]).toHaveLength(0);
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
            expect(domain).toBeDefined();
            expect(domain?.name).toBe('Sales');
        });

        test('returns undefined for non-existent FQN', async () => {
            const { query } = await loadModelFromText(`Domain Sales { vision: "v" }`);
            expect(query.byFqn('does.not.exist')).toBeUndefined();
        });
    });
});
