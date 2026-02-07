/**
 * Credential Provider Service (CLI-only)
 * 
 * Provides GitHub authentication credentials for accessing private repositories.
 * Implements a priority chain: environment variables → git credential helper → public access.
 * 
 * Resolution order (highest priority first):
 * 1. DLANG_GITHUB_TOKEN environment variable (project-specific override)
 * 2. GITHUB_TOKEN environment variable (standard CI token)
 * 3. git credential fill subprocess (reads OS keychain, GitHub CLI, credential managers)
 * 4. No credentials (public repository access only)
 * 
 * This module contains subprocess operations and should ONLY be used in CLI contexts,
 * never in the LSP.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * GitHub authentication credentials.
 */
export interface GitHubCredentials {
    /** Personal access token (preferred) */
    token?: string;
    /** Username for basic auth */
    username?: string;
    /** Password for basic auth */
    password?: string;
}

/**
 * Provides GitHub authentication credentials with graceful fallback.
 * 
 * @example
 * ```typescript
 * const provider = new CredentialProvider();
 * const creds = await provider.getGitHubCredentials('github.com');
 * const authHeader = provider.getAuthorizationHeader(creds);
 * 
 * fetch(url, {
 *   headers: authHeader ? { Authorization: authHeader } : {},
 * });
 * ```
 */
export class CredentialProvider {
    /** Cached credentials with TTL to avoid repeated subprocess spawns. */
    private cachedCredentials?: { value: GitHubCredentials | undefined; expiresAt: number };

    /** Cache TTL in milliseconds (5 minutes). */
    private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

    /**
     * Retrieves GitHub credentials for a given host.
     * 
     * Results are cached in memory for 5 minutes to avoid repeated
     * subprocess spawns for git credential fill (which can take 200-500ms
     * each on macOS due to Keychain access).
     * 
     * Resolution order:
     * 1. DLANG_GITHUB_TOKEN (project-specific)
     * 2. GITHUB_TOKEN (standard CI)
     * 3. git credential fill (OS keychain, GitHub CLI, credential manager)
     * 4. undefined (public access only)
     * 
     * @param host - Git host (e.g., 'github.com')
     * @returns GitHub credentials or undefined
     */
    async getGitHubCredentials(host: string): Promise<GitHubCredentials | undefined> {
        // Priority 1: DLANG_GITHUB_TOKEN (project-specific override)
        const dlangToken = process.env['DLANG_GITHUB_TOKEN'];
        if (dlangToken) {
            return { token: dlangToken };
        }

        // Priority 2: GITHUB_TOKEN (standard CI token)
        const githubToken = process.env['GITHUB_TOKEN'];
        if (githubToken) {
            return { token: githubToken };
        }

        // Check in-memory cache before spawning subprocess
        if (this.cachedCredentials && Date.now() < this.cachedCredentials.expiresAt) {
            return this.cachedCredentials.value;
        }

        // Priority 3: git credential fill (OS keychain, GitHub CLI, credential managers)
        const gitCredentials = await this.getGitCredentials(host);

        // Cache result (including undefined) to avoid repeated subprocess spawns
        this.cachedCredentials = {
            value: gitCredentials ?? undefined,
            expiresAt: Date.now() + CredentialProvider.CACHE_TTL_MS,
        };

        if (gitCredentials) {
            return gitCredentials;
        }

        // Priority 4: No credentials (public repository access only)
        return undefined;
    }

    /**
     * Converts credentials to an HTTP Authorization header string.
     * 
     * @param credentials - GitHub credentials
     * @returns Authorization header value or undefined
     * 
     * @example
     * ```typescript
     * const creds = { token: 'ghp_...token...' };
     * const header = provider.getAuthorizationHeader(creds);
     * // Returns: "Bearer ghp_...token..."
     * 
     * const basicCreds = { username: 'user', password: 'pass' };
     * const basicHeader = provider.getAuthorizationHeader(basicCreds);
     * // Returns: "Basic dXNlcjpwYXNz"
     * ```
     */
    getAuthorizationHeader(credentials: GitHubCredentials | undefined): string | undefined {
        if (!credentials) {
            return undefined;
        }

        // Bearer token authentication (preferred)
        if (credentials.token) {
            return `Bearer ${credentials.token}`;
        }

        // Basic authentication (fallback)
        if (credentials.username && credentials.password) {
            const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
            return `Basic ${encoded}`;
        }

        return undefined;
    }

    /**
     * Retrieves credentials from git credential helper.
     * 
     * Uses the git credential fill protocol to query the system's credential store.
     * This can read from:
     * - macOS Keychain
     * - Windows Credential Manager
     * - GitHub CLI (gh auth login)
     * - Git Credential Manager
     * - .netrc file
     * 
     * @param host - Git host (e.g., 'github.com')
     * @returns Credentials from git credential helper or undefined
     * @throws Error if git command fails or times out
     */
    private async getGitCredentials(host: string): Promise<GitHubCredentials | undefined> {
        const input = `protocol=https\nhost=${host}\n\n`;

        try {
            const { stdout } = await this.execGitCredentialFill(input);
            return this.parseGitCredentialOutput(stdout);
        } catch (error) {
            // Git not installed - this is OK, just means no credentials available
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }

            // Other errors (timeout, helper failure) - silently ignore
            // Git credential helpers may not be configured; this is expected
            return undefined;
        }
    }

    /**
     * Executes git credential fill command with timeout protection.
     * 
     * @param input - Git credential protocol input
     * @returns Command output
     * @throws Error if command fails or times out
     */
    private async execGitCredentialFill(input: string): Promise<{ stdout: string; stderr: string }> {
        // TypeScript types don't include 'input', but Node.js 18+ supports it
        const result = await execFileAsync('git', ['credential', 'fill'], {
            input,
            encoding: 'utf8',
            timeout: 5000, // 5 second timeout to prevent hanging
            env: {
                ...process.env,
                GIT_TERMINAL_PROMPT: '0', // Never prompt interactively
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Node.js supports input, but types are outdated
        } as any);
        
        return {
            stdout: String(result.stdout),
            stderr: String(result.stderr),
        };
    }

    /**
     * Parses git credential fill output into credentials.
     * 
     * Git credential protocol output format:
     * ```
     * username=user
     * password=token
     * ```
     * 
     * @param output - Raw git credential fill output
     * @returns Parsed credentials or undefined
     */
    private parseGitCredentialOutput(output: string): GitHubCredentials | undefined {
        const fields = Object.fromEntries(
            output.split('\n')
                .filter(line => line.includes('='))
                .map(line => {
                    const [key, ...valueParts] = line.split('=');
                    return [key, valueParts.join('=')] as [string, string];
                })
        );

        // Git credential helper returns username + password
        // For GitHub, the password is often a personal access token
        if (fields['username'] && fields['password']) {
            return {
                username: fields['username'],
                password: fields['password'],
            };
        }

        return undefined;
    }
}
