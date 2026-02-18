/**
 * Model validation utilities for Node.js environments.
 * 
 * **WARNING: This module is NOT browser-compatible.**
 * 
 * Provides validation capabilities that leverage the LSP infrastructure
 * for workspace initialization, import resolution, and document building.
 * 
 * @module sdk/validator
 */

import { NodeFileSystem } from 'langium/node';
import { URI } from 'langium';
import { createDomainLangServices } from '../domain-lang-module.js';
import { ensureImportGraphFromDocument } from '../utils/import-utils.js';
import { isModel } from '../generated/ast.js';
import { dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Validation diagnostic with file context.
 */
export interface ValidationDiagnostic {
    /** Diagnostic severity (1=error, 2=warning, 3=info, 4=hint) */
    severity: number;
    /** Diagnostic message */
    message: string;
    /** File path where diagnostic occurred */
    file: string;
    /** Line number (1-based) */
    line: number;
    /** Column number (1-based) */
    column: number;
}

/**
 * Result of model validation.
 */
export interface ValidationResult {
    /** Whether the model is valid (no errors) */
    valid: boolean;
    /** Number of files validated */
    fileCount: number;
    /** Number of domains in the model */
    domainCount: number;
    /** Number of bounded contexts in the model */
    bcCount: number;
    /** Validation errors */
    errors: ValidationDiagnostic[];
    /** Validation warnings */
    warnings: ValidationDiagnostic[];
}

/**
 * Options for validation.
 */
export interface ValidationOptions {
    /** Workspace directory (defaults to file's directory) */
    workspaceDir?: string;
}

/**
 * Convert Langium diagnostic to ValidationDiagnostic.
 */
function toValidationDiagnostic(
    diagnostic: { severity?: number; message: string; range: { start: { line: number; character: number } } },
    file: string
): ValidationDiagnostic {
    return {
        severity: diagnostic.severity ?? 1,
        message: diagnostic.message,
        file,
        line: diagnostic.range.start.line + 1,
        column: diagnostic.range.start.character + 1,
    };
}

/**
 * Collect errors and warnings from an array of Langium documents.
 */
function collectDiagnostics(
    allDocuments: Iterable<{ uri: { fsPath: string }; diagnostics?: Array<{ severity?: number; message: string; range: { start: { line: number; character: number } } }> }>
): { errors: ValidationDiagnostic[]; warnings: ValidationDiagnostic[] } {
    const errors: ValidationDiagnostic[] = [];
    const warnings: ValidationDiagnostic[] = [];
    for (const doc of allDocuments) {
        const diagnostics = doc.diagnostics ?? [];
        const docPath = doc.uri.fsPath;
        for (const diagnostic of diagnostics) {
            const validationDiag = toValidationDiagnostic(diagnostic, docPath);
            if (diagnostic.severity === 1) {
                errors.push(validationDiag);
            } else if (diagnostic.severity === 2) {
                warnings.push(validationDiag);
            }
        }
    }
    return { errors, warnings };
}

/**
 * Count Domain and BoundedContext elements across all documents.
 */
function countModelElements(
    allDocuments: Iterable<{ parseResult?: { value: unknown } }>
): { domainCount: number; bcCount: number } {
    let domainCount = 0;
    let bcCount = 0;
    for (const doc of allDocuments) {
        const model = doc.parseResult?.value;
        if (isModel(model)) {
            for (const element of model.children ?? []) {
                if (element.$type === 'Domain') {
                    domainCount++;
                } else if (element.$type === 'BoundedContext') {
                    bcCount++;
                }
            }
        }
    }
    return { domainCount, bcCount };
}

/**
 * Validates a DomainLang model file and all its imports.
 * 
 * Uses the LSP infrastructure to:
 * - Initialize the workspace
 * - Resolve and load imports
 * - Build and validate all documents
 * 
 * @param filePath - Path to the entry .dlang file
 * @param options - Validation options
 * @returns Validation result with errors, warnings, and model statistics
 * @throws Error if file doesn't exist or has invalid extension
 * 
 * @example
 * ```typescript
 * import { validateFile } from '@domainlang/language/sdk';
 * 
 * const result = await validateFile('./index.dlang');
 * 
 * if (!result.valid) {
 *   for (const err of result.errors) {
 *     console.error(`${err.file}:${err.line}:${err.column}: ${err.message}`);
 *   }
 *   process.exit(1);
 * }
 * 
 * console.log(`✓ Validated ${result.fileCount} files`);
 * console.log(`  ${result.domainCount} domains, ${result.bcCount} bounded contexts`);
 * ```
 */
export async function validateFile(
    filePath: string,
    options: ValidationOptions = {}
): Promise<ValidationResult> {
    // Resolve absolute path
    const absolutePath = resolve(filePath);
    
    // Check file exists
    if (!existsSync(absolutePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    // Create services with workspace support
    const servicesObj = createDomainLangServices(NodeFileSystem);
    const shared = servicesObj.shared;
    const services = servicesObj.DomainLang;
    
    // Check file extension
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.some(ext => absolutePath.endsWith(ext))) {
        throw new Error(`Invalid file extension. Expected: ${extensions.join(', ')}`);
    }

    // Initialize workspace with the specified directory or file's directory
    const workspaceDir = options.workspaceDir ?? dirname(absolutePath);
    const manifestManager = services.imports.ManifestManager;
    await manifestManager.initialize(workspaceDir);

    // Load and parse the document
    const uri = URI.file(absolutePath);
    const document = await shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
    
    // Build document initially without validation to load imports
    await shared.workspace.DocumentBuilder.build([document], { validation: false });
    
    // Load all imported documents via the import graph
    const importResolver = services.imports.ImportResolver;
    await ensureImportGraphFromDocument(
        document,
        shared.workspace.LangiumDocuments,
        importResolver
    );
    
    // Build all documents with validation enabled
    const allDocuments = Array.from(shared.workspace.LangiumDocuments.all);
    await shared.workspace.DocumentBuilder.build(allDocuments, { validation: true });

    // Collect diagnostics and count elements from all loaded documents (entry + imports)
    const { errors, warnings } = collectDiagnostics(allDocuments);
    const { domainCount, bcCount } = countModelElements(allDocuments);

    return {
        valid: errors.length === 0,
        fileCount: allDocuments.length,
        domainCount,
        bcCount,
        errors,
        warnings,
    };
}

/**
 * Workspace validation result with diagnostics grouped by file.
 */
export interface WorkspaceValidationResult {
    /** Whether the workspace is valid (no errors in any file) */
    valid: boolean;
    /** Number of files validated */
    fileCount: number;
    /** Number of domains across all files */
    domainCount: number;
    /** Number of bounded contexts across all files */
    bcCount: number;
    /** Validation errors grouped by file path */
    errors: ValidationDiagnostic[];
    /** Validation warnings grouped by file path */
    warnings: ValidationDiagnostic[];
    /** Total number of diagnostics across all files */
    totalDiagnostics: number;
}

/**
 * Validates an entire DomainLang workspace.
 * 
 * Uses the LSP infrastructure to:
 * - Initialize the workspace from a directory containing model.yaml
 * - Load the entry file (from manifest or default index.dlang)
 * - Resolve and load all imports
 * - Build and validate all documents in the workspace
 * - Collect diagnostics from ALL documents (like VS Code Problems pane)
 * 
 * @param workspaceDir - Path to the workspace directory (containing model.yaml)
 * @returns Validation result with diagnostics from all files
 * @throws Error if workspace directory doesn't exist or cannot be loaded
 * 
 * @example
 * ```typescript
 * import { validateWorkspace } from '@domainlang/language/sdk';
 * 
 * const result = await validateWorkspace('./my-workspace');
 * 
 * if (!result.valid) {
 *   console.error(`Found ${result.errors.length} errors in ${result.fileCount} files`);
 *   
 *   for (const err of result.errors) {
 *     console.error(`${err.file}:${err.line}:${err.column}: ${err.message}`);
 *   }
 *   process.exit(1);
 * }
 * 
 * console.log(`✓ Validated ${result.fileCount} files`);
 * console.log(`  ${result.domainCount} domains, ${result.bcCount} bounded contexts`);
 * console.log(`  0 errors, ${result.warnings.length} warnings`);
 * ```
 */
export async function validateWorkspace(
    workspaceDir: string
): Promise<WorkspaceValidationResult> {
    // Resolve absolute path
    const absolutePath = resolve(workspaceDir);
    
    // Check directory exists
    if (!existsSync(absolutePath)) {
        throw new Error(`Workspace directory not found: ${workspaceDir}`);
    }

    // Create services with workspace support
    const servicesObj = createDomainLangServices(NodeFileSystem);
    const shared = servicesObj.shared;
    const services = servicesObj.DomainLang;
    const manifestManager = services.imports.ManifestManager;

    try {
        // Initialize workspace - this will find and load model.yaml
        await manifestManager.initialize(absolutePath);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to initialize workspace at ${workspaceDir}: ${message}`);
    }

    // Get the manifest to find the entry file
    const manifest = await manifestManager.getManifest();
    let entryFile = 'index.dlang';
    
    if (manifest?.model?.entry) {
        entryFile = manifest.model.entry;
    }

    const entryPath = join(absolutePath, entryFile);
    
    // Check if entry file exists
    if (!existsSync(entryPath)) {
        throw new Error(
            `Entry file not found: ${entryFile}\n` +
            `Expected at: ${entryPath}\n` +
            (manifest ? `Specified in manifest` : `Using default entry file`)
        );
    }

    // Load and parse the entry document
    const uri = URI.file(entryPath);
    const document = await shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
    
    // Build document initially without validation to load imports
    await shared.workspace.DocumentBuilder.build([document], { validation: false });
    
    // Load all imported documents via the import graph
    const importResolver = services.imports.ImportResolver;
    await ensureImportGraphFromDocument(
        document,
        shared.workspace.LangiumDocuments,
        importResolver
    );
    
    // Build all documents with validation enabled
    const allDocuments = Array.from(shared.workspace.LangiumDocuments.all);
    await shared.workspace.DocumentBuilder.build(allDocuments, { validation: true });

    // Collect diagnostics and count elements from ALL documents (not just entry)
    const { errors, warnings } = collectDiagnostics(allDocuments);
    const { domainCount, bcCount } = countModelElements(allDocuments);

    return {
        valid: errors.length === 0,
        fileCount: allDocuments.length,
        domainCount,
        bcCount,
        errors,
        warnings,
        totalDiagnostics: errors.length + warnings.length,
    };
}
