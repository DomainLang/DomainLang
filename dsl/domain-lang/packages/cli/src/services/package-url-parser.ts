/**
 * Package URL Parser
 * 
 * Pure parsing utilities for GitHub package URLs.
 * Extracts owner/repo from various URL formats with no network operations.
 * 
 * Supported formats:
 * - owner/repo@version (GitHub shorthand)
 * - owner/repo (GitHub shorthand, defaults to main)
 * - https://github.com/owner/repo@version
 * - https://gitlab.com/owner/repo@version
 * - https://bitbucket.org/owner/repo@version
 * 
 * This is a pure parsing module with no side effects or network calls.
 * Safe to use anywhere, including LSP contexts (though primarily for CLI).
 */

/**
 * Parsed package URL information.
 */
export interface PackageUrlInfo {
    /** Original import string */
    original: string;
    /** Detected platform (github, gitlab, bitbucket, generic) */
    platform: 'github' | 'gitlab' | 'bitbucket' | 'generic';
    /** Repository owner/organization */
    owner: string;
    /** Repository name */
    repo: string;
    /** Version/tag/branch/commit (defaults to 'main' if not specified) */
    ref: string;
    /** Full repository URL without version suffix */
    repoUrl: string;
}

/**
 * Parses package URLs into structured components.
 * 
 * This is a pure function with no side effects - only string parsing.
 */
export class PackageUrlParser {
    /**
     * Determines if an import string is a git repository import.
     */
    static isGitUrl(importStr: string): boolean {
        // GitHub shorthand: owner/repo or owner/repo@version
        if (/^[a-zA-Z0-9-]+\/[a-zA-Z0-9-_.]+(@[^/]+)?$/.test(importStr)) {
            return true;
        }

        // Full URLs
        return (
            importStr.startsWith('https://github.com/') ||
            importStr.startsWith('https://gitlab.com/') ||
            importStr.startsWith('https://bitbucket.org/') ||
            importStr.startsWith('https://git.') ||
            importStr.startsWith('git://')
        );
    }

    /**
     * Parses a package URL into structured components.
     * 
     * @param importStr - The import URL string
     * @returns Parsed package URL information
     * @throws Error if URL format is invalid
     * 
     * @example
     * ```typescript
     * const info = PackageUrlParser.parse('domainlang/core@v1.0.0');
     * // { owner: 'domainlang', repo: 'core', ref: 'v1.0.0', ... }
     * ```
     */
    static parse(importStr: string): PackageUrlInfo {
        // Handle GitHub shorthand (owner/repo or owner/repo@version)
        if (this.isGitHubShorthand(importStr)) {
            return this.parseGitHubShorthand(importStr);
        }

        // Handle full URLs
        if (importStr.startsWith('https://') || importStr.startsWith('git://')) {
            return this.parseFullUrl(importStr);
        }

        throw new Error(
            `Invalid package URL: '${importStr}'.\n` +
            `Hint: Use 'owner/repo' or 'owner/repo@version' format (e.g., 'domainlang/core@v1.0.0').`
        );
    }

    /**
     * Checks if string is GitHub shorthand format.
     */
    private static isGitHubShorthand(importStr: string): boolean {
        return /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-_.]+(@[^/]+)?$/.test(importStr);
    }

    /**
     * Parses GitHub shorthand (owner/repo or owner/repo@version).
     */
    private static parseGitHubShorthand(importStr: string): PackageUrlInfo {
        const match = importStr.match(/^([a-zA-Z0-9-]+)\/([a-zA-Z0-9-_.]+)(?:@([^/]+))?$/);
        if (!match) {
            throw new Error(
                `Invalid GitHub shorthand format: '${importStr}'.\n` +
                `Hint: Use 'owner/repo' or 'owner/repo@version' format.`
            );
        }

        const [, owner, repo, ref] = match;
        const resolvedRef = ref || 'main';

        return {
            original: importStr,
            platform: 'github',
            owner,
            repo,
            ref: resolvedRef,
            repoUrl: `https://github.com/${owner}/${repo}`,
        };
    }

    /**
     * Parses full git URLs (https://...).
     * 
     * Supported:
     * - https://github.com/owner/repo@version
     * - https://gitlab.com/owner/repo@version
     * - https://bitbucket.org/owner/repo@version
     * - https://git.example.com/owner/repo@version
     */
    private static parseFullUrl(importStr: string): PackageUrlInfo {
        // GitHub
        const ghMatch = importStr.match(
            /^https:\/\/github\.com\/([^/]+)\/([^/@]+)(?:@([^/]+))?$/
        );
        if (ghMatch) {
            const [, owner, repo, ref] = ghMatch;
            return {
                original: importStr,
                platform: 'github',
                owner,
                repo,
                ref: ref || 'main',
                repoUrl: `https://github.com/${owner}/${repo}`,
            };
        }

        // GitLab
        const glMatch = importStr.match(
            /^https:\/\/gitlab\.com\/([^/]+)\/([^/@]+)(?:@([^/]+))?$/
        );
        if (glMatch) {
            const [, owner, repo, ref] = glMatch;
            return {
                original: importStr,
                platform: 'gitlab',
                owner,
                repo,
                ref: ref || 'main',
                repoUrl: `https://gitlab.com/${owner}/${repo}`,
            };
        }

        // Bitbucket
        const bbMatch = importStr.match(
            /^https:\/\/bitbucket\.org\/([^/]+)\/([^/@]+)(?:@([^/]+))?$/
        );
        if (bbMatch) {
            const [, owner, repo, ref] = bbMatch;
            return {
                original: importStr,
                platform: 'bitbucket',
                owner,
                repo,
                ref: ref || 'main',
                repoUrl: `https://bitbucket.org/${owner}/${repo}`,
            };
        }

        // Generic git URL
        const genericMatch = importStr.match(
            /^(?:https|git):\/\/([^/]+)\/([^/]+)\/([^/@]+)(?:@([^/]+))?$/
        );
        if (genericMatch) {
            const [, host, owner, repo, ref] = genericMatch;
            return {
                original: importStr,
                platform: 'generic',
                owner,
                repo,
                ref: ref || 'main',
                repoUrl: `https://${host}/${owner}/${repo}`,
            };
        }

        throw new Error(
            `Unsupported git URL format: '${importStr}'.\n` +
            `Supported formats:\n` +
            `  • owner/repo (GitHub shorthand)\n` +
            `  • owner/repo@version\n` +
            `  • https://github.com/owner/repo\n` +
            `  • https://gitlab.com/owner/repo`
        );
    }

    /**
     * Extracts just the package key (owner/repo) from a URL.
     * 
     * @param importStr - The import URL string
     * @returns Package key in 'owner/repo' format
     * 
     * @example
     * ```typescript
     * PackageUrlParser.getPackageKey('domainlang/core@v1.0.0');
     * // Returns: 'domainlang/core'
     * ```
     */
    static getPackageKey(importStr: string): string {
        const info = this.parse(importStr);
        return `${info.owner}/${info.repo}`;
    }
}
