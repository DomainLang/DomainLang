import fs from 'node:fs/promises';
import path from 'node:path';
import type { ValidationAcceptor, ValidationChecks, LangiumDocument } from 'langium';
import { Cancellation } from 'langium';
import type { DomainLangAstType, ImportStatement } from '../generated/ast.js';
import type { DomainLangServices } from '../domain-lang-module.js';
import type { ManifestManager } from '../services/workspace-manager.js';
import type { ImportResolver } from '../services/import-resolver.js';
import { ImportResolutionError } from '../services/import-resolver.js';
import type { DomainLangIndexManager } from '../lsp/domain-lang-index-manager.js';
import type { ExtendedDependencySpec, ModelManifest, LockFile } from '../services/types.js';
import { ValidationMessages, buildCodeDescription, IssueCodes } from './constants.js';

/**
 * Validates import statements in DomainLang.
 *
 * Uses async validators (Langium 4.x supports MaybePromise<void>) to leverage
 * the shared ManifestManager service with its cached manifest/lock file reading.
 *
 * Checks:
 * - All import URIs resolve to existing files
 * - External imports require manifest + alias
 * - Local path dependencies stay inside workspace  
 * - Lock file exists for external dependencies
 * - Import cycles are detected and reported (PRS-017 R3)
 */
export class ImportValidator {
    private readonly workspaceManager: ManifestManager;
    private readonly importResolver: ImportResolver;
    private readonly indexManager: DomainLangIndexManager | undefined;

    constructor(services: DomainLangServices) {
        this.workspaceManager = services.imports.ManifestManager;
        this.importResolver = services.imports.ImportResolver;
        // IndexManager is in shared services — cast to DomainLangIndexManager for cycle detection
        const indexMgr = services.shared.workspace.IndexManager;
        this.indexManager = 'getCycleForDocument' in indexMgr
            ? indexMgr as DomainLangIndexManager
            : undefined;
    }

    /**
     * Validates an import statement asynchronously.
     *
     * Langium validators can return MaybePromise<void>, enabling async operations
     * like reading manifests via the shared, cached ManifestManager.
     */
    async checkImportPath(
        imp: ImportStatement,
        accept: ValidationAcceptor,
        document: LangiumDocument,
        _cancelToken: Cancellation.CancellationToken
    ): Promise<void> {
        if (!imp.uri) {
            accept('error', ValidationMessages.IMPORT_MISSING_URI(), {
                node: imp,
                keyword: 'import',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                data: { code: IssueCodes.ImportMissingUri }
            });
            return;
        }

        // PRS-017 R3: Check for import cycles detected during indexing
        this.checkImportCycle(document, imp, accept);

        // First, verify the import resolves to a valid file
        // This catches renamed/moved/deleted files immediately
        const resolveError = await this.validateImportResolves(imp, document, accept);
        if (resolveError) {
            return; // Don't continue with other validations if can't resolve
        }

        if (!this.isExternalImport(imp.uri)) {
            return;
        }

        // Initialize workspace manager from document location
        const docDir = path.dirname(document.uri.fsPath);
        await this.workspaceManager.initialize(docDir);

        const manifest = await this.workspaceManager.getManifest();
        if (!manifest) {
            accept('error', ValidationMessages.IMPORT_REQUIRES_MANIFEST(imp.uri), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                data: { code: IssueCodes.ImportRequiresManifest, specifier: imp.uri }
            });
            return;
        }

        // Find the matching dependency by key (owner/package format)
        const match = this.findDependency(manifest, imp.uri);

