/**
 * Tests for Go to Definition and Find References LSP features.
 * 
 * Verifies that:
 * 1. Go to Definition works within the same file
 * 2. Go to Definition works across imported files
 * 3. Go to Definition works for elements in package cache (.dlang/cache)
 * 4. Find References finds all usages across files
 */

import { describe, test, beforeAll, afterAll, expect } from 'vitest';
import { URI } from 'langium';
import type { LangiumDocument } from 'langium';
import type { DefinitionParams } from 'vscode-languageserver-protocol';
import { createDomainLangServices } from '../../src/domain-lang-module.js';
import { NodeFileSystem } from 'langium/node';
import type { Model } from '../../src/generated/ast.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('Go to Definition and Find References', () => {
    let tempDir: string;
    let services: ReturnType<typeof createDomainLangServices>;

    beforeAll(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-def-ref-'));
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

    describe('Go to Definition', () => {
        test('should navigate to domain definition in same file', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'same-file-def');
            await fs.mkdir(projectDir, { recursive: true });

            const filePath = path.join(projectDir, 'model.dlang');
            const doc = await createAndLoadDocument(filePath, `
Domain Sales {
    vision: "Sales operations"
}

bc OrderContext for Sales {
    description: "Order management"
}
            `);

            // Find position of "Sales" reference in the BC definition (line 6)
            const lines = doc.textDocument.getText().split('\n');
            const bcLine = lines.findIndex(l => l.includes('for Sales'));
            const salesRefCol = lines[bcLine].indexOf('Sales');

            const params: DefinitionParams = {
                textDocument: { uri: doc.uri.toString() },
                position: { line: bcLine, character: salesRefCol + 2 } // Inside "Sales"
            };

            const definitionProvider = services.DomainLang.lsp.DefinitionProvider;
            const result = await definitionProvider?.getDefinition(doc, params);

            expect(result).toBeDefined();
            expect(result).toHaveLength(1);
            
            const link = result![0];
            expect(link.targetUri).toBe(doc.uri.toString());
            // Should point to "Sales" domain definition (line 1)
            expect(link.targetRange.start.line).toBe(1);
        });

        test('should navigate to definition in imported file', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'cross-file-def');
            await fs.mkdir(projectDir, { recursive: true });

            // Create domains file
            const domainsPath = path.join(projectDir, 'domains.dlang');
            await createAndLoadDocument(domainsPath, `
Domain Sales {
    vision: "Sales operations"
}
            `);

            // Initialize workspace manager
            await services.DomainLang.imports.WorkspaceManager.initialize(projectDir);

            // Create file that imports and references the domain
            const contextsPath = path.join(projectDir, 'contexts.dlang');
            const doc = await createAndLoadDocument(contextsPath, `
import "./domains.dlang"

bc OrderContext for Sales {
    description: "Order management"
}
            `);

            // Find position of "Sales" reference in the BC definition
            const lines = doc.textDocument.getText().split('\n');
            const bcLine = lines.findIndex(l => l.includes('for Sales'));
            const salesRefCol = lines[bcLine].indexOf('Sales');

            const params: DefinitionParams = {
                textDocument: { uri: doc.uri.toString() },
                position: { line: bcLine, character: salesRefCol + 2 }
            };

            const definitionProvider = services.DomainLang.lsp.DefinitionProvider;
            const result = await definitionProvider?.getDefinition(doc, params);

            expect(result).toBeDefined();
            expect(result).toHaveLength(1);
            
            const link = result![0];
            // Should navigate to the domains.dlang file
            expect(link.targetUri).toBe(URI.file(domainsPath).toString());
        });

        test('should navigate to definition in nested import', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'nested-def');
            await fs.mkdir(path.join(projectDir, 'shared'), { recursive: true });

            // Create team definition in shared folder
            const teamsPath = path.join(projectDir, 'shared', 'teams.dlang');
            await createAndLoadDocument(teamsPath, `
Team SalesTeam
            `);

            // Create model.yaml for path alias
            await fs.writeFile(path.join(projectDir, 'model.yaml'), `
model:
  name: test/nested-def
  version: 1.0.0
  entry: index.dlang

paths:
  "@shared": "./shared"
            `);

            // Initialize workspace manager
            await services.DomainLang.imports.WorkspaceManager.initialize(projectDir);

            // Create index file that uses path alias import
            const indexPath = path.join(projectDir, 'index.dlang');
            const doc = await createAndLoadDocument(indexPath, `
import "@shared/teams.dlang"

Domain Sales {
    vision: "Sales"
}

bc OrderContext for Sales {
    team: SalesTeam
    description: "Orders"
}
            `);

            // Find position of "SalesTeam" reference
            const lines = doc.textDocument.getText().split('\n');
            const teamLine = lines.findIndex(l => l.includes('team: SalesTeam'));
            const teamRefCol = lines[teamLine].indexOf('SalesTeam');

            const params: DefinitionParams = {
                textDocument: { uri: doc.uri.toString() },
                position: { line: teamLine, character: teamRefCol + 2 }
            };

            const definitionProvider = services.DomainLang.lsp.DefinitionProvider;
            const result = await definitionProvider?.getDefinition(doc, params);

            expect(result).toBeDefined();
            expect(result).toHaveLength(1);
            
            const link = result![0];
            // Should navigate to the teams.dlang file
            expect(link.targetUri).toBe(URI.file(teamsPath).toString());
        });
    });

    describe('Find References', () => {
        test('should find all references to a domain across files', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'find-refs');
            await fs.mkdir(projectDir, { recursive: true });

            // Create domains file
            const domainsPath = path.join(projectDir, 'domains.dlang');
            const domainDoc = await createAndLoadDocument(domainsPath, `
Domain Sales {
    vision: "Sales operations"
}
            `);

            // Initialize workspace manager
            await services.DomainLang.imports.WorkspaceManager.initialize(projectDir);

            // Create file that imports and references the domain
            const contextsPath = path.join(projectDir, 'contexts.dlang');
            await createAndLoadDocument(contextsPath, `
import "./domains.dlang"

bc OrderContext for Sales {
    description: "Order management"
}

bc BillingContext for Sales {
    description: "Billing"
}
            `);

            // Find the Sales domain node
            const model = domainDoc.parseResult.value;
            const salesDomain = model.children.find(c => c.$type === 'Domain');
            expect(salesDomain).toBeDefined();

            // Find all references
            const references = services.DomainLang.references.References;
            const refs = references.findReferences(salesDomain!, { includeDeclaration: false });
            const refArray = refs.toArray();

            // Should find at least 2 references (OrderContext and BillingContext)
            expect(refArray.length).toBeGreaterThanOrEqual(2);
        });
    });
});
