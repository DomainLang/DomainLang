import type { LangiumDocument } from 'langium';
import type { SGraph, SModelElement, SModelRoot, SEdge, SNode } from 'sprotty-protocol';
import { LangiumDiagramGenerator, type GeneratorContext } from 'langium-sprotty';
import { fromDocument } from '../sdk/query.js';
import type { Query } from '../sdk/types.js';
import type { BoundedContext, ContextMap, Model, Relationship } from '../generated/ast.js';

/** Ellipse sizing for bounded context nodes — sized for long names like "CustomerManagementContext" */
const NODE_WIDTH = 280;
const NODE_HEIGHT = 100;

/**
 * Maps long-form DomainLang integration pattern keywords to their standard
 * DDD abbreviations for display in U/D badges.
 */
const PATTERN_ABBREVIATIONS: Readonly<Record<string, string>> = {
    OpenHostService: 'OHS',
    PublishedLanguage: 'PL',
    AntiCorruptionLayer: 'ACL',
    Conformist: 'CF',
    Partnership: 'P',
    SharedKernel: 'SK',
    BigBallOfMud: 'BBoM',
};

/**
 * Returns the abbreviated form of an integration pattern keyword.
 *
 * Short forms (e.g. `OHS`, `ACL`) are returned unchanged.  Long forms (e.g.
 * `OpenHostService`, `AntiCorruptionLayer`) are mapped to their abbreviation.
 */
function normalizePattern(pattern: string): string {
    return PATTERN_ABBREVIATIONS[pattern] ?? pattern;
}

/**
 * Returns `true` when the pattern identifies a Big Ball of Mud participant.
 *
 * BBoM is surfaced as a cloud node shape on the bounded context itself, not as
 * a text annotation in the edge badge, so it should be excluded from badge text.
 */
function isBBoMPattern(pattern: string): boolean {
    return pattern === 'BBoM' || pattern === 'BigBallOfMud';
}

interface DiagramSelection {
    selectedContextMapFqn?: string;
    selectedContextMapName?: string;
}

interface RelationshipEdgeParams {
    leftNode: SNode;
    rightNode: SNode;
    arrow: string;
    leftPatterns: readonly string[];
    rightPatterns: readonly string[];
    type: string | undefined;
    astNode: Relationship;
}

/**
 * Generates context map diagrams in the **DDD community notation** style.
 *
 * Bounded contexts are rendered as ellipses. Relationships are rendered as edges
 * with U/D (upstream/downstream) annotations and integration pattern labels at
 * each end, matching the notation used in Eric Evans' "Domain-Driven Design" and
 * Vaughn Vernon's "Implementing Domain-Driven Design".
 *
 * Edge label convention:
 *   - Position 0.1 (near source): `U [OHS, PL]` or `D [ACL]`
 *   - Position 0.9 (near target): `D [CF]` or `U [OHS]`
 *   - Position 0.5 (center): relationship type (e.g., "Customer/Supplier")
 */
