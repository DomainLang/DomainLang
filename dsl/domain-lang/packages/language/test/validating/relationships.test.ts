/**
 * Tests for relationship validation rules.
 *
 * Covers Customer/Supplier side placement errors for all arrow directions,
 * bidirectional (<->) C/S restrictions, and pattern count info diagnostics.
 * The ->-arrow happy path and OHS/CF/ACL wrong-side cases are in comprehensive-validation.test.ts.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import {
    setupTestSuite,
    expectValidationErrors,
    getDiagnosticsBySeverity,
    s,
} from '../test-helpers.js';

describe('Relationship Validation', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // <- arrow: right is upstream, left is downstream
    // ─────────────────────────────────────────────────────────────────────────

    describe('<- arrow Customer/Supplier placement', () => {
        test.each([
            {
                pattern: 'Supplier',
                patternShort: 'S',
                position: 'left (downstream)',
                input: s`
                    Domain Sales { vision: "v" }
                    bc ContextA for Sales {}
                    bc ContextB for Sales {}
                    ContextMap M {
                        contains ContextA, ContextB
                        ContextA [Supplier] <- ContextB
                    }
                `,
                expectedMessage: "Supplier (S) on 'ContextA' must be on the upstream side"
            },
            {
                pattern: 'Customer',
                patternShort: 'C',
                position: 'right (upstream)',
                input: s`
                    Domain Sales { vision: "v" }
                    bc ContextA for Sales {}
                    bc ContextB for Sales {}
                    ContextMap M {
                        contains ContextA, ContextB
                        ContextA <- [Customer] ContextB
                    }
                `,
                expectedMessage: "Customer (C) on 'ContextB' must be on the downstream side"
            }
        ])('error: $pattern on $position side of <- arrow', async ({ input, expectedMessage }) => {
            // Arrange & Act
            const document = await testServices.parse(input);

            // Assert
            expectValidationErrors(document, [expectedMessage]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // <-> arrow: bidirectional — C/S is inherently directional
    // ─────────────────────────────────────────────────────────────────────────

    describe('<-> arrow Customer/Supplier restriction', () => {
        test.each([
            {
                pattern: 'Supplier',
                patternShort: 'S',
                leftInput: s`
                    Domain Sales { vision: "v" }
                    bc ContextA for Sales {}
                    bc ContextB for Sales {}
                    ContextMap M {
                        contains ContextA, ContextB
                        ContextA [Supplier] <-> ContextB
                    }
                `,
                rightInput: s`
                    Domain Sales { vision: "v" }
                    bc ContextA for Sales {}
                    bc ContextB for Sales {}
                    ContextMap M {
                        contains ContextA, ContextB
                        ContextA <-> [Supplier] ContextB
                    }
                `,
                expectedMessage: 'Supplier [S] cannot be used on a bidirectional (<->) relationship'
            },
            {
                pattern: 'Customer',
                patternShort: 'C',
                leftInput: s`
                    Domain Sales { vision: "v" }
                    bc ContextA for Sales {}
                    bc ContextB for Sales {}
                    ContextMap M {
                        contains ContextA, ContextB
                        ContextA [Customer] <-> ContextB
                    }
                `,
                rightInput: s`
                    Domain Sales { vision: "v" }
                    bc ContextA for Sales {}
                    bc ContextB for Sales {}
                    ContextMap M {
                        contains ContextA, ContextB
                        ContextA <-> [Customer] ContextB
                    }
                `,
                expectedMessage: 'Customer [C] cannot be used on a bidirectional (<->) relationship'
            }
        ])('error: $pattern on either side of <-> relationship', async ({ leftInput, rightInput, expectedMessage }) => {
            // Arrange & Act (test both left and right placement)
            const leftDoc = await testServices.parse(leftInput);
            const rightDoc = await testServices.parse(rightInput);

            // Assert
            expectValidationErrors(leftDoc, [expectedMessage]);
            expectValidationErrors(rightDoc, [expectedMessage]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Pattern count: info when > 3 patterns on a side
    // ─────────────────────────────────────────────────────────────────────────

    describe('pattern count info diagnostics', () => {
        test.each([
            {
                scenario: 'exactly 3 patterns (threshold boundary)',
                patternCount: 3,
                patterns: 'OHS, PL, S',
                expectsInfo: false
            },
            {
                scenario: '4 patterns on left side (exceeds threshold)',
                patternCount: 4,
                patterns: 'OHS, PL, S, BBoM',
                expectsInfo: true,
                side: 'left'
            },
            {
                scenario: '4 patterns on right side (exceeds threshold)',
                patternCount: 4,
                patterns: 'CF, ACL, C, BBoM',
                expectsInfo: true,
                side: 'right',
                isRightSide: true
            }
        ])('$scenario', async ({ patterns, expectsInfo, side, isRightSide }) => {
            // Arrange & Act
            const input = s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M {
                    contains ContextA, ContextB
                    ${isRightSide ? `ContextA -> [${patterns}] ContextB` : `ContextA [${patterns}] -> ContextB`}
                }
            `;
            const document = await testServices.parse(input);

            // Assert
            const infos = getDiagnosticsBySeverity(document, 3);
            if (expectsInfo) {
                if (side === undefined) throw new Error('Expected side to be defined when expectsInfo is true');
                expect(infos.length).toBeGreaterThanOrEqual(1);
                expect(infos.some(d => 
                    d.message.includes('Too many integration patterns') && 
                    d.message.includes(side)
                )).toBe(true);
            } else {
                expect(infos.some(d => d.message.includes('Too many integration patterns'))).toBe(false);
            }
        });
    });
});