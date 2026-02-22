/**
 * Query command - query DomainLang models using the SDK.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/query
 */
import type { CommandModule, Argv } from 'yargs';
import React, { useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { loadModel, type Query, type RelationshipView } from '@domainlang/language/sdk';
import type {
    Domain,
    BoundedContext,
    Team,
    Classification,
    ContextMap,
    DomainMap,
} from '@domainlang/language';
import {
    Spinner,
    StatusMessage,
    Banner,
    Table,
} from '../ui/components/index.js';
import { theme } from '../ui/themes/colors.js';
import { EMOJI } from '../ui/themes/emoji.js';
import { useCommand } from '../ui/hooks/useCommand.js';
import { runDirect } from '../utils/run-direct.js';
import { runCommand } from './command-runner.js';
import type { CommandContext } from './types.js';
import { resolve, join } from 'node:path';
import { statSync, existsSync, readFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical entity types that can be queried.
 */
export type QueryEntityType = 
    | 'domains'
    | 'bcs'
    | 'teams'
    | 'classifications'
    | 'relationships'
    | 'context-maps'
    | 'domain-maps';

/**
 * All accepted entity type names, including aliases.
 * Aliases are normalized to canonical types before query execution.
 */
export type QueryEntityInput = QueryEntityType
    | 'bounded-contexts' | 'contexts'
    | 'rels'
    | 'cmaps'
    | 'dmaps';

/**
 * Map of entity type aliases to their canonical form.
 */
const ENTITY_ALIASES: Record<string, QueryEntityType> = {
    'bounded-contexts': 'bcs',
    'contexts': 'bcs',
    'rels': 'relationships',
    'cmaps': 'context-maps',
    'dmaps': 'domain-maps',
};

/**
 * Normalize an entity type input (which may be an alias) to its canonical form.
 */
export function normalizeEntityType(input: string): QueryEntityType {
    if (input in ENTITY_ALIASES) {
        return ENTITY_ALIASES[input];
    }
    return input as QueryEntityType;
}

/**
 * Output format for query results.
 */
export type QueryOutputFormat = 'table' | 'json' | 'yaml';

/**
 * Query filter options.
 */
export interface QueryFilters {
    /** Filter by name (string or regex) */
    name?: string;
    /** Filter by fully qualified name */
    fqn?: string;
    /** Filter BCs by domain */
    domain?: string;
    /** Filter BCs by team */
    team?: string;
    /** Filter BCs by classification */
    classification?: string;
    /** Filter BCs by metadata key=value */
    metadata?: string;
}

/**
 * Query command arguments.
 */
export interface QueryArgs {
    /** Entity type to query (canonical or alias) */
    type: QueryEntityInput;
    /** File or directory path (optional, defaults to cwd) */
    path?: string;
    /** Output format */
    format?: QueryOutputFormat;
    /** Only print the result count */
    count?: boolean;
    /** Name filter */
    name?: string;
    /** FQN filter */
    fqn?: string;
    /** Domain filter (for BCs) */
    domain?: string;
    /** Team filter (for BCs) */
    team?: string;
    /** Classification/role filter (for BCs) */
    classification?: string;
    /** Metadata filter (for BCs) */
    metadata?: string;
}

/**
 * Query result data.
 */
export interface QueryResult {
    /** Entity type queried */
    entityType: QueryEntityType;
    /** Number of results */
    count: number;
    /** Result data */
    results: QueryResultItem[];
}

/**
 * Single query result item (normalized across all entity types).
 */
export interface QueryResultItem {
    /** Entity name */
    name: string;
    /** Fully qualified name */
    fqn?: string;
    /** Entity-specific properties */
    [key: string]: unknown;
}

/**
 * Props for Query command component.
 */
export interface QueryProps {
    /** Entity type to query */
    type: QueryEntityType;
    /** File or directory path to load */
    path?: string;
    /** Filter options */
    filters: QueryFilters;
    /** Output format */
    format: QueryOutputFormat;
    /** Only print the result count */
    countOnly?: boolean;
    /** Command context */
    context: CommandContext;
    /** Whether to auto-exit when command completes (default: true) */
    autoExit?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a user-supplied path (file, directory, or undefined) to a .dlang
 * entry file path and workspace directory that loadModel() can consume.
 *
 * Follows the same convention as validate:
 * - File → use as-is, workspace = dirname
 * - Directory → look for model.yaml → entry field → default index.dlang
 * - Undefined → treat cwd as a directory
 */
function resolveEntryPath(path: string | undefined): { entryFile: string; workspaceDir: string } {
    const targetPath = path ? resolve(path) : process.cwd();

    let isDirectory: boolean;
    try {
        const stats = statSync(targetPath);
        isDirectory = stats.isDirectory();
    } catch {
        throw new Error(`Path not found: ${path ?? process.cwd()}`);
    }

    if (!isDirectory) {
        // Single .dlang file
        return {
            entryFile: targetPath,
            workspaceDir: resolve(targetPath, '..'),
        };
    }

    // Directory – resolve entry file from model.yaml or default
    let entryFileName = 'index.dlang';
    const manifestPath = join(targetPath, 'model.yaml');
    if (existsSync(manifestPath)) {
        try {
            const raw = readFileSync(manifestPath, 'utf-8');
            // Simple YAML parse for model.entry (avoids a yaml dependency)
            const entryMatch = /^\s*entry:\s*(.+)$/m.exec(raw);
            if (entryMatch) {
                const raw = entryMatch[1].trim();
                // Strip surrounding quotes if present
                entryFileName = raw.startsWith('"') || raw.startsWith("'")
                    ? raw.slice(1, -1)
                    : raw;
            }
        } catch {
            // ignore manifest read errors, fall back to default
        }
    }

    const entryFile = join(targetPath, entryFileName);
    if (!existsSync(entryFile)) {
        throw new Error(
            `Entry file not found: ${entryFileName}\n` +
            `  Expected at: ${entryFile}\n` +
            `  Specify a .dlang file directly or ensure the workspace has an entry file.`,
        );
    }

    return { entryFile, workspaceDir: targetPath };
}

/**
 * Execute a query against a DomainLang model.
 *
 * @param type - Entity type to query
 * @param path - File or directory path (optional, defaults to cwd)
 * @param filters - Filter options
 * @returns Query result
 */
async function executeQuery(
    type: QueryEntityType,
    path: string | undefined,
    filters: QueryFilters,
): Promise<QueryResult> {
    // Resolve directory → entry file
    const { entryFile, workspaceDir } = resolveEntryPath(path);
    const { query } = await loadModel(entryFile, { workspaceDir });

    // Execute type-specific query
    let results: QueryResultItem[];
    
    switch (type) {
        case 'domains':
            results = queryDomains(query, filters);
            break;
        case 'bcs':
            results = queryBoundedContexts(query, filters);
            break;
        case 'teams':
            results = queryTeams(query, filters);
            break;
        case 'classifications':
            results = queryClassifications(query, filters);
            break;
        case 'relationships':
            results = queryRelationships(query, filters);
            break;
        case 'context-maps':
            results = queryContextMaps(query, filters);
            break;
        case 'domain-maps':
            results = queryDomainMaps(query, filters);
            break;
        default:
            throw new Error(`Unknown entity type: ${type}`);
    }

    return {
        entityType: type,
        count: results.length,
        results,
    };
}

/**
 * Query domains.
 */
function queryDomains(query: Query, filters: QueryFilters): QueryResultItem[] {
    let builder = query.domains();

    // Apply filters
    if (filters.name) {
        builder = builder.withName(filters.name);
    }
    if (filters.fqn) {
        builder = builder.withFqn(filters.fqn);
    }

    return builder.toArray().map((domain: Domain) => ({
        name: domain.name,
        fqn: query.fqn(domain),
        vision: domain.vision,
        type: domain.type?.ref?.name,
        parent: domain.parent?.ref?.name,
    }));
}

/**
 * Query bounded contexts.
 */
function queryBoundedContexts(query: Query, filters: QueryFilters): QueryResultItem[] {
    const bcBuilder = query.boundedContexts();

    // Apply BC-specific filters first (maintains BcQueryBuilder type)
    let filtered: ReturnType<Query['boundedContexts']> = bcBuilder;
    if (filters.domain) {
        filtered = filtered.inDomain(filters.domain);
    }
    if (filters.team) {
        filtered = filtered.withTeam(filters.team);
    }
    if (filters.classification) {
        filtered = filtered.withClassification(filters.classification);
    }
    if (filters.metadata) {
        const [key, value] = filters.metadata.split('=');
        filtered = filtered.withMetadata(key, value);
    }

    // Apply generic filters (returns QueryBuilder<BoundedContext>)
    if (filters.name) {
        filtered = filtered.withName(filters.name) as ReturnType<Query['boundedContexts']>;
    }
    if (filters.fqn) {
        filtered = filtered.withFqn(filters.fqn) as ReturnType<Query['boundedContexts']>;
    }

    return filtered.toArray().map((bc: BoundedContext) => ({
        name: bc.name,
        fqn: query.fqn(bc),
        domain: bc.domain?.ref?.name,
        description: bc.description,
        classification: bc.effectiveClassification?.name,
        team: bc.effectiveTeam?.name,
    }));
}

/**
 * Query teams.
 */
function queryTeams(query: Query, filters: QueryFilters): QueryResultItem[] {
    let builder = query.teams();

    // Apply filters
    if (filters.name) {
        builder = builder.withName(filters.name);
    }

    return builder.toArray().map((team: Team) => ({
        name: team.name,
        fqn: query.fqn(team),
    }));
}

/**
 * Query classifications.
 */
function queryClassifications(query: Query, filters: QueryFilters): QueryResultItem[] {
    let builder = query.classifications();

    // Apply filters
    if (filters.name) {
        builder = builder.withName(filters.name);
    }

    return builder.toArray().map((classification: Classification) => ({
        name: classification.name,
        fqn: query.fqn(classification),
    }));
}

/**
 * Query relationships.
 */
function queryRelationships(query: Query, _filters: QueryFilters): QueryResultItem[] {
    const relationships = query.relationships().toArray();

    return relationships.map((rel: RelationshipView) => {
        if (rel.type === 'symmetric') {
            const patternDisplay = rel.kind === 'SeparateWays' ? '><' : `[${rel.kind}]`;
            return {
                name: `${rel.left.context.name} ${patternDisplay} ${rel.right.context.name}`,
                left: rel.left.context.name,
                right: rel.right.context.name,
                type: 'symmetric',
                kind: rel.kind,
            };
        }
        return {
            name: `${rel.left.context.name} ${rel.arrow} ${rel.right.context.name}`,
            left: rel.left.context.name,
            right: rel.right.context.name,
            type: 'directional',
            kind: rel.kind,
            arrow: rel.arrow,
            leftPatterns: rel.left.patterns.map(p => p.$type).join(', '),
            rightPatterns: rel.right.patterns.map(p => p.$type).join(', '),
        };
    });
}

/**
 * Query context maps.
 */
function queryContextMaps(query: Query, filters: QueryFilters): QueryResultItem[] {
    let builder = query.contextMaps();

    // Apply filters
    if (filters.name) {
        builder = builder.withName(filters.name);
    }

    return builder.toArray().map((cmap: ContextMap) => ({
        name: cmap.name,
        contexts: cmap.boundedContexts
            .flatMap((multiRef) => multiRef.items.map((item) => item.ref?.name))
            .filter(Boolean)
            .join(', '),
    }));
}

/**
 * Query domain maps.
 */
function queryDomainMaps(query: Query, filters: QueryFilters): QueryResultItem[] {
    let builder = query.domainMaps();

    // Apply filters
    if (filters.name) {
        builder = builder.withName(filters.name);
    }

    return builder.toArray().map((dmap: DomainMap) => ({
        name: dmap.name,
        domains: dmap.domains
            .flatMap((multiRef) => multiRef.items.map((item) => item.ref?.name))
            .filter(Boolean)
            .join(', '),
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Output Formatters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format query results as JSON.
 */
function formatAsJson(result: QueryResult): string {
    return JSON.stringify(result, null, 2);
}

/**
 * Format query results as YAML.
 */
function formatAsYaml(result: QueryResult): string {
    // Simple YAML formatting (avoid external dependencies)
    const lines = [
        `entityType: ${result.entityType}`,
        `count: ${result.count}`,
        'results:',
    ];

    for (const item of result.results) {
        lines.push(`  - name: ${item.name}`);
        for (const [key, value] of Object.entries(item)) {
            if (key !== 'name' && value !== undefined) {
                lines.push(`    ${key}: ${value}`);
            }
        }
    }

    return lines.join('\n');
}

/**
 * Get table headers for entity type.
 */
function getTableHeaders(entityType: QueryEntityType): string[] {
    switch (entityType) {
        case 'domains':
            return ['Name', 'FQN', 'Vision', 'Type', 'Parent'];
        case 'bcs':
            return ['Name', 'FQN', 'Domain', 'Classification', 'Team', 'Description'];
        case 'teams':
            return ['Name', 'FQN'];
        case 'classifications':
            return ['Name', 'FQN'];
        case 'relationships':
            return ['Relationship', 'Left', 'Arrow', 'Right', 'Left Patterns', 'Right Patterns', 'Type'];
        case 'context-maps':
            return ['Name', 'Contexts'];
        case 'domain-maps':
            return ['Name', 'Domains'];
        default:
            return ['Name'];
    }
}

/**
 * Convert query result item to table row.
 */
function resultToRow(item: QueryResultItem, entityType: QueryEntityType): string[] {
    const value = (key: string): string => {
        const v = item[key];
        return v !== undefined && v !== null ? String(v) : '-';
    };

    switch (entityType) {
        case 'domains':
            return [value('name'), value('fqn'), value('vision'), value('type'), value('parent')];
        case 'bcs':
            return [
                value('name'),
                value('fqn'),
                value('domain'),
                value('classification'),
                value('team'),
                value('description'),
            ];
        case 'teams':
            return [value('name'), value('fqn')];
        case 'classifications':
            return [value('name'), value('fqn')];
        case 'relationships':
            return [
                value('name'),
                value('left'),
                value('arrow'),
                value('right'),
                value('leftPatterns'),
                value('rightPatterns'),
                value('type'),
            ];
        case 'context-maps':
            return [value('name'), value('contexts')];
        case 'domain-maps':
            return [value('name'), value('domains')];
        default:
            return [value('name')];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ink UI Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query command component.
 * Only renders in rich (Ink) mode.
 */
export const QueryComponent: React.FC<QueryProps> = ({
    type,
    path,
    filters,
    format,
    countOnly = false,
    context: _context,
    autoExit = true,
}) => {
    const { status, result, error } = useCommand(
        () => executeQuery(type, path, filters),
        [type, path, filters],
    );
    const { exit } = useApp();

    // Exit when command completes (success or error)
    useEffect(() => {
        if (autoExit && (status === 'success' || status === 'error')) {
            setTimeout(() => {
                exit();
            }, 100);
        }
    }, [status, exit, autoExit]);

    if (status === 'loading') {
        return <Spinner label={`Querying ${type}`} emoji="search" />;
    }

    if (status === 'error') {
        return (
            <Box flexDirection="column">
                <StatusMessage type="error" message={error ?? 'Unknown error'} />
            </Box>
        );
    }

    // status === 'success' — result is guaranteed
    if (!result) return null;

    // --count: print only the count and exit
    if (countOnly) {
        return <Text>{String(result.count)}</Text>;
    }

    // Handle non-table formats
    if (format === 'json') {
        return <Text>{formatAsJson(result)}</Text>;
    }
    if (format === 'yaml') {
        return <Text>{formatAsYaml(result)}</Text>;
    }

    // Table format (default)
    const headers = getTableHeaders(result.entityType);
    const rows = result.results.map((item) => resultToRow(item, result.entityType));

    return (
        <Box flexDirection="column">
            {/* Result banner */}
            <Banner
                bannerText={`${EMOJI.success}Found ${result.count} ${type}`}
                variant="success"
            />

            {/* Results table */}
            {result.count > 0 ? (
                <Box flexDirection="column" marginTop={1}>
                    <Table headers={headers} rows={rows} compact />
                </Box>
            ) : (
                <Box marginTop={1}>
                    <Text color={theme.text.secondary}>
                        {EMOJI.info}No {type} found matching filters
                    </Text>
                </Box>
            )}
        </Box>
    );
};

/**
 * Run query without Ink (for --json/--yaml/--quiet modes).
 */
export async function runQuery(
    type: QueryEntityType,
    path: string | undefined,
    filters: QueryFilters,
    format: QueryOutputFormat,
    countOnly: boolean,
    context: CommandContext,
): Promise<void> {
    await runDirect(
        () => executeQuery(type, path, filters),
        context,
        {
            exitCode: () => 0,
            json: (r) => {
                if (countOnly) return { count: r.count };
                return format === 'json' ? JSON.parse(formatAsJson(r)) : r;
            },
            quiet: (r) => {
                if (countOnly) return String(r.count);
                if (format === 'yaml') {
                    return formatAsYaml(r);
                }
                // Simple text output for quiet mode
                return r.results.map((item) => item.name).join('\n');
            },
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper to create filter options from args.
 */
function buildFilters(args: QueryArgs): QueryFilters {
    return {
        name: args.name,
        fqn: args.fqn,
        domain: args.domain,
        team: args.team,
        classification: args.classification,
        metadata: args.metadata,
    };
}

/**
 * All accepted type values for the positional argument.
 * Includes canonical names and their shorter/longer aliases.
 */
const ENTITY_TYPE_CHOICES = [
    'domains',
    'bcs', 'bounded-contexts', 'contexts',
    'teams',
    'classifications',
    'relationships', 'rels',
    'context-maps', 'cmaps',
    'domain-maps', 'dmaps',
] as const;

/**
 * Human-readable labels for entity types (used in help text).
 */
const ENTITY_TYPE_HELP = [
    'domains',
    'bcs (or bounded-contexts, contexts)',
    'teams',
    'classifications',
    'relationships (or rels)',
    'context-maps (or cmaps)',
    'domain-maps (or dmaps)',
].join(', ');

/**
 * Query command module for yargs.
 *
 * Syntax: `dlang query <type> [path]`
 *
 * The `<type>` positional accepts canonical names and short aliases
 * (e.g. `bcs`, `bounded-contexts`, and `contexts` all query bounded contexts).
 * `[path]` is optional and defaults to the current working directory.
 */
export const queryCommand: CommandModule<object, QueryArgs> = {
    command: 'query <type> [path]',
    describe: 'Query DomainLang models',
    builder: (yargs: Argv) => {
        return yargs
            .positional('type', {
                describe: `Entity type: ${ENTITY_TYPE_HELP}`,
                type: 'string',
                choices: ENTITY_TYPE_CHOICES,
                demandOption: true,
            })
            .positional('path', {
                describe: 'Path to .dlang file or workspace directory (defaults to cwd)',
                type: 'string',
            })
            .option('format', {
                alias: 'f',
                describe: 'Output format',
                type: 'string',
                choices: ['table', 'json', 'yaml'] as const,
                default: 'table' as const,
            })
            .option('count', {
                describe: 'Print only the number of matching results',
                type: 'boolean',
                default: false,
            })
            .option('name', {
                alias: 'n',
                describe: 'Filter by name (supports regex)',
                type: 'string',
            })
            .option('fqn', {
                describe: 'Filter by fully qualified name',
                type: 'string',
            })
            .option('domain', {
                alias: 'd',
                describe: 'Filter bounded contexts by domain',
                type: 'string',
            })
            .option('team', {
                alias: 't',
                describe: 'Filter bounded contexts by team',
                type: 'string',
            })
            .option('classification', {
                alias: ['c', 'role'],
                describe: 'Filter bounded contexts by classification (role)',
                type: 'string',
            })
            .option('metadata', {
                alias: 'm',
                describe: 'Filter bounded contexts by metadata (key=value)',
                type: 'string',
            })
            .example('$0 query domains', 'List all domains')
            .example('$0 query domains ./my-project', 'List domains in a directory')
            .example('$0 query bcs --domain Sales', 'Bounded contexts in Sales')
            .example('$0 query bcs -c Core -f json', 'Core BCs as JSON')
            .example('$0 query rels', 'List all relationships')
            .example('$0 query bcs --count', 'Count bounded contexts') as Argv<QueryArgs>;
    },
    handler: async (argv) => {
        const entityType = normalizeEntityType(argv.type);
        const filters = buildFilters(argv);
        const format = argv.format ?? 'table';
        const countOnly = argv.count ?? false;

        await runCommand(argv, {
            ink: (_args, ctx) => (
                <QueryComponent
                    type={entityType}
                    path={argv.path}
                    filters={filters}
                    format={format}
                    countOnly={countOnly}
                    context={ctx}
                />
            ),
            direct: (_args, ctx) => runQuery(entityType, argv.path, filters, format, countOnly, ctx),
        });
    },
};
