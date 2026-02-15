import path from 'node:path';
import { URI } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import { FileChangeType, type DidChangeWatchedFilesParams, type FileEvent } from 'vscode-languageserver-protocol';
import type { DomainLangServices } from '../domain-lang-module.js';
import { DomainLangIndexManager } from './domain-lang-index-manager.js';

/**
 * Categorized file change events.
 * Only config files need explicit handling — .dlang changes are handled
 * by Langium's built-in `DocumentBuilder.update()` → `isAffected()` pipeline,
 * which DomainLangIndexManager enhances with transitive import dependency tracking.
 */
interface CategorizedChanges {
    readonly manifestChanges: Array<{ uri: string; type: FileChangeType }>;
    readonly lockFileChanges: Array<{ uri: string; type: FileChangeType }>;
}

export interface DomainLangRefreshHooks {
    onManifestChanged?: (change: { uri: string; type: FileChangeType }) => Promise<void> | void;
    onManifestDeleted?: (uri: string) => Promise<void> | void;
}

export interface DomainLangRefreshOptions {
    dedupeWindowMs?: number;
}

export interface RefreshOutcome {
    readonly configChanged: boolean;
    readonly fullRebuildTriggered: boolean;
}

class RecentChangeDeduper {
    private readonly dedupeWindowMs: number;
    private readonly seen = new Map<string, number>();

    constructor(dedupeWindowMs = 300) {
        this.dedupeWindowMs = dedupeWindowMs;
    }

    dedupe(changes: FileEvent[]): FileEvent[] {
        const now = Date.now();
        const filtered: FileEvent[] = [];

        for (const [key, timestamp] of this.seen.entries()) {
            if (now - timestamp > this.dedupeWindowMs * 4) {
                this.seen.delete(key);
            }
        }

        for (const change of changes) {
            const key = `${change.uri}|${change.type}`;
            const previous = this.seen.get(key);
            if (previous !== undefined && now - previous < this.dedupeWindowMs) {
                continue;
            }
            this.seen.set(key, now);
            filtered.push(change);
        }

        return filtered;
    }
}

export function registerDomainLangRefresh(
    shared: LangiumSharedServices,
    domainLang: DomainLangServices,
    hooks: DomainLangRefreshHooks = {},
    options: DomainLangRefreshOptions = {}
): { dispose(): void } {
    const deduper = new RecentChangeDeduper(options.dedupeWindowMs);

    return shared.lsp.DocumentUpdateHandler.onWatchedFilesChange(async (params: DidChangeWatchedFilesParams) => {
        try {
            const dedupedChanges = deduper.dedupe(params.changes);
            if (dedupedChanges.length === 0) {
                return;
            }

            await processWatchedFileChanges(
                { changes: dedupedChanges },
                shared,
                domainLang,
                hooks,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error handling watched file changes: ${message}`);
        }
    });
}

/**
 * Processes watched file change events.
 * 
 * **Architecture:**
 * - `.dlang` changes are handled entirely by Langium's own `DocumentBuilder.update()`
 *   pipeline. `DomainLangIndexManager.isAffected()` provides transitive import
 *   dependency tracking and specifier-sensitive matching, so Langium's single
 *   `update()` call propagates changes correctly through the import graph.
 * 
 * - Config changes (model.yaml, model.lock) need explicit handling because Langium
 *   ignores non-language files (they have no LangiumDocument). Config changes
 *   invalidate caches and trigger a full rebuild of all loaded documents, routed
 *   through the workspace lock to serialize with Langium's own updates.
 */
export async function processWatchedFileChanges(
    params: DidChangeWatchedFilesParams,
    shared: LangiumSharedServices,
    domainLang: DomainLangServices,
    hooks: DomainLangRefreshHooks = {}
): Promise<RefreshOutcome> {
    const categorized = categorizeChanges(params);
    const hasConfigChanges = categorized.manifestChanges.length > 0
        || categorized.lockFileChanges.length > 0;

    if (!hasConfigChanges) {
        // .dlang changes handled by Langium's update() → isAffected() pipeline.
        // DomainLangIndexManager.isAffected() checks transitive import deps
        // and specifier-sensitive matching — no second update() needed.
        return { configChanged: false, fullRebuildTriggered: false };
    }

    // Config changes need explicit handling: invalidate caches, then rebuild.
    // Route through the workspace lock to serialize with Langium's own updates.
    const indexManager = shared.workspace.IndexManager as DomainLangIndexManager;

    await shared.workspace.WorkspaceLock.write(async (token) => {
        // 1. Invalidate caches
        await processManifestChanges(categorized.manifestChanges, domainLang, hooks);
        await processLockFileChanges(categorized.lockFileChanges, domainLang);
        domainLang.imports.ImportResolver.clearCache();
        indexManager.clearImportDependencies();

        // 2. Rebuild ALL loaded documents — config changes affect all imports
        const allDocUris = shared.workspace.LangiumDocuments.all
            .map(doc => doc.uri)
            .toArray();

        if (allDocUris.length > 0) {
            await shared.workspace.DocumentBuilder.update(allDocUris, [], token);
        }
    });

    return { configChanged: true, fullRebuildTriggered: true };
}

function categorizeChanges(params: DidChangeWatchedFilesParams): CategorizedChanges {
    const manifestChanges: Array<{ uri: string; type: FileChangeType }> = [];
    const lockFileChanges: Array<{ uri: string; type: FileChangeType }> = [];

    for (const change of params.changes) {
        const uri = URI.parse(change.uri);
        const fileName = path.basename(uri.path).toLowerCase();

        if (fileName === 'model.yaml') {
            manifestChanges.push({ uri: change.uri, type: change.type });
        } else if (fileName === 'model.lock') {
            lockFileChanges.push({ uri: change.uri, type: change.type });
        }
    }

    return { manifestChanges, lockFileChanges };
}

async function processManifestChanges(
    manifestChanges: Array<{ uri: string; type: FileChangeType }>,
    domainLang: DomainLangServices,
    hooks: DomainLangRefreshHooks,
): Promise<void> {
    for (const change of manifestChanges) {
        domainLang.imports.ManifestManager.invalidateManifestCache();

        // R11: Update workspace layout cache for the manifest's directory
        const manifestDir = path.dirname(URI.parse(change.uri).fsPath);
        domainLang.imports.ManifestManager.onManifestEvent(
            manifestDir,
            change.type !== FileChangeType.Deleted,
        );

        if (change.type === FileChangeType.Deleted) {
            if (hooks.onManifestDeleted) {
                await hooks.onManifestDeleted(change.uri);
            }
            continue;
        }

        if (hooks.onManifestChanged) {
            await hooks.onManifestChanged(change);
        }
    }
}

async function processLockFileChanges(
    lockFileChanges: Array<{ uri: string; type: FileChangeType }>,
    domainLang: DomainLangServices,
): Promise<void> {
    for (const change of lockFileChanges) {
        if (change.type === FileChangeType.Deleted) {
            domainLang.imports.ManifestManager.invalidateLockCache();
            continue;
        }
        await domainLang.imports.ManifestManager.refreshLockFile();
    }
}
