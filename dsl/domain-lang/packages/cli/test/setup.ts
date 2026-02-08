/**
 * Global test setup for DomainLang CLI tests.
 *
 * Automatically cleans up after each test to prevent:
 * - React tree memory leaks from unmounted Ink components
 * - Active `setInterval` / `setTimeout` timers (e.g., from `useElapsedTime`, `useExitOnComplete`)
 * - Module-level mock bleed between test files
 * - OOM crashes from orphaned event-loop handles in forked workers
 *
 * @module test/setup
 */
import { afterEach, vi } from 'vitest';
import { cleanup } from '../src/test-utils/render.js';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