export class DomainLangContextMapDiagramGenerator extends LangiumDiagramGenerator {
    protected override generateRoot(args: GeneratorContext): SModelRoot {
        const document = args.document as LangiumDocument<Model>;
        const query = fromDocument(document);
        const selection = this.getSelection(args);
        const contextMaps = query.contextMaps().toArray();

        const selectedMap = this.selectContextMap(contextMaps, query, selection);
        if (!selectedMap) {
            return {
                type: 'graph',
                id: args.idCache.uniqueId('context-map:empty'),
                children: [],
            } satisfies SGraph;
        }

        // Fetch relationships first so the BBoM pre-pass can identify which BCs
        // need the cloud node shape before any nodes are created.
        const relationships = query.relationships()
            .where((relationship) => relationship.source === 'ContextMap' && relationship.astNode.$container === selectedMap)
            .toArray();

        // BBoM pre-pass: collect the node keys of every bounded context that
        // appears on a side annotated with the BigBallOfMud pattern.  These get
        // the `node:bbom` Sprotty type so the webview renders them as clouds.
        const bboMNodeKeys = new Set<string>();
        for (const rel of relationships) {
            if (rel.leftPatterns.some(isBBoMPattern)) {
                bboMNodeKeys.add(this.getNodeKey(query, rel.left));
            }
            if (rel.rightPatterns.some(isBBoMPattern)) {
                bboMNodeKeys.add(this.getNodeKey(query, rel.right));
            }
        }

        const nodeMap = new Map<string, SNode>();
        this.collectContextMapNodes(selectedMap, query, nodeMap, bboMNodeKeys, args);

        for (const relationship of relationships) {
            this.ensureNode(nodeMap, query, relationship.left, bboMNodeKeys, args);
            this.ensureNode(nodeMap, query, relationship.right, bboMNodeKeys, args);
        }

        const edges = relationships.flatMap((relationship) => {
            const leftKey = this.getNodeKey(query, relationship.left);
            const rightKey = this.getNodeKey(query, relationship.right);
            const leftNode = nodeMap.get(leftKey);
            const rightNode = nodeMap.get(rightKey);

            if (!leftNode || !rightNode) {
                return [];
            }

            return this.createRelationshipEdge({
                leftNode,
                rightNode,
                arrow: relationship.arrow,
                leftPatterns: relationship.leftPatterns,
                rightPatterns: relationship.rightPatterns,
                type: relationship.type,
                astNode: relationship.astNode,
            }, args);
        });

        return {
            type: 'graph',
            id: args.idCache.uniqueId(`context-map:${selectedMap.name}`, selectedMap),
            children: [...nodeMap.values(), ...edges],
        } satisfies SGraph;
    }

    // ── Relationship edges (DDD community notation) ──

    /**
     * Creates an edge with DDD community notation labels.
     *
     * For `->`: left = Upstream (U), right = Downstream (D)
     * For `<-`: left = Downstream (D), right = Upstream (U)
     * For `<->`: Partnership (bidirectional)
     * For `><`: Separate Ways
     *
     * U/D labels are rendered as DDD notation badges with optional
     * pattern boxes (e.g., `U [OHS, PL]`).
     */
    private createRelationshipEdge(
        params: RelationshipEdgeParams,
        args: GeneratorContext
    ): SEdge[] {
        const { leftNode, rightNode, arrow, leftPatterns, rightPatterns, type, astNode } = params;
        // Determine source/target based on arrow direction
        const sourceId = arrow === '<-' ? rightNode.id : leftNode.id;
        const targetId = arrow === '<-' ? leftNode.id : rightNode.id;

        const edgeId = args.idCache.uniqueId(
            `edge:${sourceId}:${targetId}`,
            astNode
        );

        const children: SModelElement[] = [];

        if (arrow === '<->') {
            // Partnership / bidirectional — no U/D roles
            this.addUDBadge(children, edgeId, 'source', leftPatterns, undefined, args);
            this.addUDBadge(children, edgeId, 'target', rightPatterns, undefined, args);
        } else if (arrow === '><') {
            // Separate Ways — no U/D, no patterns
        } else {
            // Unidirectional: -> or <-
            const sourcePatterns = arrow === '<-' ? rightPatterns : leftPatterns;
            const targetPatterns = arrow === '<-' ? leftPatterns : rightPatterns;
            this.addUDBadge(children, edgeId, 'source', sourcePatterns, 'U', args);
            this.addUDBadge(children, edgeId, 'target', targetPatterns, 'D', args);
        }

        // Center label: relationship type
        const centerLabel = this.formatRelationshipType(type, arrow);
        if (centerLabel) {
            children.push({
                type: 'label:edge',
                id: args.idCache.uniqueId(`${edgeId}:type`),
                text: centerLabel,
                edgePlacement: {
                    side: 'on',
                    position: 0.5,
                    rotate: false,
                    offset: 10,
                },
            } as unknown as SModelElement);
        }

        let edgeCssClasses: string[] | undefined;
        if (arrow === '><') {
            edgeCssClasses = ['separate-ways'];
        } else if (arrow === '<->') {
            edgeCssClasses = ['partnership'];
        }

        const edge: SEdge = {
            type: 'edge',
            id: edgeId,
            sourceId,
            targetId,
            cssClasses: edgeCssClasses,
            children: children.length > 0 ? children : undefined,
        };

        this.traceProvider.trace(edge as SModelElement, astNode as unknown as import('langium').AstNode);
        return [edge];
    }

