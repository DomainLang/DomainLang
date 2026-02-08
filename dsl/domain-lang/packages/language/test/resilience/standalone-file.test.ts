/**
 * Tests for standalone .dlang files (without model.yaml)
 *
 * Smoke (~20%):
 * - Basic domain parses without errors and produces correct AST
 *
 * Edge/error (~80%):
 * - Local relative import without model.yaml does not crash parser
 * - External import without model.yaml does not crash parser
 * - Path alias import without model.yaml does not crash parser
 * - Full DSL features (domain hierarchy, BC, ContextMap) work without model.yaml
 * - Workspace initialization without model.yaml sets workspace root and returns undefined manifest
 * - Import resolution errors produce clear error messages
 * - Invalid model.yaml does not crash workspace initialization
 * - Missing lock file returns undefined
 */

import { beforeAll, describe, test, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { expectValidDocument, s, setupTestSuite } from '../test-helpers.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Standalone .dlang files (no model.yaml)', () => {

    // ==========================================
    // SMOKE: basic domain parses and produces correct AST
    // ==========================================
    test('standalone domain file parses and produces correct AST name', async () => {
        const doc = await testServices.parse(s`
            Domain Sales {
                vision: "Manage sales operations"
            }
        `);
        expectValidDocument(doc);
        const model = doc.parseResult.value;
        expect(model.children).toHaveLength(1);
        expect(model.children[0].name).toBe('Sales');
    });

    // ==========================================
    // EDGE: imports without model.yaml don't crash
    // ==========================================
    test('local, external, and path-alias imports without model.yaml do not crash parser', async () => {
        // Local relative import
        const docLocal = await testServices.parse(s`
            import "./other"
            Domain Sales { vision: "Sales" }
        `);
        expectValidDocument(docLocal);

        // External import
        const docExternal = await testServices.parse(s`
            import "owner/package"
            Domain Sales { vision: "Sales" }
        `);
        expectValidDocument(docExternal);

        // Path alias import
        const docAlias = await testServices.parse(s`
            import "@shared/types"
            Domain Sales { vision: "Sales" }
        `);
        expectValidDocument(docAlias);
    });

    // ==========================================
    // EDGE: full DSL features work without model.yaml
    // ==========================================
    test('full DSL with domain hierarchy, BC, and ContextMap parses correctly and resolves refs', async () => {
        const doc = await testServices.parse(s`
            Domain Sales {
                vision: "Manage sales operations"
            }

            Domain Orders in Sales {
                vision: "Handle orders"
            }

            bc OrderContext for Sales as Core by SalesTeam {
                description: "Manages order lifecycle"
            }

            ContextMap SalesMap {
                contains OrderContext
            }
        `);
        expectValidDocument(doc);
        // Should have zero or only linking warnings (not parse errors)
        // Standalone files may have some warnings but parser should succeed
        expect(doc.parseResult.parserErrors).toHaveLength(0);
    });
});

describe('Workspace initialization resilience', () => {

    // ==========================================
    // EDGE: workspace init without model.yaml
    // ==========================================
    test('workspace init in directory without model.yaml sets root and returns undefined manifest', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-test-'));

        try {
            await fs.writeFile(path.join(tmpDir, 'test.dlang'), s`
                Domain TestDomain {
                    vision: "Test"
                }
            `);

            const workspaceManager = testServices.services.DomainLang.imports.WorkspaceManager;
            await expect(workspaceManager.initialize(tmpDir)).resolves.not.toThrow();

            // Should have workspace root even without model.yaml (falls back to tmpDir)
            expect(() => workspaceManager.getWorkspaceRoot()).not.toThrow();

            // Manifest should be undefined when no model.yaml exists
            const manifest = await workspaceManager.getManifest();
            expect(manifest).toBeUndefined();

        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    // ==========================================
    // EDGE: import resolution errors produce clear messages
    // ==========================================
    test('import resolution errors produce messages mentioning "resolve" or "manifest"', async () => {
        const importResolver = testServices.services.DomainLang.imports.ImportResolver;
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-test-'));

        try {
            // Local relative import for non-existent file should give clear error
            await expect(importResolver.resolveFrom(tmpDir, './other'))
                .rejects.toThrow(/Cannot resolve import/);

            // External import should fail gracefully with error message
            await expect(importResolver.resolveFrom(tmpDir, 'owner/package'))
                .rejects.toThrow(/manifest|model\.yaml/i);

        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });
});

describe('Error recovery', () => {

    // ==========================================
    // EDGE: invalid model.yaml does not crash workspace init
    // ==========================================
    test('invalid model.yaml allows workspace init without crash and getManifest handles gracefully', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-test-'));

        try {
            await fs.writeFile(path.join(tmpDir, 'model.yaml'), 'invalid: yaml: content: [[[');

            const workspaceManager = testServices.services.DomainLang.imports.WorkspaceManager;
            await expect(workspaceManager.initialize(tmpDir)).resolves.not.toThrow();

            // getManifest should not crash — either returns a result or throws
            await expect(workspaceManager.getManifest()).resolves.not.toThrow();

        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    // Missing lock file test covered by workspace-manager.test.ts
});
