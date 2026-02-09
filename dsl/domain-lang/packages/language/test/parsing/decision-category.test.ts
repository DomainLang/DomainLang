/**
 * Decision Classification Tests
 *
 * Tests that decisions can be categorized using Classification labels.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { beforeAll, describe, expect, test } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, expectGrammarRuleRejectsInput, getDiagnosticsBySeverity, s } from '../test-helpers.js';
import { isBoundedContext, isClassification } from '../../src/generated/ast.js';

describe('Decision Classification', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    test('should parse Classification definitions with correct names', async () => {
        // Arrange & Act
        const input = s`
            Classification Architectural
            Classification Business
            Classification Technical
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const categories = document.parseResult.value.children.filter(isClassification);

        expect(categories).toHaveLength(3);
        expect(categories.map(c => c.name)).toEqual(['Architectural', 'Business', 'Technical']);
    });

    test('should resolve Classification references in decisions', async () => {
        // Arrange & Act
        const input = s`
            Classification Architectural
            Classification Business

            Domain Sales {}

            BoundedContext OrderContext for Sales {
                decisions {
                    decision [Architectural] UseEventSourcing: "We will use event sourcing for order history",
                    policy [Business] RefundWindow: "Refunds allowed within 30 days"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;

        expect(bc.decisions).toHaveLength(2);
        expect(bc.decisions[0].name).toBe('UseEventSourcing');
        expect(bc.decisions[0].classification?.ref?.name).toBe('Architectural');
        expect(bc.decisions[0].value).toContain('event sourcing');
        expect(bc.decisions[1].name).toBe('RefundWindow');
        expect(bc.decisions[1].classification?.ref?.name).toBe('Business');
    });

    test('should resolve qualified Classification names in decisions', async () => {
        // Arrange & Act
        const input = s`
            Namespace governance {
                Classification Architectural
                Classification Business
            }

            Domain Sales {}

            BoundedContext OrderContext for Sales {
                decisions {
                    decision [governance.Architectural] UseEventSourcing: "Event sourcing for audit trail"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;

        expect(bc.decisions).toHaveLength(1);
        expect(bc.decisions[0].classification?.ref?.name).toBe('Architectural');
    });

    test('should share Classifications between context roles and decisions', async () => {
        // Arrange & Act
        const input = s`
            Classification Core
            Classification Architectural

            Domain Sales {}

            BoundedContext OrderContext for Sales as Core {
                decisions {
                    decision [Architectural] EventSourcing: "Use event sourcing",
                    decision [Core] DomainEvents: "Publish domain events"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;

        // Same Classification used for context role and decision category
        expect(bc.classification[0]?.ref?.name).toBe('Core');
        expect(bc.decisions[0].classification?.ref?.name).toBe('Architectural');
        expect(bc.decisions[1].classification?.ref?.name).toBe('Core');
    });

    // ========================================================================
    // EDGE CASES & NEGATIVE TESTS
    // ========================================================================

    test('should parse empty decisions block', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}
            BoundedContext OrderContext for Sales {
                decisions { }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;
        expect(bc.decisions).toHaveLength(0);
    });

    test('should parse decision without category bracket', async () => {
        // Arrange - decisions can omit the [Category] bracket per grammar
        const input = s`
            Domain Sales {}
            BoundedContext OrderContext for Sales {
                decisions {
                    decision UsePostgres: "Use PostgreSQL as primary database"
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;
        expect(bc.decisions).toHaveLength(1);
        expect(bc.decisions[0].name).toBe('UsePostgres');
        expect(bc.decisions[0].value).toBe('Use PostgreSQL as primary database');
        expect(bc.decisions[0].classification).toBeUndefined();
    });

    test('should report linking error for unresolved Classification in decision', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}
            BoundedContext OrderContext for Sales {
                decisions {
                    decision [NonExistent] Foo: "Some decision"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        const bc = document.parseResult.value.children.find(isBoundedContext)!;

        // The decision parses but the classification reference should fail to resolve
        expect(bc.decisions).toHaveLength(1);
        expect(bc.decisions[0].classification?.ref).toBeUndefined();

        const errors = getDiagnosticsBySeverity(document, 1);
        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(errors.some(d => d.message.includes('NonExistent') || d.message.includes('Could not resolve'))).toBe(true);
    });

    test('should reject decision without a value string', async () => {
        // Arrange
        const input = s`
            Classification Architectural
            Domain Sales {}
            BoundedContext OrderContext for Sales {
                decisions {
                    decision [Architectural] MissingValue
                }
            }
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Decision without value'
        );
    });
});
