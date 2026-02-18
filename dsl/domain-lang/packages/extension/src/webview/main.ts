import 'reflect-metadata';
import 'sprotty-vscode-webview/css/sprotty-vscode.css';

import { Container } from 'inversify';
import type { SprottyDiagramIdentifier } from 'sprotty-vscode-protocol';
import { SprottyLspEditStarter } from 'sprotty-vscode-webview/lib/lsp/editing/sprotty-lsp-edit-starter.js';
import { createDiagramContainer } from './di-config.js';

class DomainLangSprottyStarter extends SprottyLspEditStarter {
    protected override createContainer(diagramIdentifier: SprottyDiagramIdentifier): Container {
        return createDiagramContainer(diagramIdentifier.clientId);
    }
}

new DomainLangSprottyStarter().start();
