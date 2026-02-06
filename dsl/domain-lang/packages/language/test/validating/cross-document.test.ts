/**
 * Cross-document integration tests.
 * 
 * Tests workspace-level scenarios that span multiple documents,
 * including FQN uniqueness across files and namespace interactions.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Cross-document integration', () => {
    describe('FQN uniqueness within single document', () => {
        test('detects duplicate domain names in same document', async () => {
            // Arrange
            const input = s`
                Domain Sales { vision: "Sales" }
                Domain Sales { vision: "Also Sales" }
            `;

            // Act
            const document = await testServices.parse(input);

            // Assert
            const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
            expect(errors.some(e => e.message.includes('already defined'))).toBe(true);
        });

        test('detects duplicate bounded context names in same document', async () => {
            // Arrange
            const input = s`
                Domain Sales { vision: "Sales" }
                bc OrderContext for Sales { description: "First" }
                bc OrderContext for Sales { description: "Duplicate" }
            `;

            // Act
            const document = await testServices.parse(input);

            // Assert
            const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
            expect(errors.some(e => e.message.includes('already defined'))).toBe(true);
        });
    });

    describe('Namespace isolation', () => {
        test('same name in different namespaces does not conflict', async () => {
            // Arrange - use single-line namespace blocks to avoid parser issues
            const input = s`
                Namespace com.sales { Domain Orders { vision: "Sales orders" } }
                Namespace com.billing { Domain Orders { vision: "Billing orders" } }
            `;

            // Act
            const document = await testServices.parse(input);

            // Assert - namespaces create different FQNs, so no conflict
            expectValidDocument(document);
        });
    });

    describe('Complex linking scenarios', () => {
        test('bounded context referencing domain in same namespace', async () => {
            // Arrange - single-line namespace block
            const input = s`
                Namespace com.example { Domain Sales { vision: "Sales" } bc OrderContext for Sales { description: "Orders" } }
            `;

            // Act
            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
        });

        test('context map containing contexts from different domains', async () => {
            // Arrange
            const input = s`
                Domain Sales { vision: "Sales" }
                Domain Billing { vision: "Billing" }
                bc OrderContext for Sales { description: "Orders" }
                bc PaymentContext for Billing { description: "Payments" }

                ContextMap ECommerceMap {
                    contains OrderContext, PaymentContext
                    OrderContext -> PaymentContext
                }
            `;

            // Act
            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
        });

        test('relationship using this reference inside bounded context', async () => {
            // Arrange
            const input = s`
                Domain Sales { vision: "Sales" }
                bc PaymentContext for Sales { description: "Payments" }
                bc OrderContext for Sales {
                    description: "Order processing"
                    relationships {
                        this -> PaymentContext
                    }
                }
            `;

            // Act
            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
        });
    });
});
