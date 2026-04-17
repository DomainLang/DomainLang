/**
 * Node.js-specific loader for DomainLang models.
 * 
 * **WARNING: This module is NOT browser-compatible.**
 * 
 * For browser environments, use:
 * - `fromDocument()` with documents from the LSP
 * - `fromModel()` with pre-parsed models
 * - `loadModelFromText()` for in-memory parsing
 * 
 * This loader creates **isolated Langium services** for standalone CLI usage.
 * It does NOT integrate with an existing LSP workspace.
 * 
 * For full workspace management with cross-file imports:
 * - Use the WorkspaceManager service
 * - Or host the LSP server and use its services
 * 
 * @module sdk/loader-node
 */

import { DocumentState, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import type { Model } from '../generated/ast.js';
import { isModel } from '../generated/ast.js';
import { createDomainLangServices } from './bootstrap.js';
import type { LoadOptions, QueryContext } from './types.js';
import { fromModel, augmentModel } from './query.js';
import { ensureImportGraphFromDocument } from '../services/import-graph.js';

/**
 * Loads a DomainLang model from a file on disk.
 * 
 * **Node.js only** - uses file system APIs.
 * 
 * Supports multi-file models with imports: all imported files are
 * automatically loaded and linked. Use `documents` in the result
 * to see all loaded files.
 * 
 * @param entryFile - Path to the entry .dlang file
 * @param options - Optional load configuration
 * @returns QueryContext with model, documents, and query API
 * @throws Error if file cannot be loaded or parsing fails
 * 
 * @example
 * ```typescript
 * import { loadModel } from '@domainlang/language/sdk/loader-node';
 * 
 * const { query, model, documents } = await loadModel('./domains.dlang', {
 *   workspaceDir: process.cwd()
 * });
 * 
 * // Query spans all imported files
 * for (const bc of query.boundedContexts()) {
 *   console.log(bc.name);
 * }
 * 
 * console.log(`Loaded ${documents.length} files`);
 * ```
 */
export async function loadModel(
    entryFile: string,
    options?: LoadOptions
): Promise<QueryContext> {
    // Resolve absolute path
    const path = await import('node:path');
    const absolutePath = path.isAbsolute(entryFile) 
        ? entryFile 
        : path.resolve(options?.workspaceDir ?? process.cwd(), entryFile);
    
    // Create or reuse services
    const servicesObj = options?.services 
        ? { shared: options.services.shared, DomainLang: options.services }
        : createDomainLangServices(NodeFileSystem);
    
    const services = servicesObj.DomainLang;
    const shared = servicesObj.shared;
    
    // Initialize workspace if directory provided
    if (options?.workspaceDir) {
        const workspaceManager = services.imports.ManifestManager;
        await workspaceManager.initialize(options.workspaceDir);
    }
    
    // Read file content and create document
    const fs = await import('node:fs/promises');
    const fileContent = await fs.readFile(absolutePath, 'utf-8');
    const uri = URI.file(absolutePath);
    
    // Use getOrCreateDocument if already registered (e.g. reused services),
    // otherwise create from file content to avoid duplicate document errors.
    const langiumDocuments = shared.workspace.LangiumDocuments;
    const document = langiumDocuments.hasDocument(uri)
        ? await langiumDocuments.getOrCreateDocument(uri) as LangiumDocument<Model>
        : (() => {
            const doc = shared.workspace.LangiumDocumentFactory.fromString<Model>(
                fileContent, 
                uri
            );
            langiumDocuments.addDocument(doc);
            return doc;
        })();
    
    // Register document and build it
    await shared.workspace.DocumentBuilder.build([document], { validation: false });
    
    // Traverse import graph to load all imported files
    const importedUris = await ensureImportGraphFromDocument(
        document, 
        shared.workspace.LangiumDocuments,
        services.imports.ImportResolver
    );
    
    // Build all imported documents with validation.
    // Only build documents from this import graph (not unrelated documents
    // that may exist when services are reused across multiple loadModel calls).
    const importGraphDocuments = Array.from(importedUris)
        .map(uriStr => URI.parse(uriStr))
        .map(u => langiumDocuments.getDocument(u))
        .filter((d): d is LangiumDocument => d !== undefined)
        .concat(document);
    // Deduplicate (entry document is already in importedUris)
    const uniqueDocs = [...new Map(importGraphDocuments.map(d => [d.uri.toString(), d])).values()];
    await shared.workspace.DocumentBuilder.build(uniqueDocs, { validation: true });
    
    // Wait for entry document to be fully processed
    if (document.state < DocumentState.Validated) {
        throw new Error(`Document not fully processed: ${absolutePath}`);
    }
    
    // Check for parsing errors
    if (document.parseResult.lexerErrors.length > 0) {
        const errors = document.parseResult.lexerErrors.map(e => e.message).join('\n  ');
        throw new Error(`Lexer errors in ${entryFile}:\n  ${errors}`);
    }
    
    if (document.parseResult.parserErrors.length > 0) {
        const errors = document.parseResult.parserErrors.map(e => e.message).join('\n  ');
        throw new Error(`Parser errors in ${entryFile}:\n  ${errors}`);
    }
    
    const model = document.parseResult.value;
    if (!isModel(model)) {
        throw new Error(`Document root is not a Model: ${entryFile}`);
    }
    
    // Augment AST nodes with SDK properties for this import graph's models
    for (const doc of uniqueDocs) {
        const docModel = doc.parseResult.value;
        if (isModel(docModel)) {
            augmentModel(docModel);
        }
    }
    
    // Collect all document URIs from the import graph
    const documentUris: URI[] = Array.from(importedUris).map(uriStr => URI.parse(uriStr));
    
    return {
        model,
        documents: documentUris,
        query: fromModel(model),
    };
}

// Re-export validation utilities
export { validateFile } from './validator.js';
export type { ValidationResult, ValidationDiagnostic, ValidationOptions } from './validator.js';
