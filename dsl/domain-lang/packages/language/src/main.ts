import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures, FileChangeType } from 'vscode-languageserver/node.js';
import { createDomainLangServices } from './domain-lang-module.js';
import { ensureImportGraphFromEntryFile } from './utils/import-utils.js';
import { DomainLangIndexManager } from './lsp/domain-lang-index-manager.js';
import { URI } from 'langium';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared, DomainLang } = createDomainLangServices({ connection, ...NodeFileSystem });

// Initialize workspace manager when language server initializes
// Uses Langium's LanguageServer.onInitialize hook (not raw connection handler)
// This integrates properly with Langium's initialization flow
shared.lsp.LanguageServer.onInitialize((params) => {
    // Use workspaceFolders (preferred) over deprecated rootUri
    const folders = params.workspaceFolders;
    const workspaceRoot = folders?.[0]?.uri
        ? URI.parse(folders[0].uri).fsPath
        : undefined;
    
    if (workspaceRoot) {
        // Initialize workspace manager synchronously (just sets root path)
        // Heavy work happens in initializeWorkspace() called by Langium later
        const workspaceManager = DomainLang.imports.WorkspaceManager;
        workspaceManager.initialize(workspaceRoot).catch(error => {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Failed to initialize workspace: ${message}`);
            // Continue without workspace - local imports will still work
        });
        console.warn(`DomainLang workspace root: ${workspaceRoot}`);
    }
});

// Handle file changes for model.yaml and model.lock (PRS-010)
// Uses Langium's built-in file watcher which already watches **/* in workspace
// This invalidates caches when config files change externally
shared.lsp.DocumentUpdateHandler?.onWatchedFilesChange(async (params) => {
    try {
        await handleConfigFileChanges(params, DomainLang.imports.WorkspaceManager, shared);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error handling file change notification: ${message}`);
        // Continue - don't crash the server
    }
});

/**
 * Handles changes to model.yaml and model.lock files.
 * Invalidates caches and rebuilds workspace as needed.
 * Uses incremental updates: only rebuilds if dependencies actually changed.
 */
async function handleConfigFileChanges(
    params: { changes: Array<{ uri: string; type: number }> },
    workspaceManager: typeof DomainLang.imports.WorkspaceManager,
    sharedServices: typeof shared
): Promise<void> {
    let manifestChanged = false;
    let lockFileChanged = false;

    for (const change of params.changes) {
        const uri = URI.parse(change.uri);
        const fileName = uri.path.split('/').pop() ?? '';

        if (fileName === 'model.yaml') {
            console.warn(`model.yaml changed: ${change.uri}`);
            workspaceManager.invalidateManifestCache();
            DomainLang.imports.ImportResolver.clearCache();
            // Clear IndexManager import dependencies - resolved paths may have changed
            const indexManager = sharedServices.workspace.IndexManager as DomainLangIndexManager;
            indexManager.clearImportDependencies();
            manifestChanged = true;
        } else if (fileName === 'model.lock') {
            await handleLockFileChange(change, workspaceManager);
            DomainLang.imports.ImportResolver.clearCache();
            lockFileChanged = true;
        }
    }

    // Only rebuild if dependencies changed, not just any manifest change
    if (manifestChanged || lockFileChanged) {
        await rebuildWorkspace(sharedServices, workspaceManager, manifestChanged);
    }
}

/**
 * Handles lock file creation, change, or deletion.
 */
async function handleLockFileChange(
    change: { uri: string; type: number },
    workspaceManager: typeof DomainLang.imports.WorkspaceManager
): Promise<void> {
    console.warn(`model.lock changed: ${change.uri}`);
    
    if (change.type === FileChangeType.Changed || change.type === FileChangeType.Created) {
        await workspaceManager.refreshLockFile();
    } else if (change.type === FileChangeType.Deleted) {
        workspaceManager.invalidateLockCache();
    }
}

/**
 * Rebuilds the workspace after config file changes.
 * Uses incremental strategy: only full rebuild if dependencies changed.
 * 
 * @param sharedServices - Shared Langium services
 * @param workspaceManager - Workspace manager for manifest access
 * @param manifestChanged - Whether model.yaml changed (vs just model.lock)
 */
async function rebuildWorkspace(
    sharedServices: typeof shared,
    workspaceManager: typeof DomainLang.imports.WorkspaceManager,
    manifestChanged: boolean
): Promise<void> {
    try {
        // If only lock file changed, caches are already invalidated - no rebuild needed
        // Lock file changes mean resolved versions changed, but import resolver cache is cleared
        // Documents will re-resolve imports on next access
        if (!manifestChanged) {
            console.warn('Lock file changed - caches invalidated, no rebuild needed');
            return;
        }

        // For manifest changes, check if dependencies section actually changed
        // If only metadata changed (name, version, etc.), no rebuild needed
        const manifest = await workspaceManager.getManifest();
        const hasDependencies = manifest?.dependencies && Object.keys(manifest.dependencies).length > 0;
        
        if (!hasDependencies) {
            console.warn('Manifest changed but has no dependencies - skipping rebuild');
            return;
        }

        // Dependencies exist and manifest changed - do full rebuild
        const documents = sharedServices.workspace.LangiumDocuments.all.toArray();
        const uris = documents.map(doc => doc.uri);
        await sharedServices.workspace.DocumentBuilder.update([], uris);
        console.warn(`Workspace rebuilt: ${documents.length} documents revalidated`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to rebuild workspace: ${message}`);
    }
}

// Optionally start from a single entry file and follow imports.
// Configure via env DOMAINLANG_ENTRY (absolute or workspace-relative path)
const entryFile = process.env.DOMAINLANG_ENTRY;
if (entryFile) {
    let currentGraph = new Set<string>();

    /**
     * Reloads the import graph from the entry file.
     * Handles errors gracefully and notifies the LSP client.
     */
    const reloadFromEntry = async (): Promise<void> => {
        try {
            currentGraph = await ensureImportGraphFromEntryFile(
                entryFile, 
                shared.workspace.LangiumDocuments
            );
            console.warn(`Successfully loaded import graph from ${entryFile}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Failed to preload import graph from ${entryFile}: ${message}`);
            // Notify LSP client of the error
            connection.console.error(
                `DomainLang: Could not load entry file ${entryFile}. Error: ${message}`
            );
        }
    };

    // Initial load from entry file, then start the server
    await reloadFromEntry();
    startLanguageServer(shared);

    // Any change within the loaded graph should trigger a reload from the entry
    shared.workspace.TextDocuments.onDidChangeContent(async (event) => {
        const changed = event.document.uri;
        if (currentGraph.has(changed)) {
            await reloadFromEntry();
        }
    });

    // If the entry file itself is opened/changed, also reload
    shared.workspace.TextDocuments.onDidOpen(async (event) => {
        if (URI.parse(event.document.uri).fsPath === URI.file(entryFile).fsPath) {
            await reloadFromEntry();
        }
    });
} else {
    // No entry file configured: start normally
    startLanguageServer(shared);
}
