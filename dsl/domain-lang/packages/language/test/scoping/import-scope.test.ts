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
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-scope-'));
        services = createDomainLangServices(NodeFileSystem);
    });

    afterAll(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    async function createAndLoadDocument(filePath: string, content: string): Promise<LangiumDocument<Model>> {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);
        const uri = URI.file(filePath);
        const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
        await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
        return doc as LangiumDocument<Model>;
    }

    async function clearAllDocuments(): Promise<void> {
        const docs = services.shared.workspace.LangiumDocuments.all.toArray();
        for (const doc of docs) {
            services.shared.workspace.LangiumDocuments.deleteDocument(doc.uri);
        }
    }

    describe('Without imports - elements should NOT resolve across files', () => {
        test.each([
            {
                elementType: 'Domain',
                sourceFile: `Domain Sales { vision: "Sales operations" }`,
                refFile: `bc OrderContext for Sales { description: "Should NOT resolve Sales" }`,
                refName: 'Sales',
                checkResolution: (doc: LangiumDocument<Model>) => {
                    const bc = doc.parseResult.value.children.find(isBoundedContext) as BoundedContext;
                    expect(bc.domain?.ref).toBeUndefined();
                },
            },
            {
                elementType: 'Team',
                sourceFile: `Team SalesTeam`,
                refFile: `Domain Sales {}
bc OrderContext for Sales { team: SalesTeam }`,
                refName: 'SalesTeam',
                checkResolution: (doc: LangiumDocument<Model>) => {
                    const bc = doc.parseResult.value.children.find(isBoundedContext) as BoundedContext;
                    expect(bc.team?.[0]?.ref).toBeUndefined();
                },
            },
            {
                elementType: 'Classification',
                sourceFile: `Classification CoreDomain`,
                refFile: `Domain Sales {}
bc OrderContext for Sales as CoreDomain {}`,
                refName: 'CoreDomain',
                checkResolution: (doc: LangiumDocument<Model>) => {
                    const bc = doc.parseResult.value.children.find(isBoundedContext) as BoundedContext;
                    expect(bc.classification?.[0]?.ref).toBeUndefined();
                },
            },
        ])('$elementType reference should NOT resolve without import', async ({ sourceFile, refFile, refName, checkResolution }) => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, `no-import-${refName}`);
            await fs.mkdir(projectDir, { recursive: true });

            const fileA = path.join(projectDir, 'source.dlang');
            await createAndLoadDocument(fileA, sourceFile);

            // Act
            const fileB = path.join(projectDir, 'consumer.dlang');
            const docB = await createAndLoadDocument(fileB, refFile);

            // Assert
            checkResolution(docB);
            const errors = docB.diagnostics?.filter(d => d.severity === 1) ?? [];
            expect(errors.some(e => e.message.includes(refName))).toBe(true);
        });

        test('ContextMap BC reference should NOT resolve without import', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'no-import-bc');
            await fs.mkdir(projectDir, { recursive: true });

            const fileA = path.join(projectDir, 'sales.dlang');
            await createAndLoadDocument(fileA, `
                Domain Sales {}
                bc OrderContext for Sales { description: "Order management" }
            `);

            // Act
            const fileB = path.join(projectDir, 'maps.dlang');
            const docB = await createAndLoadDocument(fileB, `
                ContextMap SystemMap {
                    contains OrderContext
                }
            `);

            // Assert
            const ctxMap = docB.parseResult.value.children.find(isContextMap) as ContextMap;
            expect(ctxMap.name).toBe('SystemMap');
            expect(ctxMap.boundedContexts[0].items.length).toBe(0);
            const errors = docB.diagnostics?.filter(d => d.severity === 1) ?? [];
            expect(errors.filter(e => e.message.includes('OrderContext')).length).toBeGreaterThan(0);
        });
    });

    describe('With valid imports - elements SHOULD resolve', () => {
        test('smoke: domain, BC, and team refs all resolve via import', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'valid-import-all');
            await fs.mkdir(projectDir, { recursive: true });

            const fileA = path.join(projectDir, 'shared.dlang');
            await createAndLoadDocument(fileA, `
                Team SalesTeam
                Domain Sales { vision: "Sales operations" }
                bc OrderContext for Sales { description: "Order management" }
            `);

            // Act
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

            // Assert
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.domain?.ref?.name).toBe('Sales');
            expect(bc.domain?.error).toBeUndefined();
            expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam');

            const ctxMap = docB.parseResult.value.children.find(isContextMap) as ContextMap;
            expect(ctxMap.boundedContexts).toHaveLength(2);
            expect(ctxMap.boundedContexts[0].items[0].ref?.name).toBe('OrderContext');
            expect(ctxMap.boundedContexts[1].items[0].ref?.name).toBe('PaymentContext');
        });

        test.each([
            {
                scenario: 'multiple imports provide combined scope',
                importA: `Domain Sales { vision: "Sales operations" }`,
                importB: `Team SalesTeam`,
                referenceCode: `bc OrderContext for Sales { team: SalesTeam }`,
                checkA: (bc: BoundedContext) => expect(bc.domain?.ref?.name).toBe('Sales'),
                checkB: (bc: BoundedContext) => expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam'),
            },
            {
                scenario: 'importing an empty file provides no additional scope',
                importA: ``,
                importB: ``,
                referenceCode: `bc OrderContext for Sales { description: "Sales not defined anywhere" }`,
                checkA: (bc: BoundedContext) => expect(bc.domain?.ref).toBeUndefined(),
                checkB: (bc: BoundedContext) => expect(bc.domain?.error?.message).toContain('Sales'),
            },
        ])('$scenario', async ({ importA, importB, referenceCode, checkA, checkB }) => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, `multi-import-${Date.now()}`);
            await fs.mkdir(projectDir, { recursive: true });

            const fileA = path.join(projectDir, 'a.dlang');
            await createAndLoadDocument(fileA, importA);

            const fileB = path.join(projectDir, 'b.dlang');
            await createAndLoadDocument(fileB, importB);

            // Act
            const fileC = path.join(projectDir, 'main.dlang');
            const docC = await createAndLoadDocument(fileC, `
                import "./a.dlang"
                import "./b.dlang"
                ${referenceCode}
            `);

            // Assert
            const bc = docC.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            checkA(bc);
            checkB(bc);
        });

        test.each([
            {
                type: 'Classification',
                sourceFile: `Classification CoreDomain\nClassification SupportingDomain`,
                refFile: `import "./source.dlang"
Domain Sales {}
bc OrderContext for Sales as CoreDomain { description: "Core order management" }`,
                checkResolution: (doc: LangiumDocument<Model>) => {
                    const bc = doc.parseResult.value.children.find(isBoundedContext) as BoundedContext;
                    expect(bc.classification).toHaveLength(1);
                    expect(bc.classification[0].ref?.name).toBe('CoreDomain');
                },
            },
            {
                type: 'ContextMap relationships',
                sourceFile: `Domain Sales {}
bc OrderContext for Sales
bc PaymentContext for Sales`,
                refFile: `import "./source.dlang"

ContextMap SalesMap {
    contains OrderContext, PaymentContext
    OrderContext -> PaymentContext
}`,
                checkResolution: (doc: LangiumDocument<Model>) => {
                    const ctxMap = doc.parseResult.value.children.find(isContextMap) as ContextMap;
                    expect(ctxMap.name).toBe('SalesMap');
                    expect(ctxMap.relationships).toHaveLength(1);
                    expect(ctxMap.relationships[0].left.link?.ref?.name).toBe('OrderContext');
                    expect(ctxMap.relationships[0].right.link?.ref?.name).toBe('PaymentContext');
                },
            },
        ])('$type resolves across import', async ({ sourceFile, refFile, checkResolution }) => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, `type-import-${Date.now()}`);
            await fs.mkdir(projectDir, { recursive: true });

            const fileA = path.join(projectDir, 'source.dlang');
            await createAndLoadDocument(fileA, sourceFile);

            // Act
            const fileB = path.join(projectDir, 'main.dlang');
            const docB = await createAndLoadDocument(fileB, refFile);

            // Assert
            checkResolution(docB);
        });

        test('Namespace-qualified refs resolve across imports', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'namespace-import');
            await fs.mkdir(projectDir, { recursive: true });

            const fileA = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(fileA, `
                Namespace acme.sales {
                    Domain Sales { vision: "Sales operations" }
                }
            `);

            // Act
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "./domains.dlang"

                bc OrderContext for acme.sales.Sales {
                    description: "References namespaced domain"
                }
            `);

            // Assert
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.name).toBe('OrderContext');
            expect(bc.domain?.ref?.name).toBe('Sales');
        });
    });

    describe('With invalid imports - elements should NOT resolve', () => {
        test.each([
            {
                scenario: 'import has typo',
                importPath: './domainsss.dlang',
                importFile: `Domain Sales { vision: "Sales operations" }`,
                refFile: `bc OrderContext for Sales { description: "Should NOT resolve - import has typo" }`,
            },
            {
                scenario: 'import file does not exist',
                importPath: './nonexistent.dlang',
                importFile: null,
                refFile: `bc OrderContext for SomeUnknownDomain { description: "Should NOT resolve" }`,
            },
        ])('references should NOT resolve when $scenario', async ({ importPath, importFile, refFile }) => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, `invalid-import-${Date.now()}`);
            await fs.mkdir(projectDir, { recursive: true });

            if (importFile) {
                const fileA = path.join(projectDir, 'domains.dlang');
                await createAndLoadDocument(fileA, importFile);
            }

            // Act
            const fileB = path.join(projectDir, 'contexts.dlang');
            const docB = await createAndLoadDocument(fileB, `
                import "${importPath}"
                ${refFile}
            `);

            // Assert
            const bc = docB.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.name).toBe('OrderContext');
            expect(bc.domain?.ref).toBeUndefined();
        });
    });

    describe('Path alias imports', () => {
        test('Path alias import SHOULD provide scope when valid', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'path-alias-valid');
            await fs.mkdir(path.join(projectDir, 'shared'), { recursive: true });

            await fs.writeFile(path.join(projectDir, 'model.yaml'), `
