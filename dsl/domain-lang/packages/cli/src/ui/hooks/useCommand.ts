/**
 * Shared command lifecycle hook for Ink components.
 *
 * Encapsulates the loading → success / error state machine that every
 * command component repeats.  Components call `useCommand` with an async
 * executor and receive reactive state they can render.
 *
 * @module ui/hooks/useCommand
 */
import { useState, useEffect } from 'react';
import { useElapsedTime } from './useFirstRun.js';

/** Possible statuses of a command execution. */
export type CommandStatus = 'loading' | 'success' | 'error';

/** Reactive state returned by {@link useCommand}. */
export interface CommandState<T> {
    /** Current execution status */
    status: CommandStatus;
    /** The result value when `status === 'success'` */
    result: T | undefined;
    /** The error message when `status === 'error'` */
    error: string | undefined;
    /** Seconds elapsed since the hook mounted (useful for loading timers) */
    elapsed: number;
}

/**
 * React hook that manages the async command lifecycle.
 *
 * @typeParam T - The success-result type produced by `execute`.
 * @param execute - Async function that performs the command's work.
 * @param deps    - React dependency array – re-runs `execute` when deps change.
 * @returns Reactive {@link CommandState} for rendering.
 *
 * @example
 * ```tsx
 * const { status, result, error, elapsed } = useCommand(
 *     () => validateModel(file),
 *     [file],
 * );
 * ```
 */
export function useCommand<T>(
    execute: () => Promise<T>,
    deps: unknown[] = [],
): CommandState<T> {
    const [status, setStatus] = useState<CommandStatus>('loading');
    const [result, setResult] = useState<T | undefined>();
    const [error, setError] = useState<string | undefined>();
    const elapsed = useElapsedTime(100, status === 'loading');

    useEffect(() => {
        let cancelled = false;

        // Reset state on re-execution
        setStatus('loading');
        setResult(undefined);
        setError(undefined);

        execute()
            .then(r => {
                if (!cancelled) {
                    setResult(r);
                    setStatus('success');
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setError(msg);
                    setStatus('error');
                }
            });

        return () => { cancelled = true; };
        // deps array intentionally controlled by caller, not by this hook
    }, deps);

    return { status, result, error, elapsed };
}

/**
 * React hook that exits the Ink app after a command completes.
 *
 * Properly clears the exit timeout on unmount to prevent leaked timers
 * that would keep the Node.js event loop alive (causing OOM in test workers).
 *
 * @param status - Current command status from {@link useCommand}.
 * @param exit   - Ink's `useApp().exit` callback.
 * @param delay  - Delay in ms before calling exit (default: 100).
 */
export function useExitOnComplete(
    status: CommandStatus,
    exit: () => void,
    delay = 100,
): void {
    useEffect(() => {
        if (status === 'success' || status === 'error') {
            const timer = setTimeout(() => exit(), delay);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [status, exit, delay]);
}
