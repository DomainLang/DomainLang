/**
 * Completion provider for DomainLang - context-aware, grammar-aligned.
 *
 * **Design:**
 * - Context-aware: Only suggests what's valid at cursor position
 * - Grammar-aligned: Completions match grammar structure exactly
 * - Simple: Uses parent node to determine context
 * - Maintainable: Clear mapping from grammar to completions
 * - Import-aware: Provides completions for local paths, aliases, and dependencies
 */

import type { AstNode, AstNodeDescription, LangiumDocument, ReferenceInfo } from 'langium';
import { AstUtils, GrammarAST } from 'langium';
import { CompletionAcceptor, CompletionContext, DefaultCompletionProvider, NextFeature } from 'langium/lsp';
import { CompletionItemKind, CompletionList, InsertTextFormat, TextEdit } from 'vscode-languageserver';
import type { CancellationToken, CompletionItem, CompletionParams } from 'vscode-languageserver-protocol';
import * as ast from '../generated/ast.js';
import type { DomainLangServices } from '../domain-lang-module.js';
import type { ManifestManager } from '../services/workspace-manager.js';
import type { ModelManifest, DependencySpec } from '../services/types.js';
import { createLogger } from '../services/lsp-logger.js';

const log = createLogger('CompletionProvider');

/** Simple item-only acceptor used by internal helpers that don't require a CompletionContext. */
type ItemAcceptor = (item: CompletionItem) => void;

/**
 * Top-level snippet templates for creating new AST nodes.
 */
const TOP_LEVEL_SNIPPETS = [
    {
        label: '⚡ Domain (simple)',
        kind: CompletionItemKind.Snippet,
        insertText: 'Domain ${1:Name} {}',
        documentation: '📝 Snippet: Create a simple domain',
        sortText: '0_snippet_domain_simple'
    },
    {
        label: '⚡ Domain (detailed)',
        kind: CompletionItemKind.Snippet,
        insertText: [
            'Domain ${1:Name} {',
            '\tdescription: "${2:Description}"',
            '\tvision: "${3:Vision}"',
            '\ttype: ${4:CoreDomain}',
            '}'
        ].join('\n'),
        documentation: '📝 Snippet: Create a domain with description and vision',
        sortText: '0_snippet_domain_detailed'
    },
    {
        label: '⚡ BoundedContext (simple)',
        kind: CompletionItemKind.Snippet,
        insertText: 'bc ${1:Name} for ${2:Domain} as ${3:Core} by ${4:Team}',
        documentation: '📝 Snippet: Quick bounded context definition',
        sortText: '0_snippet_bc_simple'
    },
    {
        label: '⚡ BoundedContext (detailed)',
        kind: CompletionItemKind.Snippet,
        insertText: [
            'BoundedContext ${1:Name} for ${2:Domain} {',
            '\tdescription: "${3:Description}"',
            '\tteam: ${4:Team}',
            '\tclassification: ${5:Core}',
            '\t',
            '\tterminology {',
            '\t\tterm ${6:Term}: "${7:Definition}"',
            '\t}',
            '}'
        ].join('\n'),
        documentation: '📝 Snippet: Full bounded context with all common blocks',
        sortText: '0_snippet_bc_detailed'
    },
    {
        label: '⚡ ContextMap',
        kind: CompletionItemKind.Snippet,
        insertText: [
            'ContextMap ${1:Name} {',
            '\tcontains ${2:Context1}, ${3:Context2}',
            '}'
        ].join('\n'),
        documentation: '📝 Snippet: Create a context map',
        sortText: '0_snippet_contextmap'
    },
    {
        label: '⚡ DomainMap',
        kind: CompletionItemKind.Snippet,
        insertText: [
            'DomainMap ${1:Name} {',
            '\tcontains ${2:Domain1}, ${3:Domain2}',
            '}'
        ].join('\n'),
        documentation: '📝 Snippet: Create a domain map',
        sortText: '0_snippet_domainmap'
    },
    {
        label: '⚡ Team',
        kind: CompletionItemKind.Snippet,
        insertText: 'Team ${1:TeamName}',
        documentation: '📝 Snippet: Define a team',
        sortText: '0_snippet_team'
    },
    {
        label: '⚡ Classification',
        kind: CompletionItemKind.Snippet,
        insertText: 'Classification ${1:Name}',
        documentation: '📝 Snippet: Define a reusable classification label',
        sortText: '0_snippet_classification'
    },
    {
        label: '⚡ Metadata',
        kind: CompletionItemKind.Snippet,
        insertText: 'Metadata ${1:KeyName}',
        documentation: '📝 Snippet: Define a metadata key',
        sortText: '0_snippet_metadata'
    },
    {
        label: '⚡ Namespace',
        kind: CompletionItemKind.Snippet,
        insertText: [
            'Namespace ${1:name.space} {',
            '\t$0',
            '}'
        ].join('\n'),
        documentation: '📝 Snippet: Create a hierarchical namespace',
        sortText: '0_snippet_namespace'
    }
] as const;

