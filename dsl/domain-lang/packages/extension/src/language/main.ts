import { URI, UriUtils } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import {
    createDomainLangServices,
    getManifestDiagnosticsService,
    registerDomainLangRefresh,
    registerToolHandlers,
    setLspRuntimeSettings,
} from '@domainlang/language';
import fs from 'node:fs/promises';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared, DomainLang } = createDomainLangServices({ connection, ...NodeFileSystem });

// Initialize manifest diagnostics service with LSP connection
const manifestDiagnostics = getManifestDiagnosticsService();
manifestDiagnostics.setConnection(connection);

shared.lsp.LanguageServer.onInitialize((params) => {
    applyLspSettings(params.initializationOptions);
});

connection.onDidChangeConfiguration((params) => {
    applyLspSettings(params.settings);
});

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

registerDomainLangRefresh(shared, DomainLang, {
    onManifestChanged: async (change) => {
        const uri = URI.parse(change.uri);
        const filename = UriUtils.basename(uri).toLowerCase();
        if (filename === 'model.yaml') {
            await validateManifestAtUri(change.uri);
        }
    },
    onManifestDeleted: async (uri) => {
        await manifestDiagnostics.clearDiagnostics(uri);
    }
});

// Register custom LSP request handlers for VS Code Language Model Tools (PRS-015)
registerToolHandlers(connection, shared);

// Start the language server with the shared services
startLanguageServer(shared);

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
