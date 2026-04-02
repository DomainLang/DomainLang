import type { ValidationAcceptor } from 'langium';
import type { BoundedContextRef, Relationship, SidePattern } from '../generated/ast.js';
import { 
    isThisRef, 
    isDirectionalRelationship,
    isSymmetricRelationship,
    isAntiCorruptionLayer,
    isConformist,
    isOpenHostService,
    isSupplier,
    isCustomer,
} from '../generated/ast.js';
import { ValidationMessages, IssueCodes, buildCodeDescription } from './constants.js';

function getContextName(ref: BoundedContextRef): string {
    if (isThisRef(ref)) {
        return 'this';
    }
    return ref.link?.$refText ?? 'unknown';
}

/**
 * Factory for validating that a pattern appears on the correct side of a relationship.
 *
 * @param guard - AST type guard for the pattern (e.g. `isAntiCorruptionLayer`)
 * @param message - Message factory receiving (contextName, side)
 * @param wrongSide - Which side triggers the warning:
 *   - `'upstream'`: warn when the pattern is on the upstream side (ACL, CF — downstream patterns)
 *   - `'downstream'`: warn when the pattern is on the downstream side (OHS — upstream pattern)
 */
function makePatternPlacementValidator(
    guard: (p: SidePattern) => boolean,
    message: (name: string, side: 'left' | 'right') => string,
    wrongSide: 'upstream' | 'downstream',
): (relationship: Relationship, accept: ValidationAcceptor) => void {
    return (relationship, accept) => {
        if (!isDirectionalRelationship(relationship)) return;

        const hasLeft = relationship.leftPatterns.some(guard);
        const hasRight = relationship.rightPatterns.some(guard);

        if (wrongSide === 'upstream') {
            // Downstream pattern on upstream side is wrong
            // For ->, left is upstream; for <-, right is upstream
            if (hasLeft && relationship.arrow === '->') {
                accept('warning', message(getContextName(relationship.left), 'left'),
                    { node: relationship, property: 'leftPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') });
            }
            if (hasRight && relationship.arrow === '<-') {
                accept('warning', message(getContextName(relationship.right), 'right'),
                    { node: relationship, property: 'rightPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') });
            }
        } else {
            // Upstream pattern on downstream side is wrong
            // For ->, right is downstream; for <-, left is downstream
            if (hasRight && relationship.arrow === '->') {
                accept('warning', message(getContextName(relationship.right), 'right'),
                    { node: relationship, property: 'rightPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') });
            }
            if (hasLeft && relationship.arrow === '<-') {
                accept('warning', message(getContextName(relationship.left), 'left'),
                    { node: relationship, property: 'leftPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') });
            }
        }
    };
}

const validateACLPlacement = makePatternPlacementValidator(
    isAntiCorruptionLayer, ValidationMessages.ACL_ON_WRONG_SIDE, 'upstream',
);

const validateConformistPlacement = makePatternPlacementValidator(
    isConformist, ValidationMessages.CONFORMIST_ON_WRONG_SIDE, 'upstream',
);

const validateOHSPlacement = makePatternPlacementValidator(
    isOpenHostService, ValidationMessages.OHS_ON_WRONG_SIDE, 'downstream',
);

/**
 * Validates that Supplier is on the upstream side and Customer is on the downstream side.
 * These are errors, not warnings — S/C have fixed placement.
 */
function validateCustomerSupplierPlacement(
    relationship: Relationship,
    accept: ValidationAcceptor
): void {
    if (!isDirectionalRelationship(relationship)) return;

    // For ->, left is upstream, right is downstream
    // Supplier must be upstream, Customer must be downstream
    if (relationship.arrow === '->') {
        if (relationship.rightPatterns.some(isSupplier)) {
            accept('error',
                ValidationMessages.SUPPLIER_ON_WRONG_SIDE(getContextName(relationship.right), 'right'),
                { node: relationship, property: 'rightPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
            );
        }
        if (relationship.leftPatterns.some(isCustomer)) {
            accept('error',
                ValidationMessages.CUSTOMER_ON_WRONG_SIDE(getContextName(relationship.left), 'left'),
                { node: relationship, property: 'leftPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
            );
        }
    }

    // For <-, right is upstream, left is downstream
    if (relationship.arrow === '<-') {
        if (relationship.leftPatterns.some(isSupplier)) {
            accept('error',
                ValidationMessages.SUPPLIER_ON_WRONG_SIDE(getContextName(relationship.left), 'left'),
                { node: relationship, property: 'leftPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
            );
        }
        if (relationship.rightPatterns.some(isCustomer)) {
            accept('error',
                ValidationMessages.CUSTOMER_ON_WRONG_SIDE(getContextName(relationship.right), 'right'),
                { node: relationship, property: 'rightPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
            );
        }
    }

    // <-> is bidirectional — Customer/Supplier is inherently directional and must not appear on a <-> arrow
    if (relationship.arrow === '<->') {
        const allPatterns = [...relationship.leftPatterns, ...relationship.rightPatterns];
        if (allPatterns.some(isSupplier)) {
            accept('error',
                ValidationMessages.SUPPLIER_ON_BIDIRECTIONAL(),
                { node: relationship, property: relationship.leftPatterns.some(isSupplier) ? 'leftPatterns' : 'rightPatterns', code: IssueCodes.SupplierOnBidirectional, codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
            );
        }
        if (allPatterns.some(isCustomer)) {
            accept('error',
                ValidationMessages.CUSTOMER_ON_BIDIRECTIONAL(),
                { node: relationship, property: relationship.leftPatterns.some(isCustomer) ? 'leftPatterns' : 'rightPatterns', code: IssueCodes.CustomerOnBidirectional, codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
            );
        }
    }
}

/**
 * Validates pattern count per side (info if > 3).
 */
function validatePatternCount(
    relationship: Relationship,
    accept: ValidationAcceptor
): void {
    if (!isDirectionalRelationship(relationship)) return;
    
    const leftCount = relationship.leftPatterns.length;
    const rightCount = relationship.rightPatterns.length;
    
    if (leftCount > 3) {
        accept('info',
            ValidationMessages.TOO_MANY_PATTERNS(leftCount, 'left'),
            { node: relationship, property: 'leftPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
        );
    }
    
    if (rightCount > 3) {
        accept('info',
            ValidationMessages.TOO_MANY_PATTERNS(rightCount, 'right'),
            { node: relationship, property: 'rightPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
        );
    }
}

/**
 * Validates that symmetric relationships with self-reference produce a warning.
 */
function validateSelfSymmetric(
    relationship: Relationship,
    accept: ValidationAcceptor
): void {
    if (!isSymmetricRelationship(relationship)) return;

    const leftName = getContextName(relationship.left);
    const rightName = getContextName(relationship.right);
    
    if (leftName === rightName) {
        accept('warning',
            ValidationMessages.SELF_SYMMETRIC_RELATIONSHIP(leftName),
            { node: relationship, codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
        );
    }
}

/**
 * All relationship validation checks.
 * Each function receives a Relationship (DirectionalRelationship | SymmetricRelationship)
 * and guards internally for the correct subtype.
 */
export const relationshipChecks: Array<(relationship: Relationship, accept: ValidationAcceptor) => void> = [
    validateACLPlacement,
    validateConformistPlacement,
    validateOHSPlacement,
    validateCustomerSupplierPlacement,
    validatePatternCount,
    validateSelfSymmetric,
];
