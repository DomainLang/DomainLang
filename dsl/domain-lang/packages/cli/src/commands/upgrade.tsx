/**
 * Upgrade command - upgrades tag dependencies to newer versions.
 * Combines yargs CommandModule with Ink UI component.
 * 
 * @module commands/upgrade
 */
import type { CommandModule, Argv } from 'yargs';
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
import { CredentialProvider } from '../services/credential-provider.js';
import { fetchTags, findLatestVersion } from '../services/github-tags.js';
import { compareVersions } from '../services/semver.js';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ModelManifest, DependencySpec } from '@domainlang/language';

/**
 * Props for Upgrade command component.
 */
export interface UpgradeProps {
    /** Package name to upgrade (if specified) */
    packageName?: string;
    /** Target version (if specified) */
    targetVersion?: string;
    /** Command context (needed for cwd) */
    context: CommandContext;
}

/**
 * Available upgrade information.
 */
export interface AvailableUpgrade {
    pkg: string;
    current: string;
    latest: string;
    upgradeType: 'major' | 'minor' | 'patch' | 'up-to-date';
}

/**
 * Result of upgrade operation.
 */
export interface UpgradeResult {
    /** List/apply mode */
    mode: 'list' | 'apply';
    /** Available upgrades (list mode) */
    available?: AvailableUpgrade[];
    /** Applied upgrade (apply mode) */
    upgraded?: {
        pkg: string;
        from: string;
        to: string;
    };
}

/**
 * Determine the upgrade type between two semver strings.
 */
function classifyUpgradeType(current: string, latest: string): AvailableUpgrade['upgradeType'] {
    if (compareVersions(latest, current) === 0) return 'up-to-date';

    const latestParts = latest.replace(/^v/, '').split('.');
    const currentParts = current.replace(/^v/, '').split('.');

    if (latestParts[0] !== currentParts[0]) return 'major';
    if (latestParts[1] !== currentParts[1]) return 'minor';
    return 'patch';
}

/**
 * List available upgrades for tag dependencies.
 */
async function listAvailableUpgrades(workspaceRoot: string): Promise<AvailableUpgrade[]> {
    const manifestPath = path.join(workspaceRoot, 'model.yaml');
    
    if (!existsSync(manifestPath)) {
        throw new Error('No model.yaml found in workspace');
    }

    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest: ModelManifest = YAML.parse(manifestContent);

    if (!manifest.dependencies || Object.keys(manifest.dependencies).length === 0) {
        return [];
    }

    const credentialProvider = new CredentialProvider();
    const upgrades: AvailableUpgrade[] = [];

    for (const [alias, depSpec] of Object.entries(manifest.dependencies)) {
        const ref = typeof depSpec === 'string' ? depSpec : depSpec.ref;
        const source = typeof depSpec === 'string' ? alias : (depSpec.source ?? alias);

        if (!ref || !/^v?\d+\.\d+\.\d+/.test(ref)) continue;

        const [owner, repo] = source.split('/');
        if (!owner || !repo) continue;

        try {
            const tags = await fetchTags(owner, repo, credentialProvider);
            const latest = findLatestVersion(tags);
            if (!latest) continue;

            upgrades.push({
                pkg: source,
                current: ref,
                latest,
                upgradeType: classifyUpgradeType(ref, latest),
            });
        } catch {
            // Skip packages that can't be checked
        }
    }

    return upgrades;
}

/**
 * Apply upgrade to specific package.
 */
async function applyUpgrade(
    workspaceRoot: string,
    packageName: string,
    targetVersion?: string,
): Promise<{ pkg: string; from: string; to: string }> {
    const manifestPath = path.join(workspaceRoot, 'model.yaml');
    
    if (!existsSync(manifestPath)) {
        throw new Error('No model.yaml found in workspace');
    }

    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest: ModelManifest = YAML.parse(manifestContent);

    if (!manifest.dependencies) {
        throw new Error('No dependencies found in model.yaml');
    }

    const { alias, ref } = findPackageInManifest(manifest, packageName);
    const newVersion = targetVersion ?? await resolveLatestTag(packageName);

    // Create mutable copy of dependencies and update
    const mutableDeps: Record<string, DependencySpec> = { ...manifest.dependencies };
    const depSpec = mutableDeps[alias];
    if (typeof depSpec === 'string') {
        mutableDeps[alias] = newVersion;
    } else {
        mutableDeps[alias] = { ...depSpec, ref: newVersion };
    }
    const updatedManifest: ModelManifest = { ...manifest, dependencies: mutableDeps };

    await fs.writeFile(manifestPath, YAML.stringify(updatedManifest), 'utf-8');

    // Run install to update lock file
    const { InstallService } = await import('../services/install-service.js');
    const installService = new InstallService(workspaceRoot);
    await installService.install({ workspaceRoot });

    return { pkg: packageName, from: ref, to: newVersion };
}

/**
 * Find a package in the manifest by its source name.
 */
function findPackageInManifest(
    manifest: ModelManifest,
    packageName: string,
): { alias: string; ref: string } {
    for (const [alias, depSpec] of Object.entries(manifest.dependencies ?? {})) {
        const source = typeof depSpec === 'string' ? alias : (depSpec.source ?? alias);
        if (source === packageName) {
            const ref = typeof depSpec === 'string' ? depSpec : (depSpec.ref ?? '');
            return { alias, ref };
        }
    }
    throw new Error(`Package '${packageName}' not found in dependencies`);
}

/**
 * Resolve the latest tag version for a package.
 */
