import type {
    AstNode,
    CommentProvider,
    DocumentationProvider,
    LangiumDocument,
    MaybePromise,
    Reference
} from 'langium';
import { CstUtils, isReference } from 'langium';
import type { LangiumServices } from 'langium/lsp';
import { AstNodeHoverProvider } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import * as ast from '../../generated/ast.js';
import type { DomainLangServices } from '../../domain-lang-module.js';
import { QualifiedNameProvider } from '../domain-lang-naming.js';
import { keywordExplanations } from './domain-lang-keywords.js';
import { effectiveClassification, effectiveTeam } from '../../sdk/resolution.js';

/**
 * Type-specific hover content generator.
 * Returns undefined if the generator doesn't handle this node type.
 */
type HoverContentGenerator = (node: AstNode, commentBlock: string) => string | undefined;

/**
 * Provides hover information for DomainLang elements.
 * 
 * Extends Langium's AstNodeHoverProvider with DDD-specific hover content
 * for domains, bounded contexts, relationships, and other DSL constructs.
 */
export class DomainLangHoverProvider extends AstNodeHoverProvider {
    protected readonly documentationProvider: DocumentationProvider;
    protected readonly commentProvider: CommentProvider;
    protected readonly qualifiedNameProvider: QualifiedNameProvider;

    /**
     * Registry of type-specific hover content generators.
     * Each generator returns content for its node type, or undefined to skip.
     */
    private readonly hoverGenerators: HoverContentGenerator[];

    constructor(services: LangiumServices) {
        super(services);
        this.documentationProvider = services.documentation.DocumentationProvider;
        this.commentProvider = services.documentation.CommentProvider;
        const domainServices = services as DomainLangServices;
        this.qualifiedNameProvider = domainServices.references.QualifiedNameProvider;

        // Register type-specific generators
        this.hoverGenerators = [
            (node, comment) => this.getDomainHover(node, comment),
            (node, comment) => this.getThisRefHover(node, comment),
            (node, comment) => this.getBoundedContextHover(node, comment),
            (node, comment) => this.getNamespaceHover(node, comment),
            (node, comment) => this.getContextMapHover(node, comment),
            (node, comment) => this.getDomainMapHover(node, comment),
            (node, comment) => this.getDecisionHover(node, comment),
            (node, comment) => this.getPolicyHover(node, comment),
            (node, comment) => this.getBusinessRuleHover(node, comment),
            (node, comment) => this.getDomainTermHover(node, comment),
            (node, comment) => this.getTeamHover(node, comment),
            (node, comment) => this.getClassificationHover(node, comment),
            (node, comment) => this.getMetadataHover(node, comment),
            (node, comment) => this.getRelationshipHover(node, comment),
            (node, comment) => this.getImportHover(node, comment),
        ];
    }

    override async getHoverContent(document: LangiumDocument, params: HoverParams): Promise<Hover | undefined> {
        try {
            const rootNode = document.parseResult?.value?.$cstNode;
            if (!rootNode) {
                return undefined;
            }

            const offset = document.textDocument.offsetAt(params.position);
            const cstNode = CstUtils.findDeclarationNodeAtOffset(rootNode, offset, this.grammarConfig.nameRegexp);
            if (!cstNode || cstNode.offset + cstNode.length <= offset) {
                return undefined;
            }

            // Try declaration hover first
            const declarationHover = await this.tryGetDeclarationHover(cstNode);
            if (declarationHover) {
                return declarationHover;
            }

            // Then try keyword hover
            return await this.tryGetKeywordHover(cstNode);
        } catch (error) {
            console.error('Error in getHoverContent:', error);
            return undefined;
        }
    }

    /**
     * Try to get hover for a declaration node (AST node).
     */
    private async tryGetDeclarationHover(cstNode: ReturnType<typeof CstUtils.findDeclarationNodeAtOffset>): Promise<Hover | undefined> {
        if (!cstNode) return undefined;

        const targetNodes = this.references.findDeclarations(cstNode);
        const targetNode = targetNodes?.[0];
        if (targetNode) {
            const content = await this.getAstNodeHoverContent(targetNode);
            if (content) {
                return { contents: { kind: 'markdown', value: content } };
            }
        }

        if (cstNode.astNode && ast.isThisRef(cstNode.astNode)) {
            const content = await this.getAstNodeHoverContent(cstNode.astNode);
            if (content) {
                return { contents: { kind: 'markdown', value: content } };
            }
        }

        return undefined;
    }

    /**
     * Try to get hover for a keyword node.
     * Uses the keyword dictionary for all keywords.
     */
    private async tryGetKeywordHover(cstNode: ReturnType<typeof CstUtils.findDeclarationNodeAtOffset>): Promise<Hover | undefined> {
        if (!cstNode || cstNode.grammarSource?.$type !== 'Keyword') {
            return undefined;
        }

        // Use the keyword dictionary for hover content
        const explanation = keywordExplanations[cstNode.text.toLowerCase()];
        if (explanation) {
            return { contents: { kind: 'markdown', value: `💡 ${explanation}` } };
        }

        return undefined;
    }

