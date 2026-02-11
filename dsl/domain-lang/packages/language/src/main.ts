import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures, FileChangeType } from 'vscode-languageserver/node.js';
import { createDomainLangServices } from './domain-lang-module.js';
import { ensureImportGraphFromEntryFile } from './utils/import-utils.js';
import { DomainLangIndexManager } from './lsp/domain-lang-index-manager.js';
import { registerToolHandlers } from './lsp/tool-handlers.js';
import { URI } from 'langium';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared, DomainLang } = createDomainLangServices({ connection, ...NodeFileSystem });

// Register custom LSP request handlers for VS Code Language Model Tools (PRS-015)
registerToolHandlers(connection, { shared, DomainLang });

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
        await handleFileChanges(params, DomainLang.imports.WorkspaceManager, shared, DomainLang);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error handling file change notification: ${message}`);
        // Continue - don't crash the server
    }
});

/** Categorized file changes */
interface CategorizedChanges {
    manifestChanged: boolean;
    lockFileChanged: boolean;
    changedDlangUris: Set<string>;
    deletedDlangUris: Set<string>;
    createdDlangUris: Set<string>;
}

/**
 * Categorizes file changes by type.
 */
function categorizeChanges(
    params: { changes: Array<{ uri: string; type: number }> },
    workspaceManager: typeof DomainLang.imports.WorkspaceManager,
    langServices: typeof DomainLang,
    indexManager: DomainLangIndexManager
): CategorizedChanges {
    const result: CategorizedChanges = {
        manifestChanged: false,
        lockFileChanged: false,
        changedDlangUris: new Set(),
        deletedDlangUris: new Set(),
        createdDlangUris: new Set()
    };

    for (const change of params.changes) {
        const uri = URI.parse(change.uri);
        const fileName = uri.path.split('/').pop() ?? '';
        const uriString = change.uri;

        if (fileName === 'model.yaml') {
            console.warn(`model.yaml changed: ${uriString}`);
            workspaceManager.invalidateManifestCache();
            langServices.imports.ImportResolver.clearCache();
            indexManager.clearImportDependencies();
            result.manifestChanged = true;
        } else if (fileName === 'model.lock') {
            console.warn(`model.lock changed: ${uriString}`);
            langServices.imports.ImportResolver.clearCache();
            indexManager.clearImportDependencies();
            result.lockFileChanged = true;
        } else if (fileName.endsWith('.dlang')) {
            if (change.type === FileChangeType.Deleted) {
                result.deletedDlangUris.add(uriString);
                console.warn(`DomainLang file deleted: ${uriString}`);
            } else if (change.type === FileChangeType.Created) {
                result.createdDlangUris.add(uriString);
                console.warn(`DomainLang file created: ${uriString}`);
            } else {
                result.changedDlangUris.add(uriString);
                console.warn(`DomainLang file changed: ${uriString}`);
            }
        }
    }

    return result;
}

/**
 * Rebuilds documents that depend on changed/deleted/created .dlang files.
 */
async function rebuildAffectedDocuments(
    changes: CategorizedChanges,
    indexManager: DomainLangIndexManager,
    sharedServices: typeof shared,
    langServices: typeof DomainLang
): Promise<void> {
    const hasChanges = changes.changedDlangUris.size > 0 || 
                       changes.deletedDlangUris.size > 0 || 
                       changes.createdDlangUris.size > 0;
    if (!hasChanges) {
        return;
    }

    // CRITICAL: Clear ImportResolver cache BEFORE rebuilding.
    // The WorkspaceCache only clears AFTER linking, but resolution happens
    // DURING linking. Without this, stale cached resolutions would be used.
    langServices.imports.ImportResolver.clearCache();

    const affectedUris = collectAffectedDocuments(changes, indexManager);

    if (affectedUris.size === 0) {
        return;
    }

    console.warn(`Rebuilding ${affectedUris.size} documents affected by file changes`);

    const langiumDocuments = sharedServices.workspace.LangiumDocuments;
    const affectedDocs: URI[] = [];

    for (const uriString of affectedUris) {
        const uri = URI.parse(uriString);
        if (langiumDocuments.hasDocument(uri)) {
            affectedDocs.push(uri);
            indexManager.markForReprocessing(uriString);
        }
    }

    const deletedUriObjects = [...changes.deletedDlangUris].map(u => URI.parse(u));
    if (affectedDocs.length > 0 || deletedUriObjects.length > 0) {
        await sharedServices.workspace.DocumentBuilder.update(affectedDocs, deletedUriObjects);
    }
}

/**
 * Collects all document URIs that should be rebuilt based on the changes.
 * 
 * Uses targeted matching to avoid expensive full rebuilds:
 * - For edits: rebuild documents that import the changed file (by resolved URI)
 * - For all changes: rebuild documents whose import specifiers match the path
 * 
 * The specifier matching handles renamed/moved/created files by comparing
 * import specifiers against path segments (filename, parent/filename, etc.).
 */
function collectAffectedDocuments(
    changes: CategorizedChanges,
    indexManager: DomainLangIndexManager
): Set<string> {
    const allChangedUris = new Set([
        ...changes.changedDlangUris, 
        ...changes.deletedDlangUris,
        ...changes.createdDlangUris
    ]);
    
    // Get documents affected by resolved URI changes (edits to imported files)
    const affectedByUri = indexManager.getAllAffectedDocuments(allChangedUris);
    
    // Get documents with import specifiers that match changed paths
    // This catches:
    // - File moves/renames: specifiers that previously resolved but now won't
    // - File creations: specifiers that previously failed but might now resolve
    // Uses fuzzy matching on path segments rather than rebuilding all imports
    const affectedBySpecifier = indexManager.getDocumentsWithPotentiallyAffectedImports(allChangedUris);
    
    return new Set([...affectedByUri, ...affectedBySpecifier]);
}

/**
 * Handles all file changes including .dlang files, model.yaml, and model.lock.
 * 
 * For .dlang files: rebuilds all documents that import the changed file.
 * For config files: invalidates caches and rebuilds workspace as needed.
 */
async function handleFileChanges(
    params: { changes: Array<{ uri: string; type: number }> },
    workspaceManager: typeof DomainLang.imports.WorkspaceManager,
    sharedServices: typeof shared,
    langServices: typeof DomainLang
): Promise<void> {
    const indexManager = sharedServices.workspace.IndexManager as DomainLangIndexManager;

    // Categorize and process changes
    const changes = categorizeChanges(params, workspaceManager, langServices, indexManager);

    // Handle lock file changes
    if (changes.lockFileChanged) {
        const lockChange = params.changes.find(c => c.uri.endsWith('model.lock'));
        if (lockChange) {
            await handleLockFileChange(lockChange, workspaceManager);
        }
    }

    // Rebuild documents affected by .dlang file changes
    await rebuildAffectedDocuments(changes, indexManager, sharedServices, langServices);

    // Handle config file changes
    if (changes.manifestChanged || changes.lockFileChanged) {
        await rebuildWorkspace(sharedServices, workspaceManager, changes.manifestChanged);
    }
}

/**
 * Handles lock file creation, change, or deletion.
 */
async function handleLockFileChange(
    change: { uri: string; type: number },
    workspaceManager: typeof DomainLang.imports.WorkspaceManager
): Promise<void> {
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
                shared.workspace.LangiumDocuments,
                DomainLang.imports.ImportResolver
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
