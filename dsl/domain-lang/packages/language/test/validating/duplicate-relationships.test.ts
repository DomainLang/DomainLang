/**
 * Tests for duplicate relationship validation in context maps.
 * 
 * Verifies that identical relationships within a context map
 * produce warnings, while distinct relationships are accepted.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Duplicate Relationship Validation', () => {
    test('warns on duplicate relationship in context map', async () => {
        // Arrange
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

        // Act
        const document = await testServices.parse(input);

        // Assert
        const warnings = document.diagnostics?.filter(d => d.severity === 2) ?? [];
        expect(warnings.some(w => w.message.includes('Duplicate relationship'))).toBe(true);
    });

    test('accepts distinct relationships between same contexts', async () => {
        // Arrange - different arrow directions are distinct
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap ECommerceMap {
                contains OrderContext, PaymentContext
                [OHS] OrderContext -> [CF] PaymentContext
                OrderContext <-> PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert - no duplicate warnings
        const warnings = document.diagnostics?.filter(d => d.severity === 2) ?? [];
        expect(warnings.some(w => w.message.includes('Duplicate relationship'))).toBe(false);
    });

    test('accepts different integration patterns as distinct', async () => {
        // Arrange - same endpoints but different patterns
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap ECommerceMap {
                contains OrderContext, PaymentContext
                [OHS] OrderContext -> [CF] PaymentContext
                [PL] OrderContext -> [ACL] PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert - no duplicate warnings
        const warnings = document.diagnostics?.filter(d => d.severity === 2) ?? [];
        expect(warnings.some(w => w.message.includes('Duplicate relationship'))).toBe(false);
    });

    test('no warning with single relationship', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap ECommerceMap {
                contains OrderContext, PaymentContext
                [OHS] OrderContext -> [CF] PaymentContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        const warnings = document.diagnostics?.filter(d => d.severity === 2) ?? [];
        expect(warnings.some(w => w.message.includes('Duplicate relationship'))).toBe(false);
    });
});
