import { DefaultWorkspaceManager, URI, UriUtils, type FileSystemNode, type LangiumDocument, type LangiumSharedCoreServices, type WorkspaceFolder } from 'langium';
import type { CancellationToken } from 'vscode-languageserver-protocol';
import { ensureImportGraphFromDocument } from '../utils/import-utils.js';
import { findManifestsInDirectories } from '../utils/manifest-utils.js';

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

    constructor(services: LangiumSharedCoreServices) {
        super(services);
        this.sharedServices = services;
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
        // Find ALL model.yaml files in workspace (supports mixed mode)
        const manifestInfos = await this.findAllManifestsInFolders(folders);
        
        if (manifestInfos.length === 0) {
            return; // Pure Mode B: no manifests, all files loaded on-demand
        }

        // Mode A or Mode C: Load each module's entry + import graph
        for (const manifestInfo of manifestInfos) {
            try {
                const entryUri = URI.file(manifestInfo.entryPath);
                const entryDoc = await this.langiumDocuments.getOrCreateDocument(entryUri);
                collector(entryDoc);

                // Build entry document first to ensure it's ready for import resolution
                await this.sharedServices.workspace.DocumentBuilder.build([entryDoc], {
                    validation: true
                });

                const uris = await ensureImportGraphFromDocument(entryDoc, this.langiumDocuments);
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
}