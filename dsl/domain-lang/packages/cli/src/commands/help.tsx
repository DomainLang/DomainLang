/**
 * Help command - displays help information.
 * Combines yargs CommandModule with Ink UI component.
 * Uses dynamic command discovery from exported commands array.
 * 
 * @module commands/help
 */
import type { CommandModule } from 'yargs';
import React from 'react';
import { Box, Text } from 'ink';
import { Header, SectionHeader } from '../ui/components/index.js';
import { theme } from '../ui/themes/colors.js';
import { EMOJI } from '../ui/themes/emoji.js';
import { runCommand } from './command-runner.js';
import type { CommandContext } from './types.js';

// Import command modules directly to avoid circular dependency with index.ts
import { initCommand } from './init.js';
import { validateCommand } from './validate.js';
import { installCommand } from './install.js';
import { addCommand } from './add.js';
import { removeCommand } from './remove.js';
import { updateCommand } from './update.js';
import { upgradeCommand } from './upgrade.js';
import { outdatedCommand } from './outdated.js';
import { cacheClearCommand } from './cache-clear.js';

/**
 * All command modules (excluding help itself).
 * Used to dynamically build the help list.
 */
const allCommands = [
    initCommand,
    validateCommand,
    installCommand,
    addCommand,
    removeCommand,
    updateCommand,
    upgradeCommand,
    outdatedCommand,
    cacheClearCommand,
] as const;

/**
 * Props for Help command component.
 */
export interface HelpProps {
    /** Command context (needed for version, mode) */
    context: CommandContext;
}

/**
 * Extract command list from yargs modules.
 * Dynamically derives command names and descriptions from registered modules.
 */
function getCommandList(): Array<{ name: string; description: string }> {
    return allCommands.map(cmd => ({
        name: typeof cmd.command === 'string' ? cmd.command : String(cmd.command),
        description: cmd.describe || '',
    }));
}

/**
 * Global options for help display.
 */
const OPTIONS = [
    { flags: '--help, -h', description: 'Show help' },
    { flags: '--version, -v', description: 'Show version' },
    { flags: '--quiet, -q', description: 'Suppress decorative output (CI mode)' },
    { flags: '--json', description: 'Output in JSON format' },
    { flags: '--no-color', description: 'Disable colors' },
] as const;

/**
 * Help command component (rich mode only).
 * Displays a styled help screen with banner and command list.
 */
export const Help: React.FC<HelpProps> = ({ context }) => {
    const commandList = getCommandList();
    const maxCommandWidth = Math.max(...commandList.map(c => c.name.length));

    return (
        <Box flexDirection="column">
            <Header version={context.version} context="help" />

            <SectionHeader icon={EMOJI.book} title="USAGE" />
            <Box marginLeft={3} marginBottom={1}>
                <Text color={theme.text.secondary}>$ dlang {'<command>'} [options]</Text>
            </Box>

            <SectionHeader icon={EMOJI.tools} title="COMMANDS" />
            <Box flexDirection="column" marginLeft={3} marginBottom={1}>
                {commandList.map(cmd => (
                    <Box key={cmd.name}>
                        <Box width={maxCommandWidth + 4}>
                            <Text color={theme.text.accent}>{cmd.name}</Text>
                        </Box>
                        <Text color={theme.text.secondary}>{cmd.description}</Text>
                    </Box>
                ))}
            </Box>

            <SectionHeader icon={EMOJI.gear} title="OPTIONS" />
            <Box flexDirection="column" marginLeft={3} marginBottom={1}>
                {OPTIONS.map(opt => (
                    <Box key={opt.flags}>
                        <Box width={20}>
                            <Text color={theme.ui.comment}>{opt.flags}</Text>
                        </Box>
                        <Text color={theme.text.secondary}>{opt.description}</Text>
                    </Box>
                ))}
            </Box>

            <SectionHeader icon={EMOJI.link} title="DOCUMENTATION" />
            <Box marginLeft={3} marginBottom={1}>
                <Text color={theme.text.link}>https://domainlang.net/guide/getting-started</Text>
            </Box>

            <SectionHeader icon={EMOJI.tip} title="EXAMPLES" />
            <Box flexDirection="column" marginLeft={3}>
                <Text color={theme.ui.comment}>$ dlang init</Text>
                <Text color={theme.ui.comment}>$ dlang validate ./domains</Text>
                <Text color={theme.ui.comment}>$ dlang add owner/repo@v1.0.0</Text>
            </Box>
        </Box>
    );
};

/**
 * Run help without Ink (for --json and --quiet modes).
 */
export function runHelp(context: CommandContext): void {
    const commandList = getCommandList();
    
    if (context.mode === 'json') {
        const data = {
            version: context.version,
            commands: commandList.map(c => ({ name: c.name, description: c.description })),
            options: OPTIONS.map(o => ({ flags: o.flags, description: o.description })),
        };
        process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    } else {
        process.stdout.write(`dlang v${context.version}\n`);
        const commandNames = commandList.map(c => c.name.split(' ')[0]).join(', ');
        process.stdout.write(`Commands: ${commandNames}\n`);
        process.stdout.write('Use --help for more information\n');
    }
    process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// yargs CommandModule
// ─────────────────────────────────────────────────────────────────────────────

/** Help command module for yargs */
export const helpCommand: CommandModule = {
    command: 'help',
    describe: 'Display help information',
    handler: async (argv) => {
        await runCommand(argv, {
            ink: (_args, ctx) => <Help context={ctx} />,
            direct: (_args, ctx) => {
                runHelp(ctx);
                return Promise.resolve();
            },
        });
    },
};
