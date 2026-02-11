/**
 * Language Model Tools Registration (PRS-015 Phase 3)
 * 
 * Registers DomainLang tools with VS Code's Language Model API.
 * Tools forward requests to the LSP server via custom LSP requests.
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';

/**
 * LanguageClient.State.Running value.
 * The State enum is not exported from the public vscode-languageclient API,
 * so we define the constant here for readability.
 * @see https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/common/client.ts
 */
const CLIENT_STATE_RUNNING = 2;

/**
 * Registers all DomainLang Language Model Tools.
 * Call this after the language client is started.
 * 
 * @param client - The language client connected to the LSP server
 * @param context - The extension context for subscription management
 */
export function registerLanguageModelTools(
    client: LanguageClient,
    context: vscode.ExtensionContext
): void {
    // Register domainlang_validate tool
    const validateTool = vscode.lm.registerTool('domainlang_validate', {
        invoke: async (options, _token: vscode.CancellationToken) => {
            return invokeValidate(client, options.input as { file?: string }, _token);
        },
        prepareInvocation: async (options, _token: vscode.CancellationToken) => {
            const input = options.input as { file?: string };
            const message = input.file 
                ? `Validating ${input.file}...`
                : 'Validating DomainLang workspace...';
            return {
                invocationMessage: message
            };
        }
    });

    // Register domainlang_list tool
    const listTool = vscode.lm.registerTool('domainlang_list', {
        invoke: async (options, _token: vscode.CancellationToken) => {
            return invokeList(client, options.input as { type: string; filters?: unknown }, _token);
        },
        prepareInvocation: async (options, _token: vscode.CancellationToken) => {
            const input = options.input as { type: string };
            return {
                invocationMessage: `Querying ${input.type}...`
            };
        }
    });

    // Register domainlang_get tool
    const getTool = vscode.lm.registerTool('domainlang_get', {
        invoke: async (options, _token: vscode.CancellationToken) => {
            return invokeGet(client, options.input as { fqn?: string; summary?: boolean }, _token);
        },
        prepareInvocation: async (options, _token: vscode.CancellationToken) => {
            const input = options.input as { fqn?: string; summary?: boolean };
            const message = input.summary 
                ? 'Getting model summary...'
                : `Retrieving ${input.fqn}...`;
            return {
                invocationMessage: message
            };
        }
    });

    // Register domainlang_explain tool
    const explainTool = vscode.lm.registerTool('domainlang_explain', {
        invoke: async (options, _token: vscode.CancellationToken) => {
            return invokeExplain(client, options.input as { fqn: string }, _token);
        },
        prepareInvocation: async (options, _token: vscode.CancellationToken) => {
            const input = options.input as { fqn: string };
            return {
                invocationMessage: `Explaining ${input.fqn}...`
            };
        }
    });

    // Register all tools for disposal
    context.subscriptions.push(validateTool, listTool, getTool, explainTool);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Invocation Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if the language client is ready to handle requests.
 * Returns an error result if not ready, or undefined if ready.
 */
function checkClientReady(client: LanguageClient): vscode.LanguageModelToolResult | undefined {
    if (client.state !== CLIENT_STATE_RUNNING) {
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart('Error: Language server is not running. Please wait for it to start or reload the window.')
        ]);
    }
    return undefined;
}

/**
 * Creates an error result from an unknown error.
 */
function errorResult(error: unknown): vscode.LanguageModelToolResult {
    const message = error instanceof Error ? error.message : String(error);
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Error: ${message}`)
    ]);
}

/**
 * Invokes the domainlang/validate LSP request.
 */
async function invokeValidate(
    client: LanguageClient,
    input: { file?: string },
    token: vscode.CancellationToken
): Promise<vscode.LanguageModelToolResult> {
    try {
        const notReady = checkClientReady(client);
        if (notReady) return notReady;

        if (token.isCancellationRequested) throw new vscode.CancellationError();

        // Send custom LSP request
        const response = await client.sendRequest('domainlang/validate', { file: input.file }, token);
        
        // Format response as markdown
        const markdown = formatValidateResponse(response);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(markdown)
        ]);
    } catch (error) {
        return errorResult(error);
    }
}

/**
 * Invokes the domainlang/list LSP request.
 */
async function invokeList(
    client: LanguageClient,
    input: { type: string; filters?: unknown },
    token: vscode.CancellationToken
): Promise<vscode.LanguageModelToolResult> {
    try {
        const notReady = checkClientReady(client);
        if (notReady) return notReady;

        if (token.isCancellationRequested) throw new vscode.CancellationError();

        const response = await client.sendRequest('domainlang/list', input, token);
        
        // Return as JSON for structured data
        const json = JSON.stringify(response, null, 2);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(json)
        ]);
    } catch (error) {
        return errorResult(error);
    }
}

/**
 * Invokes the domainlang/get LSP request.
 */
async function invokeGet(
    client: LanguageClient,
    input: { fqn?: string; summary?: boolean },
    token: vscode.CancellationToken
): Promise<vscode.LanguageModelToolResult> {
    try {
        const notReady = checkClientReady(client);
        if (notReady) return notReady;

        if (token.isCancellationRequested) throw new vscode.CancellationError();

        const response = await client.sendRequest('domainlang/get', input, token);
        
        const json = JSON.stringify(response, null, 2);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(json)
        ]);
    } catch (error) {
        return errorResult(error);
    }
}

/**
 * Invokes the domainlang/explain LSP request.
 */
async function invokeExplain(
    client: LanguageClient,
    input: { fqn: string },
    token: vscode.CancellationToken
): Promise<vscode.LanguageModelToolResult> {
    try {
        const notReady = checkClientReady(client);
        if (notReady) return notReady;

        if (token.isCancellationRequested) throw new vscode.CancellationError();

        const response = await client.sendRequest('domainlang/explain', input, token);
        
        // Extract explanation (should be markdown)
        const explanation = (response as { explanation: string }).explanation;
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(explanation)
        ]);
    } catch (error) {
        return errorResult(error);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Response Formatters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats validation response as markdown.
 */
function formatValidateResponse(response: unknown): string {
    const data = response as {
        count: number;
        diagnostics: {
            errors: Array<{ file: string; line: number; column: number; message: string }>;
            warnings: Array<{ file: string; line: number; column: number; message: string }>;
            info: Array<{ file: string; line: number; column: number; message: string }>;
        };
    };

    const lines: string[] = [
        `# Validation Results\n`,
        `**Total diagnostics:** ${data.count}\n`,
    ];

    if (data.diagnostics.errors.length > 0) {
        lines.push(
            `## Errors (${data.diagnostics.errors.length})\n`,
            ...data.diagnostics.errors.map(e => `- \`${e.file}:${e.line}:${e.column}\` - ${e.message}`),
            '',
        );
    }

    if (data.diagnostics.warnings.length > 0) {
        lines.push(
            `## Warnings (${data.diagnostics.warnings.length})\n`,
            ...data.diagnostics.warnings.map(w => `- \`${w.file}:${w.line}:${w.column}\` - ${w.message}`),
            '',
        );
    }

    if (data.diagnostics.info.length > 0) {
        lines.push(
            `## Info (${data.diagnostics.info.length})\n`,
            ...data.diagnostics.info.map(i => `- \`${i.file}:${i.line}:${i.column}\` - ${i.message}`),
        );
    }

    if (data.count === 0) {
        lines.push('✅ No diagnostics found. Model is valid.');
    }

    return lines.join('\n');
}
