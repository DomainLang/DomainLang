import { DocumentState, type LangiumDocument } from 'langium';

/**
 * Waits for a document to reach a specific state.
 * Useful for ensuring documents are fully linked before accessing cross-references.
 * 
 * @param document - The LangiumDocument to wait for
 * @param targetState - The minimum required DocumentState
 * @param timeout - Maximum time to wait in milliseconds (default: 5000ms)
 * @throws {Error} If document doesn't reach target state within timeout
 * 
 * @example
 * ```typescript
 * // Ensure document is linked before accessing references
 * await waitForState(document, DocumentState.Linked);
 * const domain = bc.domain?.ref; // Now guaranteed to be resolved
 * ```
 * 
 * @example
 * ```typescript
 * // Ensure validation is complete
 * await waitForState(document, DocumentState.Validated);
 * const diagnostics = document.diagnostics; // Now includes all validation results
 * ```
 */
export async function waitForState(
    document: LangiumDocument,
    targetState: DocumentState,
    timeout = 5000
): Promise<void> {
    if (document.state >= targetState) {
        return;
    }

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(
                `Document ${document.uri.toString()} did not reach state ${targetState} within ${timeout}ms. ` +
                `Current state: ${document.state}`
            ));
        }, timeout);

        const checkState = (): void => {
            if (document.state >= targetState) {
                clearTimeout(timer);
                resolve();
            } else {
                // Check every 10ms
                setTimeout(checkState, 10);
            }
        };

        checkState();
    });
}

/**
 * Waits for multiple documents to reach a specific state.
 * Useful for batch operations where all documents must be ready.
 * 
 * @param documents - Array of LangiumDocuments to wait for
 * @param targetState - The minimum required DocumentState
 * @param timeout - Maximum time to wait per document in milliseconds
 * @throws {Error} If any document doesn't reach target state within timeout
 * 
 * @example
 * ```typescript
 * // Ensure all imported documents are linked
 * await waitForDocuments(importedDocs, DocumentState.Linked);
 * ```
 */
export async function waitForDocuments(
    documents: LangiumDocument[],
    targetState: DocumentState,
    timeout = 5000
): Promise<void> {
    await Promise.all(
        documents.map(doc => waitForState(doc, targetState, timeout))
    );
}
