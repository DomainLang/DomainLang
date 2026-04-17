/**
 * Tests for explain module (PRS-015).
 *
 * Verifies that generateExplanation produces correct markdown
 * for all supported model element types.
 *
 * Organized around:
 * - Basic element explanations (one test per element type via test.each)
 * - Special cases (domain nesting, BC with attributes, collections, unknown types)
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestSuite, expectParsedDocument, s } from '../test-helpers.js';
import type { TestServices } from '../test-helpers.js';
import { fromDocument } from '../../src/sdk/query.js';
import { generateExplanation } from '../../src/lsp/explain.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Basic Explanations — parameterized by element type
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateExplanation — basic element types', () => {
    interface ExplanationCase {
        readonly name: string;
        readonly input: string;
        readonly elementType: 'domain' | 'boundedContext' | 'team' | 'classification' | 'contextMap' | 'domainMap';
        readonly elementName: string;
        readonly expectedKeywords: readonly string[];
    }

    const basicCases: readonly ExplanationCase[] = [
        {
            name: 'Domain with vision',
            input: s`Domain Sales { vision: "Handle sales operations" }`,
            elementType: 'domain',
            elementName: 'Sales',
            expectedKeywords: ['domain', 'Sales', 'Handle sales operations'],
        },
        {
            name: 'Team',
            input: s`Team SalesTeam`,
            elementType: 'team',
            elementName: 'SalesTeam',
            expectedKeywords: ['team', 'SalesTeam'],
        },
        {
            name: 'Classification',
            input: s`Classification Core`,
            elementType: 'classification',
            elementName: 'Core',
            expectedKeywords: ['classification', 'Core'],
        },
        {
            name: 'BoundedContext without description',
            input: s`
                Domain Sales { vision: "v" }
                bc OrderContext for Sales {}
            `,
            elementType: 'boundedContext',
            elementName: 'OrderContext',
            expectedKeywords: ['bounded context', 'OrderContext', 'Sales'],
        },
        {
            name: 'ContextMap without contexts',
            input: s`ContextMap EmptyMap {}`,
            elementType: 'contextMap',
            elementName: 'EmptyMap',
            expectedKeywords: ['context map', 'EmptyMap'],
        },
        {
            name: 'DomainMap without domains',
            input: s`DomainMap EmptyMap {}`,
            elementType: 'domainMap',
            elementName: 'EmptyMap',
            expectedKeywords: ['domain map', 'EmptyMap'],
        },
    ];

    test.each(basicCases)('$name', async ({ input, elementType, elementName, expectedKeywords }) => {
        // Arrange
        const document = await testServices.parse(input);
        expectParsedDocument(document);
        const query = fromDocument(document);

        let element: unknown;
        switch (elementType) {
            case 'domain':
                element = query.domain(elementName);
                break;
            case 'boundedContext':
                element = query.boundedContext(elementName);
                break;
            case 'team':
                element = query.teams().first();
                break;
            case 'classification':
                element = query.classifications().first();
                break;
            case 'contextMap':
                element = query.contextMaps().first();
                break;
            case 'domainMap':
                element = query.domainMaps().first();
                break;
        }

        expect(element, `Expected to find ${elementType} '${elementName}'`).toBeDefined();

        // Act
        const explanation = generateExplanation(element as any);

        // Assert — all expected keywords must appear
        for (const keyword of expectedKeywords) {
            expect(explanation).toContain(keyword);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Special Cases — distinct behaviors that justify separate tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateExplanation — special cases', () => {
    test('domain with parent reference includes parent name', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Commerce { vision: "Commerce" }
            Domain Sales in Commerce { vision: "Sales" }
        `);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const domain = query.domain('Sales');

        // Act
        const explanation = generateExplanation(domain!);

        // Assert
        expect(explanation).toContain('Sales');
        expect(explanation).toContain('Commerce');
    });

    test('bounded context with classification and team includes both', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            Team SalesTeam
            Classification Core
            bc OrderContext for Sales as Core by SalesTeam {}
        `);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const bc = query.boundedContext('OrderContext');

        // Act
        const explanation = generateExplanation(bc!);

        // Assert
        expect(explanation).toContain('Core');
        expect(explanation).toContain('SalesTeam');
    });

    test('bounded context with description includes description text', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales {
                description: "Handles order processing"
            }
        `);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const bc = query.boundedContext('OrderContext');

        // Act
        const explanation = generateExplanation(bc!);

        // Assert
        expect(explanation).toContain('Handles order processing');
    });

    test('context map with bounded contexts lists them', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales {}
            bc BillingContext for Sales {}
            ContextMap SalesMap {
                contains OrderContext, BillingContext
            }
        `);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const cmap = query.contextMaps().first();

        // Act
        const explanation = generateExplanation(cmap!);

        // Assert
        expect(explanation).toContain('OrderContext');
        expect(explanation).toContain('BillingContext');
    });

    test('domain map with domains lists them', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            Domain Billing { vision: "v" }
            DomainMap CompanyMap {
                contains Sales, Billing
            }
        `);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const dmap = query.domainMaps().first();

        // Act
        const explanation = generateExplanation(dmap!);

        // Assert
        expect(explanation).toContain('Sales');
        expect(explanation).toContain('Billing');
    });

    test('relationship with patterns includes target context', async () => {
        // Arrange
        const document = await testServices.parse(s`
            Domain Sales { vision: "v" }
            bc OrderContext for Sales {
                relationships {
                    this [OHS] -> [CF] PaymentContext
                }
            }
            bc PaymentContext for Sales {}
        `);
        expectParsedDocument(document);
        const query = fromDocument(document);
        const bc = query.boundedContext('OrderContext');
        const relationship = bc!.relationships[0];

        // Act
        const explanation = generateExplanation(relationship);

        // Assert
        expect(explanation).toContain('relationship');
        expect(explanation).toContain('PaymentContext');
        expect(explanation).toContain('->');
    });

    test('unsupported element type returns unknown message', () => {
        // Arrange — create a minimal AstNode-like object with an unsupported $type
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