/**
 * Package Boundary Detector
 * 
 * Determines package boundaries for import scoping.
 * Per ADR-003, package boundaries are defined by:
 * - External packages: Files within .dlang/packages/ sharing the same model.yaml
 * - Local files: Each file is its own boundary (non-transitive)
 * 
 * Used by DomainLangScopeProvider to enable transitive imports within
 * package boundaries while keeping local file imports non-transitive.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { URI } from 'langium';

/**
 * Detects and caches package boundaries for efficient scope resolution.
 */
export class PackageBoundaryDetector {
    /**
     * Cache mapping document URI to its package root path.
     * - External packages: path to directory containing model.yaml
     * - Local files: null (no package boundary)
     */
    private readonly packageRootCache = new Map<string, string | null>();

    /**
     * Determines if a document is part of an external package.
     * 
     * External packages are stored in .dlang/packages/owner/repo/commit/
     * 
     * @param documentUri - The URI of the document to check
     * @returns true if document is in an external package
     */
    isExternalPackage(documentUri: URI | string): boolean {
        const fsPath = this.toFsPath(documentUri);
        const normalized = fsPath.split(path.sep);
        
        // Check if path contains .dlang/packages/
        const dlangIndex = normalized.indexOf('.dlang');
        if (dlangIndex === -1) {
            return false;
        }
        
        return dlangIndex + 1 < normalized.length && 
               normalized[dlangIndex + 1] === 'packages';
    }

    /**
     * Gets the package root for a document.
     * 
     * For external packages (.dlang/packages/), walks up from the document
     * to find the nearest model.yaml file within the package structure.
     * 
     * For local files, returns null (no package boundary).
     * 
     * @param documentUri - The URI of the document
     * @returns Absolute path to package root, or null if not in a package
     */
    async getPackageRoot(documentUri: URI | string): Promise<string | null> {
        const uriString = documentUri.toString();
        
        // Check cache first
        if (this.packageRootCache.has(uriString)) {
            return this.packageRootCache.get(uriString) ?? null;
        }
        
        // If not an external package, it has no package boundary
        if (!this.isExternalPackage(documentUri)) {
            this.packageRootCache.set(uriString, null);
            return null;
        }
        
        const fsPath = this.toFsPath(documentUri);
        const packageRoot = await this.findPackageRootForExternal(fsPath);
        this.packageRootCache.set(uriString, packageRoot);
        return packageRoot;
    }

    /**
     * Checks if two documents are in the same package (synchronous heuristic).
     * 
     * This is a fast, synchronous check that compares package commit directories
     * without filesystem access. Documents are in the same package if:
     * - Both are in .dlang/packages/ AND
     * - They share the same owner/repo/commit path
     * 
     * This is used by the scope provider which needs synchronous access.
     * 
     * Structure: .dlang/packages/owner/repo/commit/...
     * 
     * @param doc1Uri - URI of first document
     * @param doc2Uri - URI of second document
     * @returns true if both are in the same package commit directory
     */
    areInSamePackageSync(doc1Uri: URI | string, doc2Uri: URI | string): boolean {
        // Both must be external packages
        if (!this.isExternalPackage(doc1Uri) || !this.isExternalPackage(doc2Uri)) {
            return false;
        }
        
        const path1 = this.toFsPath(doc1Uri);
        const path2 = this.toFsPath(doc2Uri);
        
        const root1 = this.getPackageCommitDirectory(path1);
        const root2 = this.getPackageCommitDirectory(path2);
        
        return root1 !== null && root1 === root2;
    }

    /**
     * Gets the package commit directory (owner/repo/commit) from a path.
     * 
     * @param fsPath - Filesystem path
     * @returns Commit directory path or null
     */
    private getPackageCommitDirectory(fsPath: string): string | null {
        const normalized = fsPath.split(path.sep);
        const dlangIndex = normalized.indexOf('.dlang');
        
        if (dlangIndex === -1) {
            return null;
        }
        
        const packagesIndex = dlangIndex + 1;
        if (packagesIndex >= normalized.length || normalized[packagesIndex] !== 'packages') {
            return null;
        }
        
        // Commit directory is at: .dlang/packages/owner/repo/commit
        const commitIndex = packagesIndex + 3;
        if (commitIndex >= normalized.length) {
            return null;
        }
        
        // Return the path up to and including the commit directory
        return normalized.slice(0, commitIndex + 1).join(path.sep);
    }

    /**
     * Checks if two documents are in the same package.
     * 
     * Documents are in the same package if:
     * - Both are external packages AND
     * - They share the same package root (model.yaml location)
     * 
     * Local files are never in the same package (each is isolated).
     * 
     * @param doc1Uri - URI of first document
     * @param doc2Uri - URI of second document
     * @returns true if both documents are in the same package
     */
    async areInSamePackage(doc1Uri: URI | string, doc2Uri: URI | string): Promise<boolean> {
        const root1 = await this.getPackageRoot(doc1Uri);
        const root2 = await this.getPackageRoot(doc2Uri);
        
        // If either is not in a package, they can't be in the same package
        if (!root1 || !root2) {
            return false;
        }
        
        return root1 === root2;
    }

    /**
     * Finds the package root for an external package by walking up to find model.yaml.
     * 
     * External packages have structure: .dlang/packages/owner/repo/commit/...
     * The model.yaml should be at the commit level or just below it.
     * 
     * @param fsPath - Filesystem path of the document
     * @returns Path to directory containing model.yaml, or null
     */
    private async findPackageRootForExternal(fsPath: string): Promise<string | null> {
        const normalized = fsPath.split(path.sep);
        const dlangIndex = normalized.indexOf('.dlang');
        
        if (dlangIndex === -1) {
            return null;
        }
        
        // Find the packages directory
        const packagesIndex = dlangIndex + 1;
        if (packagesIndex >= normalized.length || normalized[packagesIndex] !== 'packages') {
            return null;
        }
        
        // Start from the commit directory level
        // Structure: .dlang/packages/owner/repo/commit/
        const commitIndex = packagesIndex + 3;
        if (commitIndex >= normalized.length) {
            return null;
        }
        
        // Walk up from the document path to the commit directory
        let currentPath = path.dirname(fsPath);
        const commitPath = normalized.slice(0, commitIndex + 1).join(path.sep);
        
        // Search upward for model.yaml, but don't go above the commit directory
        while (currentPath.length >= commitPath.length) {
            const manifestPath = path.join(currentPath, 'model.yaml');
            try {
                await fs.access(manifestPath);
                return currentPath;
            } catch {
                // model.yaml not found at this level, continue upward
            }
            
            const parent = path.dirname(currentPath);
            if (parent === currentPath) {
                // Reached filesystem root without finding model.yaml
                break;
            }
            currentPath = parent;
        }
        
        return null;
    }

    /**
     * Converts a URI to a filesystem path.
     */
    private toFsPath(uri: URI | string): string {
        if (typeof uri === 'string') {
            uri = URI.parse(uri);
        }
        return uri.fsPath;
    }

    /**
     * Clears the package root cache.
     * Call this when packages are installed/removed.
     */
    clearCache(): void {
        this.packageRootCache.clear();
    }
}
