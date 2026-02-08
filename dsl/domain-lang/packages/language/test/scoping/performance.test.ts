/**
 * Scoping Performance Tests
 *
 * Tests that reference resolution handles large models efficiently and
 * that domain references resolve correctly under scale.
 *
 * Distribution target: ~20% smoke, ~80% edge/error.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, getAllBoundedContexts, s } from '../test-helpers.js';
import { isContextMap } from '../../src/generated/ast.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Scoping: Performance', () => {

    // ── Smoke (~20%) ──────────────────────────────────────────────────

    test('smoke: 100 BCs referencing 50 domains resolve within time budget', async () => {
        const domainDefinitions = Array.from({ length: 50 }, (_, i) =>
            `Domain Domain${i} {}`
        ).join('\n');

        const bcDefinitions = Array.from({ length: 100 }, (_, i) =>
            `BoundedContext BC${i} for Domain${i % 50}`
        ).join('\n');

        const input = s`
            ${domainDefinitions}
            ${bcDefinitions}
        `;

        const start = performance.now();
        const document = await testServices.parse(input);
        const elapsed = performance.now() - start;

        expectValidDocument(document);

        // Generous upper bound to avoid flaky CI failures
        expect(elapsed).toBeLessThan(30000);

        const boundedContexts = getAllBoundedContexts(document);
        expect(boundedContexts).toHaveLength(100);

        // Verify round-robin assignment: BC0->Domain0, BC1->Domain1, ..., BC50->Domain0
        for (const bc of boundedContexts) {
            const idx = Number(bc.name.replace('BC', ''));
            expect(bc.domain?.ref?.name).toBe(`Domain${idx % 50}`);
        }
    });

    // ── Edge / Error (~80%) ───────────────────────────────────────────

    test('all BCs referencing the same single domain', async () => {
        const bcDefinitions = Array.from({ length: 50 }, (_, i) =>
            `BoundedContext BC${i} for OnlyDomain`
        ).join('\n');

        const input = s`
            Domain OnlyDomain {}
            ${bcDefinitions}
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);

        const bcs = getAllBoundedContexts(document);
        expect(bcs).toHaveLength(50);

        // Every BC should resolve to the same domain
        for (const bc of bcs) {
            expect(bc.domain?.ref?.name).toBe('OnlyDomain');
        }
    });

    test('large ContextMap with many relationships resolves all refs', async () => {
        const bcCount = 20;
        const bcDefinitions = Array.from({ length: bcCount }, (_, i) =>
            `BoundedContext Ctx${i} for D`
        ).join('\n');

        const containsList = Array.from({ length: bcCount }, (_, i) =>
            `Ctx${i}`
        ).join(', ');

        // Chain relationships: Ctx0->Ctx1, Ctx1->Ctx2, ...
        const relationships = Array.from({ length: bcCount - 1 }, (_, i) =>
            `Ctx${i} -> Ctx${i + 1} : CustomerSupplier`
        ).join('\n');

        const input = s`
            Domain D {}
            ${bcDefinitions}

            ContextMap BigMap {
                contains ${containsList}
                ${relationships}
            }
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);

        const contextMap = document.parseResult.value.children.find(isContextMap);
        expect(contextMap).toBeDefined();
        if (isContextMap(contextMap)) {
            expect(contextMap.relationships).toHaveLength(bcCount - 1);

            // Verify all relationship endpoints resolve
            for (let i = 0; i < contextMap.relationships.length; i++) {
                const rel = contextMap.relationships[i];
                expect(rel.left.link?.ref?.name).toBe(`Ctx${i}`);
                expect(rel.right.link?.ref?.name).toBe(`Ctx${i + 1}`);
            }
        }
    });

    test('large model with some unresolvable refs does not crash', async () => {
        // 25 BCs where every 5th one references a non-existent domain
        const bcDefinitions = Array.from({ length: 25 }, (_, i) => {
            const domainName = i % 5 === 0 ? 'MissingDomain' : `Domain${i}`;
            return `BoundedContext BC${i} for ${domainName}`;
        }).join('\n');

        const domainDefinitions = Array.from({ length: 25 }, (_, i) =>
            `Domain Domain${i} {}`
        ).join('\n');

        const input = s`
            ${domainDefinitions}
            ${bcDefinitions}
        `;

        const document = await testServices.parse(input);
        expectValidDocument(document);

        const bcs = getAllBoundedContexts(document);
        expect(bcs).toHaveLength(25);

        // Verify: every 5th BC (0, 5, 10, ...) should NOT resolve
        for (const bc of bcs) {
            const idx = Number(bc.name.replace('BC', ''));
            if (idx % 5 === 0) {
                expect(bc.domain?.ref).toBeUndefined();
            } else {
                expect(bc.domain?.ref?.name).toBe(`Domain${idx}`);
            }
        }
    });
});
