/**
 * Commands barrel export.
 *
 * Each command file exports a named `CommandModule` (e.g. `validateCommand`).
 * This module re-exports them and assembles the `commands` array used by
 * main.ts for yargs registration.
 *
 * Individual command components and `runXxx` functions are NOT re-exported
 * here — import them directly from their command file when needed (e.g. in
 * tests).
 *
 * @module commands
 */

// Named command modules
export { initCommand } from './init.js';
export { validateCommand } from './validate.js';
export { installCommand } from './install.js';
export { addCommand } from './add.js';
export { removeCommand } from './remove.js';
export { updateCommand } from './update.js';
export { upgradeCommand } from './upgrade.js';
export { outdatedCommand } from './outdated.js';
export { cacheClearCommand } from './cache-clear.js';
export { helpCommand } from './help.js';

// Shared types
export type {
    CommandContext,
    CommandResult,
    CommandError,
    CommandWarning,
    ValidationResult,
} from './types.js';

// Yargs command infrastructure
export { runCommand, buildContext, getVersion, globalOptions } from './command-runner.js';

// Assemble the commands array from named exports
import { initCommand } from './init.js';
import { validateCommand } from './validate.js';
import { installCommand } from './install.js';
import { addCommand } from './add.js';
import { removeCommand } from './remove.js';
import { updateCommand } from './update.js';
import { upgradeCommand } from './upgrade.js';
import { outdatedCommand } from './outdated.js';
import { cacheClearCommand } from './cache-clear.js';
import { helpCommand } from './help.js';

/**
 * All registered command modules for yargs.
 * Used by main.ts for auto-registration.
 */
export const commands = [
    initCommand,
    validateCommand,
    installCommand,
    addCommand,
    removeCommand,
    updateCommand,
    upgradeCommand,
    outdatedCommand,
    cacheClearCommand,
    helpCommand,
] as const;
