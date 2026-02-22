/**
 * Tests for DomainLang integration pattern utilities.
 *
 * Verifies the pattern classification helpers, abbreviation mappings,
 * and the matchesPattern() disambiguation function used across the SDK.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing
import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, s } from '../test-helpers.js';
import { fromDocument } from '../../src/sdk/query.js';
import { isSymmetricRelationship } from '../../src/generated/ast.js';
import {
    matchesPattern,
    isUpstreamPattern,
    isDownstreamPattern,
    isMutualPattern,
    isUpstreamSidePattern,
    isDownstreamSidePattern,
    isBBoMSidePattern,
    getPatternAbbreviation,
    isSharedKernelPattern,
    isPartnershipPattern,
    isSeparateWaysPattern,
} from '../../src/sdk/patterns.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ─────────────────────────────────────────────────────────────────────────────
// matchesPattern
// ─────────────────────────────────────────────────────────────────────────────

describe('matchesPattern', () => {
    test('matches abbreviation, full name, and case-insensitively', () => {
        expect(matchesPattern('OHS', 'OHS')).toBe(true);
        expect(matchesPattern('OpenHostService', 'OHS')).toBe(true);
        expect(matchesPattern('ohs', 'OHS')).toBe(true);
    });

    test('trims whitespace before matching', () => {
        expect(matchesPattern('  OHS  ', 'OHS')).toBe(true);
    });

    test('rejects patterns from different categories', () => {
        expect(matchesPattern('OHS', 'CF')).toBe(false);
        expect(matchesPattern('SK', 'P')).toBe(false);
        expect(matchesPattern('Unknown', 'OHS')).toBe(false);
    });

    test('falls back to case-insensitive direct compare for unknown expected', () => {
        expect(matchesPattern('foobar', 'FooBar')).toBe(true);
        expect(matchesPattern('foobar', 'baz')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// String-based classification helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('isUpstreamPattern', () => {
    test('returns true for an upstream abbreviation and full name', () => {
        expect(isUpstreamPattern('OHS')).toBe(true);
        expect(isUpstreamPattern('Supplier')).toBe(true);
    });

    test('returns false for downstream and symmetric patterns', () => {
        expect(isUpstreamPattern('CF')).toBe(false);
        expect(isUpstreamPattern('SK')).toBe(false);
    });
});

describe('isDownstreamPattern', () => {
    test('returns true for a downstream abbreviation and full name', () => {
        expect(isDownstreamPattern('CF')).toBe(true);
        expect(isDownstreamPattern('AntiCorruptionLayer')).toBe(true);
    });

    test('returns false for upstream and symmetric patterns', () => {
        expect(isDownstreamPattern('OHS')).toBe(false);
        expect(isDownstreamPattern('P')).toBe(false);
    });
});

describe('isMutualPattern', () => {
    test('returns true for symmetric abbreviations and full names', () => {
        expect(isMutualPattern('SK')).toBe(true);
        expect(isMutualPattern('SeparateWays')).toBe(true);
    });

    test('returns false for directional patterns', () => {
        expect(isMutualPattern('OHS')).toBe(false);
        expect(isMutualPattern('C')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AST node–based classification helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('isUpstreamSidePattern / isDownstreamSidePattern / isBBoMSidePattern', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async function parseSidePatterns(leftPatterns: string, rightPatterns: string) {
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc Left for Sales {}
            bc Right for Sales {}
            ContextMap M {
                contains Left, Right
                Left ${leftPatterns} -> ${rightPatterns} Right
            }
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const rel = query.relationships().first()!;
        if (rel.type !== 'directional') throw new Error('Expected directional');
        return { left: rel.left.patterns, right: rel.right.patterns };
    }

    test('upstream side pattern (OHS) is recognised, not downstream, not BBoM', async () => {
        // Arrange
        const { left } = await parseSidePatterns('[OHS]', '[ACL]');
        // Act & Assert
        expect(isUpstreamSidePattern(left[0])).toBe(true);
        expect(isDownstreamSidePattern(left[0])).toBe(false);
        expect(isBBoMSidePattern(left[0])).toBe(false);
    });

    test('downstream side pattern (ACL) is recognised, not upstream', async () => {
        // Arrange
        const { right } = await parseSidePatterns('[OHS]', '[ACL]');
        // Act & Assert
        expect(isDownstreamSidePattern(right[0])).toBe(true);
        expect(isUpstreamSidePattern(right[0])).toBe(false);
    });

    test('BBoM is neither upstream nor downstream', async () => {
        // Arrange
        const { left } = await parseSidePatterns('[BBoM]', '');
        // Act & Assert
        expect(isUpstreamSidePattern(left[0])).toBe(false);
        expect(isDownstreamSidePattern(left[0])).toBe(false);
        expect(isBBoMSidePattern(left[0])).toBe(true);
    });
});

describe('isSharedKernelPattern / isPartnershipPattern / isSeparateWaysPattern', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async function parseSymmetricPattern(pattern: string) {
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc Left for Sales {}
            bc Right for Sales {}
            ContextMap M {
                contains Left, Right
                Left [${pattern}] Right
            }
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const rel = query.relationships().first()!;
        if (rel.type !== 'symmetric') throw new Error('Expected symmetric');
        const astNode = rel.astNode;
        if (!isSymmetricRelationship(astNode)) throw new Error('Expected SymmetricRelationship AST node');
        return astNode.pattern;
    }

    test('each symmetric pattern type is uniquely recognised', async () => {
        // Arrange
        const sk = (await parseSymmetricPattern('SK'))!;
        const p = (await parseSymmetricPattern('P'))!;
        const sw = (await parseSymmetricPattern('SW'))!;

        // Assert — each guard is true for its own type and false for others
        expect(isSharedKernelPattern(sk)).toBe(true);
        expect(isPartnershipPattern(sk)).toBe(false);

        expect(isPartnershipPattern(p)).toBe(true);
        expect(isSharedKernelPattern(p)).toBe(false);

        expect(isSeparateWaysPattern(sw)).toBe(true);
        expect(isPartnershipPattern(sw)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getPatternAbbreviation
// ─────────────────────────────────────────────────────────────────────────────

describe('getPatternAbbreviation', () => {
    test('abbreviates representative pattern type names', () => {
        expect(getPatternAbbreviation('OpenHostService')).toBe('OHS');
        expect(getPatternAbbreviation('AntiCorruptionLayer')).toBe('ACL');
        expect(getPatternAbbreviation('SeparateWays')).toBe('SW');
    });

    test('returns the input unchanged for unknown type names', () => {
        expect(getPatternAbbreviation('OrphanPattern')).toBe('OrphanPattern');
    });
});


