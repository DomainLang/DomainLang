import { beforeAll, describe, expect, test } from 'vitest';
import type { Connection } from 'vscode-languageserver';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';
import { registerToolHandlers } from '../../src/lsp/tool-handlers.js';

type RequestHandler = (params: unknown) => Promise<unknown>;

let testServices: TestServices;
let handlers: Map<string, RequestHandler>;

function requireHandler(method: string): RequestHandler {
    const handler = handlers.get(method);
    expect(handler).not.toBeUndefined();
    if (!handler) {
        throw new Error(`Missing handler: ${method}`);
    }
    return handler;
}

beforeAll(() => {
    testServices = setupTestSuite();
    handlers = new Map<string, RequestHandler>();

    const connection = {
        onRequest: (method: string, handler: RequestHandler) => {
            handlers.set(method, handler);
        },
    } as unknown as Connection;

    registerToolHandlers(connection, testServices.services.shared);
});

describe('registerToolHandlers', () => {
    test('registers all custom LM request handlers', () => {
        // Arrange
        const expectedMethods = [
            'domainlang/validate',
            'domainlang/list',
            'domainlang/get',
            'domainlang/explain',
        ];

        // Act
        const registeredMethods = Array.from(handlers.keys());

        // Assert
        expect(registeredMethods).toEqual(expect.arrayContaining(expectedMethods));
    });

    test('validate returns workspace diagnostics and supports file filter', async () => {
        // Arrange
        const warningDocument = await testServices.parse(
            s`Domain Sales { vision: "v" } bc Orders for Sales {}`,
            { documentUri: 'file:///validate-warning.dlang' }
        );
        await testServices.parse(
            s`Domain Billing { vision: "v" }`,
            { documentUri: 'file:///validate-valid.dlang' }
        );

        const validate = requireHandler('domainlang/validate');

        // Act
        const workspaceResponse = await validate({});
        const fileResponse = await validate({ file: warningDocument.uri.toString() });

        // Assert
        const workspace = workspaceResponse as {
            count: number;
            diagnostics: { errors: unknown[]; warnings: Array<{ file: string; message: string }>; info: unknown[] };
        };
        expect(workspace.count).toBeGreaterThan(0);
        expect(workspace.diagnostics.warnings.length).toBeGreaterThan(0);

        const filtered = fileResponse as {
            count: number;
            diagnostics: { errors: unknown[]; warnings: Array<{ file: string }>; info: unknown[] };
        };
        expect(filtered.count).toBeGreaterThan(0);
        expect(filtered.diagnostics.errors).toHaveLength(0);
        expect(filtered.diagnostics.info).toHaveLength(0);
        expect(filtered.diagnostics.warnings.every(diag => diag.file === warningDocument.uri.toString())).toBe(true);
    });

    test('list returns serialized entities with filtering', async () => {
        // Arrange
        await testServices.parse(
            s`
                Domain Sales { vision: "v" }
                Domain Billing { vision: "v" }
            `,
            { documentUri: 'file:///list-domains.dlang' }
        );
        const list = requireHandler('domainlang/list');

        // Act
        const response = await list({ type: 'domains', filters: { name: 'Sales' } });

        // Assert
        const result = response as {
            entityType: string;
            count: number;
            results: Array<{ name?: string; fqn?: string }>;
        };
        expect(result.entityType).toBe('domains');
        expect(result.count).toBeGreaterThan(0);
        expect(result.results.some(item => item.name === 'Sales')).toBe(true);
        expect(result.results.every(item => typeof item.fqn === 'string')).toBe(true);
    });

    test('get returns summary and single element by fqn', async () => {
        // Arrange
        await testServices.parse(
            s`Domain SummaryDomain { vision: "v" }`,
            { documentUri: 'file:///get-summary.dlang' }
        );
        const get = requireHandler('domainlang/get');

        // Act
        const summaryResponse = await get({ summary: true });
        const itemResponse = await get({ fqn: 'SummaryDomain' });

        // Assert
        const summary = summaryResponse as { result: { $type: string; domains: number } };
        expect(summary.result.$type).toBe('ModelSummary');
        expect(summary.result.domains).toBeGreaterThan(0);

        const item = itemResponse as { result: { name?: string; fqn?: string } | null };
        expect(item.result).not.toBeNull();
        expect(item.result?.name).toBe('SummaryDomain');
        expect(item.result?.fqn).toBe('SummaryDomain');
    });

    test('explain returns markdown for existing element and not-found message otherwise', async () => {
        // Arrange
        await testServices.parse(
            s`Domain ExplainedDomain { vision: "Detailed" }`,
            { documentUri: 'file:///explain-domain.dlang' }
        );
        const explain = requireHandler('domainlang/explain');

        // Act
        const foundResponse = await explain({ fqn: 'ExplainedDomain' });
        const missingResponse = await explain({ fqn: 'Missing.Element' });

        // Assert
        const found = foundResponse as { explanation: string };
        expect(found.explanation).toContain('ExplainedDomain');
        expect(found.explanation.toLowerCase()).toContain('domain');

        const missing = missingResponse as { explanation: string };
        expect(missing.explanation).toContain('Element not found');
        expect(missing.explanation).toContain('Missing.Element');
    });

    test('handlers fail safe on malformed input', async () => {
        // Arrange
        const list = requireHandler('domainlang/list');
        const validate = requireHandler('domainlang/validate');

        // Act
        const listResponse = await list({} as never);
        const validateResponse = await validate({ file: '::not-a-valid-uri::' } as never);

        // Assert
        const listed = listResponse as { count: number; results: unknown[] };
        expect(listed.count).toBe(0);
        expect(listed.results).toEqual([]);

        const validated = validateResponse as {
            count: number;
            diagnostics: { errors: unknown[]; warnings: unknown[]; info: unknown[] };
        };
        expect(validated.count).toBe(0);
        expect(validated.diagnostics.errors).toEqual([]);
        expect(validated.diagnostics.warnings).toEqual([]);
        expect(validated.diagnostics.info).toEqual([]);
    });
});
