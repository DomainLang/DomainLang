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

import type { AstNode, LangiumDocument } from 'langium';
import { GrammarAST } from 'langium';
import { CompletionAcceptor, CompletionContext, DefaultCompletionProvider, NextFeature } from 'langium/lsp';
import { CompletionItemKind, CompletionList, InsertTextFormat } from 'vscode-languageserver';
import type { CancellationToken, CompletionItem, CompletionParams } from 'vscode-languageserver-protocol';
import * as ast from '../generated/ast.js';
import type { DomainLangServices } from '../domain-lang-module.js';
import type { WorkspaceManager } from '../services/workspace-manager.js';
import type { ModelManifest, DependencySpec } from '../services/types.js';

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
            '\tclassification: ${4:CoreDomain}',
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
            '\trole: ${5:Core}',
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
    private readonly workspaceManager: WorkspaceManager;

    constructor(services: DomainLangServices) {
        super(services);
        this.workspaceManager = services.imports.WorkspaceManager;
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

        return super.getCompletion(document, params, cancelToken);
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
            manifest = await this.workspaceManager.ensureManifestLoaded();
        } catch {
            // Continue with undefined manifest – will show basic starters
        }

        const items: CompletionItem[] = [];
        const collector = (_ctx: unknown, item: CompletionItem): void => { items.push(item); };

        // Re-use the acceptor-based helpers by wrapping the collector
        // We pass `undefined as unknown` for context since the collector ignores it
        const ctx = undefined as unknown as CompletionContext;
        const accept = ((_context: CompletionContext, item: CompletionItem): void => {
            collector(undefined, item);
        }) as CompletionAcceptor;

        if (currentInput === '' || !currentInput) {
            this.addAllStarterOptions(ctx, accept, manifest);
        } else if (currentInput.startsWith('@')) {
            this.addAliasCompletions(ctx, accept, currentInput, manifest);
        } else if (currentInput.startsWith('./') || currentInput.startsWith('../')) {
            this.addLocalPathStarters(ctx, accept);
        } else if (currentInput.includes('/') && !currentInput.startsWith('.')) {
            this.addDependencyCompletions(ctx, accept, currentInput, manifest);
        } else {
            this.addFilteredOptions(ctx, accept, currentInput, manifest);
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
            console.error('Error in completionFor:', error);
            // Fall back to default completion on error
            await super.completionFor(context, next, acceptor);
        }
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
        // This is the most reliable check - Langium tells us exactly what it's completing
        if (next.type === 'ImportStatement' && next.property === 'uri') {
            return true;
        }
        
        // Check 2: The feature is an Assignment to 'uri' property
        if (GrammarAST.isAssignment(next.feature)) {
            const assignment = next.feature;
            if (assignment.feature === 'uri') {
                return true;
            }
        }
        
        // Check 3: We're already inside an ImportStatement node
        if (ast.isImportStatement(node)) {
            return true;
        }
        
        // Check 4: Container is ImportStatement
        if (node.$container && ast.isImportStatement(node.$container)) {
            return true;
        }
        
        // Check 5: Any ancestor is ImportStatement
        let current: AstNode | undefined = node;
        while (current) {
            if (ast.isImportStatement(current)) {
                return true;
            }
            current = current.$container;
        }
        
        // Check 6: Text-based pattern matching (fallback)
        // Only do text analysis if textDocument.getText is available (not in tests)
        if (typeof context.textDocument?.getText === 'function') {
            try {
                const text = context.textDocument.getText();
                const offset = context.offset;
                const textBefore = text.substring(0, offset);
                
                // Match patterns like:
                // - import "|
                // - import "@|
                // - import "./|
                // - import "owner/|
                const importStringPattern = /\bimport\s+"[^"]*$/i;
                if (importStringPattern.test(textBefore)) {
                    return true;
                }
            } catch {
                // Ignore errors in text analysis
            }
        }
        
        return false;
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
        const currentInput = this.extractImportInput(context);

        // Ensure manifest is loaded (async)
        let manifest: ModelManifest | undefined;
        try {
            manifest = await this.workspaceManager.ensureManifestLoaded();
        } catch {
            // Continue with undefined manifest – will show basic starters
        }
        
        if (currentInput.startsWith('@')) {
            // Alias completions
            this.addAliasCompletions(context, acceptor, currentInput, manifest);
        } else if (currentInput.startsWith('./') || currentInput.startsWith('../')) {
            // Local path completions
            this.addLocalPathStarters(context, acceptor);
        } else if (currentInput === '' || !currentInput) {
            // Show all starter options
            this.addAllStarterOptions(context, acceptor, manifest);
        } else if (currentInput.includes('/') && !currentInput.startsWith('.')) {
            // External dependency - filter by partial input
            this.addDependencyCompletions(context, acceptor, currentInput, manifest);
        } else {
            // Show all options for partial input (e.g., typing 'l' should show matching items)
            this.addFilteredOptions(context, acceptor, currentInput, manifest);
        }
    }

    /**
     * Extract the current input inside the import string.
     */
    private extractImportInput(context: CompletionContext): string {
        try {
            const text = context.textDocument.getText();
            const offset = context.offset;
            const textBefore = text.substring(0, offset);
            
            const importPattern = /\bimport\s+"([^"]*)$/i;
            const match = importPattern.exec(textBefore);
            return match ? match[1] : '';
        } catch {
            return '';
        }
    }

    /**
     * Add local path starters.
     */
    private addLocalPathStarters(context: CompletionContext, acceptor: CompletionAcceptor): void {
        // Would need async fs access to list directories
        // For now, just acknowledge the path exists
        acceptor(context, {
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
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        manifest?: ModelManifest
    ): void {
        // Local starters
        acceptor(context, {
            label: './',
            kind: CompletionItemKind.Folder,
            insertText: './',
            documentation: 'Import from current directory',
            sortText: '0_local_current'
        });
        acceptor(context, {
            label: '../',
            kind: CompletionItemKind.Folder,
            insertText: '../',
            documentation: 'Import from parent directory',
            sortText: '0_local_parent'
        });

        // Add aliases if available
        if (manifest?.paths) {
            for (const alias of Object.keys(manifest.paths)) {
                acceptor(context, {
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
                
                acceptor(context, {
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
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        currentInput: string,
        manifest?: ModelManifest
    ): void {
        if (!manifest?.paths) {
            return;
        }

        const inputLower = currentInput.toLowerCase();

        for (const [alias, targetPath] of Object.entries(manifest.paths)) {
            if (alias.toLowerCase().startsWith(inputLower)) {
                acceptor(context, {
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
        context: CompletionContext,
        acceptor: CompletionAcceptor,
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
                acceptor(context, {
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
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        currentInput: string,
        manifest?: ModelManifest
    ): void {
        // Offer local path starters when the partial input could match ./ or ../
        if ('./'.startsWith(currentInput) || '../'.startsWith(currentInput)) {
            acceptor(context, {
                label: './',
                kind: CompletionItemKind.Folder,
                insertText: './',
                documentation: 'Import from current directory',
                sortText: '0_local_current'
            });
            acceptor(context, {
                label: '../',
                kind: CompletionItemKind.Folder,
                insertText: '../',
                documentation: 'Import from parent directory',
                sortText: '0_local_parent'
            });
        }

        // Delegate to existing helpers for alias and dependency filtering
        this.addAliasCompletions(context, acceptor, currentInput, manifest);
        this.addDependencyCompletions(context, acceptor, currentInput, manifest);
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
            this.addImportSnippet(acceptor, context);
            await super.completionFor(context, next, acceptor);
            return true;
        }

        return false;
    }

    /**
     * Add import statement snippet at top level.
     */
    private addImportSnippet(acceptor: CompletionAcceptor, context: CompletionContext): void {
        acceptor(context, {
            label: '⚡ import',
            kind: CompletionItemKind.Snippet,
            insertText: 'import "${1:./path}"',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: '📝 Snippet: Import another DomainLang file',
            sortText: '0_snippet_import'
        });
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
            insertText: '[${1|OHS,PL,ACL,CF,P,SK|}] ${2:Context1} -> [${3|OHS,PL,ACL,CF,P,SK|}] ${4:Context2}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: 'Add a relationship with integration patterns',
            sortText: '1_relationship_patterns'
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
        // Integration pattern completions
        const patterns = [
            { label: 'OHS (Open Host Service)', insertText: '[OHS]', doc: 'Open Host Service pattern' },
            { label: 'PL (Published Language)', insertText: '[PL]', doc: 'Published Language pattern' },
            { label: 'ACL (Anti-Corruption Layer)', insertText: '[ACL]', doc: 'Anti-Corruption Layer pattern' },
            { label: 'CF (Conformist)', insertText: '[CF]', doc: 'Conformist pattern' },
            { label: 'P (Partnership)', insertText: '[P]', doc: 'Partnership pattern' },
            { label: 'SK (Shared Kernel)', insertText: '[SK]', doc: 'Shared Kernel pattern' }
        ];

        for (const pattern of patterns) {
            acceptor(context, {
                label: pattern.label,
                kind: CompletionItemKind.EnumMember,
                insertText: pattern.insertText,
                documentation: pattern.doc,
                sortText: `0_${pattern.label}`
            });
        }

        // Relationship arrow completions
        const arrows = [
            { label: '->', doc: 'Upstream to downstream' },
            { label: '<-', doc: 'Downstream to upstream' },
            { label: '<->', doc: 'Bidirectional/Partnership' },
            { label: '><', doc: 'Separate Ways' }
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