model:
  name: test/path-alias
  version: 1.0.0
  entry: index.dlang

paths:
  "@": "./"
  "@shared": "./shared"
`);

            const teamsFile = path.join(projectDir, 'shared', 'teams.dlang');
            await createAndLoadDocument(teamsFile, `Team SalesTeam`);

            await services.DomainLang.imports.ManifestManager.initialize(projectDir);

            // Act
            const indexFile = path.join(projectDir, 'index.dlang');
            const docIndex = await createAndLoadDocument(indexFile, `
                import "@shared/teams.dlang"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert
            const bc = docIndex.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.name).toBe('OrderContext');
            expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam');
        });

        test('Invalid path alias should NOT provide scope', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'path-alias-invalid');
            await fs.mkdir(path.join(projectDir, 'shared'), { recursive: true });

            await fs.writeFile(path.join(projectDir, 'model.yaml'), `
model:
  name: test/path-alias-invalid
  version: 1.0.0
  entry: index.dlang

paths:
  "@": "./"
  "@shared": "./shared"
`);

            const teamsFile = path.join(projectDir, 'shared', 'teams.dlang');
            await createAndLoadDocument(teamsFile, `Team SalesTeam`);

            await services.DomainLang.imports.ManifestManager.initialize(projectDir);

            // Act
            const indexFile = path.join(projectDir, 'index.dlang');
            const docIndex = await createAndLoadDocument(indexFile, `
                import "@shareds/teams.dlang"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert
            const bc = docIndex.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.team?.[0]?.ref).toBeUndefined();
            const errors = docIndex.diagnostics?.filter(d => d.severity === 1) ?? [];
            expect(errors.some(e => e.message.includes('@shareds'))).toBe(true);
        });
    });

    describe('Transitive imports', () => {
        test('Transitive imports should NOT provide scope (only direct imports)', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'transitive-import');
            await fs.mkdir(projectDir, { recursive: true });

            const fileA = path.join(projectDir, 'teams.dlang');
            await createAndLoadDocument(fileA, `Team SalesTeam`);

            const fileB = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(fileB, `
                import "./teams.dlang"
                
                Domain Sales { vision: "Sales operations" }
            `);

            // Act
            const fileC = path.join(projectDir, 'contexts.dlang');
            const docC = await createAndLoadDocument(fileC, `
                import "./domains.dlang"
                
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert
            const bc = docC.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.domain?.ref?.name).toBe('Sales');
            expect(bc.team?.[0]?.ref).toBeUndefined();
            expect(bc.team?.[0]?.error?.message).toContain('SalesTeam');
        });
    });

    describe('Directory-first resolution scoping', () => {
        test.each([
            {
                scenario: 'Directory import via index.dlang SHOULD provide scope',
                setupDir: async (projectDir: string) => {
                    await fs.mkdir(path.join(projectDir, 'shared'), { recursive: true });
                    const indexFile = path.join(projectDir, 'shared', 'index.dlang');
                    await createAndLoadDocument(indexFile, `Team SalesTeam\nTeam ShippingTeam`);
                },
                importPath: './shared',
                refFile: `Domain Sales {}
bc OrderContext for Sales { team: SalesTeam }`,
                checkTeam: (bc: BoundedContext) => expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam'),
            },
            {
                scenario: 'File fallback in directory-first SHOULD provide scope',
                setupDir: async (projectDir: string) => {
                    const sharedFile = path.join(projectDir, 'shared.dlang');
                    await createAndLoadDocument(sharedFile, `Team SalesTeam`);
                },
                importPath: './shared',
                refFile: `Domain Sales {}
bc OrderContext for Sales { team: SalesTeam }`,
                checkTeam: (bc: BoundedContext) => expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam'),
            },
        ])('$scenario', async ({ setupDir, importPath, refFile, checkTeam }) => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, `dir-first-${Date.now()}`);
            await fs.mkdir(projectDir, { recursive: true });

            await setupDir(projectDir);

            // Act
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "${importPath}"
                ${refFile}
            `);

            // Assert
            const bc = docMain.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            checkTeam(bc);
        });

        test('Directory import prefers index.dlang over sibling file', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'dir-first-prefer-index');
            await fs.mkdir(path.join(projectDir, 'types'), { recursive: true });

            const indexFile = path.join(projectDir, 'types', 'index.dlang');
            await createAndLoadDocument(indexFile, `Team IndexTeam`);

            const siblingFile = path.join(projectDir, 'types.dlang');
            await createAndLoadDocument(siblingFile, `Team FileTeam`);

            // Act
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "./types"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: IndexTeam
                }
            `);

            // Assert
            const bc = docMain.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.team?.[0]?.ref?.name).toBe('IndexTeam');
        });

        test('FileTeam from sibling file should NOT be in scope when directory import used', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'dir-first-exclude-sibling');
            await fs.mkdir(path.join(projectDir, 'types'), { recursive: true });

            const indexFile = path.join(projectDir, 'types', 'index.dlang');
            await createAndLoadDocument(indexFile, `Domain TypesDomain {}`);

            const siblingFile = path.join(projectDir, 'types.dlang');
            await createAndLoadDocument(siblingFile, `Team FileTeam`);

            // Act
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "./types"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: FileTeam
                }
            `);

            // Assert
            const bc = docMain.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.team?.[0]?.ref).toBeUndefined();
            expect(bc.team?.[0]?.error?.message).toContain('FileTeam');
        });
    });

    describe('IndexManager getResolvedImports integration', () => {
        test.each([
            {
                scenario: 'getResolvedImports returns resolved URIs for valid imports',
                importCode: `import "./teams.dlang"`,
                targetFile: `Team SalesTeam`,
                expectedCount: 1,
            },
            {
                scenario: 'getResolvedImports returns empty for invalid imports',
                importCode: `import "./nonexistent.dlang"`,
                targetFile: null,
                expectedCount: 0,
            },
            {
                scenario: 'getResolvedImports returns empty for documents without imports',
                importCode: ``,
                targetFile: null,
                expectedCount: 0,
            },
        ])('$scenario', async ({ importCode, targetFile, expectedCount }) => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, `resolved-imports-${Date.now()}`);
            await fs.mkdir(projectDir, { recursive: true });

            if (targetFile) {
                const teamsFile = path.join(projectDir, 'teams.dlang');
                await createAndLoadDocument(teamsFile, targetFile);
            }

            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                ${importCode}
                Domain Sales {}
            `);

            // Act
            const indexManager = services.shared.workspace.IndexManager as DomainLangIndexManager;
            const mainUri = docMain.uri.toString();
            const resolvedImports = indexManager.getResolvedImports(mainUri);

            // Assert
            expect(resolvedImports.size).toBe(expectedCount);
        });
    });

    describe('Standalone files (no model.yaml)', () => {
        test('Standalone file can import relative path', async () => {
            // Arrange
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'standalone-relative');
            await fs.mkdir(projectDir, { recursive: true });

            const sharedFile = path.join(projectDir, 'shared.dlang');
            await createAndLoadDocument(sharedFile, `Team SalesTeam`);

            // Act
            const mainFile = path.join(projectDir, 'main.dlang');
            const docMain = await createAndLoadDocument(mainFile, `
                import "./shared.dlang"
                
                Domain Sales {}
                bc OrderContext for Sales {
                    team: SalesTeam
                }
            `);

            // Assert
            const bc = docMain.parseResult.value.children.find(isBoundedContext) as BoundedContext;
            expect(bc.name).toBe('OrderContext');
            expect(bc.team?.[0]?.ref?.name).toBe('SalesTeam');
        });
    });
});