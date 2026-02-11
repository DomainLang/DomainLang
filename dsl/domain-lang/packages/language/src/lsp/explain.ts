/**
 * Explanation generation for model elements (PRS-015)
 * 
 * Reuses hover builder functions to generate rich markdown explanations
 * of any model element. This provides the same content that appears in
 * hover tooltips, but in a format suitable for Language Model Tools.
 * 
 * @module lsp/explain
 */

import type { AstNode } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import type {
    BoundedContext,
    Classification,
    Domain,
    Relationship,
    Team,
} from '../generated/ast.js';
import {
    isBoundedContext,
    isClassification,
    isDomain,
    isRelationship,
    isTeam,
} from '../generated/ast.js';
import type { DomainLangServices } from '../domain-lang-module.js';
import {
    formatHoverContent,
    buildDomainFields,
    buildBcSignature,
    codeBlock,
} from './hover/hover-builders.js';
import { effectiveClassification, effectiveTeam } from '../sdk/resolution.js';

/**
 * Generates a rich markdown explanation for any model element.
 * Delegates to the appropriate builder based on element type.
 * 
 * @param node - AST node to explain
 * @param _services - DomainLang services for reference resolution
 * @returns Markdown explanation
 */
export function generateExplanation(
    node: AstNode,
    _services: { shared: LangiumSharedServices; DomainLang: DomainLangServices }
): string {
    // Create simple reference link function (just returns name)
    const refLink = (ref: { name: string } | undefined, label?: string): string => {
        if (!ref) return label ?? 'unknown';
        return label ? `${label}` : ref.name;
    };

    if (isDomain(node)) {
        return explainDomain(node, refLink);
    } else if (isBoundedContext(node)) {
        return explainBoundedContext(node, refLink);
    } else if (isTeam(node)) {
        return explainTeam(node);
    } else if (isClassification(node)) {
        return explainClassification(node);
    } else if (isRelationship(node)) {
        return explainRelationship(node);
    } else {
        return `**Unknown element type:** ${node.$type}`;
    }
}

/**
 * Explains a Domain element.
 */
function explainDomain(domain: Domain, refLink: (ref: { name: string } | undefined, label?: string) => string): string {
    const fields = buildDomainFields(domain, refLink as unknown as import('./hover/hover-builders.js').RefLinkFn);
    return formatHoverContent('', '🏛️', 'domain', domain.name, fields);
}

/**
 * Explains a BoundedContext element.
 */
function explainBoundedContext(
    bc: BoundedContext,
    refLink: (ref: { name: string } | undefined, label?: string) => string
): string {
    const description = bc.description ?? '';
    const classification = effectiveClassification(bc);
    const team = effectiveTeam(bc);
    
    const signature = codeBlock(buildBcSignature(bc));
    const fields: string[] = [signature];
    
    if (description) fields.push(description);
    
    // Add basic properties
    if (bc.domain?.ref) {
        fields.push('---');
        fields.push(`📁 **Domain:** ${refLink(bc.domain.ref as { name: string })}`);
    }
    if (classification) {
        fields.push(`🔖 **Classification:** ${refLink(classification)}`);
    }
    if (team) {
        fields.push(`👥 **Team:** ${refLink(team)}`);
    }
    
    return formatHoverContent('', '📦', 'bounded context', bc.name, fields);
}

/**
 * Explains a Team element.
 */
function explainTeam(team: Team): string {
    return formatHoverContent('', '👥', 'team', team.name, []);
}

/**
 * Explains a Classification element.
 */
function explainClassification(classification: Classification): string {
    return formatHoverContent('', '🏷️', 'classification', classification.name, []);
}

/**
 * Explains a Relationship element.
 */
function explainRelationship(relationship: Relationship): string {
    const leftName = relationship.left.link?.ref?.name ?? 'unknown';
    const rightName = relationship.right.link?.ref?.name ?? 'unknown';
    const arrow = relationship.arrow;

    const description = `Relationship from **${leftName}** ${arrow} **${rightName}**`;
    return formatHoverContent('', '🔗', 'relationship', undefined, [description]);
}
