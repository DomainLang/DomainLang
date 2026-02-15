import { getLspRuntimeSettings } from './lsp-runtime-settings.js';

/**
 * Structured LSP logger for DomainLang (PRS-017 R17).
 *
 * Wraps console.warn/error with structured context (component name,
 * document URI, timing data) so that log messages are easy to
 * correlate when debugging multi-file change propagation.
 *
 * Usage:
 * ```ts
 * const log = createLogger('IndexManager');
 * log.info('exports changed', { uri, count: 3 });
 * log.warn('stale cache entry');
 * log.error('cycle detected', { cycle: ['a', 'b', 'a'] });
 * log.timed('rebuildAll', async () => { ...work... });
 * ```
 *
 * Output goes to stderr (visible in VS Code's "Output" → "DomainLang" channel)
 * because the LSP protocol uses stdout for JSON-RPC messages.
 */

/** Structured context attached to log messages. */
export interface LogContext {
    /** Langium document URI, shortened for readability. */
    uri?: string;
    /** Additional key → value pairs (serialised as JSON). */
    [key: string]: unknown;
}

export interface LspLogger {
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext): void;
    /**
     * Measures and logs the duration of an async operation.
     * Returns the operation's result.
     */
    timed<T>(label: string, fn: () => T | Promise<T>): Promise<T>;
}

function formatContext(ctx: LogContext | undefined): string {
    if (!ctx || Object.keys(ctx).length === 0) return '';
    // Shorten file:// URIs to just the filename for readability
    const display = { ...ctx };
    if (typeof display.uri === 'string') {
        const parts = display.uri.split('/');
        display.uri = parts.at(-1);
    }
    return ` ${JSON.stringify(display)}`;
}

/**
 * Creates a structured logger scoped to a named component.
 *
 * @param component - Short component name (e.g. 'IndexManager', 'ImportResolver')
 */
export function createLogger(component: string): LspLogger {
    const prefix = `[DomainLang:${component}]`;

    return {
        info(message: string, context?: LogContext): void {
            if (getLspRuntimeSettings().infoLogs) {
                console.warn(`${prefix} ${message}${formatContext(context)}`);
            }
        },
        warn(message: string, context?: LogContext): void {
            console.warn(`${prefix} WARN ${message}${formatContext(context)}`);
        },
        error(message: string, context?: LogContext): void {
            console.error(`${prefix} ERROR ${message}${formatContext(context)}`);
        },
        async timed<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
            const start = performance.now();
            try {
                const result = await fn();
                const elapsed = (performance.now() - start).toFixed(1);
                if (getLspRuntimeSettings().infoLogs) {
                    console.warn(`${prefix} ${label} completed in ${elapsed}ms`);
                }
                return result;
            } catch (err) {
                const elapsed = (performance.now() - start).toFixed(1);
                console.error(`${prefix} ${label} failed after ${elapsed}ms`);
                throw err;
            }
        }
    };
}
