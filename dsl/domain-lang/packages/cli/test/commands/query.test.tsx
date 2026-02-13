/**
 * Tests for query command behavior.
 *
 * @module commands/query.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { render } from '../../src/test-utils/render.js';
import { QueryComponent, normalizeEntityType, runQuery } from '../../src/commands/query.js';
import type { CommandContext } from '../../src/commands/types.js';

type RunDirectArgs = {
    result: unknown;
    handlers: {
        json: (result: unknown) => unknown;
        quiet: (result: unknown) => string;
    };
};

const state = vi.hoisted(() => ({
    runDirectArgs: undefined as RunDirectArgs | undefined,
    domainBuilder: undefined as undefined | {
        withName: ReturnType<typeof vi.fn>;
        withFqn: ReturnType<typeof vi.fn>;
    },
    bcBuilder: undefined as undefined | {
        inDomain: ReturnType<typeof vi.fn>;
        withTeam: ReturnType<typeof vi.fn>;
        withClassification: ReturnType<typeof vi.fn>;
        withMetadata: ReturnType<typeof vi.fn>;
        withName: ReturnType<typeof vi.fn>;
        withFqn: ReturnType<typeof vi.fn>;
    },
}));

vi.mock('../../src/utils/run-direct.js', () => ({
    runDirect: vi.fn(async (execute, _context, handlers) => {
        const result = await execute();
        state.runDirectArgs = {
            result,
            handlers,
        };
    }),
}));

vi.mock('@domainlang/language/sdk', () => {
    const mockDomain = {
        name: 'Sales',
        vision: 'Handle all sales operations',
        type: { ref: { name: 'Core' } },
        parent: undefined,
    };

    const mockBC = {
        name: 'OrderContext',
        domain: { ref: { name: 'Sales' } },
        description: 'Manages orders',
        effectiveClassification: { name: 'Core' },
        effectiveTeam: { name: 'SalesTeam' },
    };

    return {
        loadModel: vi.fn(async () => {
            const domainBuilder = {
                withName: vi.fn().mockReturnThis(),
                withFqn: vi.fn().mockReturnThis(),
                toArray: vi.fn(() => [mockDomain]),
            };
            state.domainBuilder = domainBuilder;

            const bcBuilder = {
                inDomain: vi.fn().mockReturnThis(),
                withTeam: vi.fn().mockReturnThis(),
                withClassification: vi.fn().mockReturnThis(),
                withMetadata: vi.fn().mockReturnThis(),
                withName: vi.fn().mockReturnThis(),
                withFqn: vi.fn().mockReturnThis(),
                toArray: vi.fn(() => [mockBC]),
            };
            state.bcBuilder = bcBuilder;

            return {
                query: {
                    domains: () => domainBuilder,
                    boundedContexts: () => bcBuilder,
                    teams: () => ({
                        withName: vi.fn().mockReturnThis(),
                        toArray: vi.fn(() => [{ name: 'SalesTeam' }]),
                    }),
                    classifications: () => ({
                        withName: vi.fn().mockReturnThis(),
                        toArray: vi.fn(() => [{ name: 'Core' }]),
                    }),
                    relationships: () => ({
                        toArray: vi.fn(() => [{
                            left: { name: 'OrderContext' },
                            right: { name: 'PaymentContext' },
                            arrow: '->' as const,
                            leftPatterns: ['OHS'],
                            rightPatterns: ['CF'],
                            inferredType: 'Open Host Service / Conformist',
                        }]),
                    }),
                    contextMaps: () => ({
                        withName: vi.fn().mockReturnThis(),
                        toArray: vi.fn(() => [{
                            name: 'SalesMap',
                            boundedContexts: [{ items: [{ ref: { name: 'OrderContext' } }] }],
                        }]),
                    }),
                    domainMaps: () => ({
                        withName: vi.fn().mockReturnThis(),
                        toArray: vi.fn(() => [{
                            name: 'DomainHierarchy',
                            domains: [{ items: [{ ref: { name: 'Sales' } }] }],
                        }]),
                    }),
                    fqn: vi.fn((node) => `acme.${node.name}`),
                },
                model: {},
                documents: [],
            };
        }),
    };
});

function createWorkspace(): { dir: string; entryFile: string } {
    const dir = mkdtempSync(join(tmpdir(), 'dlang-query-test-'));
    const entryFile = join(dir, 'index.dlang');
    writeFileSync(entryFile, 'Domain Sales { vision: "Sales" }\n', 'utf-8');
    return { dir, entryFile };
}

describe('Query command', () => {
    const defaultContext: CommandContext = {
        mode: 'rich',
        noColor: false,
        cwd: '/test/project',
        version: '0.1.0',
        isFirstRun: false,
    };

    beforeEach(() => {
        // Arrange
        vi.clearAllMocks();
        state.runDirectArgs = undefined;
        state.domainBuilder = undefined;
        state.bcBuilder = undefined;
    });

    afterEach(() => {
        // Arrange
        vi.restoreAllMocks();
    });

    describe('component loading state', () => {
        it.each(['domains', 'bcs', 'teams'] as const)('shows spinner with entity type %s', (type) => {
            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    path="/does/not/exist.dlang"
                    filters={{}}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            const output = lastFrame() ?? '';
            expect(output).toContain('Querying');
            expect(output).toContain(type);
        });
    });

    describe('runQuery filtering and output', () => {
        it('applies domain query name and fqn filters', async () => {
            // Arrange
            const { dir } = createWorkspace();

            // Act
            await runQuery('domains', dir, { name: 'Sales', fqn: 'acme.Sales' }, 'json', false, defaultContext);

            // Assert
            expect(state.domainBuilder).toBeDefined();
            expect(state.domainBuilder?.withName).toHaveBeenCalledWith('Sales');
            expect(state.domainBuilder?.withFqn).toHaveBeenCalledWith('acme.Sales');

            rmSync(dir, { recursive: true, force: true });
        });

        it('applies bounded context filters including metadata key/value', async () => {
            // Arrange
            const { dir } = createWorkspace();

            // Act
            await runQuery(
                'bcs',
                dir,
                {
                    domain: 'Sales',
                    team: 'SalesTeam',
                    classification: 'Core',
                    metadata: 'Language=TypeScript',
                    name: 'OrderContext',
                    fqn: 'acme.OrderContext',
                },
                'json',
                false,
                defaultContext,
            );

            // Assert
            expect(state.bcBuilder).toBeDefined();
            expect(state.bcBuilder?.inDomain).toHaveBeenCalledWith('Sales');
            expect(state.bcBuilder?.withTeam).toHaveBeenCalledWith('SalesTeam');
            expect(state.bcBuilder?.withClassification).toHaveBeenCalledWith('Core');
            expect(state.bcBuilder?.withMetadata).toHaveBeenCalledWith('Language', 'TypeScript');
            expect(state.bcBuilder?.withName).toHaveBeenCalledWith('OrderContext');
            expect(state.bcBuilder?.withFqn).toHaveBeenCalledWith('acme.OrderContext');

            rmSync(dir, { recursive: true, force: true });
        });

        it('formats json mode through runDirect json handler with semantic payload', async () => {
            // Arrange
            const { dir } = createWorkspace();

            // Act
            await runQuery('domains', dir, {}, 'json', false, defaultContext);

            // Assert
            expect(state.runDirectArgs).toBeDefined();
            const payload = state.runDirectArgs?.handlers.json(state.runDirectArgs.result) as {
                entityType: string;
                count: number;
                results: Array<{ name: string; fqn: string }>;
            };
            expect(payload.entityType).toBe('domains');
            expect(payload.count).toBe(1);
            expect(payload.results[0]).toEqual(expect.objectContaining({ name: 'Sales', fqn: 'acme.Sales' }));

            rmSync(dir, { recursive: true, force: true });
        });

        it('formats yaml mode through quiet handler with stable semantic lines', async () => {
            // Arrange
            const { dir } = createWorkspace();

            // Act
            await runQuery('domains', dir, {}, 'yaml', false, defaultContext);

            // Assert
            expect(state.runDirectArgs).toBeDefined();
            const output = state.runDirectArgs?.handlers.quiet(state.runDirectArgs.result) ?? '';
            expect(output).toContain('entityType: domains');
            expect(output).toContain('count: 1');
            expect(output).toContain('- name: Sales');

            rmSync(dir, { recursive: true, force: true });
        });

        it('returns only count in countOnly mode for json and quiet handlers', async () => {
            // Arrange
            const { dir } = createWorkspace();

            // Act
            await runQuery('domains', dir, {}, 'json', true, defaultContext);

            // Assert
            expect(state.runDirectArgs).toBeDefined();
            const jsonPayload = state.runDirectArgs?.handlers.json(state.runDirectArgs.result) as { count: number };
            const quietPayload = state.runDirectArgs?.handlers.quiet(state.runDirectArgs.result);
            expect(jsonPayload).toEqual({ count: 1 });
            expect(quietPayload).toBe('1');

            rmSync(dir, { recursive: true, force: true });
        });
    });

    describe('entity type aliases', () => {
        it.each([
            ['bounded-contexts', 'bcs'],
            ['contexts', 'bcs'],
            ['rels', 'relationships'],
            ['cmaps', 'context-maps'],
            ['dmaps', 'domain-maps'],
        ] as const)('normalizes "%s" to "%s"', (alias, expected) => {
            // Act
            const result = normalizeEntityType(alias);

            // Assert
            expect(result).toBe(expected);
        });

        it.each([
            'domains',
            'bcs',
            'teams',
            'classifications',
            'relationships',
            'context-maps',
            'domain-maps',
        ] as const)('preserves canonical type "%s" as-is', (canonical) => {
            // Act
            const result = normalizeEntityType(canonical);

            // Assert
            expect(result).toBe(canonical);
        });
    });
});
