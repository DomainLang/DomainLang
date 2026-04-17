import type { ValidationAcceptor } from 'langium';
import type { Metadata } from '../generated/ast.js';
import { ValidationMessages, buildCodeDescription } from './constants.js';

/**
 * Validates that a Metadata element has a defined key name.
 */
function validateMetadataName(metadata: Metadata, accept: ValidationAcceptor): void {
    if (!metadata.name) {
        accept('error', ValidationMessages.METADATA_MISSING_NAME(), { 
            node: metadata,
            codeDescription: buildCodeDescription('language.md', 'metadata')
        });
    }
}

/**
 * Validation checks for Metadata elements.
 */
export const metadataChecks = [validateMetadataName];
