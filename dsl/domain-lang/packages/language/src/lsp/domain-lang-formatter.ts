import type { AstNode } from "langium";
import { AbstractFormatter, Formatting } from "langium/lsp";
import * as ast from '../generated/ast.js';

/**
 * Provides formatting for DomainLang documents.
 * Handles indentation and newlines for block-based constructs.
 */
export class DomainLangFormatter extends AbstractFormatter {

    protected format(node: AstNode): void {
        try {
            // Namespace declarations
            if (ast.isNamespaceDeclaration(node)) {
                this.formatBlock(node);
            }
            
            // Domain declarations
            if (ast.isDomain(node)) {
                this.formatBlock(node);
            }
            
            // Bounded contexts
            if (ast.isBoundedContext(node)) {
                this.formatBlock(node);
            }
            
            // Context maps
            if (ast.isContextMap(node)) {
                this.formatBlock(node);
            }
            
            // Domain maps
            if (ast.isDomainMap(node)) {
                this.formatBlock(node);
            }

            // Directional relationships: A [OHS, PL] -> [CF, ACL] B
            if (ast.isDirectionalRelationship(node)) {
                const formatter = this.getNodeFormatter(node);
                // No space inside bracket groups
                formatter.keywords('[').append(Formatting.noSpace());
                formatter.keywords(']').prepend(Formatting.noSpace());
                formatter.keywords(',').append(Formatting.oneSpace());
                // Space after left context name (before [ or ->)
                formatter.property('left').append(Formatting.oneSpace());
                // Space before right context name (after ] or ->)
                formatter.property('right').prepend(Formatting.oneSpace());
                // Arrow gets explicit surrounding space only from bracket-less sides
                // to avoid double-spacing when bracket groups are present
                if (node.leftPatterns.length > 0) {
                    formatter.property('arrow').prepend(Formatting.oneSpace());
                }
                if (node.rightPatterns.length > 0) {
                    formatter.property('arrow').append(Formatting.oneSpace());
                }
            }

            // Symmetric relationships: A [SK] B OR A >< B
            if (ast.isSymmetricRelationship(node)) {
                const formatter = this.getNodeFormatter(node);
                if (node.arrow === '><') {
                    formatter.property('arrow').surround(Formatting.oneSpace());
                }
                // [SK] form: space before [, no space inside brackets, space after ]
                formatter.keywords('[').prepend(Formatting.oneSpace());
                formatter.keywords('[').append(Formatting.noSpace());
                formatter.keywords(']').prepend(Formatting.noSpace());
                formatter.keywords(']').append(Formatting.oneSpace());
            }
        } catch (error) {
            console.error('Error in format:', error);
            // Continue - don't crash formatting
        }
    }
    
    /**
     * Formats a block node with standard indentation and newlines.
     * 
     * @param node - The AST node to format
     */
    private formatBlock(node: AstNode): void {
        const formatter = this.getNodeFormatter(node);
        const open = formatter.keyword('{');
        const close = formatter.keyword('}');
        
        formatter.interior(open, close).prepend(Formatting.indent());
        close.prepend(Formatting.newLine());
    }
}