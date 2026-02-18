import path from 'node:path';
import { URI, type LangiumDocument, type LangiumDocuments } from 'langium';
import type { Model } from '../generated/ast.js';
import type { ImportResolver } from '../services/import-resolver.js';

/**
 * Ensures the import graph is loaded from an entry file.
 *
 * @param entryFilePath - Absolute or workspace-relative path to entry file
 * @param langiumDocuments - The Langium documents manager
 * @param importResolver - DI-injected ImportResolver from the language services
 * @returns Set of URIs (as strings) for all documents in the import graph
 * @throws {Error} If entry file cannot be resolved or loaded
 */
export async function ensureImportGraphFromEntryFile(
  entryFilePath: string,
  langiumDocuments: LangiumDocuments,
  importResolver: ImportResolver
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
 * @param importResolver - DI-injected ImportResolver from the language services
 * @returns Set of URIs (as strings) for all documents in the import graph
 */
export async function ensureImportGraphFromDocument(
  document: LangiumDocument,
  langiumDocuments: LangiumDocuments,
  importResolver: ImportResolver
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
        const resolvedUri = await importResolver.resolveForDocument(doc, imp.uri);
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
