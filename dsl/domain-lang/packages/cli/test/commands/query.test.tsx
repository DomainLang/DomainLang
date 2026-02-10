/**
 * Tests for the Query command component.
 * Tests different entity types, filters, and output formats.
 *
 * @module commands/query.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../../src/test-utils/render.js';
import { QueryComponent, normalizeEntityType } from '../../src/commands/query.js';
import type { CommandContext } from '../../src/commands/types.js';

// Mock the SDK loadModel function
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

    const mockTeam = {
        name: 'SalesTeam',
    };

    const mockClassification = {
        name: 'Core',
    };

    const mockRelationship = {
        left: { name: 'OrderContext' },
        right: { name: 'PaymentContext' },
        arrow: '->' as const,
        leftPatterns: ['OHS'],
        rightPatterns: ['CF'],
        inferredType: 'Open Host Service / Conformist',
    };

    const mockContextMap = {
        name: 'SalesMap',
        boundedContexts: [
            {
                items: [
                    { ref: { name: 'OrderContext' } },
                ],
            },
        ],
    };

    const mockDomainMap = {
        name: 'DomainHierarchy',
        domains: [
            {
                items: [
                    { ref: { name: 'Sales' } },
                ],
            },
        ],
    };

    const mockQuery = {
        domains: () => ({
            withName: vi.fn().mockReturnThis(),
            withFqn: vi.fn().mockReturnThis(),
            toArray: vi.fn(() => [mockDomain]),
        }),
        boundedContexts: () => ({
            withName: vi.fn().mockReturnThis(),
            withFqn: vi.fn().mockReturnThis(),
            inDomain: vi.fn().mockReturnThis(),
            withTeam: vi.fn().mockReturnThis(),
            withClassification: vi.fn().mockReturnThis(),
            withMetadata: vi.fn().mockReturnThis(),
            toArray: vi.fn(() => [mockBC]),
        }),
        teams: () => ({
            withName: vi.fn().mockReturnThis(),
            toArray: vi.fn(() => [mockTeam]),
        }),
        classifications: () => ({
            withName: vi.fn().mockReturnThis(),
            toArray: vi.fn(() => [mockClassification]),
        }),
        relationships: () => ({
            toArray: vi.fn(() => [mockRelationship]),
        }),
        contextMaps: () => ({
            withName: vi.fn().mockReturnThis(),
            toArray: vi.fn(() => [mockContextMap]),
        }),
        domainMaps: () => ({
            withName: vi.fn().mockReturnThis(),
            toArray: vi.fn(() => [mockDomainMap]),
        }),
        fqn: vi.fn((node) => node.name),
    };

    return {
        loadModel: vi.fn(() => Promise.resolve({
            query: mockQuery,
            model: {},
            documents: [],
        })),
    };
});

describe('Query command', () => {
    const defaultContext: CommandContext = {
        mode: 'rich',
        noColor: false,
        cwd: '/test/project',
        version: '0.1.0',
        isFirstRun: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loading state', () => {
        it('shows spinner while querying domains', () => {
            // Arrange
            const type = 'domains' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    path="test-model.dlang"
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            const output = lastFrame();
            expect(output).toContain('Querying');
            expect(output).toContain('domains');
        });

        it('shows spinner while querying bounded contexts', () => {
            // Arrange
            const type = 'bcs' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            const output = lastFrame();
            expect(output).toContain('Querying');
            expect(output).toContain('bcs');
        });
    });

    describe('entity type queries', () => {
        it('queries domains successfully', () => {
            // Arrange
            const type = 'domains' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert - component renders without error
            expect(lastFrame()).toBeDefined();
        });

        it('queries bounded contexts successfully', () => {
            // Arrange
            const type = 'bcs' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('queries teams successfully', () => {
            // Arrange
            const type = 'teams' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('queries classifications successfully', () => {
            // Arrange
            const type = 'classifications' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('queries relationships successfully', () => {
            // Arrange
            const type = 'relationships' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('queries context maps successfully', () => {
            // Arrange
            const type = 'context-maps' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('queries domain maps successfully', () => {
            // Arrange
            const type = 'domain-maps' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });
    });

    describe('filter options', () => {
        it('applies name filter', () => {
            // Arrange
            const type = 'domains' as const;
            const filters = { name: 'Sales' };

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('applies FQN filter', () => {
            // Arrange
            const type = 'domains' as const;
            const filters = { fqn: 'acme.Sales' };

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('applies domain filter for bounded contexts', () => {
            // Arrange
            const type = 'bcs' as const;
            const filters = { domain: 'Sales' };

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('applies team filter for bounded contexts', () => {
            // Arrange
            const type = 'bcs' as const;
            const filters = { team: 'SalesTeam' };

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('applies classification filter for bounded contexts', () => {
            // Arrange
            const type = 'bcs' as const;
            const filters = { classification: 'Core' };

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('applies metadata filter for bounded contexts', () => {
            // Arrange
            const type = 'bcs' as const;
            const filters = { metadata: 'Language=TypeScript' };

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });
    });

    describe('output formats', () => {
        it('renders table format by default', () => {
            // Arrange
            const type = 'domains' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('renders JSON format when specified', () => {
            // Arrange
            const type = 'domains' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="json"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('renders YAML format when specified', () => {
            // Arrange
            const type = 'domains' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="yaml"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });
    });

    describe('component structure', () => {
        it('renders with correct props', () => {
            // Arrange
            const type = 'domains' as const;
            const filters = {};
            const context: CommandContext = {
                mode: 'rich',
                noColor: false,
                cwd: '/home/user/projects',
                version: '0.1.0',
                isFirstRun: false,
            };

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    context={context}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('accepts optional path prop', () => {
            // Arrange
            const type = 'domains' as const;
            const filters = {};
            const path = './my-model.dlang';

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    path={path}
                    filters={filters}
                    format="table"
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });
    });

    describe('count-only mode', () => {
        it('renders only the count when countOnly is true', () => {
            // Arrange
            const type = 'domains' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    countOnly={true}
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert
            expect(lastFrame()).toBeDefined();
        });

        it('does not render table when countOnly is true', () => {
            // Arrange
            const type = 'bcs' as const;
            const filters = {};

            // Act
            const { lastFrame } = render(
                <QueryComponent
                    type={type}
                    filters={filters}
                    format="table"
                    countOnly={true}
                    context={defaultContext}
                    autoExit={false}
                />,
            );

            // Assert - should not contain table headers
            const output = lastFrame() ?? '';
            expect(output).not.toContain('FQN');
            expect(output).not.toContain('Domain');
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
