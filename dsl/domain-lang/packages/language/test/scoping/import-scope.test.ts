/**
 * Import-Based Scope Tests
 *
 * Tests that reference resolution strictly respects import boundaries:
 * 1. Elements from non-imported files should NOT resolve
 * 2. Elements from imported files SHOULD resolve
 * 3. Invalid imports should NOT provide scope
 * 4. Path aliases require correct configuration
 * 5. Directory-first resolution respects scope boundaries
 * 6. Transitive imports should NOT provide scope
 *
 * This is critical for correctness - without proper import-based scoping,
 * the language would incorrectly resolve references to elements that
 * haven't been explicitly imported.
 *
 * @see /site/guide/imports.md for import semantics documentation
 */

import { describe, test, beforeAll, expect, afterAll } from 'vitest';
import { URI } from 'langium';
import type { LangiumDocument } from 'langium';
import { createDomainLangServices } from '../../src/domain-lang-module.js';
import { NodeFileSystem } from 'langium/node';
import type { Model, BoundedContext, ContextMap } from '../../src/generated/ast.js';
import { isBoundedContext, isContextMap } from '../../src/generated/ast.js';
import type { DomainLangIndexManager } from '../../src/lsp/domain-lang-index-manager.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('Import-Based Scoping', () => {
    let tempDir: string;
    let services: ReturnType<typeof createDomainLangServices>;

    beforeAll(async () => {
        // Create temp workspace for multi-file tests
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-scope-'));
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

    describe('Without imports - elements should NOT resolve across files', () => {
        test('BC reference to domain in separate file should NOT resolve without import', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'no-import-domain');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a Domain
            const fileA = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(fileA, `
                Domain Sales {
                    vision: "Sales operations"
                }
            `);

            // File B: tries to reference Sales without importing
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                bc OrderContext for Sales {
                    description: "Should NOT resolve Sales"
                }
            `);

            // Assert: The domain reference should NOT resolve
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref).toBeUndefined();
            expect(bc.domain?.error).toBeDefined();
        });

        test('ContextMap reference to BC in separate file should NOT resolve without import', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'no-import-bc');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a BoundedContext
            const fileA = path.join(projectDir, 'sales.dlang');
            await createAndLoadDocument(fileA, `
                Domain Sales {}
                bc OrderContext for Sales {
                    description: "Order management"
                }
            `);

            // File B: tries to reference OrderContext without importing
            const fileB = path.join(projectDir, 'maps.dlang');
            const docB = await createAndLoadDocument(fileB, `
                ContextMap SystemMap {
                    contains OrderContext
                }
            `);

            // Assert: The BC reference should NOT resolve
            const ctxMap = docB.parseResult.value.children.find(isContextMap) as ContextMap;
            expect(ctxMap).toBeDefined();
            expect(ctxMap.boundedContexts).toHaveLength(1);
            
            const bcRef = ctxMap.boundedContexts[0];
            // All items in the MultiReference should fail to resolve
            expect(bcRef.items.length).toBe(0);

            // Assert: There should be an error diagnostic for the unresolved reference
            const errors = docB.diagnostics?.filter(d => d.severity === 1) ?? [];
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.message.includes('OrderContext'))).toBe(true);
        });

        test('Team reference in BC should NOT resolve from non-imported file', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'no-import-team');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a Team
            const fileA = path.join(projectDir, 'teams.dlang');
            await createAndLoadDocument(fileA, `
                Team SalesTeam
            `);

            // File B: tries to reference SalesTeam without importing
            const fileB = path.join(projectDir, 'context.dlang');
            const docB = await createAndLoadDocument(fileB, `
                Domain Sales {}
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert: The team reference should NOT resolve
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            const teamRef = bc.team?.[0];
            expect(teamRef?.ref).toBeUndefined();
            expect(teamRef?.error).toBeDefined();
        });
    });

    describe('With valid imports - elements SHOULD resolve', () => {
        test('smoke: domain, BC, and team refs all resolve via import', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'valid-import-all');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines Domain + Team
            const fileA = path.join(projectDir, 'shared.dlang');
            await createAndLoadDocument(fileA, `
                Team SalesTeam
                Domain Sales {
                    vision: "Sales operations"
                }
                bc OrderContext for Sales {
                    description: "Order management"
                }
            `);

            // File B: imports shared.dlang, references Domain + Team + BC
            const fileB = path.join(projectDir, 'main.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./shared.dlang"

                bc PaymentContext for Sales {
                    description: "Should resolve Sales via import"
                    team: SalesTeam
                }

                ContextMap SystemMap {
                    contains OrderContext, PaymentContext
                }
            `);

            // Assert: domain reference resolves
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.domain?.ref?.name).toBe('Sales');
            expect(bc.domain?.error).toBeUndefined();

            // Assert: team reference resolves
            expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam');

            // Assert: ContextMap BC reference resolves
            const ctxMap = docB.parseResult.value.children.find(isContextMap) as ContextMap;
            expect(ctxMap.boundedContexts).toHaveLength(2);
            expect(ctxMap.boundedContexts[0].items[0].ref?.name).toBe('OrderContext');
            expect(ctxMap.boundedContexts[1].items[0].ref?.name).toBe('PaymentContext');
        });

        test('multiple imports provide combined scope', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'multi-import');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a Domain
            const fileA = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(fileA, `
                Domain Sales {
                    vision: "Sales operations"
                }
            `);

            // File B: defines a Team
            const fileB = path.join(projectDir, 'teams.dlang');
            await createAndLoadDocument(fileB, `
                Team SalesTeam
            `);

            // File C: imports both and references elements from each
            const fileC = path.join(projectDir, 'contexts.dlang');
            const docC = await createAndLoadDocument(fileC, `
                import "./domains.dlang"
                import "./teams.dlang"

                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            const bc = docC.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.domain?.ref?.name).toBe('Sales');
            expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam');
        });

        test('importing an empty file provides no additional scope', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'empty-import');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: empty dlang file
            const fileA = path.join(projectDir, 'empty.dlang');
            await createAndLoadDocument(fileA, ``);

            // File B: imports empty file, references non-existent domain
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./empty.dlang"

                bc OrderContext for Sales {
                    description: "Sales not defined anywhere"
                }
            `);

            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref).toBeUndefined();
            expect(bc.domain?.error).toBeDefined();
        });

        test('Classification resolves across import', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'classification-import');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a Classification
            const fileA = path.join(projectDir, 'classifications.dlang');
            await createAndLoadDocument(fileA, `
                Classification CoreDomain
                Classification SupportingDomain
            `);

            // File B: imports classifications and references them
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./classifications.dlang"

                Domain Sales {}
                bc OrderContext for Sales as CoreDomain {
                    description: "Core order management"
                }
            `);

            // Assert: Classification reference resolves via import
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.classification).toHaveLength(1);
            expect(bc.classification[0].ref?.name).toBe('CoreDomain');
        });

        test('Classification does NOT resolve without import', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'classification-no-import');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a Classification
            const fileA = path.join(projectDir, 'classifications.dlang');
            await createAndLoadDocument(fileA, `
                Classification CoreDomain
            `);

            // File B: tries to reference Classification without importing
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                Domain Sales {}
                bc OrderContext for Sales as CoreDomain {
                    description: "Should NOT resolve"
                }
            `);

            // Assert: Classification reference should NOT resolve
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.classification).toHaveLength(1);
            expect(bc.classification[0].ref).toBeUndefined();
        });

        test('ContextMap relationship arrow refs resolve across imports', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'cmap-arrow-import');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines Domain + BCs
            const fileA = path.join(projectDir, 'sales.dlang');
            await createAndLoadDocument(fileA, `
                Domain Sales {}
                bc OrderContext for Sales
                bc PaymentContext for Sales
            `);

            // File B: imports and creates ContextMap with relationship arrows
            const fileB = path.join(projectDir, 'maps.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./sales.dlang"

                ContextMap SalesMap {
                    contains OrderContext, PaymentContext
                    OrderContext -> PaymentContext
                }
            `);

            // Assert: ContextMap resolves and relationships parse
            const ctxMap = docB.parseResult.value.children.find(isContextMap) as ContextMap;
            expect(ctxMap).toBeDefined();
            expect(ctxMap.name).toBe('SalesMap');
            expect(ctxMap.boundedContexts).toHaveLength(2);
            expect(ctxMap.boundedContexts[0].items[0].ref?.name).toBe('OrderContext');
            expect(ctxMap.boundedContexts[1].items[0].ref?.name).toBe('PaymentContext');
            // Relationship should have both sides resolved
            expect(ctxMap.relationships).toHaveLength(1);
            expect(ctxMap.relationships[0].left.link?.ref?.name).toBe('OrderContext');
            expect(ctxMap.relationships[0].right.link?.ref?.name).toBe('PaymentContext');
        });

        test('Namespace-qualified refs resolve across imports', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'namespace-import');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines namespaced Domain
            const fileA = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(fileA, `
                Namespace acme.sales {
                    Domain Sales {
                        vision: "Sales operations"
                    }
                }
            `);

            // File B: imports and references via qualified name
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./domains.dlang"

                bc OrderContext for acme.sales.Sales {
                    description: "References namespaced domain"
                }
            `);

            // Assert: Namespace-qualified domain ref resolves
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref?.name).toBe('Sales');
        });
    });

    describe('With invalid imports - elements should NOT resolve', () => {
        test('BC reference should NOT resolve when import has typo', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'typo-import');
            await fs.mkdir(projectDir, { recursive: true });

            // File A: defines a Domain
            const fileA = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(fileA, `
                Domain Sales {
                    vision: "Sales operations"
                }
            `);

            // File B: has typo in import path
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./domainsss.dlang"
                
                bc OrderContext for Sales {
                    description: "Should NOT resolve - import has typo"
                }
            `);

            // Assert: The domain reference should NOT resolve
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref).toBeUndefined();
            expect(bc.domain?.error).toBeDefined();
        });

        test('References should NOT resolve when import file does not exist', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'missing-import');
            await fs.mkdir(projectDir, { recursive: true });

            // File B: imports non-existent file
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./nonexistent.dlang"
                
                bc OrderContext for SomeUnknownDomain {
                    description: "Should NOT resolve"
                }
            `);

            // Assert: The domain reference should NOT resolve
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref).toBeUndefined();
        });
    });

    describe('Path alias imports', () => {
        test('Path alias import SHOULD provide scope when valid', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'path-alias-valid');
            await fs.mkdir(path.join(projectDir, 'shared'), { recursive: true });

            // Create model.yaml with path alias
            await fs.writeFile(path.join(projectDir, 'model.yaml'), `
