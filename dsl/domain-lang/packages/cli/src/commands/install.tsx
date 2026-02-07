/**
 * Install command - installs dependencies from model.yaml.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/install
 */
import type { CommandModule, Argv } from 'yargs';
import React, { useState, useEffect } from 'react';
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
import { InstallService, type InstallResult, type InstallProgressEvent, FrozenMismatchError, IntegrityError } from '../services/install-service.js';

/**
 * Props for Install command component.
 */
export interface InstallProps {
    /** Installation options */
    options: {
        /** Frozen mode: fail if lock file doesn't match manifest */
        frozen?: boolean;
        /** Force mode: bypass cache and re-resolve all dependencies */
        force?: boolean;
    };
    /** Command context (needed for cwd) */
    context: CommandContext;
}

/**
 * State for installation process.
 * Uses a richer discriminated union than useCommand to handle
 * domain-specific error types (FrozenMismatchError, IntegrityError).
 */
type InstallState = 
    | { status: 'loading' }
    | { status: 'downloading'; packages: PackageProgress[] }
    | { status: 'success'; result: InstallResult }
    | { status: 'frozen-error'; error: FrozenMismatchError }
    | { status: 'integrity-error'; error: IntegrityError }
    | { status: 'error'; error: string };

/**
 * Frozen error display component.
 */
const FrozenErrorDisplay: React.FC<{ error: FrozenMismatchError }> = ({ error }) => (
    <Box flexDirection="column">
        <Banner 
            bannerText={`${EMOJI.error}Lock file is out of sync with model.yaml`}
            variant="error"
        />

        <Box marginTop={1}>
            <Divider title="Frozen Mode Error" />
        </Box>

        {error.added.length > 0 && (
            <Box flexDirection="column" marginTop={1} marginLeft={1}>
                <Text color={theme.status.error}>Added in manifest:</Text>
                {error.added.map((pkg) => (
                    <Box key={pkg} marginLeft={2}>
                        <Text color={theme.text.secondary}>• {pkg}</Text>
                    </Box>
                ))}
            </Box>
        )}

        {error.removed.length > 0 && (
            <Box flexDirection="column" marginTop={1} marginLeft={1}>
                <Text color={theme.status.error}>Removed from manifest:</Text>
                {error.removed.map((pkg) => (
                    <Box key={pkg} marginLeft={2}>
                        <Text color={theme.text.secondary}>• {pkg}</Text>
                    </Box>
                ))}
            </Box>
        )}

        {error.changed.length > 0 && (
            <Box flexDirection="column" marginTop={1} marginLeft={1}>
                <Text color={theme.status.error}>Changed refs:</Text>
                {error.changed.map((change) => (
                    <Box key={change.pkg} marginLeft={2}>
                        <Text color={theme.text.secondary}>
                            • {change.pkg}: {change.lockRef} → {change.manifestRef}
                        </Text>
                    </Box>
                ))}
            </Box>
        )}

        <Box marginTop={1}>
            <Text color={theme.text.secondary}>
                {EMOJI.tip}Run 'dlang install' without --frozen to update the lock file
            </Text>
        </Box>
    </Box>
);

/**
 * Integrity error display component.
 */
const IntegrityErrorDisplay: React.FC<{ error: IntegrityError }> = ({ error }) => (
    <Box flexDirection="column">
        <Banner 
            bannerText={`${EMOJI.error}Integrity verification failed`}
            variant="error"
        />

        <Box marginTop={1}>
            <Divider title="Integrity Error" />
        </Box>

        <Box marginTop={1} marginLeft={1}>
            <KeyValue data={{
                'Package': error.pkg,
                'Expected': error.expected,
                'Actual': error.actual,
            }} />
        </Box>

        <Box marginTop={1}>
            <Text color={theme.text.secondary}>
                {EMOJI.tip}This may indicate a corrupted cache or compromised package
            </Text>
        </Box>
        <Box marginTop={1}>
            <Text color={theme.text.secondary}>
                {EMOJI.tip}Run 'dlang cache-clear' to clear the cache and try again
            </Text>
        </Box>
    </Box>
);

/**
 * Success display component.
 */
