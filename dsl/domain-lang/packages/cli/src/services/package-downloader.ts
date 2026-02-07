/**
 * Package Downloader Service
 * 
 * Core HTTP-based package fetching system for downloading DomainLang packages
 * from GitHub repositories. Handles tarball downloads, ref resolution, integrity
 * verification, and progress tracking.
 * 
 * Features:
 * - Downloads tarballs via GitHub API
 * - Resolves refs (tags, branches, commits) to commit SHAs
 * - Computes SHA-512 integrity hashes in SRI format
 * - Emits progress events for UI integration
 * - Integrates with CredentialProvider for authentication
 * - Uses PackageCache for local storage
 * - Handles rate limiting and provides clear error messages
 */

import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fetchWithRetry } from './fetch-utils.js';
import type { CredentialProvider } from './credential-provider.js';
import type { PackageCache } from './package-cache.js';

/**
 * Events emitted during package download lifecycle.
 */
export type PackageEvent =
    | { type: 'resolving'; pkg: string }
    | { type: 'downloading'; pkg: string; bytesReceived: number; totalBytes?: number }
    | { type: 'extracting'; pkg: string }
    | { type: 'cached'; pkg: string; commit: string }
    | { type: 'complete'; pkg: string; commit: string; integrity: string }
    | { type: 'error'; pkg: string; error: string }
    | { type: 'rate-limit'; remaining: number; resetAt: Date };

/**
 * GitHub API response for commit lookup.
 */
interface GitHubCommitResponse {
    sha: string;
    node_id: string;
    commit: {
        author?: unknown;
        committer?: unknown;
        message: string;
    };
}

/**
 * GitHub API rate limit headers.
 */
interface RateLimitInfo {
    limit: number;
    remaining: number;
    reset: number; // Unix timestamp
    used: number;
}

/**
 * Package downloader for fetching packages from GitHub repositories.
 * 
 * @example
 * ```typescript
 * const downloader = new PackageDownloader(
 *   credentialProvider,
 *   packageCache,
 *   (event) => console.log(event)
 * );
 * 
 * const result = await downloader.download('domainlang', 'core', 'v1.0.0');
 * console.log(`Downloaded commit ${result.commitSha} with integrity ${result.integrity}`);
 * ```
 */
export class PackageDownloader {
    private readonly credentialProvider: CredentialProvider;
    private readonly packageCache: PackageCache;
    private readonly eventCallback?: (event: PackageEvent) => void;

    private readonly githubApiBaseUrl = 'https://api.github.com';
    private readonly githubApiVersion = '2022-11-28';

    constructor(
        credentialProvider: CredentialProvider,
        packageCache: PackageCache,
        eventCallback?: (event: PackageEvent) => void
    ) {
        this.credentialProvider = credentialProvider;
        this.packageCache = packageCache;
        this.eventCallback = eventCallback;
    }

