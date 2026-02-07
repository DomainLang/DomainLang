/**
 * Shared GitHub tag utilities.
 *
 * Provides `fetchTags` and `findLatestVersion` — previously duplicated
 * in both `outdated.tsx` and `upgrade.tsx`.
 *
 * @module services/github-tags
 */
import { CredentialProvider } from './credential-provider.js';
import { fetchWithRetry } from './fetch-utils.js';
import { compareVersions } from './semver.js';

/**
 * GitHub API tag response shape (subset).
 */
interface GitHubTag {
    name: string;
    commit: {
        sha: string;
        url: string;
    };
}

/**
 * Fetch the tag names for a GitHub repository.
 *
 * @param owner - Repository owner
 * @param repo  - Repository name
 * @param credentialProvider - Provider for GitHub credentials
 * @returns Ordered list of tag name strings
 */
export async function fetchTags(
    owner: string,
    repo: string,
    credentialProvider: CredentialProvider,
): Promise<string[]> {
    const credentials = await credentialProvider.getGitHubCredentials('github.com');
    const authHeader = credentialProvider.getAuthorizationHeader(credentials);

    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };

    if (authHeader) {
        headers['Authorization'] = authHeader;
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`;
    const response = await fetchWithRetry(url, { headers });

    if (!response.ok) {
        throw new Error(
            `Failed to fetch tags for ${owner}/${repo}: HTTP ${response.status}`,
        );
    }

    const tags = (await response.json()) as GitHubTag[];
    return tags.map(tag => tag.name);
}

/**
 * Find the highest semantic-version tag from a list of tag names.
 *
 * Only tags matching `v?major.minor.patch` are considered.
 *
 * @param tags - Tag name strings (e.g. `['v1.0.0', 'v1.1.0', 'latest']`)
 * @returns The highest semver tag, or `null` if none match.
 */
export function findLatestVersion(tags: string[]): string | null {
    const versionTags = tags.filter(tag => /^v?\d+\.\d+\.\d+/.test(tag));

    if (versionTags.length === 0) {
        return null;
    }

    // Descending sort
    const sorted = [...versionTags].sort((tagA, tagB) => compareVersions(tagB, tagA));
    return sorted[0];
}

/**
 * Classify the kind of semver upgrade between two version strings.
 *
 * @param current - Current version tag (e.g. `v1.0.0`)
 * @param latest  - Latest version tag (e.g. `v1.2.0`)
 * @returns `'major'`, `'minor'`, or `'patch'`
 */
export function classifyUpgrade(
    current: string,
    latest: string,
): 'major' | 'minor' | 'patch' {
    const cur = current.replace(/^v/, '').split('.');
    const lat = latest.replace(/^v/, '').split('.');

    if (lat[0] !== cur[0]) return 'major';
    if (lat[1] !== cur[1]) return 'minor';
    return 'patch';
}
