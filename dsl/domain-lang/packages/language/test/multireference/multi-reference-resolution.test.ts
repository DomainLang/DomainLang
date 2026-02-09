/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Tests for multi-target reference resolution.
 *
 * Smoke (~20%):
 * - BC belongs to exactly one domain (DDD compliance)
 *
 * Edge/error (~80%):
 * - ContextMap resolves same-name BCs from different domains into multi-ref
 * - DomainMap resolves each domain once via MultiReference
 * - ContextMap resolves distinct BCs by name via MultiReference
 * - Missing targets leave refs unresolved while existing ones still resolve
 * - Empty DomainMap has zero domain references
 * - ContextMap with mix of resolved and unresolved references
 *
 * Skipped:
 * - Namespace-qualified multi-reference (not yet supported with EmptyFileSystem)
 */

import { describe, test, expect, beforeAll } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, s } from '../test-helpers.js';
import type { BoundedContext, ContextMap, DomainMap } from '../../src/generated/ast.js';
import { isBoundedContext, isContextMap, isDomainMap } from '../../src/generated/ast.js';

describe('Multi-Target References', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    // ==========================================
    // SMOKE: BC belongs to exactly one domain
    // ==========================================
    test('BoundedContext domain ref resolves to correct single domain name', async () => {
        // Arrange
        const input = s`
            Domain Sales { description: "Sales operations" }
            Domain Marketing { description: "Marketing operations" }
            bc CustomerExperience for Sales { description: "Sales experience" }
        `;

        // Act
        const document = await testServices.parse(input);
        expectValidDocument(document);
        const model = document.parseResult.value;
        const bc = model.children.find(c => isBoundedContext(c) && c.name === 'CustomerExperience') as BoundedContext;

        // Assert
        // Single reference - a BC can only belong to ONE domain
        expect(bc.domain!.ref?.name).toBe('Sales');
    });

    // ==========================================
    // EDGE: same-name BCs from different domains multi-resolve
    // ==========================================
    test('ContextMap multi-resolves same-name BCs from different domains with correct item count and names', async () => {
        // Arrange
        const input = `
            Domain Sales {}
            Domain Billing {}

            bc Orders for Sales { description: "Sales orders" }
            bc Orders for Billing { description: "Billing orders" }

            ContextMap AllOrders {
                contains Orders
            }
        `;

        // Act
        const document = await testServices.parse(input);
        expectValidDocument(document);

        const model = document.parseResult.value;
        const contextMap = model.children.find(c => isContextMap(c) && c.name === 'AllOrders') as ContextMap;

        // Assert
        // Single reference name that resolves to multiple targets
        expect(contextMap.boundedContexts).toHaveLength(1);
        const ordersRef = contextMap.boundedContexts[0];
        expect(ordersRef.items).toHaveLength(2);
        expect(ordersRef.items.every((item) => item.ref?.name === 'Orders')).toBe(true);

        // Verify they belong to different domains
        const domains = ordersRef.items.map(item => (item.ref as BoundedContext).domain?.ref?.name).sort();
        expect(domains).toEqual(['Billing', 'Sales']);
    });

    // ==========================================
    // EDGE: DomainMap references each domain once
    // ==========================================
    test('DomainMap resolves each domain once via separate multi-references', async () => {
        // Arrange
        const input = `
            Domain Sales { description: "Sales domain" }
            Domain Marketing { description: "Marketing domain" }
            Domain Support { description: "Support domain" }

            DomainMap CorporatePortfolio {
                contains Sales, Marketing, Support
            }
        `;

        // Act
        const document = await testServices.parse(input);
        expectValidDocument(document);

        const model = document.parseResult.value;
        const domainMap = model.children.find(c => isDomainMap(c) && c.name === 'CorporatePortfolio') as DomainMap;

        // Assert
        // Three separate multi-references, each with 1 item
        expect(domainMap.domains).toHaveLength(3);

        const domainNames = domainMap.domains.map((d) =>
            d.items[0]?.ref?.name
        ).filter(Boolean).sort();

        expect(domainNames).toEqual(['Marketing', 'Sales', 'Support']);
    });

    // ==========================================
    // EDGE: ContextMap resolves distinct BCs
    // ==========================================
    test('ContextMap with distinct BC names resolves each to single target', async () => {
        // Arrange
        const input = `
            Domain Sales {}

            bc Orders for Sales { description: "Order management" }
            bc Pricing for Sales { description: "Pricing engine" }
            bc Catalog for Sales { description: "Product catalog" }

            ContextMap CoreSystems {
                contains Orders, Pricing, Catalog
            }
        `;

        // Act
        const document = await testServices.parse(input);
        expectValidDocument(document);

        const model = document.parseResult.value;
        const contextMap = model.children.find(c => isContextMap(c) && c.name === 'CoreSystems') as ContextMap;

        // Assert
        // Three separate multi-references, each resolving to one target
        expect(contextMap.boundedContexts).toHaveLength(3);

        const contextNames = contextMap.boundedContexts.map((c) =>
            c.items[0]?.ref?.name
        ).filter(Boolean).sort();

        expect(contextNames).toEqual(['Catalog', 'Orders', 'Pricing']);
    });

    // ==========================================
    // EDGE: missing targets leave refs unresolved
    // ==========================================
    test('existing targets resolve even when some references are missing', async () => {
        // Arrange
        const input = `
            Domain Sales {}

            bc Orders for Sales {}

            ContextMap PortfolioContexts {
                contains Orders, __MissingBC__
            }
        `;

        // Act
        const document = await testServices.parse(input);
        const model = document.parseResult.value;
        const contextMap = model.children.find(c => isContextMap(c) && c.name === 'PortfolioContexts') as ContextMap;

        // Assert
        expect(contextMap.boundedContexts).toHaveLength(2);

        const items = contextMap.boundedContexts.flatMap(d => d.items);
        const resolved = items.filter(i => i.ref?.name).map(i => i.ref!.name).sort();

        // Only "Orders" resolves; __MissingBC__ does not
        const unique = Array.from(new Set(resolved));
        expect(unique).toEqual(['Orders']);
    });

    // ==========================================
    // EDGE: empty DomainMap has zero domain references
    // ==========================================
    test('empty DomainMap with no contains clause has zero domain references', async () => {
        // Arrange
        const input = `
            Domain Sales {}
            DomainMap EmptyPortfolio {}
        `;

        // Act
        const document = await testServices.parse(input);
        const model = document.parseResult.value;
        const domainMap = model.children.find(c => isDomainMap(c) && c.name === 'EmptyPortfolio') as DomainMap;

        // Assert
        expect(domainMap.domains).toHaveLength(0);
    });

    // ==========================================
    // EDGE: all references missing yields zero resolved
    // ==========================================
    test('ContextMap where all referenced BCs are missing yields zero resolved items', async () => {
        // Arrange
        const input = `
            Domain Sales {}

            ContextMap Ghosts {
                contains __Missing1__, __Missing2__
            }
        `;

        // Act
        const document = await testServices.parse(input);
        const model = document.parseResult.value;
        const contextMap = model.children.find(c => isContextMap(c) && c.name === 'Ghosts') as ContextMap;

        // Assert
        // Two reference slots exist
        expect(contextMap.boundedContexts).toHaveLength(2);
        // But neither should have a resolved ref
        const allItems = contextMap.boundedContexts.flatMap(d => d.items);
        const resolved = allItems.filter(i => i.ref?.name);
        expect(resolved).toHaveLength(0);
    });

    // TODO: Re-enable once namespace scoping is supported in EmptyFileSystem tests.
    // Blocked by: Namespace-qualified name resolution requires workspace-level scoping
    // that EmptyFileSystem doesn't provide. Verify manually or via integration tests.
    test.skip('MultiReference works with qualified names in namespaces', async () => {
        const input = `
            Namespace acme.sales {
                Domain Sales {}
                bc Orders for Sales {}
            }

            Namespace acme.marketing {
                Domain Marketing {}
                bc Campaigns for Marketing {}
            }

            ContextMap Corporate {
                contains acme.sales.Orders, acme.marketing.Campaigns
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);

        const model = document.parseResult.value;
        const contextMap = model.children.find(c => isContextMap(c) && c.name === 'Corporate') as ContextMap;

        expect(contextMap.boundedContexts).toHaveLength(2);

        const bcNames = contextMap.boundedContexts.map((bc) =>
            bc.items[0]?.ref?.name
        ).filter(Boolean).sort();

        expect(bcNames).toEqual(['Campaigns', 'Orders']);
    });
});