    /**
     * Adds a U/D badge label at the source or target end of an edge.
     *
     * Patterns are normalised to their short abbreviations (e.g. `OpenHostService` →
     * `OHS`) and `BBoM`/`BigBallOfMud` is excluded — BBoM is surfaced visually as a
     * cloud node shape rather than a text annotation.
     *
     * Badge text format: `ROLE|PATTERNS` (e.g. `U|OHS, PL` or `D|ACL`).
     * The webview `UDBadgeLabelView` renders this as a bordered box.
     */
    private addUDBadge(
        children: SModelElement[],
        edgeId: string,
        placement: 'source' | 'target',
        patterns: readonly string[],
        role: 'U' | 'D' | undefined,
        args: GeneratorContext
    ): void {
        // Normalise pattern names and strip BBoM (shown on node, not in badge)
        const badgePatterns = patterns
            .filter((p) => !isBBoMPattern(p))
            .map(normalizePattern);

        if (!role && badgePatterns.length === 0) {
            return;
        }

        // Encode as ROLE|PATTERNS for UDBadgeLabelView parsing
        const rolePart = role ?? '';
        const patternPart = badgePatterns.length > 0 ? badgePatterns.join(', ') : '';
        const badgeText = `${rolePart}|${patternPart}`;

        children.push({
            type: 'label:ud-badge',
            id: args.idCache.uniqueId(`${edgeId}:${placement}`),
            text: badgeText,
            edgePlacement: {
                side: 'on',
                position: placement === 'source' ? 0.1 : 0.9,
                rotate: false,
                offset: 0,
            },
        } as unknown as SModelElement);
    }

    /**
     * Formats the relationship type for the center edge label.
     *
     * Maps DomainLang keywords to DDD community notation display names:
     *   CustomerSupplier → Customer/Supplier
     *   SharedKernel → Shared Kernel
     *   UpstreamDownstream → Upstream/Downstream
     *   Partnership → Partnership
     *
     * For `<->` without explicit type, defaults to "Partnership".
     * For `><`, defaults to "Separate Ways".
     */
    private formatRelationshipType(type: string | undefined, arrow: string): string | undefined {
        if (type) {
            return this.displayRelationshipType(type);
        }
        if (arrow === '<->') {
            return 'Partnership';
        }
        if (arrow === '><') {
            return 'Separate Ways';
        }
        return undefined;
    }

    private displayRelationshipType(type: string): string {
        switch (type) {
            case 'CustomerSupplier': return 'Customer/Supplier';
            case 'SharedKernel': return 'Shared Kernel';
            case 'UpstreamDownstream': return 'Upstream/Downstream';
            default: return type;
        }
    }

    // ── Node generation ──

    private collectContextMapNodes(
        selectedMap: ContextMap,
        query: Query,
        nodeMap: Map<string, SNode>,
        bboMNodeKeys: ReadonlySet<string>,
        args: GeneratorContext
    ): void {
        for (const boundedContextRef of selectedMap.boundedContexts) {
            for (const item of boundedContextRef.items) {
                this.ensureNodeForContextMapItem(item, query, nodeMap, bboMNodeKeys, args);
            }

            if (boundedContextRef.items.length === 0 && boundedContextRef.$refText) {
                this.ensureUnresolvedNode(nodeMap, boundedContextRef.$refText, args);
            }
        }
    }

