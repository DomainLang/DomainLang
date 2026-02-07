#!/usr/bin/env node
/**
 * DomainLang CLI entry point.
 *
 * Uses yargs for command parsing and routing, with Ink for rich terminal UI
 * and fallback to direct output for JSON/quiet modes.
 *
 * @module main
 */
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getVersion, globalOptions, buildContext } from './commands/command-runner.js';
import { commands } from './commands/index.js';
import { Help, runHelp } from './commands/help.js';
import { shouldUseInk } from './utils/output-mode.js';
import { render } from 'ink';
import React from 'react';

/**
 * Show the custom help screen based on output mode.
 */
async function showHelp(): Promise<void> {
    const context = await buildContext();
    if (shouldUseInk(context)) {
        const { waitUntilExit } = render(React.createElement(Help, { context }));
        await waitUntilExit();
    } else {
        runHelp(context);
    }
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
    const version = await getVersion();

    // Check if no command is provided or if --help/-h is used
    const args = hideBin(process.argv);
    const hasHelp = args.includes('--help') || args.includes('-h');
    const hasVersion = args.includes('--version') || args.includes('-v');

    // Handle help flag with custom help screen
    if (hasHelp && args.filter(a => !a.startsWith('-')).length === 0) {
        await showHelp();
        process.exit(0);
    }

    // Build yargs parser with all commands
    let parser = yargs(args)
        .scriptName('dlang')
        .usage('$0 <command> [options]')
        .version(version)
        .help(false) // Disable built-in help; we use our custom help command
        .options(globalOptions);

    // Register all commands from the commands array
    for (const cmd of commands) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parser = parser.command(cmd as any);
    }

    parser = parser
        .strict()
        .demandCommand(0)
        .recommendCommands()
        .showHelpOnFail(false)
        .fail(async (msg, err) => {
            // Handle errors gracefully
            const context = await buildContext();
            const errorMsg = err?.message ?? msg ?? 'Unknown error';
            
            if (context.mode === 'json') {
                process.stdout.write(JSON.stringify({ success: false, error: errorMsg }) + '\n');
            } else {
                process.stderr.write(`Error: ${errorMsg}\n`);
                // For unknown commands, suggest using help
                if (msg?.includes('Unknown argument') || msg?.includes('Not enough arguments')) {
                    process.stderr.write("Run 'dlang help' for available commands.\n");
                }
            }
            process.exit(1);
        });

    // Parse and execute
    const argv = await parser.parse();

    // If no command was executed (just 'dlang' with no args), show help
    if (!hasVersion && argv._.length === 0) {
        await showHelp();
    }
}

// Run main
try {
    await main();
} catch (error: unknown) {
    process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
}
