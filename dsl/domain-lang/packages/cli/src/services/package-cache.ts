/**
 * Package cache management service.
 * 
 * Manages the project-local `.dlang/packages/` cache directory with atomic
 * write operations to ensure cache integrity during concurrent installs.
 * 
 * Cache structure:
 * ```
 * .dlang/packages/{owner}/{repo}/{commitSha}/
 *   ├── .dlang-metadata.json    (integrity hash, resolved URL)
 *   └── ...package files...
 * ```
 * 
 * Temp directory pattern: `.dlang/packages/.tmp-{randomUUID}/`
 * 
 * All operations use atomic writes (temp → rename) to prevent cache corruption.
 */

import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extract } from 'tar';

/**
 * Metadata stored alongside cached packages.
 */
export interface PackageMetadata {
    /** SHA-512 integrity hash in SRI format */
    integrity: string;
    /** Tarball download URL */
    resolved: string;
    /** Commit SHA */
    commitSha: string;
}

/**
 * Package cache service for managing local package storage.
 * 
 * Provides atomic write operations and concurrent install protection
 * through filesystem rename semantics.
 */
export class PackageCache {
    private readonly cacheRoot: string;
    private readonly packagesDir: string;

    /**
     * Create a new package cache instance.
     * 
     * @param workspaceRoot - Absolute path to the workspace root directory
     */
    constructor(workspaceRoot: string) {
        this.cacheRoot = join(workspaceRoot, '.dlang');
        this.packagesDir = join(this.cacheRoot, 'packages');
    }

    /**
     * Check if a package exists in the cache.
     * 
     * @param owner - Package owner (e.g., "domainlang")
     * @param repo - Repository name (e.g., "core")
     * @param commitSha - Git commit SHA
     * @returns True if the package exists in the cache
     */
    async has(owner: string, repo: string, commitSha: string): Promise<boolean> {
        const packagePath = this.getPackagePath(owner, repo, commitSha);
        return existsSync(packagePath);
    }

    /**
     * Get the absolute path to a cached package.
     * 
     * @param owner - Package owner
     * @param repo - Repository name
     * @param commitSha - Git commit SHA
     * @returns Absolute path to the package, or undefined if not cached
     */
    async get(owner: string, repo: string, commitSha: string): Promise<string | undefined> {
        const packagePath = this.getPackagePath(owner, repo, commitSha);
        if (existsSync(packagePath)) {
            return packagePath;
        }
        return undefined;
    }

    /**
     * Get metadata for a cached package.
     * 
     * @param owner - Package owner
     * @param repo - Repository name
     * @param commitSha - Git commit SHA
     * @returns Package metadata, or undefined if not cached or metadata missing
     */
    async getMetadata(owner: string, repo: string, commitSha: string): Promise<PackageMetadata | undefined> {
        const packagePath = this.getPackagePath(owner, repo, commitSha);
        const metadataPath = join(packagePath, '.dlang-metadata.json');
        
        if (!existsSync(metadataPath)) {
            return undefined;
        }

        try {
            const content = await fs.readFile(metadataPath, 'utf-8');
            return JSON.parse(content) as PackageMetadata;
        } catch (error) {
            // Invalid or corrupted metadata - log and return undefined
            console.warn(`Failed to read metadata for ${owner}/${repo}@${commitSha}:`, error);
            return undefined;
        }
    }

    /**
     * Store metadata for a cached package.
     * 
     * @param owner - Package owner
     * @param repo - Repository name
     * @param commitSha - Git commit SHA
     * @param metadata - Metadata to store
     */
    async putMetadata(owner: string, repo: string, commitSha: string, metadata: PackageMetadata): Promise<void> {
        const packagePath = this.getPackagePath(owner, repo, commitSha);
        const metadataPath = join(packagePath, '.dlang-metadata.json');
        
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }

    /**
     * Add a package to the cache by extracting a tarball.
     * 
     * Uses atomic write pattern: extract to temp directory, then rename to final path.
     * If the target already exists (concurrent install), removes temp and returns existing path.
     * 
     * @param owner - Package owner
     * @param repo - Repository name
     * @param commitSha - Git commit SHA
     * @param tarballPath - Absolute path to the tarball to extract
     * @returns Absolute path to the cached package
     * @throws Error if extraction or filesystem operations fail
     */
    async put(owner: string, repo: string, commitSha: string, tarballPath: string): Promise<string> {
        const finalPath = this.getPackagePath(owner, repo, commitSha);
        const tempDir = join(this.packagesDir, `.tmp-${randomUUID()}`);

        try {
            // Create temp directory
            await fs.mkdir(tempDir, { recursive: true });

            // Extract tarball to temp directory with strip: 1
            // (removes the top-level directory from the tarball)
            await extract({
                file: tarballPath,
                cwd: tempDir,
                strip: 1,
            });

            // Ensure parent directory exists for the final path
            await fs.mkdir(join(finalPath, '..'), { recursive: true });

            // Atomic rename: if target exists, this will fail on some platforms
            // or succeed on others. We handle both cases.
            try {
                await fs.rename(tempDir, finalPath);
            } catch (error) {
                // Target might already exist (concurrent install or cache hit)
                // Check if final path exists
                if (existsSync(finalPath)) {
                    // Clean up our temp directory and return existing path
                    await this.cleanupTempDir(tempDir);
                    return finalPath;
                }
                // If target doesn't exist, this is a real error
                throw error;
            }

            return finalPath;
        } catch (error) {
            // Clean up temp directory on any error
            await this.cleanupTempDir(tempDir);
            throw new Error(
                `Failed to cache package ${owner}/${repo}@${commitSha}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Remove a specific package from the cache.
     * 
     * @param owner - Package owner
     * @param repo - Repository name
     * @param commitSha - Git commit SHA
     */
    async remove(owner: string, repo: string, commitSha: string): Promise<void> {
        const packagePath = this.getPackagePath(owner, repo, commitSha);
        if (existsSync(packagePath)) {
            await fs.rm(packagePath, { recursive: true, force: true });
        }
    }

    /**
     * Clear the entire package cache.
     * 
     * Removes the `.dlang/packages/` directory and all its contents.
     */
    async clear(): Promise<void> {
        if (existsSync(this.packagesDir)) {
            await fs.rm(this.packagesDir, { recursive: true, force: true });
        }
    }

    /**
     * Get the absolute path to a package in the cache.
     * 
     * @param owner - Package owner
     * @param repo - Repository name
     * @param commitSha - Git commit SHA
     * @returns Absolute path to the package directory
     */
    private getPackagePath(owner: string, repo: string, commitSha: string): string {
        return resolve(this.packagesDir, owner, repo, commitSha);
    }

    /**
     * Clean up a temporary directory, ignoring errors.
     * 
     * @param tempDir - Path to the temporary directory to remove
     */
    private async cleanupTempDir(tempDir: string): Promise<void> {
        try {
            if (existsSync(tempDir)) {
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        } catch (error) {
            // Log but don't throw - cleanup is best-effort
            console.warn(`Failed to clean up temp directory ${tempDir}:`, error);
        }
    }
}
