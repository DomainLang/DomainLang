/**
 * AST Serialization Utilities
 * 
 * Converts Langium AST nodes to plain JSON objects suitable for:
 * - LSP custom requests (JSON-RPC transport)
 * - MCP tool responses (stdio JSON)
 * - CLI output (JSON/YAML formats)
 * 
 * ## Strategy
 * 
 * Rather than maintaining a parallel DTO type hierarchy (DomainDto, BoundedContextDto, etc.),
 * we use a **generic serializer** that:
 * - Strips Langium internal properties ($container, $cstNode, $document)
 * - Preserves $type for discriminated output
 * - Resolves Reference<T> to referenced name strings
 * - Resolves MultiReference<T> to arrays of names
 * - Recursively serializes child AstNodes
 * - Adds FQN for named elements via Query
 * 
 * For types with SDK-augmented properties (computed values not on raw AST),
 * use augmentation functions that enrich the generic output.
 * 
 * @packageDocumentation
 */

import type { AstNode, Reference } from 'langium';
import { isAstNode, isReference } from 'langium';
import type { Query, RelationshipView } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical entity types that can be queried.
 * Moved from CLI to SDK for sharing with LSP tools.
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
 * Query filter options.
 * Moved from CLI to SDK for sharing with LSP tools.
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
 * Map of entity type aliases to their canonical form.
 */
export const ENTITY_ALIASES: Record<string, QueryEntityType> = {
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

// ─────────────────────────────────────────────────────────────────────────────
// Generic AST Serialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize any Langium AST node to a plain JSON object.
 * 
 * - Strips $-prefixed internal properties ($container, $cstNode, $document)
 * - Preserves $type for discriminated output
 * - Resolves Reference<T> to the referenced name (string)
 * - Resolves MultiReference<T> to an array of names
 * - Recursively serializes child AstNode properties
 * - Serializes arrays of AstNodes/values
 * - Adds FQN for named elements
 * 
 * @param node - AST node to serialize
 * @param query - Query instance for FQN resolution
 * @returns Plain JSON object
 */
export function serializeNode(node: AstNode, query: Query): Record<string, unknown> {
    const result: Record<string, unknown> = { $type: node.$type };
    
    for (const [key, value] of Object.entries(node)) {
        // Skip Langium internals (but preserve $type)
        if (key.startsWith('$') && key !== '$type') {
            continue;
        }
        
        if (isReference(value)) {
            // Reference<T> → name string
            const ref = value.ref;
            result[key] = (ref && 'name' in ref) ? (ref as { name?: string }).name : value.$refText;
        } else if (isAstNode(value)) {
            // Nested AstNode → recurse
            result[key] = serializeNode(value, query);
        } else if (Array.isArray(value)) {
            // Array → map each item
            result[key] = value.map(item => {
                if (isReference(item)) {
                    const itemRef = item.ref;
                    return (itemRef && 'name' in itemRef) ? (itemRef as { name?: string }).name : item.$refText;
                } else if (isAstNode(item)) {
                    return serializeNode(item, query);
                } else {
                    return item; // primitive
                }
            });
        } else {
            // Primitives pass through
            result[key] = value;
        }
    }
    
    // Always include FQN for named elements
    if ('name' in node && typeof (node as { name?: unknown }).name === 'string') {
        result.fqn = query.fqn(node);
    }
    
    return result;
}

/**
 * Augment a serialized RelationshipView with computed properties.
 * 
 * RelationshipView is already a clean DTO (not an AstNode), but we format it
 * consistently with other serialized types.
 * 
 * @param view - RelationshipView from query.relationships()
 * @returns Serialized relationship object
 */
export function serializeRelationship(view: RelationshipView): Record<string, unknown> {
    const leftName = view.left.context.name;
    const rightName = view.right.context.name;
    if (view.type === 'symmetric') {
        const patternDisplay = view.kind === 'SeparateWays' ? '><' : `[${view.kind}]`;
        return {
            type: 'symmetric',
            name: `${leftName} ${patternDisplay} ${rightName}`,
            left: leftName,
            right: rightName,
            kind: view.kind,
            source: view.source,
        };
    }
    return {
        type: 'directional',
        kind: view.kind,
        name: `${leftName} ${view.arrow} ${rightName}`,
        left: leftName,
        right: rightName,
        arrow: view.arrow,
        leftPatterns: view.left.patterns.map(p => p.$type),
        rightPatterns: view.right.patterns.map(p => p.$type),
        upstreamPatterns: view.upstream?.patterns.map(p => p.$type),
        downstreamPatterns: view.downstream?.patterns.map(p => p.$type),
        source: view.source,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Resolve Reference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a Reference<T> to its name string.
 * Returns undefined if reference is unresolved.
 * 
 * @param ref - Reference to resolve
 * @returns Referenced name or undefined
 */
export function resolveName<T extends AstNode & { name?: string }>(ref: Reference<T> | undefined): string | undefined {
    if (!ref) return undefined;
    return ref.ref?.name ?? ref.$refText;
}

/**
 * Resolve a MultiReference (array of items with refs) to an array of names.
 * Filters out unresolved references.
 * 
 * @param multiRef - Array of items with ref property
 * @returns Array of resolved names
 */
export function resolveMultiReference<T extends { ref?: Reference<AstNode & { name?: string }> }>(
    multiRef: T[] | undefined
): string[] {
    if (!multiRef) return [];
    return multiRef
        .map(item => item.ref?.ref?.name)
        .filter((name): name is string => name !== undefined);
}
