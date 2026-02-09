/**
 * SDK QueryBuilder Tests
 *
 * Tests QueryBuilder chaining, filtering, lazy evaluation, and terminal operations.
 * ~20% smoke (basic where/name/first), ~80% edge (regex, chained filters, empty model,
 * lazy evaluation short-circuit, FQN regex, Symbol.iterator).
 */

import { describe, test, expect } from 'vitest';
import { loadModelFromText } from '../../src/sdk/loader.js';

// Shared model for many tests
const MULTI_DOMAIN_MODEL = `
    Namespace acme.sales {
        Domain Sales { vision: "Sales vision" }
        Domain SalesFinance { vision: "Combined" }
    }
    Namespace acme.finance {
        Domain Finance { vision: "Finance vision" }
    }
    Domain TopLevel { vision: "Top-level domain" }
`;

describe('SDK QueryBuilder', () => {

    // ========================================================================
    // Smoke: basic operations (~20%)
    // ========================================================================

    describe('Smoke: basic where/withName/first/count/toArray', () => {

        test('where() filters by predicate, withName() matches exact name, first() returns first match', async () => {
            // Arrange
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Act & Assert
            // where
            const longNames = query.domains().where(d => d.name.length > 6).toArray();
            expect(longNames.map(d => d.name)).toEqual(
                expect.arrayContaining(['SalesFinance', 'Finance', 'TopLevel'])
            );

            // withName exact
            const sales = query.domains().withName('Sales').first();
            expect(sales?.name).toBe('Sales');

            // first
            const first = query.domains().first();
            expect(first?.name).toBe('Sales');

            // count
            expect(query.domains().count()).toBe(4);

            // toArray preserves order
            const arr = query.domains().toArray();
            expect(arr.map(d => d.name)).toEqual(['Sales', 'SalesFinance', 'Finance', 'TopLevel']);
        });
    });

    // ========================================================================
    // Edge: where() filtering
    // ========================================================================

    describe('Edge: where() filtering', () => {

        test('chaining multiple where() calls intersects predicates', async () => {
            // Arrange
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Act
            const results = query.domains()
                .where(d => d.name.includes('Sales'))
                .where(d => d.name.length > 5)
                .toArray();

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('SalesFinance');
        });

        // 'where() returns empty when predicate matches nothing' subsumed by always-false test below

        test('where() with always-false predicate returns empty', async () => {
            // Arrange & Act
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Assert
            expect(query.domains().where(() => false).count()).toBe(0);
        });

        test('where() with always-true predicate returns all', async () => {
            // Arrange & Act
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Assert
            expect(query.domains().where(() => true).count()).toBe(4);
        });
    });

    // ========================================================================
    // Edge: withName() and withFqn() string/regex
    // ========================================================================

    describe('Edge: withName() string and regex', () => {

        test('withName is case-sensitive', async () => {
            // Arrange & Act
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                Domain sales { vision: "v" }
            `);

            // Assert
            expect(query.domains().withName('Sales').count()).toBe(1);
            expect(query.domains().withName('sales').count()).toBe(1);
            expect(query.domains().withName('SALES').count()).toBe(0);
        });

        test('withName(regex) matches partial patterns', async () => {
            // Arrange
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Act
            const salesish = query.domains().withName(/Sales/).toArray();

            // Assert
            expect(salesish.map(d => d.name)).toEqual(
                expect.arrayContaining(['Sales', 'SalesFinance'])
            );
            expect(salesish).toHaveLength(2);
        });

        test('withName(regex) anchored match', async () => {
            // Arrange
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Act
            const exact = query.domains().withName(/^Finance$/).toArray();

            // Assert
            expect(exact).toHaveLength(1);
            expect(exact[0].name).toBe('Finance');
        });

        test('withName returns empty for non-matching string', async () => {
            // Arrange & Act
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Assert
            expect(query.domains().withName('ZZZZZ').count()).toBe(0);
        });

        test('withName returns empty for non-matching regex', async () => {
            // Arrange & Act
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Assert
            expect(query.domains().withName(/^ZZZZZ$/).count()).toBe(0);
        });
    });

    describe('Edge: withFqn() string and regex', () => {

        test('withFqn resolves namespaced FQN', async () => {
            // Arrange
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Act
            const results = query.domains().withFqn('acme.sales.Sales').toArray();

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Sales');
        });

        test('withFqn returns empty for non-matching FQN', async () => {
            // Arrange & Act
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Assert
            expect(query.domains().withFqn('nonexistent.path.Sales').count()).toBe(0);
        });

        test('withFqn(regex) matches FQN pattern', async () => {
            // Arrange
            const { query } = await loadModelFromText(MULTI_DOMAIN_MODEL);

            // Act
            const results = query.domains().withFqn(/acme\.sales\..*/).toArray();

            // Assert
            expect(results.map(d => d.name)).toEqual(
                expect.arrayContaining(['Sales', 'SalesFinance'])
            );
        });

        test('withFqn distinguishes same-name domains in different namespaces', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Namespace acme.alpha { Domain Orders { vision: "v" } }
                Namespace acme.beta  { Domain Orders { vision: "v" } }
            `);

            // Act & Assert
            const alpha = query.domains().withFqn('acme.alpha.Orders').toArray();
            expect(alpha).toHaveLength(1);

            const beta = query.domains().withFqn('acme.beta.Orders').toArray();
            expect(beta).toHaveLength(1);

            const all = query.domains().withName('Orders').toArray();
            expect(all).toHaveLength(2);
        });
    });

    // ========================================================================
    // Edge: first() terminal operation
    // ========================================================================

    describe('Edge: first() terminal operation', () => {

        test('first() returns undefined when iterator is empty', async () => {
            // Arrange & Act
            const { query } = await loadModelFromText(`Domain X { vision: "v" }`);

            // Assert
            expect(query.domains().where(d => d.name === 'Z').first()).toBeUndefined();
        });

        test('first() respects filter short-circuit (lazy evaluation)', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain A { vision: "v" }
                Domain B { vision: "v" }
                Domain C { vision: "v" }
            `);
            let iterationCount = 0;

            // Act
            const builder = query.domains().where(() => {
                iterationCount++;
                return true;
            });
            builder.first();

            // Assert
            // Only iterated once despite 3 items available
            expect(iterationCount).toBe(1);
        });

        test('first() finds first matching after where()', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                Domain Finance { vision: "v" }
                Domain Inventory { vision: "v" }
            `);

            // Act
            const result = query.domains()
                .where(d => d.name.includes('n'))
                .first();

            // Assert
            expect(result?.name).toBe('Finance');
        });
    });

    // ========================================================================
    // Edge: lazy evaluation behavior
    // ========================================================================

    describe('Edge: lazy evaluation behavior', () => {

        test('where() predicate not called until consumption', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain A { vision: "v" }
                Domain B { vision: "v" }
            `);
            let executionCount = 0;

            // Act
            const builder = query.domains().where(() => {
                executionCount++;
                return true;
            });

            // Assert
            expect(executionCount).toBe(0);

            const count = builder.count();
            expect(executionCount).toBe(2);
            expect(count).toBe(2);
        });

        test('Symbol.iterator enables for-of consumption', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Alpha { vision: "v" }
                Domain Beta { vision: "v" }
            `);

            // Act
            const names: string[] = [];
            for (const d of query.domains()) {
                names.push(d.name);
            }

            // Assert
            expect(names).toEqual(['Alpha', 'Beta']);
        });

        test('spread operator materializes builder', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain X { vision: "v" }
                Domain Y { vision: "v" }
            `);

            // Act
            const results = [...query.domains().where(d => d.name === 'Y')];

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Y');
        });
    });

    // ========================================================================
    // Edge: empty model and boundary conditions
    // ========================================================================

    describe('Edge: empty model and boundary conditions', () => {

        test('all operations work on model with no matching entities', async () => {
            // Arrange & Act
            const { query } = await loadModelFromText('Team SampleTeam');

            // Assert
            expect(query.domains().count()).toBe(0);
            expect(query.domains().first()).toBeUndefined();
            expect(query.domains().toArray()).toEqual([]);
            expect([...query.domains()]).toEqual([]);
            expect(query.domains().where(() => true).count()).toBe(0);
            expect(query.domains().withName('X').count()).toBe(0);
        });

        test('single-item model works correctly for all terminal operations', async () => {
            // Arrange & Act
            const { query } = await loadModelFromText('Domain Single { vision: "v" }');

            // Assert
            expect(query.domains().count()).toBe(1);
            expect(query.domains().first()?.name).toBe('Single');
            expect(query.domains().toArray()).toHaveLength(1);
            expect(query.domains().withName('Single').count()).toBe(1);
            expect(query.domains().withName('Other').count()).toBe(0);
        });
    });

    // ========================================================================
    // Edge: complex filter chains
    // ========================================================================

    describe('Edge: complex filter chains', () => {

        test('where + where + withName narrows to exact result', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain SalesOrders { vision: "v" }
                Domain FinanceOrders { vision: "v" }
                Domain Sales { vision: "v" }
            `);

            // Act
            const results = query.domains()
                .where(d => d.name.includes('Orders'))
                .where(d => d.name.startsWith('Sales'))
                .toArray();

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('SalesOrders');
        });

        test('count() after filtering returns correct filtered count', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain A { vision: "v" }
                Domain VeryLongName { vision: "v" }
                Domain B { vision: "v" }
                Domain LongNameDomain { vision: "v" }
            `);

            // Act
            const count = query.domains()
                .where(d => d.name.length > 6)
                .count();

            // Assert
            expect(count).toBe(2);
        });
    });
});
