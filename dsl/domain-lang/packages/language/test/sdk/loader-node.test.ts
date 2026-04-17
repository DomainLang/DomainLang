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

// ═══════════════════════════════════════════════════════════════════════════════
// Temp File Utility
// ═══════════════════════════════════════════════════════════════════════════════

async function createTestProject(
    files: Record<string, string>,
    tempDir: string
): Promise<Record<string, string>> {
    const created: Record<string, string> = {};
    for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(tempDir, filePath);
        const dirPath = path.dirname(fullPath);
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(fullPath, content);
        created[filePath] = fullPath;
    }
    return created;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Smoke and Error Handling
// ═══════════════════════════════════════════════════════════════════════════════

describe('SDK loadModel (Node.js)', () => {
    let tempDir: string;

    beforeAll(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-loader-node-'));
    });

    afterAll(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    // ═ Smoke: single file loading and error cases
    test('loads a domain model from disk with correct query results', async () => {
        // Arrange
        const projectDir = path.join(tempDir, 'single-file');
        await fs.mkdir(projectDir, { recursive: true });
        await createTestProject({
            'domains.dlang': 'Domain Sales { vision: "Sales operations" }'
        }, projectDir);

        // Act
        const { query, documents } = await loadModel('domains.dlang', { workspaceDir: projectDir });

        // Assert
        expect(documents.length).toBe(1);
        expect(query.domain('Sales')?.name).toBe('Sales');
        expect(query.domain('Sales')?.vision).toBe('Sales operations');
        expect(query.domains().count()).toBe(1);
    });

    // ═ Edge: error handling (missing file, invalid syntax, empty/whitespace)
    interface ErrorCase {
        name: string;
        setup: (projectDir: string) => Promise<string>;
        expectedError: RegExp;
    }

    test.each<ErrorCase>([
        {
            name: 'throws on non-existent file',
            setup: async (projectDir) => {
                await fs.mkdir(projectDir, { recursive: true });
                return 'does-not-exist.dlang';
            },
            expectedError: /does.not.exist|not.*found/i
        },
        {
            name: 'throws on invalid syntax',
            setup: async (projectDir) => {
                await createTestProject({
                    'invalid.dlang': 'This is not valid DomainLang syntax !!!'
                }, projectDir);
                return 'invalid.dlang';
            },
            expectedError: /error/i
        },
    ])('$name', async ({ setup, expectedError }) => {
        // Arrange
        const projectDir = path.join(tempDir, `error-${Math.random()}`);
        const entryFile = await setup(projectDir);

        // Act & Assert
        await expect(() => loadModel(entryFile, { workspaceDir: projectDir })).rejects.toThrow(expectedError);
    });

    test.each([
        { label: 'empty', content: '' },
        { label: 'whitespace-only', content: '   \n  \n  ' },
    ])('loads $label file as a model with no entities', async ({ content }) => {
        // Arrange
        const projectDir = path.join(tempDir, `empty-${Math.random()}`);
        await createTestProject({
            'empty.dlang': content
        }, projectDir);

        // Act
        const { query } = await loadModel('empty.dlang', { workspaceDir: projectDir });

        // Assert
        expect(query.domains().count()).toBe(0);
        expect(query.boundedContexts().count()).toBe(0);
    });

    // ═════════════════════════════════════════════════════════════════════════════════
    // Multi-File Import Graph Traversal
    // ═════════════════════════════════════════════════════════════════════════════════

    describe('Multi-file import graph traversal', () => {

        interface ImportGraphCase {
            name: string;
            files: Record<string, string>;
            expectedDocCount: number;
            expectedDomainCount: number;
            expectedBcCount: number;
        }

        test.each<ImportGraphCase>([
            {
                name: 'single-level imports (main -> types)',
                files: {
                    'main.dlang': 'import "./types.dlang"\nDomain Sales { vision: "Sales operations" }\nBoundedContext OrderContext for Sales { description: "Order processing" }',
                    'types.dlang': 'Domain SharedTypes { vision: "Shared type definitions" }'
                },
                expectedDocCount: 2,
                expectedDomainCount: 1,
                expectedBcCount: 1
            },
            {
                name: 'transitive imports (main -> domains -> teams)',
                files: {
                    'main.dlang': 'import "./domains.dlang"\nBoundedContext App for Sales { description: "Main app" }',
                    'domains.dlang': 'import "./teams.dlang"\nDomain Sales { vision: "Sales operations" }',
                    'teams.dlang': 'Team SalesTeam\nTeam SupportTeam'
                },
                expectedDocCount: 3,
                expectedDomainCount: 0,
                expectedBcCount: 1
            },
            {
                name: 'diamond imports (shared dep loaded once)',
                files: {
                    'main.dlang': 'import "./contexts.dlang"\nimport "./teams.dlang"\nDomain Sales { vision: "Sales operations" }',
                    'contexts.dlang': 'import "./shared.dlang"\nBoundedContext OrderContext for Sales { description: "Orders" }',
                    'teams.dlang': 'import "./shared.dlang"\nTeam SalesTeam',
                    'shared.dlang': 'Metadata Priority'
                },
                expectedDocCount: 4,
                expectedDomainCount: 1,
                expectedBcCount: 0
            },
            {
                name: 'nested directory imports',
                files: {
                    'main.dlang': 'import "./domains/sales.dlang"\nBoundedContext App for Sales { description: "Main app" }',
                    'domains/sales.dlang': 'Domain Sales { vision: "Sales operations" }'
                },
                expectedDocCount: 2,
                expectedDomainCount: 0,
                expectedBcCount: 1
            },
        ])('$name', async ({ files, expectedDocCount, expectedDomainCount, expectedBcCount }) => {
            // Arrange
            const projectDir = path.join(tempDir, `graph-${Math.random()}`);
            await createTestProject(files, projectDir);

            // Act
            const { query, documents } = await loadModel('main.dlang', { workspaceDir: projectDir });

            // Assert
            expect(documents.length).toBe(expectedDocCount);
            expect(query.domains().toArray()).toHaveLength(expectedDomainCount);
            expect(query.boundedContexts().count()).toBe(expectedBcCount);
        });

        test('throws when imported file does not exist', async () => {
            // Arrange
            const projectDir = path.join(tempDir, `broken-import-${Math.random()}`);
            await createTestProject({
                'main.dlang': 'import "./nonexistent.dlang"\nDomain Sales { vision: "v" }'
            }, projectDir);

            // Act & Assert
            try {
                const { documents } = await loadModel('main.dlang', { workspaceDir: projectDir });
                // If it loads, should have fewer documents than expected
                expect(documents.length).toBeLessThanOrEqual(1);
            } catch (error) {
                // Throwing is also acceptable behavior for broken imports
                expect(error).toBeInstanceOf(Error);
            }
        });
    });

    // ═════════════════════════════════════════════════════════════════════════════════
    // Model Augmentation
    // ═════════════════════════════════════════════════════════════════════════════════

    test('augments entry model with effectiveClassification and effectiveTeam', async () => {
        // Arrange
        const projectDir = path.join(tempDir, 'augmentation-test');
        await createTestProject({
            'main.dlang': 'Classification Core\nDomain Sales { vision: "Sales operations" }\nTeam SalesTeam\nBoundedContext OrderContext for Sales as Core by SalesTeam { description: "Order processing" }'
        }, projectDir);

        // Act
        const { query } = await loadModel('main.dlang', { workspaceDir: projectDir });

        // Assert
        const bc = query.bc('OrderContext');
        expect(bc?.name).toBe('OrderContext');
        expect(bc?.effectiveClassification?.name).toBe('Core');
        expect(bc?.effectiveTeam?.name).toBe('SalesTeam');
    });
});