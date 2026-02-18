import type { LanguageClientOptions, ServerOptions} from 'vscode-languageclient/node.js';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import { registerLanguageModelTools } from './lm-tools.js';
import {
    DiagramPanel,
    OPEN_DIAGRAM_COMMAND,
} from './diagram-panel.js';

let client: LanguageClient;
let outputChannel: vscode.OutputChannel;

interface DomainLangLspSettings {
    traceImports: boolean;
    infoLogs: boolean;
}

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Create output channel for diagnostics
    outputChannel = vscode.window.createOutputChannel('DomainLang');
    context.subscriptions.push(outputChannel);

    try {
        client = await startLanguageClient(context);
        outputChannel.appendLine('DomainLang language server started successfully');
        
        // Register Language Model Tools (PRS-015 Phase 3)
        registerLanguageModelTools(client, context);
        outputChannel.appendLine('DomainLang Language Model Tools registered');

        const diagramPanel = new DiagramPanel(client, outputChannel, context);
        context.subscriptions.push(
            vscode.commands.registerCommand(OPEN_DIAGRAM_COMMAND, async (args?: { uri?: string }) => {
                const requestedUri = args?.uri;

                let document: vscode.TextDocument | undefined;
                if (requestedUri) {
                    try {
                        document = await vscode.workspace.openTextDocument(vscode.Uri.parse(requestedUri));
                    } catch {
                        document = undefined;
                    }
                }

                document ??= vscode.window.activeTextEditor?.document;

                if (document?.languageId !== 'domain-lang') {
                    vscode.window.showInformationMessage('Open a DomainLang (.dlang) file to view nodes.');
                    return;
                }

                await diagramPanel.openDocument(document);
            })
        );
        outputChannel.appendLine('DomainLang diagram panel registered');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Failed to start language server: ${message}`);
        vscode.window.showErrorMessage(
            'DomainLang: Failed to start language server. Check output for details.'
        );
        throw error; // Re-throw so VS Code knows activation failed
    }
}

// This function is called when the extension is deactivated.
export async function deactivate(): Promise<void> {
    if (client) {
        try {
            await client.stop();
            outputChannel?.appendLine('DomainLang language server stopped');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel?.appendLine(`Error stopping language server: ${message}`);
            // Don't throw - we're shutting down anyway
        }
    }
}

async function startLanguageClient(context: vscode.ExtensionContext): Promise<LanguageClient> {
    const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs'));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
    // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
    const debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    // File watchers for manifest and lock files (PRS-010)
    // The LSP server will handle these notifications to invalidate caches
    const fileWatchers = [
        vscode.workspace.createFileSystemWatcher('**/model.yaml'),
        vscode.workspace.createFileSystemWatcher('**/model.lock')
    ];

    // Register watchers for disposal when extension deactivates
    fileWatchers.forEach(watcher => context.subscriptions.push(watcher));

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: '*', language: 'domain-lang' }],
        initializationOptions: {
            domainlang: {
                lsp: readLspSettings(),
            },
        },
        synchronize: {
            // Register file watchers for config files
            fileEvents: fileWatchers,
            configurationSection: 'domainlang',
        }
    };

    // Create the language client and start the client.
    const client = new LanguageClient(
        'domain-lang',
        'DomainLang',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    // CRITICAL: await the promise to ensure server is ready before returning
    try {
        await client.start();
        outputChannel.appendLine('Language client connected to server');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Failed to start language client: ${message}`);
        throw error;
    }

    // Register server crash handler
    client.onDidChangeState((event) => {
        if (event.newState === 3) { // State.Stopped
            outputChannel.appendLine('Language server stopped unexpectedly');
            vscode.window.showWarningMessage(
                'DomainLang language server stopped. Reload window to restart.',
                'Reload Window'
            ).then((selection) => {
                if (selection === 'Reload Window') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
    });

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration('domainlang.lsp')) {
            return;
        }

        const settings = {
            domainlang: {
                lsp: readLspSettings(),
            },
        };

        client.sendNotification('workspace/didChangeConfiguration', { settings });
    }));

    return client;
}

function readLspSettings(): DomainLangLspSettings {
    const config = vscode.workspace.getConfiguration('domainlang.lsp');
    return {
        traceImports: config.get<boolean>('traceImports', false),
        infoLogs: config.get<boolean>('infoLogs', false),
    };
}