    /**
     * Download a package from a GitHub repository.
     * 
     * Workflow:
     * 1. Resolve ref to commit SHA
     * 2. Check cache for existing package
     * 3. Download tarball if not cached
     * 4. Compute integrity hash
     * 5. Extract to cache
     * 6. Store metadata (integrity, resolved URL)
     * 
     * @param owner - Repository owner (e.g., "domainlang")
     * @param repo - Repository name (e.g., "core")
     * @param ref - Git ref (tag, branch, or commit SHA)
     * @returns Download result with commit SHA, integrity hash, and cached path
     * 
     * @throws Error if download fails, auth fails, or repo not found
     */
    async download(
        owner: string,
        repo: string,
        ref: string
    ): Promise<{ commitSha: string; integrity: string; path: string; resolved: string }> {
        const pkg = `${owner}/${repo}`;

        try {
            // Step 1: Resolve ref to commit SHA
            this.emit({ type: 'resolving', pkg });
            const commitSha = await this.resolveRefToCommit(owner, repo, ref);

            // Step 2: Check cache for existing package and metadata
            const cachedPath = await this.packageCache.get(owner, repo, commitSha);
            if (cachedPath) {
                this.emit({ type: 'cached', pkg, commit: commitSha });
                
                // Try to get cached metadata
                const metadata = await this.packageCache.getMetadata(owner, repo, commitSha);
                if (metadata) {
                    this.emit({ type: 'complete', pkg, commit: commitSha, integrity: metadata.integrity });
                    return { 
                        commitSha, 
                        integrity: metadata.integrity, 
                        path: cachedPath,
                        resolved: metadata.resolved
                    };
                }
                
                // Legacy cached package without metadata - will need to re-download
                // to get integrity hash. For now, we'll proceed with download.
                // In production, we could compute integrity from the cached package,
                // but that would require re-reading all files.
                console.warn(`Cache for ${pkg}@${commitSha} missing integrity metadata, re-downloading`);
            }

            // Step 3: Download tarball
            const { tarballPath, integrity, resolved } = await this.downloadTarball(owner, repo, commitSha, pkg);

            // Step 4: Extract to cache
            this.emit({ type: 'extracting', pkg });
            const extractedPath = await this.packageCache.put(owner, repo, commitSha, tarballPath);

            // Step 5: Store metadata
            await this.packageCache.putMetadata(owner, repo, commitSha, {
                integrity,
                resolved,
                commitSha,
            });

            // Clean up temp tarball
            await unlink(tarballPath).catch(() => {
                // Ignore cleanup errors
            });

            this.emit({ type: 'complete', pkg, commit: commitSha, integrity });
            return { commitSha, integrity, path: extractedPath, resolved };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.emit({ type: 'error', pkg, error: message });
            throw error;
        }
    }

    /**
     * Resolve a Git ref to a commit SHA.
     * 
     * Uses the unified `/repos/{owner}/{repo}/commits/{ref}` endpoint which
     * resolves tags, branches, and commit SHAs in a single API call.
     * This avoids the previous try-tag-then-branch approach which made
     * 2 sequential API calls (each with a credential lookup) for branch refs.
     * 
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param ref - Git ref (tag, branch, or commit SHA)
     * @returns Resolved commit SHA
     * 
     * @throws Error if ref cannot be resolved or repo not found
     */
    async resolveRefToCommit(owner: string, repo: string, ref: string): Promise<string> {
        // If ref looks like a commit SHA (40 hex chars), validate it
        if (/^[0-9a-f]{40}$/i.test(ref)) {
            return await this.validateCommitSha(owner, repo, ref);
        }

        // Use unified commits endpoint — resolves tags, branches, and short SHAs in one call
        const url = `${this.githubApiBaseUrl}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`;
        const response = await this.fetchGitHub(url);

        if (!response.ok) {
            if (response.status === 404 || response.status === 422) {
                throw new Error(
                    `Unable to resolve ref '${ref}' in ${owner}/${repo}. ` +
                    `Ref is not a valid tag, branch, or commit SHA.`
                );
            }
            throw new Error(
                `Failed to resolve ref '${ref}' in ${owner}/${repo}: HTTP ${response.status}`
            );
        }

        const data = await response.json() as GitHubCommitResponse;
        return data.sha;
    }

