/**
 * Outdated command - shows available updates for all dependencies.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/outdated
 */
import type { CommandModule } from 'yargs';
import React, { useEffect } from 'react';
import { runCommand } from './command-runner.js';
import { Box, Text, useApp } from 'ink';
import { 
    Spinner, 
    Banner, 
    Table,
    Divider,
} from '../ui/components/index.js';
import { theme } from '../ui/themes/colors.js';
import { EMOJI } from '../ui/themes/emoji.js';
import { useCommand } from '../ui/hooks/useCommand.js';
import { runDirect } from '../utils/run-direct.js';
import type { CommandContext } from './types.js';
import { PackageDownloader } from '../services/package-downloader.js';
import { PackageCache } from '../services/package-cache.js';
import { CredentialProvider } from '../services/credential-provider.js';
import { fetchTags, findLatestVersion } from '../services/github-tags.js';
import { compareVersions } from '../services/semver.js';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { LockFile } from '@domainlang/language';

/**
 * Props for Outdated command component.
 */
export interface OutdatedProps {
    /** Command context (needed for cwd) */
    context: CommandContext;
}

/**
 * Outdated dependency information.
 */
export interface OutdatedDependency {
    pkg: string;
    current: string;
    latest: string | null;
    type: 'tag' | 'branch' | 'commit';
    status: string;
}

/**
 * Result of outdated check.
 */
export interface OutdatedResult {
    /** All dependencies with status */
    dependencies: OutdatedDependency[];
    /** Summary counts */
    summary: {
        upgradesAvailable: number;
        branchesBehind: number;
        pinnedCommits: number;
        upToDate: number;
    };
}

/**
 * Classify a tag dependency and return an OutdatedDependency entry.
 */
async function classifyTagDep(
    pkg: string,
    dep: { ref: string },
    owner: string,
    repo: string,
    credentialProvider: CredentialProvider,
): Promise<{ entry: OutdatedDependency; category: 'upgrade' | 'upToDate' }> {
    const tags = await fetchTags(owner, repo, credentialProvider);
    const latest = findLatestVersion(tags);

    if (!latest) {
        return {
            entry: { pkg, current: dep.ref, latest: null, type: 'tag', status: 'no versions found' },
            category: 'upToDate',
        };
    }

    const comparison = compareVersions(latest, dep.ref);
    if (comparison <= 0) {
        return {
            entry: { pkg, current: dep.ref, latest: dep.ref, type: 'tag', status: 'up to date' },
            category: 'upToDate',
        };
    }

    const currentParts = dep.ref.replace(/^v/, '').split('.');
    const latestParts = latest.replace(/^v/, '').split('.');
    let upgradeType = 'patch';
    if (latestParts[0] !== currentParts[0]) upgradeType = 'major';
    else if (latestParts[1] !== currentParts[1]) upgradeType = 'minor';

    return {
        entry: { pkg, current: dep.ref, latest, type: 'tag', status: `${upgradeType} update` },
        category: 'upgrade',
    };
}

/**
 * Classify a branch dependency by comparing commit SHAs.
 */
async function classifyBranchDep(
    pkg: string,
    dep: { ref: string; commit: string },
    owner: string,
    repo: string,
    downloader: PackageDownloader,
): Promise<{ entry: OutdatedDependency; category: 'behind' | 'upToDate' }> {
    const currentCommit = await downloader.resolveRefToCommit(owner, repo, dep.ref);
    const behind = currentCommit !== dep.commit;

    return {
        entry: {
            pkg,
            current: dep.ref,
            latest: dep.ref,
            type: 'branch',
            status: behind
                ? `${currentCommit.substring(0, 7)} (behind)`
                : `${dep.commit.substring(0, 7)} (up to date)`,
        },
        category: behind ? 'behind' : 'upToDate',
    };
}

/**
 * Classify a single dependency and return its status.
 */
async function classifyDependency(
    pkg: string,
    dep: LockFile['dependencies'][string],
    owner: string,
    repo: string,
    credentialProvider: CredentialProvider,
    downloader: PackageDownloader,
): Promise<{ entry: OutdatedDependency; category: 'upgrade' | 'behind' | 'pinned' | 'upToDate' }> {
    if (dep.refType === 'tag') {
        return classifyTagDep(pkg, dep, owner, repo, credentialProvider);
    }
    if (dep.refType === 'branch') {
        return classifyBranchDep(pkg, dep, owner, repo, downloader);
    }
    return {
        entry: { pkg, current: dep.commit.substring(0, 7), latest: null, type: 'commit', status: 'pinned' },
        category: 'pinned',
    };
}

/**
 * Check all dependencies for updates.
 */
