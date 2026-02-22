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
import { setupTestSuite, expectValidDocument, expectGrammarRuleRejectsInput, getAllBoundedContexts, s } from '../test-helpers.js';
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
    test('should parse -> as DirectionalRelationship with arrow ->', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap TestMap {
                contains OrderContext, PaymentContext
                OrderContext -> PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].arrow).toBe('->');
    });

    test('should parse <- as DirectionalRelationship with arrow <-', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap TestMap {
                contains OrderContext, PaymentContext
                OrderContext <- PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].arrow).toBe('<-');
    });

    test('should parse <-> as DirectionalRelationship with arrow <->', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap TestMap {
                contains OrderContext, PaymentContext
                OrderContext <-> PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].arrow).toBe('<->');
    });
});

// ============================================================================
// SYMMETRIC RELATIONSHIP FORMS
// ============================================================================

describe('Symmetric relationship forms', () => {
    test.each([
        ['SK', 'SharedKernel'],
        ['SharedKernel', 'SharedKernel'],
    ] as const)('should parse [%s] as SymmetricRelationship with SharedKernel pattern', async (keyword, expectedType) => {
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
        expectValidDocument(document);
        const rels = getSymmetric(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].pattern?.$type).toBe(expectedType);
    });

    test.each([
        ['P', 'Partnership'],
        ['Partnership', 'Partnership'],
    ] as const)('should parse [%s] as SymmetricRelationship with Partnership pattern', async (keyword, expectedType) => {
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
        expectValidDocument(document);
        const rels = getSymmetric(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].pattern?.$type).toBe(expectedType);
    });

    test.each([
        ['SW', 'SeparateWays'],
        ['SeparateWays', 'SeparateWays'],
    ] as const)('should parse [%s] as SymmetricRelationship with SeparateWays pattern', async (keyword, expectedType) => {
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
        expectValidDocument(document);
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
        expectValidDocument(document);
        const rels = getSymmetric(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].arrow).toBe('><');
        expect(rels[0].pattern).toBeUndefined();
    });
});

// ============================================================================
// SIDE PATTERNS (DIRECTIONAL)
// ============================================================================

describe('Side patterns on directional relationships', () => {
    test('should parse left OHS and right CF patterns', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales

            ContextMap TestMap {
                contains Orders, Payments
                Orders [OHS] -> [CF] Payments
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].leftPatterns).toHaveLength(1);
        expect(rels[0].leftPatterns[0].$type).toBe('OpenHostService');
        expect(rels[0].rightPatterns).toHaveLength(1);
        expect(rels[0].rightPatterns[0].$type).toBe('Conformist');
    });

    test('should parse left ACL with empty right patterns', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales

            ContextMap TestMap {
                contains Orders, Payments
                Orders [ACL] -> Payments
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].leftPatterns).toHaveLength(1);
        expect(rels[0].leftPatterns[0].$type).toBe('AntiCorruptionLayer');
        expect(rels[0].rightPatterns).toHaveLength(0);
    });

    test('should parse empty left with right PL pattern', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales

            ContextMap TestMap {
                contains Orders, Payments
                Orders -> [PL] Payments
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].leftPatterns).toHaveLength(0);
        expect(rels[0].rightPatterns).toHaveLength(1);
        expect(rels[0].rightPatterns[0].$type).toBe('PublishedLanguage');
    });

    test('should parse left BBoM and right ACL patterns', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales

            ContextMap TestMap {
                contains Orders, Payments
                Orders [BBoM] -> [ACL] Payments
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(1);
        expect(rels[0].leftPatterns[0].$type).toBe('BigBallOfMud');
        expect(rels[0].rightPatterns[0].$type).toBe('AntiCorruptionLayer');
    });

    test('should parse Supplier/Customer short forms', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales

            ContextMap TestMap {
                contains Orders, Payments
                Orders [S] -> [C] Payments
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const rels = getDirectional(document);
        expect(rels[0].leftPatterns[0].$type).toBe('Supplier');
        expect(rels[0].rightPatterns[0].$type).toBe('Customer');
    });

    test('should parse Supplier/Customer long forms', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc Orders for Sales
            bc Payments for Sales

            ContextMap TestMap {
                contains Orders, Payments
                Orders [Supplier] -> [Customer] Payments
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const rels = getDirectional(document);
        expect(rels[0].leftPatterns[0].$type).toBe('Supplier');
        expect(rels[0].rightPatterns[0].$type).toBe('Customer');
    });
});

// ============================================================================
// MULTIPLE PATTERNS ON ONE SIDE
// ============================================================================

describe('Multiple patterns on one side', () => {
    test('should parse two patterns on each side', async () => {
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
        expectValidDocument(document);
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
    test.each([
        ['OHS', 'OpenHostService'],
        ['PL', 'PublishedLanguage'],
        ['CF', 'Conformist'],
        ['ACL', 'AntiCorruptionLayer'],
        ['S', 'Supplier'],
        ['C', 'Customer'],
        ['BBoM', 'BigBallOfMud'],
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
        expectValidDocument(shortDoc);
        expectValidDocument(longDoc);
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
        expectValidDocument(document);
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
        expectValidDocument(document);
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
        expectValidDocument(document);
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
        expectValidDocument(document);
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
        expectValidDocument(document);
        const rels = getDirectional(document);
        expect(rels).toHaveLength(2);
        expect(rels[0].arrow).toBe('->');
        expect(rels[1].arrow).toBe('<-');
    });
});

// ============================================================================
// NEGATIVE TESTS
// ============================================================================

describe('Negative: Invalid relationships', () => {
    test('should reject symmetric pattern in directional side position', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc A for Sales
            bc B for Sales

            ContextMap InvalidMap {
                contains A, B
                A [SK] -> B
            }
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'ContextMap'
        );
    });

    test('should reject directional side pattern in symmetric form', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc A for Sales
            bc B for Sales

            ContextMap InvalidMap {
                contains A, B
                A [OHS] [SK] B
            }
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'ContextMap'
        );
    });

    test('should reject invalid syntax inside ContextMap block', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap TestMap {
                contains OrderContext, PaymentContext
                -> ->
            }
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Invalid syntax in ContextMap'
        );
    });

    test('should produce linking errors for BC relationships referencing non-existent contexts', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales {
                relationships {
                    this -> NonExistent
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        const diagnostics = document.diagnostics ?? [];
        const unresolvedDiagnostics = diagnostics.filter(d =>
            d.message.toLowerCase().includes('nonexistent') || d.message.toLowerCase().includes('resolve')
        );
        expect(unresolvedDiagnostics.length).toBeGreaterThan(0);
    });

    test('should produce diagnostics for ContextMap relationship referencing non-existent BC', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales

            ContextMap TestMap {
                contains OrderContext
                OrderContext -> NonExistentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        const diagnostics = document.diagnostics ?? [];
        const unresolvedDiagnostics = diagnostics.filter(d =>
            d.message.toLowerCase().includes('nonexistent') || d.message.toLowerCase().includes('resolve')
        );
        expect(unresolvedDiagnostics.length).toBeGreaterThan(0);
    });
});
