import { extractNames } from './shared.js';
import type { ValidationAcceptor } from 'langium';
import type { Model } from '../generated/ast.js';
import { ValidationMessages, buildCodeDescription } from './constants.js';

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

export const modelChecks = [validateModelUniqueNames]; 