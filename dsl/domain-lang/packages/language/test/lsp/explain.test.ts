/**
 * Tests for explain module (PRS-015).
 *
 * Verifies that generateExplanation produces correct markdown
 * for all supported model element types.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestSuite, expectValidDocument, s } from '../test-helpers.js';
import type { TestServices } from '../test-helpers.js';
import { fromDocument } from '../../src/sdk/query.js';
import { generateExplanation } from '../../src/lsp/explain.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Domain Explanations
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateExplanation - Domain', () => {
    test('should explain a domain with vision', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "Handle sales operations" }
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const domain = query.domain('Sales');
        expect(domain?.name).toBe('Sales');

        // Act
        const explanation = generateExplanation(domain!);

        // Assert
        expect(explanation).toContain('domain');
        expect(explanation).toContain('Sales');
        expect(explanation).toContain('Handle sales operations');
    });

    test('should explain a domain with parent reference', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Commerce { vision: "Commerce" }
            Domain Sales in Commerce { vision: "Sales" }
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const domain = query.domain('Sales');
        expect(domain?.name).toBe('Sales');

        // Act
        const explanation = generateExplanation(domain!);

        // Assert
        expect(explanation).toContain('Sales');
        expect(explanation).toContain('Commerce');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BoundedContext Explanations
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateExplanation - BoundedContext', () => {
    test('should explain a bounded context with domain reference', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales {
                description: "Handles order processing"
            }
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const bc = query.boundedContext('OrderContext');
        expect(bc?.name).toBe('OrderContext');

        // Act
        const explanation = generateExplanation(bc!);

        // Assert
        expect(explanation).toContain('bounded context');
        expect(explanation).toContain('OrderContext');
        expect(explanation).toContain('Sales');
        expect(explanation).toContain('Handles order processing');
    });

    test('should include classification and team when present', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            Team SalesTeam
            Classification Core
            bc OrderContext for Sales as Core by SalesTeam {}
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const bc = query.boundedContext('OrderContext');
        expect(bc?.name).toBe('OrderContext');

        // Act
        const explanation = generateExplanation(bc!);

        // Assert
        expect(explanation).toContain('Core');
        expect(explanation).toContain('SalesTeam');
    });

    test('should explain a bounded context without description', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales {}
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const bc = query.boundedContext('OrderContext');
        expect(bc?.name).toBe('OrderContext');

        // Act
        const explanation = generateExplanation(bc!);

        // Assert
        expect(explanation).toContain('bounded context');
        expect(explanation).toContain('OrderContext');
        expect(explanation).toContain('Sales');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Team Explanations
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateExplanation - Team', () => {
    test('should explain a team', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Team SalesTeam
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const team = query.teams().first();
        expect(team?.name).toBe('SalesTeam');

        // Act
        const explanation = generateExplanation(team!);

        // Assert
        expect(explanation).toContain('team');
        expect(explanation).toContain('SalesTeam');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Classification Explanations
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateExplanation - Classification', () => {
    test('should explain a classification', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Classification Core
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const cls = query.classifications().first();
        expect(cls?.name).toBe('Core');

        // Act
        const explanation = generateExplanation(cls!);

        // Assert
        expect(explanation).toContain('classification');
        expect(explanation).toContain('Core');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Relationship Explanations
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateExplanation - Relationship', () => {
    test('should explain a relationship with patterns', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales {
                relationships {
                    [OHS] this -> [CF] PaymentContext
                }
            }
            bc PaymentContext for Sales {}
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const bc = query.boundedContext('OrderContext');
        expect(bc?.name).toBe('OrderContext');
        const relationship = bc!.relationships[0];
        expect(relationship.$type).toBe('Relationship');

        // Act
        const explanation = generateExplanation(relationship);

        // Assert
        expect(explanation).toContain('relationship');
        expect(explanation).toContain('PaymentContext');
        expect(explanation).toContain('->');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ContextMap Explanations
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateExplanation - ContextMap', () => {
    test('should explain a context map with bounded contexts', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales {}
            bc BillingContext for Sales {}
            ContextMap SalesMap {
                contains OrderContext, BillingContext
            }
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const cmap = query.contextMaps().first();
        expect(cmap?.name).toBe('SalesMap');

        // Act
        const explanation = generateExplanation(cmap!);

        // Assert
        expect(explanation).toContain('context map');
        expect(explanation).toContain('SalesMap');
        expect(explanation).toContain('OrderContext');
        expect(explanation).toContain('BillingContext');
    });

    test('should explain a context map without bounded contexts', async () => {
        // Arrange
        const document = await testServices.parse(s`
            ContextMap EmptyMap {}
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const cmap = query.contextMaps().first();
        expect(cmap?.name).toBe('EmptyMap');

        // Act
        const explanation = generateExplanation(cmap!);

        // Assert
        expect(explanation).toContain('context map');
        expect(explanation).toContain('EmptyMap');
        expect(explanation).not.toContain('Bounded contexts');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DomainMap Explanations
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateExplanation - DomainMap', () => {
    test('should explain a domain map with domains', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            Domain Billing { vision: "v" }
            DomainMap CompanyMap {
                contains Sales, Billing
            }
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const dmap = query.domainMaps().first();
        expect(dmap?.name).toBe('CompanyMap');

        // Act
        const explanation = generateExplanation(dmap!);

        // Assert
        expect(explanation).toContain('domain map');
        expect(explanation).toContain('CompanyMap');
        expect(explanation).toContain('Sales');
        expect(explanation).toContain('Billing');
    });

    test('should explain a domain map without domains', async () => {
        // Arrange
        const document = await testServices.parse(s`
            DomainMap EmptyMap {}
        `);
        expectValidDocument(document);
        const query = fromDocument(document);
        const dmap = query.domainMaps().first();
        expect(dmap?.name).toBe('EmptyMap');

        // Act
        const explanation = generateExplanation(dmap!);

        // Assert
        expect(explanation).toContain('domain map');
        expect(explanation).toContain('EmptyMap');
        expect(explanation).not.toContain('Domains');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Unknown Element Type
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateExplanation - Unknown', () => {
    test('should return unknown message for unsupported node types', () => {
        // Arrange - create a minimal AstNode-like object with an unsupported $type
        const fakeNode = {
            $type: 'UnsupportedType',
            $containerProperty: 'children',
        } as unknown as import('langium').AstNode;

        // Act
        const explanation = generateExplanation(fakeNode);

        // Assert
        expect(explanation).toContain('Unknown element type');
        expect(explanation).toContain('UnsupportedType');
    });
});
