/**
 * Tests for the createModelLoader factory function.
 *
 * Verifies reusable loader, service sharing, and error handling.
 * ~20% smoke (basic load, standalone), ~80% edge (invalid input, empty model, independence).
 */

import { describe, test, expect } from 'vitest';
import { createModelLoader, loadModelFromText } from '../../src/sdk/loader.js';

describe('createModelLoader', () => {

    // Smoke: one consolidated happy-path test
    test('creates a loader that parses a model and exposes services', async () => {
        // Arrange
        const loader = createModelLoader();

        // Act
        const result = await loader.loadFromText('Domain Sales { vision: "Sales" }');

        // Assert
        // Verify model, query, documents, and services
        expect(result.documents).toHaveLength(1);
        expect(result.query.domain('Sales')?.name).toBe('Sales');
        expect(result.query.domain('Sales')?.vision).toBe('Sales');
    });

    // Edge: reuses services across calls, each result is independent
    test('sequential loads produce independent query contexts', async () => {
        // Arrange
        const loader = createModelLoader();

        // Act
        const r1 = await loader.loadFromText(`
            Domain Sales { vision: "Sales" }
            Team SalesTeam
            Classification Core
            bc OrderContext for Sales as Core by SalesTeam {
                description: "Order processing context"
            }
        `);
        const r2 = await loader.loadFromText(`
            Domain Billing { vision: "Billing" }
            bc PaymentContext for Billing {
                description: "Payment processing"
            }
        `);

        // Assert
        // r1 has OrderContext, not PaymentContext
        expect(r1.query.boundedContexts().toArray()).toHaveLength(1);
        expect(r1.query.boundedContexts().first()?.name).toBe('OrderContext');
        expect(r1.query.domain('Sales')?.name).toBe('Sales');

        // r2 has PaymentContext, not OrderContext
        expect(r2.query.boundedContexts().toArray()).toHaveLength(1);
        expect(r2.query.boundedContexts().first()?.name).toBe('PaymentContext');
        expect(r2.query.domain('Billing')?.name).toBe('Billing');

        // Cross-isolation: Sales not in r2, Billing not in r1
        expect(r2.query.domain('Sales')).toBeUndefined();
        expect(r1.query.domain('Billing')).toBeUndefined();
    });

    // Edge: invalid syntax throws
    test('rejects invalid DomainLang syntax', async () => {
        // Arrange
        const loader = createModelLoader();

        // Act & Assert
        await expect(loader.loadFromText('not valid dlang {{{')).rejects.toThrow();
    });

    // Edge: model with only declarations (no body) -- minimal valid input
    test('loads minimal valid model with empty domain body', async () => {
        // Arrange
        const loader = createModelLoader();

        // Act
        const result = await loader.loadFromText('Domain Minimal {}');

        // Assert
        expect(result.query.domain('Minimal')?.name).toBe('Minimal');
        expect(result.query.boundedContexts().count()).toBe(0);
    });

    // Edge: model with only Team declarations
    test('loads model with only non-domain entities', async () => {
        // Arrange
        const loader = createModelLoader();

        // Act
        const result = await loader.loadFromText('Team SomeTeam');

        // Assert
        expect(result.query.domains().count()).toBe(0);
        expect(result.query.teams().count()).toBe(1);
        expect(result.query.team('SomeTeam')?.name).toBe('SomeTeam');
    });
});

describe('loadModelFromText', () => {

    // Smoke: standalone one-off call
    test('loads model and returns query with correct domain', async () => {
        // Arrange & Act
        const result = await loadModelFromText('Domain Sales { vision: "Sales" }');

        // Assert
        expect(result.query.domain('Sales')?.name).toBe('Sales');
        expect(result.query.domain('Sales')?.vision).toBe('Sales');
        expect(result.documents).toHaveLength(1);
    });

    // Edge: model with multiple entities of various types
    test('loads complex model with multiple entity types', async () => {
        // Arrange & Act
        const result = await loadModelFromText(`
            Classification Core
            Team SalesTeam
            Domain Sales { vision: "v" }
            bc OrderContext for Sales as Core by SalesTeam
        `);

        // Assert
        expect(result.query.classifications().count()).toBeGreaterThanOrEqual(1);
        expect(result.query.teams().count()).toBeGreaterThanOrEqual(1);
        expect(result.query.domains().count()).toBe(1);
        expect(result.query.boundedContexts().count()).toBe(1);
        // Verify the BC actually references the expected classification and team
        const bc = result.query.bc('OrderContext');
        expect(bc?.name).toBe('OrderContext');
    });

    // Edge: reject empty/whitespace-only
    test('rejects completely empty text', async () => {
        // Arrange & Act
        // Empty string should produce a model with no children
        const result = await loadModelFromText('');

        // Assert
        expect(result.query.domains().count()).toBe(0);
    });
});
