/**
 * Tests for duplicate relationship validation in context maps.
 *
 * Verifies that identical relationships within a context map
 * produce warnings, while distinct relationships are accepted.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Duplicate Relationship Validation', () => {
    test('warns on duplicate relationship in context map', async () => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap ECommerceMap {
                contains OrderContext, PaymentContext
                [OHS] OrderContext -> [CF] PaymentContext
                [OHS] OrderContext -> [CF] PaymentContext
            }
        `;

        const document = await testServices.parse(input);

        const warnings = document.diagnostics?.filter(d => d.severity === 2) ?? [];
        const duplicateWarnings = warnings.filter(w => w.message.includes('Duplicate relationship'));
        expect(duplicateWarnings.length).toBeGreaterThanOrEqual(1);
    });

    test.each([
        {
            scenario: 'different directions',
            relationships: s`
                [OHS] OrderContext -> [CF] PaymentContext
                OrderContext <-> PaymentContext
            `,
        },
        {
            scenario: 'different integration patterns',
            relationships: s`
                [OHS] OrderContext -> [CF] PaymentContext
                [PL] OrderContext -> [ACL] PaymentContext
            `,
        },
    ])('accepts distinct relationships ($scenario)', async ({ relationships }) => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap ECommerceMap {
                contains OrderContext, PaymentContext
                ${relationships}
            }
        `;

        const document = await testServices.parse(input);

        const warnings = document.diagnostics?.filter(d => d.severity === 2) ?? [];
        const duplicateWarnings = warnings.filter(w => w.message.includes('Duplicate relationship'));
        expect(duplicateWarnings).toHaveLength(0);
    });

    test('duplicate warning message includes context names', async () => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap ECommerceMap {
                contains OrderContext, PaymentContext
                OrderContext -> PaymentContext
                OrderContext -> PaymentContext
            }
        `;

        const document = await testServices.parse(input);

        const warnings = document.diagnostics?.filter(d => d.severity === 2) ?? [];
        const duplicateWarning = warnings.find(w => w.message.includes('Duplicate relationship'));
        expect(duplicateWarning).not.toBeUndefined();
        expect(duplicateWarning!.message).toContain('OrderContext');
        expect(duplicateWarning!.message).toContain('PaymentContext');
    });
});
