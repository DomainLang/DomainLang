/**
 * Type definitions for the Model Query SDK.
 * Provides interfaces for fluent query operations on DomainLang models.
 */

import type { AstNode, URI } from 'langium';
import type {
    BoundedContext,
    Classification,
    ContextMap,
    Domain,
    DomainMap,
    Model,
    NamespaceDeclaration,
    Relationship,
    SidePattern,
    Team,
} from '../generated/ast.js';
import type { DomainLangServices } from '../domain-lang-module.js';

// Import augmentation module for extended AST types
// This enables native SDK properties on BoundedContext, Domain, and Relationship
import './ast-augmentation.js';

/**
 * Context returned from loadModel functions.
 * Contains the parsed model, document URIs, and query API.
 */
export interface QueryContext {
    /** Root model node */
    readonly model: Model;
    /** URIs of all documents in the model (including imports) */
    readonly documents: URI[];
    /** Query API for model traversal */
    readonly query: Query;
}

/**
 * Options for loading models from files or text.
 */
export interface LoadOptions {
    /** Workspace directory for resolving relative imports */
    workspaceDir?: string;
    /** Reuse existing Langium services instead of creating new ones */
    services?: DomainLangServices;
}

/**
 * Main query interface for model traversal.
 * Provides O(1) lookups and fluent collection queries.
 */
export interface Query {
    /**
     * Returns all domains in the model as a chainable query.
     * @returns QueryBuilder for domains
     * @example
     * ```typescript
      * const coreDomains = query.domains()
      *   .where(d => d.type?.ref?.name === 'Core');
     * ```
     */
    domains(): QueryBuilder<Domain>;

    /**
     * Returns all bounded contexts in the model as a chainable query.
     * @returns BcQueryBuilder with context-specific filters
     * @example
     * ```typescript
     * const contexts = query.boundedContexts()
    *   .withClassification('Core')
     *   .withTeam('PaymentTeam');
     * ```
     */
    boundedContexts(): BcQueryBuilder;

    /**
     * Returns all teams in the model as a chainable query.
     * @returns QueryBuilder for teams
     */
    teams(): QueryBuilder<Team>;

    /**
     * Returns all classifications in the model as a chainable query.
     * @returns QueryBuilder for classifications
     */
    classifications(): QueryBuilder<Classification>;

    /**
     * Returns all relationships as a chainable query.
     * Includes relationships from both BoundedContext blocks and ContextMap.
     * @returns QueryBuilder for relationships
     */
    relationships(): QueryBuilder<RelationshipView>;

    /**
     * Returns all context maps in the model as a chainable query.
     * @returns QueryBuilder for context maps
     */
    contextMaps(): QueryBuilder<ContextMap>;

    /**
     * Returns all domain maps in the model as a chainable query.
     * @returns QueryBuilder for domain maps
     */
    domainMaps(): QueryBuilder<DomainMap>;

    /**
     * Returns all namespace declarations in the model as a chainable query.
     * @returns QueryBuilder for namespaces
     */
    namespaces(): QueryBuilder<NamespaceDeclaration>;

    /**
     * Finds any AST node by its fully qualified name.
     * @param fqn - Fully qualified name (e.g., 'Sales.OrderContext')
     * @returns The node or undefined if not found
     * @example
     * ```typescript
     * const bc = query.byFqn<BoundedContext>('Sales.OrderContext');
     * ```
     */
    byFqn<T extends AstNode = AstNode>(fqn: string): T | undefined;

    /**
     * Finds a domain by simple name or FQN.
     * @param name - Domain name
     * @returns The domain or undefined if not found
     */
    domain(name: string): Domain | undefined;

    /**
     * Finds a bounded context by simple name or FQN.
     * @param name - Bounded context name
     * @returns The bounded context or undefined if not found
     */
    boundedContext(name: string): BoundedContext | undefined;

    /**
     * Alias for boundedContext() - shorthand for convenience.
     * @param name - Bounded context name
     * @returns The bounded context or undefined if not found
     */
    bc(name: string): BoundedContext | undefined;

    /**
     * Finds a team by simple name.
     * @param name - Team name
     * @returns The team or undefined if not found
     */
    team(name: string): Team | undefined;