        if (!match) {
            accept('error', ValidationMessages.IMPORT_NOT_IN_MANIFEST(imp.uri), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                data: { code: IssueCodes.ImportNotInManifest, alias: imp.uri }
            });
            return;
        }

        const { key, dependency } = match;
        this.validateDependencyConfig(dependency, key, accept, imp);

        // External source dependencies require lock file and cached packages
        if (dependency.source) {
            const lockFile = await this.workspaceManager.getLockFile();
            if (!lockFile) {
                accept('error', ValidationMessages.IMPORT_NOT_INSTALLED(key), {
                    node: imp,
                    property: 'uri',
                    codeDescription: buildCodeDescription('language.md', 'imports'),
                    data: { code: IssueCodes.ImportNotInstalled, alias: key }
                });
                return;
            }

            await this.validateCachedPackage(dependency, key, lockFile, accept, imp);
        }
    }

    /**
     * Determines if an import URI is external (requires manifest).
     *
     * Per PRS-010:
     * - Local relative: ./path, ../path
     * - Path aliases: @/path, @alias/path (resolved via manifest paths section)
     * - External: owner/package (requires manifest dependencies)
     */
    private isExternalImport(uri: string): boolean {
        if (uri.startsWith('./') || uri.startsWith('../')) {
            return false;
        }
        if (uri.startsWith('@')) {
            return false;
        }
        return true;
    }

    /**
     * Validates that an import URI resolves to an existing file.
     * Returns true if there was an error (import doesn't resolve).
     */
    private async validateImportResolves(
        imp: ImportStatement,
        document: LangiumDocument,
        accept: ValidationAcceptor
    ): Promise<boolean> {
        if (!imp.uri) {
            return true; // Error already reported
        }

        const docDir = path.dirname(document.uri.fsPath);
        
        try {
            const resolvedUri = await this.importResolver.resolveFrom(docDir, imp.uri);
            
            // Check if the resolved file actually exists
            const filePath = resolvedUri.fsPath;
            const exists = await this.fileExists(filePath);
            
            if (!exists) {
                accept('error', ValidationMessages.IMPORT_UNRESOLVED(imp.uri), {
                    node: imp,
                    property: 'uri',
                    codeDescription: buildCodeDescription('language.md', 'imports'),
                    data: { code: IssueCodes.ImportUnresolved, uri: imp.uri }
                });
                return true;
            }
            
            return false;
        } catch (error: unknown) {
            // R8: Use structured error properties for precise diagnostics
            const message = error instanceof ImportResolutionError && error.hint
                ? `${ValidationMessages.IMPORT_UNRESOLVED(imp.uri)}: ${error.hint}`
                : ValidationMessages.IMPORT_UNRESOLVED(imp.uri);

            accept('error', message, {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                data: {
                    code: IssueCodes.ImportUnresolved,
                    uri: imp.uri,
                    ...(error instanceof ImportResolutionError && { reason: error.reason }),
                }
            });
            return true;
        }
    }

    /**
     * Checks if a file exists (async).
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            const stat = await fs.stat(filePath);
            return stat.isFile();
        } catch {
            return false;
        }
    }

    /**
     * Finds the dependency configuration that matches the import specifier.
     * 
     * Dependencies can be keyed as:
     * - owner/package (recommended, matches "owner/package" or "owner/package/subpath")
     * - short-alias (matches "short-alias" or "short-alias/subpath")
     * 
     * @returns The matching key and normalized dependency, or undefined if not found
     */
    private findDependency(
        manifest: ModelManifest,
        specifier: string
    ): { key: string; dependency: ExtendedDependencySpec } | undefined {
        const dependencies = manifest.dependencies;
        if (!dependencies) {
            return undefined;
        }

        // Sort keys by length descending to match most specific first
        const sortedKeys = Object.keys(dependencies).sort((a, b) => b.length - a.length);

        for (const key of sortedKeys) {
            // Exact match or prefix match (key followed by /)
            if (specifier === key || specifier.startsWith(`${key}/`)) {
                const dependency = this.getDependency(manifest, key);
                if (dependency) {
                    return { key, dependency };
                }
            }
        }

        return undefined;
    }

    /**
     * Gets the normalized dependency configuration for a key.
     */
    private getDependency(manifest: ModelManifest, key: string): ExtendedDependencySpec | undefined {
        const dep = manifest.dependencies?.[key];
        if (!dep) {
            return undefined;
        }

        if (typeof dep === 'string') {
            return { source: key, ref: dep };
        }

        if (!dep.source && !dep.path) {
            return { ...dep, source: key };
        }

        return dep;
    }

    /**
     * Validates dependency configuration.
     */
    private validateDependencyConfig(
        dependency: ExtendedDependencySpec,
        alias: string,
        accept: ValidationAcceptor,
        imp: ImportStatement
    ): void {
        if (dependency.source && dependency.path) {
            accept('error', ValidationMessages.IMPORT_CONFLICTING_SOURCE_PATH(alias), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                data: { code: IssueCodes.ImportConflictingSourcePath, alias }
            });
            return;
        }

        if (!dependency.source && !dependency.path) {
            accept('error', ValidationMessages.IMPORT_MISSING_SOURCE_OR_PATH(alias), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                data: { code: IssueCodes.ImportMissingSourceOrPath, alias }
            });
            return;
        }

        if (dependency.source && !dependency.ref) {
            accept('error', ValidationMessages.IMPORT_MISSING_REF(alias), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                data: { code: IssueCodes.ImportMissingRef, alias }
            });
        }

        if (dependency.path) {
            this.validateLocalPathDependency(dependency.path, alias, accept, imp);
        }
    }

    /**
     * Validates local path dependencies stay within workspace.
     */
    private validateLocalPathDependency(
        dependencyPath: string,
        alias: string,
        accept: ValidationAcceptor,
        imp: ImportStatement
    ): void {
        if (path.isAbsolute(dependencyPath)) {
            accept('error', ValidationMessages.IMPORT_ABSOLUTE_PATH(alias, dependencyPath), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                data: { code: IssueCodes.ImportAbsolutePath, alias, path: dependencyPath }
            });
            return;
        }

        try {
            const workspaceRoot = this.workspaceManager.getWorkspaceRoot();
            const resolvedPath = path.resolve(workspaceRoot, dependencyPath);
            const relativeToWorkspace = path.relative(workspaceRoot, resolvedPath);

            if (relativeToWorkspace.startsWith('..') || path.isAbsolute(relativeToWorkspace)) {
                accept('error', ValidationMessages.IMPORT_ESCAPES_WORKSPACE(alias), {
                    node: imp,
                    property: 'uri',
                    codeDescription: buildCodeDescription('language.md', 'imports'),
                    data: { code: IssueCodes.ImportEscapesWorkspace, alias }
                });
            }
        } catch (error) {
            // ManifestManager not initialized - skip workspace boundary check
            // This can happen for standalone files without model.yaml
            console.warn(`Could not validate workspace boundary for path dependency: ${error}`);
        }
    }

    /**
     * Validates that external dependency is in lock file and cached.
     */
    private async validateCachedPackage(
        dependency: ExtendedDependencySpec,
        alias: string,
        lockFile: LockFile,
        accept: ValidationAcceptor,
        imp: ImportStatement
    ): Promise<void> {
        // Source is guaranteed to exist when this method is called (see caller)
        const packageKey = dependency.source ?? alias;
        const lockedDep = lockFile.dependencies[packageKey];

        if (!lockedDep) {
            accept('error', ValidationMessages.IMPORT_NOT_INSTALLED(alias), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                data: { code: IssueCodes.ImportNotInstalled, alias }
            });
            return;
        }

        try {
            const workspaceRoot = this.workspaceManager.getWorkspaceRoot();
            const cacheDir = this.getCacheDirectory(workspaceRoot, packageKey, lockedDep.commit);

            const cacheExists = await this.directoryExists(cacheDir);
            if (!cacheExists) {
                accept('error', ValidationMessages.IMPORT_NOT_INSTALLED(alias), {
                    node: imp,
                    property: 'uri',
                    codeDescription: buildCodeDescription('language.md', 'imports'),
                    data: { code: IssueCodes.ImportNotInstalled, alias }
                });
            }
        } catch (error) {
            // ManifestManager not initialized - log warning but continue
            console.warn(`Could not validate cached package for ${alias}: ${error}`);
        }
    }

    /**
     * Gets the cache directory for a dependency.
     * Per PRS-010: Project-local cache at .dlang/packages/{owner}/{repo}/{commit}/
     */
    private getCacheDirectory(workspaceRoot: string, source: string, commitHash: string): string {
        const [owner, repo] = source.split('/');
        return path.join(workspaceRoot, '.dlang', 'packages', owner, repo, commitHash);
    }

    /**
     * Checks if a directory exists (async).
     */
    private async directoryExists(dirPath: string): Promise<boolean> {
        try {
            const stat = await fs.stat(dirPath);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    // --- PRS-017 R3: Import cycle detection ---

    /**
     * Reports a warning if the current document is part of an import cycle.
     *
     * Cycle data is populated during indexing by DomainLangIndexManager.
     * This method reads the pre-computed cycles and emits a diagnostic
     * on the import statement contributing to the cycle.
     */
    private checkImportCycle(
        document: LangiumDocument,
        imp: ImportStatement,
        accept: ValidationAcceptor
    ): void {
        if (!this.indexManager) return;

        const cycle = this.indexManager.getCycleForDocument(document.uri.toString());
        if (!cycle || cycle.length === 0) return;

        // Build human-readable cycle display using basenames
        const cycleDisplay = cycle
            .map(uri => {
                const parts = uri.split('/');
                return parts.at(-1) ?? uri;
            })
            .join(' → ');

        accept('warning', ValidationMessages.IMPORT_CYCLE_DETECTED(cycleDisplay), {
            node: imp,
            property: 'uri',
            codeDescription: buildCodeDescription('language.md', 'imports'),
            data: { code: IssueCodes.ImportCycleDetected }
        });
    }
}

/**
 * Creates validation checks for import statements.
 *
 * Returns async validators that leverage the shared ManifestManager
 * for cached manifest/lock file reading.
 */
export function createImportChecks(services: DomainLangServices): ValidationChecks<DomainLangAstType> {
    const validator = new ImportValidator(services);

    return {
        // Langium 4.x supports async validators via MaybePromise<void>
        ImportStatement: async (imp, accept, cancelToken) => {
            // Get document from root (Model), not from ImportStatement
            // Langium sets $document only on the root AST node
            const root = imp.$container;
            const document = root?.$document;
            if (!document) {
                return;
            }

            await validator.checkImportPath(imp, accept, document, cancelToken);
        }
    };
}
