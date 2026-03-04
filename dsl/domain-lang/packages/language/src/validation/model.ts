import { setInferredRelationshipTypes } from '../services/relationship-inference.js';
import { extractNames } from './shared.js';
import type { ValidationAcceptor } from 'langium';
import type { Model } from '../generated/ast.js';
import { ValidationMessages, buildCodeDescription } from './constants.js';

/**
 * Applies relationship type inference to the model.
 *
 * Separated from validation so that validators remain pure observers.
 * Must run before `validateModelUniqueNames` in the check order.
 *
 * @param model - The model to enrich
 */
function applyRelationshipInference(model: Model, _accept: ValidationAcceptor): void {
    setInferredRelationshipTypes(model);
}

/**
 * Validates that all elements in the model have unique fully qualified names.
 *
 * @param model - The model to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateModelUniqueNames(
    model: Model, 
    accept: ValidationAcceptor
): void {
    const uniqueNames = new Set<string>();
    const names = extractNames(model);
    
    for (const {fqn, node} of names) {
        const oldSize = uniqueNames.size;
        uniqueNames.add(fqn);
        if (uniqueNames.size === oldSize) {
            accept('error', ValidationMessages.DUPLICATE_ELEMENT(fqn), { 
                node: node, 
                property: 'name',
                codeDescription: buildCodeDescription('language.md', 'naming')
            });
        }
    }
}

export const modelChecks = [applyRelationshipInference, validateModelUniqueNames]; 