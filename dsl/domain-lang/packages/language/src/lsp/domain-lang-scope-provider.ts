/**
 * DomainLang Scope Provider
 *
 * Implements import-based scoping with alias support and package-boundary transitive imports.
 *
 * **Key Concepts (per ADR-003):**
 * - Elements are only visible if defined in current document OR explicitly imported
 * - Import aliases control visibility: `import "pkg" as ddd` makes types visible as `ddd.*` only
 * - Package-boundary transitive imports: External packages (.dlang/packages/) can re-export
 * - Local file imports remain non-transitive (explicit dependencies only)
 *
 * **Why this matters:**
 * Without this, Langium's DefaultScopeProvider would make ALL indexed documents visible
 * in the global scope, which would:
 * 1. Allow referencing elements that haven't been imported
 * 2. Make the import system meaningless
 * 3. Create confusion about dependencies between files
 *
 * @see https://langium.org/docs/recipes/scoping/ for Langium scoping patterns
 * @see ADR-003 for alias and package-boundary design decisions
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
    MapScope,
    stream
} from 'langium';
import type { DomainLangServices } from '../domain-lang-module.js';
import type { DomainLangIndexManager } from './domain-lang-index-manager.js';
import type { PackageBoundaryDetector } from '../services/package-boundary-detector.js';
import type { ImportInfo } from '../services/types.js';

/**
 * Custom scope provider that restricts cross-file references to imported documents only.
 *
 * Extends Langium's DefaultScopeProvider to override the global scope computation.
 */
export class DomainLangScopeProvider extends DefaultScopeProvider {
    /**
     * Reference to IndexManager for getting resolved imports with aliases.
     */
    private readonly domainLangIndexManager: DomainLangIndexManager;

    /**
     * Detects package boundaries for transitive import resolution.
     */
    private readonly packageBoundaryDetector: PackageBoundaryDetector;

    constructor(services: DomainLangServices) {
        super(services);
        this.domainLangIndexManager = services.shared.workspace.IndexManager as DomainLangIndexManager;
        this.packageBoundaryDetector = services.imports.PackageBoundaryDetector;
    }

    /**
     * Override getGlobalScope to implement alias-scoped and package-boundary transitive imports.
     *
     * The default Langium behavior includes ALL documents in the workspace.
     * We restrict and transform scope to:
     * 1. The current document's own exported symbols
     * 2. Symbols from directly imported documents (with alias prefixing)
     * 3. Symbols from package-boundary transitive imports (external packages only)
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

            const descriptions = this.computeVisibleDescriptions(referenceType, document);
            return new MapScope(descriptions);
        } catch (error) {
            console.error('Error in getGlobalScope:', error);
            return EMPTY_SCOPE;
        }
    }

    /**
     * Computes all visible descriptions for a document, including:
     * - Current document's own symbols
     * - Direct imports (with alias prefixing)
     * - Package-boundary transitive imports
     *
     * @param referenceType - The AST type being referenced
     * @param document - The document making the reference
     * @returns Stream of visible descriptions
     */
    private computeVisibleDescriptions(
        referenceType: string,
        document: LangiumDocument
    ): Stream<AstNodeDescription> {
        const docUri = document.uri.toString();
        const allVisibleDescriptions: AstNodeDescription[] = [];

        // 1. Always include current document's own symbols
        const ownDescriptions = this.indexManager.allElements(referenceType)
            .filter(desc => desc.documentUri.toString() === docUri);
        allVisibleDescriptions.push(...ownDescriptions.toArray());

        // 2. Get import info (with aliases)
        const importInfo = this.domainLangIndexManager.getImportInfo(docUri);

        // Track which documents we've already included to avoid duplicates
        const processedUris = new Set<string>([docUri]);

        // 3. Process each direct import
        for (const imp of importInfo) {
            if (!imp.resolvedUri || processedUris.has(imp.resolvedUri)) {
                continue;
            }

            // Add descriptions from the directly imported document
            this.addDescriptionsFromImport(
                imp,
                referenceType,
                processedUris,
                allVisibleDescriptions
            );

            // 4. Check for package-boundary transitive imports
            this.addPackageBoundaryTransitiveImports(
                imp,
                referenceType,
                document,
                processedUris,
                allVisibleDescriptions
            );
        }

        return stream(allVisibleDescriptions);
    }

    /**
     * Adds descriptions from a single import, applying alias prefixing if needed.
     *
     * @param imp - Import information (specifier, alias, resolved URI)
     * @param referenceType - The AST type being referenced
     * @param processedUris - Set of already-processed URIs to avoid duplicates
     * @param output - Array to append visible descriptions to
     */
    private addDescriptionsFromImport(
        imp: ImportInfo,
        referenceType: string,
        processedUris: Set<string>,
        output: AstNodeDescription[]
    ): void {
        const descriptions = this.indexManager.allElements(referenceType)
            .filter(desc => desc.documentUri.toString() === imp.resolvedUri);

        if (imp.alias) {
            // With alias: prefix all names with alias
            // Example: CoreDomain → ddd.CoreDomain
            for (const desc of descriptions) {
                output.push(this.createAliasedDescription(desc, imp.alias));
            }
        } else {
            // Without alias: use original names
            output.push(...descriptions.toArray());
        }

        processedUris.add(imp.resolvedUri);
    }

    /**
     * Adds package-boundary transitive imports for external packages.
     *
     * When document A imports package document B (e.g., index.dlang),
     * and B imports internal package files C, D, etc. (same package root),
     * then A can see types from C, D, etc. (package re-exports).
     *
     * Local file imports remain non-transitive.
     *
     * @param imp - Import information for the direct import
     * @param referenceType - The AST type being referenced
     * @param currentDocument - The document making the reference
     * @param processedUris - Set of already-processed URIs to avoid duplicates
     * @param output - Array to append visible descriptions to
     */
    private addPackageBoundaryTransitiveImports(
        imp: ImportInfo,
        referenceType: string,
        currentDocument: LangiumDocument,
        processedUris: Set<string>,
        output: AstNodeDescription[]
    ): void {
        // Get the imports of the imported document (B's imports)
        const transitiveImports = this.domainLangIndexManager.getImportInfo(imp.resolvedUri);

        for (const transitiveImp of transitiveImports) {
            if (!transitiveImp.resolvedUri || processedUris.has(transitiveImp.resolvedUri)) {
                continue;
            }

            // Check if both documents are in the same external package
            // (package boundary = same commit directory within .dlang/packages/)
            const samePackage = this.packageBoundaryDetector.areInSamePackageSync(
                imp.resolvedUri,
                transitiveImp.resolvedUri
            );

            if (samePackage) {
                // Within package boundary: include transitive imports
                // Apply the top-level import's alias (if any)
                this.addDescriptionsFromImport(
                    {
                        specifier: transitiveImp.specifier,
                        alias: imp.alias, // Use the top-level import's alias
                        resolvedUri: transitiveImp.resolvedUri
                    },
                    referenceType,
                    processedUris,
                    output
                );
            }
        }
    }

    /**
     * Creates an alias-prefixed version of a description.
     *
     * Example: CoreDomain with alias "ddd" → ddd.CoreDomain
     *
     * @param original - Original description
     * @param alias - Import alias to prefix with
     * @returns New description with prefixed name
     */
    private createAliasedDescription(
        original: AstNodeDescription,
        alias: string
    ): AstNodeDescription {
        return {
            ...original,
            name: `${alias}.${original.name}`
        };
    }
}
