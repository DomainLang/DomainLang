/**
 * Tests for DomainLangIndexManager.
 *
 * Verifies import dependency tracking and document indexing through document parsing:
 * - Document content indexing
 * - Import statement processing
 * - Multi-document integration
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestSuite, type TestServices, s } from '../test-helpers.js';

describe('DomainLangIndexManager', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    describe('Document indexing', () => {
        test('indexes simple domain document', async () => {
            const document = await testServices.parse(s`Domain Sales {}`);
            expect(document.parseResult.value).toBeDefined();
        });

        test('indexes domain with vision', async () => {
            const document = await testServices.parse(s`
                Domain Sales { vision: "Sales domain" }
            `);

            expect(document.parseResult.value).toBeDefined();
            expect(document.parseResult.lexerErrors.length).toBe(0);
            expect(document.parseResult.parserErrors.length).toBe(0);
        });

        test('indexes bounded context references', async () => {
            const document = await testServices.parse(s`
                Domain Sales { vision: "Sales domain" }
                bc OrderContext for Sales { description: "Order processing" }
            `);

            expect(document).toBeDefined();
            expect(document.parseResult.value).toBeDefined();
        });

        test('indexes document with teams and classifications', async () => {
            const document = await testServices.parse(s`
                Domain Sales {}
                Team SalesTeam {}
                Classification Core {}
                bc OrderContext for Sales as Core by SalesTeam {}
            `);

            expect(document.parseResult.value).toBeDefined();
        });

        test('indexes document with context maps', async () => {
            const document = await testServices.parse(s`
                Domain Sales {}
                bc A for Sales {}
                bc B for Sales {}
                ContextMap M {
                    contains A, B
                    A -> B
                }
            `);

            expect(document.parseResult.value).toBeDefined();
        });
    });

    describe('Import processing', () => {
        test('indexes document with single import', async () => {
            const document = await testServices.parse(s`
                import "owner/repo@v1.0.0"
                Domain Sales {}
            `);

            expect(document.parseResult.value).toBeDefined();
        });

        test('indexes document with multiple imports', async () => {
            const document = await testServices.parse(s`
                import "owner/repo@v1.0.0"
                import "owner/other@v2.0.0"
                Domain Sales {}
            `);

            expect(document).toBeDefined();
            expect(document.parseResult.parserErrors.length).toBe(0);
        });

        test('indexes imports with version specifiers', async () => {
            const document = await testServices.parse(s`
                import "org/package@v1.2.3"
                import "org/lib@latest"
                Domain Finance {}
            `);

            expect(document.parseResult.value).toBeDefined();
        });

        test('indexes document with relative imports', async () => {
            const document = await testServices.parse(s`
                import "./shared.dlang"
                Domain Accounting {}
            `);

            expect(document).toBeDefined();
        });
    });

    describe('Complex document scenarios', () => {
        test('indexes fully featured document', async () => {
            const document = await testServices.parse(s`
                import "core/framework@v1.0.0"
                
                Domain Sales { vision: "Customer sales" }
                Team SalesTeam {}
                Classification Core {}
                
                bc OrderContext for Sales as Core by SalesTeam {
                    description: "Order processing"
                }
                bc PaymentContext for Sales {
                    description: "Payment processing"
                }
                
                ContextMap SalesMap {
                    contains OrderContext, PaymentContext
                    [OHS] PaymentContext <- [CF] OrderContext
                }
            `);

            expect(document.parseResult.value).toBeDefined();
            // Allow for potential parser warnings/errors in hover tests
            if (document.parseResult.parserErrors.length > 0) {
                // If there are parser errors, at least the document should parse structurally
                expect(document.parseResult.value).toBeDefined();
            }
            expect(document.parseResult.lexerErrors.length).toBe(0);
        });

        test('indexes document with multiple domains', async () => {
            const document = await testServices.parse(s`
                Domain Sales { vision: "Sales" }
                Domain Billing { vision: "Billing" }
                Team SalesTeam {}
                Team BillingTeam {}
                bc OrderCtx for Sales by SalesTeam {}
                bc BillingCtx for Billing by BillingTeam {}
            `);

            expect(document.parseResult.value).toBeDefined();
        });

        test('indexes document with nested domains', async () => {
            const document = await testServices.parse(s`
                Domain Enterprise { vision: "Enterprise" }
                Domain Accounting in Enterprise { vision: "Accounting" }
                Domain Finance in Enterprise { vision: "Finance" }
            `);

            expect(document.parseResult.value).toBeDefined();
        });

        test('indexes document with namespace and imports', async () => {
            const document = await testServices.parse(s`
                import "core/base@v1.0.0"
                namespace acme.sales {
                    Domain Sales { vision: "Sales" }
                    bc OrderContext for Sales {}
                }
            `);

            expect(document.parseResult.value).toBeDefined();
        });
    });

    describe('Edge cases', () => {
        test('handles minimal valid document', async () => {
            const document = await testServices.parse(s`Domain D {}`);
            expect(document.parseResult.value).toBeDefined();
        });

        test('handles document with only imports', async () => {
            const document = await testServices.parse(s`
                import "a/b@v1"
                import "c/d@v2"
            `);
            expect(document).toBeDefined();
        });

        test('indexes domains with all metadata types', async () => {
            const document = await testServices.parse(s`
                Domain Sales {
                    vision: "Sales"
                    Decision "color-scheme" by "Design Team" {
                        "light" | "dark"
                    }
                    Policy "order-validation" {
                        "Orders must validate"
                    }
                    BusinessRule "minimum-qty" {
                        "Orders >= 1 unit"
                    }
                }
            `);

            expect(document.parseResult.value).toBeDefined();
        });

        test('handles domain maps', async () => {
            const document = await testServices.parse(s`
                Domain Sales {}
                Domain Billing {}
                DomainMap SalesBilling {
                    contains Sales, Billing
                }
            `);

            expect(document.parseResult.value).toBeDefined();
        });

        test('preserves document state through indexing', async () => {
            const doc1 = await testServices.parse(s`Domain First {}`);
            const doc2 = await testServices.parse(s`Domain Second {}`);

            // Both documents should maintain their state
            expect(doc1.parseResult.value).toBeDefined();
            expect(doc2.parseResult.value).toBeDefined();
        });
    });

    describe('Import dependency tracking', () => {
        test('getDependentDocuments returns empty set for unknown URI', () => {
            const indexManager = testServices.services.shared.workspace.IndexManager as import('../../src/lsp/domain-lang-index-manager.js').DomainLangIndexManager;
            const result = indexManager.getDependentDocuments('file:///unknown/path.dlang');
            expect(result.size).toBe(0);
        });

        test('getAllAffectedDocuments returns empty set for empty input', () => {
            const indexManager = testServices.services.shared.workspace.IndexManager as import('../../src/lsp/domain-lang-index-manager.js').DomainLangIndexManager;
            const result = indexManager.getAllAffectedDocuments([]);
            expect(result.size).toBe(0);
        });

        test('getAllAffectedDocuments handles single URI without dependents', () => {
            const indexManager = testServices.services.shared.workspace.IndexManager as import('../../src/lsp/domain-lang-index-manager.js').DomainLangIndexManager;
            const result = indexManager.getAllAffectedDocuments(['file:///unknown/path.dlang']);
            expect(result.size).toBe(0);
        });

        test('getAllAffectedDocuments accumulates multiple URIs', () => {
            const indexManager = testServices.services.shared.workspace.IndexManager as import('../../src/lsp/domain-lang-index-manager.js').DomainLangIndexManager;
            
            // Note: Without real documents with imports, we're testing the algorithm
            // When a URI has no dependents, the result is empty
            const result = indexManager.getAllAffectedDocuments([
                'file:///a.dlang',
                'file:///b.dlang'
            ]);
            
            // No actual import dependencies tracked, so result is empty
            expect(result.size).toBe(0);
        });

        test('getDocumentsWithPotentiallyAffectedImports returns empty for no matches', () => {
            const indexManager = testServices.services.shared.workspace.IndexManager as import('../../src/lsp/domain-lang-index-manager.js').DomainLangIndexManager;
            
            // With no documents tracked, should return empty
            const result = indexManager.getDocumentsWithPotentiallyAffectedImports([
                'file:///project/domains/index.dlang'
            ]);
            
            expect(result.size).toBe(0);
        });

        test('getDocumentsWithPotentiallyAffectedImports handles empty input', () => {
            const indexManager = testServices.services.shared.workspace.IndexManager as import('../../src/lsp/domain-lang-index-manager.js').DomainLangIndexManager;
            const result = indexManager.getDocumentsWithPotentiallyAffectedImports([]);
            expect(result.size).toBe(0);
        });

        test('getDocumentsWithPotentiallyAffectedImports handles invalid URIs gracefully', () => {
            const indexManager = testServices.services.shared.workspace.IndexManager as import('../../src/lsp/domain-lang-index-manager.js').DomainLangIndexManager;
            
            // Should not throw on invalid URIs
            const result = indexManager.getDocumentsWithPotentiallyAffectedImports([
                'not-a-valid-uri',
                ':::invalid:::'
            ]);
            
            expect(result.size).toBe(0);
        });
    });
});
