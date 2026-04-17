/**
 * Tests for SDK validator module.
 * 
 * Validates that the validator correctly:
 * - Uses LSP infrastructure for workspace initialization
 * - Resolves and loads imports
 * - Reports validation errors and warnings
 * - Counts model elements correctly
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { validateFile, validateWorkspace } from '../../src/sdk/validator.js';
import { s } from '../test-helpers.js';
import { resolve, join } from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// ═══════════════════════════════════════════════════════════════════════════════
// Temp File Utilities
// ═══════════════════════════════════════════════════════════════════════════════

async function createTempProject(
    files: Record<string, string>,
    options?: { workspaceDir?: string }
): Promise<{ dir: string; files: Record<string, string> }> {
    const dir = options?.workspaceDir ?? resolve(tmpdir(), `dlang-test-${Date.now()}-${Math.random()}`);
    await mkdir(dir, { recursive: true });
    const created: Record<string, string> = {};
    for (const [filePath, content] of Object.entries(files)) {
        const fullPath = resolve(dir, filePath);
        const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        await mkdir(dirPath, { recursive: true });
        await writeFile(fullPath, content);
        created[filePath] = fullPath;
    }
    return { dir, files: created };
}

async function cleanupProject(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// validateFile Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateFile', () => {
    let projectDir: string;

    beforeEach(async () => {
        projectDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
        await mkdir(projectDir, { recursive: true });
    });

    afterEach(async () => {
        await cleanupProject(projectDir);
    });

    // ═ Smoke: happy path and error handling
    interface ValidateFileCase {
        name: string;
        files: Record<string, string>;
        entryFile: string;
        expectedValid: boolean;
        expectedChecks: (result: Awaited<ReturnType<typeof validateFile>>) => void;
    }

    test.each<ValidateFileCase>([
        {
            name: 'validates simple valid model',
            files: { 'test.dlang': s`Domain Sales { vision: "Handle sales operations" } bc OrderContext for Sales { description: "Order management" }` },
            entryFile: 'test.dlang',
            expectedValid: true,
            expectedChecks: (result) => {
                expect(result.errors).toHaveLength(0);
                expect(result.warnings).toHaveLength(0);
                expect(result.domainCount).toBe(1);
                expect(result.bcCount).toBe(1);
                expect(result.fileCount).toBe(1);
            }
        },
        {
            name: 'reports duplicate domain error',
            files: { 'test.dlang': s`Domain Sales { vision: "Sales domain" } Domain Sales { vision: "Duplicate" }` },
            entryFile: 'test.dlang',
            expectedValid: false,
            expectedChecks: (result) => {
                const duplicateErrors = result.errors.filter(e => e.message.includes('Duplicate element'));
                expect(duplicateErrors).toHaveLength(1);
                expect(duplicateErrors[0].message).toContain("'Sales'");
                expect(duplicateErrors[0].severity).toBe(1); // Error
            }
        },
        {
            name: 'reports BC missing description warning',
            files: { 'test.dlang': s`Domain Sales { vision: "Sales" } bc Orders for Sales {}` },
            entryFile: 'test.dlang',
            expectedValid: true,
            expectedChecks: (result) => {
                const warnings = result.warnings.filter(w => w.message.includes('description'));
                expect(warnings).toHaveLength(1);
                expect(warnings[0].message).toContain('Orders');
                expect(warnings[0].severity).toBe(2); // Warning
            }
        },
        {
            name: 'counts multiple domains and bounded contexts',
            files: {
                'test.dlang': s`
                    Domain Sales { vision: "Sales" }
                    Domain Billing { vision: "Billing" }
                    Domain Shipping { vision: "Shipping" }
                    bc OrderContext for Sales { description: "Orders" }
                    bc PaymentContext for Billing { description: "Payments" }
                    bc FulfillmentContext for Shipping { description: "Fulfillment" }
                `
            },
            entryFile: 'test.dlang',
            expectedValid: true,
            expectedChecks: (result) => {
                expect(result.domainCount).toBe(3);
                expect(result.bcCount).toBe(3);
            }
        },
    ])('$name', async ({ files, entryFile, expectedValid, expectedChecks }) => {
        // Arrange
        const { dir, files: filePaths } = await createTempProject(files, { workspaceDir: projectDir });

        // Act
        const result = await validateFile(filePaths[entryFile]);

        // Assert
        expect(result.valid).toBe(expectedValid);
        expectedChecks(result);

        // Cleanup
        await cleanupProject(dir);
    });

    // ═ Edge: file system errors and diagnostics
    test('throws error for non-existent file', async () => {
        // Act & Assert
        await expect(() => validateFile('/non/existent/file.dlang')).rejects.toThrow('File not found');
    });

    test('throws error for invalid file extension', async () => {
        // Arrange
        const filePath = resolve(projectDir, 'test.txt');
        await writeFile(filePath, 'invalid content');

        // Act & Assert
        await expect(() => validateFile(filePath)).rejects.toThrow('Invalid file extension');
    });

    test('includes line and column numbers in diagnostics', async () => {
        // Arrange — duplicate names on different lines to verify position reporting
        const { dir, files } = await createTempProject({
            'test.dlang': s`
                Domain Sales { vision: "Sales" }
                
                Domain Sales { vision: "Duplicate" }
            `
        }, { workspaceDir: projectDir });

        // Act
        const result = await validateFile(files['test.dlang']);

        // Assert — second declaration on line 3 (1-based)
        const duplicateErrors = result.errors.filter(e => e.message.includes('Duplicate'));
        expect(duplicateErrors).toHaveLength(1);
        expect(duplicateErrors[0].line).toBe(3);
        expect(duplicateErrors[0].column).toBeGreaterThan(0);

        // Cleanup
        await cleanupProject(dir);
    });

    test('respects custom workspace directory option', async () => {
        // Arrange
        const customDir = resolve(tmpdir(), `dlang-custom-${Date.now()}`);
        await mkdir(customDir, { recursive: true });
        const { files } = await createTempProject(
            { 'test.dlang': s`Domain Sales { vision: "Sales" }` },
            { workspaceDir: customDir }
        );

        // Act
        const result = await validateFile(files['test.dlang'], { workspaceDir: customDir });

        // Assert
        expect(result.valid).toBe(true);
        expect(result.domainCount).toBe(1);

        // Cleanup
        await cleanupProject(customDir);
    });

    test('includes diagnostics from imported files', async () => {
        // Arrange — shared file has warning, entry file is valid
        const { dir, files } = await createTempProject({
            'shared.dlang': s`Domain Shared {}`,
            'main.dlang': s`
                import "./shared.dlang"
                Domain Sales { vision: "Sales operations" }
                bc OrderContext for Sales { description: "Orders" }
            `
        }, { workspaceDir: projectDir });

        // Act
        const result = await validateFile(files['main.dlang']);

        // Assert — imported file's "missing vision" warning must propagate with exact attribution
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        const importedVisionWarnings = result.warnings.filter(
            w => w.file === files['shared.dlang'] && w.message.includes('vision')
        );
        expect(importedVisionWarnings).toHaveLength(1);
        expect(importedVisionWarnings[0].message).toContain('Shared');

        // Cleanup
        await cleanupProject(dir);
    });

    test('validates multi-file models with imports', async () => {
        // Arrange — two files with import
        const { dir, files } = await createTempProject({
            'shared.dlang': s`Domain Core { vision: "Core domain" }`,
            'main.dlang': s`
                import "./shared.dlang"
                Domain Sales { vision: "Sales operations" }
                bc OrderContext for Sales { description: "Orders" }
            `
        }, { workspaceDir: projectDir });

        // Act
        const result = await validateFile(files['main.dlang']);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.domainCount).toBe(2); // Both files
        expect(result.bcCount).toBe(1);
        expect(result.fileCount).toBeGreaterThanOrEqual(2);

        // Cleanup
        await cleanupProject(dir);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// validateWorkspace Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateWorkspace', () => {
    let projectDir: string;

    beforeEach(async () => {
        projectDir = resolve(tmpdir(), `dlang-workspace-${Date.now()}`);
        await mkdir(projectDir, { recursive: true });
    });

    afterEach(async () => {
        await cleanupProject(projectDir);
    });

    // ═ Smoke: default and custom entry files
    interface ValidateWorkspaceCase {
        name: string;
        files: Record<string, string>;
        entryFile?: string;
        expectedValid: boolean;
        expectedChecks: (result: Awaited<ReturnType<typeof validateWorkspace>>) => void;
    }

    test.each<ValidateWorkspaceCase>([
        {
            name: 'validates workspace with default entry file (index.dlang)',
            files: {
                'index.dlang': s`
                    Classification Core
                    Domain Sales { vision: "Sales management" }
                    bc OrderContext for Sales as Core { description: "Order handling" }
                `,
                'model.yaml': 'name: test-workspace\nversion: 1.0.0'
            },
            expectedValid: true,
            expectedChecks: (result) => {
                expect(result.errors).toHaveLength(0);
                expect(result.warnings).toHaveLength(0);
                expect(result.totalDiagnostics).toBe(0);
            }
        },
        {
            name: 'validates workspace with custom entry file',
            files: {
                'main.dlang': s`Domain Sales { vision: "Sales management" }`,
                'model.yaml': 'name: test-workspace\nversion: 1.0.0\nmodel:\n  entry: main.dlang'
            },
            expectedValid: true,
            expectedChecks: (result) => {
                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            }
        },
        {
            name: 'validates workspace without model.yaml (fallback to index.dlang)',
            files: {
                'index.dlang': s`Domain Sales { vision: "Test" }`
            },
            expectedValid: true,
            expectedChecks: (result) => {
                expect(result.valid).toBe(true);
                expect(result.domainCount).toBe(1);
            }
        },
    ])('$name', async ({ files, expectedValid, expectedChecks }) => {
        // Arrange
        const { dir } = await createTempProject(files, { workspaceDir: projectDir });

        // Act
        const result = await validateWorkspace(dir);

        // Assert
        expect(result.valid).toBe(expectedValid);
        expectedChecks(result);

        // Cleanup
        await cleanupProject(dir);
    });

    // ═ Edge: multi-file workspaces and error handling
    test('collects errors from multiple files in workspace', async () => {
        // Arrange
        const { dir } = await createTempProject({
            'index.dlang': s`
                import "./shared.dlang"
                Domain Sales { vision: "Sales management" }
            `,
            'shared.dlang': s`Domain Shared {}`,  // Missing vision warning
            'model.yaml': 'name: test\nversion: 1.0.0'
        }, { workspaceDir: projectDir });

        // Act
        const result = await validateWorkspace(dir);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.file === join(dir, 'shared.dlang'))).toBe(true);
        expect(result.totalDiagnostics).toBe(result.errors.length + result.warnings.length);

        // Cleanup
        await cleanupProject(dir);
    });

    test('validates workspace with imports across multiple files', async () => {
        // Arrange
        const { dir } = await createTempProject({
            'index.dlang': s`
                import "./domains.dlang"
                Classification Core
                bc OrderContext for Sales as Core { description: "Orders" }
            `,
            'domains.dlang': s`
                import "./shared.dlang"
                Domain Sales { vision: "Sales" }
            `,
            'shared.dlang': s`Domain Billing { vision: "Billing" }`,
            'model.yaml': 'name: test\nversion: 1.0.0'
        }, { workspaceDir: projectDir });

        // Act
        const result = await validateWorkspace(dir);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);

        // Cleanup
        await cleanupProject(dir);
    });

    test('detects validation errors across all workspace documents', async () => {
        // Arrange
        const { dir } = await createTempProject({
            'index.dlang': s`
                import "./domains.dlang"
                bc OrderContext for UndefinedDomain as Core { description: "Orders" }
            `,
            'domains.dlang': s`
                Domain Sales { vision: "Sales" }
                bc BillingContext for Sales as Supporting {}
            `,
            'model.yaml': 'name: test\nversion: 1.0.0'
        }, { workspaceDir: projectDir });

        // Act
        const result = await validateWorkspace(dir);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.warnings.length).toBeGreaterThan(0);

        // Cleanup
        await cleanupProject(dir);
    });

    test('throws error when entry file is missing', async () => {
        // Arrange — no index.dlang or configured entry
        const { dir } = await createTempProject({
            'model.yaml': 'name: test\nversion: 1.0.0'
        }, { workspaceDir: projectDir });

        // Act & Assert
        await expect(() => validateWorkspace(dir)).rejects.toThrow();

        // Cleanup
        await cleanupProject(dir);
    });

    test('throws error when workspace directory does not exist', async () => {
        // Act & Assert
        const nonExistent = join(tmpdir(), `dlang-nonexistent-${Date.now()}`);
        await expect(() => validateWorkspace(nonExistent)).rejects.toThrow();
    });
});