const SuccessDisplay: React.FC<{ result: InstallResult; elapsed: number }> = ({ result, elapsed }) => {
    const totalPackages = result.installed + result.cached;
    const pluralSuffix = totalPackages === 1 ? '' : 's';
    
    return (
        <Box flexDirection="column">
            <Banner 
                bannerText={`${EMOJI.success}${totalPackages} package${pluralSuffix} installed successfully`}
                variant="success"
            />

            <Box marginTop={1}>
                <Divider title="Summary" />
            </Box>
            <Box marginTop={1} marginLeft={1}>
                <KeyValue data={{
                    'Packages': `${totalPackages} installed, ${result.cached} cached`,
                    'Lock file': result.lockFileModified ? 'model.lock updated' : 'model.lock unchanged',
                    'Integrity': 'SHA-512 verified',
                    'Cache': '.dlang/packages/',
                }} />
            </Box>

            {result.warnings.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                    <Divider title={`Warnings (${result.warnings.length})`} />
                    {result.warnings.map((warning) => (
                        <Box key={warning} marginLeft={1}>
                            <Text color={theme.status.warning}>
                                {EMOJI.warning}{warning}
                            </Text>
                        </Box>
                    ))}
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
 * Helper to update a single package's progress state.
 * Returns prev state unchanged if not in downloading state.
 */
function updatePackage(
    prev: InstallState,
    pkgName: string,
    updates: Partial<PackageProgress>
): InstallState {
    if (prev.status !== 'downloading') return prev;
    const packages = prev.packages.map(p =>
        p.name === pkgName ? { ...p, ...updates } as PackageProgress : p
    );
    return { status: 'downloading', packages };
}

/**
 * Install command component.
 * Uses custom state management (not useCommand) to handle
 * domain-specific error types with dedicated UI.
 */
export const Install: React.FC<InstallProps> = ({ options, context }) => {
    const [state, setState] = useState<InstallState>({ status: 'loading' });
    const elapsed = useElapsedTime(100, state.status === 'loading');
    const { exit } = useApp();

    // Exit when command completes (any terminal state)
    useEffect(() => {
        if (state.status !== 'loading' && state.status !== 'downloading') {
            setTimeout(() => exit(), 100);
        }
    }, [state.status, exit]);

    useEffect(() => {
        const service = new InstallService(context.cwd);

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

        service.install({
            frozen: options.frozen,
            force: options.force,
            workspaceRoot: context.cwd,
            onProgress: handleProgress,
        })
            .then(result => setState({ status: 'success', result }))
            .catch((err: unknown) => {
                if (err instanceof FrozenMismatchError) {
                    setState({ status: 'frozen-error', error: err });
                } else if (err instanceof IntegrityError) {
                    setState({ status: 'integrity-error', error: err });
                } else {
                    setState({ 
                        status: 'error', 
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            });
    }, [options.frozen, options.force, context.cwd]);

    if (state.status === 'loading') {
        return <Spinner label="Resolving dependencies..." emoji="search" />;
    }

    if (state.status === 'downloading') {
        return <MultiProgressBar packages={state.packages} />;
    }

    if (state.status === 'frozen-error') {
        return <FrozenErrorDisplay error={state.error} />;
    }

    if (state.status === 'integrity-error') {
        return <IntegrityErrorDisplay error={state.error} />;
    }

    if (state.status === 'error') {
        return (
            <Box flexDirection="column">
                <StatusMessage type="error" message={state.error} />
                <Box marginTop={1}>
                    <Text color={theme.text.secondary}>
                        {EMOJI.tip}Check that model.yaml exists and dependencies are correctly formatted
                    </Text>
                </Box>
            </Box>
        );
    }

    // state.status === 'success'
    return <SuccessDisplay result={state.result} elapsed={elapsed} />;
};

/**
 * Output a frozen mismatch error in the appropriate format.
 */
function outputFrozenError(error: FrozenMismatchError, mode: string): void {
    if (mode === 'json') {
        process.stdout.write(JSON.stringify({
            success: false,
            error: 'Lock file out of sync',
            added: error.added,
            removed: error.removed,
            changed: error.changed,
        }) + '\n');
    } else {
        process.stderr.write('Lock file is out of sync with model.yaml (--frozen mode)\n');
        for (const pkg of error.added) process.stderr.write(`  Added: ${pkg}\n`);
        for (const pkg of error.removed) process.stderr.write(`  Removed: ${pkg}\n`);
        for (const c of error.changed) process.stderr.write(`  Changed: ${c.pkg} (${c.lockRef} → ${c.manifestRef})\n`);
    }
}

/**
 * Output an integrity error in the appropriate format.
 */
function outputIntegrityError(error: IntegrityError, mode: string): void {
    if (mode === 'json') {
        process.stdout.write(JSON.stringify({
            success: false,
            error: 'Integrity verification failed',
            package: error.pkg,
            expected: error.expected,
            actual: error.actual,
        }) + '\n');
    } else {
        process.stderr.write(`Integrity check failed for '${error.pkg}'\n`);
        process.stderr.write(`  Expected: ${error.expected}\n`);
        process.stderr.write(`  Actual: ${error.actual}\n`);
    }
}

/**
 * Run installation without Ink (for --json and --quiet modes).
 */
export async function runInstall(
    options: { frozen?: boolean; force?: boolean },
    context: CommandContext
): Promise<void> {
    const service = new InstallService(context.cwd);
    await runDirect(
        () => service.install({
            frozen: options.frozen,
            force: options.force,
            workspaceRoot: context.cwd,
        }),
        context,
        {
            json: r => ({ success: true, ...r }),
            quiet: r => `Installed ${r.installed} packages (${r.cached} from cache)`,
            onError: (err, ctx) => {
                if (err instanceof FrozenMismatchError) {
                    outputFrozenError(err, ctx.mode);
                    return true;
                }
                if (err instanceof IntegrityError) {
                    outputIntegrityError(err, ctx.mode);
                    return true;
                }
                return false;
            },
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/** Command arguments */
export interface InstallArgs {
    frozen?: boolean;
    force?: boolean;
}

/** Install command module for yargs */
export const installCommand: CommandModule<object, InstallArgs> = {
    command: 'install',
    describe: 'Install dependencies from model.yaml',
    builder: (yargs: Argv) =>
        yargs
            .option('frozen', {
                type: 'boolean',
                describe: 'Fail if lock file is out of sync',
                default: false,
            })
            .option('force', {
                type: 'boolean',
                describe: 'Bypass cache and re-resolve all',
                default: false,
            })
            .check((argv) => {
                if (argv.frozen && argv.force) {
                    throw new Error('Cannot use --frozen and --force together (mutually exclusive)');
                }
                return true;
            }) as Argv<InstallArgs>,
    handler: async (argv) => {
        const options = { frozen: argv.frozen, force: argv.force };
        await runCommand(argv, {
            ink: (_args, ctx) => <Install options={options} context={ctx} />,
            direct: (_args, ctx) => runInstall(options, ctx),
        });
    },
};