model:
  name: test/path-alias
  version: 1.0.0
  entry: index.dlang

paths:
  "@": "./"
  "@shared": "./shared"
`);

            // Create shared/teams.dlang
            const teamsFile = path.join(projectDir, 'shared', 'teams.dlang');
            await createAndLoadDocument(teamsFile, `
                Team SalesTeam
            `);

            // Initialize workspace manager
            await services.DomainLang.imports.WorkspaceManager.initialize(projectDir);

            // Create index.dlang using path alias
            const indexFile = path.join(projectDir, 'index.dlang');
            const docIndex = await createAndLoadDocument(indexFile, `
                import "@shared/teams.dlang"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert: The team reference SHOULD resolve via path alias
            const bc = docIndex.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            const teamRef = bc.team?.[0];
            expect(teamRef?.ref).toBeDefined();
            expect(teamRef?.ref?.name).toBe('SalesTeam');
        });

        test('Invalid path alias should NOT provide scope', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'path-alias-invalid');
            await fs.mkdir(path.join(projectDir, 'shared'), { recursive: true });

            // Create model.yaml with path alias
            await fs.writeFile(path.join(projectDir, 'model.yaml'), `
model:
  name: test/path-alias-invalid
  version: 1.0.0
  entry: index.dlang

paths:
  "@": "./"
  "@shared": "./shared"
`);

            // Create shared/teams.dlang
            const teamsFile = path.join(projectDir, 'shared', 'teams.dlang');
            await createAndLoadDocument(teamsFile, `
                Team SalesTeam
            `);

            // Initialize workspace manager
            await services.DomainLang.imports.WorkspaceManager.initialize(projectDir);

            // Create index.dlang with TYPO in path alias (@shareds instead of @shared)
            const indexFile = path.join(projectDir, 'index.dlang');
            const docIndex = await createAndLoadDocument(indexFile, `
                import "@shareds/teams.dlang"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert: The team reference should NOT resolve - import has typo
            const bc = docIndex.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            const teamRef = bc.team?.[0];
            expect(teamRef?.ref).toBeUndefined();

            // Assert: There should be an error diagnostic on the import line
            const errors = docIndex.diagnostics?.filter(d => d.severity === 1) ?? [];
            expect(errors.length).toBeGreaterThan(0);
            // Expect an error about the unresolved import with the typo
            const importError = errors.find(e => e.message.includes('@shareds'));
            expect(importError).toBeDefined();
            expect(importError?.message).toContain('Cannot resolve import');
        });
    });

    describe('Transitive imports', () => {
        test('Transitive imports should NOT provide scope (only direct imports)', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'transitive-import');
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

            // File C: imports B (but NOT A)
            // SalesTeam is transitively available via B, but should NOT be in scope
            const fileC = path.join(projectDir, 'contexts.dlang');
            const docC = await createAndLoadDocument(fileC, `
                import "./domains.dlang"
                
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert: Sales SHOULD resolve (imported via B)
            const bc = docC.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            expect(bc.domain?.ref).toBeDefined();
            expect(bc.domain?.ref?.name).toBe('Sales');

            // Assert: SalesTeam should NOT resolve (transitive, not directly imported)
            const teamRef = bc.team?.[0];
            expect(teamRef?.ref).toBeUndefined();
            expect(teamRef?.error).toBeDefined();
        });
    });

    describe('Directory-first resolution scoping', () => {
        test('Directory import via index.dlang SHOULD provide scope', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'dir-first-index');
            await fs.mkdir(path.join(projectDir, 'shared'), { recursive: true });

            // Create shared/index.dlang (entry point for directory)
            const indexFile = path.join(projectDir, 'shared', 'index.dlang');
            await createAndLoadDocument(indexFile, `
                Team SalesTeam
                Team ShippingTeam
            `);

            // Import the directory (should resolve to shared/index.dlang)
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "./shared"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert: Team should resolve via directory import
            const bc = docMain.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            const teamRef = bc.team?.[0];
            expect(teamRef?.ref).toBeDefined();
            expect(teamRef?.ref?.name).toBe('SalesTeam');
        });

        test('File fallback in directory-first SHOULD provide scope', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'dir-first-fallback');
            await fs.mkdir(projectDir, { recursive: true });

            // Create shared.dlang (no directory, just a file)
            const sharedFile = path.join(projectDir, 'shared.dlang');
            await createAndLoadDocument(sharedFile, `
                Team SalesTeam
            `);

            // Import without extension (should fall back to shared.dlang)
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "./shared"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert: Team should resolve via file fallback
            const bc = docMain.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            const teamRef = bc.team?.[0];
            expect(teamRef?.ref).toBeDefined();
            expect(teamRef?.ref?.name).toBe('SalesTeam');
        });

        test('Directory import prefers index.dlang over sibling file', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'dir-first-prefer-index');
            await fs.mkdir(path.join(projectDir, 'types'), { recursive: true });

            // Create types/index.dlang with Team IndexTeam
            const indexFile = path.join(projectDir, 'types', 'index.dlang');
            await createAndLoadDocument(indexFile, `
                Team IndexTeam
            `);

            // Create types.dlang with Team FileTeam (sibling file)
            const siblingFile = path.join(projectDir, 'types.dlang');
            await createAndLoadDocument(siblingFile, `
                Team FileTeam
            `);

            // Import "./types" should resolve to types/index.dlang NOT types.dlang
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "./types"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: IndexTeam
                }
            `);

            // Assert: IndexTeam SHOULD resolve (from directory index)
            const bc = docMain.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            const teamRef = bc.team?.[0];
            expect(teamRef?.ref).toBeDefined();
            expect(teamRef?.ref?.name).toBe('IndexTeam');
        });

        test('FileTeam from sibling file should NOT be in scope when directory import used', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'dir-first-exclude-sibling');
            await fs.mkdir(path.join(projectDir, 'types'), { recursive: true });

            // Create types/index.dlang (empty - no teams)
            const indexFile = path.join(projectDir, 'types', 'index.dlang');
            await createAndLoadDocument(indexFile, `
                Domain TypesDomain {}
            `);

            // Create types.dlang with Team FileTeam (sibling file - should NOT be in scope)
            const siblingFile = path.join(projectDir, 'types.dlang');
            await createAndLoadDocument(siblingFile, `
                Team FileTeam
            `);

            // Import "./types" - resolves to types/index.dlang, NOT types.dlang
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "./types"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: FileTeam
                }
            `);

            // Assert: FileTeam should NOT resolve (sibling file not imported)
            const bc = docMain.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            const teamRef = bc.team?.[0];
            expect(teamRef?.ref).toBeUndefined();
            expect(teamRef?.error).toBeDefined();
        });
    });

    describe('IndexManager getResolvedImports integration', () => {
        test('getResolvedImports returns resolved URIs for valid imports', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'get-resolved-imports');
            await fs.mkdir(projectDir, { recursive: true });

            // Create target file
            const teamsFile = path.join(projectDir, 'teams.dlang');
            await createAndLoadDocument(teamsFile, `Team SalesTeam`);

            // Create importing file
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "./teams.dlang"
                Domain Sales {}
            `);

            // Get index manager and check resolved imports
            const indexManager = services.shared.workspace.IndexManager as DomainLangIndexManager;
            const mainUri = docMain.uri.toString();
            const resolvedImports = indexManager.getResolvedImports(mainUri);

            expect(resolvedImports.size).toBe(1);
            expect([...resolvedImports][0]).toContain('teams.dlang');
        });

        test('getResolvedImports returns empty for invalid imports', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'invalid-resolved-imports');
            await fs.mkdir(projectDir, { recursive: true });

            // Create file with invalid import
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "./nonexistent.dlang"
                Domain Sales {}
            `);

            // Get index manager and check resolved imports
            const indexManager = services.shared.workspace.IndexManager as DomainLangIndexManager;
            const mainUri = docMain.uri.toString();
            const resolvedImports = indexManager.getResolvedImports(mainUri);

            // Invalid imports should not be in resolved set (empty resolution)
            expect(resolvedImports.size).toBe(0);
        });

        test('getResolvedImports returns empty for documents without imports', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'no-imports-resolved');
            await fs.mkdir(projectDir, { recursive: true });

            // Create file without imports
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                Domain Sales {}
                bc OrderContext for Sales {}
            `);

            // Get index manager and check resolved imports
            const indexManager = services.shared.workspace.IndexManager as DomainLangIndexManager;
            const mainUri = docMain.uri.toString();
            const resolvedImports = indexManager.getResolvedImports(mainUri);

            expect(resolvedImports.size).toBe(0);
        });
    });

    describe('Standalone files (no model.yaml)', () => {
        test('Standalone file can import relative path', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'standalone-relative');
            await fs.mkdir(projectDir, { recursive: true });
            // NOTE: No model.yaml - this is a standalone workspace

            // Create shared file
            const sharedFile = path.join(projectDir, 'shared.dlang');
            await createAndLoadDocument(sharedFile, `Team SalesTeam`);

            // Create main file using relative import
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "./shared.dlang"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert: Team should resolve
            const bc = docMain.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc).toBeDefined();
            const teamRef = bc.team?.[0];
            expect(teamRef?.ref).toBeDefined();
            expect(teamRef?.ref?.name).toBe('SalesTeam');
        });
    });
});
