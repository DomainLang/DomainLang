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
        test.each([
            {
                construct: 'domain',
                input: s`
                    Domain Sales { vision: "Sales" }
                    Domain Sales { vision: "Also Sales" }
                `,
            },
            {
                construct: 'bounded context',
                input: s`
                    Domain Sales { vision: "Sales" }
                    bc OrderContext for Sales { description: "First" }
                    bc OrderContext for Sales { description: "Duplicate" }
                `,
            },
            {
                construct: 'team',
                input: s`
                    Team AlphaTeam
                    Team AlphaTeam
                `,
            },
        ])('detects duplicate $construct names in same document', async ({ input }) => {
            // Arrange & Act
            const document = await testServices.parse(input);

            // Assert
            const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
            expect(errors.length).toBeGreaterThanOrEqual(1);
            expect(errors.some(e => e.message.includes('already defined') || e.message.includes('Duplicate'))).toBe(true);
        });
    });

    describe('Namespace isolation', () => {
        test('same name in different namespaces does not conflict', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Namespace com.sales { Domain Orders { vision: "Sales orders" } }
                Namespace com.billing { Domain Orders { vision: "Billing orders" } }
            `);

            // Assert
            expectValidDocument(document);
        });
    });
});
