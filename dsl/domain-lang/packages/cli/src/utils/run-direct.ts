/**
 * Unified non-Ink command runner.
 *
 * `runDirect` replaces the per-command `runXxx()` functions with a single
 * generic implementation that handles:
 *  - JSON output formatting
 *  - Quiet output formatting
 *  - Error serialisation
 *  - Exit codes
 *
 * Commands only need to supply a business-logic executor and optional
 * formatting callbacks.
 *
 * @module utils/run-direct
 */
import type { CommandContext } from '../commands/types.js';

/**
 * Options for customising output formatting per command.
 *
 * @typeParam T - The success-result type.
 */
export interface RunDirectOptions<T> {
    /**
     * Produce a one-line string for `--quiet` mode.
     * If omitted, quiet mode prints nothing on success.
     */
    quiet?: (result: T) => string;

    /**
     * Produce the JSON payload for `--json` mode.
     * Defaults to `{ success: true, ...result }` when omitted.
     */
    json?: (result: T) => unknown;

    /**
     * Override the exit code on success.
     * Defaults to `0`.
     */
    exitCode?: (result: T) => number;

    /**
     * Custom error handler.  If provided and returns `true`, the default
     * error output is suppressed (the handler already wrote to stdout/stderr).
     */
    onError?: (error: unknown, context: CommandContext) => boolean;
}

/**
 * Execute a command's business logic and write output for non-Ink modes
 * (json / quiet).  Terminates the process with the appropriate exit code.
 *
 * @typeParam T - The success-result type.
 * @param execute - Async function that performs the command's work.
 * @param context - CLI output context (mode, noColor, cwd …).
 * @param options - Optional formatting overrides.
 */
export async function runDirect<T>(
    execute: () => Promise<T>,
    context: CommandContext,
    options?: RunDirectOptions<T>,
): Promise<never> {
    try {
        const result = await execute();
        const code = options?.exitCode?.(result) ?? 0;

        if (context.mode === 'json') {
            const data = options?.json?.(result)
                ?? { success: code === 0, ...(result as object) };
            process.stdout.write(JSON.stringify(data) + '\n');
        } else {
            // quiet mode
            const line = options?.quiet?.(result);
            if (line) {
                process.stdout.write(line + '\n');
            }
        }

        process.exit(code);
    } catch (error: unknown) {
        // Let commands handle domain-specific errors first
        if (options?.onError?.(error, context)) {
            process.exit(1);
        }

        const message = error instanceof Error ? error.message : String(error);

        if (context.mode === 'json') {
            process.stdout.write(
                JSON.stringify({ success: false, error: message }) + '\n',
            );
        } else {
            process.stderr.write(message + '\n');
        }

        process.exit(1);
    }
}
