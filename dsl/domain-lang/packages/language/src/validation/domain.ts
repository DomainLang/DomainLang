import type { ValidationAcceptor } from 'langium';
import type { Domain } from '../generated/ast.js';
import { ValidationMessages, buildCodeDescription } from './constants.js';

/**
 * Validates that a domain has a vision statement.
 * 
 * @param domain - The domain to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateDomainHasVision(
    domain: Domain, 
    accept: ValidationAcceptor
): void {
    if (!domain.vision) {
        accept('warning', ValidationMessages.DOMAIN_NO_VISION(domain.name), { 
            node: domain,
            keyword: 'Domain',
            codeDescription: buildCodeDescription('language.md', 'domain-vision')
        });
    }
}

/**
 * Validates that a domain hierarchy does not contain circular references.
 * 
 * The `Domain A in B` syntax expresses subdomain containment.
 * Circular containment (A in B, B in C, C in A) is semantically invalid
 * because it violates the fundamental concept of domain decomposition.
 * 
 * @param domain - The domain to validate
 * @param accept - The validation acceptor for reporting issues
 */
function validateNoCyclicDomainHierarchy(
    domain: Domain,
    accept: ValidationAcceptor
): void {
    // Only check if this domain has a parent
    if (!domain.parent?.ref) {
        return;
    }
    
    const visited = new Set<string>();
    const cyclePath: string[] = [domain.name];
    let current: Domain | undefined = domain.parent.ref;

    while (current) {
        // Check if we've encountered this domain name before (cycle detected within traversal)
        if (visited.has(current.name)) {
            // We found a cycle - report it
            cyclePath.push(current.name);
            accept('error', ValidationMessages.DOMAIN_CIRCULAR_HIERARCHY(cyclePath), {
                node: domain,
                property: 'parent',
                codeDescription: buildCodeDescription('language.md', 'domain-hierarchy')
            });
            return;
        }

        // Check if we've looped back to the starting domain (by name, not object identity)
        if (current.name === domain.name) {
            cyclePath.push(domain.name);
            accept('error', ValidationMessages.DOMAIN_CIRCULAR_HIERARCHY(cyclePath), {
                node: domain,
                property: 'parent',
                codeDescription: buildCodeDescription('language.md', 'domain-hierarchy')
            });
            return;
        }

        visited.add(current.name);
        cyclePath.push(current.name);
        current = current.parent?.ref;
    }
}

export const domainChecks = [validateDomainHasVision, validateNoCyclicDomainHierarchy]; 