    /**
     * Computes the fully qualified name for any AST node.
     * @param node - AST node
     * @returns Fully qualified name (e.g., 'Sales.OrderContext')
     */
    fqn(node: AstNode): string;
}

/**
 * Fluent query builder supporting lazy iteration and chaining.
 * Terminal operations materialize the results.
 */
export interface QueryBuilder<T> extends Iterable<T> {
    /**
     * Filters items by a predicate function.
     * Chains without materializing intermediate results.
     * @param predicate - Function that returns true for items to include
     * @returns New QueryBuilder with combined filters
     * @example
     * ```typescript
     * query.domains()
     *   .where(d => d.parent !== undefined)
     *   .where(d => d.classification?.name === 'Core');
     * ```
     */
    where(predicate: (item: T) => boolean): QueryBuilder<T>;

    /**
     * Filters by simple name or regex pattern.
     * @param pattern - String or RegExp to match against name
     * @returns New QueryBuilder with name filter
     * @example
     * ```typescript
     * query.domains().withName(/^Sales/);
     * ```
     */
    withName(pattern: string | RegExp): QueryBuilder<T>;

    /**
     * Filters by fully qualified name or regex pattern.
     * @param pattern - String or RegExp to match against FQN
     * @returns New QueryBuilder with FQN filter
     * @example
     * ```typescript
     * query.boundedContexts().withFqn('Sales.OrderContext');
     * ```
     */
    withFqn(pattern: string | RegExp): QueryBuilder<T>;

    /**
     * Returns the first item or undefined if no items match.
     * Terminal operation.
     * @returns First matching item or undefined
     */
    first(): T | undefined;

    /**
     * Materializes all items into an array.
     * Terminal operation.
     * @returns Array of all matching items
     */
    toArray(): T[];

    /**
     * Counts items without materializing.
     * Terminal operation.
     * @returns Number of matching items
     */
    count(): number;

    /**
     * Iterator for lazy evaluation.
     * Allows use in for...of loops and spread operators.
     */
    [Symbol.iterator](): Iterator<T>;
}

/**
 * Specialized query builder for BoundedContext with domain-specific filters.
 * Extends base QueryBuilder with context-aware methods.
 */
export interface BcQueryBuilder extends QueryBuilder<BoundedContext> {
    /**
     * Filters contexts belonging to a specific domain.
     * @param domain - Domain name or Domain instance
     * @returns New BcQueryBuilder with domain filter
     * @example
     * ```typescript
     * query.boundedContexts().inDomain('Sales');
     * ```
     */
    inDomain(domain: string | Domain): BcQueryBuilder;

    /**
     * Filters contexts assigned to a specific team.
     * Uses SDK-resolved team property (header inline or block).
     * @param team - Team name or Team instance
     * @returns New BcQueryBuilder with team filter
     * @example
     * ```typescript
     * query.boundedContexts().withTeam('PaymentTeam');
     * ```
     */
    withTeam(team: string | Team): BcQueryBuilder;

    /**
     * Filters contexts with a specific strategic classification.
     * Uses SDK-resolved classification precedence (header inline `as` → body `classification:`).
     * @param classification - Classification name or Classification instance
     * @returns New BcQueryBuilder with classification filter
     * @example
     * ```typescript
     * query.boundedContexts().withClassification('Core');
     * ```
     */
    withClassification(classification: string | Classification): BcQueryBuilder;

    /**
     * Filters contexts with specific metadata key-value pair.
     * @param key - Metadata key
     * @param value - Optional metadata value (if omitted, matches any value)
     * @returns New BcQueryBuilder with metadata filter
     * @example
     * ```typescript
     * query.boundedContexts()
     *   .withMetadata('Language', 'TypeScript')
     *   .withMetadata('Framework'); // Any framework
     * ```
     */
    withMetadata(key: string, value?: string): BcQueryBuilder;
}

/**
 * One side of a relationship: the bounded context and its annotated integration patterns.
 * For symmetric relationships `patterns` is always empty — the pattern lives on the relationship itself.
 */
export interface RelationshipSide {
    /** The bounded context on this side */
    readonly context: BoundedContext;
    /** Integration patterns annotated on this side (directional relationships only) */
    readonly patterns: readonly SidePattern[];
}

