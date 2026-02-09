/**
 * Import Statement Tests
 *
 * Tests for the import system including:
 * - Local file imports (relative, parent, workspace-alias)
 * - Manifest dependency imports (alias-only)
 * - Import aliases
 * - Multiple imports
 * - Grammar rejection of removed syntax
 */

import { beforeAll, describe, expect, test } from 'vitest';
import type { ImportStatement } from '../../src/generated/ast.js';
import type { TestServices } from '../test-helpers.js';
import { expectValidDocument, expectGrammarRuleRejectsInput, s, setupTestSuite } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getImports(document: any): ImportStatement[] {
    return document.parseResult.value.imports ?? [];
}

// ============================================================================
// LOCAL FILE IMPORTS
// ============================================================================

describe('Local File Imports', () => {
    test.each([
        ['relative path', './types.dlang'],
        ['nested relative path', './shared/types/base.dlang'],
        ['parent directory', '../common/types.dlang'],
        ['workspace alias @/', '@/contexts/sales.dlang'],
    ])('should parse %s import: %s', async (_label, uri) => {
        // Arrange & Act
        const input = s`
            import "${uri}"

            Domain Sales {}
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe(uri);
        expect(imports[0].alias).toBeUndefined();
    });

    test('should parse Import (capitalized) keyword', async () => {
        // Arrange
        const input = s`
            Import "./types.dlang"

            Domain Sales {}
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe('./types.dlang');
    });

    test('should parse Import (capitalized) with alias', async () => {
        // Arrange
        const input = s`
            Import "core" as Core

            Domain Sales {}
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe('core');
        expect(imports[0].alias).toBe('Core');
    });

    test('should parse custom @alias/ path import', async () => {
        // Arrange
        const input = s`
            import "@shared/teams"

            Domain Sales {}
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe('@shared/teams');
    });

    test('should parse owner/package external import format', async () => {
        // Arrange
        const input = s`
            import "acme/ddd-core" as Core

            Domain Sales {}
        `;

        // Act
        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe('acme/ddd-core');
        expect(imports[0].alias).toBe('Core');
    });
});

// ============================================================================
// MANIFEST DEPENDENCY IMPORTS (PRS-010)
// ============================================================================

describe('Manifest Dependency Imports', () => {
    test('should parse simple dependency import', async () => {
        // Arrange & Act
        const input = s`
            import "core"

            Domain Sales {}
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe('core');
        expect(imports[0].alias).toBeUndefined();
    });

    test('should parse dependency import with alias', async () => {
        // Arrange & Act
        const input = s`
            import "core" as Core

            Domain Sales {}
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe('core');
        expect(imports[0].alias).toBe('Core');
    });

    test('should parse dependency with path notation', async () => {
        // Arrange & Act
        const input = s`
            import "patterns/strategic"

            Domain Sales {}
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe('patterns/strategic');
    });
});

// ============================================================================
// MULTIPLE & MIXED IMPORTS
// ============================================================================

describe('Multiple Imports', () => {
    test('should parse multiple mixed import styles with correct URIs and aliases', async () => {
        // Arrange & Act
        const input = s`
            import "./local.dlang"
            import "@/workspace.dlang"
            import "patterns" as Patterns

            Domain Sales {}
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);

        expect(imports).toHaveLength(3);
        expect(imports[0].uri).toBe('./local.dlang');
        expect(imports[0].alias).toBeUndefined();
        expect(imports[1].uri).toBe('@/workspace.dlang');
        expect(imports[1].alias).toBeUndefined();
        expect(imports[2].uri).toBe('patterns');
        expect(imports[2].alias).toBe('Patterns');
    });

    test('should place imports before model children in AST', async () => {
        // Arrange & Act
        const input = s`
            import "./types.dlang"
            import "./teams.dlang"
            import "patterns" as Patterns

            Domain Sales {
                vision: "Sales domain"
            }

            bc OrderContext for Sales {
                description: "Order management"
            }
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const model = document.parseResult.value;

        expect(model.imports).toHaveLength(3);
        expect(model.children.length).toBeGreaterThanOrEqual(2);
    });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Import Edge Cases', () => {
    test('should handle import with single quotes', async () => {
        // Arrange & Act
        const input = s`
            import './types.dlang'

            Domain Sales {}
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe('./types.dlang');
    });

    test('should handle import with spaces in path', async () => {
        // Arrange & Act
        const input = s`
            import "./my folder/types.dlang"

            Domain Sales {}
        `;

        const document = await testServices.parse(input);

        // Assert
        expectValidDocument(document);
        const imports = getImports(document);
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe('./my folder/types.dlang');
    });

    test('should handle empty model with only imports', async () => {
        // Arrange & Act
        const input = s`
            import "./types.dlang"
            import "core"
        `;

        const document = await testServices.parse(input);

        // Assert
        const imports = getImports(document);
        expect(imports).toHaveLength(2);
        expect(imports[0].uri).toBe('./types.dlang');
        expect(imports[1].uri).toBe('core');
    });

    test('should treat version-in-URI as part of the URI string', async () => {
        // Arrange & Act
        const input = s`
            import "core@v1.0.0"

            Domain Sales {}
        `;

        const document = await testServices.parse(input);

        // Assert
        const imports = getImports(document);
        // The @v1.0.0 is part of the URI string literal, not separate syntax
        expect(imports).toHaveLength(1);
        expect(imports[0].uri).toBe('core@v1.0.0');
    });
});

// ============================================================================
// GRAMMAR REJECTION - Old / Invalid Syntax
// ============================================================================

describe('Grammar Rejection', () => {
    test('should reject named imports syntax', async () => {
        // Arrange
        const input = s`
            import { Domain, BoundedContext } from "core"

            Domain Sales {}
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Named imports'
        );
    });

    test('should reject inline integrity field', async () => {
        // Arrange
        const input = s`
            import "core" integrity "sha256:abc123"

            Domain Sales {}
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Inline integrity'
        );
    });

    test('should reject import without URI string', async () => {
        // Arrange
        const input = s`
            import core

            Domain Sales {}
        `;

        // Act & Assert
        await expectGrammarRuleRejectsInput(
            testServices.parse,
            input,
            'Import without string URI'
        );
    });
});
