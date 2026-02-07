/**
 * Progress Bar Component
 * 
 * A visual progress indicator for long-running operations like
 * package downloads. Supports both determinate (percentage) and
 * indeterminate modes.
 * 
 * @module ui/components/ProgressBar
 */
import React from 'react';
import { Box, Text } from 'ink';
import { theme, colors } from '../themes/colors.js';

/**
 * Props for the ProgressBar component.
 */
export interface ProgressBarProps {
    /** Progress value from 0 to 1 (0% to 100%) */
    value: number;
    /** Width of the progress bar in characters (default: 30) */
    width?: number;
    /** Label text to show before the bar */
    label?: string;
    /** Show percentage text after the bar (default: true) */
    showPercentage?: boolean;
    /** Character for filled portion (default: █) */
    fillChar?: string;
    /** Character for empty portion (default: ░) */
    emptyChar?: string;
    /** Color for the filled portion */
    color?: string;
}

/**
 * A visual progress bar for terminal UI.
 * 
 * @example
 * ```tsx
 * <ProgressBar value={0.5} label="Downloading" />
 * // Output: Downloading ███████████████░░░░░░░░░░░░░░░ 50%
 * ```
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
    value,
    width = 30,
    label,
    showPercentage = true,
    fillChar = '█',
    emptyChar = '░',
    color = colors.info,
}) => {
    // Clamp value between 0 and 1
    const clampedValue = Math.max(0, Math.min(1, value));
    const filled = Math.round(clampedValue * width);
    const empty = width - filled;
    const percentage = Math.round(clampedValue * 100);

    return (
        <Box>
            {label && (
                <Box marginRight={1}>
                    <Text>{label}</Text>
                </Box>
            )}
            <Text color={color}>{fillChar.repeat(filled)}</Text>
            <Text color={colors.muted}>{emptyChar.repeat(empty)}</Text>
            {showPercentage && (
                <Box marginLeft={1}>
                    <Text color={theme.text.secondary}>{percentage.toString().padStart(3)}%</Text>
                </Box>
            )}
        </Box>
    );
};

/**
 * Props for the MultiProgressBar component.
 */
export interface MultiProgressBarProps {
    /** Array of package download states */
    packages: PackageProgress[];
    /** Maximum number of concurrent items to show (default: 5) */
    maxVisible?: number;
}

/**
 * State of a single package download.
 */
export interface PackageProgress {
    /** Package name (owner/repo) */
    name: string;
    /** Download status */
    status: 'pending' | 'resolving' | 'downloading' | 'extracting' | 'cached' | 'complete' | 'error';
    /** Download progress (0-1), only valid when status is 'downloading' */
    progress?: number;
    /** Error message if status is 'error' */
    error?: string;
}

/**
 * A multi-package progress display for parallel downloads.
 * Shows individual progress for each package being downloaded.
 * 
 * @example
 * ```tsx
 * <MultiProgressBar packages={[
 *   { name: 'acme/core', status: 'downloading', progress: 0.5 },
 *   { name: 'acme/utils', status: 'complete' },
 * ]} />
 * ```
 */
export const MultiProgressBar: React.FC<MultiProgressBarProps> = ({
    packages,
    maxVisible = 5,
}) => {
    // Show active packages first, then completed
    const sortedPackages = [...packages].sort((a, b) => {
        const order = { pending: 0, resolving: 1, downloading: 2, extracting: 3, cached: 4, complete: 5, error: 6 };
        return order[a.status] - order[b.status];
    });

    const visible = sortedPackages.slice(0, maxVisible);
    const hiddenCount = packages.length - visible.length;

    // Count completed and cached
    const completed = packages.filter(p => p.status === 'complete' || p.status === 'cached').length;
    const total = packages.length;

    return (
        <Box flexDirection="column">
            {/* Overall progress */}
            <Box marginBottom={1}>
                <Text color={theme.text.secondary}>
                    Progress: {completed}/{total} packages
                </Text>
            </Box>

            {/* Individual package progress */}
            {visible.map(pkg => (
                <PackageProgressRow key={pkg.name} pkg={pkg} />
            ))}

            {/* Hidden packages indicator */}
            {hiddenCount > 0 && (
                <Box marginTop={1}>
                    <Text color={colors.muted}>
                        ...and {hiddenCount} more package{hiddenCount > 1 ? 's' : ''}
                    </Text>
                </Box>
            )}
        </Box>
    );
};

/**
 * Single package progress row.
 */
const PackageProgressRow: React.FC<{ pkg: PackageProgress }> = ({ pkg }) => {
    const statusIcons: Record<PackageProgress['status'], string> = {
        pending: '○',
        resolving: '◔',
        downloading: '◑',
        extracting: '◕',
        cached: '●',
        complete: '●',
        error: '✖',
    };

    const statusColors: Record<PackageProgress['status'], string> = {
        pending: colors.muted,
        resolving: colors.info,
        downloading: colors.info,
        extracting: colors.info,
        cached: colors.info,
        complete: colors.success,
        error: colors.error,
    };

    const statusLabels: Record<PackageProgress['status'], string> = {
        pending: 'waiting',
        resolving: 'resolving',
        downloading: 'downloading',
        extracting: 'extracting',
        cached: 'cached',
        complete: 'done',
        error: 'failed',
    };

    return (
        <Box>
            <Box width={2}>
                <Text color={statusColors[pkg.status]}>{statusIcons[pkg.status]}</Text>
            </Box>
            <Box width={30}>
                <Text>{pkg.name.length > 28 ? pkg.name.slice(0, 25) + '...' : pkg.name}</Text>
            </Box>
            <Box flexGrow={1}>
                {pkg.status === 'downloading' && pkg.progress !== undefined ? (
                    <ProgressBar value={pkg.progress} width={20} showPercentage={true} />
                ) : (
                    <Text color={statusColors[pkg.status]}>{statusLabels[pkg.status]}</Text>
                )}
            </Box>
        </Box>
    );
};
