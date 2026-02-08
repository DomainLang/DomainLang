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
 * - Relationship type annotations parse correctly
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
import { setupTestSuite, expectValidDocument, getFirstBoundedContext, s } from '../test-helpers.js';
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
        const input = s`
            ContextMap FaultyMap {
                PaymentBC <- OrdersBC
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const ctxMap = document.parseResult.value.children.find(isContextMap);
        expect(ctxMap).toBeDefined();
        if (!ctxMap) return;

        expect(ctxMap.relationships).toHaveLength(1);
        const rel = ctxMap.relationships[0];
        expect(rel.left.link?.ref).toBeUndefined();
        expect(rel.left.link?.error).toBeDefined();
        expect(rel.right.link?.ref).toBeUndefined();
        expect(rel.right.link?.error).toBeDefined();
    });

    // SMOKE: resolved references in ContextMap
    test('resolved references in ContextMap have no error and correct participant names', async () => {
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
        expectValidDocument(document);
        const ctxMap = extractContextMaps(document.parseResult.value.children)[0];
        expect(ctxMap).toBeDefined();
        if (!ctxMap) return;

        expect(ctxMap.relationships).toHaveLength(1);
        const rel = ctxMap.relationships[0];
        expect(rel.left.link?.ref?.name).toBe('PaymentBC');
        expect(rel.left.link?.error).toBeUndefined();
        expect(rel.right.link?.ref?.name).toBe('OrdersBC');
        expect(rel.right.link?.error).toBeUndefined();
    });

    // EDGE: DDD pattern annotations resolve to correct BC names
    test('DDD pattern annotations resolve to correct BC names', async () => {
        const input = s`
            Domain Sales {}
            bc OrderContext for Sales
            bc PaymentContext for Sales

            ContextMap PatternMap {
                contains OrderContext, PaymentContext
                [OHS] OrderContext -> [CF] PaymentContext
                [ACL] PaymentContext <- [PL] OrderContext
                [SK] OrderContext <-> PaymentContext
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const ctxMap = document.parseResult.value.children.find(isContextMap) as ContextMap;
        expect(ctxMap.relationships).toHaveLength(3);

        // First relationship: OHS OrderContext -> CF PaymentContext
        expect(ctxMap.relationships[0].left.link?.ref?.name).toBe('OrderContext');
        expect(ctxMap.relationships[0].right.link?.ref?.name).toBe('PaymentContext');

        // Second relationship: ACL PaymentContext <- PL OrderContext
        expect(ctxMap.relationships[1].left.link?.ref?.name).toBe('PaymentContext');
        expect(ctxMap.relationships[1].right.link?.ref?.name).toBe('OrderContext');

        // Third relationship: SK OrderContext <-> PaymentContext
        expect(ctxMap.relationships[2].left.link?.ref?.name).toBe('OrderContext');
        expect(ctxMap.relationships[2].right.link?.ref?.name).toBe('PaymentContext');
    });

    // Relationship type annotations covered by parsing/relationships.test.ts
});

// ============================================================================
// DOMAIN REFERENCE LINKING
// ============================================================================

