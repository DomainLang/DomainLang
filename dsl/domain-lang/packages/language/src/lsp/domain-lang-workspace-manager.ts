import fs from 'node:fs/promises';
import path from 'node:path';
import { DefaultWorkspaceManager, URI, UriUtils, type FileSystemNode, type LangiumDocument, type LangiumSharedCoreServices, type WorkspaceFolder } from 'langium';
import type { CancellationToken } from 'vscode-languageserver-protocol';
import type { Connection } from 'vscode-languageserver';
import { ensureImportGraphFromDocument } from '../utils/import-utils.js';
import { findManifestsInDirectories } from '../utils/manifest-utils.js';
import type { ImportResolver } from '../services/import-resolver.js';
import type { DomainLangServices } from '../domain-lang-module.js';

/**
 * Langium WorkspaceManager override implementing manifest-centric import loading per PRS-010.
 *
 * **Three Operational Modes:**
 * 
 * **Mode A (Pure Workspace with model.yaml):**
 * - model.yaml exists at workspace root
 * - Loads entry file (default: index.dlang, or custom via model.entry)
 * - Pre-builds entry and follows import graph
 * - All imported documents built to Validated state before workspace ready
 * - LSP features have immediate access to complete reference information
 * 
 * **Mode B (Pure Standalone files):**
 * - No model.yaml anywhere in workspace
 * - No pre-loading of .dlang files during workspace scan
 * - Documents loaded on-demand when user opens them
 * - Imports resolved lazily via ImportResolver
 * - Each document built individually when opened
 * - Works with relative imports only (no path aliases or external deps)
 * 
 * **Mode C (Mixed - Standalone + Module folders):**
 * - Workspace contains both standalone .dlang files AND folders with model.yaml
 * - Each model.yaml folder treated as a module/package:
 *   - Module entry + import graph pre-loaded
 *   - Path aliases and external deps work within module
 * - Standalone files outside modules loaded on-demand
 * - Example structure:
 *   ```
 *   workspace/
 *   ├── standalone.dlang        ← Mode B (on-demand)
 *   ├── core/
 *   │   ├── model.yaml          ← Module root
 *   │   ├── index.dlang         ← Pre-loaded
 *   │   └── domains/
 *   │       └── sales.dlang     ← Pre-loaded via imports
 *   └── util.dlang              ← Mode B (on-demand)
 *   ```
 * 
 * **Performance Characteristics:**
 * - Mode A/C modules: Slower initial load, instant LSP features afterward
 * - Mode B/C standalone: Instant workspace init, per-file build on open
 * - All modes cache import resolution for subsequent access
 * 
 * **Never performs network fetches** - relies on cached dependencies/lock files.
 * Missing cache produces diagnostics upstream via ImportValidator.
 */
export class DomainLangWorkspaceManager extends DefaultWorkspaceManager {
    private readonly sharedServices: LangiumSharedCoreServices;

    /**
     * LSP connection for progress reporting (PRS-017 R7).
     * Optional because the workspace manager can run in non-LSP contexts.
     */
    private readonly connection: Connection | undefined;

    /**
     * DI-injected import resolver. Set via late-binding because
     * WorkspaceManager (shared module) is created before ImportResolver (language module).
     * Always set before any workspace loading begins via `setLanguageServices()`.
     */
    private importResolver: ImportResolver | undefined;

    constructor(services: LangiumSharedCoreServices) {
        super(services);
        this.sharedServices = services;
        // Attempt to access connection from LSP services (cast to full shared services)
        const lspServices = services as { lsp?: { Connection?: Connection } };
        this.connection = lspServices.lsp?.Connection;
    }

    /**
     * Late-binds the language-specific services after DI initialization.
     * Called from `createDomainLangServices()` after the language module is created.
     */
    setLanguageServices(services: DomainLangServices): void {
        this.importResolver = services.imports.ImportResolver;
    }

    override shouldIncludeEntry(entry: FileSystemNode): boolean {
        // Prevent auto-including .dlang files; we'll load via entry/import graph
        const name = UriUtils.basename(entry.uri);
        if (name.toLowerCase().endsWith('.dlang')) {
            return false;
        }
        return super.shouldIncludeEntry(entry);
    }

    override async initializeWorkspace(folders: WorkspaceFolder[], cancelToken?: CancellationToken): Promise<void> {
        await super.initializeWorkspace(folders, cancelToken);
    }

    protected override async loadAdditionalDocuments(folders: WorkspaceFolder[], collector: (document: LangiumDocument) => void): Promise<void> {
        const progress = await this.createProgress('DomainLang: Indexing workspace');

        // Find ALL model.yaml files in workspace (supports mixed mode)
        const manifestInfos = await this.findAllManifestsInFolders(folders);
        
        // Track directories covered by manifests to avoid loading their files as standalone
        const moduleDirectories = new Set(
            manifestInfos.map(m => path.dirname(m.manifestPath))
        );

        progress?.report(`Found ${manifestInfos.length} module(s)`);

        // Mode A or Mode C: Load each module's entry + import graph
        let moduleIdx = 0;
        for (const manifestInfo of manifestInfos) {
            moduleIdx++;
            try {
                progress?.report(`Loading module ${moduleIdx}/${manifestInfos.length}`);
                const entryUri = URI.file(manifestInfo.entryPath);
                const entryDoc = await this.langiumDocuments.getOrCreateDocument(entryUri);
                collector(entryDoc);

                // Build entry document first to ensure it's ready for import resolution
                await this.sharedServices.workspace.DocumentBuilder.build([entryDoc], {
                    validation: true
                });

                const uris = await this.loadImportGraph(entryDoc);
                const importedDocs: LangiumDocument[] = [];
                for (const uriString of uris) {
                    const uri = URI.parse(uriString);
                    const doc = await this.langiumDocuments.getOrCreateDocument(uri);
                    collector(doc);
                    importedDocs.push(doc);
                }

                // Build all imported documents in batch for performance
                if (importedDocs.length > 0) {
                    await this.sharedServices.workspace.DocumentBuilder.build(importedDocs, {
                        validation: true
                    });
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`Failed to load import graph from ${manifestInfo.manifestPath}: ${message}`);
                // Continue with other modules - partial failure is acceptable
            }
        }

        // Load standalone .dlang files in workspace root folders
        // These are files NOT covered by any module's import graph
        progress?.report('Loading standalone files');
        await this.loadStandaloneFiles(folders, moduleDirectories, collector);
        progress?.done();
    }

