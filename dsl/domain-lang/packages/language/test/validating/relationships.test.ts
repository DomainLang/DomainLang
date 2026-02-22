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
        test('error: Supplier on left side of <- arrow (downstream side)', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M {
                    contains ContextA, ContextB
                    ContextA [Supplier] <- ContextB
                }
            `);

            // Assert
            expectValidationErrors(document, [
                "Supplier (S) on 'ContextA' must be on the upstream side",
            ]);
        });

        test('error: Customer on right side of <- arrow (upstream side)', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M {
                    contains ContextA, ContextB
                    ContextA <- [Customer] ContextB
                }
            `);

            // Assert
            expectValidationErrors(document, [
                "Customer (C) on 'ContextB' must be on the downstream side",
            ]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // <-> arrow: bidirectional — C/S is inherently directional
    // ─────────────────────────────────────────────────────────────────────────

    describe('<-> arrow Customer/Supplier restriction', () => {
        test('error: Supplier on left side of <-> relationship', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M {
                    contains ContextA, ContextB
                    ContextA [Supplier] <-> ContextB
                }
            `);

            // Assert
            expectValidationErrors(document, [
                'Supplier [S] cannot be used on a bidirectional (<->) relationship',
            ]);
        });

        test('error: Customer on right side of <-> relationship', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M {
                    contains ContextA, ContextB
                    ContextA <-> [Customer] ContextB
                }
            `);

            // Assert
            expectValidationErrors(document, [
                'Customer [C] cannot be used on a bidirectional (<->) relationship',
            ]);
        });

        test('error: Supplier on right side of <-> relationship', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M {
                    contains ContextA, ContextB
                    ContextA <-> [Supplier] ContextB
                }
            `);

            // Assert
            expectValidationErrors(document, [
                'Supplier [S] cannot be used on a bidirectional (<->) relationship',
            ]);
        });

        test('error: Customer on left side of <-> relationship', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M {
                    contains ContextA, ContextB
                    ContextA [Customer] <-> ContextB
                }
            `);

            // Assert
            expectValidationErrors(document, [
                'Customer [C] cannot be used on a bidirectional (<->) relationship',
            ]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Pattern count: info when > 3 patterns on a side
    // ─────────────────────────────────────────────────────────────────────────

    describe('pattern count info diagnostics', () => {
        test('info: more than 3 patterns on left side', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M {
                    contains ContextA, ContextB
                    ContextA [OHS, PL, S, BBoM] -> ContextB
                }
            `);

            // Assert
            const infos = getDiagnosticsBySeverity(document, 3);
            expect(infos.length).toBeGreaterThanOrEqual(1);
            expect(infos.some(d => d.message.includes('Too many integration patterns') && d.message.includes('left'))).toBe(true);
        });

        test('info: more than 3 patterns on right side', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M {
                    contains ContextA, ContextB
                    ContextA -> [CF, ACL, C, BBoM] ContextB
                }
            `);

            // Assert
            const infos = getDiagnosticsBySeverity(document, 3);
            expect(infos.length).toBeGreaterThanOrEqual(1);
            expect(infos.some(d => d.message.includes('Too many integration patterns') && d.message.includes('right'))).toBe(true);
        });

        test('no info for exactly 3 patterns per side', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain Sales { vision: "v" }
                bc ContextA for Sales {}
                bc ContextB for Sales {}
                ContextMap M {
                    contains ContextA, ContextB
                    ContextA [OHS, PL, BBoM] -> [CF, ACL, BBoM] ContextB
                }
            `);

            // Assert
            const infos = getDiagnosticsBySeverity(document, 3);
            const patternCountInfos = infos.filter(d => d.message.includes('Too many integration patterns'));
            expect(patternCountInfos).toHaveLength(0);
        });
    });
});
