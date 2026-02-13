/**
 * Multi-Target Reference Tests
 *
 * Tests for ContextMap `contains` clauses where a name like "CustomerManagement"
 * maps to multiple BoundedContexts (MultiReference resolution).
 *
 * Distribution target: ~20% smoke, ~80% edge/error.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, s } from '../test-helpers.js';
import type { ContextMap } from '../../src/generated/ast.js';
import { isContextMap } from '../../src/generated/ast.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

/**
 * Helper to extract the first ContextMap from a parsed document.
 */
function getFirstContextMap(document: { parseResult: { value: { children: unknown[] } } }): ContextMap {
    const cm = document.parseResult.value.children.find(isContextMap);
    expect(cm).not.toBeUndefined();
    return cm as ContextMap;
}

describe('Scoping: Multi-Target References', () => {

    // Smoke and core contains-clause tests (same-named BCs, non-existent refs,
    // mixed existing/missing, unique names) covered by multi-reference-resolution.test.ts

    test('relationship references to ambiguous BC names resolve to first match', async () => {
        // Arrange & Act
        const document = await testServices.parse(s`
            Domain A {}
            Domain B {}
            BoundedContext Dup for A
            BoundedContext Dup for B
            BoundedContext Unique for A

            ContextMap AmbiguousMap {
                contains Dup, Unique
                Dup -> Unique : CustomerSupplier
            }
        `);

        // Assert
        expectValidDocument(document);

        const contextMap = getFirstContextMap(document);
        expect(contextMap.relationships).toHaveLength(1);

        const rel = contextMap.relationships[0];
        // Relationship link should resolve to some BC named Dup
        expect(rel.left.link?.ref?.name).toBe('Dup');
        expect(rel.right.link?.ref?.name).toBe('Unique');
    });
});