    private ensureNodeForContextMapItem(
        item: { ref?: BoundedContext; $refText?: string },
        query: Query,
        nodeMap: Map<string, SNode>,
        bboMNodeKeys: ReadonlySet<string>,
        args: GeneratorContext
    ): void {
        const boundedContext = item.ref;
        if (!boundedContext) {
            if (item.$refText) {
                this.ensureUnresolvedNode(nodeMap, item.$refText, args);
            }
            return;
        }

        const nodeKey = this.getNodeKey(query, boundedContext);
        if (nodeMap.has(nodeKey)) {
            return;
        }

        const nodeId = args.idCache.uniqueId(`node:${nodeKey}`, boundedContext);
        const node = this.createNode(nodeId, boundedContext.name, bboMNodeKeys.has(nodeKey));
        this.traceProvider.trace(node as SModelElement, boundedContext);
        nodeMap.set(nodeKey, node);
    }

    private createNode(id: string, label: string, isBBoM = false): SNode {
        return {
            type: isBBoM ? 'node:bbom' : 'node',
            id,
            position: { x: 0, y: 0 },
            size: {
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
            },
            layout: 'vbox',
            layoutOptions: {
                hAlign: 'center',
                vAlign: 'center',
                resizeContainer: false,
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: 20,
                paddingRight: 20,
            },
            children: [this.createNodeLabel(id, label)],
        };
    }

    private createNodeLabel(nodeId: string, label: string): SModelElement {
        return {
            type: 'label',
            id: `${nodeId}:label`,
            text: label,
        } as unknown as SModelElement;
    }

    private ensureNode(
        nodeMap: Map<string, SNode>,
        query: Query,
        boundedContext: BoundedContext,
        bboMNodeKeys: ReadonlySet<string>,
        args: GeneratorContext
    ): void {
        const nodeKey = this.getNodeKey(query, boundedContext);
        if (nodeMap.has(nodeKey)) {
            return;
        }

        const nodeId = args.idCache.uniqueId(`node:${nodeKey}`, boundedContext);
        const node = this.createNode(nodeId, boundedContext.name, bboMNodeKeys.has(nodeKey));
        this.traceProvider.trace(node as SModelElement, boundedContext);
        nodeMap.set(nodeKey, node);
    }

    private ensureUnresolvedNode(nodeMap: Map<string, SNode>, label: string, args: GeneratorContext): void {
        const key = `unresolved:${label}`;
        if (nodeMap.has(key)) {
            return;
        }

        const nodeId = args.idCache.uniqueId(`node:${key}`);
        nodeMap.set(key, this.createNode(nodeId, label));
    }

    private getNodeKey(query: Query, boundedContext: BoundedContext): string {
        const fqn = query.fqn(boundedContext);
        return fqn ?? boundedContext.name;
    }

    // ── Selection helpers ──

    private getSelection(args: GeneratorContext): DiagramSelection {
        const options = args.options;
        if (typeof options !== 'object' || options === null) {
            return {};
        }

        const selectedContextMapFqn = this.getStringOption(options, 'selectedContextMapFqn');
        const selectedContextMapName = this.getStringOption(options, 'selectedContextMapName');
        return {
            selectedContextMapFqn,
            selectedContextMapName,
        };
    }

    private getStringOption(options: object, key: string): string | undefined {
        const value = Reflect.get(options, key);
        return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
    }

    private selectContextMap(contextMaps: readonly ContextMap[], query: Query, selection: DiagramSelection): ContextMap | undefined {
        if (selection.selectedContextMapFqn) {
            const byFqn = contextMaps.find((contextMap) => query.fqn(contextMap) === selection.selectedContextMapFqn);
            if (byFqn) {
                return byFqn;
            }
        }

        if (selection.selectedContextMapName) {
            const byName = contextMaps.find((contextMap) => contextMap.name === selection.selectedContextMapName);
            if (byName) {
                return byName;
            }
        }

        return contextMaps[0];
    }
}