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
    metadataAsMap,
} from '../../src/sdk/resolution.js';
import type { BoundedContext, Domain } from '../../src/generated/ast.js';

describe('SDK Resolution Functions', () => {

    // ========================================================================
    // Smoke: consolidated direct AST properties (~20%)
    // ========================================================================

    describe('Smoke: direct AST properties (no resolution needed)', () => {

        test('BC and Domain direct properties return correct values', async () => {
            // Arrange & Act
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

            // Assert
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
    // Header/body resolution, undefined cases, and team-with-classification
    // covered by resolution-precedence.test.ts
    // ========================================================================

    // ========================================================================
    // Edge: metadataAsMap()
    // ========================================================================

    describe('Edge: metadataAsMap()', () => {

        // Happy path, empty-no-metadata, and empty-block cases
        // covered by resolution-precedence.test.ts

        test('handles special characters in metadata values', async () => {
            // Arrange & Act
            const { query } = await loadModelFromText(`
                Metadata pattern
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {
                    metadata {
                        pattern: "[a-zA-Z0-9_]*"
                    }
                }
            `);

            // Act
            const metadata = metadataAsMap(query.bc('OrderContext') as BoundedContext);

            // Assert
            expect(metadata.get('pattern')).toBe('[a-zA-Z0-9_]*');
        });
    });
});
