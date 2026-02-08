/**
 * Custom DocumentSymbolProvider for DomainLang.
 *
 * Extends Langium's DefaultDocumentSymbolProvider to add meaningful
 * `detail` text to outline items, improving the Outline view, breadcrumbs,
 * and Go to Symbol experience.
 *
 * The default provider handles the full AST walk, child nesting, and
 * range computation. We only override `getSymbol` to enrich the detail
 * property with DDD-relevant information (descriptions, visions, counts).
 *
 * @module lsp/domain-lang-document-symbol-provider
 */

import type { AstNode, LangiumDocument } from 'langium';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { CstUtils } from 'langium';
import { DefaultDocumentSymbolProvider } from 'langium/lsp';
import {
    isDomain,
    isBoundedContext,
    isContextMap,
    isDomainMap,
    isNamespaceDeclaration,
    isRelationship,
    isThisRef,
} from '../generated/ast.js';
import type { BoundedContext, Relationship, MetadataEntry } from '../generated/ast.js';

/**
 * Enriches document symbols with DDD-specific detail text and grouping.
 *
 * Detail text shown in the Outline view next to each symbol:
 * - Domain: vision or description
 * - BoundedContext: description or domain name
 * - ContextMap: number of contained contexts
 * - DomainMap: number of contained domains
 * - Namespace: qualified namespace name
 * - Relationship: formatted endpoint summary (e.g., "OrderContext -> PaymentContext")
 * 
 * Grouping: Creates synthetic folder nodes for collections in the grammar:
 * - BoundedContext: decisions, terminology, relationships, metadata
 * 
 * Note: Relationship and MetadataEntry symbols are created manually (not via NameProvider)
 * to avoid polluting the global scope/reference system. These are display-only synthetic symbols.
 */
export class DomainLangDocumentSymbolProvider extends DefaultDocumentSymbolProvider {

    protected override getSymbol(document: LangiumDocument, astNode: AstNode): DocumentSymbol[] {
        try {
            const symbols = super.getSymbol(document, astNode);
            const detail = this.getDetailText(astNode);
            if (detail !== undefined) {
                for (const symbol of symbols) {
                    symbol.detail = detail;
                }
            }
            return symbols;
        } catch (error) {
            console.error('Error in DomainLangDocumentSymbolProvider.getSymbol:', error);
            return super.getSymbol(document, astNode);
        }
    }

    /**
     * Override to add synthetic grouping folders for collections.
     * Groups decisions, terminology, relationships, and metadata under folder nodes.
     */
    protected override getChildSymbols(document: LangiumDocument, astNode: AstNode): DocumentSymbol[] | undefined {
        // Only group for BoundedContext nodes
        if (!isBoundedContext(astNode)) {
            return super.getChildSymbols(document, astNode);
        }

        const grouped: DocumentSymbol[] = [];

        // Process each collection type
        this.addDecisionsFolder(document, astNode, grouped);
        this.addTerminologyFolder(document, astNode, grouped);
        this.addRelationshipsFolder(astNode, grouped);
        this.addMetadataFolder(astNode, grouped);

        return grouped.length > 0 ? grouped : undefined;
    }

    /** Adds decisions folder if collection is non-empty. */
    private addDecisionsFolder(document: LangiumDocument, bc: BoundedContext, grouped: DocumentSymbol[]): void {
        if (bc.decisions && bc.decisions.length > 0) {
            const symbols = bc.decisions.flatMap(d => this.getSymbol(document, d));
            if (symbols.length > 0) {
                grouped.push(this.createFolderSymbol('decisions', symbols));
            }
        }
    }

    /** Adds terminology folder if collection is non-empty. */
    private addTerminologyFolder(document: LangiumDocument, bc: BoundedContext, grouped: DocumentSymbol[]): void {
        if (bc.terminology && bc.terminology.length > 0) {
            const symbols = bc.terminology.flatMap(t => this.getSymbol(document, t));
            if (symbols.length > 0) {
                grouped.push(this.createFolderSymbol('terminology', symbols));
            }
        }
    }

    /** Adds relationships folder with manually created symbols. */
    private addRelationshipsFolder(bc: BoundedContext, grouped: DocumentSymbol[]): void {
        if (bc.relationships && bc.relationships.length > 0) {
            const symbols = bc.relationships.map(r => this.createRelationshipSymbol(r)).filter((s): s is DocumentSymbol => s !== undefined);
            if (symbols.length > 0) {
                grouped.push(this.createFolderSymbol('relationships', symbols));
            }
        }
    }

