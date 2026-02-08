/**
 * Syntax Variant Tests
 *
 * Tests all keyword alternatives and syntactic sugar defined in the grammar.
 * Ensures that all documented syntax variants parse correctly.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, expectGrammarRuleRejectsInput, getFirstBoundedContext, getAllBoundedContexts, getFirstDomain, s } from '../test-helpers.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ============================================================================
// DOMAIN KEYWORD VARIANTS
// ============================================================================

describe('Domain Keyword Variants', () => {
    test.each([
        ['Domain', 'capitalized keyword'],
        ['dom', 'shorthand'],
    ])('should parse %s (%s)', async (keyword) => {
        // Arrange
        const input = s`
            ${keyword} Sales {
                vision: "Sales vision"
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const domain = getFirstDomain(document);
        expect(domain.name).toBe('Sales');
        expect(domain.vision).toBe('Sales vision');
    });

    test.each([
        ['Domain', 'capitalized keyword'],
        ['dom', 'shorthand'],
    ])('should parse %s (%s) without body', async (keyword) => {
        // Arrange
        const input = s`
            ${keyword} Sales
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const domain = getFirstDomain(document);
        expect(domain.name).toBe('Sales');
        expect(domain.vision).toBeUndefined();
    });
});

// ============================================================================
// BOUNDED CONTEXT KEYWORD VARIANTS
// ============================================================================

describe('BoundedContext Keyword Variants', () => {
    test.each([
        ['BoundedContext', 'full keyword'],
        ['bc', 'shorthand'],
    ])('should parse %s (%s)', async (keyword) => {
        const input = s`
            Domain Sales {}
            ${keyword} OrderContext for Sales
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        expect(getFirstBoundedContext(document).name).toBe('OrderContext');
    });
});

// ============================================================================
// TEAM KEYWORD VARIANTS
// ============================================================================

describe('Team Keyword', () => {
    test('should parse Team keyword with correct name', async () => {
        const input = s`
            Team SalesTeam
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const teams = document.parseResult.value.children.filter(c => c.$type === 'Team');
        expect(teams).toHaveLength(1);
        expect(teams[0].name).toBe('SalesTeam');
    });
});

// ============================================================================
// CLASSIFICATION KEYWORD VARIANTS
// ============================================================================

describe('Classification Keyword', () => {
    test('should parse Classification keyword with correct name', async () => {
        const input = s`
            Classification Core
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const classifications = document.parseResult.value.children.filter(c => c.$type === 'Classification');
        expect(classifications).toHaveLength(1);
        expect(classifications[0].name).toBe('Core');
    });
});

// ============================================================================
// CONTEXT MAP KEYWORD VARIANTS
// ============================================================================

describe('ContextMap Keyword Variants', () => {
    test.each([
        ['ContextMap', 'full keyword'],
        ['cmap', 'shorthand'],
    ])('should parse %s (%s) with contains', async (keyword) => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales

            ${keyword} SalesMap {
                contains OrderContext
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const contextMaps = document.parseResult.value.children.filter(c => c.$type === 'ContextMap');
        expect(contextMaps).toHaveLength(1);
        expect(contextMaps[0].name).toBe('SalesMap');
        expect(contextMaps[0].boundedContexts).toHaveLength(1);
    });
});

// ============================================================================
// DOMAIN MAP KEYWORD VARIANTS
// ============================================================================

describe('DomainMap Keyword Variants', () => {
    test.each([
        ['DomainMap', 'full keyword'],
        ['dmap', 'shorthand'],
    ])('should parse %s (%s) with contains', async (keyword) => {
        const input = s`
            Domain Sales {
                vision: "Sales domain"
            }

            ${keyword} BusinessMap {
                contains Sales
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const domainMaps = document.parseResult.value.children.filter(c => c.$type === 'DomainMap');
        expect(domainMaps).toHaveLength(1);
        expect(domainMaps[0].name).toBe('BusinessMap');
        expect(domainMaps[0].domains).toHaveLength(1);
    });
});

// ============================================================================
// NAMESPACE KEYWORD VARIANTS
// ============================================================================

describe('Namespace Keyword Variants', () => {
    test.each([
        ['Namespace', 'capitalized keyword'],
        ['ns', 'shorthand'],
    ])('should parse %s (%s) with children', async (keyword) => {
        const input = s`
            ${keyword} sales {
                Domain Sales {
                    vision: "Sales domain"
                }
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const namespaces = document.parseResult.value.children.filter(c => c.$type === 'NamespaceDeclaration');
        expect(namespaces).toHaveLength(1);
        expect(namespaces[0].name).toBe('sales');
        expect(namespaces[0].children).toHaveLength(1);
    });

    test('should parse ns with dot notation', async () => {
        // Arrange
        const input = s`
            ns Acme.Sales {
                Domain Sales {}
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const namespaces = document.parseResult.value.children.filter(c => c.$type === 'NamespaceDeclaration');
        expect(namespaces).toHaveLength(1);
        expect(namespaces[0].name).toBe('Acme.Sales');
    });
});

// ============================================================================
// INLINE BC ASSIGNMENT VARIANTS
// ============================================================================

describe('bc Inline Assignment Variants', () => {
    test('should parse as keyword for classification', async () => {
        const input = s`
            Domain Sales {}
            Classification Core
            bc OrderContext for Sales as Core
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.classification?.[0]?.ref?.name).toBe('Core');
    });

    test('should parse by keyword for team', async () => {
        const input = s`
            Domain Sales {}
            Team SalesTeam
            bc OrderContext for Sales by SalesTeam
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam');
    });
});

// ============================================================================
// BC DOCUMENTATION BLOCK VARIANTS
// ============================================================================

describe('bc Documentation Block Variants', () => {
    test('should parse team: keyword in block', async () => {
        const input = s`
            Team SalesTeam
            Domain Sales {}
            bc OrderContext for Sales {
                team: SalesTeam
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.team).toHaveLength(1);
        expect(bc.team[0]?.ref?.name).toBe('SalesTeam');
    });

    test('should parse classification keyword in block', async () => {
        const input = s`
            Classification Core
            Domain Sales {}
            bc OrderContext for Sales {
                classification: Core
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.classification).toHaveLength(1);
        expect(bc.classification[0]?.ref?.name).toBe('Core');
    });

    test('should parse businessModel keyword in block', async () => {
        const input = s`
            Classification SaaS
            Domain Sales {}
            bc OrderContext for Sales {
                businessModel: SaaS
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.businessModel?.ref?.name).toBe('SaaS');
    });

    test('should parse evolution keyword with resolved Classification reference', async () => {
        const input = s`
            Classification Mature
            Domain Sales {}
            bc OrderContext for Sales {
                evolution: Mature
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.evolution?.ref?.name).toBe('Mature');
    });

    test('should parse archetype keyword with resolved Classification reference', async () => {
        // Arrange
        const input = s`
            Classification Gateway
            Domain Sales {}
            bc OrderContext for Sales {
                archetype: Gateway
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.archetype?.ref?.name).toBe('Gateway');
    });
});

// ============================================================================
// RELATIONSHIPS BLOCK VARIANTS
// ============================================================================

describe('Relationships Block Variants', () => {
    test.each([
        ['relationships', 'relationships keyword'],
        ['integrations', 'integrations alias'],
    ])('should parse %s (%s) with arrow and target', async (keyword) => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc InventoryContext for Sales {
                ${keyword} {
                    this -> OrderContext
                }
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bcs = getAllBoundedContexts(document);
        const inventoryBC = bcs.find(bc => bc.name === 'InventoryContext')!;
        expect(inventoryBC.relationships).toHaveLength(1);
        expect(inventoryBC.relationships[0].arrow).toBe('->');
    });
});

// ============================================================================
// DECISIONS BLOCK VARIANTS
// ============================================================================

describe('Decisions Block Variants', () => {
    test.each([
        ['decisions', 'decisions keyword'],
        ['rules', 'rules alias'],
    ])('should parse %s (%s) with decision name and value', async (keyword) => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales {
                ${keyword} {
                    decision EventSourcing: "Use event sourcing"
                }
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.decisions).toHaveLength(1);
        expect(bc.decisions[0].name).toBe('EventSourcing');
        expect(bc.decisions[0].value).toBe('Use event sourcing');
    });

    test('should parse rules alias with policy and rule items', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales {
                rules {
                    policy RefundPolicy: "30-day refunds"
                    rule MinOrder: "Minimum order is $10"
                }
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.decisions).toHaveLength(2);
        expect(bc.decisions[0].name).toBe('RefundPolicy');
        expect(bc.decisions[0].value).toBe('30-day refunds');
        expect(bc.decisions[1].name).toBe('MinOrder');
        expect(bc.decisions[1].value).toBe('Minimum order is $10');
    });
});

// ============================================================================
// DECISION TYPE VARIANTS
// ============================================================================

describe('Decision Type Variants', () => {
    test.each([
        ['decision', 'EventSourcing', 'Use event sourcing'],
        ['Decision', 'EventSourcing', 'Use event sourcing'],
        ['policy', 'RefundPolicy', '30-day refunds'],
        ['Policy', 'RefundPolicy', '30-day refunds'],
        ['rule', 'UniqueIds', 'All IDs must be unique'],
        ['Rule', 'UniqueIds', 'All IDs must be unique'],
    ])('should parse %s keyword', async (keyword, name, description) => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales {
                decisions {
                    ${keyword} ${name}: "${description}"
                }
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.decisions).toHaveLength(1);
        expect(bc.decisions[0].name).toBe(name);
        expect(bc.decisions[0].value).toBe(description);
    });
});

// ============================================================================
// ASSIGNMENT OPERATOR VARIANTS
// ============================================================================

describe('Assignment Operator Variants', () => {
    test.each([
        [':', 'colon'],
        ['is', 'is keyword'],
        ['=', 'equals'],
    ])('should parse %s (%s) assignment for domain vision', async (operator) => {
        // Arrange
        const input = s`
            Domain Sales {
                vision ${operator} "Sales vision"
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const domain = getFirstDomain(document);
        expect(domain.vision).toBe('Sales vision');
    });

    test.each([
        [':', 'colon'],
        ['is', 'is keyword'],
        ['=', 'equals'],
    ])('should parse %s (%s) assignment for BC description', async (operator) => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales {
                description ${operator} "Order lifecycle"
            }
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.description).toBe('Order lifecycle');
    });
});

// ============================================================================
// NEGATIVE TESTS
// ============================================================================

describe('Syntax Variant Negative Cases', () => {
    test('should reject unknown keyword as Domain alternative', async () => {
        const input = s`
            subdomain Sales {
                vision: "Sales vision"
            }
        `;

        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Unknown keyword subdomain'
        );
    });

    // 'ContextMap without braces' covered by model-structure-parsing.test.ts negative tests

    test('should reject DomainMap without braces', async () => {
        const input = s`
            Domain Sales {}
            DomainMap BusinessMap
                contains Sales
        `;

        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'DomainMap without braces'
        );
    });
});
