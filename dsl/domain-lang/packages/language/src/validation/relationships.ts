import type { ValidationAcceptor } from 'langium';
import type { BoundedContextRef, Relationship } from '../generated/ast.js';
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
import { ValidationMessages, buildCodeDescription } from './constants.js';

function getContextName(ref: BoundedContextRef): string {
    if (isThisRef(ref)) {
        return 'this';
    }
    return ref.link?.$refText ?? 'unknown';
}

/**
 * Validates that ACL is on the downstream (consuming) side.
 * ACL on upstream side of -> is a warning. ACL on upstream side of <- is also a warning.
 */
function validateACLPlacement(
    relationship: Relationship,
    accept: ValidationAcceptor
): void {
    if (!isDirectionalRelationship(relationship)) return;

    const hasACLLeft = relationship.leftPatterns.some(isAntiCorruptionLayer);
    const hasACLRight = relationship.rightPatterns.some(isAntiCorruptionLayer);
    
    // For ->, left is upstream. ACL on upstream side is wrong.
    if (hasACLLeft && relationship.arrow === '->') {
        const leftName = getContextName(relationship.left);
        accept('warning',
            ValidationMessages.ACL_ON_WRONG_SIDE(leftName, 'left'),
            { node: relationship, property: 'leftPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
        );
    }
    
    // For <-, right is upstream. ACL on upstream side is wrong.
    if (hasACLRight && relationship.arrow === '<-') {
        const rightName = getContextName(relationship.right);
        accept('warning',
            ValidationMessages.ACL_ON_WRONG_SIDE(rightName, 'right'),
            { node: relationship, property: 'rightPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
        );
    }
}

/**
 * Validates that CF is on the downstream (consuming) side.
 */
function validateConformistPlacement(
    relationship: Relationship,
    accept: ValidationAcceptor
): void {
    if (!isDirectionalRelationship(relationship)) return;

    const hasCFLeft = relationship.leftPatterns.some(isConformist);
    const hasCFRight = relationship.rightPatterns.some(isConformist);
    
    if (hasCFLeft && relationship.arrow === '->') {
        const leftName = getContextName(relationship.left);
        accept('warning',
            ValidationMessages.CONFORMIST_ON_WRONG_SIDE(leftName, 'left'),
            { node: relationship, property: 'leftPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
        );
    }
    
    if (hasCFRight && relationship.arrow === '<-') {
        const rightName = getContextName(relationship.right);
        accept('warning',
            ValidationMessages.CONFORMIST_ON_WRONG_SIDE(rightName, 'right'),
            { node: relationship, property: 'rightPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
        );
    }
}

/**
 * Validates that OHS is on the upstream (providing) side.
 */
function validateOHSPlacement(
    relationship: Relationship,
    accept: ValidationAcceptor
): void {
    if (!isDirectionalRelationship(relationship)) return;

    // For ->, right is downstream. OHS on downstream side is wrong.
    const hasOHSRight = relationship.rightPatterns.some(isOpenHostService);
    if (hasOHSRight && relationship.arrow === '->') {
        const rightName = getContextName(relationship.right);
        accept('warning',
            ValidationMessages.OHS_ON_WRONG_SIDE(rightName, 'right'),
            { node: relationship, property: 'rightPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
        );
    }

    // For <-, left is downstream. OHS on downstream side is wrong.
    const hasOHSLeft = relationship.leftPatterns.some(isOpenHostService);
    if (hasOHSLeft && relationship.arrow === '<-') {
        const leftName = getContextName(relationship.left);
        accept('warning',
            ValidationMessages.OHS_ON_WRONG_SIDE(leftName, 'left'),
            { node: relationship, property: 'leftPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
        );
    }
}

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
                'Supplier [S] cannot be used on a bidirectional (<->) relationship — Customer/Supplier is inherently directional.',
                { node: relationship, property: relationship.leftPatterns.some(isSupplier) ? 'leftPatterns' : 'rightPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
            );
        }
        if (allPatterns.some(isCustomer)) {
            accept('error',
                'Customer [C] cannot be used on a bidirectional (<->) relationship — Customer/Supplier is inherently directional.',
                { node: relationship, property: relationship.leftPatterns.some(isCustomer) ? 'leftPatterns' : 'rightPatterns', codeDescription: buildCodeDescription('language.md', 'integration-patterns') }
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
