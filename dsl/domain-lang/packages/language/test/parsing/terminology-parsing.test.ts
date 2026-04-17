/**
 * Terminology and Glossary Tests
 *
 * Tests for DomainTerm parsing including synonyms, examples, and meaning definitions.
 * Validates the ubiquitous language feature of DDD.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectParsedDocument, expectGrammarRuleRejectsInput, getFirstBoundedContext, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ============================================================================
// BASIC TERMINOLOGY PARSING
// ============================================================================

// Basic terminology parsing covered by 'Complex Term Definitions' tests below

// ============================================================================
// TERM AND BLOCK KEYWORD VARIANTS
// ============================================================================

describe('Term and Block Keyword Variants', () => {
    test('should parse glossary block keyword as terminology alias', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}

            BoundedContext OrderContext for Sales {
                glossary {
                    term Order: "A customer purchase request"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.terminology).toHaveLength(1);
        expect(bc.terminology[0].name).toBe('Order');
        expect(bc.terminology[0].meaning).toBe('A customer purchase request');
    });
});

// ============================================================================
// SYNONYMS
// ============================================================================

describe('Term Synonyms', () => {
    test('should parse single synonym with aka keyword', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}

            BoundedContext OrderContext for Sales {
                terminology {
                    term Buyer: "A person who places orders" aka Client
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const bc = getFirstBoundedContext(document);
        const term = bc.terminology[0];

        expect(term.name).toBe('Buyer');
        expect(term.synonyms).toHaveLength(1);
        expect(term.synonyms[0]).toBe('Client');
    });

    test('should parse multiple synonyms with aka keyword', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}

            BoundedContext OrderContext for Sales {
                terminology {
                    term Buyer: "A person who places orders" aka Client, Purchaser, Patron
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const term = getFirstBoundedContext(document).terminology[0];

        expect(term.synonyms).toEqual(['Client', 'Purchaser', 'Patron']);
    });

    test('should parse synonyms keyword as aka alias', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}

            BoundedContext OrderContext for Sales {
                terminology {
                    term Product: "An item for sale" synonyms Item, Good, Merchandise
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const term = getFirstBoundedContext(document).terminology[0];

        expect(term.synonyms).toEqual(['Item', 'Good', 'Merchandise']);
    });
});

// ============================================================================
// EXAMPLES
// ============================================================================

describe('Term Examples', () => {
    test('should parse term with examples keyword', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}

            BoundedContext OrderContext for Sales {
                terminology {
                    term Product: "An item for sale" examples "Laptop", "Mouse"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const term = getFirstBoundedContext(document).terminology[0];

        expect(term.examples).toEqual(['Laptop', 'Mouse']);
    });
});

// ============================================================================
// COMPLEX TERM DEFINITIONS
// ============================================================================

describe('Complex Term Definitions', () => {
    test('should parse term with meaning, synonyms, and examples combined', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}

            BoundedContext OrderContext for Sales {
                terminology {
                    term Buyer: "A person or organization that purchases products" aka Client, Purchaser examples "Acme Corp", "John Doe"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const term = getFirstBoundedContext(document).terminology[0];

        expect(term.name).toBe('Buyer');
        expect(term.meaning).toBe('A person or organization that purchases products');
        expect(term.synonyms).toEqual(['Client', 'Purchaser']);
        expect(term.examples).toEqual(['Acme Corp', 'John Doe']);
    });

    test('should parse multiple complex terms with varied features', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}

            BoundedContext OrderContext for Sales {
                terminology {
                    term Order: "Purchase request" aka Purchase examples "ORD-001", "ORD-002"
                    Term LineItem: "Single product in order" synonyms OrderLine
                    Term Discount: "Price reduction" examples "10% off", "Buy one get one"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const terms = getFirstBoundedContext(document).terminology;

        expect(terms).toHaveLength(3);
        expect(terms[0].name).toBe('Order');
        expect(terms[0].synonyms).toEqual(['Purchase']);
        expect(terms[0].examples).toEqual(['ORD-001', 'ORD-002']);
        expect(terms[1].name).toBe('LineItem');
        expect(terms[1].synonyms).toEqual(['OrderLine']);
        expect(terms[1].examples).toHaveLength(0);
        expect(terms[2].name).toBe('Discount');
        expect(terms[2].synonyms).toHaveLength(0);
        expect(terms[2].examples).toHaveLength(2);
    });
});

// NOTE: term assignment operator variants (: / is / =) are NOT tested — syntax-variants.test.ts
// covers domain-level operators only. Consider adding term operator coverage here.

// ============================================================================
// TERM ASSIGNMENT OPERATOR VARIANTS
// ============================================================================

describe('Term Assignment Operator Variants', () => {
    test.each([
        ['colon (:)', ':'],
        ['is keyword', 'is'],
        ['equals (=)', '='],
    ])('should parse term meaning with %s operator', async (_label, operator) => {
        const input = s`
            Domain Sales {}
            BoundedContext OrderContext for Sales {
                terminology {
                    term Order ${operator} "A customer purchase request"
                }
            }
        `;

        const document = await testServices.parse(input);

        expectParsedDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.terminology).toHaveLength(1);
        expect(bc.terminology[0].name).toBe('Order');
        expect(bc.terminology[0].meaning).toBe('A customer purchase request');
    });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Terminology Edge Cases', () => {
    test('should handle empty terminology block', async () => {
        // Arrange & Act
        const input = s`
            Domain Sales {}

            BoundedContext OrderContext for Sales {
                terminology { }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.terminology).toHaveLength(0);
    });

    test.each([
        { char: 'hyphens', name: 'line-item', meaning: 'A single line in an order' },
        { char: 'underscores', name: 'order_id', meaning: 'Unique order identifier' },
    ])('should parse terms with $char in names', async ({ name, meaning }) => {
        // Arrange & Act
        const input = s`
            Domain Sales {}

            BoundedContext OrderContext for Sales {
                terminology {
                    term ${name}: "${meaning}"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectParsedDocument(document);
        const term = getFirstBoundedContext(document).terminology[0];
        expect(term.name).toBe(name);
        expect(term.meaning).toBe(meaning);
    });

});

// ============================================================================
// NEGATIVE TESTS
// ============================================================================

describe('Terminology Negative Tests', () => {
    test('should reject terminology block outside a BoundedContext', async () => {
        // Arrange
        const input = s`
            Domain Sales {
                terminology {
                    term Order: "A purchase request"
                }
            }
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Terminology outside BC'
        );
    });

    test('should reject term with numeric-only name', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            BoundedContext OrderContext for Sales {
                terminology {
                    term 123: "Invalid name"
                }
            }
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Term with numeric name'
        );
    });
});
