/**
 * Unified command runner that bridges yargs handlers to Ink/non-Ink execution.
 *
 * This module provides the infrastructure for executing commands in both
 * rich (Ink) and non-rich (JSON/quiet) modes. Yargs handles argument parsing
 * and validation, while this module handles the execution and output.
 *
 * @module commands/command-runner
 */
import type { ReactElement } from 'react';
import { render } from 'ink';
import type { CommandContext } from './types.js';
import { parseOutputConfig, shouldUseInk } from '../utils/output-mode.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFirstRun, markFirstRunComplete } from '../ui/hooks/useFirstRun.js';
import { defaultFileSystem, type FileSystemService } from '../services/filesystem.js';

// Get package version
const __dirname = dirname(fileURLToPath(import.meta.url));
const packagePath = resolve(__dirname, '..', '..', 'package.json');

let cachedVersion: string | undefined;

/**
 * Get the CLI version from package.json.
 */
export async function getVersion(fs: FileSystemService = defaultFileSystem): Promise<string> {
    if (cachedVersion) return cachedVersion;
    try {
        const content = await fs.readFile(packagePath, 'utf-8');
        const pkg = JSON.parse(content) as { version: string };
        cachedVersion = pkg.version;
        return pkg.version;
    } catch {
        return '0.0.0';
    }
}

/**
 * Build a CommandContext from the current process state.
 * Used by yargs handlers to create the context for command execution.
 */
export async function buildContext(): Promise<CommandContext> {
    const outputConfig = parseOutputConfig(process.argv.slice(2));
    const version = await getVersion();
    const firstRun = isFirstRun();

    if (firstRun) {
        markFirstRunComplete();
    }

    return {
        ...outputConfig,
        version,
        isFirstRun: firstRun,
    };
}

/**
 * Options for running a command.
 *
 * @typeParam TArgs - The type of parsed yargs arguments
 */
export interface RunCommandOptions<TArgs> {
    /**
     * Create the Ink component for rich mode.
     * Receives parsed args and context.
     */
    ink: (args: TArgs, context: CommandContext) => ReactElement;

    /**
     * Execute the command in non-rich mode (JSON/quiet).
     * Should use runDirect internally for consistent output handling.
     */
    direct: (args: TArgs, context: CommandContext) => Promise<void>;
}

/**
 * Execute a command, automatically choosing between Ink and non-Ink modes.
 *
 * This is the main entry point for command handlers. It:
 * 1. Builds the command context
 * 2. Checks the output mode
 * 3. Either renders the Ink component or calls the direct handler
 *
 * @example
 * ```typescript
 * export const handler = async (argv: ValidateArgs) => {
 *     await runCommand(argv, {
 *         ink: (args, ctx) => <Validate file={args.file} context={ctx} />,
 *         direct: (args, ctx) => runValidate(args.file, ctx),
 *     });
 * };
 * ```
 */
export async function runCommand<TArgs>(
    args: TArgs,
    options: RunCommandOptions<TArgs>,
): Promise<void> {
    const context = await buildContext();

    if (shouldUseInk(context)) {
        // Rich mode - render Ink component
        const element = options.ink(args, context);
        const { waitUntilExit } = render(element);
        await waitUntilExit();
    } else {
        // Non-rich mode - call direct handler
        await options.direct(args, context);
    }
}

/**
 * Standard yargs middleware options array.
 * Provides consistent output mode detection for all commands.
 */
export const globalOptions = {
    json: {
        type: 'boolean' as const,
        describe: 'Output in JSON format',
        default: false,
    },
    quiet: {
        alias: 'q',
        type: 'boolean' as const,
        describe: 'Suppress decorative output (CI mode)',
        default: false,
    },
    'no-color': {
        type: 'boolean' as const,
        describe: 'Disable colors',
        default: false,
    },
} as const;
