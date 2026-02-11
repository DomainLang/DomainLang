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
import type {
    BoundedContext,
    Classification,
    ContextMap,
    Domain,
    DomainMap,
    Relationship,
    Team,
} from '../generated/ast.js';
import {
    isBoundedContext,
    isClassification,
    isContextMap,
    isDomain,
    isDomainMap,
    isRelationship,
    isTeam,
} from '../generated/ast.js';
import {
    formatHoverContent,
    buildDomainFields,
    buildBcSignature,
    codeBlock,
} from './hover/hover-builders.js';
import type { RefLinkFn } from './hover/hover-builders.js';
import { effectiveClassification, effectiveTeam } from '../sdk/resolution.js';

/**
 * Creates a plain-text reference link function for explain output.
 * Unlike the hover provider (which creates clickable links), this returns
 * plain names suitable for Language Model consumption.
 */
function createRefLink(): RefLinkFn {
    return (ref, label) => {
        if (!ref) return label ?? 'unknown';
        return label ?? ref.name;
    };
}

/**
 * Generates a rich markdown explanation for any model element.
 * Delegates to the appropriate builder based on element type.
 * 
 * @param node - AST node to explain
 * @returns Markdown explanation
 */
export function generateExplanation(node: AstNode): string {
    const refLink = createRefLink();

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
    } else if (isContextMap(node)) {
        return explainContextMap(node);
    } else if (isDomainMap(node)) {
        return explainDomainMap(node);
    } else {
        return `**Unknown element type:** ${node.$type}`;
    }
}

/**
 * Explains a Domain element.
 */
function explainDomain(domain: Domain, refLink: RefLinkFn): string {
    const fields = buildDomainFields(domain, refLink);
    return formatHoverContent('', '🏛️', 'domain', domain.name, fields);
}

/**
 * Explains a BoundedContext element.
 */
function explainBoundedContext(bc: BoundedContext, refLink: RefLinkFn): string {
    const description = bc.description ?? '';
    const classification = effectiveClassification(bc);
    const team = effectiveTeam(bc);
    
    const signature = codeBlock(buildBcSignature(bc));
    const fields: string[] = [signature];
    
    if (description) fields.push(description);
    
    const extraFields: string[] = [];
    if (bc.domain?.ref) {
        extraFields.push('---', `📁 **Domain:** ${refLink(bc.domain.ref)}`);
    }
    if (classification) {
        extraFields.push(`🔖 **Classification:** ${refLink(classification)}`);
    }
    if (team) {
        extraFields.push(`👥 **Team:** ${refLink(team)}`);
    }
    fields.push(...extraFields);
    
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

/**
 * Explains a ContextMap element.
 */
function explainContextMap(contextMap: ContextMap): string {
    const bcNames = contextMap.boundedContexts
        .flatMap(mr => mr.items.map(item => item.ref?.name ?? 'unknown'));
    const relCount = contextMap.relationships.length;

    const fields: string[] = [];
    if (bcNames.length > 0) {
        fields.push(`**Bounded contexts:** ${bcNames.join(', ')}`);
    }
    fields.push(`**Relationships:** ${relCount}`);

    return formatHoverContent('', '🗺️', 'context map', contextMap.name, fields);
}

/**
 * Explains a DomainMap element.
 */
function explainDomainMap(domainMap: DomainMap): string {
    const domainNames = domainMap.domains
        .flatMap(mr => mr.items.map(item => item.ref?.name ?? 'unknown'));

    const fields: string[] = [];
    if (domainNames.length > 0) {
        fields.push(`**Domains:** ${domainNames.join(', ')}`);
    }

    return formatHoverContent('', '🌐', 'domain map', domainMap.name, fields);
}
