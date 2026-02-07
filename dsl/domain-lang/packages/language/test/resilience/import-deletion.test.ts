/**
 * Import Deletion Tests
 * 
 * Tests behavior when imported files or manifests are deleted.
 * Verifies proper error handling and cache invalidation.
 * 
 * Note: Import validation requires filesystem access, so these tests verify
 * parsing behavior with EmptyFileSystem. See e2e/import-resolution-e2e.test.ts
 * for full filesystem-based import resolution tests.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- All array accesses in this file are safe after toHaveLength() checks */
import { describe, test, expect, beforeAll } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument } from '../test-helpers.js';

describe('Import Deletion Behavior', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    describe('Manifest deletion (parsing behavior)', () => {
        test('should parse external import syntax without manifest', async () => {
            // Create a document that tries to use external import without manifest
            const document = await testServices.parse(`
                import "acme/core" as Core
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            // The import syntax should parse successfully
            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(1);
            expect(model.imports![0].uri).toBe('acme/core');
            expect(model.imports![0].alias).toBe('Core');
            
            // Note: Actual validation errors for missing manifest require filesystem access
            // See import-validation-phase3.test.ts and e2e/import-resolution-e2e.test.ts
        });

        test('should parse external import without alias', async () => {
            const document = await testServices.parse(`
                import "my-company/ddd-patterns"
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(1);
            expect(model.imports![0].uri).toBe('my-company/ddd-patterns');
        });

        test('should parse multiple external imports', async () => {
            const document = await testServices.parse(`
                import "acme/patterns" as Patterns
                import "acme/core" as Core
                import "company/lib"
                
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(3);
            
            // Verify all imports parsed correctly
            expect(model.imports![0].uri).toBe('acme/patterns');
            expect(model.imports![1].uri).toBe('acme/core');
            expect(model.imports![2].uri).toBe('company/lib');
        });
    });

    describe('Import to non-existent files (parsing behavior)', () => {
        test('should parse import to missing local file', async () => {
            const document = await testServices.parse(`
                import "./nonexistent.dlang"
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            // Import syntax parses fine
            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(1);
            expect(model.imports![0].uri).toBe('./nonexistent.dlang');
            
            // Note: File existence checks require filesystem access
            // EmptyFileSystem tests focus on parsing correctness
        });

        test('should parse multiple missing file imports', async () => {
            const document = await testServices.parse(`
                import "./missing1.dlang"
                import "./missing2.dlang"
                import "../missing3.dlang"
                
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(3);
            
            // All import statements should parse successfully
            expect(model.imports![0].uri).toBe('./missing1.dlang');
            expect(model.imports![1].uri).toBe('./missing2.dlang');
            expect(model.imports![2].uri).toBe('../missing3.dlang');
        });
    });

    describe('Path resolution edge cases', () => {
        test('should parse import with non-.dlang extension', async () => {
            const document = await testServices.parse(`
                import "./types.txt"
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            // Grammar accepts any extension
            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(1);
            expect(model.imports![0].uri).toBe('./types.txt');
            
            // ImportResolver will reject this during resolution
            // (only .dlang or no extension accepted)
        });

        test('should parse directory import without extension', async () => {
            const document = await testServices.parse(`
                import "./empty-directory"
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(1);
            expect(model.imports![0].uri).toBe('./empty-directory');
            
            // Directory-first resolution happens at runtime:
            // ./empty-directory/index.dlang → ./empty-directory.dlang
        });

        test('should parse complex relative paths', async () => {
            const document = await testServices.parse(`
                import "../../shared/types"
                import "./nested/deep/module"
                
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(2);
            expect(model.imports![0].uri).toBe('../../shared/types');
            expect(model.imports![1].uri).toBe('./nested/deep/module');
        });
    });

    describe('Alias handling', () => {
        test('should parse path alias imports', async () => {
            const document = await testServices.parse(`
                import "@shared/types"
                import "@/domains/sales"
                import "@lib/utils"
                
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(3);
            
            // Path aliases parse successfully
            expect(model.imports![0].uri).toBe('@shared/types');
            expect(model.imports![1].uri).toBe('@/domains/sales');
            expect(model.imports![2].uri).toBe('@lib/utils');
            
            // Resolution requires model.yaml with paths configuration
        });

        test('should parse external imports with various alias patterns', async () => {
            const document = await testServices.parse(`
                import "owner/repo" as Repo
                import "company/lib" as CompanyLib
                import "acme/patterns"
                
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(3);
            
            // Verify alias handling
            expect(model.imports![0].alias).toBe('Repo');
            expect(model.imports![1].alias).toBe('CompanyLib');
            expect(model.imports![2].alias).toBeUndefined();
        });
    });

    describe('Import statement edge cases', () => {
        test('should parse import with whitespace variations', async () => {
            const document = await testServices.parse(`
                import     "./types.dlang"
                import "./utils"    as    Utils
                
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(2);
        });

        test('should parse mixed import types', async () => {
            const document = await testServices.parse(`
                import "./local.dlang"
                import "@shared/types"
                import "acme/patterns" as Patterns
                import "../../utils"
                
                Domain Sales { vision: "Test" }
            `);

            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(4);
            
            // All import types should coexist
            expect(model.imports![0].uri).toBe('./local.dlang');
            expect(model.imports![1].uri).toBe('@shared/types');
            expect(model.imports![2].uri).toBe('acme/patterns');
            expect(model.imports![3].uri).toBe('../../utils');
        });
    });
});
