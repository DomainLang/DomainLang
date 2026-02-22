import type { 
    Model, 
    Relationship, 
    StructureElement, 
    BoundedContext,
    ContextMap,
    DirectionalRelationship,
    SymmetricRelationship
} from '../generated/ast.js';
import { 
    isBoundedContext, 
    isContextMap, 
    isNamespaceDeclaration,
    isDirectionalRelationship,
    isSymmetricRelationship,
    isSupplier,
    isCustomer
} from '../generated/ast.js';

/**
 * Enriches relationships in the model by inferring relationship kinds
 * from AST node type, patterns, and arrow direction.
 * 
 * With the entity–relationship–entity grammar, symmetric relationships
 * derive their kind directly from the AST node type (no heuristics).
 * 
 * @param model - The root model to process
 */
export function setInferredRelationshipTypes(model: Model): void {
    walkStructureElements(model.children);
}

/**
 * Recursively walks structure elements to find and enrich relationships.
 */
function walkStructureElements(
    elements: StructureElement[] = [], 
    _containerBc?: BoundedContext
): void {
    for (const element of elements) {
        if (isNamespaceDeclaration(element)) {
            walkStructureElements(element.children, _containerBc);
        } else if (isBoundedContext(element)) {
            processContextRelationships(element);
        } else if (isContextMap(element)) {
            processMapRelationships(element);
        }
    }
}

/**
 * Processes relationships within a bounded context.
 */
function processContextRelationships(context: BoundedContext): void {
    for (const rel of context.relationships) {
        enrichRelationship(rel);
    }
}

/**
 * Processes relationships within a context map.
 */
function processMapRelationships(map: ContextMap): void {
    if (map.relationships) {
        for (const rel of map.relationships) {
            enrichRelationship(rel);
        }
    }
}

/**
 * Enriches a single relationship by inferring its kind.
 */
function enrichRelationship(rel: Relationship): void {
    if (isSymmetricRelationship(rel)) {
        rel.inferredKind = inferSymmetricKind(rel);
    } else if (isDirectionalRelationship(rel)) {
        rel.inferredKind = inferDirectionalKind(rel);
    }
}

/**
 * Infers kind for symmetric relationships — derived from AST node type.
 * No heuristics needed: the pattern is structurally part of the relationship.
 */
function inferSymmetricKind(rel: SymmetricRelationship): string {
    if (rel.pattern) {
        return rel.pattern.$type;  // 'SharedKernel', 'Partnership', or 'SeparateWays'
    }
    if (rel.arrow === '><') {
        return 'SeparateWays';
    }
    return 'SeparateWays'; // `><` is the only non-pattern symmetric form
}

/**
 * Infers kind for directional relationships from side patterns.
 * 
 * - Customer/Supplier: has [S] or [C] patterns
 * - UpstreamDownstream: default for all directional relationships
 */
function inferDirectionalKind(rel: DirectionalRelationship): string {
    const hasSupplier = rel.leftPatterns.some(isSupplier) || rel.rightPatterns.some(isSupplier);
    const hasCustomer = rel.leftPatterns.some(isCustomer) || rel.rightPatterns.some(isCustomer);
    
    if (hasSupplier || hasCustomer) {
        return 'CustomerSupplier';
    }
    return 'UpstreamDownstream';
}
