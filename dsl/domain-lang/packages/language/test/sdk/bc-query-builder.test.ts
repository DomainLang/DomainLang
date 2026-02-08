/**
 * SDK BcQueryBuilder Tests
 *
 * Tests BcQueryBuilder specialized filtering methods: inDomain, withTeam,
 * withClassification, withMetadata, and chained combinations.
 *
 * ~20% smoke (basic filters), ~80% edge/error (empty results, nonexistent refs,
 * regex names, chaining 3+ filters, empty model).
 */

import { describe, test, expect } from 'vitest';
import { loadModelFromText } from '../../src/sdk/loader.js';

// ============================================================================
// Shared model fixture for multiple tests
// ============================================================================

const RICH_MODEL = `
    Classification Core
    Classification Supporting
    Team SalesTeam
    Team FinanceTeam
    Team UnusedTeam
    Metadata tier
    Metadata sla
    Domain Sales { vision: "v" }
    Domain Finance { vision: "v" }

    bc OrderContext for Sales as Core by SalesTeam {
        metadata { tier: "critical" sla: "99.9%" }
    }
    bc ShippingContext for Sales as Core by SalesTeam {
        metadata { tier: "important" }
    }
    bc PaymentContext for Sales as Supporting by FinanceTeam {
        metadata { tier: "critical" }
    }
    bc ReportingContext for Finance as Supporting by FinanceTeam
    bc NotificationContext for Sales
`;

