/**
 * LSP Custom Request Handlers for VS Code Language Model Tools (PRS-015)
 * 
 * These handlers respond to custom LSP requests from the VS Code extension
 * and return serialized model data suitable for Language Model Tools.
 * 
 * Architecture:
 * - Extension calls `client.sendRequest('domainlang/validate', params)`
 * - LSP receives via `connection.onRequest('domainlang/validate', handler)`
 * - Handler uses SDK `fromServices()` for zero-copy AST access
 * - Handler returns plain JSON (no circular refs, no class instances)
 * 
 * @module lsp/tool-handlers
 */

import type { Connection } from 'vscode-languageserver';
import type { LangiumDocument } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import { URI } from 'langium';
import type { DomainLangServices } from '../domain-lang-module.js';
import { fromDocument } from '../sdk/query.js';
import type { Query } from '../sdk/types.js';
import {
    serializeNode,
    serializeRelationship,
    normalizeEntityType,
} from '../sdk/serializers.js';
import type { QueryEntityType, QueryFilters } from '../sdk/serializers.js';
import type { Model } from '../generated/ast.js';

// ─────────────────────────────────────────────────────────────────────────────
// Request/Response Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request parameters for domainlang/validate.
 * No parameters needed - validates entire workspace.
 */
export interface ValidateParams {
    /** Optional: filter by file URI */
    file?: string;
}

/**
 * Response from domainlang/validate.
 */
export interface ValidateResponse {
    /** Total number of validation diagnostics */
    count: number;
    /** Validation diagnostics grouped by severity */
    diagnostics: {
        errors: DiagnosticInfo[];
        warnings: DiagnosticInfo[];
        info: DiagnosticInfo[];
    };
}

/**
 * Diagnostic information for validation response.
 */
export interface DiagnosticInfo {
    /** File URI */
    file: string;
    /** Line number (1-indexed) */
    line: number;
    /** Column number (1-indexed) */
    column: number;
    /** Diagnostic message */
    message: string;
    /** Severity level */
    severity: 'error' | 'warning' | 'info';
    /** Optional diagnostic code */
    code?: string | number;
}

/**
 * Request parameters for domainlang/list.
 */
export interface ListParams {
    /** Entity type to query */
    type: string;
    /** Optional filters */
    filters?: QueryFilters;
}

/**
 * Response from domainlang/list.
 */
export interface ListResponse {
    /** Entity type queried */
    entityType: QueryEntityType;
    /** Number of results */
    count: number;
    /** Serialized results */
    results: Record<string, unknown>[];
}

/**
 * Request parameters for domainlang/get.
 */
export interface GetParams {
    /** Fully qualified name of element to retrieve */
    fqn?: string;
    /** If true, return model summary instead of single element */
    summary?: boolean;
}

/**
 * Response from domainlang/get.
 */
export interface GetResponse {
    /** Serialized element or model summary */
    result: Record<string, unknown> | null;
}

/**
 * Request parameters for domainlang/explain.
 */
export interface ExplainParams {
    /** Fully qualified name of element to explain */
    fqn: string;
}

/**
 * Response from domainlang/explain.
 */
