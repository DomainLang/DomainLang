import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { URI, type WorkspaceFolder } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createDomainLangServices } from '../../src/domain-lang-module.js';
import { DomainLangWorkspaceManager } from '../../src/lsp/domain-lang-workspace-manager.js';

/**
 * Tests for DomainLangWorkspaceManager covering:
 * - Mode A: Pure workspace with model.yaml (entry + import graph loading)
 * - Mode B: Pure standalone files (on-demand loading) 
 * - Mode C: Mixed mode (modules + standalone files)
 * - Edge cases: .dlang/cache skipping, error handling
 */
describe('DomainLangWorkspaceManager', () => {
    let tempDir: string;
    let services: ReturnType<typeof createDomainLangServices>;
    let workspaceManager: DomainLangWorkspaceManager;

    beforeAll(() => {
        services = createDomainLangServices(NodeFileSystem);
        workspaceManager = services.shared.workspace.WorkspaceManager as DomainLangWorkspaceManager;
    });

    afterEach(async () => {
        // Clean up documents between tests
        const docs = services.shared.workspace.LangiumDocuments.all.toArray();
        for (const doc of docs) {
            services.shared.workspace.LangiumDocuments.deleteDocument(doc.uri);
        }

        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    describe('Mode A: Workspace with model.yaml', () => {
        test('loads entry file and follows import graph', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-a-'));

            // Create project structure
            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'entry: index.dlang\n'
            );
            await fs.writeFile(
                path.join(tempDir, 'index.dlang'),
                'import "./domains.dlang"\nDomain Sales { vision: "Test" }'
            );            
            await fs.writeFile(
                path.join(tempDir, 'domains.dlang'),
                'Domain Marketing { vision: "Test" }'
            );

            const folders: WorkspaceFolder[] = [{ name: 'test', uri: URI.file(tempDir).toString() }];
            await workspaceManager.initializeWorkspace(folders);

            // Should have loaded entry + imported file
            const docs = services.shared.workspace.LangiumDocuments.all.toArray();
            const dlangDocs = docs.filter(d => d.uri.fsPath.endsWith('.dlang'));
            
            expect(dlangDocs.length).toBeGreaterThanOrEqual(2);
            const paths = dlangDocs.map(d => path.basename(d.uri.fsPath));
            expect(paths).toContain('index.dlang');
            expect(paths).toContain('domains.dlang');
        });

        test.skip('uses custom entry from model.yaml', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-a2-'));

            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'entry: custom-entry.dlang\n'
            );
            await fs.writeFile(
                path.join(tempDir, 'custom-entry.dlang'),
                'Domain Custom { vision: "Test" }'
            );

            const folders: WorkspaceFolder[] = [{ name: 'test', uri: URI.file(tempDir).toString() }];
            await workspaceManager.initializeWorkspace(folders);

            const docs = services.shared.workspace.LangiumDocuments.all.toArray();
            const paths = docs.map(d => path.basename(d.uri.fsPath));
            
            expect(paths).toContain('custom-entry.dlang');
            // index.dlang wasn't created, so shouldn't be loaded
        });

        test('handles missing entry file gracefully', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-a3-'));

            await fs.writeFile(
                path.join(tempDir, 'model.yaml'),
                'entry: missing.dlang\n'
            );

            const folders: WorkspaceFolder[] = [{ name: 'test', uri: URI.file(tempDir).toString() }];
            
            // Should not throw - continues with other modules
            await expect(workspaceManager.initializeWorkspace(folders)).resolves.toBeUndefined();
        });
    });

    describe('Mode B: Standalone files', () => {
        test('loads .dlang files recursively when no model.yaml exists', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-b-'));

            await fs.writeFile(
                path.join(tempDir, 'standalone.dlang'),
                'Domain Standalone { vision: "Test" }'
            );
            
            await fs.mkdir(path.join(tempDir, 'subdir'));
            await fs.writeFile(
                path.join(tempDir, 'subdir', 'nested.dlang'),
                'Domain Nested { vision: "Test" }'
            );

            const folders: WorkspaceFolder[] = [{ name: 'test', uri: URI.file(tempDir).toString() }];
            await workspaceManager.initializeWorkspace(folders);

            const docs = services.shared.workspace.LangiumDocuments.all.toArray();
            const paths = docs.map(d => path.basename(d.uri.fsPath));
            
            expect(paths).toContain('standalone.dlang');
            expect(paths).toContain('nested.dlang');
        });

        test('skips .dlang/cache directory', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-b2-'));

            // Create .dlang/cache structure (where packages are cached)
            const cacheDir = path.join(tempDir, '.dlang', 'cache', 'owner', 'repo', 'commit');
            await fs.mkdir(cacheDir, { recursive: true });
            await fs.writeFile(
                path.join(cacheDir, 'cached-package.dlang'),
                'Domain Cached { vision: "Should not load" }'
            );

            await fs.writeFile(
                path.join(tempDir, 'standalone.dlang'),
                'Domain Standalone { vision: "Should load" }'
            );

            const folders: WorkspaceFolder[] = [{ name: 'test', uri: URI.file(tempDir).toString() }];
            await workspaceManager.initializeWorkspace(folders);

            const docs = services.shared.workspace.LangiumDocuments.all.toArray();
            const paths = docs.map(d => d.uri.fsPath);
            
            expect(paths.some(p => p.includes('.dlang/cache'))).toBe(false);
            expect(paths.some(p => p.endsWith('standalone.dlang'))).toBe(true);
        });
    });

    describe('Mode C: Mixed mode', () => {
        test('loads modules and standalone files', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-c-'));

            // Module with model.yaml
            const moduleDir = path.join(tempDir, 'module');
            await fs.mkdir(moduleDir);
            await fs.writeFile(
                path.join(moduleDir, 'model.yaml'),
                'entry: index.dlang\n'
            );
            await fs.writeFile(
                path.join(moduleDir, 'index.dlang'),
                'Domain Module { vision: "Module" }'
            );

            // Standalone file outside module
            await fs.writeFile(
                path.join(tempDir, 'standalone.dlang'),
                'Domain Standalone { vision: "Standalone" }'
            );

            const folders: WorkspaceFolder[] = [{ name: 'test', uri: URI.file(tempDir).toString() }];
            await workspaceManager.initializeWorkspace(folders);

            const docs = services.shared.workspace.LangiumDocuments.all.toArray();
            const basenames = docs.map(d => path.basename(d.uri.fsPath));
            
            expect(basenames).toContain('index.dlang'); // Module entry
            expect(basenames).toContain('standalone.dlang'); // Standalone
        });

        test.skip('does not load standalone files inside module directories', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-c2-'));

            // Module with model.yaml and entry + unimported file
            const moduleDir = path.join(tempDir, 'module');
            await fs.mkdir(moduleDir);
            await fs.writeFile(
                path.join(moduleDir, 'model.yaml'),
                'entry: index.dlang\n'
            );
            await fs.writeFile(
                path.join(moduleDir, 'index.dlang'),
                'Domain Module { vision: "Module" }'
            );
            await fs.writeFile(
                path.join(moduleDir, 'unimported.dlang'),
                'Domain Unimported { vision: "Should NOT load" }'
            );

            const folders: WorkspaceFolder[] = [{ name: 'test', uri: URI.file(tempDir).toString() }];
            await workspaceManager.initializeWorkspace(folders);

            const docs = services.shared.workspace.LangiumDocuments.all.toArray();
            const paths = docs.map(d => d.uri.fsPath);
            
            // Module entry should load
            expect(paths.some(p => p.endsWith('index.dlang'))).toBe(true);
            // Unimported file in module dir should NOT load (module boundary)
            expect(paths.some(p => p.endsWith('unimported.dlang'))).toBe(false);
        });
    });

    describe('Edge cases', () => {
        test('handles read errors gracefully', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-edge-'));

            await fs.writeFile(
                path.join(tempDir, 'valid.dlang'),
                'Domain Valid { vision: "Test" }'
            );

            const folders: WorkspaceFolder[] = [
                { name: 'test', uri: URI.file(tempDir).toString() },
                { name: 'invalid', uri: URI.file('/nonexistent/path').toString() }
            ];
            
            // Should not throw - logs warning and continues
            await expect(workspaceManager.initializeWorkspace(folders)).resolves.toBeUndefined();
            
            // Should have loaded the valid file
            const docs = services.shared.workspace.LangiumDocuments.all.toArray();
            expect(docs.some(d => d.uri.fsPath.endsWith('valid.dlang'))).toBe(true);
        });

        test('does not load already-loaded documents', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-edge2-'));

            const filePath = path.join(tempDir, 'duplicate.dlang');
            await fs.writeFile(filePath, 'Domain Duplicate { vision: "Test" }');

            // Pre-load the document
            const uri = URI.file(filePath);
            await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);

            const folders: WorkspaceFolder[] = [{ name: 'test', uri: URI.file(tempDir).toString() }];
            await workspaceManager.initializeWorkspace(folders);

            // Should not create duplicate documents
            const docs = services.shared.workspace.LangiumDocuments.all.toArray();
            const duplicates = docs.filter(d => d.uri.toString() === uri.toString());
            expect(duplicates).toHaveLength(1);
        });

        test('skips non-.dlang files', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-edge3-'));

            await fs.writeFile(path.join(tempDir, 'file.txt'), 'Text file');
            await fs.writeFile(path.join(tempDir, 'file.md'), '# Markdown');
            await fs.writeFile(path.join(tempDir, 'file.dlang'), 'Domain Test { vision: "Test" }');

            const folders: WorkspaceFolder[] = [{ name: 'test', uri: URI.file(tempDir).toString() }];
            await workspaceManager.initializeWorkspace(folders);

            const docs = services.shared.workspace.LangiumDocuments.all.toArray();
            const paths = docs.map(d => path.basename(d.uri.fsPath));
            
            expect(paths).not.toContain('file.txt');
            expect(paths).not.toContain('file.md');
            expect(paths).toContain('file.dlang');
        });

        test('handles multiple model.yaml files in workspace', async () => {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-edge4-'));

            // Module 1
            const module1Dir = path.join(tempDir, 'module1');
            await fs.mkdir(module1Dir);
            await fs.writeFile(path.join(module1Dir, 'model.yaml'), 'entry: index.dlang\n');
            await fs.writeFile(path.join(module1Dir, 'index.dlang'), 'Domain M1 { vision: "1" }');

            // Module 2
            const module2Dir = path.join(tempDir, 'module2');
            await fs.mkdir(module2Dir);
            await fs.writeFile(path.join(module2Dir, 'model.yaml'), 'entry: index.dlang\n');
            await fs.writeFile(path.join(module2Dir, 'index.dlang'), 'Domain M2 { vision: "2" }');

            const folders: WorkspaceFolder[] = [{ name: 'test', uri: URI.file(tempDir).toString() }];
            await workspaceManager.initializeWorkspace(folders);

            const docs = services.shared.workspace.LangiumDocuments.all.toArray();
            const dlangDocs = docs.filter(d => d.uri.fsPath.endsWith('.dlang'));
            
            // Should load both module entry files
            expect(dlangDocs.length).toBeGreaterThanOrEqual(2);
        });
    });
});
