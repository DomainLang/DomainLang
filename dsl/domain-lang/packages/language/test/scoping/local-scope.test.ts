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
import { setupTestSuite, expectParsedDocument, getFirstBoundedContext, getAllBoundedContexts, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Scoping: Local Scope', () => {

    // ── Smoke (~20%) ──────────────────────────────────────────────────

    test('smoke: resolves domain, team, and classification in same file', async () => {
        // Arrange & Act
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

        // Assert
        expectParsedDocument(document);

        const bc = getFirstBoundedContext(document);
        expect(bc.domain?.ref?.name).toBe('Sales');
        expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam');
        expect(bc.classification?.[0]?.ref?.name).toBe('Core');
    });

    // ── Edge / Error (~80%) ───────────────────────────────────────────

    test.each([
        {
            refType: 'domain',
            input: s`
                BoundedContext OrderContext for NonExistentDomain {
                    description: "Order management"
                }
            `,
            checkResolution: (bc: ReturnType<typeof getFirstBoundedContext>) => {
                expect(bc.domain?.ref).toBeUndefined();
                expect(bc.domain?.error).not.toBeUndefined();
            },
        },
        {
            refType: 'team',
            input: s`
                Domain Sales {}
                BoundedContext OrderContext for Sales {
                    team: GhostTeam
                }
            `,
            checkResolution: (bc: ReturnType<typeof getFirstBoundedContext>) => {
                expect(bc.domain?.ref?.name).toBe('Sales');
                expect(bc.team?.[0]?.ref).toBeUndefined();
                expect(bc.team?.[0]?.error).not.toBeUndefined();
            },
        },
        {
            refType: 'classification',
            input: s`
                Domain Sales {}
                BoundedContext OrderContext for Sales {
                    classification: Phantom
                }
            `,
            checkResolution: (bc: ReturnType<typeof getFirstBoundedContext>) => {
                expect(bc.domain?.ref?.name).toBe('Sales');
                expect(bc.classification?.[0]?.ref).toBeUndefined();
                expect(bc.classification?.[0]?.error).not.toBeUndefined();
            },
        },
    ])('unresolved $refType reference produces error', async ({ input, checkResolution }) => {
        // Arrange & Act
        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const bc = getFirstBoundedContext(document);
        checkResolution(bc);
        
        const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
        expect(errors.length).toBeGreaterThan(0);
    });

    test('BC with all unresolvable references still parses', async () => {
        // Arrange & Act
        const document = await testServices.parse(s`
            BoundedContext Orphan for MissingDomain {
                team: MissingTeam
                classification: MissingClass
            }
        `);

        // Assert
        expectParsedDocument(document);

        const bc = getFirstBoundedContext(document);
        expect(bc.name).toBe('Orphan');
        expect(bc.domain?.ref).toBeUndefined();
        expect(bc.team?.[0]?.ref).toBeUndefined();
        expect(bc.classification?.[0]?.ref).toBeUndefined();
    });

    test('multiple BCs can reference the same domain', async () => {
        // Arrange & Act
        const document = await testServices.parse(s`
            Domain Sales {}
            BoundedContext Orders for Sales
            BoundedContext Invoicing for Sales
            BoundedContext Shipping for Sales
        `);

        // Assert
        expectParsedDocument(document);

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
        // Arrange & Act
        const document = await testServices.parse(input);

        // Assert
        const bc = getFirstBoundedContext(document);
        check(bc);
    });
});