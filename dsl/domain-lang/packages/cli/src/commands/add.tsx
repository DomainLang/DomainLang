/**
 * Add command - adds a dependency to model.yaml.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/add
 */
import type { CommandModule, Argv } from 'yargs';
import React, { useEffect, useState } from 'react';
import { runCommand } from './command-runner.js';
import { Box, Text, useApp } from 'ink';
import { 
    Spinner, 
    StatusMessage, 
    Banner, 
    KeyValue,
    Divider,
    MultiProgressBar,
    type PackageProgress,
} from '../ui/components/index.js';
import { theme } from '../ui/themes/colors.js';
import { EMOJI } from '../ui/themes/emoji.js';
import { useElapsedTime } from '../ui/hooks/index.js';
import { runDirect } from '../utils/run-direct.js';
import type { CommandContext } from './types.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import YAML from 'yaml';
import { PackageUrlParser } from '../services/package-url-parser.js';
import { InstallService, type InstallProgressEvent } from '../services/install-service.js';
import type { ModelManifest } from '@domainlang/language';

/**
 * Props for Add command component.
 */
export interface AddProps {
    /** Package specifier (owner/repo@version) */
    specifier: string;
    /** Command context */
    context: CommandContext;
}

/**
 * Result of add operation.
 */
interface AddResult {
    /** Package owner/repo */
    package: string;
    /** Version/ref added */
    ref: string;
    /** Ref type (tag, branch, commit) */
    refType: 'tag' | 'branch' | 'commit';
    /** Commit SHA */
    commit: string;
    /** Integrity hash */
    integrity: string;
}

/**
 * Add a dependency to model.yaml and run install.
 */
async function addDependency(
    specifier: string, 
    workspaceRoot: string,
    onProgress?: (event: InstallProgressEvent) => void
): Promise<AddResult> {
    // Parse specifier
    const parsed = PackageUrlParser.parse(specifier);
    const packageName = `${parsed.owner}/${parsed.repo}`;

    // Check if model.yaml exists
    const manifestPath = resolve(workspaceRoot, 'model.yaml');
    if (!existsSync(manifestPath)) {
        throw new Error('No model.yaml found in current directory. Run "dlang init" first.');
    }

    // Load existing manifest
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const parsedManifest = YAML.parse(manifestContent) as ModelManifest;
    
    // Create mutable copy to allow modifications
    const manifest = {
        ...parsedManifest,
        dependencies: parsedManifest.dependencies ? { ...parsedManifest.dependencies } : {},
    };

    // Check if dependency already exists
    if (manifest.dependencies[packageName]) {
        throw new Error(`Package '${packageName}' already exists. Use 'dlang update' to change version.`);
    }

    // Add dependency to manifest (short form: "owner/repo": "ref")
    manifest.dependencies[packageName] = parsed.ref;

    // Write updated manifest
    await fs.writeFile(manifestPath, YAML.stringify(manifest), 'utf-8');

    // Run install to resolve and lock (pass pre-parsed manifest to avoid re-reading)
    const installService = new InstallService(workspaceRoot);
    const installResult = await installService.install({ workspaceRoot, manifest, onProgress });

    // Use lock data returned by install (no extra file read)
    const locked = installResult.lockData?.[packageName];
    if (!locked) {
        throw new Error(`Failed to lock ${packageName}. Check install output for details.`);
    }

    // Detect ref type
    const refType = detectRefType(parsed.ref);

    return {
        package: packageName,
        ref: parsed.ref,
        refType,
        commit: locked.commit,
        integrity: locked.integrity ?? '',
    };
}

/**
 * Detect ref type from ref string.
 */
function detectRefType(ref: string): 'tag' | 'branch' | 'commit' {
    if (/^[0-9a-f]{40}$/i.test(ref)) {
        return 'commit';
    }
    if (/^v?\d+\.\d+\.\d+/.test(ref)) {
        return 'tag';
    }
    return 'branch';
}

/**
 * State for add process.
 */
type AddState = 
    | { status: 'loading' }
    | { status: 'downloading'; packages: PackageProgress[] }
    | { status: 'success'; result: AddResult }
    | { status: 'error'; error: string };

/**
 * Helper to update a single package's progress state.
 */
function updatePackage(
    prev: AddState,
    pkgName: string,
    updates: Partial<PackageProgress>
): AddState {
    if (prev.status !== 'downloading') return prev;
    const packages = prev.packages.map(p =>
        p.name === pkgName ? { ...p, ...updates } as PackageProgress : p
    );
    return { status: 'downloading', packages };
}

