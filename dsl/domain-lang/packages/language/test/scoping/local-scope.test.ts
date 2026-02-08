/**
 * Local Scope Tests
 *
 * Tests that references within a single file resolve correctly.
 * Covers: domain, team, classification references from BoundedContext.
 *
 * Distribution target: ~20% smoke, ~80% edge/error.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, getFirstBoundedContext, getAllBoundedContexts, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Scoping: Local Scope', () => {

    // ── Smoke (~20%) ──────────────────────────────────────────────────

    test('smoke: resolves domain, team, and classification in same file', async () => {
        const document = await testServices.parse(s`
            Classification Core
            Team SalesTeam
            Domain Sales {
                description: "Sales domain"
            }

            BoundedContext OrderContext for Sales {
                description: "Order management"
                team: SalesTeam
                classification: Core
            }
        `);

        expectValidDocument(document);

        const bc = getFirstBoundedContext(document);
        expect(bc.name).toBe('OrderContext');
        expect(bc.domain?.ref?.name).toBe('Sales');
        expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam');
        expect(bc.classification?.[0]?.ref?.name).toBe('Core');
    });

    // ── Edge / Error (~80%) ───────────────────────────────────────────

    test('unresolved domain reference produces linking error', async () => {
        const document = await testServices.parse(s`
            BoundedContext OrderContext for NonExistentDomain {
                description: "Order management"
            }
        `);

        expectValidDocument(document);

        const bc = getFirstBoundedContext(document);
        expect(bc.domain?.ref).toBeUndefined();
        expect(bc.domain?.error).toBeDefined();

        const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.message.includes('NonExistentDomain'))).toBe(true);
    });

    test('unresolved team reference does not affect domain resolution', async () => {
        const document = await testServices.parse(s`
            Domain Sales {}
            BoundedContext OrderContext for Sales {
                team: GhostTeam
            }
        `);

        expectValidDocument(document);

        const bc = getFirstBoundedContext(document);
        // Domain still resolves correctly
        expect(bc.domain?.ref?.name).toBe('Sales');
        // Team does not resolve
        expect(bc.team?.[0]?.ref).toBeUndefined();
        expect(bc.team?.[0]?.error).toBeDefined();
    });

    test('unresolved classification reference does not affect domain resolution', async () => {
        const document = await testServices.parse(s`
            Domain Sales {}
            BoundedContext OrderContext for Sales {
                classification: Phantom
            }
        `);

        expectValidDocument(document);

        const bc = getFirstBoundedContext(document);
        expect(bc.domain?.ref?.name).toBe('Sales');
        expect(bc.classification?.[0]?.ref).toBeUndefined();
        expect(bc.classification?.[0]?.error).toBeDefined();
    });

    test('BC with all unresolvable references still parses', async () => {
        const document = await testServices.parse(s`
            BoundedContext Orphan for MissingDomain {
                team: MissingTeam
                classification: MissingClass
            }
        `);

        expectValidDocument(document);

        const bc = getFirstBoundedContext(document);
        expect(bc.name).toBe('Orphan');
        expect(bc.domain?.ref).toBeUndefined();
        expect(bc.team?.[0]?.ref).toBeUndefined();
        expect(bc.classification?.[0]?.ref).toBeUndefined();
    });

    test('multiple BCs can reference the same domain', async () => {
        const document = await testServices.parse(s`
            Domain Sales {}
            BoundedContext Orders for Sales
            BoundedContext Invoicing for Sales
            BoundedContext Shipping for Sales
        `);

        expectValidDocument(document);

        const bcs = getAllBoundedContexts(document);
        expect(bcs).toHaveLength(3);

        for (const bc of bcs) {
            expect(bc.domain?.ref?.name).toBe('Sales');
        }
    });

    test.each([
        {
            scenario: 'domain ref does not cross-resolve to team',
            input: s`
                Team Sales
                BoundedContext OrderContext for Sales
            `,
            check: (bc: ReturnType<typeof getFirstBoundedContext>) => {
                expect(bc.domain?.ref).toBeUndefined();
            },
        },
        {
            scenario: 'domain ref does not cross-resolve to classification',
            input: s`
                Classification Sales
                BoundedContext OrderContext for Sales
            `,
            check: (bc: ReturnType<typeof getFirstBoundedContext>) => {
                expect(bc.domain?.ref).toBeUndefined();
            },
        },
        {
            scenario: 'team ref does not cross-resolve to domain',
            input: s`
                Domain Alpha {}
                Domain Bravo {}
                BoundedContext OrderContext for Alpha {
                    team: Bravo
                }
            `,
            check: (bc: ReturnType<typeof getFirstBoundedContext>) => {
                expect(bc.domain?.ref?.name).toBe('Alpha');
                expect(bc.team?.[0]?.ref).toBeUndefined();
            },
        },
    ])('$scenario', async ({ input, check }) => {
        const document = await testServices.parse(input);
        const bc = getFirstBoundedContext(document);
        check(bc);
    });
});
