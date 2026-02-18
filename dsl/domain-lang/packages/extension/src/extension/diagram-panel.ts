import * as vscode from 'vscode';
import type { SprottyDiagramIdentifier } from 'sprotty-vscode-protocol';
import {
    createFileUri,
    createWebviewHtml as doCreateWebviewHtml,
    isWebviewPanel,
    type OpenPanelOptions,
    type WebviewContainer,
    type WebviewEndpoint,
} from 'sprotty-vscode';
import { LspWebviewPanelManager, type LspWebviewPanelManagerOptions } from 'sprotty-vscode/lib/lsp/lsp-webview-panel-manager.js';
import type { LanguageClient } from 'vscode-languageclient/node.js';

export const OPEN_DIAGRAM_COMMAND = 'domainlang.diagram.open';
const DEFAULT_DIAGRAM_TYPE = 'domainlang-context-map';
const DIAGRAM_TITLE = 'DomainLang Diagram';

export interface OpenDiagramArgs {
    uri?: string;
}

/**
 * Extends {@link LspWebviewPanelManager} to enforce a fixed panel title and
 * the DomainLang icon regardless of which source file triggered the diagram.
 */
class DomainLangDiagramPanelManager extends LspWebviewPanelManager {
    constructor(options: LspWebviewPanelManagerOptions) {
        super(options);
    }

    protected override createWebview(identifier: SprottyDiagramIdentifier): vscode.WebviewPanel {
        const panel = super.createWebview(identifier);
        panel.title = DIAGRAM_TITLE;
        panel.iconPath = vscode.Uri.joinPath(this.options.extensionUri, 'images', 'icon.png');
        return panel;
    }

    override async openDiagram(uri: vscode.Uri, options?: OpenPanelOptions): Promise<WebviewEndpoint | undefined> {
        const result = await super.openDiagram(uri, options);
        // sprotty-vscode resets panel title on singleton reuse — fix it back
        for (const endpoint of this.endpoints) {
            if (isWebviewPanel(endpoint.webviewContainer)) {
                endpoint.webviewContainer.title = DIAGRAM_TITLE;
                endpoint.webviewContainer.iconPath = vscode.Uri.joinPath(
                    this.options.extensionUri, 'images', 'icon.png'
                );
            }
        }
        return result;
    }
}

export class DiagramPanel {
    private readonly diagramManager: DomainLangDiagramPanelManager;

    constructor(
        client: LanguageClient,
        private readonly outputChannel: vscode.OutputChannel,
        context: vscode.ExtensionContext
    ) {
        const extensionPath = context.extensionUri.fsPath;
        const localResourceRoots = [createFileUri(extensionPath, 'pack')];
        const createWebviewHtml = (identifier: SprottyDiagramIdentifier, container: WebviewContainer): string =>
            doCreateWebviewHtml(identifier, container, {
                scriptUri: createFileUri(extensionPath, 'pack', 'webview.js'),
                cssUri: createFileUri(extensionPath, 'pack', 'webview.css'),
            });

        this.diagramManager = new DomainLangDiagramPanelManager({
            extensionUri: context.extensionUri,
            languageClient: client,
            defaultDiagramType: DEFAULT_DIAGRAM_TYPE,
            supportedFileExtensions: ['.dlang'],
            singleton: true,
            localResourceRoots,
            createWebviewHtml,
        });
    }

    async openDocument(document: vscode.TextDocument): Promise<void> {
        if (document.languageId !== 'domain-lang') {
            return;
        }

        try {
            await this.diagramManager.openDiagram(document.uri, {
                diagramType: DEFAULT_DIAGRAM_TYPE,
                reveal: true,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`Could not open DomainLang diagram: ${message}`);
        }
    }
}
