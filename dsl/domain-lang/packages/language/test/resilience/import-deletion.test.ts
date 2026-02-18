/**
 * Import Resilience Tests
 *
 * Verifies the parser handles import statements resiliently, including:
 * - Imports that reference non-existent or unresolvable targets
 * - Unusual path formats and edge cases
 * - Boundary conditions (empty URIs, very long URIs, special characters)
 * - Error recovery when imports are followed by invalid syntax
 *
 * Note: Import validation requires filesystem access, so these tests verify
 * parsing behavior with EmptyFileSystem. See e2e/import-resolution-e2e.test.ts
 * for full filesystem-based import resolution tests.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument } from '../test-helpers.js';

describe('Import Resilience', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    // Parser resilience for basic import formats (external, local, aliases, mixed)
    // covered by import-statements.test.ts

    // Complex relative paths, path aliases, and mixed import types
    // covered by import-statements.test.ts

    describe('Whitespace and boundary edge cases', () => {
        test('should parse imports with extra whitespace around keywords', async () => {
            // Arrange & Act
            const document = await testServices.parse(`
                import     "./types.dlang"
                import "./utils"    as    Utils

                Domain Sales { vision: "Test" }
            `);

            // Assert
            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(2);
            expect(model.imports[0].uri).toBe('./types.dlang');
            expect(model.imports[0].alias).toBeUndefined();
            expect(model.imports[1].uri).toBe('./utils');
            expect(model.imports[1].alias).toBe('Utils');
        });
    });

    describe('Boundary and edge cases', () => {
        test('should parse empty string import URI', async () => {
            // Arrange & Act
            const document = await testServices.parse(`
                import ""
                Domain Sales { vision: "Test" }
            `);

            // Assert
            // Empty URI is syntactically valid (a STRING token), even if semantically meaningless
            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(1);
            expect(model.imports[0].uri).toBe('');
            expect(model.imports[0].alias).toBeUndefined();
        });

        test('should preserve whitespace inside import URI string', async () => {
            // Arrange & Act
            const document = await testServices.parse(`
                import "  some/path  "
                Domain Sales { vision: "Test" }
            `);

            // Assert
            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(1);
            // Whitespace inside the quoted string is part of the URI value
            expect(model.imports[0].uri).toBe('  some/path  ');
        });

        test('should parse very long import URI', async () => {
            // Arrange
            const longSegment = 'a'.repeat(50);
            const longUri = `org/${longSegment}/${longSegment}/${longSegment}`;

            // Act
            const document = await testServices.parse(`
                import "${longUri}" as LongImport
                Domain Sales { vision: "Test" }
            `);

            // Assert
            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(1);
            expect(model.imports[0].uri).toBe(longUri);
            expect(model.imports[0].uri.length).toBeGreaterThan(150);
            expect(model.imports[0].alias).toBe('LongImport');
        });

        test('should parse import with special characters in path', async () => {
            // Arrange & Act
            const document = await testServices.parse(`
                import "./path-with-dashes/under_scores/dots.v2"
                Domain Sales { vision: "Test" }
            `);

            // Assert
            expectValidDocument(document);

            const model = document.parseResult.value;
            expect(model.imports).toHaveLength(1);
            expect(model.imports[0].uri).toBe('./path-with-dashes/under_scores/dots.v2');
        });
    });

    describe('Error recovery with imports', () => {
        test('should preserve parsed imports even when followed by invalid syntax', async () => {
            // Arrange & Act
            const document = await testServices.parse(`
                import "acme/core" as Core
                import "./local.dlang"

                Domainnn InvalidSyntaxHere {{{{
            `);

            // Assert
            // The document should have parse errors from the invalid syntax
            const hasErrors =
                document.parseResult.parserErrors.length > 0 ||
                document.parseResult.lexerErrors.length > 0;
            expect(hasErrors).toBe(true);

            // But the imports that were successfully parsed should still be accessible
            const model = document.parseResult.value;
            expect(Array.isArray(model.children)).toBe(true);
            expect(Array.isArray(model.imports)).toBe(true);
            expect(model.imports.length).toBeGreaterThanOrEqual(1);

            // Verify at least the first import was captured by the parser
            const uris = model.imports.map(i => i.uri);
            expect(uris).toContain('acme/core');
        });
    });
});
