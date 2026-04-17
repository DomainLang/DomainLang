/**
 * Relationship Tests
 *
 * Tests for the entity-relationship-entity syntax (PRS-019):
 * - Directional arrows (->, <-, <->)
 * - Symmetric relationships ([SK], [P], [SW], ><)
 * - Side patterns on directional relationships (OHS, CF, ACL, PL, S, C, BBoM)
 * - Multiple patterns per side
 * - Short/long alias equivalence
 * - BC-internal relationships with `this`
 * - Multiple relationships in one context map
 * - Negative / invalid syntax
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { LangiumDocument } from 'langium';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectParsedDocument, getAllBoundedContexts, s } from '../test-helpers.js';
import type { ContextMap, Model, Relationship, DirectionalRelationship, SymmetricRelationship } from '../../src/generated/ast.js';
import { isContextMap, isDirectionalRelationship, isSymmetricRelationship, isThisRef } from '../../src/generated/ast.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRelationships(doc: LangiumDocument<Model>): Relationship[] {
    const model = doc.parseResult.value;
    return model.children
        .filter(isContextMap)
        .flatMap((cm: ContextMap) => cm.relationships);
}

function getDirectional(doc: LangiumDocument<Model>): DirectionalRelationship[] {
    return getRelationships(doc).filter(isDirectionalRelationship);
}

function getSymmetric(doc: LangiumDocument<Model>): SymmetricRelationship[] {
    return getRelationships(doc).filter(isSymmetricRelationship);
}

// ============================================================================
// DIRECTIONAL ARROW TYPES
// ============================================================================

describe('Directional arrow types', () => {
    test.each([
        ['->'],
        ['<-'],
        ['<->'],
    ] as const)('should parse %s arrow', async (arrow) => {
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
        expectParsedDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].arrow).toBe(arrow);
    });
});

// ============================================================================
// SYMMETRIC RELATIONSHIP FORMS
// ============================================================================

describe('Symmetric relationship forms', () => {
    test.each([
        ['SK', 'SharedKernel'],
        ['SharedKernel', 'SharedKernel'],
        ['P', 'Partnership'],
        ['Partnership', 'Partnership'],
        ['SW', 'SeparateWays'],
        ['SeparateWays', 'SeparateWays'],
    ] as const)('should parse [%s] as SymmetricRelationship with %s pattern', async (keyword, expectedType) => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap TestMap {
                contains OrderContext, PaymentContext
                OrderContext [${keyword}] PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const rels = getSymmetric(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].pattern?.$type).toBe(expectedType);
    });

    test('should parse >< as SymmetricRelationship with arrow and no pattern', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap TestMap {
                contains OrderContext, PaymentContext
                OrderContext >< PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const rels = getSymmetric(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].arrow).toBe('><');
        expect(rels[0].pattern).toBeUndefined();
    });
});

// ============================================================================
// SIDE PATTERNS (DIRECTIONAL) — CONSOLIDATED
// ============================================================================

describe('Side patterns on directional relationships', () => {
    test.each([
        {
            scenario: 'left OHS and right CF patterns',
            leftPattern: 'OHS',
            rightPattern: 'CF',
            expectedLeftType: 'OpenHostService',
            expectedRightType: 'Conformist',
            contextNames: ['Orders', 'Payments']
        },
        {
            scenario: 'left BBoM and right ACL patterns',
            leftPattern: 'BBoM',
            rightPattern: 'ACL',
            expectedLeftType: 'BigBallOfMud',
            expectedRightType: 'AntiCorruptionLayer',
            contextNames: ['Orders', 'Payments']
        },
        {
            scenario: 'Supplier/Customer short forms',
            leftPattern: 'S',
            rightPattern: 'C',
            expectedLeftType: 'Supplier',
            expectedRightType: 'Customer',
            contextNames: ['Orders', 'Payments']
        }
    ])('should parse $scenario', async ({ leftPattern, rightPattern, expectedLeftType, expectedRightType, contextNames }) => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc ${contextNames[0]} for Sales
            bc ${contextNames[1]} for Sales

            ContextMap TestMap {
                contains ${contextNames[0]}, ${contextNames[1]}
                ${contextNames[0]} [${leftPattern}] -> [${rightPattern}] ${contextNames[1]}
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].leftPatterns[0].$type).toBe(expectedLeftType);
        expect(rels[0].rightPatterns[0].$type).toBe(expectedRightType);
    });

    test('should parse one-sided patterns (left-only ACL, and right-only PL)', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales
            bc Shipping for Sales

            ContextMap TestMap {
                contains Orders, Payments, Shipping
                Orders [ACL] -> Payments
                Orders -> [PL] Shipping
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(2);
        expect(rels[0].leftPatterns[0].$type).toBe('AntiCorruptionLayer');
        expect(rels[0].rightPatterns).toHaveLength(0);
        expect(rels[1].leftPatterns).toHaveLength(0);
        expect(rels[1].rightPatterns[0].$type).toBe('PublishedLanguage');
    });

    test('should parse multiple patterns on each side', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales

            ContextMap TestMap {
                contains Orders, Payments
                Orders [OHS, PL] -> [CF, ACL] Payments
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].leftPatterns).toHaveLength(2);
        expect(rels[0].leftPatterns[0].$type).toBe('OpenHostService');
        expect(rels[0].leftPatterns[1].$type).toBe('PublishedLanguage');
        expect(rels[0].rightPatterns).toHaveLength(2);
        expect(rels[0].rightPatterns[0].$type).toBe('Conformist');
        expect(rels[0].rightPatterns[1].$type).toBe('AntiCorruptionLayer');
    });
});

// ============================================================================
// PATTERN ALIASES (SHORT/LONG EQUIVALENCE)
// ============================================================================

describe('Side pattern aliases produce same AST $type', () => {
    // One short/long pair is sufficient to prove the alias mechanism works for all patterns
    test.each([
        ['OHS', 'OpenHostService'],
        ['ACL', 'AntiCorruptionLayer'],
    ] as const)('short form [%s] produces $type %s, same as long form', async (shortForm, expectedType) => {
        // Arrange
        const shortInput = s`
            Domain Sales {}
            bc A for Sales
            bc B for Sales

            ContextMap TestMap {
                contains A, B
                A [${shortForm}] -> B
            }
        `;
        const longInput = s`
            Domain Sales {}
            bc A for Sales
            bc B for Sales

            ContextMap TestMap {
                contains A, B
                A [${expectedType}] -> B
            }
        `;

        // Act
        const shortDoc = await testServices.parse(shortInput);
        const longDoc = await testServices.parse(longInput);

        // Assert
        expectParsedDocument(shortDoc);
        expectParsedDocument(longDoc);
        const shortRels = getDirectional(shortDoc);
        const longRels = getDirectional(longDoc);
        expect(shortRels[0].leftPatterns[0].$type).toBe(expectedType);
        expect(longRels[0].leftPatterns[0].$type).toBe(expectedType);
    });
});

// ============================================================================
// BC INTERNAL RELATIONSHIPS WITH `this`
// ============================================================================

describe('BC internal relationships with this', () => {
    test('should parse this with directional patterns', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales {
                relationships {
                    this [OHS] -> [CF] Orders
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const bcs = getAllBoundedContexts(document);
        const bc = bcs.find(b => b.relationships.length > 0);
        expect(bc?.name).toBe('Payments');
        expect(bc!.relationships).toHaveLength(1);
        const rel = bc!.relationships[0];
        expect(isDirectionalRelationship(rel)).toBe(true);
        if (isDirectionalRelationship(rel)) {
            expect(isThisRef(rel.left)).toBe(true);
            expect(rel.arrow).toBe('->');
            expect(rel.leftPatterns[0].$type).toBe('OpenHostService');
            expect(rel.rightPatterns[0].$type).toBe('Conformist');
        }
    });

    test('should parse this with symmetric SharedKernel pattern', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales {
                relationships {
                    this [SK] Orders
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const bcs = getAllBoundedContexts(document);
        const bc = bcs.find(b => b.relationships.length > 0);
        expect(bc?.name).toBe('Payments');
        const rel = bc!.relationships[0];
        expect(isSymmetricRelationship(rel)).toBe(true);
        if (isSymmetricRelationship(rel)) {
            expect(isThisRef(rel.left)).toBe(true);
            expect(rel.pattern?.$type).toBe('SharedKernel');
        }
    });

    test('should parse this >< as symmetric separate ways', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales {
                relationships {
                    this >< Orders
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const bcs = getAllBoundedContexts(document);
        const bc = bcs.find(b => b.relationships.length > 0);
        expect(bc?.name).toBe('Payments');
        const rel = bc!.relationships[0];
        expect(isSymmetricRelationship(rel)).toBe(true);
        if (isSymmetricRelationship(rel)) {
            expect(rel.arrow).toBe('><');
            expect(rel.pattern).toBeUndefined();
        }
    });
});

// ============================================================================
// MULTIPLE RELATIONSHIPS IN ONE MAP
// ============================================================================

describe('Multiple relationships in one context map', () => {
    test('should parse several relationships mixing types', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales
            bc InventoryContext for Sales

            ContextMap TestMap {
                contains OrderContext, PaymentContext, InventoryContext
                OrderContext [OHS] -> [CF] PaymentContext
                PaymentContext <- InventoryContext
                OrderContext [SK] InventoryContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const rels = getRelationships(document);
        expect(rels).toHaveLength(3);

        // First: directional with patterns
        expect(isDirectionalRelationship(rels[0])).toBe(true);
        if (isDirectionalRelationship(rels[0])) {
            expect(rels[0].arrow).toBe('->');
            expect(rels[0].leftPatterns[0].$type).toBe('OpenHostService');
            expect(rels[0].rightPatterns[0].$type).toBe('Conformist');
        }

        // Second: directional no patterns
        expect(isDirectionalRelationship(rels[1])).toBe(true);
        if (isDirectionalRelationship(rels[1])) {
            expect(rels[1].arrow).toBe('<-');
            expect(rels[1].leftPatterns).toHaveLength(0);
        }

        // Third: symmetric
        expect(isSymmetricRelationship(rels[2])).toBe(true);
        if (isSymmetricRelationship(rels[2])) {
            expect(rels[2].pattern?.$type).toBe('SharedKernel');
        }
    });

    test('should parse comma-separated relationships', async () => {
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
        expectParsedDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(2);
        expect(rels[0].arrow).toBe('->');
        expect(rels[1].arrow).toBe('<-');
    });
});