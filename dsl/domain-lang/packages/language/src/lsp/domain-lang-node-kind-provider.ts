/**
 * Custom NodeKindProvider — maps DomainLang AST types to VS Code SymbolKinds.
 *
 * Langium's DefaultNodeKindProvider returns `SymbolKind.Field` for everything.
 * This override provides semantically meaningful icons for the Outline view,
 * breadcrumbs, Go to Symbol, and completion items.
 *
 * @module lsp/domain-lang-node-kind-provider
 */

import { DefaultNodeKindProvider } from 'langium/lsp';
import { CompletionItemKind, SymbolKind } from 'vscode-languageserver';
import type { AstNode, AstNodeDescription } from 'langium';
import {
    isDomain,
    isBoundedContext,
    isTeam,
    isClassification,
    isMetadata,
    isContextMap,
    isDomainMap,
    isNamespaceDeclaration,
    isRelationship,
    isDomainTerm,
    isDecision,
    isPolicy,
    isBusinessRule,
    isMetadataEntry,
} from '../generated/ast.js';

/**
 * AST type to icon kind mapping table.
 */
type KindMapping = readonly [
    guard: (node: AstNode) => boolean,
    symbolKind: SymbolKind,
    completionKind: CompletionItemKind
];

const KIND_MAPPINGS: readonly KindMapping[] = [
    // Strategic design
    [isDomain,                SymbolKind.Namespace,     CompletionItemKind.Folder],
    [isBoundedContext,        SymbolKind.Package,       CompletionItemKind.Module],
    
    // Tactical design
    [isTeam,                  SymbolKind.Interface,     CompletionItemKind.Interface],
    [isClassification,        SymbolKind.Enum,          CompletionItemKind.Enum],
    [isMetadata,              SymbolKind.Enum,          CompletionItemKind.Enum],
    
    // Architecture mapping
    [isContextMap,            SymbolKind.Package,       CompletionItemKind.Module],
    [isDomainMap,             SymbolKind.Package,       CompletionItemKind.Module],
    
    // Module system
    [isNamespaceDeclaration,  SymbolKind.Namespace,     CompletionItemKind.Module],
    
    // Relationships
    [isRelationship,          SymbolKind.Interface,         CompletionItemKind.Interface],
    
    // Documentation & governance
    [isDomainTerm,            SymbolKind.Field,         CompletionItemKind.Field],
    [isDecision,              SymbolKind.Field,         CompletionItemKind.Field],
    [isPolicy,                SymbolKind.Field,         CompletionItemKind.Field],
    [isBusinessRule,          SymbolKind.Field,         CompletionItemKind.Field],
    
    // Metadata entries
    [isMetadataEntry,         SymbolKind.Field,         CompletionItemKind.Field],
] as const;

/**
 * Maps DomainLang AST types to semantically appropriate SymbolKind values.
 *
 * Used by the DocumentSymbolProvider (outline/breadcrumbs), WorkspaceSymbolProvider,
 * and the CompletionProvider.
 */
export class DomainLangNodeKindProvider extends DefaultNodeKindProvider {

    override getSymbolKind(node: AstNode | AstNodeDescription): SymbolKind {
        try {
            const astNode = this.resolveNode(node);
            if (!astNode) return super.getSymbolKind(node);

            for (const [guard, symbolKind] of KIND_MAPPINGS) {
                if (guard(astNode)) return symbolKind;
            }
            return super.getSymbolKind(node);
        } catch (error) {
            console.error('Error in getSymbolKind:', error);
            return super.getSymbolKind(node);
        }
    }

    override getCompletionItemKind(node: AstNode | AstNodeDescription): CompletionItemKind {
        try {
            const astNode = this.resolveNode(node);
            if (!astNode) return super.getCompletionItemKind(node);

            for (const [guard, , completionKind] of KIND_MAPPINGS) {
                if (guard(astNode)) return completionKind;
            }
            return super.getCompletionItemKind(node);
        } catch (error) {
            console.error('Error in getCompletionItemKind:', error);
            return super.getCompletionItemKind(node);
        }
    }

    /**
     * Resolves an AstNode from an AstNodeDescription (which may only have a reference).
     * Returns the node directly if it's already an AstNode.
     */
    private resolveNode(node: AstNode | AstNodeDescription): AstNode | undefined {
        if ('$type' in node) {
            return node;
        }
        // AstNodeDescription — resolve if possible
        return node.node;
    }
}
