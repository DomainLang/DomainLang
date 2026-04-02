import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { createDomainLangServices } from './domain-lang-module.js';
import { ensureImportGraphFromEntryFile } from './utils/import-utils.js';
import { registerDomainLangRefresh } from './lsp/domain-lang-refresh.js';
import { registerToolHandlers } from './lsp/tool-handlers.js';
import { URI } from 'langium';
import { setLspRuntimeSettings } from './services/lsp-runtime-settings.js';
import path from 'node:path';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared, DomainLang } = createDomainLangServices({ connection, ...NodeFileSystem });

// Register custom LSP request handlers for VS Code Language Model Tools (PRS-015)
registerToolHandlers(connection, shared);

// Flag set to false in onInitialize if DOMAINLANG_ENTRY escapes the workspace root.
let entryFileAllowed = true;

shared.lsp.LanguageServer.onInitialize((params) => {
    applyLspSettings(params.initializationOptions);

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
            connection.console.warn(`Failed to initialize workspace: ${message}`);
            // Continue without workspace - local imports will still work
        });
        connection.console.info(`DomainLang workspace root: ${workspaceRoot}`);

        // R-003: Validate DOMAINLANG_ENTRY is within the workspace root to prevent
        // loading arbitrary files via a crafted environment variable.
        const envEntry = process.env.DOMAINLANG_ENTRY;
        if (envEntry) {
            const resolvedEntry = path.resolve(envEntry);
            const resolvedRoot = path.resolve(workspaceRoot);
            const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
            if (!resolvedEntry.startsWith(normalizedRoot) && resolvedEntry !== resolvedRoot) {
                connection.console.error(
                    `DomainLang: DOMAINLANG_ENTRY (${envEntry}) escapes workspace root. Disabling entry-file reloads.`
                );
                entryFileAllowed = false;
            }
        }
    }
});

connection.onDidChangeConfiguration((params) => {
    applyLspSettings(params.settings);
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
        if (!entryFileAllowed) return;
        try {
            currentGraph = await ensureImportGraphFromEntryFile(
                entryFile, 
                shared.workspace.LangiumDocuments,
                DomainLang.imports.ImportResolver
            );
            connection.console.info(`Successfully loaded import graph from ${entryFile}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            connection.console.error(
                `DomainLang: Could not load entry file ${entryFile}. Error: ${message}`
            );
        }
    };

    // B-020: Debounced reload to avoid concurrent reloads on rapid changes
    let reloadDebounceTimer: ReturnType<typeof setTimeout> | undefined;
    function scheduleReload(): void {
        if (reloadDebounceTimer !== undefined) clearTimeout(reloadDebounceTimer);
        reloadDebounceTimer = setTimeout(() => {
            reloadDebounceTimer = undefined;
            reloadFromEntry().catch(e => {
                const message = e instanceof Error ? e.message : String(e);
                connection.console.error(`DomainLang: Scheduled reload failed: ${message}`);
            });
        }, 300);
    }

    // R-013: Wrap initial load in try/catch for graceful degradation
    try {
        await reloadFromEntry();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        connection.console.error(`DomainLang: Initial entry file load failed: ${message}`);
    }
    startLanguageServer(shared);

    // Any change within the loaded graph should trigger a reload from the entry
    shared.workspace.TextDocuments.onDidChangeContent((event) => {
        const changed = event.document.uri;
        if (currentGraph.has(changed)) {
            scheduleReload();
        }
    });

    // If the entry file itself is opened/changed, also reload
    shared.workspace.TextDocuments.onDidOpen((event) => {
        if (URI.parse(event.document.uri).fsPath === URI.file(entryFile).fsPath) {
            scheduleReload();
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
