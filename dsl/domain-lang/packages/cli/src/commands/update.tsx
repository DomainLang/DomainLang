/**
 * Update command - updates branch dependencies to latest commit.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/update
 */
import type { CommandModule } from 'yargs';
import React, { useEffect } from 'react';
import { runCommand } from './command-runner.js';
import { Box, Text, useApp } from 'ink';
import { 
    Spinner, 
    StatusMessage, 
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
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { LockFile } from '@domainlang/language';

/**
 * Props for Update command component.
 */
export interface UpdateProps {
    /** Command context (needed for cwd) */
    context: CommandContext;
}

/**
 * Result of update operation.
 */
export interface UpdateResult {
    /** Number of packages updated */
    updated: number;
    /** Number of packages already up to date */
    upToDate: number;
    /** Update details */
    updates: Array<{
        pkg: string;
        beforeCommit: string;
        afterCommit: string;
        status: 'updated' | 'up-to-date';
    }>;
}

/**
 * Update branch dependencies to latest commits.
 */
async function updateBranchDependencies(workspaceRoot: string): Promise<UpdateResult> {
    const lockPath = path.join(workspaceRoot, 'model.lock');
    
    if (!existsSync(lockPath)) {
        throw new Error('No model.lock found. Run \'dlang install\' first.');
    }

    const lockContent = await fs.readFile(lockPath, 'utf-8');
    const lock: LockFile = JSON.parse(lockContent);

    if (!lock.dependencies || Object.keys(lock.dependencies).length === 0) {
        return { updated: 0, upToDate: 0, updates: [] };
    }

    // Only update branch dependencies
    // Create mutable copy of dependencies for updating
    const mutableDeps: Record<string, LockFile['dependencies'][string]> = { ...lock.dependencies };

    const branchDeps = Object.entries(lock.dependencies).filter(
        ([_, dep]) => dep.refType === 'branch'
    );

    if (branchDeps.length === 0) {
        throw new Error('No branch dependencies found to update.');
    }

    const credentialProvider = new CredentialProvider();
    const packageCache = new PackageCache(workspaceRoot);
    const downloader = new PackageDownloader(credentialProvider, packageCache);

    const updates: UpdateResult['updates'] = [];
    let updated = 0;
    let upToDate = 0;

    for (const [pkg, dep] of branchDeps) {
        const [owner, repo] = pkg.split('/');
        if (!owner || !repo) {
            continue;
        }

        const newCommit = await downloader.resolveRefToCommit(owner, repo, dep.ref);
        const status = newCommit === dep.commit ? 'up-to-date' : 'updated';
        
        updates.push({
            pkg,
            beforeCommit: dep.commit.substring(0, 7),
            afterCommit: newCommit.substring(0, 7),
            status,
        });

        if (status === 'updated') {
            const downloadResult = await downloader.download(owner, repo, dep.ref);
            mutableDeps[pkg] = {
                ref: dep.ref,
                refType: 'branch',
                resolved: downloadResult.resolved,
                commit: downloadResult.commitSha,
                integrity: downloadResult.integrity,
            };
            updated++;
        } else {
            upToDate++;
        }
    }

    const updatedLock: LockFile = { ...lock, dependencies: mutableDeps };
    await fs.writeFile(lockPath, JSON.stringify(updatedLock, null, 2), 'utf-8');

    return { updated, upToDate, updates };
}

/**
 * Update command component.
 * Rich mode only — json/quiet handled by runUpdate via runDirect.
 */
export const Update: React.FC<UpdateProps> = ({ context }) => {
    const { status, result, error, elapsed } = useCommand(
        () => updateBranchDependencies(context.cwd),
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
                <Banner bannerText="Update Branch Dependencies" />
                <Box marginTop={1}>
                    <Spinner label={`${EMOJI.search}Checking branch dependencies...`} />
                </Box>
            </Box>
        );
    }

    if (status === 'error') {
        return (
            <Box flexDirection="column">
                <Banner bannerText={`${EMOJI.error}Update failed`} variant="error" />
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
            <Banner bannerText="Update Branch Dependencies" />

            <Box marginTop={1}>
                <Divider />
            </Box>

            {result.updates.length > 0 && (
                <Box marginTop={1}>
                    <Table
                        headers={['Package', 'Before', 'After', 'Status']}
                        rows={result.updates.map(update => [
                            update.pkg,
                            update.beforeCommit,
                            update.afterCommit,
                            update.status === 'updated' 
                                ? `${EMOJI.success}updated` 
                                : 'up to date',
                        ])}
                    />
                </Box>
            )}

            <Box marginTop={1}>
                <StatusMessage 
                    type="success"
                    message={`${result.updated} package${result.updated === 1 ? '' : 's'} updated, ${result.upToDate} already up to date`}
                />
            </Box>

            <Box marginTop={1}>
                <Text color={theme.text.secondary}>
                    {EMOJI.loading}Completed in {elapsed.toFixed(2)}s
                </Text>
            </Box>
        </Box>
    );
};

/**
 * Run update without Ink (for --json and --quiet modes).
 */
export async function runUpdate(context: CommandContext): Promise<void> {
    await runDirect(
        () => updateBranchDependencies(context.cwd),
        context,
        {
            json: r => ({ success: true, ...r }),
            quiet: r => `${r.updated} updated, ${r.upToDate} up to date`,
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/** Update command module for yargs */
export const updateCommand: CommandModule = {
    command: 'update',
    describe: 'Update branch dependencies to latest commit',
    handler: async (argv) => {
        await runCommand(argv, {
            ink: (_args, ctx) => <Update context={ctx} />,
            direct: (_args, ctx) => runUpdate(ctx),
        });
    },
};
