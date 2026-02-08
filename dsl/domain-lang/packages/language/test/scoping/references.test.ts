/**
 * Reference Resolution Tests
 *
 * Tests for ContextMap relationship references and domain hierarchy parent
 * references. Covers both successful resolution and error paths.
 *
 * Distribution target: ~20% smoke, ~80% edge/error.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, s } from '../test-helpers.js';
import type { ContextMap } from '../../src/generated/ast.js';
import { isContextMap, isDomain } from '../../src/generated/ast.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Scoping: References', () => {

    // ── Smoke (~20%) ──────────────────────────────────────────────────

    test('smoke: resolves BC references in relationship and domain hierarchy', async () => {
        const document = await testServices.parse(s`
            Domain Commerce {
                description: "Main commerce domain"
            }

            Domain Sales in Commerce {
                description: "Sales subdomain"
            }

            BoundedContext OrderContext for Sales
            BoundedContext PaymentContext for Sales

            ContextMap SalesMap {
                contains OrderContext, PaymentContext
                [OHS] OrderContext -> [CF] PaymentContext : CustomerSupplier
            }
        `);

        expectValidDocument(document);

        // Verify domain hierarchy
        const salesDomain = document.parseResult.value.children
            .filter(isDomain)
            .find(domain => domain.name === 'Sales');
        expect(salesDomain?.parent?.ref?.name).toBe('Commerce');

        // Verify ContextMap relationship resolution
        const contextMap = document.parseResult.value.children.find(isContextMap) as ContextMap;
        expect(contextMap.relationships).toHaveLength(1);

        const relationship = contextMap.relationships[0];
        expect(relationship.left.link?.ref?.name).toBe('OrderContext');
        expect(relationship.right.link?.ref?.name).toBe('PaymentContext');
        expect(relationship.type).toBe('CustomerSupplier');
    });

    // ── Edge / Error (~80%) ───────────────────────────────────────────

    test.each([
        {
            side: 'left',
            input: s`
                Domain Sales {}
                BoundedContext PaymentContext for Sales

                ContextMap BadMap {
                    contains PaymentContext
                    GhostContext -> PaymentContext : CustomerSupplier
                }
            `,
            ghostSide: 'left' as const,
            validName: 'PaymentContext',
        },
        {
            side: 'right',
            input: s`
                Domain Sales {}
                BoundedContext OrderContext for Sales

                ContextMap BadMap {
                    contains OrderContext
                    OrderContext -> GhostContext : CustomerSupplier
                }
            `,
            ghostSide: 'right' as const,
            validName: 'OrderContext',
        },
    ])('relationship with non-existent $side BC does not resolve', async ({ input, ghostSide, validName }) => {
        const document = await testServices.parse(input);

        const contextMap = document.parseResult.value.children.find(isContextMap) as ContextMap;
        expect(contextMap).toBeDefined();
        expect(contextMap.relationships).toHaveLength(1);

        const rel = contextMap.relationships[0];
        if (ghostSide === 'left') {
            expect(rel.left.link?.ref).toBeUndefined();
            expect(rel.right.link?.ref?.name).toBe(validName);
        } else {
            expect(rel.left.link?.ref?.name).toBe(validName);
            expect(rel.right.link?.ref).toBeUndefined();
        }
    });

    test('unresolved parent domain reference', async () => {
        const document = await testServices.parse(s`
            Domain Sales in NonExistentParent {
                description: "Orphan subdomain"
            }
        `);

        expectValidDocument(document);

        const domain = document.parseResult.value.children.find(isDomain);
        expect(domain).toBeDefined();
        if (isDomain(domain)) {
            expect(domain.name).toBe('Sales');
            expect(domain.parent?.ref).toBeUndefined();
            expect(domain.parent?.error).toBeDefined();
        }
    });

    // Deep hierarchy resolution covered by linking.test.ts "parent domain references resolve through multi-level hierarchy"

    test.each([
        {
            arrowType: '<->',
            relType: 'Partnership',
        },
        {
            arrowType: '><',
            relType: 'SeparateWays',
        },
    ])('$arrowType relationship arrow resolves both sides', async ({ arrowType, relType }) => {
        const document = await testServices.parse(s`
            Domain Sales {}
            BoundedContext OrderContext for Sales
            BoundedContext PaymentContext for Sales

            ContextMap TestMap {
                contains OrderContext, PaymentContext
                OrderContext ${arrowType} PaymentContext : ${relType}
            }
        `);

        expectValidDocument(document);

        const contextMap = document.parseResult.value.children.find(isContextMap) as ContextMap;
        expect(contextMap.relationships).toHaveLength(1);

        const rel = contextMap.relationships[0];
        expect(rel.arrow).toBe(arrowType);
        expect(rel.type).toBe(relType);
        expect(rel.left.link?.ref?.name).toBe('OrderContext');
        expect(rel.right.link?.ref?.name).toBe('PaymentContext');
    });

    test('multiple relationships in one ContextMap all resolve', async () => {
        const document = await testServices.parse(s`
            Domain Sales {}
            BoundedContext A for Sales
            BoundedContext B for Sales
            BoundedContext C for Sales

            ContextMap MultiRelMap {
                contains A, B, C
                [OHS] A -> [CF] B : CustomerSupplier
                B <-> C : Partnership
            }
        `);

        expectValidDocument(document);

        const contextMap = document.parseResult.value.children.find(isContextMap) as ContextMap;
        expect(contextMap.relationships).toHaveLength(2);

        expect(contextMap.relationships[0].left.link?.ref?.name).toBe('A');
        expect(contextMap.relationships[0].right.link?.ref?.name).toBe('B');
        expect(contextMap.relationships[0].type).toBe('CustomerSupplier');

        expect(contextMap.relationships[1].left.link?.ref?.name).toBe('B');
        expect(contextMap.relationships[1].right.link?.ref?.name).toBe('C');
        expect(contextMap.relationships[1].type).toBe('Partnership');
    });

    // Integration patterns resolution covered by linking.test.ts "ContextMap Linking"
});
