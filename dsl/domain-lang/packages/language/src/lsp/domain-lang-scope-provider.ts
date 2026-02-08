/**
 * DomainLang Scope Provider
 *
 * Implements import-based scoping for the DomainLang DSL.
 *
 * **Key Concept:**
 * Unlike languages with global namespaces, DomainLang enforces strict import-based scoping:
 * - Elements are only visible if they are defined in the current document OR explicitly imported
 * - The global scope is restricted to imported documents only
 * - Transitive imports do NOT provide scope (only direct imports)
 *
 * **Why this matters:**
 * Without this, Langium's DefaultScopeProvider would make ALL indexed documents visible
 * in the global scope, which would:
 * 1. Allow referencing elements that haven't been imported
 * 2. Make the import system meaningless
 * 3. Create confusion about dependencies between files
 *
 * @see https://langium.org/docs/recipes/scoping/ for Langium scoping patterns
 */

import type {
    AstNodeDescription,
    LangiumDocument,
    ReferenceInfo,
    Scope,
    Stream
} from 'langium';
import {
    AstUtils,
    DefaultScopeProvider,
    EMPTY_SCOPE,
    MapScope
} from 'langium';
import type { DomainLangServices } from '../domain-lang-module.js';
import type { DomainLangIndexManager } from './domain-lang-index-manager.js';

/**
 * Custom scope provider that restricts cross-file references to imported documents only.
 *
 * Extends Langium's DefaultScopeProvider to override the global scope computation.
 */
export class DomainLangScopeProvider extends DefaultScopeProvider {
    /**
     * Reference to IndexManager for getting resolved imports.
     */
    private readonly domainLangIndexManager: DomainLangIndexManager;

    constructor(services: DomainLangServices) {
        super(services);
        this.domainLangIndexManager = services.shared.workspace.IndexManager as DomainLangIndexManager;
    }

    /**
     * Override getGlobalScope to restrict it to imported documents only.
     *
     * The default Langium behavior includes ALL documents in the workspace.
     * We restrict this to:
     * 1. The current document's own exported symbols
     * 2. Exported symbols from directly imported documents
     *
     * @param referenceType - The AST type being referenced
     * @param context - Information about the reference
     * @returns A scope containing only visible elements
     */
    protected override getGlobalScope(referenceType: string, context: ReferenceInfo): Scope {
        try {
            const document = AstUtils.getDocument(context.container);
            if (!document) {
                return EMPTY_SCOPE;
            }

            // Get the set of URIs that are in scope for this document
            const importedUris = this.getImportedDocumentUris(document);

            // Filter the global index to only include descriptions from imported documents
            const filteredDescriptions = this.filterDescriptionsByImports(
                referenceType,
                document,
                importedUris
            );

            // Create a scope from the filtered descriptions
            return new MapScope(filteredDescriptions);
        } catch (error) {
            console.error('Error in getGlobalScope:', error);
            return EMPTY_SCOPE;
        }
    }

    /**
     * Gets the set of document URIs that are directly imported by the given document.
     *
     * Uses the resolved imports tracked by DomainLangIndexManager during indexing.
     * This ensures accurate resolution including path aliases.
     *
     * @param document - The document to get imports for
     * @returns Set of imported document URIs (as strings)
     */
    private getImportedDocumentUris(document: LangiumDocument): Set<string> {
        const docUri = document.uri.toString();

        // Get resolved imports from the index manager (tracked during indexing)
        const resolvedImports = this.domainLangIndexManager.getResolvedImports(docUri);

        // Always include the current document itself
        const importedUris = new Set<string>([docUri]);

        // Add all resolved import URIs
        for (const resolvedUri of resolvedImports) {
            importedUris.add(resolvedUri);
        }

        return importedUris;
    }

    /**
     * Filters the global index to only include descriptions from imported documents.
     *
     * @param referenceType - The AST type being referenced
     * @param currentDocument - The document making the reference
     * @param importedUris - Set of URIs that are in scope
     * @returns Stream of filtered descriptions
     */
    private filterDescriptionsByImports(
        referenceType: string,
        currentDocument: LangiumDocument,
        importedUris: Set<string>
    ): Stream<AstNodeDescription> {
        // Get all descriptions of the reference type from the index
        const allDescriptions = this.indexManager.allElements(referenceType);

        // Filter to only those from imported documents
        return allDescriptions.filter(desc => {
            const descDocUri = desc.documentUri.toString();
            return importedUris.has(descDocUri);
        });
    }
}
