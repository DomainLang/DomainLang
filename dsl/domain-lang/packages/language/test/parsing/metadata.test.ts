/**
 * Metadata Parsing and Validation Tests
 *
 * This test suite validates:
 * - Metadata definition and parsing
 * - Metadata block syntax with assignment operators
 * - Metadata key references
 * - Validation of undefined metadata keys
 * - Coexistence with other BC documentation blocks
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { beforeAll, describe, expect, test } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, expectGrammarRuleRejectsInput, getDiagnosticsBySeverity, s } from '../test-helpers.js';
import {
    isBoundedContext,
    isMetadata,
} from '../../src/generated/ast.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ============================================================================
// METADATA DEFINITION PARSING
// ============================================================================

describe('Metadata Definition Parsing', () => {
    test('should parse Metadata definitions with correct names', async () => {
        // Arrange & Act
        const input = s`
            Metadata Language
            Metadata Framework
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const metadatas = document.parseResult.value.children.filter(isMetadata);

        expect(metadatas).toHaveLength(2);
        expect(metadatas[0]!.name).toBe('Language');
        expect(metadatas[1]!.name).toBe('Framework');
    });
});

// ============================================================================
// METADATA BLOCK IN BOUNDED CONTEXT
// ============================================================================

describe('Metadata Block in BoundedContext', () => {
    test('should parse metadata entries with all assignment operators', async () => {
        // Arrange & Act
        const input = s`
            Metadata Language
            Metadata Framework
            Metadata Database
            Domain Sales {}
            bc OrderContext for Sales {
                description: "Order management"
                metadata {
                    Language = "TypeScript"
                    Framework is "NestJS"
                    Database: "PostgreSQL"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;

        expect(bc.description).toBe('Order management');
        const entries = bc.metadata;
        expect(entries).toHaveLength(3);

        expect(entries[0]?.key.ref?.name).toBe('Language');
        expect(entries[0]?.value).toBe('TypeScript');
        expect(entries[1]?.key.ref?.name).toBe('Framework');
        expect(entries[1]?.value).toBe('NestJS');
        expect(entries[2]?.key.ref?.name).toBe('Database');
        expect(entries[2]?.value).toBe('PostgreSQL');
    });

    test('should parse metadata block with alternative meta keyword', async () => {
        // Arrange & Act
        const input = s`
            Metadata Language
            Domain Sales {}
            bc OrderContext for Sales {
                meta {
                    Language is "Java"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;
        const entries = bc.metadata;

        expect(entries).toHaveLength(1);
        expect(entries[0]?.key.ref?.name).toBe('Language');
        expect(entries[0]?.value).toBe('Java');
    });

    test('should allow empty metadata block', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales {
                metadata {}
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;
        expect(bc.metadata).toHaveLength(0);
    });
});

// ============================================================================
// METADATA VALUE FORMATS
// ============================================================================

describe('Metadata Value Formats', () => {
    test('should handle metadata values with special characters', async () => {
        // Arrange & Act
        const input = s`
            Metadata Repository
            Metadata Url
            Domain Sales {}
            bc PaymentGateway for Sales {
                metadata {
                    Repository: "github.com/company/payment-service"
                    Url: "https://api.payment.com:8080/v1"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;

        expect(bc.metadata[0]?.value).toBe('github.com/company/payment-service');
        expect(bc.metadata[1]?.value).toBe('https://api.payment.com:8080/v1');
    });

    test('should support single quotes in metadata values', async () => {
        // Arrange & Act
        const input = s`
            Metadata Language
            Domain Sales {}
            bc OrderContext for Sales {
                metadata {
                    Language: 'Python'
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;
        expect(bc.metadata[0]?.value).toBe('Python');
    });
});

// ============================================================================
// METADATA WITH OTHER DOCUMENTATION BLOCKS
// ============================================================================

describe('Metadata with Other Documentation Blocks', () => {
    // 'coexist with team' subsumed by comprehensive test below

    test('should coexist with classification, team, terminology, and description', async () => {
        // Arrange & Act
        const input = s`
            Metadata Language
            Metadata Database
            Team DevTeam
            Classification Core
            Domain Sales {}
            bc ComplexContext for Sales {
                description: "Complex bounded context"
                classification: Core
                team: DevTeam
                metadata {
                    Language: "TypeScript"
                    Database: "MongoDB"
                }
                terminology {
                    Term Order is "A customer's purchase request"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;

        expect(bc.description).toBe('Complex bounded context');
        expect(bc.team[0]?.ref?.name).toBe('DevTeam');
        expect(bc.classification[0]?.ref?.name).toBe('Core');
        expect(bc.metadata).toHaveLength(2);
        expect(bc.terminology).toHaveLength(1);
    });
});

// ============================================================================
// METADATA VALIDATION & NEGATIVE TESTS
// ============================================================================

describe('Metadata Validation', () => {
    test('should report linking error for undefined metadata key', async () => {
        // Arrange & Act
        const input = s`
            Metadata Language
            Domain Sales {}
            bc OrderContext for Sales {
                metadata {
                    Language: "TypeScript"
                    UndefinedKey: "value"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        const bc = document.parseResult.value.children.find(isBoundedContext)!;
        const entries = bc.metadata;
        expect(entries).toHaveLength(2);

        // The defined key should resolve correctly
        expect(entries[0]?.key.ref?.name).toBe('Language');

        // The undefined key should fail to resolve (linking error)
        expect(entries[1]?.key.ref).toBeUndefined();

        // Langium should report a diagnostic error for the unresolved reference
        const errors = getDiagnosticsBySeverity(document, 1);
        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(errors.some(d => d.message.includes('UndefinedKey') || d.message.includes('Could not resolve'))).toBe(true);
    });

    test('should parse duplicate metadata keys without error', async () => {
        // Arrange & Act
        const input = s`
            Metadata Language
            Domain Sales {}
            bc OrderContext for Sales {
                metadata {
                    Language: "TypeScript"
                    Language: "Java"
                }
            }
        `;

        // The language does not currently validate duplicate metadata keys
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = document.parseResult.value.children.find(isBoundedContext)!;
        const entries = bc.metadata;

        expect(entries).toHaveLength(2);
        expect(entries[0]?.value).toBe('TypeScript');
        expect(entries[1]?.value).toBe('Java');
        // Both entries reference the same Metadata definition
        expect(entries[0]?.key.ref?.name).toBe('Language');
        expect(entries[1]?.key.ref?.name).toBe('Language');
    });

    test('should reject metadata entry without a value', async () => {
        // Arrange
        const input = s`
            Metadata Language
            Domain Sales {}
            bc OrderContext for Sales {
                metadata {
                    Language
                }
            }
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Metadata entry without value'
        );
    });

    test('should reject metadata block outside BoundedContext', async () => {
        // Arrange
        const input = s`
            Metadata Language
            Domain Sales {
                metadata {
                    Language: "TypeScript"
                }
            }
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Metadata block in Domain'
        );
    });
});
