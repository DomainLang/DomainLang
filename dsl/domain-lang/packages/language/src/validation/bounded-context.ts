import type { ValidationAcceptor } from 'langium';
import type { BoundedContext } from '../generated/ast.js';
import { ValidationMessages, buildCodeDescription } from './constants.js';

/**
 * Validates that a bounded context has a description.
 * 
 * @param bc - The bounded context to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateBoundedContextHasDescription(
    bc: BoundedContext, 
    accept: ValidationAcceptor
): void {
    if (!bc.description) {
        accept('warning', ValidationMessages.BOUNDED_CONTEXT_NO_DESCRIPTION(bc.name), { 
            node: bc,
            keyword: 'BoundedContext',
            codeDescription: buildCodeDescription('language.md', 'bounded-contexts')
        });
    }
}

/**
 * Validates that a bounded context belongs to a domain.
 * A BoundedContext must have a 'for Domain' clause.
 * 
 * @param bc - The bounded context to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateBoundedContextHasDomain(
    bc: BoundedContext,
    accept: ValidationAcceptor
): void {
    if (!bc.domain) {
        accept('warning', ValidationMessages.BOUNDED_CONTEXT_NO_DOMAIN(bc.name), {
            node: bc,
            keyword: 'for',
            codeDescription: buildCodeDescription('language.md', 'bounded-contexts')
        });
    }
}

/**
 * Factory for inline/block conflict validators.
 * Warns when both inline and block assignments exist for a multi-valued reference property.
 */
function makeConflictValidator(
    property: 'classification' | 'team',
    message: (name: string, inlineName: string | undefined, blockName: string | undefined) => string,
): (bc: BoundedContext, accept: ValidationAcceptor) => void {
    return (bc, accept) => {
        const refs = bc[property];
        if (refs.length > 1) {
            accept('warning', message(bc.name, refs[0].ref?.name, refs[1].ref?.name), {
                node: bc,
                property,
                index: 1,
                codeDescription: buildCodeDescription('language.md', 'bounded-contexts'),
            });
        }
    };
}

/**
 * FR-9.2: Inline/Block Conflict Validation for classification.
 */
const validateBoundedContextClassificationConflict = makeConflictValidator(
    'classification', ValidationMessages.BOUNDED_CONTEXT_CLASSIFICATION_CONFLICT,
);

/**
 * FR-2.3: Inline/Block Conflict Validation for team.
 */
const validateBoundedContextTeamConflict = makeConflictValidator(
    'team', ValidationMessages.BOUNDED_CONTEXT_TEAM_CONFLICT,
);

export const boundedContextChecks = [
    validateBoundedContextHasDescription,
    validateBoundedContextHasDomain,
    validateBoundedContextClassificationConflict,
    validateBoundedContextTeamConflict
];