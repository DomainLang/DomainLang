/**
 * Cache clear command - clears the package cache.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/cache-clear
 */
import type { CommandModule } from 'yargs';
import React, { useEffect } from 'react';
import { runCommand } from './command-runner.js';
import { Box, useApp } from 'ink';
import { 
    Spinner, 
    StatusMessage, 
    Banner, 
    KeyValue,
} from '../ui/components/index.js';
import { EMOJI } from '../ui/themes/emoji.js';
import { useCommand } from '../ui/hooks/useCommand.js';
import { runDirect } from '../utils/run-direct.js';
import type { CommandContext } from './types.js';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { PackageCache } from '../services/package-cache.js';

/**
 * Props for CacheClear command component.
 */
export interface CacheClearProps {
    /** Command context */
    context: CommandContext;
}

/**
 * Result of cache clear operation.
 */
export interface CacheClearResult {
    /** Number of packages removed */
    packagesRemoved: number;
    /** Total bytes freed */
    bytesFreed: number;
}

/**
 * Calculate the total size of a directory recursively.
 * 
 * @param dirPath - Absolute path to the directory
 * @returns Total size in bytes
 */
async function calculateDirectorySize(dirPath: string): Promise<number> {
    if (!existsSync(dirPath)) {
        return 0;
    }

    let totalSize = 0;
    
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                totalSize += await calculateDirectorySize(fullPath);
            } else if (entry.isFile()) {
                const stats = await fs.stat(fullPath);
                totalSize += stats.size;
            }
        }
    } catch {
        // Ignore errors for individual files/dirs
    }
    
    return totalSize;
}

/**
 * Count packages in cache directory.
 * Packages are stored at `.dlang/packages/{owner}/{repo}/{commit}/`
 * 
 * @param packagesDir - Absolute path to the packages directory
 * @returns Number of packages (commit-level directories)
 */
async function countPackages(packagesDir: string): Promise<number> {
    if (!existsSync(packagesDir)) {
        return 0;
    }

    let count = 0;
    
    try {
        const owners = await fs.readdir(packagesDir, { withFileTypes: true });
        
        for (const owner of owners) {
            if (!isValidDirectory(owner)) {
                continue;
            }
            
            count += await countReposForOwner(packagesDir, owner.name);
        }
    } catch {
        // Ignore errors
    }
    
    return count;
}

/**
 * Helper: Check if entry is valid directory (not hidden, not a file).
 */
function isValidDirectory(entry: { name: string; isDirectory: () => boolean }): boolean {
    return entry.isDirectory() && !entry.name.startsWith('.');
}

/**
 * Helper: Count repos for a given owner.
 */
async function countReposForOwner(packagesDir: string, ownerName: string): Promise<number> {
    let count = 0;
    const ownerPath = join(packagesDir, ownerName);
    const repos = await fs.readdir(ownerPath, { withFileTypes: true });
    
    for (const repo of repos) {
        if (!repo.isDirectory()) {
            continue;
        }
        
        count += await countCommitsForRepo(ownerPath, repo.name);
    }
    
    return count;
}

/**
 * Helper: Count commits for a given repo.
 */
async function countCommitsForRepo(ownerPath: string, repoName: string): Promise<number> {
    const repoPath = join(ownerPath, repoName);
    const commits = await fs.readdir(repoPath, { withFileTypes: true });
    
    return commits.filter(commit => commit.isDirectory()).length;
}

/**
 * Format bytes as human-readable string.
 * 
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "14.2 KB", "3.4 MB")
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    
    const decimals = value >= 10 ? 1 : 2;
    
    return `${value.toFixed(decimals)} ${units[i]}`;
}

/**
 * Clear the package cache.
 * 
 * @param workspaceRoot - Workspace root directory
 * @returns Cache clear result
 */
async function clearCache(workspaceRoot: string): Promise<CacheClearResult> {
    const packagesDir = resolve(workspaceRoot, '.dlang', 'packages');
    
    // Calculate size and count before clearing
    const bytesFreed = await calculateDirectorySize(packagesDir);
    const packagesRemoved = await countPackages(packagesDir);
    
    // Use PackageCache.clear() to remove the directory
    const cache = new PackageCache(workspaceRoot);
    await cache.clear();
    
    return {
        packagesRemoved,
        bytesFreed,
    };
}

/**
 * Cache clear command component.
 * Only renders in rich (Ink) mode.
 */
export const CacheClear: React.FC<CacheClearProps> = ({ context: _context }) => {
    const workspaceRoot = process.cwd();
    const { status, result, error } = useCommand(
        () => clearCache(workspaceRoot),
        [],
    );
    const { exit } = useApp();

    // Exit when command completes (success or error)
    useEffect(() => {
        if (status === 'success' || status === 'error') {
            setTimeout(() => exit(), 100);
        }
    }, [status, exit]);

    if (status === 'loading') {
        return <Spinner label="Clearing cache" emoji="package" />;
    }

    if (status === 'error') {
        return (
            <Box flexDirection="column">
                <StatusMessage type="error" message={error ?? 'Unknown error'} />
            </Box>
        );
    }

    if (!result) return null;
    const r = result;
    const formattedSize = formatBytes(r.bytesFreed);

    return (
        <Box flexDirection="column">
            {/* Success banner */}
            <Banner 
                bannerText={`${EMOJI.success} Cache cleared`}
                variant="success"
            />

            {/* Details */}
            <Box marginTop={1}>
                <KeyValue 
                    data={{
                        'Removed': `.dlang/packages/ (${r.packagesRemoved} ${r.packagesRemoved === 1 ? 'package' : 'packages'}, ${formattedSize})`,
                    }}
                />
            </Box>

            {/* Hint */}
            <Box marginTop={1}>
                <StatusMessage 
                    type="info" 
                    message="Run 'dlang install' to re-download packages." 
                />
            </Box>
        </Box>
    );
};

/**
 * Run cache clear command programmatically (for non-Ink modes).
 */
export async function runCacheClear(context: CommandContext): Promise<void> {
    const workspaceRoot = process.cwd();
    await runDirect(
        () => clearCache(workspaceRoot),
        context,
        {
            json: r => ({ success: true, ...r }),
            quiet: () => '',
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/** Cache clear command module for yargs */
export const cacheClearCommand: CommandModule = {
    command: 'cache-clear',
    describe: 'Clear the package cache',
    handler: async (argv) => {
        await runCommand(argv, {
            ink: (_args, ctx) => <CacheClear context={ctx} />,
            direct: (_args, ctx) => runCacheClear(ctx),
        });
    },
};
