import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { createDomainLangServices } from './domain-lang-module.js';
import { ensureImportGraphFromEntryFile } from './utils/import-utils.js';
import { registerDomainLangRefresh } from './lsp/domain-lang-refresh.js';
import { registerToolHandlers } from './lsp/tool-handlers.js';
import { URI } from 'langium';
import { setLspRuntimeSettings } from './services/lsp-runtime-settings.js';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared, DomainLang } = createDomainLangServices({ connection, ...NodeFileSystem });

// Register custom LSP request handlers for VS Code Language Model Tools (PRS-015)
registerToolHandlers(connection, shared);

shared.lsp.LanguageServer.onInitialize((params) => {
    applyLspSettings(params.initializationOptions);
});

connection.onDidChangeConfiguration((params) => {
    applyLspSettings(params.settings);
});

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
        const workspaceManager = DomainLang.imports.ManifestManager;
        workspaceManager.initialize(workspaceRoot).catch(error => {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Failed to initialize workspace: ${message}`);
            // Continue without workspace - local imports will still work
        });
        console.warn(`DomainLang workspace root: ${workspaceRoot}`);
    }
});

registerDomainLangRefresh(shared, DomainLang);

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

function applyLspSettings(settings: unknown): void {
    const lsp = extractLspSettings(settings);
    setLspRuntimeSettings({
        traceImports: lsp.traceImports,
        infoLogs: lsp.infoLogs,
    });
}

function extractLspSettings(source: unknown): { traceImports: boolean; infoLogs: boolean } {
    const root = isRecord(source) ? source : {};
    const domainlang = isRecord(root.domainlang) ? root.domainlang : root;
    const lsp = isRecord(domainlang.lsp) ? domainlang.lsp : {};

    return {
        traceImports: typeof lsp.traceImports === 'boolean' ? lsp.traceImports : false,
        infoLogs: typeof lsp.infoLogs === 'boolean' ? lsp.infoLogs : false,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