describe('Domain Reference Linking', () => {

    // SMOKE: basic domain reference
    test('BC domain reference resolves to correct domain name', async () => {
        const input = s`
            Domain Sales {
                vision: "Sales domain"
            }

            BoundedContext OrderContext for Sales
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.domain?.ref?.name).toBe('Sales');
    });

    // EDGE: parent domain subdomain hierarchy resolution
    test('parent domain references resolve through multi-level hierarchy', async () => {
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
        expectValidDocument(document);
        const model = document.parseResult.value;
        const salesDomain = model.children.find(n => isDomain(n) && n.name === 'Sales') as Domain;
        const retailDomain = model.children.find(n => isDomain(n) && n.name === 'RetailSales') as Domain;

        expect(salesDomain.parent?.ref?.name).toBe('Commerce');
        expect(retailDomain.parent?.ref?.name).toBe('Sales');
    });

    // EDGE: forward references (BC defined before domain)
    test('forward references resolve when domain is defined after BC', async () => {
        const input = s`
            BoundedContext OrderContext for Sales {
                description: "References domain defined later"
            }

            Domain Sales {
                vision: "Defined after BC"
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.domain?.ref?.name).toBe('Sales');
    });

    // EDGE: unresolved domain reference
    test('unresolved domain reference produces error with undefined ref', async () => {
        const input = s`
            BoundedContext OrderContext for NonExistentDomain
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.domain?.ref).toBeUndefined();
        expect(bc.domain?.error).toBeDefined();
    });
});

// ============================================================================
// TEAM REFERENCE LINKING
// ============================================================================

describe('Team Reference Linking', () => {

    // EDGE: team in inline "by" syntax and doc block syntax
    test('team references resolve in both inline "by" keyword and documentation block syntax', async () => {
        // Inline "by" syntax
        const inlineDoc = await testServices.parse(s`
            Domain Sales {}
            Team SalesTeam

            bc OrderContext for Sales by SalesTeam
        `);
        expectValidDocument(inlineDoc);
        const inlineBc = getFirstBoundedContext(inlineDoc);
        expect(inlineBc.team?.[0]?.ref?.name).toBe('SalesTeam');

        // Documentation block syntax
        const blockDoc = await testServices.parse(s`
            Domain Sales {}
            Team ProductTeam

            BoundedContext OrderContext for Sales {
                team: ProductTeam
            }
        `);
        expectValidDocument(blockDoc);
        const blockBc = getFirstBoundedContext(blockDoc);
        expect(blockBc.team?.[0]?.ref?.name).toBe('ProductTeam');
    });

    // EDGE: qualified team reference across namespace
    test('qualified team reference across namespaces resolves correctly', async () => {
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
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.team?.[0]?.ref?.name).toBe('EngineeringTeam');
    });
});

// ============================================================================
// CLASSIFICATION REFERENCE LINKING
// ============================================================================

describe('Classification Reference Linking', () => {

    // EDGE: classification in inline "as" syntax
    test('classification in inline "as" syntax resolves correctly', async () => {
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

    // EDGE: type in domain type block
    test('classification type in domain type block resolves correctly', async () => {
        const input = s`
            Classification Strategic

            Domain Sales {
                vision: "Core sales"
                type: Strategic
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const domain = document.parseResult.value.children.find(c => c.$type === 'Domain') as any;
        expect(domain.type?.ref?.name).toBe('Strategic');
    });

    // EDGE: classification in decision bracket syntax
    test('classification in decision bracket syntax resolves correctly', async () => {
        const input = s`
            Classification Architectural
            Domain Sales {}

            BoundedContext OrderContext for Sales {
                decisions {
                    decision [Architectural] UseEvents: "Use event sourcing"
                }
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        const decisions = bc.decisions ?? [];
        expect(decisions[0]?.classification?.ref?.name).toBe('Architectural');
    });

    // EDGE: qualified classification reference
    test('qualified classification reference across namespaces resolves correctly', async () => {
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
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        const decisions = bc.decisions ?? [];
        expect(decisions[0]?.classification?.ref?.name).toBe('Technical');
    });
});

// ============================================================================
// DOMAIN MAP LINKING
// ============================================================================

describe('DomainMap Linking', () => {

    // EDGE: resolved domain references with correct names
    test('DomainMap resolves domain references with correct sorted names', async () => {
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
        expectValidDocument(document);
        const domainMap = document.parseResult.value.children.find(isDomainMap) as DomainMap;
        expect(domainMap.domains).toHaveLength(2);

        const domainNames = domainMap.domains.map(d => d.items[0]?.ref?.name).sort((a, b) => (a ?? '').localeCompare(b ?? ''));
        expect(domainNames).toEqual(['Marketing', 'Sales']);
    });

    // EDGE: qualified domain references
    test('qualified domain references in DomainMap resolve across namespaces', async () => {
        const input = s`
            Namespace company {
                Domain Sales {
                    vision: "Company sales"
                }
            }

            DomainMap Portfolio {
                contains company.Sales
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const domainMap = document.parseResult.value.children.find(isDomainMap) as DomainMap;
        expect(domainMap.domains[0].items[0]?.ref?.name).toBe('Sales');
    });

    // EDGE: unresolved domain references
    test('unresolved domain references in DomainMap produce undefined ref', async () => {
        const input = s`
            DomainMap EmptyMap {
                contains NonExistentDomain
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const domainMap = document.parseResult.value.children.find(isDomainMap) as DomainMap;
        expect(domainMap.domains[0].items[0]?.ref).toBeUndefined();
    });
});

// ============================================================================
// THIS REFERENCE IN RELATIONSHIPS
// ============================================================================

describe('This Reference Linking', () => {

    // EDGE: "this" reference resolves in BC relationships block
    test('this reference in BC relationships block resolves participant and has ThisRef type', async () => {
        const input = s`
            Domain Sales {}
            BoundedContext PaymentContext for Sales

            BoundedContext OrderContext for Sales {
                description: "Self-referencing context"
                relationships {
                    [OHS] this -> [CF] PaymentContext
                }
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bcs = document.parseResult.value.children.filter(isBoundedContext);
        const bcWithRelationships = bcs.find(bc => bc.relationships.length > 0);

        expect(bcWithRelationships).toBeDefined();
        if (bcWithRelationships) {
            const rel = bcWithRelationships.relationships[0];
            // 'this' is represented by ThisRef type, not a link
            expect(rel.left.$type).toBe('ThisRef');
            expect(rel.right.link?.ref?.name).toBe('PaymentContext');
        }
    });
});

// ============================================================================
// COMPLEX LINKING SCENARIOS
// ============================================================================

describe('Complex Linking Scenarios', () => {

    // EDGE: cross-namespace reference
    test('cross-namespace team reference resolves correctly', async () => {
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
        expectValidDocument(document);
        const billingNs = document.parseResult.value.children.find(
            c => isNamespaceDeclaration(c) && c.name === 'billing'
        ) as any;
        const paymentBC = billingNs?.children.find(isBoundedContext) as BoundedContext;
        expect(paymentBC?.team?.[0]?.ref?.name).toBe('SalesTeam');
    });

    // EDGE: nested namespace qualified names
    test('nested namespace qualified names resolve through full path', async () => {
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
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        expect(bc.domain?.ref?.name).toBe('Sales');
    });

    // EDGE: metadata reference in BC metadata block
    test('metadata references in BC metadata block resolve correctly', async () => {
        const input = s`
            Domain Sales {}
            Metadata Language
            Metadata Framework

            bc OrderContext for Sales {
                metadata {
                    Language: "TypeScript"
                    Framework: "Express"
                }
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);
        const bc = getFirstBoundedContext(document);
        const metadata = bc.metadata ?? [];
        expect(metadata).toHaveLength(2);
        expect(metadata[0]?.key?.ref?.name).toBe('Language');
        expect(metadata[1]?.key?.ref?.name).toBe('Framework');
    });
});