async function checkOutdatedDependencies(workspaceRoot: string): Promise<OutdatedResult> {
    const lockPath = path.join(workspaceRoot, 'model.lock');
    
    if (!existsSync(lockPath)) {
        throw new Error('No model.lock found. Run \'dlang install\' first.');
    }

    const lockContent = await fs.readFile(lockPath, 'utf-8');
    const lock: LockFile = JSON.parse(lockContent);

    if (!lock.dependencies || Object.keys(lock.dependencies).length === 0) {
        return {
            dependencies: [],
            summary: { upgradesAvailable: 0, branchesBehind: 0, pinnedCommits: 0, upToDate: 0 },
        };
    }

    const credentialProvider = new CredentialProvider();
    const packageCache = new PackageCache(workspaceRoot);
    const downloader = new PackageDownloader(credentialProvider, packageCache);

    const dependencies: OutdatedDependency[] = [];
    const counts = { upgradesAvailable: 0, branchesBehind: 0, pinnedCommits: 0, upToDate: 0 };

    for (const [pkg, dep] of Object.entries(lock.dependencies)) {
        const [owner, repo] = pkg.split('/');
        if (!owner || !repo) continue;

        try {
            const { entry, category } = await classifyDependency(pkg, dep, owner, repo, credentialProvider, downloader);
            dependencies.push(entry);
            if (category === 'upgrade') counts.upgradesAvailable++;
            else if (category === 'behind') counts.branchesBehind++;
            else if (category === 'pinned') counts.pinnedCommits++;
            else counts.upToDate++;
        } catch {
            dependencies.push({
                pkg, current: dep.ref, latest: null, type: dep.refType, status: 'error checking',
            });
        }
    }

    return {
        dependencies,
        summary: counts,
    };
}

/**
 * Outdated command component.
 * Rich mode only — json/quiet handled by runOutdated via runDirect.
 */
export const Outdated: React.FC<OutdatedProps> = ({ context }) => {
    const { status, result, error, elapsed } = useCommand(
        () => checkOutdatedDependencies(context.cwd),
        [context.cwd],
    );
    const { exit } = useApp();

    // Exit when command completes (success or error)
    useEffect(() => {
        if (status === 'success' || status === 'error') {
            setTimeout(() => exit(), 100);
        }
    }, [status, exit]);

    if (status === 'loading') {
        return (
            <Box flexDirection="column">
                <Banner bannerText="Check Outdated Dependencies" />
                <Box marginTop={1}>
                    <Spinner label={`${EMOJI.search}Checking all dependencies...`} />
                </Box>
            </Box>
        );
    }

    if (status === 'error') {
        return (
            <Box flexDirection="column">
                <Banner bannerText={`${EMOJI.error}Check failed`} variant="error" />
                <Box marginTop={1}>
                    <Text color={theme.status.error}>{error}</Text>
                </Box>
                <Box marginTop={1}>
                    <Text color={theme.text.secondary}>
                        {EMOJI.tip}Run 'dlang install' to create a lock file
                    </Text>
                </Box>
            </Box>
        );
    }

    if (!result) return null;

    return (
        <Box flexDirection="column">
            <Banner bannerText="Outdated Dependencies" />

            <Box marginTop={1}>
                <Divider />
            </Box>

            {result.dependencies.length > 0 ? (
                <Box marginTop={1}>
                    <Table
                        headers={['Package', 'Current', 'Latest', 'Type']}
                        rows={result.dependencies.map(dep => [
                            dep.pkg,
                            dep.current,
                            dep.latest ?? '—',
                            dep.status,
                        ])}
                    />
                </Box>
            ) : (
                <Box marginTop={1}>
                    <Text color={theme.text.secondary}>No dependencies found</Text>
                </Box>
            )}

            <Box marginTop={1}>
                <Divider />
            </Box>

            <Box marginTop={1} marginLeft={1}>
                <Text color={theme.text.secondary}>
                    {result.summary.upgradesAvailable} upgrade{result.summary.upgradesAvailable === 1 ? '' : 's'} available, {' '}
                    {result.summary.branchesBehind} branch{result.summary.branchesBehind === 1 ? '' : 'es'} behind, {' '}
                    {result.summary.pinnedCommits} pinned
                </Text>
            </Box>

            {result.summary.upgradesAvailable > 0 && (
                <Box marginTop={1} marginLeft={1}>
                    <Text color={theme.text.secondary}>
                        {EMOJI.tip}Run 'dlang upgrade' to see available upgrades
                    </Text>
                </Box>
            )}

            {result.summary.branchesBehind > 0 && (
                <Box marginTop={1} marginLeft={1}>
                    <Text color={theme.text.secondary}>
                        {EMOJI.tip}Run 'dlang update' to update branch dependencies
                    </Text>
                </Box>
            )}

            <Box marginTop={1}>
                <Text color={theme.text.secondary}>
                    {EMOJI.loading}Completed in {elapsed.toFixed(2)}s
                </Text>
            </Box>
        </Box>
    );
};

/**
 * Run outdated check without Ink (for --json and --quiet modes).
 */
export async function runOutdated(context: CommandContext): Promise<void> {
    await runDirect(
        () => checkOutdatedDependencies(context.cwd),
        context,
        {
            json: r => ({ success: true, ...r }),
            quiet: r => {
                const { summary } = r;
                return `${summary.upgradesAvailable} upgrades, ${summary.branchesBehind} branches behind, ${summary.pinnedCommits} pinned`;
            },
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/** Outdated command module for yargs */
export const outdatedCommand: CommandModule = {
    command: 'outdated',
    describe: 'Show available updates for all dependencies',
    handler: async (argv) => {
        await runCommand(argv, {
            ink: (_args, ctx) => <Outdated context={ctx} />,
            direct: (_args, ctx) => runOutdated(ctx),
        });
    },
};
