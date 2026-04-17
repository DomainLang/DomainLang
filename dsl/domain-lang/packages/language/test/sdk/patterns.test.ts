/**
 * Tests for DomainLang integration pattern utilities.
 *
 * Verifies the pattern classification helpers, abbreviation mappings,
 * and the matchesPattern() disambiguation function used across the SDK.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectParsedDocument, s } from '../test-helpers.js';
import { fromDocument } from '../../src/sdk/query.js';
import { isSymmetricRelationship, isSharedKernel, isPartnership, isSeparateWays } from '../../src/generated/ast.js';
import type { SidePattern, SymmetricPattern } from '../../src/generated/ast.js';
import {
    matchesPattern,
    isUpstreamPattern,
    isDownstreamPattern,
    isMutualPattern,
    isUpstreamSidePattern,
    isDownstreamSidePattern,
    isBBoMSidePattern,
    getPatternAbbreviation,
} from '../../src/sdk/patterns.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ═══════════════════════════════════════════════════════════════════════════════
// matchesPattern
// ═══════════════════════════════════════════════════════════════════════════════

describe('matchesPattern', () => {

    // ═ Smoke: case handling and whitespace
    interface MatchesPatternCase {
        actual: string;
        expected: string;
        matches: boolean;
    }

    test.each<MatchesPatternCase>([
        // Happy path: abbreviation, full name, case-insensitive
        { actual: 'OHS', expected: 'OHS', matches: true },
        { actual: 'OpenHostService', expected: 'OHS', matches: true },
        { actual: 'ohs', expected: 'OHS', matches: true },
        { actual: 'OPENHOSTSERVICE', expected: 'OHS', matches: true },
        // Whitespace handling
        { actual: '  OHS  ', expected: 'OHS', matches: true },
        // Cross-category rejection
        { actual: 'OHS', expected: 'CF', matches: false },
        { actual: 'SK', expected: 'P', matches: false },
        { actual: 'Unknown', expected: 'OHS', matches: false },
        // Fallback: case-insensitive direct compare for unknown types
        { actual: 'foobar', expected: 'FooBar', matches: true },
        { actual: 'foobar', expected: 'baz', matches: false },
    ])('matchesPattern("$actual", "$expected") => $matches', ({ actual, expected, matches }) => {
        // Act & Assert
        expect(matchesPattern(actual, expected)).toBe(matches);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// String-based classification helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pattern classification: isUpstreamPattern, isDownstreamPattern, isMutualPattern', () => {

    interface ClassificationCase {
        fn: (pattern: string) => boolean;
        fnName: string;
        pattern: string;
        expected: boolean;
    }

    test.each<ClassificationCase>([
        // Upstream patterns
        { fn: isUpstreamPattern, fnName: 'isUpstreamPattern', pattern: 'OHS', expected: true },
        { fn: isUpstreamPattern, fnName: 'isUpstreamPattern', pattern: 'Supplier', expected: true },
        { fn: isUpstreamPattern, fnName: 'isUpstreamPattern', pattern: 'CF', expected: false },
        { fn: isUpstreamPattern, fnName: 'isUpstreamPattern', pattern: 'SK', expected: false },
        // Downstream patterns
        { fn: isDownstreamPattern, fnName: 'isDownstreamPattern', pattern: 'CF', expected: true },
        { fn: isDownstreamPattern, fnName: 'isDownstreamPattern', pattern: 'AntiCorruptionLayer', expected: true },
        { fn: isDownstreamPattern, fnName: 'isDownstreamPattern', pattern: 'OHS', expected: false },
        { fn: isDownstreamPattern, fnName: 'isDownstreamPattern', pattern: 'P', expected: false },
        // Mutual patterns
        { fn: isMutualPattern, fnName: 'isMutualPattern', pattern: 'SK', expected: true },
        { fn: isMutualPattern, fnName: 'isMutualPattern', pattern: 'SeparateWays', expected: true },
        { fn: isMutualPattern, fnName: 'isMutualPattern', pattern: 'OHS', expected: false },
        { fn: isMutualPattern, fnName: 'isMutualPattern', pattern: 'C', expected: false },
    ])('$fnName("$pattern") => $expected', ({ fn, pattern, expected }) => {
        // Act & Assert
        expect(fn(pattern)).toBe(expected);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AST node–based classification helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe('AST-based pattern helpers: isUpstreamSidePattern, isDownstreamSidePattern, isBBoMSidePattern', () => {

    async function parseSidePatterns(leftPatterns: string, rightPatterns: string): Promise<{ left: readonly SidePattern[]; right: readonly SidePattern[] }> {
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc Left for Sales {}
            bc Right for Sales {}
            ContextMap M {
                contains Left, Right
                Left ${leftPatterns} -> ${rightPatterns} Right
            }
        `);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const rel = query.relationships().first();
        if (!rel) throw new Error('Expected a relationship');
        if (rel.type !== 'directional') throw new Error('Expected directional');
        return { left: rel.left.patterns, right: rel.right.patterns };
    }

    test('upstream/downstream/BBoM patterns are uniquely recognised', async () => {
        // Arrange & Act
        const upstream = await parseSidePatterns('[OHS]', '');
        const downstream = await parseSidePatterns('', '[ACL]');
        const bbom = await parseSidePatterns('[BBoM]', '');

        // Assert
        expect(isUpstreamSidePattern(upstream.left[0])).toBe(true);
        expect(isDownstreamSidePattern(upstream.left[0])).toBe(false);
        expect(isBBoMSidePattern(upstream.left[0])).toBe(false);

        expect(isDownstreamSidePattern(downstream.right[0])).toBe(true);
        expect(isUpstreamSidePattern(downstream.right[0])).toBe(false);

        expect(isBBoMSidePattern(bbom.left[0])).toBe(true);
        expect(isUpstreamSidePattern(bbom.left[0])).toBe(false);
        expect(isDownstreamSidePattern(bbom.left[0])).toBe(false);
    });
});

describe('Generated guards: isSharedKernel, isPartnership, isSeparateWays', () => {

    async function parseSymmetricPattern(pattern: string): Promise<SymmetricPattern> {
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc Left for Sales {}
            bc Right for Sales {}
            ContextMap M {
                contains Left, Right
                Left [${pattern}] Right
            }
        `);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const rel = query.relationships().first();
        if (!rel) throw new Error('Expected a relationship');
        if (rel.type !== 'symmetric') throw new Error('Expected symmetric');
        const astNode = rel.astNode;
        if (!isSymmetricRelationship(astNode)) throw new Error('Expected SymmetricRelationship AST node');
        if (!astNode.pattern) throw new Error('Expected symmetric pattern to be set');
        return astNode.pattern;
    }

    test('each symmetric pattern type is uniquely recognised', async () => {
        // Arrange
        const sk = await parseSymmetricPattern('SK');
        const p = await parseSymmetricPattern('P');
        const sw = await parseSymmetricPattern('SW');

        // Act & Assert
        expect(isSharedKernel(sk)).toBe(true);
        expect(isPartnership(sk)).toBe(false);
        expect(isSeparateWays(sk)).toBe(false);

        expect(isPartnership(p)).toBe(true);
        expect(isSharedKernel(p)).toBe(false);
        expect(isSeparateWays(p)).toBe(false);

        expect(isSeparateWays(sw)).toBe(true);
        expect(isSharedKernel(sw)).toBe(false);
        expect(isPartnership(sw)).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getPatternAbbreviation
// ═══════════════════════════════════════════════════════════════════════════════

describe('getPatternAbbreviation', () => {

    interface AbbreviationCase {
        fullName: string;
        expectedAbbr: string;
    }

    test.each<AbbreviationCase>([
        { fullName: 'OpenHostService', expectedAbbr: 'OHS' },
        { fullName: 'AntiCorruptionLayer', expectedAbbr: 'ACL' },
        { fullName: 'SeparateWays', expectedAbbr: 'SW' },
        { fullName: 'Supplier', expectedAbbr: 'S' },
        { fullName: 'Customer', expectedAbbr: 'C' },
        { fullName: 'Partnership', expectedAbbr: 'P' },
        { fullName: 'SharedKernel', expectedAbbr: 'SK' },
        { fullName: 'Conformist', expectedAbbr: 'CF' },
        { fullName: 'PublishedLanguage', expectedAbbr: 'PL' },
        // Unknown patterns return as-is
        { fullName: 'OrphanPattern', expectedAbbr: 'OrphanPattern' },
    ])('abbreviates $fullName to $expectedAbbr', ({ fullName, expectedAbbr }) => {
        // Act & Assert
        expect(getPatternAbbreviation(fullName)).toBe(expectedAbbr);
    });
});