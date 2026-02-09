/**
 * Grammar Completeness Tests
 *
 * These tests ensure every grammar rule can be parsed successfully
 * AND that the parsed AST contains the correct values.
 * Organized by grammar sections (specialized tests cover sections 5-6):
 *
 * 1. Entry Point & Model Structure
 * 2. DDD Strategic Design (Domains, Bounded Contexts)
 * 3. DDD Tactical Design (Teams, Classifications)
 * 4. Architecture Mapping (Context Maps, Domain Maps)
 * 7. Module System (Imports & Namespaces)
 * 8. Terminals & Lexical Grammar
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, expectGrammarRuleRejectsInput, s } from '../test-helpers.js';
import type { BoundedContext } from '../../src/generated/ast.js';
import { isBoundedContext, isDomain, isNamespaceDeclaration } from '../../src/generated/ast.js';

describe('Grammar Completeness Tests', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    // ========================================================================
    // SECTION 1: ENTRY POINT & MODEL STRUCTURE
    // ========================================================================

    describe('Section 1: Entry Point & Model Structure', () => {
        test('Model - empty model has no children or imports', async () => {
            // Arrange & Act
            const document = await testServices.parse(`// Empty model`);

            // Assert
            expectValidDocument(document);
            const model = document.parseResult.value;
            expect(model.children).toHaveLength(0);
            expect(model.imports).toHaveLength(0);
        });

        test('Model - with imports and children parses correct counts', async () => {
            // Arrange & Act
            const input = s`
                import "./types.dlang"
                Domain Test {}
                Team TestTeam
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(1);
            expect(model.imports[0].uri).toBe('./types.dlang');
            expect(model.children).toHaveLength(2);
        });

        test('StructureElement - all variants parse with correct types and nesting', async () => {
            // Arrange & Act
            const input = s`
                Domain TestDomain {}
                BoundedContext TestBC for TestDomain
                Team TestTeam
                Classification TestClass
                ContextMap TestMap { contains TestBC }
                DomainMap TestDomainMap { contains TestDomain }
                Namespace grouped {
                    Namespace nested {
                        Domain NestedDomain {}
                    }
                }
                Namespace test.pkg { Domain PkgDomain {} }
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const model = document.parseResult.value;

            // 8 top-level children: Domain, BC, Team, Classification, ContextMap, DomainMap, 2 Namespaces
            expect(model.children).toHaveLength(8);

            const namespaces = model.children.filter(isNamespaceDeclaration);
            expect(namespaces).toHaveLength(2);
            expect(namespaces[0].name).toBe('grouped');
            expect(namespaces[0].children).toHaveLength(1); // nested Namespace
            expect(namespaces[1].name).toBe('test.pkg');
        });
    });

    // ========================================================================
    // SECTION 2: DDD STRATEGIC DESIGN - DOMAINS & BOUNDED CONTEXTS
    // ========================================================================

    describe('Section 2: DDD Strategic Design', () => {
        test('Domain - minimal syntax and parent domain', async () => {
            // Arrange & Act
            const input = s`
                Domain Parent {}
                Domain Child in Parent {}
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const domains = document.parseResult.value.children.filter(isDomain);

            expect(domains).toHaveLength(2);
            expect(domains[0].name).toBe('Parent');
            expect(domains[0].parent).toBeUndefined();
            expect(domains[1].name).toBe('Child');
            expect(domains[1].parent?.ref?.name).toBe('Parent');
        });

        test('Domain - with qualified parent name resolves reference', async () => {
            // Arrange & Act
            const input = s`
                Namespace com.example {
                    Domain Parent {}
                }
                Domain Child in com.example.Parent {}
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const domains = document.parseResult.value.children.filter(isDomain);
            const child = domains.find(d => d.name === 'Child')!;
            expect(child.parent?.ref?.name).toBe('Parent');
        });

        test('Domain - deep subdomain chain (3+ levels) resolves references', async () => {
            // Arrange - 3 levels: Enterprise > Division > Unit
            const input = s`
                Domain Enterprise {}
                Domain Division in Enterprise {}
                Domain Unit in Division {}
            `;

            // Act
            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const domains = document.parseResult.value.children.filter(isDomain);
            expect(domains).toHaveLength(3);
            expect(domains[0].name).toBe('Enterprise');
            expect(domains[0].parent).toBeUndefined();
            expect(domains[1].name).toBe('Division');
            expect(domains[1].parent?.ref?.name).toBe('Enterprise');
            expect(domains[2].name).toBe('Unit');
            expect(domains[2].parent?.ref?.name).toBe('Division');
        });

        test('Domain - all documentation blocks parse with correct values', async () => {
            // Arrange & Act
            const input = s`
                Classification Core

                Domain Test {
                    description: "Test domain"
                    vision: "Test vision"
                    type: Core
                }
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const domain = document.parseResult.value.children.find(isDomain)!;

            expect(domain.name).toBe('Test');
            expect(domain.description).toBe('Test domain');
            expect(domain.vision).toBe('Test vision');
            expect(domain.type?.ref?.name).toBe('Core');
        });

        test('BoundedContext - minimal with domain reference', async () => {
            // Arrange & Act
            const input = s`
                Domain Test {}
                BoundedContext TestBC for Test
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const bc = document.parseResult.value.children.find(isBoundedContext)!;
            expect(bc.name).toBe('TestBC');
            expect(bc.domain?.ref?.name).toBe('Test');
        });

        // 'inline classification and team' covered by syntax-variants.test.ts

        test('BoundedContext - all documentation blocks populate correctly', async () => {
            // Arrange & Act
            const input = s`
                Domain Test {}
                Team TestTeam
                Classification Core
                Classification SaaS
                Classification Mature
                Classification Architectural
                Classification Business
                Classification Technical

                BoundedContext TestBC for Test {
                    description: "Test context"
                    classification: Core
                    team: TestTeam
                    businessModel: SaaS
                    evolution: Mature

                    relationships {
                        [OHS] this -> [CF] TestBC : CustomerSupplier
                    }

                    terminology {
                        term Order: "Customer order"
                        Term Product: "Item for sale" aka Item examples "Laptop", "Mouse"
                    }

                    decisions {
                        decision [Architectural] EventSourcing: "Use event sourcing"
                        policy [Business] Returns: "30-day returns"
                        rule [Technical] Validation: "Validate inputs"
                    }
                }
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const bc = document.parseResult.value.children.find(isBoundedContext) as BoundedContext;

            expect(bc.description).toBe('Test context');
            expect(bc.classification[0]?.ref?.name).toBe('Core');
            expect(bc.team[0]?.ref?.name).toBe('TestTeam');
            expect(bc.businessModel?.ref?.name).toBe('SaaS');
            expect(bc.evolution?.ref?.name).toBe('Mature');
            expect(bc.relationships).toHaveLength(1);
            expect(bc.terminology).toHaveLength(2);
            expect(bc.terminology[0].name).toBe('Order');
            expect(bc.terminology[1].synonyms).toContain('Item');
            expect(bc.decisions).toHaveLength(3);
            expect(bc.decisions[0].$type).toBe('Decision');
            expect(bc.decisions[1].$type).toBe('Policy');
            expect(bc.decisions[2].$type).toBe('BusinessRule');
        });
    });

    // Sections 3 (Team/Classification) and 4 (ContextMap/DomainMap) covered by syntax-variants.test.ts

    // ========================================================================
    // SECTION 7: MODULE SYSTEM - IMPORTS & NAMESPACES
    // ========================================================================

    // Section 7: ImportStatement all formats covered by import-statements.test.ts

    describe('Section 7: Module System', () => {
        test('Namespace - nested structure with correct hierarchy', async () => {
            // Arrange & Act
            const input = s`
                Namespace com.example.sales {
                    Domain Sales {}
                    Team SalesTeam

                    Namespace orders {
                        BoundedContext OrderContext for Sales
                    }
                }
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const ns = document.parseResult.value.children.find(isNamespaceDeclaration)!;

            expect(ns.name).toBe('com.example.sales');
            expect(ns.children).toHaveLength(3); // Domain, Team, nested Namespace
            const nestedNs = ns.children.find(isNamespaceDeclaration)!;
            expect(nestedNs.name).toBe('orders');
            expect(nestedNs.children).toHaveLength(1);
        });

        test('QualifiedName - complex dotted names resolve correctly', async () => {
            // Arrange & Act
            const input = s`
                Namespace com.example.deep.pkg.name {
                    Domain Test {}
                }

                BoundedContext TestBC for com.example.deep.pkg.name.Test
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const bc = document.parseResult.value.children.find(isBoundedContext)!;
            expect(bc.name).toBe('TestBC');
            expect(bc.domain?.ref?.name).toBe('Test');
        });
    });

    // ========================================================================
    // SECTION 8: TERMINALS & LEXICAL GRAMMAR
    // ========================================================================

    describe('Section 8: Terminals & Lexical Grammar', () => {
        test('ID terminal - various formats parse as domain names', async () => {
            // Arrange & Act
            const input = s`
                Domain simple {}
                Domain with_underscores {}
                Domain with-hyphens {}
                Domain MixedCase123 {}
                Domain _startsWithUnderscore {}
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const domains = document.parseResult.value.children.filter(isDomain);

            expect(domains).toHaveLength(5);
            expect(domains.map(d => d.name)).toEqual([
                'simple', 'with_underscores', 'with-hyphens', 'MixedCase123', '_startsWithUnderscore'
            ]);
        });

        test('STRING terminal - both quote types preserve content', async () => {
            // Arrange & Act
            const input = s`
                Domain Test {
                    description: "Double quoted string"
                    vision: 'Single quoted string'
                }
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const domain = document.parseResult.value.children.find(isDomain)!;

            expect(domain.description).toBe('Double quoted string');
            expect(domain.vision).toBe('Single quoted string');
        });

        test('Comments - do not affect parsing', async () => {
            // Arrange & Act
            const input = s`
                // Single line comment
                /* Multi-line
                   comment */
                Domain Test {
                    // Inline comment
                    description: "Test" /* Another comment */
                }
            `;

            const document = await testServices.parse(input);

            // Assert
            expectValidDocument(document);
            const domain = document.parseResult.value.children.find(isDomain)!;
            expect(domain.name).toBe('Test');
            expect(domain.description).toBe('Test');
        });

        // 'Assignment operators' covered by syntax-variants.test.ts
    });

    // ========================================================================
    // NEGATIVE TESTS: INVALID SYNTAX
    // ========================================================================

    describe('Negative: Invalid Syntax', () => {
        test('rejects unclosed block', async () => {
            // Arrange, Act & Assert
            await expectGrammarRuleRejectsInput(
                testServices.parse,
                'Domain Test {',
                'Unclosed block'
            );
        });

        test('rejects empty domain name', async () => {
            // Arrange, Act & Assert
            await expectGrammarRuleRejectsInput(
                testServices.parse,
                'Domain {}',
                'Missing domain name'
            );
        });

        test('rejects nested BoundedContext inside BoundedContext', async () => {
            // Arrange, Act & Assert
            await expectGrammarRuleRejectsInput(
                testServices.parse,
                s`
                    Domain Sales {}
                    bc Outer for Sales {
                        bc Inner for Sales {}
                    }
                `,
                'Nested BoundedContext inside BoundedContext'
            );
        });

        test('rejects ContextMap without opening brace', async () => {
            // Arrange, Act & Assert
            await expectGrammarRuleRejectsInput(
                testServices.parse,
                s`
                    Domain Test {}
                    bc BC1 for Test
                    ContextMap TestMap contains BC1
                `,
                'ContextMap without block'
            );
        });

        test('rejects domain with invalid nested keyword', async () => {
            // Arrange, Act & Assert
            await expectGrammarRuleRejectsInput(
                testServices.parse,
                s`
                    Domain Test {
                        contains Something
                    }
                `,
                'Invalid keyword in domain block'
            );
        });

        test('rejects relationship outside context map or BC block', async () => {
            // Arrange, Act & Assert
            await expectGrammarRuleRejectsInput(
                testServices.parse,
                s`
                    Domain Test {}
                    bc BC1 for Test
                    bc BC2 for Test
                    BC1 -> BC2
                `,
                'Relationship outside context map'
            );
        });

        test('rejects namespace with missing block', async () => {
            // Arrange, Act & Assert
            await expectGrammarRuleRejectsInput(
                testServices.parse,
                'Namespace com.example',
                'Namespace without block'
            );
        });
    });
});
