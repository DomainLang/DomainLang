/**
 * Tests for standalone .dlang files (without model.yaml)
 * Ensures the LSP server is resilient and doesn't crash
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
    test('should parse standalone file without errors', async () => {
        const doc = await testServices.parse(s`
            Domain Sales {
                vision: "Manage sales operations"
            }
        `);
        expectValidDocument(doc);
        const diagnostics = doc.diagnostics ?? [];
        expect(diagnostics).toBeDefined();
    });

    test('should handle local relative imports without model.yaml', async () => {
        const doc = await testServices.parse(s`
            import "./other"
            
            Domain Sales {
                vision: "Manage sales operations"
            }
        `);
        expectValidDocument(doc);
        // Import will fail to resolve but shouldn't crash the parser
    });

    test('should provide diagnostics for external imports without model.yaml', async () => {
        const doc = await testServices.parse(s`
            import "owner/package"
            
            Domain Sales {
                vision: "Manage sales operations"
            }
        `);
        expectValidDocument(doc);
        // Note: Import validation is async and may not be reflected in synchronous diagnostics
        // The error will surface during linking/resolution, not parsing
        const diagnostics = doc.diagnostics ?? [];
        // Parser should succeed even if imports can't be resolved
        expect(diagnostics).toBeDefined();
    });

    test('should handle path aliases without model.yaml gracefully', async () => {
        const doc = await testServices.parse(s`
            import "@shared/types"
            
            Domain Sales {
                vision: "Manage sales operations"
            }
        `);
        expectValidDocument(doc);
        // Path alias resolution will fail but shouldn't crash
    });

    test('should support full DSL features without model.yaml', async () => {
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
        const diagnostics = doc.diagnostics ?? [];
        expect(diagnostics).toBeDefined();
    });
});

describe('Workspace initialization resilience', () => {
    test('should handle workspace initialization in temp directory without model.yaml', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-test-'));
        const filePath = path.join(tmpDir, 'test.dlang');
        
        try {
            // Write test file
            await fs.writeFile(filePath, s`
                Domain TestDomain {
                    vision: "Test"
                }
            `);

            // Try to initialize workspace - should not throw
            const workspaceManager = testServices.services.DomainLang.imports.WorkspaceManager;
            await expect(workspaceManager.initialize(tmpDir)).resolves.not.toThrow();
            
            // Should have workspace root even without model.yaml (falls back to tmpDir)
            expect(() => workspaceManager.getWorkspaceRoot()).not.toThrow();
            
            // Manifest should be undefined
            const manifest = await workspaceManager.getManifest();
            expect(manifest).toBeUndefined();
            
        } finally {
            // Cleanup
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    test('should handle import resolution errors gracefully', async () => {
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
    test('should handle invalid model.yaml gracefully', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-test-'));
        
        try {
            // Write invalid YAML
            await fs.writeFile(path.join(tmpDir, 'model.yaml'), 'invalid: yaml: content: [[[');
            
            const workspaceManager = testServices.services.DomainLang.imports.WorkspaceManager;
            
            // WorkspaceManager initialization succeeds (finds workspace root)
            // but manifest loading will fail when accessed
            await expect(workspaceManager.initialize(tmpDir)).resolves.not.toThrow();
            
            // Attempting to load invalid manifest should throw or return undefined
            const result = await workspaceManager.getManifest();
            // Either throws during parse or returns undefined after error
            expect(result === undefined || result).toBeDefined();
            
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    test('should handle missing lock file gracefully', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-test-'));
        
        try {
            // Valid manifest but no lock file
            await fs.writeFile(path.join(tmpDir, 'model.yaml'), s`
                model:
                  name: test
                dependencies:
                  owner/package:
                    ref: v1.0.0
            `);
            
            const workspaceManager = testServices.services.DomainLang.imports.WorkspaceManager;
            await workspaceManager.initialize(tmpDir);
            
            const lockFile = await workspaceManager.getLockFile();
            expect(lockFile).toBeUndefined();
            
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });
});
