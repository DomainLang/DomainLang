/**
 * Tests for SDK validator module.
 * 
 * Validates that the validator correctly:
 * - Uses LSP infrastructure for workspace initialization
 * - Resolves and loads imports
 * - Reports validation errors and warnings
 * - Counts model elements correctly
 */
import { describe, test, expect } from 'vitest';
import { validateFile, validateWorkspace } from '../../src/sdk/validator.js';
import { s } from '../test-helpers.js';
import { resolve, join } from 'node:path';
import { writeFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

describe('validateFile', () => {
    test('validates a simple valid model', async () => {
        // Arrange
        const tempDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });
        const filePath = resolve(tempDir, 'test.dlang');
        await writeFile(filePath, s`
            Domain Sales { vision: "Handle sales operations" }
            bc OrderContext for Sales { description: "Order management" }
        `);

        // Act
        const result = await validateFile(filePath);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
        expect(result.domainCount).toBe(1);
        expect(result.bcCount).toBe(1);
        expect(result.fileCount).toBe(1);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('reports validation errors', async () => {
        // Arrange - Duplicate domain names (actual error)
        const tempDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });
        const filePath = resolve(tempDir, 'test.dlang');
        await writeFile(filePath, s`
            Domain Sales { vision: "Sales domain" }
            Domain Sales { vision: "Duplicate" }
        `);

        // Act
        const result = await validateFile(filePath);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        const error = result.errors[0];
        expect(error.message).toContain('Sales');
        expect(error.file).toBe(filePath);
        expect(error.line).toBeGreaterThan(0);
        expect(error.severity).toBe(1); // Error severity

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('reports validation warnings', async () => {
        // Arrange - BC missing description (warning)
        const tempDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });
        const filePath = resolve(tempDir, 'test.dlang');
        await writeFile(filePath, s`
            Domain Sales { vision: "Sales" }
            bc Orders for Sales {}
        `);

        // Act
        const result = await validateFile(filePath);

        // Assert
        expect(result.valid).toBe(true); // Warnings don't make model invalid
        expect(result.warnings.length).toBeGreaterThan(0);
        const warning = result.warnings[0];
        expect(warning.message).toContain('description');
        expect(warning.file).toBe(filePath);
        expect(warning.severity).toBe(2); // Warning severity

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('validates multi-file models with imports', async () => {
        // Arrange - Create two files with import
        const tempDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });
        
        const sharedPath = resolve(tempDir, 'shared.dlang');
        await writeFile(sharedPath, s`
            Domain Core { vision: "Core domain" }
        `);
        
        const mainPath = resolve(tempDir, 'main.dlang');
        await writeFile(mainPath, s`
            import "./shared.dlang"
            
            Domain Sales { vision: "Sales operations" }
            bc OrderContext for Sales { description: "Orders" }
        `);

        // Act
        const result = await validateFile(mainPath);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.domainCount).toBe(2); // Both files counted
        expect(result.bcCount).toBe(1);
        expect(result.fileCount).toBeGreaterThanOrEqual(2); // Main + imported

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('includes diagnostics from imported files', async () => {
        // Arrange - imported file has a warning, entry file is otherwise valid
        const tempDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });

        const sharedPath = resolve(tempDir, 'shared.dlang');
        await writeFile(sharedPath, s`
            Domain Shared {}
        `);

        const mainPath = resolve(tempDir, 'main.dlang');
        await writeFile(mainPath, s`
            import "./shared.dlang"
            Domain Sales { vision: "Sales operations" }
            bc OrderContext for Sales { description: "Orders" }
        `);

        // Act
        const result = await validateFile(mainPath);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        const importedWarnings = result.warnings.filter(warning => warning.file === sharedPath);
        expect(importedWarnings.length).toBeGreaterThan(0);
        expect(importedWarnings.some(warning => warning.message.includes('vision'))).toBe(true);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('throws error for non-existent file', async () => {
        // Arrange
        const nonExistentPath = '/non/existent/file.dlang';

        // Act & Assert
        await expect(async () => {
            await validateFile(nonExistentPath);
        }).rejects.toThrow('File not found');
    });

    test('throws error for invalid file extension', async () => {
        // Arrange
        const tempDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });
        const filePath = resolve(tempDir, 'test.txt');
        await writeFile(filePath, 'invalid content');

        // Act & Assert
        await expect(async () => {
            await validateFile(filePath);
        }).rejects.toThrow('Invalid file extension');

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('respects custom workspace directory option', async () => {
        // Arrange - Create file in different location
        const tempDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
        const workspaceDir = resolve(tempDir, 'workspace');
        const fileDir = resolve(tempDir, 'files');
        await mkdir(workspaceDir, { recursive: true });
        await mkdir(fileDir, { recursive: true });
        
        const filePath = resolve(fileDir, 'test.dlang');
        await writeFile(filePath, s`
            Domain Sales { vision: "Sales" }
        `);

        // Act - Validate with custom workspace directory
        const result = await validateFile(filePath, { workspaceDir });

        // Assert
        expect(result.valid).toBe(true);
        expect(result.domainCount).toBe(1);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('counts multiple domains and bounded contexts', async () => {
        // Arrange
        const tempDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });
        const filePath = resolve(tempDir, 'test.dlang');
        await writeFile(filePath, s`
            Domain Sales { vision: "Sales" }
            Domain Billing { vision: "Billing" }
            Domain Shipping { vision: "Shipping" }
            
            bc OrderContext for Sales { description: "Orders" }
            bc PaymentContext for Billing { description: "Payments" }
            bc FulfillmentContext for Shipping { description: "Fulfillment" }
        `);

        // Act
        const result = await validateFile(filePath);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.domainCount).toBe(3);
        expect(result.bcCount).toBe(3);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('includes line and column numbers in diagnostics', async () => {
        // Arrange - Create model with duplicate names on different lines
        const tempDir = resolve(tmpdir(), `dlang-test-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });
        const filePath = resolve(tempDir, 'test.dlang');
        await writeFile(filePath, s`
            Domain Sales { vision: "Sales" }
            
            Domain Sales { vision: "Duplicate" }
        `);

        // Act
        const result = await validateFile(filePath);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        const error = result.errors[0];
        expect(error.line).toBeGreaterThan(0); // 1-based line number
        expect(error.column).toBeGreaterThan(0); // 1-based column number

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });
});

describe('validateWorkspace', () => {
    test('should validate workspace with default entry file (index.dlang)', async () => {
        // Arrange
        const tempDir = await mkdtemp(join(tmpdir(), 'dlang-test-'));
        const indexFile = join(tempDir, 'index.dlang');
        const modelYaml = join(tempDir, 'model.yaml');

        await writeFile(indexFile, `
            Classification Core

            Domain Sales {
                vision: "Sales management"
            }

            bc OrderContext for Sales as Core {
                description: "Order handling"
            }
        `);

        await writeFile(modelYaml, `
            name: test-workspace
            version: 1.0.0
        `);

        // Act
        const result = await validateWorkspace(tempDir);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
        expect(result.totalDiagnostics).toBe(0);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('should validate workspace with custom entry file', async () => {
        // Arrange
        const tempDir = await mkdtemp(join(tmpdir(), 'dlang-test-'));
        const entryFile = join(tempDir, 'main.dlang');
        const modelYaml = join(tempDir, 'model.yaml');

        await writeFile(entryFile, `
            Domain Sales {
                vision: "Sales management"
            }
        `);

        await writeFile(modelYaml, `
            name: test-workspace
            version: 1.0.0
            model:
                entry: main.dlang
        `);

        // Act
        const result = await validateWorkspace(tempDir);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('should collect errors from multiple files in workspace', async () => {
        // Arrange
        const tempDir = await mkdtemp(join(tmpdir(), 'dlang-test-'));
        const indexFile = join(tempDir, 'index.dlang');
        const sharedFile = join(tempDir, 'shared.dlang');
        const modelYaml = join(tempDir, 'model.yaml');

        await writeFile(indexFile, `
            import "./shared.dlang"

            Domain Sales {
                vision: "Sales management"
            }
        `);

        await writeFile(sharedFile, `
            // Missing vision causes warning
            Domain Shared {}
        `);

        await writeFile(modelYaml, `
            name: test-workspace
            version: 1.0.0
        `);

        // Act
        const result = await validateWorkspace(tempDir);

        // Assert
        // Warnings don't make workspace invalid, only errors do
        expect(result.valid).toBe(true);
        expect(result.warnings.some(warning => warning.file === sharedFile)).toBe(true);
        expect(result.totalDiagnostics).toBe(result.errors.length + result.warnings.length);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('should validate workspace without model.yaml (fallback)', async () => {
        // Arrange
        const tempDir = await mkdtemp(join(tmpdir(), 'dlang-test-'));
        const indexFile = join(tempDir, 'index.dlang');

        await writeFile(indexFile, `
            Domain Sales {
                vision: "Test"
            }
        `);

        // Act
        const result = await validateWorkspace(tempDir);

        // Assert
        // Should work even without model.yaml
        expect(result.valid).toBe(true);
        expect(result.domainCount).toBe(1);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('should fail when entry file is missing', async () => {
        // Arrange
        const tempDir = await mkdtemp(join(tmpdir(), 'dlang-test-'));
        const modelYaml = join(tempDir, 'model.yaml');

        await writeFile(modelYaml, `
            name: test-workspace
            version: 1.0.0
        `);

        // Act & Assert
        await expect(validateWorkspace(tempDir)).rejects.toThrow();

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('should fail when workspace directory does not exist', async () => {
        // Arrange
        const nonExistentDir = join(tmpdir(), 'dlang-nonexistent-' + Date.now());

        // Act & Assert
        await expect(validateWorkspace(nonExistentDir)).rejects.toThrow();
    });

    test('should validate workspace with imports across multiple files', async () => {
        // Arrange
        const tempDir = await mkdtemp(join(tmpdir(), 'dlang-test-'));
        const indexFile = join(tempDir, 'index.dlang');
        const domainsFile = join(tempDir, 'domains.dlang');
        const sharedFile = join(tempDir, 'shared.dlang');
        const modelYaml = join(tempDir, 'model.yaml');

        await writeFile(indexFile, `
            import "./domains.dlang"

            Classification Core

            bc OrderContext for Sales as Core {
                description: "Orders"
            }
        `);

        await writeFile(domainsFile, `
            import "./shared.dlang"

            Domain Sales {
                vision: "Sales"
            }
        `);

        await writeFile(sharedFile, `
            Domain Billing {
                vision: "Billing"
            }
        `);

        await writeFile(modelYaml, `
            name: test-workspace
            version: 1.0.0
        `);

        // Act
        const result = await validateWorkspace(tempDir);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });

    test('should detect validation errors across all workspace documents', async () => {
        // Arrange
        const tempDir = await mkdtemp(join(tmpdir(), 'dlang-test-'));
        const indexFile = join(tempDir, 'index.dlang');
        const domainsFile = join(tempDir, 'domains.dlang');
        const modelYaml = join(tempDir, 'model.yaml');

        await writeFile(indexFile, `
            import "./domains.dlang"

            // Reference to undefined domain causes error
            bc OrderContext for UndefinedDomain as Core {
                description: "Orders"
            }
        `);

        await writeFile(domainsFile, `
            Domain Sales {
                vision: "Sales"
            }

            // Missing description causes warning
            bc BillingContext for Sales as Supporting {}
        `);

        await writeFile(modelYaml, `
            name: test-workspace
            version: 1.0.0
        `);

        // Act
        const result = await validateWorkspace(tempDir);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors.some(error => error.message.includes('UndefinedDomain'))).toBe(true);
        expect(result.warnings.some(warning => warning.message.includes('description'))).toBe(true);
        expect(result.totalDiagnostics).toBe(result.errors.length + result.warnings.length);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });
    });
});
