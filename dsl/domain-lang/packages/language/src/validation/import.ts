import fs from 'node:fs/promises';
import path from 'node:path';
import type { ValidationAcceptor, ValidationChecks, LangiumDocument } from 'langium';
import { Cancellation, URI } from 'langium';
import type { DomainLangAstType, ImportStatement } from '../generated/ast.js';
import type { DomainLangServices } from '../domain-lang-module.js';
import type { ManifestManager } from '../services/workspace-manager.js';
import type { ImportResolver } from '../services/import-resolver.js';
import { ImportResolutionError } from '../services/import-resolver.js';
import type { ExtendedDependencySpec, ModelManifest, LockFile, ImportCycleDetector } from '../services/types.js';
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
    private readonly manifestManager: ManifestManager;
    private readonly importResolver: ImportResolver;
    private readonly indexManager: ImportCycleDetector | undefined;

    constructor(services: DomainLangServices) {
        this.manifestManager = services.imports.ManifestManager;
        this.importResolver = services.imports.ImportResolver;
        // IndexManager is in shared services — use ImportCycleDetector interface for cycle detection
        const indexMgr = services.shared.workspace.IndexManager;
        this.indexManager = 'getCycleForDocument' in indexMgr
            ? indexMgr as ImportCycleDetector
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
        cancelToken: Cancellation.CancellationToken
    ): Promise<void> {
        if (!imp.uri) {
            accept('error', ValidationMessages.IMPORT_MISSING_URI(), {
                node: imp,
                keyword: 'import',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                code: IssueCodes.ImportMissingUri
            });
            return;
        }

        // PRS-017 R3: Check for import cycles detected during indexing
        this.checkImportCycle(document, imp, accept);

        if (cancelToken.isCancellationRequested) return;

        // First, verify the import resolves to a valid file
        // This catches renamed/moved/deleted files immediately
        const resolveError = await this.validateImportResolves(imp, document, accept);
        if (resolveError) {
            return; // Don't continue with other validations if can't resolve
        }

        if (imp.uri.startsWith('./') || imp.uri.startsWith('../') || imp.uri.startsWith('@')) {
            return;
        }

        if (cancelToken.isCancellationRequested) return;

        // Initialize manifest manager from document location
        const docDir = path.dirname(document.uri.fsPath);
        await this.manifestManager.initialize(docDir);

        const manifest = await this.manifestManager.getManifest();
        if (!manifest) {
            accept('error', ValidationMessages.IMPORT_REQUIRES_MANIFEST(imp.uri), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                code: IssueCodes.ImportRequiresManifest,
                data: { specifier: imp.uri }
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
                code: IssueCodes.ImportNotInManifest,
                data: { alias: imp.uri }
            });
            return;
        }

        const { key, dependency } = match;
        if (!this.validateDependencyConfig(dependency, key, accept, imp)) return;

        // External source dependencies require lock file and cached packages
        if (dependency.source) {
            if (cancelToken.isCancellationRequested) return;

            const lockFile = await this.manifestManager.getLockFile();
            if (!lockFile) {
                accept('error', ValidationMessages.IMPORT_NOT_INSTALLED(key), {
                    node: imp,
                    property: 'uri',
                    codeDescription: buildCodeDescription('language.md', 'imports'),
                    code: IssueCodes.ImportNotInstalled,
                    data: { alias: key }
                });
                return;
            }

            await this.validateCachedPackage(dependency, key, lockFile, accept, imp);
        }
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
                    code: IssueCodes.ImportUnresolved,
                    data: { uri: imp.uri }
                });
                return true;
            }

            // R-009: Reject resolved files that are not .dlang — e.g. a .json file placed
            // at the resolved path would otherwise silently pass validation.
            if (!filePath.endsWith('.dlang')) {
                accept('error', `Import '${imp.uri}' resolved to '${path.basename(filePath)}' which is not a DomainLang file (.dlang required).`, {
                    node: imp,
                    property: 'uri',
                    code: IssueCodes.ImportUnresolved,
                    codeDescription: buildCodeDescription('language.md', 'imports'),
                    data: { uri: imp.uri }
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
                code: IssueCodes.ImportUnresolved,
                data: {
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
     * Returns false if a blocking error was found (caller should stop processing).
     */
    private validateDependencyConfig(
        dependency: ExtendedDependencySpec,
        alias: string,
        accept: ValidationAcceptor,
        imp: ImportStatement
    ): boolean {
        if (dependency.source && dependency.path) {
            accept('error', ValidationMessages.IMPORT_CONFLICTING_SOURCE_PATH(alias), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                code: IssueCodes.ImportConflictingSourcePath,
                data: { alias }
            });
            return false;
        }

        if (!dependency.source && !dependency.path) {
            accept('error', ValidationMessages.IMPORT_MISSING_SOURCE_OR_PATH(alias), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                code: IssueCodes.ImportMissingSourceOrPath,
                data: { alias }
            });
            return false;
        }

        if (dependency.source && !dependency.ref) {
            accept('error', ValidationMessages.IMPORT_MISSING_REF(alias), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                code: IssueCodes.ImportMissingRef,
                data: { alias }
            });
        }

        if (dependency.path) {
            this.validateLocalPathDependency(dependency.path, alias, accept, imp);
        }

        return true;
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
                code: IssueCodes.ImportAbsolutePath,
                data: { alias, path: dependencyPath }
            });
            return;
        }

        try {
            const workspaceRoot = this.manifestManager.getWorkspaceRoot();
            const resolvedPath = path.resolve(workspaceRoot, dependencyPath);
            const relativeToWorkspace = path.relative(workspaceRoot, resolvedPath);

            if (relativeToWorkspace.startsWith('..') || path.isAbsolute(relativeToWorkspace)) {
                accept('error', ValidationMessages.IMPORT_ESCAPES_WORKSPACE(alias), {
                    node: imp,
                    property: 'uri',
                    codeDescription: buildCodeDescription('language.md', 'imports'),
                    code: IssueCodes.ImportEscapesWorkspace,
                    data: { alias }
                });
            }
        } catch {
            // If workspace root cannot be determined, fail closed — do not allow
            // the import to proceed without a successful boundary check (B-001).
            accept('error', ValidationMessages.IMPORT_ESCAPES_WORKSPACE(alias), {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports'),
                data: { code: IssueCodes.ImportEscapesWorkspace, alias }
            });
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
                code: IssueCodes.ImportNotInstalled,
                data: { alias }
            });
            return;
        }

        try {
            const workspaceRoot = this.manifestManager.getWorkspaceRoot();
            const cacheDir = this.getCacheDirectory(workspaceRoot, packageKey, lockedDep.commit);

            const cacheExists = await this.directoryExists(cacheDir);
            if (!cacheExists) {
                accept('error', ValidationMessages.IMPORT_NOT_INSTALLED(alias), {
                    node: imp,
                    property: 'uri',
                    codeDescription: buildCodeDescription('language.md', 'imports'),
                    code: IssueCodes.ImportNotInstalled,
                    data: { alias }
                });
            }
        } catch {
            // ManifestManager not initialized yet — emit a soft warning so the user isn't left with a silent pass
            accept('warning', `Could not fully validate dependency '${alias}': workspace not yet initialized. Re-save to re-validate.`, {
                node: imp,
                property: 'uri',
                codeDescription: buildCodeDescription('language.md', 'imports')
            });
        }
    }

    /**
     * Gets the cache directory for a dependency.
     * Per PRS-010: Project-local cache at .dlang/packages/{owner}/{repo}/{commit}/
     * The source field comes from user-controlled model.yaml, so validate the result stays within the cache dir.
     */
    private getCacheDirectory(workspaceRoot: string, source: string, commitHash: string): string {
        const parts = source.split('/');
        if (parts.length < 2 || !parts[0] || !parts[1]) {
            throw new Error(`Invalid import source format: expected owner/repo, got '${source}'`);
        }
        const [owner, repo] = parts;
        const cacheBase = path.join(workspaceRoot, '.dlang', 'packages');
        const result = path.join(cacheBase, owner, repo, commitHash);
        if (!result.startsWith(cacheBase + path.sep)) {
            // source contains traversal segments — return an impossible path so directoryExists returns false
            return path.join(cacheBase, '__invalid__');
        }
        return result;
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
     * Reports a warning if the current import statement points to a document in a cycle.
     *
     * Cycle data is populated during indexing by DomainLangIndexManager.
     * Only the import statement whose target is part of the cycle is annotated;
     * other imports in the same file are skipped to avoid duplicate diagnostics.
     */
    private checkImportCycle(
        document: LangiumDocument,
        imp: ImportStatement,
        accept: ValidationAcceptor
    ): void {
        if (!this.indexManager) return;

        const cycle = this.indexManager.getCycleForDocument(document.uri.toString());
        if (!cycle || cycle.length === 0) return;

        // Only annotate the import whose URI matches a document in the cycle.
        // Resolve to an absolute file URI for comparison — prevents false-positive cycle
        // detection for different files sharing the same basename (R-008).
        if (!imp.uri) return;
        const docDir = path.dirname(document.uri.fsPath);
        const resolvedAbsPath = path.resolve(docDir, imp.uri);
        const resolvedImpUri = URI.file(resolvedAbsPath).toString();
        const isInCycle = cycle.some(uri => uri === resolvedImpUri);
        if (!isInCycle) return;

        // Build human-readable cycle display using absolute paths
        const cycleDisplay = cycle
            .map(uri => {
                try {
                    return URI.parse(uri).fsPath;
                } catch {
                    return uri;
                }
            })
            .join(' → ');

        accept('warning', ValidationMessages.IMPORT_CYCLE_DETECTED(cycleDisplay), {
            node: imp,
            property: 'uri',
            codeDescription: buildCodeDescription('language.md', 'imports'),
            code: IssueCodes.ImportCycleDetected
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
