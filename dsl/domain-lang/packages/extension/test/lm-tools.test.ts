import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { registerLanguageModelTools } from '../src/extension/lm-tools.js';

type ToolImpl = {
    invoke: (options: { input: unknown }, token: { isCancellationRequested: boolean }) => Promise<unknown>;
    prepareInvocation: (options: { input: unknown }, token: { isCancellationRequested: boolean }) => Promise<{ invocationMessage: string }>;
};

const testState = vi.hoisted(() => ({
    registeredTools: new Map<string, ToolImpl>(),
}));

vi.mock('vscode', () => {
    class LanguageModelTextPart {
        value: string;

        constructor(value: string) {
            this.value = value;
        }
    }

    class LanguageModelToolResult {
        content: Array<{ value: string }>;

        constructor(content: Array<{ value: string }>) {
            this.content = content;
        }
    }

    class CancellationError extends Error {
        constructor() {
            super('Cancelled');
        }
    }

    return {
        lm: {
            registerTool: (name: string, impl: ToolImpl) => {
                testState.registeredTools.set(name, impl);
                return { dispose: vi.fn() };
            },
        },
        LanguageModelToolResult,
        LanguageModelTextPart,
        CancellationError,
    };
});

function getResultText(result: unknown): string {
    const toolResult = result as { content: Array<{ value: string }> };
    return toolResult.content[0]?.value ?? '';
}

function requireTool(name: string): ToolImpl {
    const tool = testState.registeredTools.get(name);
    expect(tool).not.toBeUndefined();
    if (!tool) {
        throw new Error(`Missing tool registration: ${name}`);
    }
    return tool;
}

describe('registerLanguageModelTools', () => {
    beforeEach(() => {
        testState.registeredTools.clear();
    });

    test('registers all documented DomainLang tools', () => {
        // Arrange
        const client = {
            state: 2,
            sendRequest: vi.fn(),
        } as unknown as LanguageClient;
        const context = { subscriptions: [] as Array<{ dispose: () => void }> };

        // Act
        registerLanguageModelTools(client, context as never);

        // Assert
        expect(Array.from(testState.registeredTools.keys())).toEqual([
            'domainlang_validate',
            'domainlang_list',
            'domainlang_get',
            'domainlang_explain',
        ]);
        expect(context.subscriptions).toHaveLength(4);
    });

    test('returns fail-safe error when language client is not running', async () => {
        // Arrange
        const sendRequest = vi.fn();
        const client = {
            state: 1,
            sendRequest,
        } as unknown as LanguageClient;
        const context = { subscriptions: [] as Array<{ dispose: () => void }> };
        registerLanguageModelTools(client, context as never);
        const validateTool = requireTool('domainlang_validate');

        // Act
        const result = await validateTool.invoke({ input: {} }, { isCancellationRequested: false });

        // Assert
        expect(getResultText(result)).toContain('Language server is not running');
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('returns fail-safe error on cancellation before request', async () => {
        // Arrange
        const sendRequest = vi.fn();
        const client = {
            state: 2,
            sendRequest,
        } as unknown as LanguageClient;
        const context = { subscriptions: [] as Array<{ dispose: () => void }> };
        registerLanguageModelTools(client, context as never);
        const validateTool = requireTool('domainlang_validate');

        // Act
        const result = await validateTool.invoke({ input: {} }, { isCancellationRequested: true });

        // Assert
        expect(getResultText(result)).toContain('Error:');
        expect(sendRequest).not.toHaveBeenCalled();
    });

    test('formats validate response as markdown summary', async () => {
        // Arrange
        const client = {
            state: 2,
            sendRequest: vi.fn().mockResolvedValue({
                count: 1,
                diagnostics: {
                    errors: [],
                    warnings: [
                        {
                            file: '/tmp/shared.dlang', // NOSONAR
                            line: 1,
                            column: 1,
                            message: 'Missing vision',
                        },
                    ],
                    info: [],
                },
            }),
        } as unknown as LanguageClient;
        const context = { subscriptions: [] as Array<{ dispose: () => void }> };
        registerLanguageModelTools(client, context as never);
        const validateTool = requireTool('domainlang_validate');

        // Act
        const result = await validateTool.invoke({ input: {} }, { isCancellationRequested: false });

        // Assert
        const text = getResultText(result);
        expect(text).toContain('# Validation Results');
        expect(text).toContain('**Total diagnostics:** 1');
        expect(text).toContain('## Warnings (1)');
        expect(text).toContain('Missing vision');
    });

    test('returns list/get/explain payloads with expected output contracts', async () => {
        // Arrange
        const client = {
            state: 2,
            sendRequest: vi.fn(async (method: string) => {
                if (method === 'domainlang/list') {
                    return { entityType: 'domains', count: 1, results: [{ fqn: 'Sales', name: 'Sales' }] };
                }
                if (method === 'domainlang/get') {
                    return { result: { $type: 'Domain', fqn: 'Sales', name: 'Sales' } };
                }
                return { explanation: 'Domain **Sales** handles sales.' };
            }),
        } as unknown as LanguageClient;
        const context = { subscriptions: [] as Array<{ dispose: () => void }> };
        registerLanguageModelTools(client, context as never);

        const listTool = requireTool('domainlang_list');
        const getTool = requireTool('domainlang_get');
        const explainTool = requireTool('domainlang_explain');

        // Act
        const listResult = await listTool.invoke({ input: { type: 'domains' } }, { isCancellationRequested: false });
        const getResult = await getTool.invoke({ input: { fqn: 'Sales' } }, { isCancellationRequested: false });
        const explainResult = await explainTool.invoke({ input: { fqn: 'Sales' } }, { isCancellationRequested: false });

        // Assert
        expect(JSON.parse(getResultText(listResult)) as { count: number }).toEqual(
            expect.objectContaining({ count: 1 }),
        );
        expect(JSON.parse(getResultText(getResult)) as { result: { fqn: string } }).toEqual(
            expect.objectContaining({ result: expect.objectContaining({ fqn: 'Sales' }) }),
        );
        expect(getResultText(explainResult)).toContain('Domain **Sales** handles sales.');
    });
});