/**
 * DDD kind of a directional relationship.
 * Fully discriminates all three structural cases.
 */
export type DirectionalKind = 'UpstreamDownstream' | 'CustomerSupplier' | 'Bidirectional';

/**
 * Directional relationship: has an arrow expressing dependency between two contexts.
 * Discriminate on `type` to access directional or symmetric properties.
 * Discriminate on `kind` to handle upstream/downstream vs customer/supplier vs bidirectional.
 */
export interface DirectionalRelationshipView {
    readonly type: 'directional';
    /** DDD semantic kind — determines which roles each side plays */
    readonly kind: DirectionalKind;
    /** Arrow as written in source (use for display/serialization) */
    readonly arrow: '->' | '<-' | '<->';
    /** Left side as written in source — always defined */
    readonly left: RelationshipSide;
    /** Right side as written in source — always defined */
    readonly right: RelationshipSide;
    /**
     * The upstream (provider) side with its patterns.
     * Defined when `kind` is `'UpstreamDownstream'` or `'CustomerSupplier'`.
     * `undefined` when `kind` is `'Bidirectional'` — no upstream role exists.
     */
    readonly upstream: RelationshipSide | undefined;
    /**
     * The downstream (consumer) side with its patterns.
     * Defined when `kind` is `'UpstreamDownstream'` or `'CustomerSupplier'`.
     * `undefined` when `kind` is `'Bidirectional'` — no downstream role exists.
     */
    readonly downstream: RelationshipSide | undefined;
    /** Source of the relationship definition */
    readonly source: 'BoundedContext' | 'ContextMap';
    /** Original AST relationship node */
    readonly astNode: Relationship;
}

/** Resolved symmetric integration pattern kind. */
export type SymmetricKind = 'SharedKernel' | 'Partnership' | 'SeparateWays';

/**
 * Symmetric relationship: no arrow; neither context is upstream or downstream.
 * Discriminate on `type` to access directional or symmetric properties.
 */
export interface SymmetricRelationshipView {
    readonly type: 'symmetric';
    /**
     * Always-resolved symmetric integration pattern.
     * `><` resolves to `'SeparateWays'`.
     */
    readonly kind: SymmetricKind;
    /**
     * Left side as written in source.
     * `patterns` is always empty — symmetric patterns attach to the relationship, not each side.
     */
    readonly left: RelationshipSide;
    /**
     * Right side as written in source.
     * `patterns` is always empty — symmetric patterns attach to the relationship, not each side.
     */
    readonly right: RelationshipSide;
    /** Source of the relationship definition */
    readonly source: 'BoundedContext' | 'ContextMap';
    /** Original AST relationship node */
    readonly astNode: Relationship;
}

/**
 * Unified view of a relationship between two BoundedContexts.
 * Relationships can be defined in BoundedContext blocks or ContextMap.
 * Discriminate on `type` to access directional or symmetric properties.
 *
 * @example
 * ```typescript
 * for (const rel of query.relationships()) {
 *   if (rel.type === 'symmetric') {
 *     console.log(rel.kind); // 'SharedKernel' | 'Partnership' | 'SeparateWays'
 *   } else {
 *     console.log(rel.kind);  // 'UpstreamDownstream' | 'CustomerSupplier' | 'Bidirectional'
 *     console.log(rel.arrow); // '->' | '<-' | '<->'
 *   }
 * }
 * ```
 */
export type RelationshipView = DirectionalRelationshipView | SymmetricRelationshipView;

/**
 * Internal index structure for O(1) lookups.
 * Not exported from public API.
 */
export interface ModelIndexes {
    /** Map from FQN to AST node */
    readonly byFqn: ReadonlyMap<string, AstNode>;
    /** Map from simple name to AST nodes (may have duplicates) */
    readonly byName: ReadonlyMap<string, AstNode[]>;
    /** Map from team name to BoundedContexts */
    readonly byTeam: ReadonlyMap<string, BoundedContext[]>;
    /** Map from strategic classification name to BoundedContexts */
    readonly byClassification: ReadonlyMap<string, BoundedContext[]>;
    /** Map from metadata key to BoundedContexts */
    readonly byMetadataKey: ReadonlyMap<string, BoundedContext[]>;
}
