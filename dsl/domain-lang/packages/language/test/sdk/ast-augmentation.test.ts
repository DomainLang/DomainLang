/**
 * Test suite for SDK AST augmentation features.
 *
 * Tests the module augmentation pattern that adds native SDK properties
 * to BoundedContext, Domain, and Relationship AST nodes.
 *
 * ~20% smoke (basic property access), ~80% edge/error (nulls, missing data, boundaries).
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Test assertions use ! to verify expected values exist */

import { describe, test, expect } from 'vitest';
import { loadModelFromText, matchesPattern } from '../../src/sdk/index.js';
import type { BoundedContext, Domain, Relationship } from '../../src/generated/ast.js';
import { isBoundedContext, isDomain, isContextMap } from '../../src/generated/ast.js';
import { AstUtils } from 'langium';

// Import the augmentation module to enable TypeScript type extensions
import '../../src/sdk/ast-augmentation.js';

// ============================================================================
// Helpers
// ============================================================================

function findFirst<T>(model: unknown, guard: (node: unknown) => node is T): T | undefined {
    for (const node of AstUtils.streamAllContents(model as import('langium').AstNode)) {
        if (guard(node)) {
            return node;
        }
    }
    return undefined;
}

function findFirstRelationship(model: unknown): Relationship | undefined {
    for (const node of AstUtils.streamAllContents(model as import('langium').AstNode)) {
        if (isBoundedContext(node) && node.relationships.length > 0) {
            return node.relationships[0];
        }
        if (isContextMap(node) && node.relationships.length > 0) {
            return node.relationships[0];
        }
    }
    return undefined;
}

// ============================================================================
// BoundedContext Augmentation
// ============================================================================