    /**
     * Validate a commit SHA exists in the repository.
     */
    private async validateCommitSha(owner: string, repo: string, sha: string): Promise<string> {
        const url = `${this.githubApiBaseUrl}/repos/${owner}/${repo}/commits/${sha}`;
        const response = await this.fetchGitHub(url);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`Commit '${sha}' not found in ${owner}/${repo}`);
            }
            throw new Error(`Failed to validate commit '${sha}': HTTP ${response.status}`);
        }

        const data = await response.json() as GitHubCommitResponse;
        return data.sha;
    }

    /**
     * Download a tarball from GitHub and compute its integrity hash.
     */
    private async downloadTarball(
        owner: string,
        repo: string,
        commitSha: string,
        pkg: string
    ): Promise<{ tarballPath: string; integrity: string; resolved: string }> {
        const url = `${this.githubApiBaseUrl}/repos/${owner}/${repo}/tarball/${commitSha}`;
        
        this.emit({ type: 'downloading', pkg, bytesReceived: 0 });

        const response = await this.fetchGitHub(url);

        if (!response.ok) {
            throw new Error(
                `Failed to download tarball for ${owner}/${repo}@${commitSha}: ` +
                `HTTP ${response.status} ${response.statusText}`
            );
        }

        // Create temp file for tarball
        const tarballPath = join(tmpdir(), `dlang-${randomUUID()}.tar.gz`);
        await mkdir(join(tarballPath, '..'), { recursive: true });

        // Stream response to file while computing hash
        const hash = createHash('sha512');
        const fileStream = createWriteStream(tarballPath);

        const contentLength = response.headers.get('content-length');
        const totalBytes = contentLength ? Number.parseInt(contentLength, 10) : undefined;
        let bytesReceived = 0;

        if (!response.body) {
            throw new Error('Response body is null');
        }

        // Stream response chunks to file and hash
        const reader = response.body.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Update hash
                hash.update(value);
                
                // Write to file
                await new Promise<void>((resolve, reject) => {
                    fileStream.write(value, (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });

                // Emit progress
                bytesReceived += value.length;
                this.emit({ type: 'downloading', pkg, bytesReceived, totalBytes });
            }
        } finally {
            reader.releaseLock();
        }

        // Close file stream
        await new Promise<void>((resolve, reject) => {
            fileStream.end((error: Error | null | undefined) => {
                if (error) reject(error);
                else resolve();
            });
        });

        // Compute SRI format: sha512-{base64}
        const hashBuffer = hash.digest();
        const integrity = `sha512-${hashBuffer.toString('base64')}`;

        return { tarballPath, integrity, resolved: url };
    }

    /**
     * Fetch from GitHub API with authentication and retry logic.
     */
    private async fetchGitHub(url: string): Promise<Response> {
        const credentials = await this.credentialProvider.getGitHubCredentials('github.com');
        const authHeader = this.credentialProvider.getAuthorizationHeader(credentials);

        const headers: Record<string, string> = {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': this.githubApiVersion,
        };

        if (authHeader) {
            headers['Authorization'] = authHeader;
        }

        const response = await fetchWithRetry(url, { headers });

        // Parse rate limit headers
        this.parseRateLimitHeaders(response);

        // Handle auth failures with clear error messages
        if (response.status === 401 || response.status === 403) {
            const repoRegex = /repos\/([^/]+\/[^/]+)/;
            const repoMatch = repoRegex.exec(url);
            const repo = repoMatch ? repoMatch[1] : 'repository';
            
            throw new Error(
                `Authentication failed for '${repo}' (HTTP ${response.status})\n` +
                `Hint: For private repos, ensure credentials are available:\n` +
                `  • Run 'gh auth login' (GitHub CLI)\n` +
                `  • Set GITHUB_TOKEN environment variable\n` +
                `  • Configure a git credential helper`
            );
        }

        return response;
    }

    /**
     * Parse and emit rate limit information from response headers.
     */
    private parseRateLimitHeaders(response: Response): void {
        const limit = response.headers.get('x-ratelimit-limit');
        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');
        const used = response.headers.get('x-ratelimit-used');

        if (remaining && reset) {
            const rateLimitInfo: RateLimitInfo = {
                limit: limit ? Number.parseInt(limit, 10) : 0,
                remaining: Number.parseInt(remaining, 10),
                reset: Number.parseInt(reset, 10),
                used: used ? Number.parseInt(used, 10) : 0,
            };

            // Emit rate limit event if low on remaining requests
            if (rateLimitInfo.remaining < 10) {
                const resetDate = new Date(rateLimitInfo.reset * 1000);
                this.emit({
                    type: 'rate-limit',
                    remaining: rateLimitInfo.remaining,
                    resetAt: resetDate,
                });
            }
        }
    }

    /**
     * Emit an event if callback is registered.
     */
    private emit(event: PackageEvent): void {
        if (this.eventCallback) {
            this.eventCallback(event);
        }
    }
}
