import { describe, expect, test, vi } from 'vitest';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { DiagramPanel } from '../src/extension/diagram-panel.js';

vi.mock('vscode', () => ({
    Uri: {
        file: (...segments: string[]) => ({ fsPath: segments.join('/'), toString: () => segments.join('/') }),
    },
    window: {
        activeTextEditor: undefined,
    },
}));

const mockOpenDiagram = vi.fn().mockResolvedValue(undefined);

vi.mock('sprotty-vscode', () => ({
    createFileUri: (...segments: string[]) => ({ fsPath: segments.join('/'), toString: () => segments.join('/') }),
    createWebviewHtml: vi.fn(),
    isWebviewPanel: vi.fn().mockReturnValue(false),
    registerDefaultCommands: vi.fn(),
}));

vi.mock('sprotty-vscode/lib/lsp/lsp-webview-panel-manager.js', () => ({
    LspWebviewPanelManager: class MockLspWebviewPanelManager {
        endpoints: unknown[] = [];
        openDiagram = mockOpenDiagram;
    },
}));

describe('DiagramPanel', () => {
    const context = {
        extensionUri: { fsPath: '/extension', path: '/extension' },
        asAbsolutePath: (relativePath: string) => `/extension/${relativePath}`,
        subscriptions: [],
    };

    test('opens sprotty diagram for DomainLang documents', async () => {
        // Arrange
        mockOpenDiagram.mockClear();
        const client = {
            onNotification: vi.fn(),
        } as unknown as LanguageClient;
        const outputChannel = {
            appendLine: vi.fn(),
        };
        const provider = new DiagramPanel(client, outputChannel as never, context as never);

        // Act
        await provider.openDocument({
            languageId: 'domain-lang',
            uri: { toString: () => 'file:///model.dlang' },
        } as never);

        // Assert
        expect(mockOpenDiagram).toHaveBeenCalledWith(
            expect.objectContaining({ toString: expect.any(Function) }),
            expect.objectContaining({
                diagramType: 'domainlang-context-map',
                reveal: true,
            })
        );
    });

    test('does nothing for non-DomainLang documents', async () => {
        // Arrange
        mockOpenDiagram.mockClear();
        const client = {
            onNotification: vi.fn(),
        } as unknown as LanguageClient;
        const outputChannel = {
            appendLine: vi.fn(),
        };
        const provider = new DiagramPanel(client, outputChannel as never, context as never);

        // Act
        await provider.openDocument({
            languageId: 'markdown',
            uri: { toString: () => 'file:///readme.md' },
        } as never);

        // Assert
        expect(mockOpenDiagram).not.toHaveBeenCalled();
    });
});