async function resolveLatestTag(packageName: string): Promise<string> {
    const [owner, repo] = packageName.split('/');
    if (!owner || !repo) {
        throw new Error(`Invalid package name: ${packageName}`);
    }

    const credentialProvider = new CredentialProvider();
    const tags = await fetchTags(owner, repo, credentialProvider);
    const latest = findLatestVersion(tags);

    if (!latest) {
        throw new Error(`No version tags found for ${packageName}`);
    }
    return latest;
}

/**
 * Execute upgrade operation.
 */
async function executeUpgrade(
    packageName: string | undefined,
    targetVersion: string | undefined,
    workspaceRoot: string,
): Promise<UpgradeResult> {
    if (packageName) {
        const upgraded = await applyUpgrade(workspaceRoot, packageName, targetVersion);
        return { mode: 'apply', upgraded };
    }
    const available = await listAvailableUpgrades(workspaceRoot);
    return { mode: 'list', available };
}

/**
 * Format quiet output for upgrade results.
 */
function formatQuietOutput(result: UpgradeResult): string {
    if (result.mode === 'list') {
        const upgradeable = result.available?.filter(u => u.upgradeType !== 'up-to-date') ?? [];
        return `${upgradeable.length} upgrade(s) available`;
    }
    if (result.upgraded) {
        return `Upgraded ${result.upgraded.pkg}: ${result.upgraded.from} → ${result.upgraded.to}`;
    }
    return '';
}

/**
 * Upgrade command component.
 * Rich mode only — json/quiet handled by runUpgrade via runDirect.
 */
export const Upgrade: React.FC<UpgradeProps> = ({ packageName, targetVersion, context }) => {
    const { status, result, error, elapsed } = useCommand(
        () => executeUpgrade(packageName, targetVersion, context.cwd),
        [packageName, targetVersion, context.cwd],
    );
    const { exit } = useApp();

    // Exit when command completes (success or error)
    useEffect(() => {
        if (status === 'success' || status === 'error') {
            setTimeout(() => exit(), 100);
        }
    }, [status, exit]);

    if (status === 'loading') {
        const label = packageName 
            ? `${EMOJI.search}Upgrading ${packageName}...`
            : `${EMOJI.search}Checking for upgrades...`;
        
        return (
            <Box flexDirection="column">
                <Banner bannerText="Upgrade Dependencies" />
                <Box marginTop={1}>
                    <Spinner label={label} />
                </Box>
            </Box>
        );
    }

    if (status === 'error') {
        return (
            <Box flexDirection="column">
                <Banner bannerText={`${EMOJI.error}Upgrade failed`} variant="error" />
                <Box marginTop={1}>
                    <Text color={theme.status.error}>{error}</Text>
                </Box>
            </Box>
        );
    }

    if (!result) return null;

    if (result.mode === 'list') {
        return <UpgradeListView result={result} elapsed={elapsed} />;
    }

    return (
        <Box flexDirection="column">
            <Banner 
                bannerText={`${EMOJI.success}Upgraded ${result.upgraded?.pkg}`}
                variant="success"
            />
            <Box marginTop={1}><Divider /></Box>
            <Box marginTop={1} marginLeft={2}>
                <Text color={theme.text.primary}>
                    {result.upgraded?.from} → {result.upgraded?.to}
                </Text>
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
 * List view sub-component for available upgrades.
 */
const UpgradeListView: React.FC<{ result: UpgradeResult; elapsed: number }> = ({ result, elapsed }) => {
    const upgradeable = result.available?.filter(u => u.upgradeType !== 'up-to-date') ?? [];

    return (
        <Box flexDirection="column">
            <Banner bannerText="Available Upgrades" />
            <Box marginTop={1}><Divider /></Box>

            {result.available && result.available.length > 0 ? (
                <Box marginTop={1}>
                    <Table
                        headers={['Package', 'Current', 'Latest', 'Available']}
                        rows={result.available.map(upgrade => [
                            upgrade.pkg,
                            upgrade.current,
                            upgrade.latest,
                            upgrade.upgradeType === 'up-to-date' 
                                ? 'up to date'
                                : `${upgrade.upgradeType} ${EMOJI.success}`,
                        ])}
                    />
                </Box>
            ) : (
                <Box marginTop={1}>
                    <Text color={theme.text.secondary}>No tag dependencies found</Text>
                </Box>
            )}

            {upgradeable.length > 0 && (
                <Box marginTop={1}>
                    <Text color={theme.text.secondary}>
                        {EMOJI.tip}Run 'dlang upgrade {'<package>'} to upgrade a specific package
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
 * Run upgrade without Ink (for --json and --quiet modes).
 */
export async function runUpgrade(
    packageName: string | undefined,
    targetVersion: string | undefined,
    context: CommandContext,
): Promise<void> {
    await runDirect(
        () => executeUpgrade(packageName, targetVersion, context.cwd),
        context,
        {
            json: r => ({ success: true, ...r }),
            quiet: formatQuietOutput,
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/** Command arguments */
export interface UpgradeArgs {
    package?: string;
    version?: string;
}

/** Upgrade command module for yargs */
export const upgradeCommand: CommandModule<object, UpgradeArgs> = {
    command: 'upgrade [package] [version]',
    describe: 'Upgrade tag dependencies to newer versions',
    builder: (yargs: Argv) =>
        yargs
            .positional('package', {
                describe: 'Package to upgrade (optional, upgrades all if omitted)',
                type: 'string',
            })
            .positional('version', {
                describe: 'Target version for the package',
                type: 'string',
            }) as Argv<UpgradeArgs>,
    handler: async (argv) => {
        await runCommand(argv, {
            ink: (args, ctx) => <Upgrade packageName={args.package} targetVersion={args.version} context={ctx} />,
            direct: (args, ctx) => runUpgrade(args.package, args.version, ctx),
        });
    },
};
