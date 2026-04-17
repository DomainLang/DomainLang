/**
 * Linking Tests
 *
 * Tests cross-reference resolution and linking behavior across the grammar.
 * Covers domain references, team references, classification references,
 * and relationship link resolution.
 *
 * Smoke (~20%):
 * - ContextMap resolves named relationship participants
 * - BC domain reference resolves
 *
 * Edge/error (~80%):
 * - Unresolved references in ContextMap produce errors
 * - DDD pattern annotations resolve to correct BC names
 * - Forward references resolve
 * - Unresolved domain reference produces error
 * - Parent domain hierarchy resolves
 * - Team references resolve in inline and doc block syntax
 * - Qualified team references resolve across namespaces
 * - Classification references resolve in inline, domain type, and decision syntax
 * - Qualified classification references resolve
 * - DomainMap resolved and unresolved
 * - This-reference in relationships
 * - Cross-namespace and nested qualified name resolution
 * - Metadata references in BC metadata block resolve
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectParsedDocument, getFirstBoundedContext, s } from '../test-helpers.js';
import type { ContextMap, DomainMap, StructureElement, BoundedContext, Domain } from '../../src/generated/ast.js';
import { isContextMap, isDomainMap, isNamespaceDeclaration, isBoundedContext, isDomain } from '../../src/generated/ast.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractContextMaps(elements: StructureElement[]): ContextMap[] {
    const collected: ContextMap[] = [];
    for (const element of elements) {
        if (isContextMap(element)) {
            collected.push(element);
        } else if (isNamespaceDeclaration(element)) {
            collected.push(...extractContextMaps(element.children));
        }
    }
    return collected;
}

// ============================================================================
// CONTEXT MAP RELATIONSHIP LINKING
// ============================================================================

describe('ContextMap Relationship Linking', () => {

    // EDGE: unresolved references produce error objects
    test('unresolved references in ContextMap produce linking errors with no ref', async () => {
        // Arrange
        const input = s`
            ContextMap FaultyMap {
                PaymentBC <- OrdersBC
            }
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const ctxMap = document.parseResult.value.children.find(isContextMap);

        // Assert
        expect(ctxMap?.name).toBe('FaultyMap');
        if (!ctxMap) {
            throw new Error('Expected context map to be present');
        }

        expect(ctxMap.relationships).toHaveLength(1);
        const rel = ctxMap.relationships[0];
        expect(rel.left.link?.ref).toBeUndefined();
        expect(rel.left.link?.error).not.toBeUndefined();
        expect(rel.right.link?.ref).toBeUndefined();
        expect(rel.right.link?.error).not.toBeUndefined();
    });

    // SMOKE: resolved references in ContextMap
    test('smoke: resolved references in ContextMap have no error and correct participant names', async () => {
        // Arrange
        const input = s`
            Namespace TestNamespace {
                ContextMap CorrectMap {
                    OtherNamespace.PaymentBC <- OrdersBC
                }
                BoundedContext OrdersBC {}
            }
            Namespace OtherNamespace {
                BoundedContext PaymentBC {}
            }
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const ctxMap = extractContextMaps(document.parseResult.value.children)[0];

        // Assert
        expect(ctxMap?.name).toBe('CorrectMap');
        if (!ctxMap) {
            throw new Error('Expected context map to be present');
        }

        expect(ctxMap.relationships).toHaveLength(1);
        const rel = ctxMap.relationships[0];
        expect(rel.left.link?.ref?.name).toBe('PaymentBC');
        expect(rel.left.link?.error).toBeUndefined();
        expect(rel.right.link?.ref?.name).toBe('OrdersBC');
        expect(rel.right.link?.error).toBeUndefined();
    });

    // EDGE: DDD pattern annotations resolve to correct BC names
    test('DDD pattern annotations resolve to correct BC names', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap PatternMap {
                contains OrderContext, PaymentContext
                OrderContext [OHS] -> [CF] PaymentContext
                PaymentContext [ACL] <- [PL] OrderContext
                OrderContext [SK] PaymentContext
            }
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const ctxMap = document.parseResult.value.children.find(isContextMap) as ContextMap;

        // Assert
        expect(ctxMap.relationships).toHaveLength(3);

        // First relationship: OHS OrderContext -> CF PaymentContext
        expect(ctxMap.relationships[0].left.link?.ref?.name).toBe('OrderContext');
        expect(ctxMap.relationships[0].right.link?.ref?.name).toBe('PaymentContext');

        // Second relationship: ACL PaymentContext <- PL OrderContext
        expect(ctxMap.relationships[1].left.link?.ref?.name).toBe('PaymentContext');
        expect(ctxMap.relationships[1].right.link?.ref?.name).toBe('OrderContext');

        // Third relationship: OrderContext [SK] PaymentContext (symmetric)
        expect(ctxMap.relationships[2].left.link?.ref?.name).toBe('OrderContext');
        expect(ctxMap.relationships[2].right.link?.ref?.name).toBe('PaymentContext');
    });
});

// ============================================================================
// DOMAIN REFERENCE LINKING
// ============================================================================

describe('Domain Reference Linking', () => {

    // EDGE: parent domain subdomain hierarchy resolution
    test('parent domain references resolve through multi-level hierarchy', async () => {
        // Arrange
        const input = s`
            Domain Commerce {
                vision: "Root commerce domain"
            }

            Domain Sales in Commerce {
                vision: "Sales subdomain"
            }

            Domain RetailSales in Sales {
                vision: "Retail sales subdomain"
            }
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const model = document.parseResult.value;
        const salesDomain = model.children.find(n => isDomain(n) && n.name === 'Sales') as Domain;
        const retailDomain = model.children.find(n => isDomain(n) && n.name === 'RetailSales') as Domain;

        // Assert
        expect(salesDomain.parent?.ref?.name).toBe('Commerce');
        expect(retailDomain.parent?.ref?.name).toBe('Sales');
    });

    interface DomainReferenceCase {
        readonly scenario: string;
        readonly input: ReturnType<typeof s>;
        readonly expectDomainRef: (bc: BoundedContext) => void;
    }

    const domainReferenceCases: readonly DomainReferenceCase[] = [
        {
            scenario: 'forward references resolve when domain is defined after BC',
            input: s`
                BoundedContext OrderContext for Sales {
                    description: "References domain defined later"
                }

                Domain Sales {
                    vision: "Defined after BC"
                }
            `,
            expectDomainRef: bc => {
                expect(bc.domain?.ref?.name).toBe('Sales');
            },
        },
        {
            scenario: 'unresolved domain reference produces error',
            input: s`
                BoundedContext OrderContext for NonExistentDomain
            `,
            expectDomainRef: bc => {
                expect(bc.domain?.ref).toBeUndefined();
                expect(bc.domain?.error).not.toBeUndefined();
            },
        },
    ];

    test.each(domainReferenceCases)('$scenario', async ({ input, expectDomainRef }) => {
        // Arrange & Act
        const document = await testServices.parse(input);
        expectParsedDocument(document);

        // Assert
        const bc = getFirstBoundedContext(document);
        expectDomainRef(bc);
    });
});

// ============================================================================
// TEAM AND CLASSIFICATION REFERENCE LINKING
// ============================================================================

describe('Team and Classification Reference Linking', () => {

    interface RefLinkingCase {
        readonly refType: 'team' | 'classification';
        readonly scenario: string;
        readonly input: ReturnType<typeof s>;
        readonly expectRef: (bc: BoundedContext) => void;
    }

    const refLinkingCases: readonly RefLinkingCase[] = [
        {
            refType: 'team',
            scenario: 'team in inline "by" keyword syntax',
            input: s`
                Domain Sales {}
                Team SalesTeam

                bc OrderContext for Sales by SalesTeam
            `,
            expectRef: bc => {
                expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam');
            },
        },
        {
            refType: 'team',
            scenario: 'team in documentation block syntax',
            input: s`
                Domain Sales {}
                Team ProductTeam

                BoundedContext OrderContext for Sales {
                    team: ProductTeam
                }
            `,
            expectRef: bc => {
                expect(bc.team?.[0]?.ref?.name).toBe('ProductTeam');
            },
        },
        {
            refType: 'classification',
            scenario: 'classification in inline "as" syntax',
            input: s`
                Domain Sales {}
                Classification Core

                bc OrderContext for Sales as Core
            `,
            expectRef: bc => {
                expect(bc.classification?.[0]?.ref?.name).toBe('Core');
            },
        },
        {
            refType: 'classification',
            scenario: 'classification in decision bracket syntax',
            input: s`
                Classification Architectural
                Domain Sales {}

                BoundedContext OrderContext for Sales {
                    decisions {
                        decision [Architectural] UseEvents: "Use event sourcing"
                    }
                }
            `,
            expectRef: bc => {
                expect(bc.decisions?.[0]?.classification?.ref?.name).toBe('Architectural');
            },
        },
    ];

    test.each(refLinkingCases)('$refType: $scenario', async ({ input, expectRef }) => {
        // Arrange & Act
        const document = await testServices.parse(input);
        expectParsedDocument(document);

        // Assert
        const bc = getFirstBoundedContext(document);
        expectRef(bc);
    });

    // Qualified references
    test('qualified team reference across namespaces resolves correctly', async () => {
        // Arrange
        const input = s`
            Namespace company.teams {
                Team EngineeringTeam
            }

            Domain Sales {}

            BoundedContext OrderContext for Sales {
                team: company.teams.EngineeringTeam
            }
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const bc = getFirstBoundedContext(document);

        // Assert
        expect(bc.team?.[0]?.ref?.name).toBe('EngineeringTeam');
    });

    test('qualified classification reference across namespaces resolves correctly', async () => {
        // Arrange
        const input = s`
            Namespace governance {
                Classification Technical
            }

            Domain Sales {}

            BoundedContext OrderContext for Sales {
                decisions {
                    decision [governance.Technical] Database: "Use PostgreSQL"
                }
            }
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const bc = getFirstBoundedContext(document);
        const decisions = bc.decisions ?? [];

        // Assert
        expect(decisions[0]?.classification?.ref?.name).toBe('Technical');
    });

    // Classification in domain type block
    test('classification type in domain type block resolves correctly', async () => {
        // Arrange
        const input = s`
            Classification Strategic

            Domain Sales {
                vision: "Core sales"
                type: Strategic
            }
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const domain = document.parseResult.value.children.find(c => c.$type === 'Domain') as any;

        // Assert
        expect(domain.type?.ref?.name).toBe('Strategic');
    });
});

// ============================================================================
// DOMAIN MAP LINKING
// ============================================================================

describe('DomainMap Linking', () => {

    test('DomainMap resolves domain references with correct sorted names', async () => {
        // Arrange
        const input = s`
            Domain Sales {
                vision: "Sales domain"
            }
            Domain Marketing {
                vision: "Marketing domain"
            }

            DomainMap BusinessDomains {
                contains Sales, Marketing
            }
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const domainMap = document.parseResult.value.children.find(isDomainMap) as DomainMap;

        // Assert
        expect(domainMap.domains).toHaveLength(2);

        const domainNames = domainMap.domains.map(d => d.items[0]?.ref?.name).sort((a, b) => (a ?? '').localeCompare(b ?? ''));
        expect(domainNames).toEqual(['Marketing', 'Sales']);
    });

    interface DomainMapCase {
        readonly scenario: string;
        readonly input: ReturnType<typeof s>;
        readonly expectCheck: (dm: DomainMap) => void;
    }

    const domainMapCases: readonly DomainMapCase[] = [
        {
            scenario: 'qualified domain references across namespaces',
            input: s`
                Namespace company {
                    Domain Sales {
                        vision: "Company sales"
                    }
                }

                DomainMap Portfolio {
                    contains company.Sales
                }
            `,
            expectCheck: dm => {
                expect(dm.domains[0].items[0]?.ref?.name).toBe('Sales');
            },
        },
        {
            scenario: 'unresolved domain references produce undefined ref',
            input: s`
                DomainMap EmptyMap {
                    contains NonExistentDomain
                }
            `,
            expectCheck: dm => {
                expect(dm.domains[0].items[0]?.ref).toBeUndefined();
            },
        },
    ];

    test.each(domainMapCases)('$scenario', async ({ input, expectCheck }) => {
        // Arrange & Act
        const document = await testServices.parse(input);
        expectParsedDocument(document);

        // Assert
        const domainMap = document.parseResult.value.children.find(isDomainMap) as DomainMap;
        expectCheck(domainMap);
    });
});

// ============================================================================
// THIS REFERENCE AND COMPLEX SCENARIOS
// ============================================================================

describe('This Reference and Complex Linking Scenarios', () => {

    test('this reference in BC relationships block resolves correctly', async () => {
        // Arrange
        const input = s`
            Domain Sales {}
            BoundedContext PaymentContext for Sales

            BoundedContext OrderContext for Sales {
                description: "Self-referencing context"
                relationships {
                    this [OHS] -> [CF] PaymentContext
                }
            }
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const bcs = document.parseResult.value.children.filter(isBoundedContext);
        const bcWithRelationships = bcs.find(bc => bc.relationships.length > 0);

        // Assert
        expect(bcWithRelationships?.name).toBe('OrderContext');
        if (!bcWithRelationships) {
            throw new Error('Expected BC with relationships to be present');
        }
        const rel = bcWithRelationships.relationships[0];
        expect(rel.left.$type).toBe('ThisRef');
        expect(rel.right.link?.ref?.name).toBe('PaymentContext');
    });

    test('cross-namespace team reference resolves correctly', async () => {
        // Arrange
        const input = s`
            Namespace sales {
                Domain Sales {
                    vision: "Sales domain"
                }
                Team SalesTeam
            }

            Namespace billing {
                Domain Billing {
                    vision: "Billing domain"
                }

                BoundedContext PaymentContext for Billing {
                    team: sales.SalesTeam
                }
            }
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const billingNs = document.parseResult.value.children.find(
            c => isNamespaceDeclaration(c) && c.name === 'billing'
        ) as any;
        const paymentBC = billingNs?.children.find(isBoundedContext) as BoundedContext;

        // Assert
        expect(paymentBC?.team?.[0]?.ref?.name).toBe('SalesTeam');
    });

    test('nested namespace qualified names resolve through full path', async () => {
        // Arrange
        const input = s`
            Namespace com.company {
                Namespace sales {
                    Domain Sales {
                        vision: "Nested sales domain"
                    }
                }
            }

            BoundedContext OrderContext for com.company.sales.Sales
        `;

        const document = await testServices.parse(input);

        // Act
        expectParsedDocument(document);
        const bc = getFirstBoundedContext(document);

        // Assert
        expect(bc.domain?.ref?.name).toBe('Sales');
    });
});