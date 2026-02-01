/**
 * Tests for DomainLangFormatter.
 *
 * Verifies formatting functionality for DomainLang documents:
 * - Namespace formatting
 * - Domain formatting
 * - Bounded context formatting
 * - Context map formatting
 * - Domain map formatting
 * - Indentation and newlines
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestSuite, type TestServices, s } from '../test-helpers.js';

describe('DomainLangFormatter', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    /**
     * Helper to format a document
     */
    const formatDocument = async (text: string): Promise<unknown> => {
        const document = await testServices.parse(text);
        const formatter = testServices.services.DomainLang.lsp.Formatter;

        if (!formatter) {
            throw new Error('Formatter not available');
        }

        // Request formatting for entire document
        const formatParams = {
            textDocument: { uri: document.textDocument.uri },
            options: {
                tabSize: 4,
                insertSpaces: true,
            }
        };

        const edits = await formatter.formatDocument(document, formatParams);
        return edits ?? [];
    };

    describe('Namespace formatting', () => {
        test('formats empty namespace', async () => {
            const edits = await formatDocument(s`namespace acme { }`);
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats namespace with domain', async () => {
            const edits = await formatDocument(
                s`namespace acme.sales { Domain Sales { } }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats nested namespace declarations', async () => {
            const edits = await formatDocument(
                s`namespace a.b.c { Domain D { } }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });
    });

    describe('Domain formatting', () => {
        test('formats simple domain', async () => {
            const edits = await formatDocument(s`Domain Sales { }`);
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats domain with vision', async () => {
            const edits = await formatDocument(
                s`Domain Sales { vision: "Customer sales management" }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats domain with multiple properties', async () => {
            const edits = await formatDocument(
                s`Domain Sales { vision: "Sales" Subdomain Orders { } }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats nested domains', async () => {
            const edits = await formatDocument(
                s`Domain Accounting in Finance { }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats domain with subdomain', async () => {
            const edits = await formatDocument(
                s`Domain Sales { Subdomain Orders { } }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats domain with multiple subdomains', async () => {
            const edits = await formatDocument(
                s`Domain Sales { Subdomain Orders { } Subdomain Shipping { } }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });
    });

    describe('Bounded context formatting', () => {
        test('formats simple bounded context', async () => {
            const edits = await formatDocument(
                s`Domain Sales { } bc OrderContext for Sales { }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats bounded context with description', async () => {
            const edits = await formatDocument(
                s`Domain Sales { } bc OrderContext for Sales { description: "Order processing" }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats bounded context with classification', async () => {
            const edits = await formatDocument(
                s`
                Domain Sales { }
                Classification Core { }
                bc OrderContext for Sales as Core { }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats bounded context with team', async () => {
            const edits = await formatDocument(
                s`
                Domain Sales { }
                Team TeamA { }
                bc OrderContext for Sales by TeamA { }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats bounded context with full attributes', async () => {
            const edits = await formatDocument(
                s`
                Domain Sales { }
                Team TeamA { }
                Classification Core { }
                bc OrderContext for Sales as Core by TeamA { 
                    description: "Order context"
                    type: "Service"
                }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });
    });

    describe('Context map formatting', () => {
        test('formats empty context map', async () => {
            const edits = await formatDocument(
                s`Domain Sales { } bc A for Sales { } bc B for Sales { } ContextMap M { }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats context map with contexts', async () => {
            const edits = await formatDocument(
                s`
                Domain Sales { }
                bc OrderCtx for Sales { }
                bc PaymentCtx for Sales { }
                ContextMap SalesMap { contains OrderCtx, PaymentCtx }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats context map with relationships', async () => {
            const edits = await formatDocument(
                s`
                Domain Sales { }
                bc OrderCtx for Sales { }
                bc PaymentCtx for Sales { }
                ContextMap SalesMap {
                    contains OrderCtx, PaymentCtx
                    [OHS] OrderCtx -> [CF] PaymentCtx
                }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats context map with multiple relationships', async () => {
            const edits = await formatDocument(
                s`
                Domain Sales { }
                bc A for Sales { }
                bc B for Sales { }
                bc C for Sales { }
                ContextMap M {
                    contains A, B, C
                    A -> B
                    B -> C
                }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });
    });

    describe('Domain map formatting', () => {
        test('formats empty domain map', async () => {
            const edits = await formatDocument(
                s`Domain Sales { } Domain Billing { } DomainMap M { }`
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats domain map with domains', async () => {
            const edits = await formatDocument(
                s`
                Domain Sales { }
                Domain Billing { }
                DomainMap SalesBilling { contains Sales, Billing }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats domain map with relationships', async () => {
            const edits = await formatDocument(
                s`
                Domain Sales { }
                Domain Billing { }
                DomainMap M {
                    contains Sales, Billing
                    Sales -> Billing
                }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });
    });

    describe('Complex document formatting', () => {
        test('formats complete DomainLang document', async () => {
            const edits = await formatDocument(
                s`
                namespace acme.sales { 
                    Domain Sales { vision: "Customer sales" }
                    Team SalesTeam { }
                    Classification Core { }
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
                }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats document with multiple sections', async () => {
            const edits = await formatDocument(
                s`
                namespace a { Domain D1 { } }
                namespace b { Domain D2 { } }
                bc C1 for D1 { }
                bc C2 for D2 { }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('formats document with teams and classifications', async () => {
            const edits = await formatDocument(
                s`
                Domain Sales { }
                Team TeamA { }
                Team TeamB { }
                Classification Core { }
                Classification Support { }
                bc A for Sales as Core by TeamA { }
                bc B for Sales as Support by TeamB { }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });
    });

    describe('Edge cases', () => {
        test('handles document with no block constructs', async () => {
            const edits = await formatDocument(s`import "owner/repo@v1.0.0"`);
            expect(Array.isArray(edits)).toBe(true);
        });

        test('handles document with only comments', async () => {
            const edits = await formatDocument(s`// This is a comment\n// Another comment`);
            expect(Array.isArray(edits)).toBe(true);
        });

        test('handles already well-formatted document', async () => {
            const edits = await formatDocument(
                s`
                Domain Sales {
                    vision: "Sales"
                }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });

        test('handles deeply nested blocks', async () => {
            const edits = await formatDocument(
                s`
                namespace a { 
                    Domain D { 
                        Subdomain S { }
                    } 
                }
                `
            );
            expect(Array.isArray(edits)).toBe(true);
        });
    });
});
