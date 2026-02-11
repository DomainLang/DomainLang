import { URI, UriUtils } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { FileChangeType } from 'vscode-languageserver-protocol';
import { createDomainLangServices, getManifestDiagnosticsService, DomainLangIndexManager, registerToolHandlers } from '@domainlang/language';
import fs from 'node:fs/promises';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared, DomainLang } = createDomainLangServices({ connection, ...NodeFileSystem });

// Initialize manifest diagnostics service with LSP connection
const manifestDiagnostics = getManifestDiagnosticsService();
manifestDiagnostics.setConnection(connection);

/**
 * Validates a model.yaml file and sends diagnostics.
 */
async function validateManifestAtUri(uri: string): Promise<void> {
    try {
        const fsPath = URI.parse(uri).fsPath;
        const content = await fs.readFile(fsPath, 'utf-8');
        await manifestDiagnostics.validateAndSendDiagnostics(uri, content);
    } catch {
        // File may have been deleted or is unreadable - clear diagnostics
        await manifestDiagnostics.clearDiagnostics(uri);
    }
}

// Register file watcher handler for model.yaml and model.lock changes
// This enables LSP to detect when CLI commands (dlang install/update/add/remove) modify config files
shared.lsp.DocumentUpdateHandler.onWatchedFilesChange(async params => {
    const workspaceManager = DomainLang.imports.WorkspaceManager;
    const indexManager = shared.workspace.IndexManager as DomainLangIndexManager;
    const importResolver = DomainLang.imports.ImportResolver;
    let manifestChanged = false;
    let lockChanged = false;

    for (const change of params.changes) {
        const uri = URI.parse(change.uri);
        const filename = UriUtils.basename(uri).toLowerCase();
        
        if (filename === 'model.yaml') {
            manifestChanged = true;
            
            // Validate manifest and send diagnostics
            if (change.type === FileChangeType.Deleted) {
                await manifestDiagnostics.clearDiagnostics(change.uri);
            } else {
                await validateManifestAtUri(change.uri);
            }
        } else if (filename === 'model.lock') {
            lockChanged = true;
            
            // Refresh lock file on change/create
            if (change.type !== FileChangeType.Deleted) {
                await workspaceManager.refreshLockFile();
            }
        }
    }

    // Invalidate caches based on what changed
    if (manifestChanged || lockChanged) {
        if (manifestChanged && lockChanged) {
            workspaceManager.invalidateCache();
        } else if (manifestChanged) {
            workspaceManager.invalidateManifestCache();
        } else if (lockChanged) {
            workspaceManager.invalidateLockCache();
        }
        
        // Clear import resolution cache BEFORE rebuilding documents
        // This ensures fresh resolution with new config
        importResolver.clearCache();
        indexManager.clearImportDependencies();
        
        // Rebuild all documents to update diagnostics and cross-references
        // This is equivalent to what TypeScript does when package.json changes
        const documents = shared.workspace.LangiumDocuments.all.toArray();
        if (documents.length > 0) {
            const uris = documents.map(doc => doc.uri);
            console.warn(`Config files changed - rebuilding ${documents.length} documents`);
            await shared.workspace.DocumentBuilder.update(uris, []);
        }
    }
});

// Register custom LSP request handlers for VS Code Language Model Tools (PRS-015)
registerToolHandlers(connection, shared);

// Start the language server with the shared services
startLanguageServer(shared);
