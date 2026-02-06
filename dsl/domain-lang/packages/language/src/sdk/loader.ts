/**
 * Browser-safe loader for in-memory model parsing.
 * 
 * This module provides `loadModelFromText()` which works in both
 * browser and Node.js environments by using Langium's EmptyFileSystem.
 * 
 * For repeated parsing (e.g., web playgrounds, REPLs), use `createModelLoader()`
 * to reuse Langium services across multiple parse calls:
 * ```typescript
 * const loader = createModelLoader();
 * const result1 = await loader.loadFromText('Domain A {}');
 * const result2 = await loader.loadFromText('Domain B {}');
 * ```
 * 
 * For file-based loading in Node.js CLI tools, use:
 * ```typescript
 * import { loadModel } from '@domainlang/language/sdk/loader-node';
 * ```
 * 
 * For LSP/validation code that already has a linked AST, use the sync entry points:
 * - `fromDocument()` - from a LangiumDocument
 * - `fromModel()` - from a Model AST node  
 * - `fromServices()` - from DomainLangServices container
 * 
 * @module sdk/loader
 */

import { EmptyFileSystem, URI } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import type { Model } from '../generated/ast.js';
import { isModel } from '../generated/ast.js';
import { createDomainLangServices } from '../domain-lang-module.js';
import type { DomainLangServices } from '../domain-lang-module.js';
import type { LoadOptions, QueryContext } from './types.js';
import { augmentModel, fromModel } from './query.js';

/**
 * A reusable model loader that maintains Langium services across multiple parse calls.
 * 
 * Use this when calling `loadFromText()` repeatedly (e.g., web playgrounds, REPLs,
 * batch processing) to avoid the overhead of recreating Langium services each time.
 */
export interface ModelLoader {
    /**
     * Loads a DomainLang model from a text string, reusing internal services.
     * 
     * Each call creates a fresh document but shares the underlying parser,
     * linker, and validator infrastructure.
     * 
     * @param text - DomainLang source code
     * @returns QueryContext with model and query API
     * @throws Error if parsing fails
     */
    loadFromText(text: string): Promise<QueryContext>;

    /** The underlying DomainLang services (for advanced use). */
    readonly services: DomainLangServices;
}

/** Internal counter for unique document URIs within a loader. */
let documentCounter = 0;

/**
 * Parses text into a QueryContext using the provided services.
 * Shared implementation for both `loadModelFromText` and `ModelLoader.loadFromText`.
 */
async function parseTextToContext(
    text: string,
    langServices: DomainLangServices,
    shared: LangiumSharedServices
): Promise<QueryContext> {
    // Use unique URI per parse to avoid document conflicts
    const uri = URI.parse(`memory:///model-${documentCounter++}.dlang`);
    const document = shared.workspace.LangiumDocumentFactory.fromString<Model>(text, uri);

    // Register and build document
    shared.workspace.LangiumDocuments.addDocument(document);
    try {
        await shared.workspace.DocumentBuilder.build([document], { validation: true });

        // Check for parsing errors
        if (document.parseResult.lexerErrors.length > 0) {
            const errors = document.parseResult.lexerErrors.map(e => e.message).join('\n  ');
            throw new Error(`Lexer errors:\n  ${errors}`);
        }

        if (document.parseResult.parserErrors.length > 0) {
            const errors = document.parseResult.parserErrors.map(e => e.message).join('\n  ');
            throw new Error(`Parser errors:\n  ${errors}`);
        }

        const model = document.parseResult.value;
        if (!isModel(model)) {
            throw new Error(`Document root is not a Model`);
        }

        // Augment AST nodes with SDK properties
        augmentModel(model);

        return {
            model,
            documents: [document.uri],
            query: fromModel(model),
        };
    } finally {
        // Clean up the document to prevent memory leaks across repeated calls
        shared.workspace.LangiumDocuments.deleteDocument(uri);
    }
}

/**
 * Creates a reusable model loader that shares Langium services across parse calls.
 * 
 * **Browser-safe** - uses in-memory file system (EmptyFileSystem).
 * 
 * For applications that parse multiple texts (web playgrounds, REPLs, batch tools),
 * this avoids the overhead of creating new Langium services for each parse call.
 * 
 * @returns A ModelLoader instance that can be used repeatedly
 * 
 * @example
 * ```typescript
 * import { createModelLoader } from '@domainlang/language/sdk';
 * 
 * const loader = createModelLoader();
 * 
 * // Parse multiple texts efficiently - services are reused
 * const result1 = await loader.loadFromText('Domain Sales { vision: "Sales" }');
 * const result2 = await loader.loadFromText('Domain Billing { vision: "Billing" }');
 * ```
 */
export function createModelLoader(): ModelLoader {
    const servicesObj = createDomainLangServices(EmptyFileSystem);
    const shared = servicesObj.shared;
    const langServices = servicesObj.DomainLang;

    return {
        async loadFromText(text: string): Promise<QueryContext> {
            return parseTextToContext(text, langServices, shared);
        },
        get services(): DomainLangServices {
            return langServices;
        }
    };
}

/**
 * Loads a DomainLang model from a text string.
 * 
 * **Browser-safe** - uses in-memory file system (EmptyFileSystem).
 * 
 * For repeated parsing, prefer {@link createModelLoader} to reuse services.
 * 
 * Useful for:
 * - Testing
 * - One-off parsing
 * - Any environment without file system access
 * 
 * @param text - DomainLang source code
 * @param options - Optional load configuration
 * @returns QueryContext with model and query API
 * @throws Error if parsing fails
 * 
 * @example
 * ```typescript
 * import { loadModelFromText } from '@domainlang/language/sdk';
 * 
 * const { query } = await loadModelFromText(`
 *   Domain Sales { vision: "Handle sales" }
 *   bc OrderContext for Sales
 * `);
 * 
 * const sales = query.domain('Sales');
 * console.log(sales?.resolvedVision);
 * ```
 */
export async function loadModelFromText(
    text: string,
    options?: LoadOptions
): Promise<QueryContext> {
    // Create or reuse services (use EmptyFileSystem for in-memory parsing)
    const servicesObj = options?.services
        ? { shared: options.services.shared, DomainLang: options.services }
        : createDomainLangServices(EmptyFileSystem);
    
    const shared = servicesObj.shared;
    const langServices = servicesObj.DomainLang;
    
    return parseTextToContext(text, langServices, shared);
}
