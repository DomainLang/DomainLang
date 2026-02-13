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

    describe('effectiveClassification() precedence', () => {

        test('header-only classification resolves correctly', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Classification Core
                Domain Sales {}
                bc OrderContext for Sales as Core
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const classification = effectiveClassification(bc);

            // Assert
            expect(classification).not.toBeUndefined();
            expect(classification?.name).toBe('Core');
        });

        test('body-only classification resolves correctly', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Classification Core
                Domain Sales {}
                bc OrderContext for Sales {
                    classification: Core
                }
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const classification = effectiveClassification(bc);

            // Assert
            expect(classification).not.toBeUndefined();
            expect(classification?.name).toBe('Core');
        });

        test('header wins over body when both specified', async () => {
            // Arrange - inline 'as Core' should take precedence over body 'classification: Supporting'
            const { query } = await loadModelFromText(`
                Classification Core
                Classification Supporting
                Domain Sales {}
                bc OrderContext for Sales as Core {
                    classification: Supporting
                }
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const classification = effectiveClassification(bc);

            // Assert - header (inline) wins
            expect(classification).not.toBeUndefined();
            expect(classification?.name).toBe('Core');
        });

        test('returns undefined when no classification specified', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales {}
                bc OrderContext for Sales
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const classification = effectiveClassification(bc);

            // Assert
            expect(classification).toBeUndefined();
        });
    });

    describe('effectiveTeam() precedence', () => {

        test('header-only team resolves correctly', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Team TeamA
                Domain Sales {}
                bc OrderContext for Sales by TeamA
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const team = effectiveTeam(bc);

            // Assert
            expect(team).not.toBeUndefined();
            expect(team?.name).toBe('TeamA');
        });

        test('body-only team resolves correctly', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Team TeamA
                Domain Sales {}
                bc OrderContext for Sales {
                    team: TeamA
                }
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const team = effectiveTeam(bc);

            // Assert
            expect(team).not.toBeUndefined();
            expect(team?.name).toBe('TeamA');
        });

        test('header wins over body when both specified', async () => {
            // Arrange - inline 'by TeamA' should take precedence over body 'team: TeamB'
            const { query } = await loadModelFromText(`
                Team TeamA
                Team TeamB
                Domain Sales {}
                bc OrderContext for Sales by TeamA {
                    team: TeamB
                }
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const team = effectiveTeam(bc);

            // Assert - header (inline) wins
            expect(team).not.toBeUndefined();
            expect(team?.name).toBe('TeamA');
        });

        test('returns undefined when no team specified', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales {}
                bc OrderContext for Sales
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const team = effectiveTeam(bc);

            // Assert
            expect(team).toBeUndefined();
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

        test('returns empty map when no metadata', async () => {
            // Arrange
            const { query } = await loadModelFromText(`
                Domain Sales {}
                bc OrderContext for Sales
            `);

            // Act
            const bc = query.bc('OrderContext') as BoundedContext;
            const metadata = metadataAsMap(bc);

            // Assert
            expect(metadata.size).toBe(0);
        });

        test('last value wins for duplicate metadata keys', async () => {
            // Arrange - same key declared twice; Map.set overwrites so last value wins
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

            // Assert - the metadataAsMap iterates the array and sets into a Map,
            // so the last entry for a given key wins
            expect(metadata.has('tier')).toBe(true);
            expect(metadata.get('tier')).toBe('high');
        });
    });
});
