/**
 * Standalone hover content builder functions.
 * 
 * Extracted from DomainLangHoverProvider to reduce class complexity
 * and enable independent testing of hover content generation.
 * 
 * Each builder takes typed AST nodes (not generic AstNode) and the helper
 * functions needed for formatting, keeping them pure and testable.
 * 
 * @module lsp/hover/hover-builders
 */

import type {
    BoundedContext,
    Classification,
    Domain,
    Relationship,
    Team,
    Type,
} from '../../generated/ast.js';
import { effectiveClassification, effectiveTeam } from '../../sdk/resolution.js';

// ============================================================================
// Shared formatting utilities
// ============================================================================

/**
 * Wraps text in a domain-lang fenced code block.
 */
export function codeBlock(text: string): string {
    return `\`\`\`domain-lang\n${text}\n\`\`\``;
}

/**
 * Formats hover output with a consistent header/body structure.
 * 
 * @param commentBlock - Documentation comment prefix (or empty)
 * @param emoji - Emoji icon for the type
 * @param typeName - Lowercase type name
 * @param name - Element name (optional)
 * @param fields - Body content fields
 */
export function formatHoverContent(
    commentBlock: string,
    emoji: string,
    typeName: string,
    name: string | undefined,
    fields: string[]
): string {
    const separator = commentBlock ? `${commentBlock}\n\n---\n\n` : '';
    const nameDisplay = name ? ` ${name}` : '';
    const header = `${emoji} **\`(${typeName})\`${nameDisplay}**`;
    const body = fields.length > 0 ? `\n\n${fields.join('\n\n')}` : '';
    return `${separator}${header}${body}`;
}

/**
 * Callback for creating reference links.
 * Provided by the hover provider which has access to the qualified name provider.
 */
export type RefLinkFn = (ref: Type | undefined, label?: string) => string;

// ============================================================================
// Domain hover builder
// ============================================================================

/**
 * Builds a signature string for a domain (e.g., "Domain Sales in Commerce").
 */
export function buildDomainSignature(domain: Domain): string {
    const parts = ['Domain', domain.name];
    if (domain.parent?.ref?.name) {
        parts.push('in', domain.parent.ref.name);
    }
    return parts.join(' ');
}

/**
 * Builds hover fields for a Domain node.
 * 
 * @param domain - The domain AST node
 * @param refLink - Function to create reference links
 * @returns Array of formatted field strings
 */
export function buildDomainFields(domain: Domain, refLink: RefLinkFn): string[] {
    const description = domain.description ?? '';
    const vision = domain.vision ?? '';
    const typeRef = domain.type?.ref;

    const signature = codeBlock(buildDomainSignature(domain));
    const fields: string[] = [signature];

    if (description) fields.push(description);
    if (vision || typeRef || domain.parent) fields.push('---');
    if (vision) fields.push(`**Vision:** ${vision}`);
    if (typeRef) fields.push(`**Type:** ${refLink(typeRef)}`);
    if (domain.parent?.ref) fields.push(`**Parent:** ${refLink(domain.parent.ref)}`);

    return fields;
}

// ============================================================================
// Bounded context hover builder
// ============================================================================

/**
 * Builds a signature string for a bounded context
 * (e.g., "boundedcontext OrderManagement for Sales as Core by SalesTeam").
 */
export function buildBcSignature(bc: BoundedContext): string {
    const classification = effectiveClassification(bc);
    const team = effectiveTeam(bc);

    const parts = ['BoundedContext', bc.name];
    if (bc.domain?.ref?.name) parts.push('for', bc.domain.ref.name);
    if (classification?.name) parts.push('as', classification.name);
    if (team?.name) parts.push('by', team.name);
    return parts.join(' ');
}

/**
 * Builds the properties section (domain, classification, team, businessModel, evolution).
 */
function buildBcPropertyFields(
    bc: BoundedContext,
    classification: Classification | undefined,
    team: Team | undefined,
    refLink: RefLinkFn
): string[] {
    const fields: string[] = [];
    const domain = bc.domain?.ref;
    const businessModel = bc.businessModel?.ref;
    const evolution = bc.evolution?.ref;

    if (domain || classification || team || businessModel || evolution) fields.push('---');
    if (domain) fields.push(`📁 **Domain:** ${refLink(domain)}`);
    if (classification) fields.push(`🔖 **Classification:** ${refLink(classification)}`);
    if (team) fields.push(`👥 **Team:** ${refLink(team)}`);
    if (businessModel) fields.push(`💼 **Business Model:** ${refLink(businessModel)}`);
    if (evolution) fields.push(`🔄 **Evolution:** ${refLink(evolution)}`);

    return fields;
}

/**
 * Builds the relationships section for a bounded context hover.
 */
function buildBcRelationshipsSection(
    relationships: readonly Relationship[],
    formatRelationshipLine: (rel: Relationship) => string
): string[] {
    if (relationships.length === 0) return [];
    const lines = relationships.map(formatRelationshipLine);
    return [`**Relationships:**\n${lines.join('\n')}`];
}

/**
 * Builds the terminology section for a bounded context hover.
 */
function buildBcTerminologySection(bc: BoundedContext): string[] {
    const terminology = bc.terminology ?? [];
    if (terminology.length === 0) return [];
    const lines = terminology.map(t => `- \`${t.name}\`: ${t.meaning ?? ''}`);
    return [`**Terminology:**\n${lines.join('\n')}`];
}

/**
 * Builds the decisions section for a bounded context hover.
 */
function buildBcDecisionsSection(bc: BoundedContext): string[] {
    const decisions = bc.decisions ?? [];
    if (decisions.length === 0) return [];
    const lines = decisions.map(d => `- \`${d.name}\`: ${d.value ?? ''}`);
    return [`**Decisions:**\n${lines.join('\n')}`];
}

/**
 * Builds hover fields for a BoundedContext node.
 * 
 * @param bc - The bounded context AST node
 * @param refLink - Function to create reference links
 * @param formatRelationshipLine - Function to format a relationship line
 * @returns Array of formatted field strings
 */
export function buildBcFields(
    bc: BoundedContext,
    refLink: RefLinkFn,
    formatRelationshipLine: (rel: Relationship) => string
): string[] {
    const description = bc.description ?? '';
    const classification = effectiveClassification(bc);
    const team = effectiveTeam(bc);

    const signature = codeBlock(buildBcSignature(bc));
    const fields: string[] = [signature];

    if (description) fields.push(description);

    const sections = [
        ...buildBcPropertyFields(bc, classification, team, refLink),
        ...buildBcRelationshipsSection(bc.relationships ?? [], formatRelationshipLine),
        ...buildBcTerminologySection(bc),
        ...buildBcDecisionsSection(bc),
    ];
    fields.push(...sections);

    return fields;
}