    /**
     * Loads standalone .dlang files from workspace folders recursively.
     * 
     * Skips:
     * - Module directories (directories with model.yaml) - loaded via import graph
     * - `.dlang/packages` directory - package cache managed by CLI
     * 
     * @param folders - Workspace folders to scan
     * @param moduleDirectories - Set of directories containing model.yaml (to skip)
     * @param collector - Document collector callback
     */
    private async loadStandaloneFiles(
        folders: WorkspaceFolder[],
        moduleDirectories: Set<string>,
        collector: (document: LangiumDocument) => void
    ): Promise<void> {
        const standaloneDocs: LangiumDocument[] = [];

        for (const folder of folders) {
            const folderPath = URI.parse(folder.uri).fsPath;
            const docs = await this.loadDlangFilesRecursively(folderPath, moduleDirectories, collector);
            standaloneDocs.push(...docs);
        }

        // Build all standalone documents in batch for performance
        if (standaloneDocs.length > 0) {
            await this.sharedServices.workspace.DocumentBuilder.build(standaloneDocs, {
                validation: true
            });
        }
    }

    /**
     * Recursively loads .dlang files from a directory.
     * Skips module directories and the .dlang/packages cache.
     */
    private async loadDlangFilesRecursively(
        dirPath: string,
        moduleDirectories: Set<string>,
        collector: (document: LangiumDocument) => void
    ): Promise<LangiumDocument[]> {
        // Skip module directories - they're loaded via import graph
        if (moduleDirectories.has(dirPath)) {
            return [];
        }

        // Skip .dlang/packages - package cache managed by CLI
        const baseName = path.basename(dirPath);
        const parentName = path.basename(path.dirname(dirPath));
        if (baseName === 'packages' && parentName === '.dlang') {
            return [];
        }
        // Also skip the .dlang directory itself (contains packages cache)
        if (baseName === '.dlang') {
            return [];
        }

        const docs: LangiumDocument[] = [];

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    // Recurse into subdirectories
                    const subDocs = await this.loadDlangFilesRecursively(entryPath, moduleDirectories, collector);
                    docs.push(...subDocs);
                } else if (this.isDlangFile(entry)) {
                    const doc = await this.tryLoadDocument(dirPath, entry.name, collector);
                    if (doc) {
                        docs.push(doc);
                    }
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Failed to read directory ${dirPath}: ${message}`);
        }

        return docs;
    }

    /**
     * Checks if a directory entry is a .dlang file.
     */
    private isDlangFile(entry: { isFile(): boolean; name: string }): boolean {
        return entry.isFile() && entry.name.toLowerCase().endsWith('.dlang');
    }

    /**
     * Attempts to load a document, returning undefined on failure.
     */
    private async tryLoadDocument(
        folderPath: string,
        fileName: string,
        collector: (document: LangiumDocument) => void
    ): Promise<LangiumDocument | undefined> {
        const filePath = path.join(folderPath, fileName);
        const uri = URI.file(filePath);
        
        // Skip if already loaded (e.g., through imports)
        if (this.langiumDocuments.hasDocument(uri)) {
            return undefined;
        }

        try {
            const doc = await this.langiumDocuments.getOrCreateDocument(uri);
            collector(doc);
            return doc;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Failed to load standalone file ${filePath}: ${message}`);
            return undefined;
        }
    }

    /**
     * Finds ALL model.yaml files in the workspace.
     * Delegates to shared manifest utilities.
     * 
     * @param folders - Workspace folders to search
     * @returns Array of manifest info (one per model.yaml found)
     */
    private async findAllManifestsInFolders(folders: WorkspaceFolder[]): Promise<Array<{ manifestPath: string; entryPath: string }>> {
        const directories = folders.map(f => URI.parse(f.uri).fsPath);
        return findManifestsInDirectories(directories);
    }

    /**
     * Recursively builds the import graph from a document.
     * Uses the DI-injected ImportResolver when available,
     * falling back to the standalone utility.
     *
     * @param document - The starting document
     * @returns Set of URIs (as strings) for all documents in the import graph
     */
    private async loadImportGraph(document: LangiumDocument): Promise<Set<string>> {
        if (!this.importResolver) {
            throw new Error('ImportResolver not initialised — ensure setLanguageServices() was called');
        }
        return ensureImportGraphFromDocument(document, this.langiumDocuments, this.importResolver);
    }

    // --- PRS-017 R7: Progress reporting ---

    /**
     * Creates an LSP work-done progress reporter.
     * Returns undefined in non-LSP contexts (no connection).
     */
    private async createProgress(title: string): Promise<{ report(message: string): void; done(): void } | undefined> {
        if (!this.connection) return undefined;

        try {
            const reporter = await this.connection.window.createWorkDoneProgress();
            reporter.begin(title);
            return {
                report: (message: string) => {
                    reporter.report(message);
                },
                done: () => {
                    reporter.done();
                }
            };
        } catch {
            // Client may not support progress — degrade gracefully
            return undefined;
        }
    }
}