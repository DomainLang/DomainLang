/**
 * SDK Resolution Functions Tests
 *
 * Tests for property resolution functions that provide value beyond direct AST access:
 * - effectiveClassification: resolves first classification from header/body
 * - effectiveTeam: resolves first team from header/body
 * - metadataAsMap: converts metadata entries to Map
 *
 * ~20% smoke (one consolidated direct-property + happy-path), ~80% edge
 * (undefined inputs, empty metadata, special chars, unresolved refs).
 */

import { describe, test, expect } from 'vitest';
import { loadModelFromText } from '../../src/sdk/loader.js';
import {
    effectiveClassification,
    effectiveTeam,
    metadataAsMap,
} from '../../src/sdk/resolution.js';
import type { BoundedContext, Domain } from '../../src/generated/ast.js';

describe('SDK Resolution Functions', () => {

    // ========================================================================
    // Smoke: consolidated direct AST properties (~20%)
    // ========================================================================

    describe('Smoke: direct AST properties (no resolution needed)', () => {

        test('BC and Domain direct properties return correct values', async () => {
            const { query } = await loadModelFromText(`
                Classification Commercial
                Classification Product
                Classification Core
                Domain Sales {
                    description: "Sales domain"
                    vision: "Handle sales"
                    type: Core
                }
                bc OrderContext for Sales {
                    description: "Manages orders"
                    businessModel: Commercial
                    evolution: Product
                }
            `);

            // BC direct properties
            const bc = query.bc('OrderContext') as BoundedContext;
            expect(bc.description).toBe('Manages orders');
            expect(bc.businessModel?.ref?.name).toBe('Commercial');
            expect(bc.evolution?.ref?.name).toBe('Product');

            // Domain direct properties
            const domain = query.domain('Sales') as Domain;
            expect(domain.description).toBe('Sales domain');
            expect(domain.vision).toBe('Handle sales');
            expect(domain.type?.ref?.name).toBe('Core');
        });
    });

    // ========================================================================
    // Edge: effectiveClassification()
    // ========================================================================

    // effectiveClassification() edge cases covered by resolution-precedence.test.ts

    // ========================================================================
    // Edge: effectiveTeam()
    // ========================================================================

    describe('Edge: effectiveTeam()', () => {
        // Header/body resolution and undefined cases covered by resolution-precedence.test.ts

        test('returns team even when classification is also set', async () => {
            const { query } = await loadModelFromText(`
                Classification Core
                Team SalesTeam
                Domain Sales { vision: "v" }
                bc OrderContext for Sales as Core by SalesTeam
            `);

            const bc = query.bc('OrderContext') as BoundedContext;
            expect(effectiveTeam(bc)?.name).toBe('SalesTeam');
            expect(effectiveClassification(bc)?.name).toBe('Core');
        });
    });

    // ========================================================================
    // Edge: metadataAsMap()
    // ========================================================================

    describe('Edge: metadataAsMap()', () => {

        // Happy path and empty-no-metadata cases covered by resolution-precedence.test.ts

        test('returns empty map when metadata block is empty', async () => {
            const { query } = await loadModelFromText(`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    metadata { }
                }
            `);

            const metadata = metadataAsMap(query.bc('OrderContext') as BoundedContext);
            expect(metadata.size).toBe(0);
        });

        test('handles special characters in metadata values', async () => {
            const { query } = await loadModelFromText(`
                Metadata pattern
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    metadata {
                        pattern: "[a-zA-Z0-9_]*"
                    }
                }
            `);

            const metadata = metadataAsMap(query.bc('OrderContext') as BoundedContext);
            expect(metadata.get('pattern')).toBe('[a-zA-Z0-9_]*');
        });

        // 'returns empty map for BC with description but no metadata' covered by resolution-precedence.test.ts

        test('non-existent key returns undefined from map', async () => {
            const { query } = await loadModelFromText(`
                Metadata tier
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    metadata {
                        tier: "critical"
                    }
                }
            `);

            const metadata = metadataAsMap(query.bc('OrderContext') as BoundedContext);
            expect(metadata.get('tier')).toBe('critical');
            expect(metadata.get('nonexistent')).toBeUndefined();
        });
    });
});
