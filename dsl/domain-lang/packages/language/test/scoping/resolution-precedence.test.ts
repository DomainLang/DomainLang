/**
 * Resolution Precedence Tests
 *
 * Tests that effectiveClassification() and effectiveTeam() from resolution.ts
 * correctly handle precedence between inline (header) and body properties.
 *
 * The grammar puts inline (`as`/`by`) before body properties in the array,
 * so [0] gives precedence to the inline form.
 *
 * Also tests metadataAsMap() edge cases.
 */

import { describe, test, expect } from 'vitest';
import { loadModelFromText } from '../../src/sdk/loader.js';
import { effectiveClassification, effectiveTeam, metadataAsMap } from '../../src/sdk/resolution.js';
import type { BoundedContext } from '../../src/generated/ast.js';

describe('Resolution Precedence', () => {

    describe('Header vs body precedence', () => {
        test.each([
            {
                type: 'classification',
                headerDecl: 'as Core',
                bodyDecl: 'classification: Core',
                alternateDecl: 'classification: Supporting',
                input: `
                    Classification Core
                    Classification Supporting
                    Domain Sales {}
                    bc OrderContext for Sales as Core {
                        classification: Supporting
                    }
                `,
                bcName: 'OrderContext',
                checkExpected: (bc: BoundedContext) => {
                    const result = effectiveClassification(bc);
                    expect(result?.name).toBe('Core');
                },
                checkAlternate: (bc: BoundedContext) => {
                    const result = effectiveClassification(bc);
                    expect(result?.name).not.toBe('Supporting');
                },
            },
            {
                type: 'team',
                headerDecl: 'by TeamA',
                bodyDecl: 'team: TeamA',
                alternateDecl: 'team: TeamB',
                input: `
                    Team TeamA
                    Team TeamB
                    Domain Sales {}
                    bc OrderContext for Sales by TeamA {
                        team: TeamB
                    }
                `,
                bcName: 'OrderContext',
                checkExpected: (bc: BoundedContext) => {
                    const result = effectiveTeam(bc);
                    expect(result?.name).toBe('TeamA');
                },
                checkAlternate: (bc: BoundedContext) => {
                    const result = effectiveTeam(bc);
                    expect(result?.name).not.toBe('TeamB');
                },
            },
        ])('$type: header wins over body when both specified', async ({ input, bcName, checkExpected, checkAlternate }) => {
            // Arrange
            const { query } = await loadModelFromText(input);

            // Act
            const bc = query.bc(bcName) as BoundedContext;

            // Assert - header (inline) wins
            checkExpected(bc);
            checkAlternate(bc);
        });

        test.each([
            {
                type: 'classification',
                decl: 'as Core',
                input: `
                    Classification Core
                    Domain Sales {}
                    bc OrderContext for Sales as Core
                `,
                check: (bc: BoundedContext) => {
                    const result = effectiveClassification(bc);
                    expect(result?.name).toBe('Core');
                },
            },
            {
                type: 'team',
                decl: 'by TeamA',
                input: `
                    Team TeamA
                    Domain Sales {}
                    bc OrderContext for Sales by TeamA
                `,
                check: (bc: BoundedContext) => {
                    const result = effectiveTeam(bc);
                    expect(result?.name).toBe('TeamA');
                },
            },
            {
                type: 'classification (body)',
                decl: 'classification: Core',
                input: `
                    Classification Core
                    Domain Sales {}
                    bc OrderContext for Sales {
                        classification: Core
                    }
                `,
                check: (bc: BoundedContext) => {
                    const result = effectiveClassification(bc);
                    expect(result?.name).toBe('Core');
                },
            },
            {
                type: 'team (body)',
                decl: 'team: TeamA',
                input: `
                    Team TeamA
                    Domain Sales {}
                    bc OrderContext for Sales {
                        team: TeamA
                    }
                `,
                check: (bc: BoundedContext) => {
                    const result = effectiveTeam(bc);
                    expect(result?.name).toBe('TeamA');
                },
            },
            {
                type: 'classification (none)',
                decl: 'neither header nor body',
                input: `
                    Domain Sales {}
                    bc OrderContext for Sales
                `,
                check: (bc: BoundedContext) => {
                    const result = effectiveClassification(bc);
                    expect(result).toBeUndefined();
                },
            },
            {
                type: 'team (none)',
                decl: 'neither header nor body',
                input: `
                    Domain Sales {}
                    bc OrderContext for Sales
                `,
                check: (bc: BoundedContext) => {
                    const result = effectiveTeam(bc);
                    expect(result).toBeUndefined();
                },
            },
        ])('$type resolves correctly for $decl', async ({ input, check }) => {
            // Arrange
            const { query } = await loadModelFromText(input);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;

            // Assert
            check(bc);
        });
    });

    describe('metadataAsMap() edge cases', () => {

        test('converts metadata entries to map', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Metadata tier
                Metadata sla
                Domain Sales {}
                bc OrderContext for Sales {
                    metadata {
                        tier: "critical"
                        sla: "99.99%"
                    }
                }
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const metadata = metadataAsMap(bc);

            // Assert
            expect(metadata.size).toBe(2);
            expect(metadata.get('tier')).toBe('critical');
            expect(metadata.get('sla')).toBe('99.99%');
        });

        test('last value wins for duplicate metadata keys', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Metadata tier
                Domain Sales {}
                bc OrderContext for Sales {
                    metadata {
                        tier: "low"
                        tier: "high"
                    }
                }
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const metadata = metadataAsMap(bc);

            // Assert
            expect(metadata.has('tier')).toBe(true);
            expect(metadata.get('tier')).toBe('high');
        });
    });
});