    /** Adds metadata folder with manually created symbols. */
    private addMetadataFolder(bc: BoundedContext, grouped: DocumentSymbol[]): void {
        if (bc.metadata && bc.metadata.length > 0) {
            const symbols = bc.metadata.map(m => this.createMetadataSymbol(m)).filter((s): s is DocumentSymbol => s !== undefined);
            if (symbols.length > 0) {
                grouped.push(this.createFolderSymbol('metadata', symbols));
            }
        }
    }

    /**
     * Creates a synthetic folder DocumentSymbol for grouping children.
     */
    private createFolderSymbol(name: string, children: DocumentSymbol[]): DocumentSymbol {
        // Use the first child's range for the folder
        const firstChild = children[0];
        
        return DocumentSymbol.create(
            name,
            `${children.length} items`,
            SymbolKind.Object,
            firstChild.range,
            firstChild.selectionRange,
            children
        );
    }

    /**
     * Creates a DocumentSymbol for a Relationship node.
     */
    private createRelationshipSymbol(rel: Relationship): DocumentSymbol | undefined {
        const cstNode = rel.$cstNode;
        if (!cstNode) return undefined;

        const left = isThisRef(rel.left) ? 'this' : rel.left?.link?.ref?.name ?? '?';
        const right = isThisRef(rel.right) ? 'this' : rel.right?.link?.ref?.name ?? '?';
        const name = `${left} → ${right}`;

        const range = CstUtils.toDocumentSegment(cstNode).range;
        return DocumentSymbol.create(
            name,
            undefined,
            SymbolKind.Interface,
            range,
            range
        );
    }

    /**
     * Creates a DocumentSymbol for a MetadataEntry node.
     */
    private createMetadataSymbol(meta: MetadataEntry): DocumentSymbol | undefined {
        const cstNode = meta.$cstNode;
        if (!cstNode) return undefined;

        const name = meta.key?.ref?.name ?? 'unknown';
        const range = CstUtils.toDocumentSegment(cstNode).range;

        return DocumentSymbol.create(
            name,
            meta.value,
            SymbolKind.Field,
            range,
            range
        );
    }

    /**
     * Returns DDD-specific detail text for a given AST node.
     * Shown alongside the symbol name in the Outline view.
     */
    private getDetailText(node: AstNode): string | undefined {
        if (isDomain(node))              return "Domain — " + (node.vision ?? node.description);
        if (isBoundedContext(node))      return this.getBcDetail(node);
        if (isContextMap(node))          return this.pluralize('context', node.boundedContexts?.length ?? 0);
        if (isDomainMap(node))           return this.pluralize('domain', node.domains?.length ?? 0);
        if (isNamespaceDeclaration(node)) return node.name;
        if (isRelationship(node))        return this.formatRelationshipDetail(node);
        return undefined;
    }

    /** Builds BC detail: "BC for DomainName — description". */
    private getBcDetail(node: BoundedContext): string | undefined {
        const parts: string[] = [];
        if (node.domain?.ref?.name) {
            parts.push(`BC for ${node.domain.ref.name}`);
        }
        if (node.description) {
            parts.push(node.description);
        }
        return parts.length > 0 ? parts.join(' — ') : undefined;
    }

    /** Returns "N item(s)" or undefined when count is 0. */
    private pluralize(label: string, count: number): string | undefined {
        if (count === 0) return undefined;
        const suffix = count === 1 ? '' : 's';
        return `${count} ${label}${suffix}`;
    }

    /**
     * Formats a relationship as a compact detail string:
     * e.g., "OrderContext -> PaymentContext"
     */
    private formatRelationshipDetail(
        node: ReturnType<typeof Object> & { left?: unknown; right?: unknown; arrow?: string }
    ): string | undefined {
        try {
            // We know this is a Relationship node thanks to isRelationship guard above
            const rel = node as { left?: { link?: { $refText?: string } }; right?: { link?: { $refText?: string } }; arrow?: string };
            const leftName = this.getRefName(rel.left);
            const rightName = this.getRefName(rel.right);
            const arrow = rel.arrow ?? '->';
            if (leftName && rightName) {
                return `${leftName} ${arrow} ${rightName}`;
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Gets a display name from a BoundedContextRef.
     */
    private getRefName(ref: unknown): string | undefined {
        if (!ref || typeof ref !== 'object') return undefined;

        // Check for ThisRef
        const refObj = ref as Record<string, unknown>;
        if (refObj.$type === 'ThisRef' || isThisRef(ref as AstNode)) {
            return 'this';
        }

        // Check for named reference
        const link = refObj.link as { $refText?: string } | undefined;
        return link?.$refText;
    }
}
