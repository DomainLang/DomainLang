import type {
    AstNode,
    CommentProvider,
    DocumentationProvider,
    LangiumDocument,
    MaybePromise,
    Reference
} from 'langium';
import { AstUtils, CstUtils, isReference } from 'langium';
import type { LangiumServices } from 'langium/lsp';
import { AstNodeHoverProvider } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import * as ast from '../../generated/ast.js';
import type { DomainLangServices } from '../../domain-lang-module.js';
import { QualifiedNameProvider } from '../domain-lang-naming.js';
import type { DomainLangIndexManager } from '../domain-lang-index-manager.js';
import { keywordExplanations } from './domain-lang-keywords.js';
import {
    buildDomainFields,
    buildBcFields,
    formatHoverContent,
} from './hover-builders.js';

/**
 * Type-specific hover content generator.
 * Returns undefined if the generator doesn't handle this node type.
 * @param node - The AST node to generate hover content for
 * @param commentBlock - Documentation comment block
 * @param importAlias - Optional import alias if the node is from an imported document
 */
type HoverContentGenerator = (node: AstNode, commentBlock: string, importAlias?: string) => string | undefined;

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
    protected readonly indexManager: DomainLangIndexManager;

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
        this.indexManager = services.shared.workspace.IndexManager as DomainLangIndexManager;

        // Register type-specific generators
        this.hoverGenerators = [
            (node, comment, alias) => this.getDomainHover(node, comment, alias),
            (node, comment, alias) => this.getThisRefHover(node, comment, alias),
            (node, comment, alias) => this.getBoundedContextHover(node, comment, alias),
            (node, comment, alias) => this.getNamespaceHover(node, comment, alias),
            (node, comment, alias) => this.getContextMapHover(node, comment, alias),
            (node, comment, alias) => this.getDomainMapHover(node, comment, alias),
            (node, comment, alias) => this.getDecisionHover(node, comment, alias),
            (node, comment, alias) => this.getPolicyHover(node, comment, alias),
            (node, comment, alias) => this.getBusinessRuleHover(node, comment, alias),
            (node, comment, alias) => this.getDomainTermHover(node, comment, alias),
            (node, comment, alias) => this.getTeamHover(node, comment, alias),
            (node, comment, alias) => this.getClassificationHover(node, comment, alias),
            (node, comment, alias) => this.getMetadataHover(node, comment, alias),
            (node, comment, alias) => this.getRelationshipHover(node, comment, alias),
            (node, comment, alias) => this.getImportHover(node, comment, alias),
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
            const declarationHover = await this.tryGetDeclarationHover(cstNode, document);
            if (declarationHover) {
                return declarationHover;
            }

            // Then try keyword hover
            return this.tryGetKeywordHover(cstNode);
        } catch (error) {
            console.error('Error in getHoverContent:', error);
            return undefined;
        }
    }

    /**
     * Try to get hover for a declaration node (AST node).
     * For qualified name references, only shows hover when hovering over the last segment.
     * For qualified name declarations (like namespace names), shows hover on any segment.
     */
    private async tryGetDeclarationHover(
        cstNode: ReturnType<typeof CstUtils.findDeclarationNodeAtOffset>,
        document: LangiumDocument
    ): Promise<Hover | undefined> {
        if (!cstNode) return undefined;

        // For qualified name REFERENCES (e.g., "Core.Baunwalls.Jannie" in a BC classification),
        // only show hover on the last segment. But for qualified name DECLARATIONS (like namespace names),
        // show hover on any segment.
        const isNamespaceDeclaration = ast.isNamespaceDeclaration(cstNode.astNode);
        
        if (!isNamespaceDeclaration) {
            // This is a reference context - check if there's a dot immediately after this node
            const fullText = document.textDocument.getText();
            const nodeEndOffset = cstNode.offset + cstNode.length;
            
            // If the next non-whitespace character is a dot, this is not the last segment
            if (nodeEndOffset < fullText.length) {
                const nextChar = fullText.charAt(nodeEndOffset);
                if (nextChar === '.') {
                    // This node is followed by a dot, so it's not the last segment
                    return undefined;
                }
            }
        }

        const targetNodes = this.references.findDeclarations(cstNode);
        const targetNode = targetNodes?.[0];
        if (targetNode) {
            const content = await this.getAstNodeHoverContent(targetNode, document);
            if (content) {
                return { contents: { kind: 'markdown', value: content } };
            }
        }

        if (cstNode.astNode && ast.isThisRef(cstNode.astNode)) {
            const content = await this.getAstNodeHoverContent(cstNode.astNode, document);
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
    private tryGetKeywordHover(cstNode: ReturnType<typeof CstUtils.findDeclarationNodeAtOffset>): Hover | undefined {
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

    protected getAstNodeHoverContent(node: AstNode, currentDocument?: LangiumDocument): MaybePromise<string | undefined> {
        try {
            const content = this.documentationProvider.getDocumentation(node);
            const commentBlock = content ? `*${content}*\n\n` : '';

            // Get import alias if the node is from an imported document
            const importAlias = currentDocument ? this.getImportAliasForNode(node, currentDocument) : undefined;

            // Try each type-specific generator
            for (const generator of this.hoverGenerators) {
                const result = generator(node, commentBlock, importAlias);
                if (result !== undefined) {
                    return result;
                }
            }

            // Default fallback for unknown types
            return this.getDefaultHover(node, commentBlock, importAlias);
        } catch (error) {
            console.error('Error in getAstNodeHoverContent:', error);
            return undefined;
        }
    }

    /**
     * Gets the import alias for a node if it's from an imported document.
     * Returns undefined if the node is in the same document or not imported with an alias.
     */
    private getImportAliasForNode(targetNode: AstNode, currentDocument: LangiumDocument): string | undefined {
        try {
            const targetDoc = AstUtils.getDocument(targetNode);
            const currentDocUri = currentDocument.uri.toString();
            const targetDocUri = targetDoc.uri.toString();

            // If same document, no alias needed
            if (currentDocUri === targetDocUri) {
                return undefined;
            }

            // Look up import info for the current document
            const importInfo = this.indexManager.getImportInfo(currentDocUri);
            
            // Find the import that brings in the target document
            for (const imp of importInfo) {
                if (imp.resolvedUri === targetDocUri && imp.alias) {
                    return imp.alias;
                }
            }

            return undefined;
        } catch (error) {
            console.error('Error getting import alias for node:', error);
            return undefined;
        }
    }

    // ============================================================
    // Type-specific hover generators
    // ============================================================

    private getDomainHover(node: AstNode, commentBlock: string, importAlias?: string): string | undefined {
        if (!ast.isDomain(node)) return undefined;

        const displayName = this.getDisplayNameForHover(node, importAlias);
        const refLink = (ref: ast.Type | undefined, label?: string): string => this.refLink(ref, label);
        const fields = buildDomainFields(node, refLink);
        return formatHoverContent(commentBlock, '📁', 'domain', displayName, fields);
    }

    private getThisRefHover(node: AstNode, _commentBlock: string, _importAlias?: string): string | undefined {
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
                const result = this.getAstNodeHoverContent(parent);
                // getAstNodeHoverContent returns MaybePromise<string | undefined>.
                // All registered hover generators are synchronous, so the result
                // should always be a plain string. Guard defensively in case a
                // future generator becomes async.
                if (typeof result === 'string' || result === undefined) {
                    return result;
                }
                // If somehow a Promise is returned, we cannot await in a sync
                // context - fall through to the default message.
                return undefined;
            }
            parent = parent.$container;
        }

        return '*this* refers to the current context';
    }

    private getBoundedContextHover(node: AstNode, commentBlock: string, importAlias?: string): string | undefined {
        if (!ast.isBoundedContext(node)) return undefined;

        const displayName = this.getDisplayNameForHover(node, importAlias);
        const refLink = (ref: ast.Type | undefined, label?: string): string => this.refLink(ref, label);
        const fields = buildBcFields(
            node,
            refLink,
            (rel) => this.formatRelationshipLine(rel)
        );
        return formatHoverContent(commentBlock, '🎯', 'bounded context', displayName, fields);
    }

    private getNamespaceHover(node: AstNode, commentBlock: string, _importAlias?: string): string | undefined {
        if (!ast.isNamespaceDeclaration(node)) return undefined;

        const fields: string[] = [`Contains ${node.children.length} elements.`];
        return this.formatHover(commentBlock, '🧭', 'namespace', node.name, fields);
    }

    private getContextMapHover(node: AstNode, commentBlock: string, _importAlias?: string): string | undefined {
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

    private getDomainMapHover(node: AstNode, commentBlock: string, _importAlias?: string): string | undefined {
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

    private getDecisionHover(node: AstNode, commentBlock: string, _importAlias?: string): string | undefined {
        if (!ast.isDecision(node)) return undefined;

        const fields: string[] = [];
        if (node.value) {
            fields.push('---', `*Definition:* ${node.value}`);
        }
        return this.formatHover(commentBlock, '⚖️', 'decision', node.name, fields);
    }

    private getPolicyHover(node: AstNode, commentBlock: string, _importAlias?: string): string | undefined {
        if (!ast.isPolicy(node)) return undefined;

        const fields: string[] = [];
        if (node.value) {
            fields.push('---', `*Definition:* ${node.value}`);
        }
        return this.formatHover(commentBlock, '📜', 'policy', node.name, fields);
    }

    private getBusinessRuleHover(node: AstNode, commentBlock: string, _importAlias?: string): string | undefined {
        if (!ast.isBusinessRule(node)) return undefined;

        const fields: string[] = [];
        if (node.value) {
            fields.push('---', `*Definition:* ${node.value}`);
        }
        return this.formatHover(commentBlock, '⚖️', 'rule', node.name, fields);
    }

    private getDomainTermHover(node: AstNode, commentBlock: string, _importAlias?: string): string | undefined {
        if (!ast.isDomainTerm(node)) return undefined;

        const fields: string[] = [];
        if (node.meaning) {
            fields.push('---', `*${node.meaning}*`);
        }
        return this.formatHover(commentBlock, '🗝️', 'term', node.name, fields);
    }

    private getTeamHover(node: AstNode, commentBlock: string, importAlias?: string): string | undefined {
        if (!ast.isTeam(node)) return undefined;
        const displayName = this.getDisplayNameForHover(node, importAlias);
        return this.formatHover(commentBlock, '👥', 'team', displayName, []);
    }

    private getClassificationHover(node: AstNode, commentBlock: string, importAlias?: string): string | undefined {
        if (!ast.isClassification(node)) return undefined;
        const displayName = this.getDisplayNameForHover(node, importAlias);
        return this.formatHover(commentBlock, '🏷️', 'classification', displayName, []);
    }

    private getMetadataHover(node: AstNode, commentBlock: string, importAlias?: string): string | undefined {
        if (!ast.isMetadata(node)) return undefined;
        const displayName = this.getDisplayNameForHover(node, importAlias);
        return this.formatHover(commentBlock, '🔖', 'metadata', displayName, []);
    }

    private getRelationshipHover(node: AstNode, commentBlock: string, _importAlias?: string): string | undefined {
        if (!ast.isRelationship(node)) return undefined;

        const fields: string[] = [
            `${this.refLink(node.left.link)} ${node.arrow ?? '↔'} ${this.refLink(node.right.link)}`
        ];
        if (ast.isDirectionalRelationship(node)) {
            const leftPatterns = node.leftPatterns.map(p => p.$type).join(', ');
            const rightPatterns = node.rightPatterns.map(p => p.$type).join(', ');
            if (leftPatterns) fields.push(`**Left patterns:** ${leftPatterns}`);
            if (rightPatterns) fields.push(`**Right patterns:** ${rightPatterns}`);
        } else if (ast.isSymmetricRelationship(node) && node.pattern) {
            fields.push(`**Pattern:** ${node.pattern.$type}`);
        }

        return this.formatHover(commentBlock, '🔗', 'relationship', undefined, fields);
    }

    private getImportHover(node: AstNode, commentBlock: string, _importAlias?: string): string | undefined {
        if (!ast.isImportStatement(node)) return undefined;

        const fields: string[] = [`**URI:** \`${node.uri}\``];
        if (node.alias) fields.push(`**Alias:** \`${node.alias}\``);
        return this.formatHover(commentBlock, '📦', 'import', undefined, fields);
    }

    private getDefaultHover(node: AstNode, commentBlock: string, _importAlias?: string): string {
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
     * Computes the display name for a node in hover, considering import aliases.
     * If node is imported with an alias, shows `alias.name`, otherwise shows full qualified name.
     */
    private getDisplayNameForHover(node: ast.Type, importAlias?: string): string {
        if (importAlias) {
            return `${importAlias}.${node.name}`;
        }
        try {
            return this.qualifiedNameProvider.getQualifiedName(node.$container, node.name);
        } catch {
            return node.name;
        }
    }

    /**
     * Formats a relationship line for hover display.
     */
    private formatRelationshipLine(rel: ast.Relationship): string {
        const left = this.refLink(rel.left?.link);
        const right = this.refLink(rel.right?.link);
        return `- ${left} ${rel.arrow ?? '↔'} ${right}`;
    }

    /**
     * Formats the final hover content with consistent structure.
     * Delegates to the shared hover-builders utility.
     */
    private formatHover(
        commentBlock: string,
        emoji: string,
        typeName: string,
        name: string | undefined,
        fields: string[]
    ): string {
        return formatHoverContent(commentBlock, emoji, typeName, name, fields);
    }

    private refLink(ref: Reference<ast.Type> | ast.Type | undefined, label?: string): string {
        const node = isReference(ref) ? ref.ref : ref;

        if (!node || !ast.isType(node)) {
            return label ? `\`${label}\`` : '';
        }

        // Get display name (use label if provided, otherwise qualified name)
        let linkLabel: string;
        if (label) {
            linkLabel = label;
        } else {
            try {
                linkLabel = this.qualifiedNameProvider.getQualifiedName(node.$container, node.name);
            } catch {
                linkLabel = node.name;
            }
        }

        // Try to create clickable go-to-definition link
        try {
            const doc = AstUtils.getDocument(node);
            const cstNode = node.$cstNode;
            
            if (doc && cstNode) {
                const range = CstUtils.toDocumentSegment(cstNode).range;
                const line = range.start.line + 1; // LSP lines are 0-indexed, file links use 1-indexed
                const col = range.start.character + 1;
                const uri = doc.uri.toString();
                
                // VS Code recognizes file:// URIs with #Lline,col for go-to-definition
                return `[${linkLabel}](${uri}#L${line},${col})`;
            }
        } catch (error) {
            console.error('Error creating hover link:', error);
        }

        // Fallback to plain text if we can't create a link
        return `\`${linkLabel}\``;
    }

}

