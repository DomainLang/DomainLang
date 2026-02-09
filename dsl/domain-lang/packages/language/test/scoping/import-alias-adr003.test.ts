/**
 * Import Alias and Package-Boundary Transitive Import Tests
 *
 * Tests for ADR-003: Import Aliases and Package-Boundary Transitive Scoping
 *
 * Key behaviors tested:
 * 1. Import aliases control visibility: `import "pkg" as ddd` → types visible as `ddd.*` only
 * 2. Without alias: types visible by their qualified names
 * 3. Package-boundary transitive imports: External packages can re-export
 * 4. Local files remain non-transitive (explicit dependency principle)
 *
 * @see ADR-003 for design decisions and rationale
 */

import { describe, test, beforeAll, expect, afterAll } from 'vitest';
import { URI } from 'langium';
import type { LangiumDocument } from 'langium';
import { createDomainLangServices } from '../../src/domain-lang-module.js';
import { NodeFileSystem } from 'langium/node';
import type { Model, BoundedContext } from '../../src/generated/ast.js';
import { isBoundedContext } from '../../src/generated/ast.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('ADR-003: Import Aliases and Package Scope', () => {
    let tempDir: string;
    let services: ReturnType<typeof createDomainLangServices>;

    beforeAll(async () => {
        // Create temp workspace for multi-file tests
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-adr003-'));
        services = createDomainLangServices(NodeFileSystem);
    });

    afterAll(async () => {
        // Clean up temp directory
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    /**
     * Helper to create a file and load it as a document
     */
    async function createAndLoadDocument(filePath: string, content: string): Promise<LangiumDocument<Model>> {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);
        const uri = URI.file(filePath);
        const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
        await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
        return doc as LangiumDocument<Model>;
    }

    /**
     * Helper to clear all documents between tests
     */
    async function clearAllDocuments(): Promise<void> {
        const docs = services.shared.workspace.LangiumDocuments.all.toArray();
        for (const doc of docs) {
            services.shared.workspace.LangiumDocuments.deleteDocument(doc.uri);
        }
    }

    describe('Import Alias Prefix Resolution', () => {
        test('With alias: types ONLY visible via alias prefix', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'with-alias');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a Domain
            const fileA = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(fileA, `
                Domain Sales {
                    vision: "Sales operations"
                }
            `);

            // Act
            // File B: imports A with alias "mydomains"
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./domains.dlang" as mydomains
                
                bc OrderContext for mydomains.Sales {
                    description: "Uses alias prefix"
                }
            `);

            // Assert
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref).toBeDefined();
            expect(bc.domain?.ref?.name).toBe('Sales');
        });

        test('With alias: direct reference WITHOUT alias should NOT resolve', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'alias-required');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a Domain
            const fileA = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(fileA, `
                Domain Sales {
                    vision: "Sales operations"
                }
            `);

            // Act
            // File B: imports A with alias, tries to use without alias
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./domains.dlang" as mydomains
                
                bc OrderContext for Sales {
                    description: "Should NOT resolve without alias"
                }
            `);

            // Assert
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref).toBeUndefined();
            expect(bc.domain?.error).toBeDefined();
        });

        test('Without alias: types visible by their direct qualified names', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'no-alias');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a Domain
            const fileA = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(fileA, `
                Domain Sales {
                    vision: "Sales operations"
                }
            `);

            // Act
            // File B: imports A without alias
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./domains.dlang"
                
                bc OrderContext for Sales {
                    description: "Direct access without alias"
                }
            `);

            // Assert
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref).toBeDefined();
            expect(bc.domain?.ref?.name).toBe('Sales');
        });

        test('Multiple imports with different aliases work independently', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'multi-alias');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: Sales domain
            const fileA = path.join(projectDir, 'sales.dlang');
            await createAndLoadDocument(fileA, `
                Domain Sales {
                    vision: "Sales operations"
                }
            `);

            // File B: Shipping domain
            const fileB = path.join(projectDir, 'shipping.dlang');
            await createAndLoadDocument(fileB, `
                Domain Shipping {
                    vision: "Shipping logistics"
                }
            `);

            // Act
            // File C: imports both with different aliases
            const fileC = path.join(projectDir, 'main.dlang');
            const docC = await createAndLoadDocument(fileC, `
                import "./sales.dlang" as sales
                import "./shipping.dlang" as shipping
                
                bc OrderContext for sales.Sales {}
                bc ShipmentContext for shipping.Shipping {}
            `);

            // Assert
            const bcs = docC.parseResult.value.children.filter(isBoundedContext);
            expect(bcs).toHaveLength(2);
            
            const orderContext = bcs.find(bc => bc.name === 'OrderContext');
            expect(orderContext?.domain?.ref?.name).toBe('Sales');
            
            const shipmentContext = bcs.find(bc => bc.name === 'ShipmentContext');
            expect(shipmentContext?.domain?.ref?.name).toBe('Shipping');
        });
    });

    describe('Package-Boundary Transitive Imports', () => {
        test.skip('External package can re-export internal types (transitive within package)', async () => {
            // Arrange: Create a mock external package structure
            await clearAllDocuments();
            const packageDir = path.join(tempDir, '.dlang', 'packages', 'test-owner', 'test-pkg', 'abc123');
            await fs.mkdir(packageDir, { recursive: true });

            // Package internal file
            const internal = path.join(packageDir, 'internal.dlang');
            await createAndLoadDocument(internal, `
                namespace std.strategic {
                    Classification CoreDomain
                    Classification SupportingDomain
                }
            `);

            // Package index (re-exports internal)
            const index = path.join(packageDir, 'index.dlang');
            await createAndLoadDocument(index, `
                import "./internal.dlang"
            `);

            // Package manifest
            const manifest = path.join(packageDir, 'model.yaml');
            await fs.writeFile(manifest, 'model:\n  name: test-owner/test-pkg\n');

            // Act
            // Consumer project imports package
            const projectDir = path.join(tempDir, 'consumer');
            const consumer = path.join(projectDir, 'main.dlang');
            const docConsumer = await createAndLoadDocument(consumer, `
                import "../.dlang/packages/test-owner/test-pkg/abc123/index.dlang" as pkg
                
                Domain Sales {}
                bc OrderContext for Sales as pkg.std.strategic.CoreDomain {}
            `);

            // Assert: Should resolve via package re-export
            const bc = docConsumer.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.classification?.length).toBeGreaterThan(0);
            expect(bc.classification?.[0]?.ref).toBeDefined();
            expect(bc.classification?.[0]?.ref?.name).toBe('CoreDomain');
        });

        test('Local files remain non-transitive (regression test)', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'local-non-transitive');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a Team
            const fileA = path.join(projectDir, 'teams.dlang');
            await createAndLoadDocument(fileA, `
                Team SalesTeam
            `);

            // File B: imports A
            const fileB = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(fileB, `
                import "./teams.dlang"
                
                Domain Sales {
                    vision: "Sales operations"
                }
            `);

            // Act
            // File C: imports B (but NOT A)
            const fileC = path.join(projectDir, 'contexts.dlang');
            const docC = await createAndLoadDocument(fileC, `
                import "./domains.dlang"
                
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert: Sales SHOULD resolve (direct import)
            const bc = docC.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref).toBeDefined();

            // Assert: SalesTeam should NOT resolve (transitive via B, but local files)
            const teamRef = bc.team?.[0];
            expect(teamRef?.ref).toBeUndefined();
            expect(teamRef?.error).toBeDefined();
        });
    });

    describe('Alias with Namespaces', () => {
        test('Alias prefix works with namespaced types', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'alias-namespace');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines namespaced types
            const fileA = path.join(projectDir, 'types.dlang');
            await createAndLoadDocument(fileA, 
`Namespace myns {
    Domain Sales {
        vision: "Sales operations"
    }
}`);

            // Act
            // File B: imports with alias
            const fileB = path.join(projectDir, 'main.dlang');
            const docB = await createAndLoadDocument(fileB, 
`import "./types.dlang" as pkg

bc OrderContext for pkg.myns.Sales {}`
            );

            // Assert
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref).toBeDefined();
            expect(bc.domain?.ref?.name).toBe('Sales');
        });
    });
});
