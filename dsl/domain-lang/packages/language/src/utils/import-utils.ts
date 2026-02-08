import path from 'node:path';
import { URI, type LangiumDocument, type LangiumDocuments } from 'langium';
import type { Model } from '../generated/ast.js';
import { WorkspaceManager } from '../services/workspace-manager.js';
import { ImportResolver } from '../services/import-resolver.js';
import type { DomainLangServices } from '../domain-lang-module.js';

/**
 * Lazily initialized workspace manager for standalone (non-LSP) usage.
 * Used by import graph building when no DI-injected ImportResolver is available.
 * 
 * @deprecated Prefer passing an ImportResolver from the DI container.
 * These singletons exist only for backwards compatibility with callers
 * that haven't been updated to pass through DI services.
 */
let standaloneWorkspaceManager: WorkspaceManager | undefined;
let standaloneImportResolver: ImportResolver | undefined;
let lastInitializedDir: string | undefined;

/**
 * Gets or creates a standalone import resolver for non-LSP contexts.
 * Creates its own WorkspaceManager if not previously initialized for this directory.
 *
 * @deprecated Prefer using services.imports.ImportResolver directly.
 * @param startDir - Directory to start workspace search from
 * @returns Promise resolving to the import resolver
 */
async function getStandaloneImportResolver(startDir: string): Promise<ImportResolver> {
  // Re-initialize if directory changed (workspace boundary)
  if (lastInitializedDir !== startDir || !standaloneImportResolver) {
    standaloneWorkspaceManager = new WorkspaceManager();
    try {
      await standaloneWorkspaceManager.initialize(startDir);
    } catch (error) {
      console.warn(`Failed to initialize workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
    const services = {
      imports: { WorkspaceManager: standaloneWorkspaceManager }
    } as DomainLangServices;
    standaloneImportResolver = new ImportResolver(services);
    lastInitializedDir = startDir;
  }
  return standaloneImportResolver;
}

/**
 * Resolves an import path to an absolute file URI.
 * 
 * @deprecated Prefer using ImportResolver.resolveForDocument() from the DI container.
 * This function creates standalone instances outside the DI system.
 * 
 * @param importingDoc - The document containing the import statement
 * @param rawImportPath - The raw import path from the import statement
 * @returns Resolved URI to the imported file
 * @throws {Error} If the import cannot be resolved
 */
export async function resolveImportPath(
  importingDoc: LangiumDocument,
  rawImportPath: string
): Promise<URI> {
  const baseDir = path.dirname(importingDoc.uri.fsPath);
  const resolver = await getStandaloneImportResolver(baseDir);
  return resolver.resolveFrom(baseDir, rawImportPath);
}

/**
 * Ensures the import graph is loaded from an entry file.
 * 
 * @param entryFilePath - Absolute or workspace-relative path to entry file
 * @param langiumDocuments - The Langium documents manager
 * @param importResolver - Optional DI-injected ImportResolver. When provided,
 *   uses it instead of creating standalone instances. Recommended for LSP contexts.
 * @returns Set of URIs (as strings) for all documents in the import graph
 * @throws {Error} If entry file cannot be resolved or loaded
 */
export async function ensureImportGraphFromEntryFile(
  entryFilePath: string,
  langiumDocuments: LangiumDocuments,
  importResolver?: ImportResolver
): Promise<Set<string>> {
  const entryUri = URI.file(path.resolve(entryFilePath));
  const entryDoc = await langiumDocuments.getOrCreateDocument(entryUri);
  return ensureImportGraphFromDocument(entryDoc, langiumDocuments, importResolver);
}

/**
 * Recursively builds the import graph from a document.
 * 
 * @param document - The starting document
 * @param langiumDocuments - The Langium documents manager
 * @param importResolver - Optional DI-injected ImportResolver. When provided,
 *   uses it instead of creating standalone instances. Recommended for LSP contexts.
 * @returns Set of URIs (as strings) for all documents in the import graph
 */
export async function ensureImportGraphFromDocument(
  document: LangiumDocument,
  langiumDocuments: LangiumDocuments,
  importResolver?: ImportResolver
): Promise<Set<string>> {
  const visited = new Set<string>();

  async function visit(doc: LangiumDocument): Promise<void> {
    const uriString = doc.uri.toString();
    if (visited.has(uriString)) return;
    visited.add(uriString);

    const model = doc.parseResult.value as unknown as Model;
    for (const imp of model.imports ?? []) {
      if (!imp.uri) continue;
      
      try {
        // Use DI-injected resolver when available, falling back to standalone
        const resolvedUri = importResolver
          ? await importResolver.resolveForDocument(doc, imp.uri)
          : await resolveImportPath(doc, imp.uri);
        const childDoc = await langiumDocuments.getOrCreateDocument(resolvedUri);
        await visit(childDoc);
      } catch {
        // Import resolution failed — validation will report the error
      }
    }
  }

  await visit(document);
  return visited;
}
