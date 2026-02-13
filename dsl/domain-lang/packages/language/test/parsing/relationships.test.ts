/**
 * Relationship Tests
 * 
 * Tests for relationship definitions including:
 * - Arrow types (directional, bidirectional)
 * - DDD patterns (OHS, CF, ACL, PL, P, SK, BBoM)
 * - Relationship types (Partnership, SharedKernel, etc.)
 * - Multiple roles on relationships
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, expectGrammarRuleRejectsInput, getAllBoundedContexts, s } from '../test-helpers.js';
import type { ContextMap, Relationship } from '../../src/generated/ast.js';
import { isContextMap } from '../../src/generated/ast.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRelationships(document: any): Relationship[] {
    const contextMap = document.parseResult.value.children.find(isContextMap) as ContextMap;
    return contextMap?.relationships ?? [];
}

// ============================================================================
// ARROW TYPES
// ============================================================================

describe('Relationship Arrow Types', () => {
    test.each([
        ['->', 'downstream'],
        ['<-', 'upstream'],
        ['<->', 'bidirectional'],
        ['><', 'mutual dependency'],
    ] as const)('should parse %s (%s) arrow', async (arrow, _description) => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales
            
            ContextMap TestMap {
                contains OrderContext, PaymentContext
                OrderContext ${arrow} PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const relationships = getRelationships(document);
        expect(relationships[0].arrow).toBe(arrow);
    });

    // NOTE: U/D, u/d, C/S, c/s arrow aliases removed - use symbolic arrows (-> <- <-> ><) with explicit type
});

// ============================================================================
// DDD PATTERNS (ROLES)
// ============================================================================

describe('DDD Pattern Annotations', () => {
    test.each([
        ['OHS', 'left', '->'],
        ['CF', 'right', '->'],
        ['ACL', 'left', '->'],
        ['PL', 'left', '->'],
        ['P', 'left', '<->'],
        ['SK', 'left', '<->'],
        ['BBoM', 'left', '->'],
    ] as const)('should parse [%s] on %s side', async (pattern, side, arrow) => {
        // Arrange
        const leftPattern = side === 'left' ? `[${pattern}] ` : '';
        const rightPattern = side === 'right' ? `[${pattern}] ` : '';
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales
            
            ContextMap TestMap {
                contains OrderContext, PaymentContext
                ${leftPattern}OrderContext ${arrow} ${rightPattern}PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const relationships = getRelationships(document);
        const patterns = side === 'left' ? relationships[0].leftPatterns : relationships[0].rightPatterns;
        expect(patterns).toContain(pattern);
    });

    test('should parse patterns on both sides', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales
            
            ContextMap TestMap {
                contains OrderContext, PaymentContext
                [OHS] OrderContext -> [CF] PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const relationships = getRelationships(document);
        expect(relationships[0].leftPatterns).toContain('OHS');
        expect(relationships[0].rightPatterns).toContain('CF');
    });

    test('should parse multiple patterns on one side', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales
            
            ContextMap TestMap {
                contains OrderContext, PaymentContext
                [OHS, PL] OrderContext -> [CF, ACL] PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const relationships = getRelationships(document);
        expect(relationships[0].leftPatterns).toContain('OHS');
        expect(relationships[0].leftPatterns).toContain('PL');
        expect(relationships[0].rightPatterns).toContain('CF');
        expect(relationships[0].rightPatterns).toContain('ACL');
    });
});

// ============================================================================
// DDD PATTERNS - LONG-FORM ALIASES
// ============================================================================

describe('DDD Pattern Annotations - Long-form Aliases', () => {
    test.each([
        ['PublishedLanguage', 'left', '->'],
        ['OpenHostService', 'left', '->'],
        ['Conformist', 'right', '->'],
        ['AntiCorruptionLayer', 'right', '->'],
        ['Partnership', 'left', '<->'],
        ['SharedKernel', 'left', '<->'],
        ['BigBallOfMud', 'left', '->'],
    ] as const)('should parse [%s] on %s side', async (pattern, side, arrow) => {
        // Arrange
        const leftPattern = side === 'left' ? `[${pattern}] ` : '';
        const rightPattern = side === 'right' ? `[${pattern}] ` : '';
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales
            
            ContextMap TestMap {
                contains OrderContext, PaymentContext
                ${leftPattern}OrderContext ${arrow} ${rightPattern}PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const relationships = getRelationships(document);
        const patterns = side === 'left' ? relationships[0].leftPatterns : relationships[0].rightPatterns;
        expect(patterns).toContain(pattern);
    });

    test('should parse mixed short and long-form patterns', async () => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales
            
            ContextMap TestMap {
                contains OrderContext, PaymentContext
                [OpenHostService, PL] OrderContext -> [Conformist, ACL] PaymentContext
            }
        `;
        const document = await testServices.parse(input);
        expectValidDocument(document);
        const relationships = getRelationships(document);
        expect(relationships[0].leftPatterns).toContain('OpenHostService');
        expect(relationships[0].leftPatterns).toContain('PL');
        expect(relationships[0].rightPatterns).toContain('Conformist');
        expect(relationships[0].rightPatterns).toContain('ACL');
    });
});

// ============================================================================
// RELATIONSHIP TYPES
// ============================================================================

describe('Relationship Types', () => {
    test.each([
        ['Partnership', '<->'],
        ['SharedKernel', '<->'],
        ['CustomerSupplier', '->'],
        ['UpstreamDownstream', '->'],
        ['SeparateWays', '><'],
    ] as const)('should parse %s type', async (type, arrow) => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales
            
            ContextMap TestMap {
                contains OrderContext, PaymentContext
                OrderContext ${arrow} PaymentContext : ${type}
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const relationships = getRelationships(document);
        expect(relationships[0].type).toBe(type);
    });
});

// ============================================================================
// COMBINED PATTERNS AND TYPES
// ============================================================================

describe('Combined Patterns and Types', () => {
    test('should parse patterns with relationship type', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales
            
            ContextMap TestMap {
                contains OrderContext, PaymentContext
                [OHS] OrderContext -> [CF] PaymentContext : CustomerSupplier
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const relationships = getRelationships(document);
        expect(relationships[0].leftPatterns).toContain('OHS');
        expect(relationships[0].rightPatterns).toContain('CF');
        expect(relationships[0].type).toBe('CustomerSupplier');
    });

    test('should parse multiple relationships in one context map', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales
            bc InventoryContext for Sales
            
            ContextMap TestMap {
                contains OrderContext, PaymentContext, InventoryContext
                [OHS] OrderContext -> [CF] PaymentContext : CustomerSupplier
                OrderContext <-> InventoryContext : Partnership
                [ACL] PaymentContext <- InventoryContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const relationships = getRelationships(document);
        expect(relationships).toHaveLength(3);

        expect(relationships[0].arrow).toBe('->');
        expect(relationships[0].leftPatterns).toContain('OHS');
        expect(relationships[0].rightPatterns).toContain('CF');
        expect(relationships[0].type).toBe('CustomerSupplier');

        expect(relationships[1].arrow).toBe('<->');
        expect(relationships[1].type).toBe('Partnership');

        expect(relationships[2].arrow).toBe('<-');
        expect(relationships[2].leftPatterns).toContain('ACL');
    });
});

// ============================================================================
// bc INTERNAL RELATIONSHIPS
// ============================================================================

describe('bc Internal Relationships', () => {
    test('should parse this reference on left side', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales {
                relationships {
                    this -> OrderContext
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bcs = getAllBoundedContexts(document);
        const bc = bcs.find(b => b.relationships.length > 0);
        expect(bc?.name).toBe('PaymentContext');
        expect(bc!.relationships).toHaveLength(1);
        expect(bc!.relationships[0].arrow).toBe('->');
    });

    test('should parse this reference with patterns', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales {
                relationships {
                    [OHS] this -> [CF] OrderContext : CustomerSupplier
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bcs = getAllBoundedContexts(document);
        const bc = bcs.find(b => b.relationships.length > 0);
        expect(bc?.name).toBe('PaymentContext');
        expect(bc!.relationships).toHaveLength(1);
        expect(bc!.relationships[0].arrow).toBe('->');
        expect(bc!.relationships[0].leftPatterns).toContain('OHS');
        expect(bc!.relationships[0].rightPatterns).toContain('CF');
        expect(bc!.relationships[0].type).toBe('CustomerSupplier');
    });

    test('should parse multiple relationships in BC', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc InventoryContext for Sales
            bc PaymentContext for Sales {
                relationships {
                    this -> OrderContext
                    this <-> InventoryContext
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bcs = getAllBoundedContexts(document);
        const bc = bcs.find(b => b.relationships.length > 0);
        expect(bc?.name).toBe('PaymentContext');
        expect(bc!.relationships).toHaveLength(2);
        expect(bc!.relationships[0].arrow).toBe('->');
        expect(bc!.relationships[1].arrow).toBe('<->');
    });

    test('should parse this <- arrow in BC relationship', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales {
                relationships {
                    this <- OrderContext
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bcs = getAllBoundedContexts(document);
        const bc = bcs.find(b => b.relationships.length > 0);
        expect(bc?.name).toBe('PaymentContext');
        expect(bc!.relationships).toHaveLength(1);
        expect(bc!.relationships[0].arrow).toBe('<-');
    });

    test('should parse this >< (separate ways) in BC relationship', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc LegacySystem for Sales {
                relationships {
                    this >< OrderContext : SeparateWays
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bcs = getAllBoundedContexts(document);
        const bc = bcs.find(b => b.relationships.length > 0);
        expect(bc?.name).toBe('LegacySystem');
        expect(bc!.relationships).toHaveLength(1);
        expect(bc!.relationships[0].arrow).toBe('><');
        expect(bc!.relationships[0].type).toBe('SeparateWays');
    });

    test('should parse BBoM pattern in BC relationship with this', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc LegacyContext for Sales {
                relationships {
                    [BBoM] this -> OrderContext
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bcs = getAllBoundedContexts(document);
        const bc = bcs.find(b => b.relationships.length > 0);
        expect(bc?.name).toBe('LegacyContext');
        expect(bc!.relationships[0].leftPatterns).toContain('BBoM');
    });

    test('should parse relationships with commas', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap TestMap {
                contains OrderContext, PaymentContext
                OrderContext -> PaymentContext,
                PaymentContext <- OrderContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const relationships = getRelationships(document);
        expect(relationships).toHaveLength(2);
        expect(relationships[0].arrow).toBe('->');
        expect(relationships[1].arrow).toBe('<-');
    });
});

// ============================================================================
// NEGATIVE TESTS
// ============================================================================

describe('Negative: Invalid Relationships', () => {
    test('should reject ContextMap with invalid syntax inside block', async () => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap TestMap {
                contains OrderContext, PaymentContext
                -> ->
            }
        `;

        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Invalid syntax in ContextMap'
        );
    });

    test('should produce linking errors for BC relationships referencing non-existent contexts', async () => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales {
                relationships {
                    this -> NonExistent
                }
            }
        `;

        const document = await testServices.parse(input);
        // Parser succeeds but linker should flag the unresolved reference
        const diagnostics = document.diagnostics ?? [];
        const unresolvedDiagnostics = diagnostics.filter(d =>
            d.message.toLowerCase().includes('nonexistent') || d.message.toLowerCase().includes('resolve')
        );
        expect(unresolvedDiagnostics.length).toBeGreaterThan(0);
    });

    test('should produce diagnostics for relationship referencing non-existent BC', async () => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales

            ContextMap TestMap {
                contains OrderContext
                OrderContext -> NonExistentContext
            }
        `;

        const document = await testServices.parse(input);

        // Parser succeeds but validation should produce diagnostics
        // (linking errors for non-existent references)
        const diagnostics = document.diagnostics ?? [];
        const unresolvedDiagnostics = diagnostics.filter(d =>
            d.message.toLowerCase().includes('nonexistent') || d.message.toLowerCase().includes('resolve')
        );
        expect(unresolvedDiagnostics.length).toBeGreaterThan(0);
    });
});