export interface ExplainResponse {
    /** Rich markdown explanation */
    explanation: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers all custom request handlers on the LSP connection.
 * Call this from main.ts after creating the connection.
 * 
 * @param connection - LSP connection
 * @param services - Object containing shared and DomainLang services
 */
export function registerToolHandlers(
    connection: Connection,
    services: { shared: LangiumSharedServices; DomainLang: DomainLangServices }
): void {
    connection.onRequest('domainlang/validate', async (params: ValidateParams) => {
        return handleValidate(params, services.shared);
    });

    connection.onRequest('domainlang/list', async (params: ListParams) => {
        return handleList(params, services.shared);
    });

    connection.onRequest('domainlang/get', async (params: GetParams) => {
        return handleGet(params, services.shared);
    });

    connection.onRequest('domainlang/explain', async (params: ExplainParams) => {
        return handleExplain(params, services);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler Implementations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles domainlang/validate requests.
 * Aggregates all validation diagnostics from the workspace.
 */
async function handleValidate(
    params: ValidateParams,
    sharedServices: LangiumSharedServices
): Promise<ValidateResponse> {
    const langiumDocs = sharedServices.workspace.LangiumDocuments;
    const documents = params.file
        ? [langiumDocs.getDocument(URI.parse(params.file))]
        : Array.from(langiumDocs.all);

    const errors: DiagnosticInfo[] = [];
    const warnings: DiagnosticInfo[] = [];
    const info: DiagnosticInfo[] = [];

    for (const doc of documents) {
        if (!doc) continue;

        const diagnostics = doc.diagnostics ?? [];
        for (const diag of diagnostics) {
            const diagInfo: DiagnosticInfo = {
                file: doc.uri.toString(),
                line: diag.range.start.line + 1, // 1-indexed
                column: diag.range.start.character + 1, // 1-indexed
                message: diag.message,
                severity: severityToString(diag.severity ?? 1),
                code: diag.code,
            };

            if (diag.severity === 1) {
                errors.push(diagInfo);
            } else if (diag.severity === 2) {
                warnings.push(diagInfo);
            } else {
                info.push(diagInfo);
            }
        }
    }

    return {
        count: errors.length + warnings.length + info.length,
        diagnostics: { errors, warnings, info },
    };
}

/**
 * Handles domainlang/list requests.
 * Queries entities of a specific type and returns serialized results.
 */
async function handleList(
    params: ListParams,
    sharedServices: LangiumSharedServices
): Promise<ListResponse> {
    const entityType = normalizeEntityType(params.type);
    const filters = params.filters ?? {};

    // Get all documents and merge results
    const langiumDocs = sharedServices.workspace.LangiumDocuments;
    const documents = Array.from(langiumDocs.all);

    const allResults: Record<string, unknown>[] = [];
    const seen = new Set<string>(); // Deduplicate by FQN

    for (const doc of documents) {
        const query = fromDocument(doc as LangiumDocument<Model>);
        const results = executeListQuery(query, entityType, filters);

        for (const result of results) {
            const fqn = result.fqn as string | undefined;
            if (fqn && seen.has(fqn)) continue;
            if (fqn) seen.add(fqn);
            allResults.push(result);
        }
    }

    return {
        entityType,
        count: allResults.length,
        results: allResults,
    };
}

/**
 * Handles domainlang/get requests.
 * Retrieves a single element by FQN or returns a model summary.
 */
async function handleGet(
    params: GetParams,
    sharedServices: LangiumSharedServices
): Promise<GetResponse> {
    if (params.summary) {
        return { result: await getModelSummary(sharedServices) };
    }

    if (!params.fqn) {
        return { result: null };
    }

    // Search all documents for the element
    const langiumDocs = sharedServices.workspace.LangiumDocuments;
    const documents = Array.from(langiumDocs.all);

    for (const doc of documents) {
        const query = fromDocument(doc as LangiumDocument<Model>);
        const element = query.byFqn(params.fqn);
        if (element) {
            return { result: serializeNode(element, query) };
        }
    }

    return { result: null };
}

/**
 * Handles domainlang/explain requests.
 * Returns rich markdown explanation of a model element.
 */
async function handleExplain(
    params: ExplainParams,
    services: { shared: LangiumSharedServices; DomainLang: DomainLangServices }
): Promise<ExplainResponse> {
    // Import explain function here to avoid circular dependency
    const { generateExplanation } = await import('./explain.js');

    const langiumDocs = services.shared.workspace.LangiumDocuments;
    const documents = Array.from(langiumDocs.all);

    for (const doc of documents) {
        const query = fromDocument(doc as LangiumDocument<Model>);
        const element = query.byFqn(params.fqn);
        if (element) {
            const explanation = generateExplanation(element, services);
            return { explanation };
        }
    }

    return {
        explanation: `Element not found: ${params.fqn}`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes a list query for a specific entity type.
 */
function executeListQuery(
    query: Query,
    entityType: QueryEntityType,
    filters: QueryFilters
): Record<string, unknown>[] {
    switch (entityType) {
        case 'domains': {
            let builder = query.domains();
            if (filters.name) builder = builder.withName(filters.name);
            if (filters.fqn) builder = builder.withFqn(filters.fqn);
            return builder.toArray().map((d) => serializeNode(d, query));
        }
        case 'bcs': {
            let builder = query.boundedContexts();
            if (filters.domain) builder = builder.inDomain(filters.domain);
            if (filters.team) builder = builder.withTeam(filters.team);
            if (filters.classification)
                builder = builder.withClassification(filters.classification);
            if (filters.metadata) {
                const [key, value] = filters.metadata.split('=');
                builder = builder.withMetadata(key, value);
            }
            if (filters.name) builder = builder.withName(filters.name) as ReturnType<Query['boundedContexts']>;
            if (filters.fqn) builder = builder.withFqn(filters.fqn) as ReturnType<Query['boundedContexts']>;
            return builder.toArray().map((bc) => serializeNode(bc, query));
        }
        case 'teams': {
            let builder = query.teams();
            if (filters.name) builder = builder.withName(filters.name);
            return builder.toArray().map((t) => serializeNode(t, query));
        }
        case 'classifications': {
            let builder = query.classifications();
            if (filters.name) builder = builder.withName(filters.name);
            return builder.toArray().map((c) => serializeNode(c, query));
        }
        case 'relationships': {
            const rels = query.relationships().toArray();
            return rels.map((r) => serializeRelationship(r));
        }
        case 'context-maps': {
            let builder = query.contextMaps();
            if (filters.name) builder = builder.withName(filters.name);
            return builder.toArray().map((cm) => serializeNode(cm, query));
        }
        case 'domain-maps': {
            let builder = query.domainMaps();
            if (filters.name) builder = builder.withName(filters.name);
            return builder.toArray().map((dm) => serializeNode(dm, query));
        }
        default:
            return [];
    }
}

/**
 * Generates a model summary with counts of major entities.
 */
async function getModelSummary(
    sharedServices: LangiumSharedServices
): Promise<Record<string, unknown>> {
    const langiumDocs = sharedServices.workspace.LangiumDocuments;
    const documents = Array.from(langiumDocs.all);

    let domains = 0;
    let bcs = 0;
    let teams = 0;
    let classifications = 0;
    let relationships = 0;
    let contextMaps = 0;
    let domainMaps = 0;

    for (const doc of documents) {
        const query = fromDocument(doc as LangiumDocument<Model>);
        domains += query.domains().count();
        bcs += query.boundedContexts().count();
        teams += query.teams().count();
        classifications += query.classifications().count();
        relationships += query.relationships().count();
        contextMaps += query.contextMaps().count();
        domainMaps += query.domainMaps().count();
    }

    return {
        $type: 'ModelSummary',
        documentCount: documents.length,
        domains,
        boundedContexts: bcs,
        teams,
        classifications,
        relationships,
        contextMaps,
        domainMaps,
    };
}

/**
 * Converts diagnostic severity number to string.
 */
function severityToString(severity: number): 'error' | 'warning' | 'info' {
    switch (severity) {
        case 1:
            return 'error';
        case 2:
            return 'warning';
        default:
            return 'info';
    }
}