describe('SDK BcQueryBuilder', () => {

    // ========================================================================
    // Smoke: basic filter operations (consolidated)
    // ========================================================================

    describe('Smoke: basic filter operations', () => {

        test('inDomain, withTeam, withClassification, and withMetadata return correct results', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);

            // inDomain
            const salesContexts = query.boundedContexts().inDomain('Sales').toArray();
            expect(salesContexts.map(bc => bc.name)).toEqual(
                expect.arrayContaining(['OrderContext', 'ShippingContext', 'PaymentContext', 'NotificationContext'])
            );
            expect(salesContexts).toHaveLength(4);

            // withTeam
            const salesTeamContexts = query.boundedContexts().withTeam('SalesTeam').toArray();
            expect(salesTeamContexts.map(bc => bc.name)).toEqual(
                expect.arrayContaining(['OrderContext', 'ShippingContext'])
            );
            expect(salesTeamContexts).toHaveLength(2);

            // withClassification
            const coreContexts = query.boundedContexts().withClassification('Core').toArray();
            expect(coreContexts.map(bc => bc.name)).toEqual(
                expect.arrayContaining(['OrderContext', 'ShippingContext'])
            );
            expect(coreContexts).toHaveLength(2);

            // withMetadata key
            const tierContexts = query.boundedContexts().withMetadata('tier').toArray();
            expect(tierContexts).toHaveLength(3);

            // withMetadata key+value
            const criticalContexts = query.boundedContexts().withMetadata('tier', 'critical').toArray();
            expect(criticalContexts.map(bc => bc.name)).toEqual(
                expect.arrayContaining(['OrderContext', 'PaymentContext'])
            );
            expect(criticalContexts).toHaveLength(2);
        });
    });

    // ========================================================================
    // Edge: empty/nonexistent results
    // ========================================================================

    describe('Edge: empty and nonexistent filters', () => {

        test.each([
            { filter: 'inDomain', arg: ['NonExistent'] },
            { filter: 'withTeam', arg: ['NonExistent'] },
            { filter: 'withTeam', arg: ['UnusedTeam'] },
            { filter: 'withClassification', arg: ['NonExistent'] },
            { filter: 'withMetadata', arg: ['nonexistent'] },
            { filter: 'withMetadata', arg: ['tier', 'nonexistent'] },
        ] as const)('$filter($arg) returns empty for nonexistent value', async ({ filter, arg }) => {
            const { query } = await loadModelFromText(RICH_MODEL);
             
            const builder = (query.boundedContexts() as any)[filter](...arg);
            expect(builder.count()).toBe(0);
        });

        test('inDomain returns empty when domain has no bounded contexts', async () => {
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                Domain Finance { vision: "v" }
                bc OrderContext for Sales
            `);
            expect(query.boundedContexts().inDomain('Finance').count()).toBe(0);
        });

        test('all filters return empty on model with no bounded contexts', async () => {
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                Team T
                Classification C
                Metadata m
            `);
            expect(query.boundedContexts().inDomain('Sales').count()).toBe(0);
            expect(query.boundedContexts().withTeam('T').count()).toBe(0);
            expect(query.boundedContexts().withClassification('C').count()).toBe(0);
            expect(query.boundedContexts().withMetadata('m').count()).toBe(0);
        });
    });

    // ========================================================================
    // Edge: chained filter combinations
    // ========================================================================

    describe('Edge: chained filter combinations', () => {

        test('inDomain + withTeam narrows results correctly', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const results = query.boundedContexts()
                .inDomain('Sales')
                .withTeam('SalesTeam')
                .toArray();
            expect(results.map(bc => bc.name)).toEqual(
                expect.arrayContaining(['OrderContext', 'ShippingContext'])
            );
            expect(results).toHaveLength(2);
        });

        test('inDomain + withClassification narrows results', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const results = query.boundedContexts()
                .inDomain('Sales')
                .withClassification('Supporting')
                .toArray();
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('PaymentContext');
        });

        test('three-way chain: inDomain + withTeam + withMetadata', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const results = query.boundedContexts()
                .inDomain('Sales')
                .withTeam('SalesTeam')
                .withMetadata('tier', 'critical')
                .toArray();
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('OrderContext');
        });

        test('chained filters that produce empty results', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const results = query.boundedContexts()
                .inDomain('Finance')
                .withTeam('SalesTeam')
                .toArray();
            expect(results).toHaveLength(0);
        });
    });

    // ========================================================================
    // Edge: generic QueryBuilder methods on BcQueryBuilder
    // ========================================================================

    describe('Edge: generic QueryBuilder methods on BcQueryBuilder', () => {

        test('where() applies custom predicate after domain filter', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const results = query.boundedContexts()
                .inDomain('Sales')
                .where(bc => bc.name.includes('ing'))
                .toArray();
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('ShippingContext');
        });

        test('withName string match on BcQueryBuilder', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const result = query.boundedContexts().withName('OrderContext').first();
            expect(result?.name).toBe('OrderContext');
        });

        test('withName regex match on BcQueryBuilder', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const results = query.boundedContexts().withName(/.*Context$/).toArray();
            expect(results.length).toBe(5); // All end with Context
        });

        test('withName regex partial match filters correctly', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const results = query.boundedContexts().withName(/^(Order|Payment)Context$/).toArray();
            expect(results.map(bc => bc.name)).toEqual(
                expect.arrayContaining(['OrderContext', 'PaymentContext'])
            );
            expect(results).toHaveLength(2);
        });

        test('first() returns first matching BC from filtered set', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const result = query.boundedContexts().withTeam('SalesTeam').first();
            expect(result?.name).toBe('OrderContext');
        });

        test('first() returns undefined when filter matches nothing', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const result = query.boundedContexts().withTeam('NonExistent').first();
            expect(result).toBeUndefined();
        });

        test('count() returns correct count after chained filters', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            expect(query.boundedContexts().withTeam('SalesTeam').count()).toBe(2);
            expect(query.boundedContexts().withTeam('FinanceTeam').count()).toBe(2);
            expect(query.boundedContexts().withClassification('Core').count()).toBe(2);
            expect(query.boundedContexts().withClassification('Supporting').count()).toBe(2);
        });

        test('toArray() materializes correct elements', async () => {
            const { query } = await loadModelFromText(RICH_MODEL);
            const arr = query.boundedContexts().withMetadata('sla').toArray();
            expect(arr).toHaveLength(1);
            expect(arr[0].name).toBe('OrderContext');
        });
    });
});
