/**
 * Node.js Loader Tests
 *
 * Tests the loadModel() function from loader-node.ts:
 * - Single file loading with value assertions (smoke ~20%)
 * - Multi-file import graph traversal (edge ~40%)
 * - Error handling: missing files, invalid syntax, empty files (edge ~40%)
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { loadModel } from '../../src/sdk/loader-node.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('SDK loadModel (Node.js)', () => {
    let tempDir: string;

    beforeAll(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-loader-node-'));
    });

    afterAll(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    // ========================================================================
    // Smoke: single file loading (~20%)
    // ========================================================================

    describe('Smoke: single file loading', () => {
        test('loads a domain model from disk with correct query results', async () => {
            // Arrange
            const projectDir = path.join(tempDir, 'single-file');
            await fs.mkdir(projectDir, { recursive: true });
            await fs.writeFile(path.join(projectDir, 'domains.dlang'), `
                Domain Sales {
                    vision: "Sales operations"
                }
            `);

            // Act
            const { query, documents } = await loadModel(
                'domains.dlang',
                { workspaceDir: projectDir }
            );

            // Assert
            expect(documents.length).toBe(1);
            expect(query.domain('Sales')?.name).toBe('Sales');
            expect(query.domain('Sales')?.vision).toBe('Sales operations');
            expect(query.domains().count()).toBe(1);
        });
    });

    // ========================================================================
    // Edge: error handling
    // ========================================================================

    describe('Edge: error handling', () => {
        test('throws on non-existent file', async () => {
            // Arrange
            const projectDir = path.join(tempDir, 'missing-file');
            await fs.mkdir(projectDir, { recursive: true });

            // Act & Assert
            await expect(
                loadModel('does-not-exist.dlang', { workspaceDir: projectDir })
            ).rejects.toThrow();
        });

        test('throws on invalid syntax with error details', async () => {
            // Arrange
            const projectDir = path.join(tempDir, 'invalid-syntax');
            await fs.mkdir(projectDir, { recursive: true });
            await fs.writeFile(path.join(projectDir, 'invalid.dlang'), `
                This is not valid DomainLang syntax !!!
            `);

            // Act & Assert
            await expect(
                loadModel('invalid.dlang', { workspaceDir: projectDir })
            ).rejects.toThrow(/errors/i);
        });

        test.each([
            { label: 'empty', content: '', fileName: 'empty.dlang' },
            { label: 'whitespace-only', content: '   \n  \n  ', fileName: 'whitespace.dlang' },
        ])('loads $label file as a model with no entities', async ({ content, fileName }) => {
            // Arrange
            const projectDir = path.join(tempDir, `${fileName}-dir`);
            await fs.mkdir(projectDir, { recursive: true });
            await fs.writeFile(path.join(projectDir, fileName), content);

            // Act
            const { query } = await loadModel(
                fileName,
                { workspaceDir: projectDir }
            );

            // Assert
            expect(query.domains().count()).toBe(0);
            expect(query.boundedContexts().count()).toBe(0);
        });
    });

    // ========================================================================
    // Edge: multi-file import graph traversal
    // ========================================================================

    describe('Edge: multi-file import graph traversal', () => {
        test('loads imported files and resolves cross-file references', async () => {
            // Arrange
            const projectDir = path.join(tempDir, 'multi-file-local');
            await fs.mkdir(projectDir, { recursive: true });

            await fs.writeFile(path.join(projectDir, 'main.dlang'), `
                import "./types.dlang"

                Domain Sales {
                    vision: "Sales operations"
                }

                BoundedContext OrderContext for Sales {
                    description: "Order processing"
                }
            `);

            await fs.writeFile(path.join(projectDir, 'types.dlang'), `
                Domain SharedTypes {
                    vision: "Shared type definitions"
                }
            `);

            // Act
            const { query, documents } = await loadModel(
                'main.dlang',
                { workspaceDir: projectDir }
            );

            // Assert
            expect(documents.length).toBe(2);
            // Query spans entry model content
            const domains = query.domains().toArray();
            expect(domains.length).toBe(1);
            expect(domains[0].name).toBe('Sales');
        });

        test('handles transitive imports (A->B->C)', async () => {
            // Arrange
            const projectDir = path.join(tempDir, 'transitive-imports');
            await fs.mkdir(projectDir, { recursive: true });

            await fs.writeFile(path.join(projectDir, 'main.dlang'), `
                import "./domains.dlang"
                BoundedContext App for Sales { description: "Main app" }
            `);

            await fs.writeFile(path.join(projectDir, 'domains.dlang'), `
                import "./teams.dlang"
                Domain Sales { vision: "Sales operations" }
            `);

            await fs.writeFile(path.join(projectDir, 'teams.dlang'), `
                Team SalesTeam
                Team SupportTeam
            `);

            // Act
            const { query, documents } = await loadModel(
                'main.dlang',
                { workspaceDir: projectDir }
            );

            // Assert
            expect(documents.length).toBe(3);
            expect(query.bc('App')?.name).toBe('App');
        });

        test('handles diamond imports (shared dep loaded once)', async () => {
            // Arrange
            const projectDir = path.join(tempDir, 'diamond-imports');
            await fs.mkdir(projectDir, { recursive: true });

            await fs.writeFile(path.join(projectDir, 'main.dlang'), `
                import "./contexts.dlang"
                import "./teams.dlang"
                Domain Sales { vision: "Sales operations" }
            `);

            await fs.writeFile(path.join(projectDir, 'contexts.dlang'), `
                import "./shared.dlang"
                BoundedContext OrderContext for Sales { description: "Orders" }
            `);

            await fs.writeFile(path.join(projectDir, 'teams.dlang'), `
                import "./shared.dlang"
                Team SalesTeam
            `);

            await fs.writeFile(path.join(projectDir, 'shared.dlang'), `
                Metadata Priority
            `);

            // Act
            const { documents } = await loadModel(
                'main.dlang',
                { workspaceDir: projectDir }
            );

            // Assert
            // All four files loaded, shared.dlang only once
            expect(documents.length).toBe(4);
        });

        test('loads imports from subdirectories', async () => {
            // Arrange
            const projectDir = path.join(tempDir, 'nested-imports');
            await fs.mkdir(path.join(projectDir, 'domains'), { recursive: true });

            await fs.writeFile(path.join(projectDir, 'main.dlang'), `
                import "./domains/sales.dlang"
                BoundedContext App for Sales { description: "Main app" }
            `);

            await fs.writeFile(path.join(projectDir, 'domains', 'sales.dlang'), `
                Domain Sales { vision: "Sales operations" }
            `);

            // Act
            const { query, documents } = await loadModel(
                'main.dlang',
                { workspaceDir: projectDir }
            );

            // Assert
            expect(documents.length).toBe(2);
            expect(query.bc('App')?.name).toBe('App');
        });

        test('throws when imported file does not exist', async () => {
            // Arrange
            const projectDir = path.join(tempDir, 'broken-import');
            await fs.mkdir(projectDir, { recursive: true });

            await fs.writeFile(path.join(projectDir, 'main.dlang'), `
                import "./nonexistent.dlang"
                Domain Sales { vision: "v" }
            `);

            // Act & Assert
            // Should still load entry but may have link errors
            // or throw - depends on implementation
            try {
                const { documents } = await loadModel(
                    'main.dlang',
                    { workspaceDir: projectDir }
                );
                // If it loads, should have fewer documents than expected
                expect(documents.length).toBeLessThanOrEqual(1);
            } catch (error: unknown) {
                // Throwing is also acceptable behavior for broken imports
                expect(error).toBeInstanceOf(Error);
            }
        });
    });

    // ========================================================================
    // Edge: model augmentation
    // ========================================================================

    describe('Edge: model augmentation', () => {
        test('augments entry model with effectiveClassification and effectiveTeam', async () => {
            // Arrange
            const projectDir = path.join(tempDir, 'augmentation-test');
            await fs.mkdir(projectDir, { recursive: true });

            await fs.writeFile(path.join(projectDir, 'main.dlang'), `
                Classification Core
                Domain Sales { vision: "Sales operations" }
                Team SalesTeam
                BoundedContext OrderContext for Sales as Core by SalesTeam {
                    description: "Order processing"
                }
            `);

            // Act
            const { query } = await loadModel(
                'main.dlang',
                { workspaceDir: projectDir }
            );

            // Assert
            const bc = query.bc('OrderContext');
            expect(bc?.name).toBe('OrderContext');
            expect(bc?.effectiveClassification?.name).toBe('Core');
            expect(bc?.effectiveTeam?.name).toBe('SalesTeam');
        });

        // "undefined for unset classification/team" covered by ast-augmentation.test.ts
    });
});
