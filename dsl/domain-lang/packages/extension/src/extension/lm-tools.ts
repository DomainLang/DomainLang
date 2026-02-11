/**
 * Language Model Tools Registration (PRS-015 Phase 3)
 * 
 * Registers DomainLang tools with VS Code's Language Model API.
 * Tools forward requests to the LSP server via custom LSP requests.
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';

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
        name: 'domainlang_validate',
        displayName: 'DomainLang: Validate Model',
        description: 'Validates the DomainLang model in the current workspace and returns all diagnostics (errors, warnings, info)',
        inputSchema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    description: 'Optional: URI of a specific file to validate. If omitted, validates the entire workspace.'
                }
            }
        },
        invoke: async (input: { file?: string }, token: vscode.CancellationToken) => {
            return invokeValidate(client, input, token);
        },
        prepareInvocation: async (input: { file?: string }, token: vscode.CancellationToken) => {
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
        name: 'domainlang_list',
        displayName: 'DomainLang: List Entities',
        description: 'Lists DomainLang entities (domains, bounded contexts, teams, classifications, relationships, context maps, domain maps) with optional filters',
        inputSchema: {
            type: 'object',
            required: ['type'],
            properties: {
                type: {
                    type: 'string',
                    enum: ['domains', 'bcs', 'bounded-contexts', 'contexts', 'teams', 'classifications', 'relationships', 'rels', 'context-maps', 'cmaps', 'domain-maps', 'dmaps'],
                    description: 'Entity type to list'
                },
                filters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Filter by name (string or regex)' },
                        fqn: { type: 'string', description: 'Filter by fully qualified name' },
                        domain: { type: 'string', description: 'Filter BCs by domain' },
                        team: { type: 'string', description: 'Filter BCs by team' },
                        classification: { type: 'string', description: 'Filter BCs by classification' },
                        metadata: { type: 'string', description: 'Filter BCs by metadata key=value' }
                    }
                }
            }
        },
        invoke: async (input: { type: string; filters?: unknown }, token: vscode.CancellationToken) => {
            return invokeList(client, input, token);
        },
        prepareInvocation: async (input: { type: string }, token: vscode.CancellationToken) => {
            return {
                invocationMessage: `Querying ${input.type}...`
            };
        }
    });

    // Register domainlang_get tool
    const getTool = vscode.lm.registerTool('domainlang_get', {
        name: 'domainlang_get',
        displayName: 'DomainLang: Get Element',
        description: 'Retrieves a specific DomainLang element by FQN or returns a model summary with entity counts',
        inputSchema: {
            type: 'object',
            properties: {
                fqn: {
                    type: 'string',
                    description: 'Fully qualified name of the element to retrieve'
                },
                summary: {
                    type: 'boolean',
                    description: 'If true, returns model summary instead of a single element'
                }
            }
        },
        invoke: async (input: { fqn?: string; summary?: boolean }, token: vscode.CancellationToken) => {
            return invokeGet(client, input, token);
        },
        prepareInvocation: async (input: { fqn?: string; summary?: boolean }, token: vscode.CancellationToken) => {
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
        name: 'domainlang_explain',
        displayName: 'DomainLang: Explain Element',
        description: 'Provides a rich markdown explanation of a DomainLang element, including its signature, properties, and relationships',
        inputSchema: {
            type: 'object',
            required: ['fqn'],
            properties: {
                fqn: {
                    type: 'string',
                    description: 'Fully qualified name of the element to explain'
                }
            }
        },
        invoke: async (input: { fqn: string }, token: vscode.CancellationToken) => {
            return invokeExplain(client, input, token);
        },
        prepareInvocation: async (input: { fqn: string }, token: vscode.CancellationToken) => {
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
 * Invokes the domainlang/validate LSP request.
 */
async function invokeValidate(
    client: LanguageClient,
    input: { file?: string },
    token: vscode.CancellationToken
): Promise<vscode.LanguageModelToolResult> {
    try {
        // Check if client is running
        if (!client || client.state !== 2) { // State.Running
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('Error: Language server is not running. Please wait for it to start or reload the window.')
            ]);
        }

        // Send custom LSP request
        const response = await client.sendRequest('domainlang/validate', { file: input.file }, token);
        
        // Format response as markdown
        const markdown = formatValidateResponse(response);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(markdown)
        ]);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Error: ${message}`)
        ]);
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
        if (!client || client.state !== 2) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('Error: Language server is not running.')
            ]);
        }

        const response = await client.sendRequest('domainlang/list', input, token);
        
        // Return as JSON for structured data
        const json = JSON.stringify(response, null, 2);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(json)
        ]);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Error: ${message}`)
        ]);
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
        if (!client || client.state !== 2) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('Error: Language server is not running.')
            ]);
        }

        const response = await client.sendRequest('domainlang/get', input, token);
        
        const json = JSON.stringify(response, null, 2);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(json)
        ]);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Error: ${message}`)
        ]);
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
        if (!client || client.state !== 2) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('Error: Language server is not running.')
            ]);
        }

        const response = await client.sendRequest('domainlang/explain', input, token);
        
        // Extract explanation (should be markdown)
        const explanation = (response as { explanation: string }).explanation;
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(explanation)
        ]);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Error: ${message}`)
        ]);
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

    const lines: string[] = [];
    lines.push(`# Validation Results\n`);
    lines.push(`**Total diagnostics:** ${data.count}\n`);

    if (data.diagnostics.errors.length > 0) {
        lines.push(`## Errors (${data.diagnostics.errors.length})\n`);
        for (const error of data.diagnostics.errors) {
            lines.push(`- \`${error.file}:${error.line}:${error.column}\` - ${error.message}`);
        }
        lines.push('');
    }

    if (data.diagnostics.warnings.length > 0) {
        lines.push(`## Warnings (${data.diagnostics.warnings.length})\n`);
        for (const warning of data.diagnostics.warnings) {
            lines.push(`- \`${warning.file}:${warning.line}:${warning.column}\` - ${warning.message}`);
        }
        lines.push('');
    }

    if (data.diagnostics.info.length > 0) {
        lines.push(`## Info (${data.diagnostics.info.length})\n`);
        for (const info of data.diagnostics.info) {
            lines.push(`- \`${info.file}:${info.line}:${info.column}\` - ${info.message}`);
        }
    }

    if (data.count === 0) {
        lines.push('✅ No diagnostics found. Model is valid.');
    }

    return lines.join('\n');
}
