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
import type { BoundedContext, Domain, DirectionalRelationship, Relationship } from '../../src/generated/ast.js';
import { isBoundedContext, isDomain, isContextMap, isDirectionalRelationship } from '../../src/generated/ast.js';
import { AstUtils } from 'langium';

// Import the augmentation module to enable TypeScript type extensions
import '../../src/sdk/ast-augmentation.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// BoundedContext Augmentation
// ═══════════════════════════════════════════════════════════════════════════════

describe('BoundedContext augmented properties', () => {

    // ═ Smoke: core behavior with namespace, classification, team, metadata
    test('augments BC with description, classification, team, FQN, and metadata checks', async () => {
        // Arrange & Act
        const { model } = await loadModelFromText(`
            Classification Core
            Team SalesTeam
            Metadata status
            Namespace acme.sales {
                Domain Sales { vision: "v" }
                bc OrderContext for Sales as Core by SalesTeam {
                    description: "Handles order processing"
                    metadata { status: "active" }
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
        expect(bc!.hasMetadata('status', 'active')).toBe(true);
    });

    // ═ Edge: FQN fallback, missing classification/team, metadata edge cases
    interface BcCase {
        name: string;
        dlang: string;
        assertions: (bc: BoundedContext) => void;
    }

    test.each<BcCase>([
        {
            name: 'FQN falls back to simple name when not in namespace',
            dlang: 'Domain Sales { vision: "v" }\nbc OrderContext for Sales',
            assertions: (bc) => {
                expect(bc.fqn).toBe('OrderContext');
            }
        },
        {
            name: 'effectiveClassification and effectiveTeam are undefined when unset',
            dlang: 'Domain Sales { vision: "v" }\nbc OrderContext for Sales',
            assertions: (bc) => {
                expect(bc.effectiveClassification).toBeUndefined();
                expect(bc.effectiveTeam).toBeUndefined();
            }
        },
        {
            name: 'description is empty when not specified',
            dlang: 'Domain Sales { vision: "v" }\nbc OrderContext for Sales',
            assertions: (bc) => {
                expect(bc.description ?? '').toBe('');
            }
        },
        {
            name: 'hasClassification returns false for unset, wrong name, undefined',
            dlang: 'Classification Core\nDomain Sales { vision: "v" }\nbc OrderContext for Sales as Core',
            assertions: (bc) => {
                expect(bc.hasClassification('Core')).toBe(true);
                expect(bc.hasClassification('Supporting')).toBe(false);
                expect(bc.hasClassification(undefined as any)).toBe(false);
            }
        },
        {
            name: 'hasTeam returns false for unset, wrong name, undefined',
            dlang: 'Team SalesTeam\nDomain Sales { vision: "v" }\nbc OrderContext for Sales by SalesTeam',
            assertions: (bc) => {
                expect(bc.hasTeam('SalesTeam')).toBe(true);
                expect(bc.hasTeam('OtherTeam')).toBe(false);
                expect(bc.hasTeam(undefined as any)).toBe(false);
            }
        },
        {
            name: 'hasMetadata checks key and value correctly',
            dlang: 'Metadata tier\nDomain Sales { vision: "v" }\nbc OrderContext for Sales { metadata { tier: "critical" } }',
            assertions: (bc) => {
                expect(bc.hasMetadata('tier')).toBe(true);
                expect(bc.hasMetadata('tier', 'critical')).toBe(true);
                expect(bc.hasMetadata('tier', 'low')).toBe(false);
                expect(bc.hasMetadata('unknown')).toBe(false);
            }
        },
        {
            name: 'hasMetadata and metadataMap on BC with no metadata',
            dlang: 'Domain Sales { vision: "v" }\nbc OrderContext for Sales',
            assertions: (bc) => {
                expect(bc.hasMetadata('anything')).toBe(false);
                expect(bc.metadataMap.size).toBe(0);
            }
        },
    ])('$name', async ({ dlang, assertions }) => {
        // Arrange & Act
        const { model } = await loadModelFromText(dlang);
        const bc = findFirst<BoundedContext>(model, isBoundedContext);

        // Assert
        expect(bc).not.toBeUndefined();
        assertions(bc!);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Domain Augmentation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Domain augmented properties', () => {

    // ═ Smoke: vision, description, type, FQN
    test('augments Domain with vision, description, type, and FQN', async () => {
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

    // ═ Edge: FQN fallback, missing fields, hasType failures
    interface DomainCase {
        name: string;
        dlang: string;
        assertions: (domain: Domain) => void;
    }

    test.each<DomainCase>([
        {
            name: 'FQN returns simple name when not in namespace',
            dlang: 'Domain Sales { vision: "v" }',
            assertions: (d) => {
                expect(d.fqn).toBe('Sales');
            }
        },
        {
            name: 'hasType returns false for unset, wrong name, undefined',
            dlang: 'Domain Sales { vision: "v" }',
            assertions: (d) => {
                expect(d.hasType('Core')).toBe(false);
                expect(d.hasType(undefined as any)).toBe(false);
            }
        },
        {
            name: 'domain without vision or description has falsy values',
            dlang: 'Domain Sales {}',
            assertions: (d) => {
                expect(d.vision ?? '').toBe('');
                expect(d.description ?? '').toBe('');
            }
        },
    ])('$name', async ({ dlang, assertions }) => {
        // Arrange & Act
        const { model } = await loadModelFromText(dlang);
        const domain = findFirst<Domain>(model, isDomain);

        // Assert
        expect(domain).not.toBeUndefined();
        assertions(domain!);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Relationship Augmentation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Relationship augmented properties', () => {

    // ═ Smoke: pattern checks, context names, directionality
    test('augments Relationship with pattern checks, context names, and directionality', async () => {
        // Arrange & Act
        const { model } = await loadModelFromText(`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales {
                relationships {
                    this [OHS, PL] -> [CF, ACL] PaymentContext
                }
            }
            bc PaymentContext for Sales
        `);

        // Act
        const rel = findFirstRelationship(model);
        expect(isDirectionalRelationship(rel)).toBe(true);
        const drel = rel as DirectionalRelationship;

        // Assert
        expect(drel.hasPattern('OHS')).toBe(true);
        expect(drel.hasPattern('CF')).toBe(true);
        expect(drel.hasLeftPattern('OHS')).toBe(true);
        expect(drel.hasLeftPattern('PL')).toBe(true);
        expect(drel.hasLeftPattern('CF')).toBe(false);
        expect(drel.hasRightPattern('CF')).toBe(true);
        expect(drel.hasRightPattern('ACL')).toBe(true);
        expect(drel.hasRightPattern('OHS')).toBe(false);
        expect(drel.leftContextName).toBe('OrderContext');
        expect(drel.rightContextName).toBe('PaymentContext');
        expect(drel.isBidirectional).toBe(false);
        expect(drel.isUpstream('left')).toBe(true);
        expect(drel.isDownstream('right')).toBe(true);
    });

    // ═ Edge: bidirectional, no patterns, ContextMap relationships
    interface RelCase {
        name: string;
        dlang: string;
        assertions: (rel: DirectionalRelationship) => void;
    }

    test.each<RelCase>([
        {
            name: 'isBidirectional is true for <-> arrow',
            dlang: 'Domain Sales { vision: "v" }\nbc OrderContext for Sales { relationships { this <-> PaymentContext } }\nbc PaymentContext for Sales',
            assertions: (drel) => {
                expect(drel.isBidirectional).toBe(true);
            }
        },
        {
            name: 'hasPattern returns false when no patterns on either side',
            dlang: 'Domain Sales { vision: "v" }\nbc OrderContext for Sales { relationships { this -> PaymentContext } }\nbc PaymentContext for Sales',
            assertions: (drel) => {
                expect(drel.hasPattern('OHS')).toBe(false);
                expect(drel.hasPattern('CF')).toBe(false);
                expect(drel.isUpstream('left')).toBe(false);
                expect(drel.isDownstream('right')).toBe(false);
            }
        },
        {
            name: 'ContextMap relationships resolve context names',
            dlang: 'Domain Sales { vision: "v" }\nbc OrderContext for Sales\nbc PaymentContext for Sales\nContextMap ECommerceMap { contains OrderContext, PaymentContext OrderContext [OHS] -> [CF] PaymentContext }',
            assertions: (drel) => {
                expect(drel.hasPattern('OHS')).toBe(true);
                expect(drel.hasPattern('CF')).toBe(true);
            }
        },
    ])('$name', async ({ dlang, assertions }) => {
        // Arrange & Act
        const { model } = await loadModelFromText(dlang);
        const rel = findFirstRelationship(model);
        expect(rel).not.toBeUndefined();
        expect(isDirectionalRelationship(rel)).toBe(true);

        // Assert
        assertions(rel as DirectionalRelationship);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern Matching Utilities
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pattern matching utilities', () => {

    test.each([
        // Abbreviation <-> full name bidirectional matching
        ['OHS', 'OHS', true],
        ['OpenHostService', 'OHS', true],
        ['OHS', 'OpenHostService', true],
        ['SK', 'SharedKernel', true],
        ['SharedKernel', 'SK', true],
        ['CF', 'Conformist', true],
        ['ACL', 'AntiCorruptionLayer', true],
        ['PL', 'PublishedLanguage', true],
        ['P', 'Partnership', true],
        // Case-insensitive
        ['ohs', 'OHS', true],
        ['OHS', 'ohs', true],
        ['sharedkernel', 'SK', true],
        ['OPENHOSTSERVICE', 'OHS', true],
        // Non-matching patterns
        ['OHS', 'CF', false],
        ['SK', 'ACL', false],
        ['Unknown', 'OHS', false],
        // Whitespace
        ['  OHS  ', 'OHS', true],
        // Empty strings
        ['', 'OHS', false],
        ['OHS', '', false],
    ] as const)('matchesPattern($actual, $expected) => $matches', (actual, expected, matches) => {
        // Act & Assert
        expect(matchesPattern(actual, expected)).toBe(matches);
    });
});