describe('SDK AST Augmentation', () => {

    describe('BoundedContext augmented properties', () => {

        // Smoke: one happy-path test covering core augmented properties
        test('augments BC with description, classification, team, and fqn', async () => {
            // Arrange & Act
            const { model } = await loadModelFromText(`
                Classification Core
                Team SalesTeam
                Namespace acme.sales {
                    Domain Sales { vision: "v" }
                    bc OrderContext for Sales as Core by SalesTeam {
                        description: "Handles order processing"
                    }
                }
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            expect(bc!.description).toBe('Handles order processing');
            expect(bc!.effectiveClassification?.name).toBe('Core');
            expect(bc!.effectiveTeam?.name).toBe('SalesTeam');
            expect(bc!.fqn).toBe('acme.sales.OrderContext');
        });

        // Edge: BC without namespace gets simple name as fqn
        test('fqn falls back to simple name when not in namespace', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            expect(bc!.fqn).toBe('OrderContext');
        });

        // Edge: BC with no classification or team set
        test('effectiveClassification and effectiveTeam return undefined when unset', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            expect(bc!.effectiveClassification).toBeUndefined();
            expect(bc!.effectiveTeam).toBeUndefined();
        });

        // Edge: BC without description
        test('description is empty string when not specified', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            // description should be empty/undefined when not set
            expect(bc!.description ?? '').toBe('');
        });

        // Edge: hasClassification with various invalid inputs
        test('hasClassification returns false for undefined, empty string, and wrong name', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Classification Core
                Domain Sales { vision: "v" }
                bc OrderContext for Sales as Core
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            expect(bc!.hasClassification('Core')).toBe(true);
            expect(bc!.hasClassification('Supporting')).toBe(false);
            expect(bc!.hasClassification(undefined as any)).toBe(false);
            expect(bc!.hasClassification('' as any)).toBe(false);
        });

        // Edge: hasClassification when BC has no classification
        test('hasClassification returns false when BC has no classification', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            expect(bc!.hasClassification('Core')).toBe(false);
        });

        // Edge: hasTeam with various invalid inputs
        test('hasTeam returns false for undefined, empty string, and wrong name', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Team SalesTeam
                Domain Sales { vision: "v" }
                bc OrderContext for Sales by SalesTeam
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            expect(bc!.hasTeam('SalesTeam')).toBe(true);
            expect(bc!.hasTeam('OtherTeam')).toBe(false);
            expect(bc!.hasTeam(undefined as any)).toBe(false);
            expect(bc!.hasTeam('' as any)).toBe(false);
        });

        // Edge: hasTeam when BC has no team
        test('hasTeam returns false when BC has no team', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            expect(bc!.hasTeam('AnyTeam')).toBe(false);
        });

        // Edge: hasMetadata with various scenarios
        test('hasMetadata checks key presence, value match, and missing keys', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Metadata status
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    metadata {
                        status: "active"
                    }
                }
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            expect(bc!.hasMetadata('status')).toBe(true);
            expect(bc!.hasMetadata('status', 'active')).toBe(true);
            expect(bc!.hasMetadata('status', 'inactive')).toBe(false);
            expect(bc!.hasMetadata('unknown')).toBe(false);
        });

        // Edge: hasMetadata on BC with empty metadata block
        test('hasMetadata returns false on BC with no metadata', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            expect(bc!.hasMetadata('anything')).toBe(false);
        });

        // Edge: metadataMap returns empty map for BC without metadata
        test('metadataMap returns empty map when no metadata block', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
            `);

            // Act
            const bc = findFirst<BoundedContext>(model, isBoundedContext);

            // Assert
            expect(bc!.metadataMap.size).toBe(0);
        });
    });

    // ========================================================================
    // Domain Augmentation
    // ========================================================================

    describe('Domain augmented properties', () => {

        // Smoke: core domain properties
        test('augments Domain with vision, description, type, and fqn', async () => {
            // Arrange & Act
            const { model } = await loadModelFromText(`
                Classification CoreDomain
                Namespace enterprise.retail {
                    Domain Sales {
                        description: "Sales domain description"
                        vision: "Drive sales growth"
                        type: CoreDomain
                    }
                }
            `);

            // Act
            const domain = findFirst<Domain>(model, isDomain);

            // Assert
            expect(domain!.vision).toBe('Drive sales growth');
            expect(domain!.description).toBe('Sales domain description');
            expect(domain!.hasType('CoreDomain')).toBe(true);
            expect(domain!.fqn).toBe('enterprise.retail.Sales');
        });

        // Edge: domain without namespace has simple name fqn
        test('fqn returns simple name when not in namespace', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
            `);

            // Act
            const domain = findFirst<Domain>(model, isDomain);

            // Assert
            expect(domain!.fqn).toBe('Sales');
        });

        // Edge: hasType with nonexistent type and undefined
        test('hasType returns false for wrong name, undefined, and when type is not set', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
            `);

            // Act
            const domain = findFirst<Domain>(model, isDomain);

            // Assert
            // No type set
            expect(domain!.hasType('Core')).toBe(false);
            expect(domain!.hasType(undefined as any)).toBe(false);
        });

        // Edge: domain without vision or description
        test('domain without vision or description has falsy values', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales {}
            `);

            // Act
            const domain = findFirst<Domain>(model, isDomain);

            // Assert
            expect(domain!.vision ?? '').toBe('');
            expect(domain!.description ?? '').toBe('');
        });
    });

    // ========================================================================
    // Relationship Augmentation
    // ========================================================================

    describe('Relationship augmented properties', () => {

        // Smoke: core relationship properties including pattern checks
        test('augments Relationship with pattern checks, context names, and directionality', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    relationships {
                        [OHS, PL] this -> [CF, ACL] PaymentContext
                    }
                }
                bc PaymentContext for Sales
            `);

            // Act
            const rel = findFirstRelationship(model);

            // Assert
            // Pattern checks
            expect(rel!.hasPattern('OHS')).toBe(true);
            expect(rel!.hasPattern('CF')).toBe(true);
            expect(rel!.hasPattern('ACL')).toBe(true); // ACL is on right, hasPattern checks both sides
            expect(rel!.hasLeftPattern('OHS')).toBe(true);
            expect(rel!.hasLeftPattern('PL')).toBe(true);
            expect(rel!.hasLeftPattern('CF')).toBe(false);
            expect(rel!.hasRightPattern('CF')).toBe(true);
            expect(rel!.hasRightPattern('ACL')).toBe(true);
            expect(rel!.hasRightPattern('OHS')).toBe(false);
            // Context names
            expect(rel!.leftContextName).toBe('OrderContext');
            expect(rel!.rightContextName).toBe('PaymentContext');
            // Directionality
            expect(rel!.isBidirectional).toBe(false);
            expect(rel!.isUpstream('left')).toBe(true);
            expect(rel!.isDownstream('right')).toBe(true);
            expect(rel!.isUpstream('right')).toBe(false);
            expect(rel!.isDownstream('left')).toBe(false);
        });

        // Edge: bidirectional relationship
        test('isBidirectional is true for <-> arrow', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    relationships {
                        [SK] this <-> PaymentContext
                    }
                }
                bc PaymentContext for Sales
            `);

            // Act
            const rel = findFirstRelationship(model);

            // Assert
            expect(rel!.isBidirectional).toBe(true);
        });

        // Edge: relationship with no patterns
        test('hasPattern returns false when no patterns on either side', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    relationships {
                        this -> PaymentContext
                    }
                }
                bc PaymentContext for Sales
            `);

            // Act
            const rel = findFirstRelationship(model);

            // Assert
            expect(rel!.hasPattern('OHS')).toBe(false);
            expect(rel!.hasPattern('CF')).toBe(false);
            expect(rel!.hasLeftPattern('OHS')).toBe(false);
            expect(rel!.hasRightPattern('CF')).toBe(false);
            expect(rel!.isUpstream('left')).toBe(false);
            expect(rel!.isDownstream('right')).toBe(false);
        });

        // Edge: ContextMap relationship (not in a BC)
        test('ContextMap relationships resolve context names', async () => {
            // Arrange
            const { model } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales
                bc PaymentContext for Sales

                ContextMap ECommerceMap {
                    contains OrderContext, PaymentContext
                    [OHS] OrderContext -> [CF] PaymentContext : CustomerSupplier
                }
            `);

            // Act
            // Find rel from ContextMap not BC
            let rel: Relationship | undefined;
            for (const node of AstUtils.streamAllContents(model as import('langium').AstNode)) {
                if (isContextMap(node) && node.relationships.length > 0) {
                    rel = node.relationships[0];
                    break;
                }
            }

            // Assert
            expect(rel).not.toBeUndefined();
            expect(rel!.hasPattern('OHS')).toBe(true);
            expect(rel!.hasPattern('CF')).toBe(true);
        });
    });

    // ========================================================================
    // Pattern Matching Utilities
    // ========================================================================

    describe('Pattern matching utilities', () => {

        // Edge: abbreviation <-> full name bidirectional matching
        test('matchesPattern resolves abbreviations and full names bidirectionally', () => {
            // Arrange
            const cases: [string, string, boolean][] = [
                ['OHS', 'OHS', true],
                ['OpenHostService', 'OHS', true],
                ['OHS', 'OpenHostService', true],
                ['SK', 'SharedKernel', true],
                ['SharedKernel', 'SK', true],
                ['CF', 'Conformist', true],
                ['ACL', 'AntiCorruptionLayer', true],
                ['PL', 'PublishedLanguage', true],
                ['P', 'Partnership', true],
            ];

            // Act & Assert
            for (const [actual, expected, result] of cases) {
                expect(matchesPattern(actual, expected)).toBe(result);
            }
        });

        // Edge: case-insensitive matching
        test('matchesPattern is case-insensitive', () => {
            // Act & Assert
            expect(matchesPattern('ohs', 'OHS')).toBe(true);
            expect(matchesPattern('OHS', 'ohs')).toBe(true);
            expect(matchesPattern('sharedkernel', 'SK')).toBe(true);
            expect(matchesPattern('OPENHOSTSERVICE', 'OHS')).toBe(true);
        });

        // Edge: non-matching patterns
        test('matchesPattern returns false for unrelated patterns', () => {
            // Act & Assert
            expect(matchesPattern('OHS', 'CF')).toBe(false);
            expect(matchesPattern('SK', 'ACL')).toBe(false);
            expect(matchesPattern('Unknown', 'OHS')).toBe(false);
        });

        // Edge: whitespace in pattern string
        test('matchesPattern trims whitespace from actual pattern', () => {
            // Act & Assert
            expect(matchesPattern('  OHS  ', 'OHS')).toBe(true);
        });

        // Edge: empty strings
        test('matchesPattern handles empty strings', () => {
            // Act & Assert
            expect(matchesPattern('', 'OHS')).toBe(false);
            expect(matchesPattern('OHS', '')).toBe(false);
            expect(matchesPattern('', '')).toBe(true); // trivial: empty matches empty
        });
    });
});