/**
 * Add command component.
 * Only renders in rich (Ink) mode.
 */
export const Add: React.FC<AddProps> = ({ specifier, context: _context }) => {
    const workspaceRoot = process.cwd();
    const [state, setState] = useState<AddState>({ status: 'loading' });
    const elapsed = useElapsedTime(100, state.status === 'loading' || state.status === 'downloading');
    const { exit } = useApp();

    // Exit when command completes (success or error)
    useEffect(() => {
        if (state.status === 'success' || state.status === 'error') {
            setTimeout(() => exit(), 100);
        }
    }, [state.status, exit]);

    useEffect(() => {
        const handleProgress = (event: InstallProgressEvent): void => {
            if (event.type === 'start') {
                const pkgs: PackageProgress[] = event.packages.map(name => ({ 
                    name, 
                    status: 'pending' as const 
                }));
                setState({ status: 'downloading', packages: pkgs });
                return;
            }
            
            if (event.type === 'package-start') {
                const newStatus = event.status as PackageProgress['status'];
                setState(prev => updatePackage(prev, event.pkg, { status: newStatus }));
                return;
            }
            
            if (event.type === 'package-progress') {
                const progress = event.totalBytes ? event.bytesReceived / event.totalBytes : undefined;
                setState(prev => updatePackage(prev, event.pkg, { progress }));
                return;
            }
            
            if (event.type === 'package-complete') {
                const completeStatus: PackageProgress['status'] = event.cached ? 'cached' : 'complete';
                setState(prev => updatePackage(prev, event.pkg, { status: completeStatus, progress: 1 }));
                return;
            }
            
            if (event.type === 'package-error') {
                const errorStatus: PackageProgress['status'] = 'error';
                setState(prev => updatePackage(prev, event.pkg, { status: errorStatus, error: event.error }));
            }
        };

        addDependency(specifier, workspaceRoot, handleProgress)
            .then(result => setState({ status: 'success', result }))
            .catch((err: unknown) => {
                setState({ 
                    status: 'error', 
                    error: err instanceof Error ? err.message : String(err),
                });
            });
    }, [specifier, workspaceRoot]);

    if (state.status === 'loading') {
        return <Spinner label={`Adding ${specifier}`} emoji="search" />;
    }

    if (state.status === 'downloading') {
        return <MultiProgressBar packages={state.packages} />;
    }

    if (state.status === 'error') {
        return (
            <Box flexDirection="column">
                <StatusMessage type="error" message={state.error} />
            </Box>
        );
    }

    const r = state.result;

    return (
        <Box flexDirection="column">
            {/* Success banner */}
            <Banner 
                bannerText={`${EMOJI.success}Added ${r.package}@${r.ref}`}
                variant="success"
            />

            {/* Details */}
            <Box marginTop={1}>
                <Divider title="Details" />
            </Box>
            <Box marginTop={1} marginLeft={1}>
                <KeyValue data={{
                    'Package': r.package,
                    'Ref': `${r.ref} (${r.refType})`,
                    'Commit': r.commit.substring(0, 12),
                    'Integrity': `${r.integrity.substring(0, 20)}...`,
                    'Added to': 'model.yaml, model.lock',
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
 * Run add without Ink (for --json and --quiet modes).
 */
export async function runAdd(specifier: string, context: CommandContext): Promise<void> {
    const workspaceRoot = process.cwd();
    await runDirect(
        () => addDependency(specifier, workspaceRoot),
        context,
        {
            json: r => ({ success: true, ...r }),
            quiet: r => `Added ${r.package}@${r.ref}`,
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/** Command arguments */
export interface AddArgs {
    specifier: string;
}

/** Add command module for yargs */
export const addCommand: CommandModule<object, AddArgs> = {
    command: 'add <specifier>',
    describe: 'Add a dependency to model.yaml',
    builder: (yargs: Argv) =>
        yargs.positional('specifier', {
            describe: 'Package specifier (owner/repo@version)',
            type: 'string',
            demandOption: true,
        }) as Argv<AddArgs>,
    handler: async (argv) => {
        await runCommand(argv, {
            ink: (args, ctx) => <Add specifier={args.specifier} context={ctx} />,
            direct: (args, ctx) => runAdd(args.specifier, ctx),
        });
    },
};
