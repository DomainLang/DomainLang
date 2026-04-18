import type { AstNode, MultiReference, Properties, ValidationAcceptor } from 'langium';
import type { ContextMap, DomainMap, Relationship, BoundedContextRef } from '../generated/ast.js';
import { isDirectionalRelationship, isSymmetricRelationship, isThisRef } from '../generated/ast.js';
import { ValidationMessages, buildCodeDescription, IssueCodes } from './constants.js';

/**
 * Factory for MultiReference resolution validators.
 * Reports an error for each MultiReference whose $refText is set but resolves no items.
 */
function makeMultiRefValidator<T extends AstNode>(
    getMultiRefs: (node: T) => readonly MultiReference[] | undefined,
    property: Properties<T>,
    typeLabel: string,
): (node: T, accept: ValidationAcceptor) => void {
    return (node, accept) => {
        const refs = getMultiRefs(node);
        if (!refs) return;
        for (const multiRef of refs) {
            const refText = multiRef.$refText;
            if (refText && multiRef.items.length === 0) {
                accept('error', ValidationMessages.UNRESOLVED_REFERENCE(typeLabel, refText), {
                    node,
                    property,
                    index: refs.indexOf(multiRef),
                    data: { code: IssueCodes.UnresolvedReference },
                });
            }
        }
    };
}

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

const validateContextMapReferences = makeMultiRefValidator<ContextMap>(
    m => m.boundedContexts, 'boundedContexts', 'BoundedContext',
);

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

const validateDomainMapReferences = makeMultiRefValidator<DomainMap>(
    m => m.domains, 'domains', 'Domain',
);

/**
 * Gets a canonical name for a BoundedContextRef for comparison purposes.
 * Returns null when the reference is unresolved to avoid false-positive duplicate warnings.
 */
function getRefKey(ref: BoundedContextRef): string | null {
    if (isThisRef(ref)) {
        return 'this';
    }
    const text = ref.link?.$refText;
    return text || null;
}

/**
 * Builds a canonical key for a relationship for duplicate detection.
 * The key captures both endpoints, arrow direction, and integration patterns.
 * Returns null when either endpoint is unresolved (already reported as a separate error).
 */
function buildRelationshipKey(rel: Relationship): string | null {
    const left = getRefKey(rel.left);
    const right = getRefKey(rel.right);
    if (left === null || right === null) return null;
    const arrow = rel.arrow ?? '';

    if (isDirectionalRelationship(rel)) {
        const leftPatterns = rel.leftPatterns.map(p => p.$type).sort().join(',');
        const rightPatterns = rel.rightPatterns.map(p => p.$type).sort().join(',');
        return `[${leftPatterns}]${left}${arrow}[${rightPatterns}]${right}`;
    }

    // Symmetric relationship — sort endpoints so A [SK] B and B [SK] A share the same key
    const pattern = isSymmetricRelationship(rel) && rel.pattern ? rel.pattern.$type : '';
    const [a, b] = [left, right].sort((x, y) => x.localeCompare(y));
    return `[${pattern}]${a}${arrow}${b}`;
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
        if (key === null) continue; // Unresolved endpoints — skip, error already reported elsewhere

        if (seen.has(key)) {
            accept('warning', ValidationMessages.CONTEXT_MAP_DUPLICATE_RELATIONSHIP(
                getRefKey(rel.left) ?? '', getRefKey(rel.right) ?? ''
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
