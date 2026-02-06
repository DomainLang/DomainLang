/**
 * Tests for the createModelLoader factory function.
 * 
 * Verifies that the reusable loader correctly shares services
 * across multiple parse calls and produces valid query contexts.
 */

import { describe, test, expect } from 'vitest';
import { createModelLoader } from '../../src/sdk/loader.js';
import { loadModelFromText } from '../../src/sdk/loader.js';

describe('createModelLoader', () => {
    test('creates a loader that can parse models', async () => {
        // Arrange
        const loader = createModelLoader();

        // Act
        const result = await loader.loadFromText('Domain Sales { vision: "Sales" }');

        // Assert
        expect(result.model).toBeDefined();
        expect(result.query).toBeDefined();
        expect(result.documents).toHaveLength(1);
    });

    test('reuses services across multiple parse calls', async () => {
        // Arrange
        const loader = createModelLoader();

        // Act
        const result1 = await loader.loadFromText('Domain Sales { vision: "Sales" }');
        const result2 = await loader.loadFromText('Domain Billing { vision: "Billing" }');

        // Assert - both produce valid, independent results
        expect(result1.query.domain('Sales')).toBeDefined();
        expect(result2.query.domain('Billing')).toBeDefined();
        // Each result is independent — Sales is not in result2
        expect(result2.query.domain('Sales')).toBeUndefined();
    });

    test('exposes underlying services', async () => {
        // Arrange
        const loader = createModelLoader();

        // Act & Assert
        expect(loader.services).toBeDefined();
        expect(loader.services.shared).toBeDefined();
    });

    test('handles parse errors gracefully', async () => {
        // Arrange
        const loader = createModelLoader();

        // Act & Assert - invalid syntax should throw
        await expect(loader.loadFromText('not valid dlang {{{'))
            .rejects.toThrow();
    });

    test('can parse multiple complex models sequentially', async () => {
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
        const coreContexts1 = r1.query.boundedContexts().toArray();
        const coreContexts2 = r2.query.boundedContexts().toArray();
        expect(coreContexts1).toHaveLength(1);
        expect(coreContexts1[0].name).toBe('OrderContext');
        expect(coreContexts2).toHaveLength(1);
        expect(coreContexts2[0].name).toBe('PaymentContext');
    });
});

describe('loadModelFromText', () => {
    test('still works as a standalone one-off call', async () => {
        // Arrange
        const text = 'Domain Sales { vision: "Sales" }';

        // Act
        const result = await loadModelFromText(text);

        // Assert
        expect(result.model).toBeDefined();
        expect(result.query.domain('Sales')).toBeDefined();
    });
});
