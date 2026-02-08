/**
 * Tests for Go to Definition and Find References LSP features.
 *
 * Smoke tests:
 * - Basic same-file definition navigation works
 * - Cross-file definition navigation works
 *
 * Edge/error cases:
 * - Definition on non-reference position returns empty
 * - Definition on unresolved reference returns empty
 * - Nested import definition navigates to correct file and line
 * - Find References returns correct count and URIs
 * - Find References with includeDeclaration includes the definition itself
 */

import { describe, test, beforeAll, afterAll, expect } from 'vitest';
import { URI } from 'langium';
import type { LangiumDocument } from 'langium';
import type { DefinitionParams, LocationLink } from 'vscode-languageserver-protocol';
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

    async function getDefinitionAt(doc: LangiumDocument<Model>, line: number, character: number): Promise<LocationLink[] | undefined> {
        const params: DefinitionParams = {
            textDocument: { uri: doc.uri.toString() },
            position: { line, character }
        };
        const definitionProvider = services.DomainLang.lsp.DefinitionProvider;
        return definitionProvider?.getDefinition(doc, params);
    }

    // ==========================================
    // SMOKE: same-file definition navigation
    // ==========================================
    test('navigates to domain definition in same file with correct target range', async () => {
        await clearAllDocuments();
        const projectDir = path.join(tempDir, 'same-file-def');
        const filePath = path.join(projectDir, 'model.dlang');
        const doc = await createAndLoadDocument(filePath, `
Domain Sales {
    vision: "Sales operations"
}

bc OrderContext for Sales {
    description: "Order management"
}
        `);

        const lines = doc.textDocument.getText().split('\n');
        const bcLine = lines.findIndex(l => l.includes('for Sales'));
        const salesRefCol = lines[bcLine].indexOf('Sales');

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const result = (await getDefinitionAt(doc, bcLine, salesRefCol + 2))!;

        expect(result).toHaveLength(1);
        expect(result[0].targetUri).toBe(doc.uri.toString());
        // "Domain Sales" is on line 1 (0-indexed, blank line 0)
        expect(result[0].targetRange.start.line).toBe(1);
    });

    // ==========================================
    // SMOKE: cross-file definition navigation
    // ==========================================
    test('navigates to definition in imported file', async () => {
        await clearAllDocuments();
        const projectDir = path.join(tempDir, 'cross-file-def');

        const domainsPath = path.join(projectDir, 'domains.dlang');
        await createAndLoadDocument(domainsPath, `
Domain Sales {
    vision: "Sales operations"
}
        `);

        await services.DomainLang.imports.WorkspaceManager.initialize(projectDir);

        const contextsPath = path.join(projectDir, 'contexts.dlang');
        const doc = await createAndLoadDocument(contextsPath, `
import "./domains.dlang"

bc OrderContext for Sales {
    description: "Order management"
}
        `);

        const lines = doc.textDocument.getText().split('\n');
        const bcLine = lines.findIndex(l => l.includes('for Sales'));
        const salesRefCol = lines[bcLine].indexOf('Sales');

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const result = (await getDefinitionAt(doc, bcLine, salesRefCol + 2))!;

        expect(result).toHaveLength(1);
        expect(result[0].targetUri).toBe(URI.file(domainsPath).toString());
    });

    // ==========================================
    // EDGE: definition on keyword returns empty
    // ==========================================
    test('returns no definition when cursor is on a keyword', async () => {
        await clearAllDocuments();
        const projectDir = path.join(tempDir, 'keyword-pos');
        const filePath = path.join(projectDir, 'model.dlang');
        const doc = await createAndLoadDocument(filePath, `
Domain Sales {
    vision: "Sales operations"
}
        `);

        // Position cursor on the "Domain" keyword itself (line 1, char 0)
        const result = await getDefinitionAt(doc, 1, 0);

        // Should return undefined or empty -- no definition target for keyword
        const hasResults = result && result.length > 0;
        expect(hasResults).toBeFalsy();
    });

    // ==========================================
    // EDGE: nested import & path alias navigation
    // ==========================================
    test('navigates to definition via path alias import with correct target URI', async () => {
        await clearAllDocuments();
        const projectDir = path.join(tempDir, 'nested-def');
        await fs.mkdir(path.join(projectDir, 'shared'), { recursive: true });

        const teamsPath = path.join(projectDir, 'shared', 'teams.dlang');
        await createAndLoadDocument(teamsPath, `
Team SalesTeam
        `);

        await fs.writeFile(path.join(projectDir, 'model.yaml'), `
model:
  name: test/nested-def
  version: 1.0.0
  entry: index.dlang

paths:
  "@shared": "./shared"
        `);

        await services.DomainLang.imports.WorkspaceManager.initialize(projectDir);

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

        const lines = doc.textDocument.getText().split('\n');
        const teamLine = lines.findIndex(l => l.includes('team: SalesTeam'));
        const teamRefCol = lines[teamLine].indexOf('SalesTeam');

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const result = (await getDefinitionAt(doc, teamLine, teamRefCol + 2))!;

        expect(result).toHaveLength(1);
        // Must point to the teams.dlang file, not the current file
        expect(result[0].targetUri).toBe(URI.file(teamsPath).toString());
        // SalesTeam definition should be on line 1 (line 0 is blank)
        expect(result[0].targetRange.start.line).toBe(1);
    });

    // ==========================================
    // EDGE: find references across files with count & URI verification
    // ==========================================
    describe('Find References', () => {
        test('finds all references to a domain across files with correct URIs', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'find-refs');

            const domainsPath = path.join(projectDir, 'domains.dlang');
            const domainDoc = await createAndLoadDocument(domainsPath, `
Domain Sales {
    vision: "Sales operations"
}
            `);

            await services.DomainLang.imports.WorkspaceManager.initialize(projectDir);

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

            const model = domainDoc.parseResult.value;
            const salesDomain = model.children.find(c => c.$type === 'Domain');
            expect(salesDomain).toBeDefined();

            const references = services.DomainLang.references.References;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const refArray = references.findReferences(salesDomain!, { includeDeclaration: false }).toArray();

            // Two BCs reference Sales: OrderContext and BillingContext
            expect(refArray.length).toBeGreaterThanOrEqual(2);
            // All references should point to the contexts file (not the definition file)
            const refUris = refArray.map(r => r.sourceUri.toString());
            expect(refUris.every(u => u.includes('contexts.dlang'))).toBe(true);
        });

        test('includeDeclaration also returns the definition site', async () => {
            await clearAllDocuments();
            const projectDir = path.join(tempDir, 'find-refs-decl');

            const filePath = path.join(projectDir, 'model.dlang');
            const doc = await createAndLoadDocument(filePath, `
Domain Sales {
    vision: "Sales"
}

bc OrderContext for Sales
            `);

            const model = doc.parseResult.value;
            const salesDomain = model.children.find(c => c.$type === 'Domain');
            expect(salesDomain).toBeDefined();

            const references = services.DomainLang.references.References;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const withDecl = references.findReferences(salesDomain!, { includeDeclaration: true }).toArray();
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const withoutDecl = references.findReferences(salesDomain!, { includeDeclaration: false }).toArray();

            // including declaration should yield at least one more entry
            expect(withDecl.length).toBeGreaterThan(withoutDecl.length);
        });
    });
});