    protected getAstNodeHoverContent(node: AstNode): MaybePromise<string | undefined> {
        try {
            const content = this.documentationProvider.getDocumentation(node);
            const commentBlock = content ? `*${content}*\n\n` : '';

            // Try each type-specific generator
            for (const generator of this.hoverGenerators) {
                const result = generator(node, commentBlock);
                if (result !== undefined) {
                    return result;
                }
            }

            // Default fallback for unknown types
            return this.getDefaultHover(node, commentBlock);
        } catch (error) {
            console.error('Error in getAstNodeHoverContent:', error);
            return undefined;
        }
    }

    // ============================================================
    // Type-specific hover generators
    // ============================================================

    private getDomainHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isDomain(node)) return undefined;

        const description = node.description ?? '';
        const vision = node.vision ?? '';
        const typeRef = node.type?.ref;
        const type = this.getRefName(typeRef);

        const signatureParts = ['Domain', node.name];
        if (node.parent?.ref?.name) signatureParts.push('in', node.parent.ref.name);
        const signature = this.codeBlock(signatureParts.join(' '));

        const fields: string[] = [signature];
        if (description) fields.push(description);
        if (vision || type || node.parent) fields.push('---');
        if (vision) fields.push(`**Vision:** ${vision}`);
        if (type) fields.push(`**Type:** ${this.refLink(typeRef, type)}`);
        if (node.parent) fields.push(`**Parent:** ${this.refLink(node.parent)}`);

        return this.formatHover(commentBlock, '📁', 'domain', node.name, fields);
    }

    private getThisRefHover(node: AstNode, _commentBlock: string): string | undefined {
        if (!ast.isThisRef(node)) return undefined;

        let parent = node.$container;
        while (parent) {
            if (
                ast.isDomain(parent) ||
                ast.isBoundedContext(parent) ||
                ast.isNamespaceDeclaration(parent) ||
                ast.isContextMap(parent) ||
                ast.isDomainMap(parent) ||
                ast.isModel(parent)
            ) {
                return this.getAstNodeHoverContent(parent) as string | undefined;
            }
            parent = parent.$container;
        }

        return '*this* refers to the current context';
    }

    private getBoundedContextHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isBoundedContext(node)) return undefined;

        const description = node.description ?? '';
        const classification = effectiveClassification(node);
        const team = effectiveTeam(node);
        const businessModel = node.businessModel?.ref;
        const evolution = node.evolution?.ref;
        const relationships = node.relationships ?? [];
        const terminology = node.terminology ?? [];
        const decisions = node.decisions ?? [];
        const classificationName = classification?.name;
        const teamName = team?.name;

        const signatureParts = ['boundedcontext', node.name];
        if (node.domain?.ref?.name) signatureParts.push('for', node.domain.ref.name);
        if (classificationName) signatureParts.push('as', classificationName);
        if (teamName) signatureParts.push('by', teamName);
        const signature = this.codeBlock(signatureParts.join(' '));

        const fields: string[] = [signature];
        if (description) fields.push(description);
        if (classification || team || businessModel || evolution) fields.push('---');
        if (classification) fields.push(`🔖 **Classification:** ${this.refLink(classification)}`);
        if (team) fields.push(`👥 **Team:** ${this.refLink(team)}`);
        if (businessModel) fields.push(`💼 **Business Model:** ${this.refLink(businessModel)}`);
        if (evolution) fields.push(`🔄 **Evolution:** ${this.refLink(evolution)}`);

        if (relationships.length > 0) {
            const lines = relationships.map(rel => this.formatRelationshipLine(rel));
            fields.push(`**Relationships:**\n${lines.join('\n')}`);
        }
        if (terminology.length > 0) {
            const lines = terminology.map(t => `- \`${t.name}\`: ${t.meaning ?? ''}`);
            fields.push(`**Terminology:**\n${lines.join('\n')}`);
        }
        if (decisions.length > 0) {
            const lines = decisions.map(d => `- \`${d.name}\`: ${d.value ?? ''}`);
            fields.push(`**Decisions:**\n${lines.join('\n')}`);
        }

        return this.formatHover(commentBlock, '📕', 'boundedcontext', node.name, fields);
    }

    private getNamespaceHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isNamespaceDeclaration(node)) return undefined;

        const fields: string[] = [`Contains ${node.children.length} elements.`];
        return this.formatHover(commentBlock, '🧭', 'namespace', node.name, fields);
    }

    private getContextMapHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isContextMap(node)) return undefined;

        const fields: string[] = [];
        if (node.boundedContexts.length > 0) {
            fields.push('---');
            const items = node.boundedContexts.flatMap(bc => 
                bc.items.map(item => `- ${this.refLink(item.ref)}`)
            );
            fields.push(`**📕 Bounded Contexts**\n${items.join('\n')}`);
        }
        if (node.relationships.length > 0) {
            fields.push('---');
            const lines = node.relationships.map(r => this.formatRelationshipLine(r));
            fields.push(`**🔗 Relationships**\n${lines.join('\n')}`);
        }
        return this.formatHover(commentBlock, '🗺️', 'contextmap', node.name, fields);
    }

    private getDomainMapHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isDomainMap(node)) return undefined;

        const fields: string[] = [];
        if (node.domains.length > 0) {
            fields.push('---');
            const items = node.domains.flatMap(d => 
                d.items.map(item => `- ${this.refLink(item.ref)}`)
            );
            fields.push(`**📁 Domains**\n${items.join('\n')}`);
        }
        return this.formatHover(commentBlock, '🗺️', 'domainmap', node.name, fields);
    }

    private getDecisionHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isDecision(node)) return undefined;

        const fields: string[] = [];
        if (node.value) {
            fields.push('---', `*Definition:* ${node.value}`);
        }
        return this.formatHover(commentBlock, '⚖️', 'decision', node.name, fields);
    }

    private getPolicyHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isPolicy(node)) return undefined;

        const fields: string[] = [];
        if (node.value) {
            fields.push('---', `*Definition:* ${node.value}`);
        }
        return this.formatHover(commentBlock, '📜', 'policy', node.name, fields);
    }

    private getBusinessRuleHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isBusinessRule(node)) return undefined;

        const fields: string[] = [];
        if (node.value) {
            fields.push('---', `*Definition:* ${node.value}`);
        }
        return this.formatHover(commentBlock, '⚖️', 'rule', node.name, fields);
    }

    private getDomainTermHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isDomainTerm(node)) return undefined;

        const fields: string[] = [];
        if (node.meaning) {
            fields.push('---', `*${node.meaning}*`);
        }
        return this.formatHover(commentBlock, '🗝️', 'term', node.name, fields);
    }

    private getTeamHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isTeam(node)) return undefined;
        return this.formatHover(commentBlock, '👥', 'team', node.name, []);
    }

    private getClassificationHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isClassification(node)) return undefined;
        return this.formatHover(commentBlock, '🏷️', 'classification', node.name, []);
    }

    private getMetadataHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isMetadata(node)) return undefined;
        return this.formatHover(commentBlock, '🔖', 'metadata', node.name, []);
    }

    private getRelationshipHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isRelationship(node)) return undefined;

        const leftPatterns = node.leftPatterns.join(', ');
        const rightPatterns = node.rightPatterns.join(', ');
        const fields: string[] = [
            `${this.refLink(node.left.link)} ${node.arrow} ${this.refLink(node.right.link)}`
        ];
        if (node.type) fields.push(`**Type:** \`${node.type}\``);
        if (leftPatterns) fields.push(`**Left patterns:** ${leftPatterns}`);
        if (rightPatterns) fields.push(`**Right patterns:** ${rightPatterns}`);

        return this.formatHover(commentBlock, '🔗', 'relationship', undefined, fields);
    }

    private getImportHover(node: AstNode, commentBlock: string): string | undefined {
        if (!ast.isImportStatement(node)) return undefined;

        const fields: string[] = [`**URI:** \`${node.uri}\``];
        if (node.alias) fields.push(`**Alias:** \`${node.alias}\``);
        return this.formatHover(commentBlock, '📦', 'import', undefined, fields);
    }

    private getDefaultHover(node: AstNode, commentBlock: string): string {
        const title = ast.isType(node) ? node.name : node.$type.toLowerCase();
        const typeName = node.$type.toLowerCase();
        const name = ast.isType(node) ? ` ${title}` : '';
        
        const separator = commentBlock ? `${commentBlock}\n\n---\n\n` : '';
        return `${separator}ℹ️ **\`(${typeName})\`${name}**`;
    }

    // ============================================================
    // Helper methods
    // ============================================================

    /**
     * Formats a relationship line for hover display.
     */
    private formatRelationshipLine(rel: ast.Relationship): string {
        const left = this.refLink(rel.left?.link);
        const right = this.refLink(rel.right?.link);
        const type = rel.type ? ` \`${rel.type}\`` : '';
        return `- ${left} ${rel.arrow} ${right}${type}`;
    }

    /**
     * Wraps text in a domain-lang code block.
     */
    private codeBlock(text: string): string {
        return `\`\`\`domain-lang\n${text}\n\`\`\``;
    }

    /**
     * Formats the final hover content with consistent structure.
     */
    private formatHover(
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

    private getRefName(ref: ast.Type | Reference<ast.Type> | undefined): string {
        const node = isReference(ref) ? ref.ref : ref;
        if (node && ast.isType(node)) {
            return node.name;
        }
        return '';
    }

    private refLink(ref: Reference<ast.Type> | ast.Type | undefined, label?: string): string {
        if (label) {
            return `[${label}](#${encodeURIComponent(label)})`;
        }

        const node = isReference(ref) ? ref.ref : ref;

        if (node && ast.isType(node)) {
            let linkLabel = node.name;
            try {
                linkLabel = this.qualifiedNameProvider.getQualifiedName(node.$container, node.name);
            } catch {
                // fallback to name
            }
            return `[${linkLabel}](#${encodeURIComponent(linkLabel)})`;
        }
        return '';
    }

}

