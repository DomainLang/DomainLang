/**
 * Remove command - removes a dependency from model.yaml.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/remove
 */
import type { CommandModule, Argv } from 'yargs';
import React, { useEffect } from 'react';
import { runCommand } from './command-runner.js';
import { Box, Text, useApp } from 'ink';
import { 
    Spinner, 
    StatusMessage, 
    Banner, 
    KeyValue,
    Divider,
} from '../ui/components/index.js';
import { theme } from '../ui/themes/colors.js';
import { EMOJI } from '../ui/themes/emoji.js';
import { useCommand } from '../ui/hooks/useCommand.js';
import { runDirect } from '../utils/run-direct.js';
import type { CommandContext } from './types.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import YAML from 'yaml';
import type { ModelManifest, LockFile } from '@domainlang/language';

/**
 * Props for Remove command component.
 */
export interface RemoveProps {
    /** Package name (owner/repo) */
    packageName: string;
    /** Command context */
    context: CommandContext;
}

/**
 * Result of remove operation.
 */
interface RemoveResult {
    /** Package owner/repo */
    package: string;
    /** Whether cache was cleaned */
    cacheCleared: boolean;
}

/**
 * Remove a dependency from model.yaml and model.lock.
 */
async function removeDependency(packageName: string, workspaceRoot: string): Promise<RemoveResult> {
    // Normalize package name (strip @ if present)
    const normalizedName = packageName.includes('@') ? packageName.split('@')[0] : packageName;

    // Check if model.yaml exists
    const manifestPath = resolve(workspaceRoot, 'model.yaml');
    if (!existsSync(manifestPath)) {
        throw new Error('No model.yaml found in current directory.');
    }

    // Load existing manifest
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const parsedManifest = YAML.parse(manifestContent) as ModelManifest;
    
    // Create mutable copy to allow modifications
    const manifest = {
        ...parsedManifest,
        dependencies: parsedManifest.dependencies ? { ...parsedManifest.dependencies } : undefined,
    };

    // Check if dependency exists
    if (!manifest.dependencies?.[normalizedName]) {
        throw new Error(`Package '${normalizedName}' not found in model.yaml dependencies.`);
    }

    // Remove from manifest
    delete manifest.dependencies[normalizedName];

    // Keep dependencies key but set to null when empty (renders as "dependencies:" in YAML)
    if (!manifest.dependencies || Object.keys(manifest.dependencies).length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- null signals empty YAML key with nullStr option
        manifest.dependencies = null as any;
    }

    // Write updated manifest with proper YAML formatting
    const yamlOutput = YAML.stringify(manifest, {
        indent: 2,
        lineWidth: 0,
        nullStr: '', // Render null as empty string (dependencies: instead of dependencies: null)
    });
    await fs.writeFile(manifestPath, yamlOutput, 'utf-8');

    // Update lock file
    const lockPath = resolve(workspaceRoot, 'model.lock');
    let cacheCleared = false;

    if (existsSync(lockPath)) {
        const lockContent = await fs.readFile(lockPath, 'utf-8');
        const lock = JSON.parse(lockContent) as LockFile;

        if (lock.dependencies?.[normalizedName]) {
            // Create mutable copy
            const updatedLockDeps = { ...lock.dependencies };
            delete updatedLockDeps[normalizedName];
            const updatedLock: LockFile = {
                ...lock,
                dependencies: updatedLockDeps,
            };
            await fs.writeFile(lockPath, JSON.stringify(updatedLock, null, 2), 'utf-8');
        }
    }

    // Clean cache directory for this package
    const cachePath = resolve(workspaceRoot, '.dlang', 'packages', normalizedName);
    if (existsSync(cachePath)) {
        await fs.rm(cachePath, { recursive: true, force: true });
        cacheCleared = true;
    }

    // Clean up empty parent directories (.dlang/packages/{owner}, .dlang/packages, .dlang)
    const dlangDir = resolve(workspaceRoot, '.dlang');
    const packagesDir = resolve(dlangDir, 'packages');
    for (const dir of [resolve(packagesDir, normalizedName.split('/')[0]), packagesDir, dlangDir]) {
        try {
            const entries = await fs.readdir(dir);
            if (entries.length === 0) {
                await fs.rmdir(dir);
            }
        } catch {
            // Directory doesn't exist or can't be read — skip
        }
    }

    return {
        package: normalizedName,
        cacheCleared,
    };
}

/**
 * Remove command component.
 * Only renders in rich (Ink) mode.
 */
export const Remove: React.FC<RemoveProps> = ({ packageName, context: _context }) => {
    const workspaceRoot = process.cwd();
    const { status, result, error, elapsed } = useCommand(
        () => removeDependency(packageName, workspaceRoot),
        [packageName],
    );
    const { exit } = useApp();

    // Exit when command completes (success or error)
    useEffect(() => {
        if (status === 'success' || status === 'error') {
            setTimeout(() => exit(), 100);
        }
    }, [status, exit]);

    if (status === 'loading') {
        return <Spinner label={`Removing ${packageName}`} emoji="search" />;
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

    return (
        <Box flexDirection="column">
            {/* Success banner */}
            <Banner 
                bannerText={`${EMOJI.success}Removed ${r.package}`}
                variant="success"
            />

            {/* Details */}
            <Box marginTop={1}>
                <Divider title="Details" />
            </Box>
            <Box marginTop={1} marginLeft={1}>
                <KeyValue data={{
                    'Removed from': 'model.yaml, model.lock',
                    'Cache': r.cacheCleared ? '.dlang/packages/ cleaned' : 'no cache to clean',
                }} />
            </Box>

            {/* Timing */}
            <Box marginTop={1}>
                <Text color={theme.text.secondary}>
                    {EMOJI.loading}Completed in {elapsed.toFixed(2)}s
                </Text>
            </Box>
        </Box>
    );
};

/**
 * Run remove without Ink (for --json and --quiet modes).
 */
export async function runRemove(packageName: string, context: CommandContext): Promise<void> {
    const workspaceRoot = process.cwd();
    await runDirect(
        () => removeDependency(packageName, workspaceRoot),
        context,
        {
            json: r => ({ success: true, ...r }),
            quiet: r => `Removed ${r.package}`,
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/** Command arguments */
export interface RemoveArgs {
    name: string;
}

/** Remove command module for yargs */
export const removeCommand: CommandModule<object, RemoveArgs> = {
    command: 'remove <name>',
    describe: 'Remove a dependency from model.yaml',
    builder: (yargs: Argv) =>
        yargs.positional('name', {
            describe: 'Package name (owner/repo)',
            type: 'string',
            demandOption: true,
        }) as Argv<RemoveArgs>,
    handler: async (argv) => {
        await runCommand(argv, {
            ink: (args, ctx) => <Remove packageName={args.name} context={ctx} />,
            direct: (args, ctx) => runRemove(args.name, ctx),
        });
    },
};
