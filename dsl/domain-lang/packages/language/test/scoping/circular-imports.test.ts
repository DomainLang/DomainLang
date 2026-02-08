/**
 * Circular Reference Handling Tests
 *
 * Tests that circular domain hierarchies and self-referencing domains
 * do not crash the parser or linker.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, s } from '../test-helpers.js';
import { isDomain } from '../../src/generated/ast.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Circular Reference Handling', () => {

    test.each([
        {
            label: '3-way circular chain',
            input: 'Domain A in B {}\nDomain B in C {}\nDomain C in A {}',
            expectedPairs: [['A', 'B'], ['B', 'C'], ['C', 'A']],
        },
        {
            label: 'mutual reference',
            input: 'Domain Parent in Child {}\nDomain Child in Parent {}',
            expectedPairs: [['Parent', 'Child'], ['Child', 'Parent']],
        },
        {
            label: '5-way circular chain',
            input: 'Domain D1 in D5 {}\nDomain D2 in D1 {}\nDomain D3 in D2 {}\nDomain D4 in D3 {}\nDomain D5 in D4 {}',
            expectedPairs: [['D1', 'D5'], ['D2', 'D1'], ['D3', 'D2'], ['D4', 'D3'], ['D5', 'D4']],
        },
    ])('does not crash on $label', async ({ input, expectedPairs }) => {
        const document = await testServices.parse(input);
        expectValidDocument(document);
        const domains = document.parseResult.value.children.filter(isDomain);
        expect(domains).toHaveLength(expectedPairs.length);

        for (const [name, parentName] of expectedPairs) {
            const domain = domains.find(d => d.name === name);
            expect(domain?.parent?.ref?.name).toBe(parentName);
        }
    });

    test('handles self-referencing domain', async () => {
        // Arrange
        const input = s`
            Domain Self in Self {}
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert - should parse without crashing
        expectValidDocument(document);
        const domains = document.parseResult.value.children.filter(isDomain);
        expect(domains).toHaveLength(1);
        expect(domains[0].name).toBe('Self');
    });

    // "two domains referencing each other" and "long circular chain" covered by test.each above
});
