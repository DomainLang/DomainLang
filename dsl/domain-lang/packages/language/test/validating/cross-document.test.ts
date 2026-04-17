/**
 * Cross-document integration tests.
 *
 * Tests workspace-level scenarios that span multiple documents,
 * including FQN uniqueness across files and namespace interactions.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectParsedDocument, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Cross-document integration', () => {
    describe('FQN uniqueness within single document', () => {
        test.each([
            {
                construct: 'domain',
                duplicateName: 'Sales',
                input: s`
                    Domain Sales { vision: "Sales" }
                    Domain Sales { vision: "Also Sales" }
                `,
            },
            {
                construct: 'bounded context',
                duplicateName: 'OrderContext',
                input: s`
                    Domain Sales { vision: "Sales" }
                    bc OrderContext for Sales { description: "First" }
                    bc OrderContext for Sales { description: "Duplicate" }
                `,
            },
            {
                construct: 'team',
                duplicateName: 'AlphaTeam',
                input: s`
                    Team AlphaTeam
                    Team AlphaTeam
                `,
            },
            {
                construct: 'classification',
                duplicateName: 'Core',
                input: s`
                    Classification Core
                    Classification Core
                `,
            },
            {
                construct: 'namespace',
                duplicateName: 'TestNamespace',
                input: s`
                    Namespace TestNamespace { Domain Domain1 {} }
                    Namespace TestNamespace { Domain Domain2 {} }
                `,
            },
        ])('detects duplicate $construct names in same document', async ({ input, duplicateName }) => {
            // Arrange & Act
            const document = await testServices.parse(input);

            // Assert — exactly one duplicate error naming the specific entity (guards against
            // "any duplicate message for any symbol" false positives)
            const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
            const duplicateErrors = errors.filter(e => e.message.includes('Duplicate element'));
            expect(duplicateErrors).toHaveLength(1);
            expect(duplicateErrors[0].message).toContain(`'${duplicateName}'`);
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
            expectParsedDocument(document);
        });
    });
});
