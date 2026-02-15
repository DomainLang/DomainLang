/**
 * Tests for domain-lang-refresh module.
 * 
 * Verifies:
 * - Config change handling (model.yaml, model.lock) triggers full rebuild
 * - .dlang changes are left to Langium's built-in pipeline (no second update())
 * - Workspace lock serialization for config changes
 * - Deduplication of rapid file events
 * - Extension hooks (onManifestChanged, onManifestDeleted) fire correctly
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { URI } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import type { CancellationToken } from 'vscode-jsonrpc';
import type { DidChangeWatchedFilesParams } from 'vscode-languageserver-protocol';
import type { DomainLangServices } from '../../src/domain-lang-module.js';
import { processWatchedFileChanges, registerDomainLangRefresh } from '../../src/lsp/domain-lang-refresh.js';

type WatchHandler = (params: DidChangeWatchedFilesParams) => Promise<void>;

describe('domain-lang refresh', () => {
    let handler: WatchHandler | undefined;

    beforeEach(() => {
        handler = undefined;
    });

    // ========================================================================
    // .dlang CHANGES - handled by Langium's pipeline, NOT by us
    // ========================================================================

    describe('.dlang changes (delegated to Langium)', () => {
        test('returns early without calling update for .dlang-only changes', async () => {
            // Arrange
            const update = vi.fn(async () => undefined);
            const shared = createSharedServices({
                docs: ['file:///main.dlang', 'file:///importer.dlang'],
                update,
            });
            const domainLang = createDomainLangServices();

            // Act
            const result = await processWatchedFileChanges(
                {
                    changes: [
                        { uri: 'file:///main.dlang', type: 2 },
                        { uri: 'file:///new.dlang', type: 1 },
                    ]
                },
                shared,
                domainLang,
            );

            // Assert: No update() called — Langium handles .dlang via isAffected()
            expect(update).not.toHaveBeenCalled();
            expect(result.configChanged).toBe(false);
            expect(result.fullRebuildTriggered).toBe(false);
        });

        test('returns early for deleted .dlang files without calling update', async () => {
            // Arrange
            const update = vi.fn(async () => undefined);
            const shared = createSharedServices({
                docs: ['file:///a.dlang'],
                update,
            });

            // Act
            const result = await processWatchedFileChanges(
                { changes: [{ uri: 'file:///deleted.dlang', type: 3 }] },
                shared,
                createDomainLangServices(),
            );

            // Assert
            expect(update).not.toHaveBeenCalled();
            expect(result.configChanged).toBe(false);
        });

        test('ignores non-dlang non-config files', async () => {
            // Arrange
            const update = vi.fn(async () => undefined);
            const shared = createSharedServices({ docs: [], update });

            // Act
            const result = await processWatchedFileChanges(
                { changes: [{ uri: 'file:///readme.md', type: 2 }] },
                shared,
                createDomainLangServices(),
            );

            // Assert
            expect(update).not.toHaveBeenCalled();
            expect(result.configChanged).toBe(false);
        });
    });

    // ========================================================================
    // CONFIG CHANGES - model.yaml / model.lock
    // ========================================================================

    describe('Config changes (model.yaml / model.lock)', () => {
        test('invalidates caches and rebuilds all documents on model.yaml change', async () => {
            // Arrange
            const update = vi.fn(async () => undefined);
            const onManifestChanged = vi.fn(async () => undefined);
            const shared = createSharedServices({
                docs: ['file:///a.dlang', 'file:///b.dlang'],
                update,
            });
            const domainLang = createDomainLangServices();

            // Act
            const result = await processWatchedFileChanges(
                { changes: [{ uri: 'file:///workspace/model.yaml', type: 2 }] },
                shared,
                domainLang,
                { onManifestChanged },
            );

            // Assert: Caches invalidated
            expect(domainLang.imports.ManifestManager.invalidateManifestCache).toHaveBeenCalledTimes(1);
            expect(domainLang.imports.ImportResolver.clearCache).toHaveBeenCalledTimes(1);
            expect(onManifestChanged).toHaveBeenCalledTimes(1);

            // Assert: Full rebuild triggered with ALL loaded documents
            expect(update).toHaveBeenCalledTimes(1);
            const changedUris = ((update.mock.calls as unknown[][])[0][0] as URI[])
                .map(uri => uri.toString())
                .sort((a, b) => a.localeCompare(b));
            expect(changedUris).toEqual(['file:///a.dlang', 'file:///b.dlang']);

            // Assert: CancellationToken was passed
            expect((update.mock.calls as unknown[][])[0][2]).toBeDefined();

            // Assert: Outcome reflects config change
            expect(result.configChanged).toBe(true);
            expect(result.fullRebuildTriggered).toBe(true);
        });

        test('calls onManifestDeleted hook when model.yaml is deleted', async () => {
            // Arrange
            const onManifestDeleted = vi.fn(async () => undefined);
            const shared = createSharedServices({ docs: [], update: vi.fn(async () => undefined) });
            const domainLang = createDomainLangServices();

            // Act
            await processWatchedFileChanges(
                { changes: [{ uri: 'file:///workspace/model.yaml', type: 3 }] },
                shared,
                domainLang,
                { onManifestDeleted },
            );

            // Assert
            expect(onManifestDeleted).toHaveBeenCalledWith('file:///workspace/model.yaml');
        });

        test('handles model.lock changes', async () => {
            // Arrange
            const update = vi.fn(async () => undefined);
            const shared = createSharedServices({
                docs: ['file:///doc.dlang'],
                update,
            });
            const domainLang = createDomainLangServices();

            // Act
            const result = await processWatchedFileChanges(
                { changes: [{ uri: 'file:///workspace/model.lock', type: 2 }] },
                shared,
                domainLang,
            );

            // Assert
            expect(domainLang.imports.ManifestManager.refreshLockFile).toHaveBeenCalledTimes(1);
            expect(result.configChanged).toBe(true);
            expect(result.fullRebuildTriggered).toBe(true);
        });

        test('handles deleted model.lock', async () => {
            // Arrange
            const shared = createSharedServices({ docs: [], update: vi.fn(async () => undefined) });
            const domainLang = createDomainLangServices();

            // Act
            await processWatchedFileChanges(
                { changes: [{ uri: 'file:///workspace/model.lock', type: 3 }] },
                shared,
                domainLang,
            );

            // Assert
            expect(domainLang.imports.ManifestManager.invalidateLockCache).toHaveBeenCalledTimes(1);
        });

        test('skips update when no documents are loaded', async () => {
            // Arrange
            const update = vi.fn(async () => undefined);
            const shared = createSharedServices({ docs: [], update });

            // Act
            await processWatchedFileChanges(
                { changes: [{ uri: 'file:///workspace/model.yaml', type: 2 }] },
                shared,
                createDomainLangServices(),
            );

            // Assert: update not called because no docs to rebuild
            expect(update).not.toHaveBeenCalled();
        });

        test('routes config changes through workspace lock', async () => {
            // Arrange
            const writeFn = vi.fn(async (action: (token: CancellationToken) => Promise<void>) => {
                await action({ isCancellationRequested: false, onCancellationRequested: vi.fn() } as unknown as CancellationToken);
            });
            const update = vi.fn(async () => undefined);
            const shared = createSharedServices({
                docs: ['file:///x.dlang'],
                update,
                writeFn,
            });

            // Act
            await processWatchedFileChanges(
                { changes: [{ uri: 'file:///workspace/model.yaml', type: 2 }] },
                shared,
                createDomainLangServices(),
            );

            // Assert: write() was called (proving we go through the lock)
            expect(writeFn).toHaveBeenCalledTimes(1);
            // And update was called inside the write action
            expect(update).toHaveBeenCalledTimes(1);
        });

        test('handles mixed .dlang and config changes together', async () => {
            // Arrange
            const update = vi.fn(async () => undefined);
            const shared = createSharedServices({
                docs: ['file:///a.dlang', 'file:///b.dlang'],
                update,
            });

            // Act: Both .dlang and config changes in same batch
            const result = await processWatchedFileChanges(
                {
                    changes: [
                        { uri: 'file:///a.dlang', type: 2 },
                        { uri: 'file:///workspace/model.yaml', type: 2 },
                    ]
                },
                shared,
                createDomainLangServices(),
            );

            // Assert: Config change triggers full rebuild (covers .dlang changes too)
            expect(result.configChanged).toBe(true);
            expect(result.fullRebuildTriggered).toBe(true);
            expect(update).toHaveBeenCalledTimes(1);
        });
    });

    // ========================================================================
    // DEDUPLICATION
    // ========================================================================

    describe('Deduplication', () => {
        test('dedupes identical watched-file events in rapid succession', async () => {
            // Arrange
            const onManifestChanged = vi.fn(async () => undefined);
            const shared = createSharedServices({
                docs: [],
                update: vi.fn(async () => undefined),
                onWatchedFilesChange: (callback) => { handler = callback; },
            });
            const domainLang = createDomainLangServices();

            registerDomainLangRefresh(
                shared,
                domainLang,
                { onManifestChanged },
                { dedupeWindowMs: 1000 },
            );

            // Act: Fire identical events rapidly
            await handler?.({ changes: [{ uri: 'file:///workspace/model.yaml', type: 2 }] });
            await handler?.({ changes: [{ uri: 'file:///workspace/model.yaml', type: 2 }] });

            // Assert: Only processed once (second was deduped)
            expect(onManifestChanged).toHaveBeenCalledTimes(1);
        });

        test('allows different events through deduper', async () => {
            // Arrange
            const onManifestChanged = vi.fn(async () => undefined);
            const shared = createSharedServices({
                docs: [],
                update: vi.fn(async () => undefined),
                onWatchedFilesChange: (callback) => { handler = callback; },
            });
            const domainLang = createDomainLangServices();

            registerDomainLangRefresh(
                shared,
                domainLang,
                { onManifestChanged },
                { dedupeWindowMs: 1000 },
            );

            // Act: Fire different events (different URIs)
            await handler?.({ changes: [{ uri: 'file:///workspace1/model.yaml', type: 2 }] });
            await handler?.({ changes: [{ uri: 'file:///workspace2/model.yaml', type: 2 }] });

            // Assert: Both processed (different URIs)
            expect(onManifestChanged).toHaveBeenCalledTimes(2);
        });

        test('registerDomainLangRefresh returns disposable', () => {
            // Arrange
            const shared = createSharedServices({
                docs: [],
                update: vi.fn(async () => undefined),
                onWatchedFilesChange: (callback) => { handler = callback; },
            });

            // Act
            const disposable = registerDomainLangRefresh(shared, createDomainLangServices());

            // Assert
            expect(disposable).toHaveProperty('dispose');
            expect(typeof disposable.dispose).toBe('function');
        });
    });
});

// ============================================================================
// TEST HELPERS
// ============================================================================

function createSharedServices(args: {
    docs: string[];
    update: (changed: URI[], deleted: URI[], token?: CancellationToken) => Promise<void>;
    onWatchedFilesChange?: (handler: WatchHandler) => void;
    writeFn?: (action: (token: CancellationToken) => Promise<void>) => Promise<void>;
}): LangiumSharedServices {
    const docUris = args.docs.map(uri => URI.parse(uri));
    const defaultWrite = async (action: (token: CancellationToken) => Promise<void>): Promise<void> => {
        const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() } as unknown as CancellationToken;
        await action(token);
    };

    return {
        workspace: {
            IndexManager: {
                clearImportDependencies: vi.fn(),
            },
            DocumentBuilder: {
                update: args.update,
            },
            LangiumDocuments: {
                all: {
                    map: (fn: (doc: { uri: URI }) => URI) => ({
                        toArray: () => docUris.map(uri => fn({ uri })),
                    }),
                },
            },
            WorkspaceLock: {
                write: args.writeFn ?? defaultWrite,
            },
        },
        lsp: {
            DocumentUpdateHandler: {
                onWatchedFilesChange: (callback: WatchHandler) => {
                    if (args.onWatchedFilesChange) {
                        args.onWatchedFilesChange(callback);
                    }
                    return { dispose: vi.fn() };
                },
            },
        },
    } as unknown as LangiumSharedServices;
}

function createDomainLangServices(): DomainLangServices {
    return {
        imports: {
            ManifestManager: {
                invalidateManifestCache: vi.fn(),
                invalidateLockCache: vi.fn(),
                refreshLockFile: vi.fn(async () => undefined),
                onManifestEvent: vi.fn(),
            },
            ImportResolver: {
                clearCache: vi.fn(),
            },
        },
    } as unknown as DomainLangServices;
}
