import type { ValidationAcceptor } from 'langium';
import type { ContextMap, DomainMap, Relationship, BoundedContextRef } from '../generated/ast.js';
import { isDirectionalRelationship, isSymmetricRelationship, isThisRef } from '../generated/ast.js';
import { ValidationMessages, buildCodeDescription, IssueCodes } from './constants.js';

/**
 * Validates that a context map contains at least one bounded context.
 * Empty context maps are not useful for documentation purposes.
 * 
 * @param map - The context map to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateContextMapHasContexts(
    map: ContextMap,
    accept: ValidationAcceptor
): void {
    if (!map.boundedContexts || map.boundedContexts.length === 0) {
        accept('warning', ValidationMessages.CONTEXT_MAP_NO_CONTEXTS(map.name), {
            node: map,
            keyword: 'contains',
            codeDescription: buildCodeDescription('language.md', 'context-maps')
        });
    }
}

/**
 * Validates that MultiReference items in a context map resolve.
 * Langium doesn't report errors for unresolved MultiReference items by default,
 * so we need custom validation to catch these cases.
 * 
 * @param map - The context map to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateContextMapReferences(
    map: ContextMap,
    accept: ValidationAcceptor
): void {
    if (!map.boundedContexts) return;
    
    for (const multiRef of map.boundedContexts) {
        // A MultiReference has a $refText (the source text) and items (resolved refs)
        // If $refText exists but items is empty, the reference didn't resolve
        const refText = multiRef.$refText;
        if (refText && multiRef.items.length === 0) {
            accept('error', ValidationMessages.UNRESOLVED_REFERENCE('BoundedContext', refText), {
                node: map,
                // Find the CST node for this specific reference
                property: 'boundedContexts',
                index: map.boundedContexts.indexOf(multiRef),
                code: IssueCodes.UnresolvedReference
            });
        }
    }
}

/**
 * Validates that a context map has at least one relationship if it contains multiple contexts.
 * Multiple unrelated contexts should have documented relationships.
 * 
 * @param map - The context map to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateContextMapHasRelationships(
    map: ContextMap,
    accept: ValidationAcceptor
): void {
    const contextCount = map.boundedContexts?.length ?? 0;
    const relationshipCount = map.relationships?.length ?? 0;
    
    // Only warn if multiple contexts exist without relationships
    if (contextCount > 1 && relationshipCount === 0) {
        accept('info', ValidationMessages.CONTEXT_MAP_NO_RELATIONSHIPS(map.name, contextCount), {
            node: map,
            keyword: 'ContextMap',
            codeDescription: buildCodeDescription('language.md', 'context-maps')
        });
    }
}

/**
 * Validates that a domain map contains at least one domain.
 * Empty domain maps are not useful for documentation purposes.
 * 
 * @param map - The domain map to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateDomainMapHasDomains(
    map: DomainMap,
    accept: ValidationAcceptor
): void {
    if (!map.domains || map.domains.length === 0) {
        accept('warning', ValidationMessages.DOMAIN_MAP_NO_DOMAINS(map.name), {
            node: map,
            keyword: 'contains',
            codeDescription: buildCodeDescription('language.md', 'domain-maps')
        });
    }
}

/**
 * Validates that MultiReference items in a domain map resolve.
 * 
 * @param map - The domain map to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateDomainMapReferences(
    map: DomainMap,
    accept: ValidationAcceptor
): void {
    if (!map.domains) return;
    
    for (const multiRef of map.domains) {
        const refText = multiRef.$refText;
        if (refText && multiRef.items.length === 0) {
            accept('error', ValidationMessages.UNRESOLVED_REFERENCE('Domain', refText), {
                node: map,
                property: 'domains',
                index: map.domains.indexOf(multiRef),
                code: IssueCodes.UnresolvedReference
            });
        }
    }
}

/**
 * Gets a canonical name for a BoundedContextRef for comparison purposes.
 */
function getRefKey(ref: BoundedContextRef): string {
    if (isThisRef(ref)) {
        return 'this';
    }
    return ref.link?.$refText ?? '';
}

/**
 * Builds a canonical key for a relationship for duplicate detection.
 * The key captures both endpoints, arrow direction, and integration patterns.
 */
function buildRelationshipKey(rel: Relationship): string {
    const left = getRefKey(rel.left);
    const right = getRefKey(rel.right);
    const arrow = rel.arrow ?? '';

    if (isDirectionalRelationship(rel)) {
        const leftPatterns = rel.leftPatterns.map(p => p.$type).sort().join(',');
        const rightPatterns = rel.rightPatterns.map(p => p.$type).sort().join(',');
        return `[${leftPatterns}]${left}${arrow}[${rightPatterns}]${right}`;
    }

    // Symmetric relationship
    const pattern = isSymmetricRelationship(rel) && rel.pattern ? rel.pattern.$type : '';
    return `[${pattern}]${left}${arrow}${right}`;
}

/**
 * Validates that a context map does not contain duplicate relationships.
 * Two relationships are considered duplicate if they have the same endpoints,
 * direction, and integration patterns.
 * 
 * @param map - The context map to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateNoDuplicateRelationships(
    map: ContextMap,
    accept: ValidationAcceptor
): void {
    if (!map.relationships || map.relationships.length < 2) return;

    const seen = new Map<string, number>();
    for (let i = 0; i < map.relationships.length; i++) {
        const rel = map.relationships[i];
        const key = buildRelationshipKey(rel);
        
        if (seen.has(key)) {
            accept('warning', ValidationMessages.CONTEXT_MAP_DUPLICATE_RELATIONSHIP(
                getRefKey(rel.left), getRefKey(rel.right)
            ), {
                node: rel,
                property: 'arrow',
                codeDescription: buildCodeDescription('language.md', 'context-maps')
            });
        } else {
            seen.set(key, i);
        }
    }
}

export const contextMapChecks = [
    validateContextMapHasContexts,
    validateContextMapReferences,
    validateContextMapHasRelationships,
    validateNoDuplicateRelationships
];

export const domainMapChecks = [
    validateDomainMapHasDomains,
    validateDomainMapReferences
];