export class DomainLangCompletionProvider extends DefaultCompletionProvider {
    private readonly manifestManager: ManifestManager;

    override readonly completionOptions = {
        triggerCharacters: ['.']
    };

    constructor(services: DomainLangServices) {
        super(services);
        this.manifestManager = services.imports.ManifestManager;
    }

    /**
     * Override getCompletion to handle import string completions for incomplete strings.
     *
     * **Why this override is necessary:**
     * When the cursor sits inside an incomplete string token (e.g. `import "partial`)
     * Langium's lexer cannot produce a valid STRING token, so `completionFor()` never
     * fires for the `uri` property.  This override detects the incomplete-string case
     * via regex and returns completions directly.  For all other positions the parent
     * implementation (which routes through `completionFor`) is used.
     */
    override async getCompletion(
        document: LangiumDocument,
        params: CompletionParams,
        cancelToken?: CancellationToken
    ): Promise<CompletionList | undefined> {
        const text = document.textDocument.getText();
        const offset = document.textDocument.offsetAt(params.position);
        const textBefore = text.substring(0, offset);

        // Pattern: import "partial_text (opening quote, no closing quote)
        const importStringPattern = /\b(import|Import)\s+"([^"]*)$/;
        const match = importStringPattern.exec(textBefore);

        if (match) {
            const currentInput = match[2];
            const items = await this.collectImportItems(currentInput);
            return CompletionList.create(items, true);
        }

        const result = await super.getCompletion(document, params, cancelToken);
        return this.segmentDottedCompletions(result, text, offset, document);
    }

    /**
     * Post-process completion results to replace full-FQN items with segmented items
     * when the cursor is at a dotted path.
     *
     * **Why this is necessary:**
     * Langium's `buildContexts` creates a "data type rule" context that triggers our
     * `completionForCrossReference` override, which correctly produces segmented items.
     * However, when the CST is broken (e.g., partial `Core.B` doesn't fully parse as
     * a QualifiedName), `findDataTypeRuleStart` returns `undefined` and only token-based
     * contexts fire. These contexts have features that are ID terminals (not cross-references),
     * so `completionForCrossReference` is never called. Langium's default pipeline then
     * produces full-FQN items like `Core.Baunwalls.Jannie`.
     *
     * This post-processing step catches those FQN items and segments them,
     * ensuring consistent behavior regardless of parse state.
     */
    private segmentDottedCompletions(
        result: CompletionList | undefined,
        text: string,
        offset: number,
        document: LangiumDocument
    ): CompletionList | undefined {
        if (!result?.items?.length) return result;

        // Detect dotted path at cursor by scanning backwards
        const dottedPath = this.extractDottedPathAtCursor(text, offset);
        if (!dottedPath) return result;

        const { fullTyped, fullStart } = dottedPath;
        const lastDotIndex = fullTyped.lastIndexOf('.');
        const prefix = fullTyped.substring(0, lastDotIndex + 1);
        const partial = fullTyped.substring(lastDotIndex + 1);

        // If completionForCrossReference already produced segmented items, just clean up
        if (result.items.some(item => !item.label.includes('.') && item.filterText?.startsWith(prefix))) {
            const prefixRoot = prefix.substring(0, prefix.length - 1);
            result.items = result.items.filter(item =>
                !item.label.includes('.') || !item.label.startsWith(prefixRoot)
            );
            return result;
        }

        // No segmented items — transform FQN items into segmented items
        const startPos = document.textDocument.positionAt(fullStart);
        const endPos = document.textDocument.positionAt(offset);
        const positions = { startPos, endPos };
        const seenSegments = new Set<string>();
        const newItems: CompletionItem[] = [];
        for (const item of result.items) {
            const segmented = this.segmentSingleItem(
                item, prefix, partial, fullTyped, positions, seenSegments
            );
            if (segmented) newItems.push(segmented);
        }
        return CompletionList.create(newItems, true);
    }

    /** Transform a single FQN item into a segmented item, or keep non-matching items. */
    private segmentSingleItem(
        item: CompletionItem,
        prefix: string,
        partial: string,
        fullTyped: string,
        positions: { startPos: { line: number; character: number }; endPos: { line: number; character: number } },
        seenSegments: Set<string>
    ): CompletionItem | undefined {
        const itemName = item.label;

        // Keep non-matching items (keywords, snippets, etc.)
        if (!itemName.startsWith(prefix)) {
            if (!itemName.includes('.') || itemName.split('.')[0] !== fullTyped.split('.')[0]) {
                return item;
            }
            return undefined;
        }

        const remainder = itemName.substring(prefix.length);
        const dotIndex = remainder.indexOf('.');
        const segment = dotIndex === -1 ? remainder : remainder.substring(0, dotIndex);

        if (!segment || seenSegments.has(segment)) return undefined;
        if (partial && !segment.toLowerCase().startsWith(partial.toLowerCase())) return undefined;

        seenSegments.add(segment);

        const isLeaf = dotIndex === -1;
        const fullInsertText = prefix + segment;
        return {
            label: segment,
            kind: isLeaf ? (item.kind ?? CompletionItemKind.Reference) : CompletionItemKind.Module,
            detail: isLeaf ? itemName : 'Namespace',
            sortText: segment,
            filterText: fullInsertText,
            textEdit: TextEdit.replace(
                { start: positions.startPos, end: positions.endPos },
                fullInsertText
            ),
        };
    }

    /**
     * Scan backwards from cursor to find a dotted identifier path.
     * Returns the full typed text and start position, or undefined if no dots found.
     *
     * This is intentionally cursor-based (not tokenOffset-based) to be robust
     * across all Langium completion contexts.
     */
    private extractDottedPathAtCursor(
        text: string,
        offset: number
    ): { fullTyped: string; fullStart: number } | undefined {
        // Walk backwards from cursor through the current partial identifier
        let pos = offset - 1;
        while (pos >= 0 && /\w/.test(text[pos])) pos--;

        // Walk backwards through `.ID` pairs to find start of dotted path
        pos = this.walkBackThroughDotIdPairs(text, pos);

        const fullStart = pos + 1;
        const fullTyped = text.substring(fullStart, offset);

        if (!fullTyped.includes('.')) return undefined;
        return { fullTyped, fullStart };
    }

    /** Walk backwards through `.ID` pairs from the given position. */
    private walkBackThroughDotIdPairs(text: string, pos: number): number {
        while (pos >= 0) {
            const preSpace = pos;
            while (pos >= 0 && text[pos] === ' ') pos--;
            if (pos < 0 || text[pos] !== '.') return preSpace;
            pos--; // skip dot
            while (pos >= 0 && text[pos] === ' ') pos--;
            if (pos < 0 || !/\w/.test(text[pos])) return preSpace;
            while (pos >= 0 && /\w/.test(text[pos])) pos--;
        }
        return pos;
    }

    /**
     * Collect import completion items for a given partial input string.
     *
     * Shared by both the `getCompletion` override (incomplete string case)
     * and the `completionFor` path (normal Langium feature-based routing).
     */
    private async collectImportItems(currentInput: string): Promise<CompletionItem[]> {
        let manifest: ModelManifest | undefined;
        try {
            manifest = await this.manifestManager.ensureManifestLoaded();
        } catch {
            // Continue with undefined manifest – will show basic starters
        }

        const items: CompletionItem[] = [];
        const ia: ItemAcceptor = (item) => items.push(item);

        if (currentInput === '' || !currentInput) {
            this.addAllStarterOptions(ia, manifest);
        } else if (currentInput.startsWith('@')) {
            this.addAliasCompletions(ia, currentInput, manifest);
        } else if (currentInput.startsWith('./') || currentInput.startsWith('../')) {
            this.addLocalPathStarters(ia);
        } else if (currentInput.includes('/') && !currentInput.startsWith('.')) {
            this.addDependencyCompletions(ia, currentInput, manifest);
        } else {
            this.addFilteredOptions(ia, currentInput, manifest);
        }

        return items;
    }

    protected override async completionFor(
        context: CompletionContext,
        next: NextFeature,
        acceptor: CompletionAcceptor
    ): Promise<void> {
        try {
            await this.safeCompletionFor(context, next, acceptor);
        } catch (error) {
            log.error('Error in completionFor', { error: error instanceof Error ? error.message : String(error) });
            // Fall back to default completion on error
            await super.completionFor(context, next, acceptor);
        }
    }

    /**
     * Override cross-reference completion to provide dot-segmented completions.
     *
     * When the user types a dotted prefix (e.g., `Core.`), only the next
     * namespace segment is shown instead of the full qualified name —
     * matching how modern IDEs handle hierarchical completions.
     *
     * Example: Scope contains `Core.CoreDomain`, `Core.BaunWalls.Jannie`, `Core.BaunWalls.Anna`
     * - No dots typed → default FQN labels: `Core.CoreDomain`, `Core.BaunWalls.Jannie`, ...
     * - `Core.` typed → segmented: `CoreDomain`, `BaunWalls`
     * - `Core.BaunWalls.` typed → segmented: `Jannie`, `Anna`
     */
    protected override completionForCrossReference(
        context: CompletionContext,
        next: NextFeature<GrammarAST.CrossReference>,
        acceptor: CompletionAcceptor
    ): void | Promise<void> {
        const text = context.textDocument.getText();
        const fullStart = this.walkBackThroughDotIdPairs(text, context.tokenOffset - 1) + 1;
        const fullTyped = text.substring(fullStart, context.offset);

        // Without dots, use Langium's default FQN-based completion
        if (!fullTyped.includes('.')) {
            return super.completionForCrossReference(context, next, acceptor);
        }

        // Build ReferenceInfo to query the scope — replicating what super does
        // but without going through super's fuzzy-matching pipeline.
        const assignment = AstUtils.getContainerOfType(
            next.feature, GrammarAST.isAssignment
        );
        if (!assignment || !context.node) return;

        let node: AstNode = context.node;
        if (next.type) {
            node = {
                $type: next.type,
                $container: node,
                $containerProperty: next.property,
            } as AstNode;
            AstUtils.assignMandatoryProperties(this.astReflection, node);
        }
        const refInfo: ReferenceInfo = {
            reference: { $refText: '', ref: undefined },
            container: node,
            property: assignment.feature,
        };

        const candidates = this.getReferenceCandidates(refInfo, context);
        this.acceptSegmentedCandidates(context, candidates, fullTyped, fullStart, acceptor);
    }

    /**
     * Iterate scope candidates and emit segmented completion items.
     * Splits FQN candidates by the typed prefix, extracting only the next segment.
     */
    private acceptSegmentedCandidates(
        context: CompletionContext,
        candidates: ReturnType<DefaultCompletionProvider['getReferenceCandidates']>,
        fullTyped: string,
        fullStart: number,
        acceptor: CompletionAcceptor
    ): void {
        const lastDotIndex = fullTyped.lastIndexOf('.');
        const prefix = fullTyped.substring(0, lastDotIndex + 1);
        const partial = fullTyped.substring(lastDotIndex + 1);

        const seenSegments = new Set<string>();
        const startPos = context.textDocument.positionAt(fullStart);
        const endPos = context.textDocument.positionAt(context.offset);

        candidates.forEach((candidate: AstNodeDescription) => {
            const fullName = candidate.name;
            if (!fullName.startsWith(prefix)) return;

            const remainder = fullName.substring(prefix.length);
            const dotIndex = remainder.indexOf('.');
            const segment = dotIndex === -1 ? remainder : remainder.substring(0, dotIndex);

            if (!segment || seenSegments.has(segment)) return;
            if (partial && !segment.toLowerCase().startsWith(partial.toLowerCase())) return;

            seenSegments.add(segment);

            const isLeaf = dotIndex === -1;
            const fullInsertText = prefix + segment;
            acceptor(context, {
                label: segment,
                kind: isLeaf ? this.nodeKindProvider.getCompletionItemKind(candidate) : CompletionItemKind.Module,
                detail: isLeaf ? fullName : 'Namespace',
                sortText: segment,
                // filterText MUST include the full dotted prefix so VS Code's
                // client-side filter can match "Core.B" against "Core.BaunWalls".
                // Without this, VS Code uses `label` ('BaunWalls') for filtering,
                // which fails to match the typed text 'Core.B'.
                filterText: fullInsertText,
                textEdit: {
                    newText: fullInsertText,
                    range: { start: startPos, end: endPos },
                },
            });
        });
    }

    private async safeCompletionFor(
        context: CompletionContext,
        next: NextFeature,
        acceptor: CompletionAcceptor
    ): Promise<void> {
        const node = context.node;
        if (!node) {
            await super.completionFor(context, next, acceptor);
            return;
        }

        // Strategy: Check node type and container to determine what's allowed at cursor position
        
        // Handle import statement completions
        if (this.isImportUriCompletion(node, context, next)) {
            // Add async import completions (ensures manifest is loaded)
            await this.addImportCompletions(context, acceptor, node);
            // Don't call super - we handle import string completions ourselves
            return;
        }
        
        // Check if cursor is after the node (for top-level positioning)
        const offset = context.offset;
        const nodeEnd = node.$cstNode?.end ?? 0;
        const isAfterNode = offset >= nodeEnd;
        
        // If we're positioned after a BC/Domain (e.g., on next line): show top-level
        if ((ast.isBoundedContext(node) || ast.isDomain(node)) && isAfterNode) {
            this.addTopLevelSnippets(acceptor, context);
            // Let Langium provide keywords like "bc", "Domain", etc.
            await super.completionFor(context, next, acceptor);
            return;
        }
        
        // Handle node-level completions
        if (await this.handleNodeCompletions(node, acceptor, context, next)) {
            return;
        }

        // Handle container-level completions
        const container = node.$container;
        if (await this.handleContainerCompletions(container, node, acceptor, context, next)) {
            return;
        }

        // Let Langium handle default completions
        await super.completionFor(context, next, acceptor);
    }

    /**
     * Detect if we're completing inside an import statement's uri property.
     * 
     * This checks:
     * 1. The NextFeature's type and property (when completing STRING for uri)
     * 2. The current AST node (when inside an ImportStatement)
     * 3. Text-based pattern matching (fallback for edge cases)
     */
    private isImportUriCompletion(
        node: AstNode,
        context: CompletionContext,
        next: NextFeature
    ): boolean {
        // Check 1: NextFeature indicates we're completing uri property of ImportStatement
        if (next.type === 'ImportStatement' && next.property === 'uri') {
            return true;
        }
        
        // Check 2: The feature is an Assignment to 'uri' property
        if (GrammarAST.isAssignment(next.feature) && next.feature.feature === 'uri') {
            return true;
        }
        
        // Check 3: Any ancestor (including self) is ImportStatement
        let current: AstNode | undefined = node;
        while (current) {
            if (ast.isImportStatement(current)) return true;
            current = current.$container;
        }
        
        // Check 4: Text-based pattern matching (fallback for edge cases)
        const textBefore = context.textDocument.getText().substring(0, context.offset);
        return /\bimport\s+"[^"]*$/i.test(textBefore);
    }

    /**
     * Add import completions asynchronously.
     * This method ensures the manifest is loaded before providing completions.
     */
    private async addImportCompletions(
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        _node: AstNode
    ): Promise<void> {
        // Extract what user has typed inside the import string
        const importTextBefore = context.textDocument.getText().substring(0, context.offset);
        const importMatch = /\bimport\s+"([^"]*)$/i.exec(importTextBefore);
        const currentInput = importMatch ? importMatch[1] : '';

        // Ensure manifest is loaded (async)
        let manifest: ModelManifest | undefined;
        try {
            manifest = await this.manifestManager.ensureManifestLoaded();
        } catch {
            // Continue with undefined manifest – will show basic starters
        }

        const ia: ItemAcceptor = (item) => acceptor(context, item);

        if (currentInput.startsWith('@')) {
            // Alias completions
            this.addAliasCompletions(ia, currentInput, manifest);
        } else if (currentInput.startsWith('./') || currentInput.startsWith('../')) {
            // Local path completions
            this.addLocalPathStarters(ia);
        } else if (currentInput === '' || !currentInput) {
            // Show all starter options
            this.addAllStarterOptions(ia, manifest);
        } else if (currentInput.includes('/') && !currentInput.startsWith('.')) {
            // External dependency - filter by partial input
            this.addDependencyCompletions(ia, currentInput, manifest);
        } else {
            // Show all options for partial input (e.g., typing 'l' should show matching items)
            this.addFilteredOptions(ia, currentInput, manifest);
        }
    }

    /**
     * Add local path starters.
     * @remarks
     * Not implemented: listing local directory entries requires async fs access
     * which is not available in the synchronous completion context.
     * TODO: Implement using vscode.workspace.fs or a dedicated async completion path.
     */
    private addLocalPathStarters(acceptor: ItemAcceptor): void {
        // Would need async fs access to list directories
        // For now, just acknowledge the path exists
        acceptor({
            label: '(type path)',
            kind: CompletionItemKind.Text,
            insertText: '',
            documentation: 'Continue typing the file path',
            sortText: 'z_'
        });
    }

    /**
     * Add all starter options when input is empty.
     */
    private addAllStarterOptions(
        acceptor: ItemAcceptor,
        manifest?: ModelManifest
    ): void {
        // Local starters
        acceptor({
            label: './',
            kind: CompletionItemKind.Folder,
            insertText: './',
            documentation: 'Import from current directory',
            sortText: '0_local_current'
        });
        acceptor({
            label: '../',
            kind: CompletionItemKind.Folder,
            insertText: '../',
            documentation: 'Import from parent directory',
            sortText: '0_local_parent'
        });

        // Add aliases if available
        if (manifest?.paths) {
            for (const alias of Object.keys(manifest.paths)) {
                acceptor({
                    label: alias,
                    kind: CompletionItemKind.Module,
                    detail: `→ ${manifest.paths[alias]}`,
                    documentation: `Path alias from model.yaml`,
                    insertText: alias,
                    sortText: `1_alias_${alias}`
                });
            }
        }

        // Add dependencies if available
        if (manifest?.dependencies) {
            for (const [depKey, depSpec] of Object.entries(manifest.dependencies)) {
                const dep: DependencySpec = depSpec;
                const depName = typeof dep === 'string' ? depKey : (dep.source ?? depKey);
                const version = typeof dep === 'string' ? dep : (dep.ref ?? 'latest');
                
                acceptor({
                    label: depName,
                    kind: CompletionItemKind.Module,
                    detail: `📦 ${version}`,
                    documentation: `External dependency from model.yaml`,
                    insertText: depName,
                    sortText: `2_dep_${depName}`
                });
            }
        }
    }

    /**
     * Add alias completions that match the current input.
     */
    private addAliasCompletions(
        acceptor: ItemAcceptor,
        currentInput: string,
        manifest?: ModelManifest
    ): void {
        if (!manifest?.paths) {
            return;
        }

        const inputLower = currentInput.toLowerCase();

        for (const [alias, targetPath] of Object.entries(manifest.paths)) {
            if (alias.toLowerCase().startsWith(inputLower)) {
                acceptor({
                    label: alias,
                    kind: CompletionItemKind.Module,
                    detail: `→ ${targetPath}`,
                    documentation: `Path alias defined in model.yaml\nMaps to: ${targetPath}`,
                    insertText: alias,
                    sortText: `1_alias_${alias}`
                });
            }
        }
    }

    /**
     * Add dependency completions that match the current input.
     */
    private addDependencyCompletions(
        acceptor: ItemAcceptor,
        currentInput: string,
        manifest?: ModelManifest
    ): void {
        if (!manifest?.dependencies) {
            return;
        }

        const inputLower = currentInput.toLowerCase();

        for (const [depKey, depSpec] of Object.entries(manifest.dependencies)) {
            const dep: DependencySpec = depSpec;
            const depName = typeof dep === 'string' ? depKey : (dep.source ?? depKey);
            const version = typeof dep === 'string' ? dep : (dep.ref ?? 'latest');
            
            if (depName.toLowerCase().startsWith(inputLower)) {
                acceptor({
                    label: depName,
                    kind: CompletionItemKind.Module,
                    detail: `📦 ${version}`,
                    documentation: `External dependency from model.yaml\nVersion: ${version}`,
                    insertText: depName,
                    sortText: `2_dep_${depName}`
                });
            }
        }
    }

    /**
     * Add filtered options for partial input that doesn't start with special characters.
     * Shows aliases and dependencies that match the user's partial input.
     */
    private addFilteredOptions(
        acceptor: ItemAcceptor,
        currentInput: string,
        manifest?: ModelManifest
    ): void {
        // Offer local path starters when the partial input could match ./ or ../
        if ('./'.startsWith(currentInput) || '../'.startsWith(currentInput)) {
            acceptor({
                label: './',
                kind: CompletionItemKind.Folder,
                insertText: './',
                documentation: 'Import from current directory',
                sortText: '0_local_current'
            });
            acceptor({
                label: '../',
                kind: CompletionItemKind.Folder,
                insertText: '../',
                documentation: 'Import from parent directory',
                sortText: '0_local_parent'
            });
        }

        // Delegate to existing helpers for alias and dependency filtering
        this.addAliasCompletions(acceptor, currentInput, manifest);
        this.addDependencyCompletions(acceptor, currentInput, manifest);
    }

    private async handleNodeCompletions(
        node: AstNode,
        acceptor: CompletionAcceptor,
        context: CompletionContext,
        next: NextFeature
    ): Promise<boolean> {
        // If we're AT a BoundedContext node: only BC documentation blocks
        if (ast.isBoundedContext(node)) {
            this.addBoundedContextCompletions(node, acceptor, context);
            await super.completionFor(context, next, acceptor);
            return true;
        }

        // If we're AT a Domain node: only Domain documentation blocks
        if (ast.isDomain(node)) {
            this.addDomainCompletions(node, acceptor, context);
            await super.completionFor(context, next, acceptor);
            return true;
        }

        // If we're AT a ContextMap node: relationships and contains
        if (ast.isContextMap(node)) {
            this.addContextMapCompletions(node, acceptor, context);
            await super.completionFor(context, next, acceptor);
            return true;
        }

        // If we're AT a DomainMap node: contains
        if (ast.isDomainMap(node)) {
            this.addDomainMapCompletions(node, acceptor, context);
            await super.completionFor(context, next, acceptor);
            return true;
        }

        // If we're AT the Model or NamespaceDeclaration level: all top-level constructs
        if (ast.isModel(node) || ast.isNamespaceDeclaration(node)) {
            this.addTopLevelSnippets(acceptor, context);
            acceptor(context, {
                label: '⚡ import',
                kind: CompletionItemKind.Snippet,
                insertText: 'import "${1:./path}"',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Import another DomainLang file',
                sortText: '0_snippet_import'
            });
            await super.completionFor(context, next, acceptor);
            return true;
        }

        return false;
    }

    private async handleContainerCompletions(
        container: AstNode | undefined,
        node: AstNode,
        acceptor: CompletionAcceptor,
        context: CompletionContext,
        next: NextFeature
    ): Promise<boolean> {
        if (!container) {
            return false;
        }

        // Inside BoundedContext body: suggest missing scalar properties and collections
        if (ast.isBoundedContext(container)) {
            this.addBoundedContextCompletions(container, acceptor, context);
            await super.completionFor(context, next, acceptor);
            return true;
        }

        // Inside Domain body: suggest missing scalar properties
        if (ast.isDomain(container)) {
            this.addDomainCompletions(container, acceptor, context);
            await super.completionFor(context, next, acceptor);
            return true;
        }

        // Inside ContextMap body: relationships and contains
        if (ast.isContextMap(container)) {
            this.addContextMapCompletions(container, acceptor, context);
            await super.completionFor(context, next, acceptor);
            return true;
        }

        // Inside DomainMap body: contains
        if (ast.isDomainMap(container)) {
            this.addDomainMapCompletions(container, acceptor, context);
            await super.completionFor(context, next, acceptor);
            return true;
        }

        if (ast.isRelationship(node) || ast.isRelationship(container)) {
            this.addRelationshipCompletions(acceptor, context);
            await super.completionFor(context, next, acceptor);
            return true;
        }

        // Top level container (Model or NamespaceDeclaration): all top-level constructs
        if (ast.isModel(container) || ast.isNamespaceDeclaration(container)) {
            this.addTopLevelSnippets(acceptor, context);
            return true;
        }

        return false;
    }

    private addTopLevelSnippets(acceptor: CompletionAcceptor, context: CompletionContext): void {
        for (const snippet of TOP_LEVEL_SNIPPETS) {
            acceptor(context, {
                label: snippet.label,
                kind: snippet.kind,
                insertText: snippet.insertText,
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: snippet.documentation,
                sortText: snippet.sortText
            });
        }
    }

    /**
     * Add property/collection completions for BoundedContext.
     */
    private addBoundedContextCompletions(
        node: ast.BoundedContext,
        acceptor: CompletionAcceptor,
        context: CompletionContext
    ): void {
        if (!node.description) {
            acceptor(context, {
                label: '⚡ description',
                kind: CompletionItemKind.Snippet,
                insertText: 'description: "${1:Description}"',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Describe the bounded context\'s responsibility',
                sortText: '0_snippet_description'
            });
        }

        if (node.team.length === 0) {
            acceptor(context, {
                label: '⚡ team',
                kind: CompletionItemKind.Snippet,
                insertText: 'team: ${1:TeamName}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Assign the responsible team',
                sortText: '0_snippet_team'
            });
        }

        if (node.classification.length === 0) {
            acceptor(context, {
                label: '⚡ classification',
                kind: CompletionItemKind.Snippet,
                insertText: 'classification: ${1:Core}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Assign the strategic classification (Core, Supporting, Generic)',
                sortText: '0_snippet_classification'
            });
        }

        if (!node.businessModel) {
            acceptor(context, {
                label: '⚡ businessModel',
                kind: CompletionItemKind.Snippet,
                insertText: 'businessModel: ${1:Commercial}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Classify the business model',
                sortText: '0_snippet_businessModel'
            });
        }

        if (!node.evolution) {
            acceptor(context, {
                label: '⚡ evolution',
                kind: CompletionItemKind.Snippet,
                insertText: 'evolution: ${1:Product}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Define the evolution stage (Genesis, Custom, Product, Commodity)',
                sortText: '0_snippet_evolution'
            });
        }

        if (node.terminology.length === 0) {
            acceptor(context, {
                label: '⚡ terminology',
                kind: CompletionItemKind.Snippet,
                insertText: [
                    'terminology {',
                    '\tterm ${1:Term}: "${2:Definition}"',
                    '}'
                ].join('\n'),
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Define ubiquitous language terms',
                sortText: '0_snippet_terminology'
            });
        }

        if (node.decisions.length === 0) {
            acceptor(context, {
                label: '⚡ decisions',
                kind: CompletionItemKind.Snippet,
                insertText: [
                    'decisions {',
                    '\tdecision [${1|technical,business|}] ${2:DecisionName}: "${3:Rationale}"',
                    '}'
                ].join('\n'),
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Document architectural decisions',
                sortText: '0_snippet_decisions'
            });
        }

        if (node.relationships.length === 0) {
            acceptor(context, {
                label: '⚡ relationships',
                kind: CompletionItemKind.Snippet,
                insertText: [
                    'relationships {',
                    '\t${1:Context1} -> ${2:Context2}',
                    '}'
                ].join('\n'),
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Define relationships with other bounded contexts',
                sortText: '0_snippet_relationships'
            });
        }

        if (node.metadata.length === 0) {
            acceptor(context, {
                label: '⚡ metadata',
                kind: CompletionItemKind.Snippet,
                insertText: [
                    'metadata {',
                    '\t${1:Language}: "${2:TypeScript}"',
                    '}'
                ].join('\n'),
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Add metadata key-value pairs',
                sortText: '0_snippet_metadata'
            });
        }
    }

    /**
     * Add property completions for Domain.
     */
    private addDomainCompletions(
        node: ast.Domain,
        acceptor: CompletionAcceptor,
        context: CompletionContext
    ): void {
        if (!node.description) {
            acceptor(context, {
                label: '⚡ description',
                kind: CompletionItemKind.Snippet,
                insertText: 'description: "${1:Description}"',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Describe what this domain encompasses',
                sortText: '0_snippet_description'
            });
        }

        if (!node.vision) {
            acceptor(context, {
                label: '⚡ vision',
                kind: CompletionItemKind.Snippet,
                insertText: 'vision: "${1:Vision statement}"',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Define the strategic vision for this domain',
                sortText: '0_snippet_vision'
            });
        }

        if (!node.type) {
            acceptor(context, {
                label: '⚡ type',
                kind: CompletionItemKind.Snippet,
                insertText: 'type: ${1:Core}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: '📝 Snippet: Classify as Core, Supporting, or Generic domain type',
                sortText: '0_snippet_type'
            });
        }
    }

    /**
     * Add completions for ContextMap.
     * Suggests relationship patterns and context references.
     */
    private addContextMapCompletions(
        node: ast.ContextMap,
        acceptor: CompletionAcceptor,
        context: CompletionContext
    ): void {
        // Suggest contains if no contexts yet
        if (node.boundedContexts.length === 0) {
            acceptor(context, {
                label: 'contains',
                kind: CompletionItemKind.Keyword,
                insertText: 'contains ${1:Context1}, ${2:Context2}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: 'Add bounded contexts to this map',
                sortText: '0_contains'
            });
        }

        // Always suggest relationship snippet
        acceptor(context, {
            label: 'relationship (simple)',
            kind: CompletionItemKind.Snippet,
            insertText: '${1:Context1} -> ${2:Context2}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: 'Add a simple upstream-downstream relationship',
            sortText: '1_relationship_simple'
        });

        acceptor(context, {
            label: 'relationship (with patterns)',
            kind: CompletionItemKind.Snippet,
            insertText: '${1:Context1} [${2|OHS,PL,ACL,CF,S,BBoM|}] -> [${3|CF,ACL,C,BBoM|}] ${4:Context2}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: 'Add a directional relationship with side patterns',
            sortText: '1_relationship_patterns'
        });

        acceptor(context, {
            label: 'relationship (symmetric)',
            kind: CompletionItemKind.Snippet,
            insertText: '${1:Context1} [${2|SK,P,SW|}] ${3:Context2}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: 'Add a symmetric relationship (Shared Kernel, Partnership, or Separate Ways)',
            sortText: '1_relationship_symmetric'
        });
    }

    /**
     * Add completions for DomainMap.
     * Suggests domain references.
     */
    private addDomainMapCompletions(
        node: ast.DomainMap,
        acceptor: CompletionAcceptor,
        context: CompletionContext
    ): void {
        // Suggest contains if no domains yet
        if (node.domains.length === 0) {
            acceptor(context, {
                label: 'contains',
                kind: CompletionItemKind.Keyword,
                insertText: 'contains ${1:Domain1}, ${2:Domain2}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: 'Add domains to this map',
                sortText: '0_contains'
            });
        }
    }

    /**
     * Add completions for relationships.
     * Provides integration patterns and relationship types.
     */
    private addRelationshipCompletions(
        acceptor: CompletionAcceptor,
        context: CompletionContext
    ): void {
        // Side patterns (for directional relationships)
        const sidePatterns = [
            { label: 'OHS (Open Host Service)', insertText: '[OHS]', doc: 'Open Host Service — upstream side pattern' },
            { label: 'PL (Published Language)', insertText: '[PL]', doc: 'Published Language — upstream side pattern' },
            { label: 'CF (Conformist)', insertText: '[CF]', doc: 'Conformist — downstream side pattern' },
            { label: 'ACL (Anti-Corruption Layer)', insertText: '[ACL]', doc: 'Anti-Corruption Layer — downstream side pattern' },
            { label: 'S (Supplier)', insertText: '[S]', doc: 'Supplier — upstream side (Customer/Supplier)' },
            { label: 'C (Customer)', insertText: '[C]', doc: 'Customer — downstream side (Customer/Supplier)' },
            { label: 'BBoM (Big Ball of Mud)', insertText: '[BBoM]', doc: 'Big Ball of Mud — either side' },
        ];

        for (const pattern of sidePatterns) {
            acceptor(context, {
                label: pattern.label,
                kind: CompletionItemKind.EnumMember,
                insertText: pattern.insertText,
                documentation: pattern.doc,
                sortText: `0_side_${pattern.label}`
            });
        }

        // Symmetric patterns (for symmetric relationships)
        const symmetricPatterns = [
            { label: 'SK (Shared Kernel)', insertText: '[SK]', doc: 'Shared Kernel — symmetric relationship' },
            { label: 'P (Partnership)', insertText: '[P]', doc: 'Partnership — symmetric relationship' },
            { label: 'SW (Separate Ways)', insertText: '[SW]', doc: 'Separate Ways — symmetric relationship' },
        ];

        for (const pattern of symmetricPatterns) {
            acceptor(context, {
                label: pattern.label,
                kind: CompletionItemKind.EnumMember,
                insertText: pattern.insertText,
                documentation: pattern.doc,
                sortText: `0_sym_${pattern.label}`
            });
        }

        // Directional arrows
        const arrows = [
            { label: '->', doc: 'Upstream to downstream' },
            { label: '<-', doc: 'Downstream to upstream' },
            { label: '<->', doc: 'Bidirectional with patterns' },
            { label: '><', doc: 'Separate Ways (arrow form)' },
        ];

        for (const arrow of arrows) {
            acceptor(context, {
                label: arrow.label,
                kind: CompletionItemKind.Operator,
                insertText: arrow.label,
                documentation: arrow.doc,
                sortText: `1_${arrow.label}`
            });
        }
    }
}
