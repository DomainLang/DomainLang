/**
 * DomainLang Naming Utilities Tests
 *
 * Tests joinQualifiedName, toQualifiedName, and QualifiedNameProvider.
 * ~20% smoke (one consolidated nested namespace test), ~80% edge
 * (root-level, dotted namespace, empty/blank parent, string qualifier, joinQualifiedName edge cases).
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from 'vitest';
import { setupTestSuite } from '../test-helpers.js';
import { QualifiedNameProvider, toQualifiedName, joinQualifiedName } from '../../src/lsp/domain-lang-naming.js';
import { isDomain, isNamespaceDeclaration } from '../../src/generated/ast.js';

const qualifiedNames = new QualifiedNameProvider();

describe('domain-lang naming utilities', () => {
    const { parse } = setupTestSuite();

    // ========================================================================
    // Smoke: one consolidated nested namespace test
    // ========================================================================

    it('computes fully qualified names for nested namespaces', async () => {
        const document = await parse(`
            Namespace strategic.core {
                Namespace operations {
                    Domain Sales {}
                }
            }
        `);

        const model = document.parseResult.value;
        const rootNamespace = model.children.find(isNamespaceDeclaration)!;
        const innerNamespace = rootNamespace.children.find(isNamespaceDeclaration)!;
        const domain = innerNamespace.children.find(isDomain)!;

        // Provider path
        expect(qualifiedNames.getQualifiedName(domain.$container, domain.name))
            .toBe('strategic.core.operations.Sales');

        // toQualifiedName path
        expect(toQualifiedName(innerNamespace, domain.name))
            .toBe('strategic.core.operations.Sales');
    });

    // ========================================================================
    // Edge: joinQualifiedName function
    // ========================================================================

    describe('Edge: joinQualifiedName', () => {

        it('joins parent and child with dot separator', () => {
            expect(joinQualifiedName('acme', 'Sales')).toBe('acme.Sales');
        });

        it('returns child only when parent is empty string', () => {
            expect(joinQualifiedName('', 'Sales')).toBe('Sales');
        });

        it('handles dotted parent name', () => {
            expect(joinQualifiedName('acme.core', 'Sales')).toBe('acme.core.Sales');
        });

        it('handles deeply nested dotted name', () => {
            expect(joinQualifiedName('a.b.c.d', 'e')).toBe('a.b.c.d.e');
        });

        it('handles single-character names', () => {
            expect(joinQualifiedName('a', 'b')).toBe('a.b');
        });
    });

    // ========================================================================
    // Edge: QualifiedNameProvider with namespace structures
    // ========================================================================

    describe('Edge: QualifiedNameProvider', () => {

        it('root-level domain (no namespace) returns simple name', async () => {
            const document = await parse(`
                Domain Sales {}
            `);

            const model = document.parseResult.value;
            const domain = model.children.find(isDomain)!;

            // Container is the Model, which produces empty prefix
            const qualified = qualifiedNames.getQualifiedName(domain.$container, domain.name);
            expect(qualified).toBe('Sales');
        });

        it('single-level namespace returns namespace.name', async () => {
            const document = await parse(`
                Namespace acme {
                    Domain Sales {}
                }
            `);

            const model = document.parseResult.value;
            const ns = model.children.find(isNamespaceDeclaration)!;
            const domain = ns.children.find(isDomain)!;

            expect(qualifiedNames.getQualifiedName(domain.$container, domain.name))
                .toBe('acme.Sales');
        });

        it('dotted namespace name expands to full FQN', async () => {
            const document = await parse(`
                Namespace acme.retail.sales {
                    Domain Orders {}
                }
            `);

            const model = document.parseResult.value;
            const ns = model.children.find(isNamespaceDeclaration)!;
            const domain = ns.children.find(isDomain)!;

            expect(qualifiedNames.getQualifiedName(domain.$container, domain.name))
                .toBe('acme.retail.sales.Orders');
        });

        it('deeply nested namespace blocks produce full FQN', async () => {
            const document = await parse(`
                Namespace a {
                    Namespace b {
                        Namespace c {
                            Domain X {}
                        }
                    }
                }
            `);

            const model = document.parseResult.value;
            const nsA = model.children.find(isNamespaceDeclaration)!;
            const nsB = nsA.children.find(isNamespaceDeclaration)!;
            const nsC = nsB.children.find(isNamespaceDeclaration)!;
            const domain = nsC.children.find(isDomain)!;

            expect(qualifiedNames.getQualifiedName(domain.$container, domain.name))
                .toBe('a.b.c.X');
        });

        it('string qualifier is used as-is prefix', () => {
            expect(qualifiedNames.getQualifiedName('custom.prefix', 'Element'))
                .toBe('custom.prefix.Element');
        });

        it('empty string qualifier returns just the name', () => {
            expect(qualifiedNames.getQualifiedName('', 'Element'))
                .toBe('Element');
        });
    });

    // ========================================================================
    // Edge: toQualifiedName function
    // ========================================================================

    describe('Edge: toQualifiedName', () => {

        it('works with single-level namespace', async () => {
            const document = await parse(`
                Namespace sales {
                    Domain X {}
                }
            `);

            const model = document.parseResult.value;
            const ns = model.children.find(isNamespaceDeclaration)!;
            const domain = ns.children.find(isDomain)!;

            expect(toQualifiedName(ns, domain.name)).toBe('sales.X');
        });

        it('works with two levels of nested namespaces', async () => {
            const document = await parse(`
                Namespace company {
                    Namespace sales {
                        Domain Orders {}
                    }
                }
            `);

            const model = document.parseResult.value;
            const companyNs = model.children.find(isNamespaceDeclaration)!;
            const salesNs = companyNs.children.find(isNamespaceDeclaration)!;
            const domain = salesNs.children.find(isDomain)!;

            expect(toQualifiedName(salesNs, domain.name)).toBe('company.sales.Orders');
        });
    });
});
