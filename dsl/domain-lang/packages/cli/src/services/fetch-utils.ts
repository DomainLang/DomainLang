/**
 * Network utilities for HTTP requests with retry logic and exponential backoff.
 * 
 * @module fetch-utils
 */

/**
 * Configuration options for retry behavior.
 */
export interface RetryOptions {
    /** Maximum number of retry attempts. Default: 3 */
    maxRetries?: number;
    /** Initial delay in milliseconds before first retry. Default: 1000ms (1s) */
    initialDelayMs?: number;
    /** Maximum delay in milliseconds between retries. Default: 30000ms (30s) */
    maxDelayMs?: number;
    /** Custom function to determine if a request should be retried. */
    shouldRetry?: (error: Error, response?: Response) => boolean;
}

/**
 * Error thrown when maximum retry attempts are exceeded.
 */
export class MaxRetriesExceededError extends Error {
    constructor(
        public readonly attempts: number,
        public readonly lastError: Error,
        public readonly lastResponse?: Response
    ) {
        super(`Maximum retry attempts (${attempts}) exceeded. Last error: ${lastError.message}`);
        this.name = 'MaxRetriesExceededError';
    }
}

/**
 * Default retry logic: retry on rate limits, server errors, and network errors.
 * Do not retry on client errors (except 429) or auth failures.
 */
function defaultShouldRetry(error: Error, response?: Response): boolean {
    // Retry on network errors
    if (!response) {
        const networkErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
        return networkErrors.some(code => error.message.includes(code));
    }

    // Retry on rate limits (429) and server errors (5xx)
    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        return true;
    }

    // Do not retry on client errors (4xx) including auth failures
    return false;
}

/**
 * Calculate delay with exponential backoff and jitter.
 * 
 * @param attempt - Current attempt number (0-indexed)
 * @param initialDelayMs - Initial delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds with jitter applied
 */
function calculateBackoff(attempt: number, initialDelayMs: number, maxDelayMs: number): number {
    // Exponential backoff: 1s → 2s → 4s → 8s...
    const exponentialDelay = initialDelayMs * Math.pow(2, attempt);
    
    // Cap at maxDelayMs
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
    
    // Add jitter (±25% randomization) to avoid thundering herd
    const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
    
    return Math.floor(cappedDelay + jitter);
}

/**
 * Parse Retry-After header (supports both seconds and HTTP date).
 * 
 * @param retryAfter - Value of Retry-After header
 * @returns Delay in milliseconds, or undefined if invalid
 */
function parseRetryAfter(retryAfter: string | null): number | undefined {
    if (!retryAfter) {
        return undefined;
    }

    // Try parsing as seconds (numeric)
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
        return seconds * 1000;
    }

    // Try parsing as HTTP date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
        const delayMs = date.getTime() - Date.now();
        return Math.max(0, delayMs);
    }

    return undefined;
}

/**
 * Parse X-RateLimit-Reset header (Unix timestamp in seconds).
 * 
 * @param rateLimitReset - Value of X-RateLimit-Reset header
 * @returns Delay in milliseconds, or undefined if invalid
 */
function parseRateLimitReset(rateLimitReset: string | null): number | undefined {
    if (!rateLimitReset) {
        return undefined;
    }

    const timestamp = parseInt(rateLimitReset, 10);
    if (isNaN(timestamp)) {
        return undefined;
    }

    const delayMs = (timestamp * 1000) - Date.now();
    return Math.max(0, delayMs);
}

/**
 * Sleep for specified duration.
 * 
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with rate limit header support.
 */
function calculateRetryDelay(
    attempt: number,
    initialDelayMs: number,
    maxDelayMs: number,
    response?: Response
): number {
    let delayMs = calculateBackoff(attempt, initialDelayMs, maxDelayMs);

    if (!response) {
        return delayMs;
    }

    // Respect Retry-After header
    const retryAfterDelay = parseRetryAfter(response.headers.get('retry-after'));
    if (retryAfterDelay !== undefined) {
        delayMs = Math.min(retryAfterDelay, maxDelayMs);
    }

    // Respect X-RateLimit-Reset header (GitHub API)
    const rateLimitResetDelay = parseRateLimitReset(response.headers.get('x-ratelimit-reset'));
    if (rateLimitResetDelay !== undefined) {
        delayMs = Math.min(rateLimitResetDelay, maxDelayMs);
    }

    return delayMs;
}

/**
 * Handle failed HTTP response (non-2xx status).
 */
async function handleFailedResponse(
    response: Response,
    attempt: number,
    maxRetries: number,
    initialDelayMs: number,
    maxDelayMs: number,
    shouldRetry: (error: Error, response?: Response) => boolean
): Promise<{ action: 'retry' | 'return' | 'throw'; delayMs?: number; error?: Error }> {
    const retryError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    const isRetryable = shouldRetry(retryError, response);

    if (attempt < maxRetries && isRetryable) {
        const delayMs = calculateRetryDelay(attempt, initialDelayMs, maxDelayMs, response);
        return { action: 'retry', delayMs };
    }

    if (isRetryable) {
        return { action: 'throw', error: retryError };
    }

    return { action: 'return' };
}

/**
 * Handle network or fetch error.
 */
function handleFetchError(
    error: unknown,
    attempt: number,
    maxRetries: number,
    initialDelayMs: number,
    maxDelayMs: number,
    shouldRetry: (error: Error, response?: Response) => boolean
): { action: 'retry' | 'throw-retryable' | 'throw-non-retryable'; delayMs?: number; error: Error } {
    // MaxRetriesExceededError should be re-thrown as-is
    if (error instanceof MaxRetriesExceededError) {
        return { action: 'throw-non-retryable', error };
    }

    const fetchError = error instanceof Error ? error : new Error(String(error));
    const isRetryable = shouldRetry(fetchError);

    if (attempt < maxRetries && isRetryable) {
        const delayMs = calculateBackoff(attempt, initialDelayMs, maxDelayMs);
        return { action: 'retry', delayMs, error: fetchError };
    }

    if (isRetryable) {
        return { action: 'throw-retryable', error: fetchError };
    }

    return { action: 'throw-non-retryable', error: fetchError };
}

/**
 * Configuration for a single fetch attempt.
 */
interface FetchAttemptConfig {
    url: string;
    fetchOptions: RequestInit | undefined;
    attempt: number;
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    shouldRetry: (error: Error, response?: Response) => boolean;
}

/**
 * Execute a single fetch attempt with retry logic.
 */
async function executeFetchAttempt(
    config: FetchAttemptConfig,
    context: { lastError?: Error; lastResponse?: Response }
): Promise<{ status: 'success' | 'retry' | 'return' | 'throw-retryable' | 'throw-non-retryable'; response?: Response; delayMs?: number }> {
    try {
        const response = await fetch(config.url, config.fetchOptions);

        // Success - return immediately
        if (response.ok) {
            return { status: 'success', response };
        }

        // Handle failed response
        context.lastResponse = response;
        const result = await handleFailedResponse(
            response,
            config.attempt,
            config.maxRetries,
            config.initialDelayMs,
            config.maxDelayMs,
            config.shouldRetry
        );

        if (result.action === 'retry') {
            return { status: 'retry', delayMs: result.delayMs };
        }

        if (result.action === 'throw') {
            context.lastError = result.error;
            return { status: 'throw-retryable' };
        }

        // action === 'return': non-retryable error
        return { status: 'return', response };

    } catch (error) {
        const errorResult = handleFetchError(
            error,
            config.attempt,
            config.maxRetries,
            config.initialDelayMs,
            config.maxDelayMs,
            config.shouldRetry
        );

        context.lastError = errorResult.error;

        if (errorResult.action === 'retry') {
            return { status: 'retry', delayMs: errorResult.delayMs };
        }

        // Return the appropriate throw status
        return { status: errorResult.action };
    }
}

/**
 * Fetch with automatic retry logic and exponential backoff.
 * 
 * Retries on:
 * - HTTP 429 (Rate Limit)
 * - HTTP 5xx (Server Errors)
 * - Network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND, ECONNREFUSED)
 * 
 * Does NOT retry on:
 * - HTTP 4xx (except 429) - Client errors
 * - HTTP 401/403 - Authentication failures
 * - HTTP 404 - Not found
 * 
 * Respects Retry-After and X-RateLimit-Reset headers for rate limiting.
 * 
 * @param url - URL to fetch
 * @param options - Fetch options with optional retry configuration
 * @returns Response from successful request
 * @throws MaxRetriesExceededError if all retry attempts fail
 * 
 * @example
 * ```typescript
 * // Simple usage with defaults
 * const response = await fetchWithRetry('https://api.github.com/repos/owner/repo');
 * 
 * // Custom retry configuration
 * const response = await fetchWithRetry('https://api.github.com/repos/owner/repo', {
 *   retryOptions: {
 *     maxRetries: 5,
 *     initialDelayMs: 2000,
 *     shouldRetry: (error, response) => response?.status === 503
 *   }
 * });
 * ```
 */
export async function fetchWithRetry(
    url: string,
    options?: RequestInit & { retryOptions?: RetryOptions }
): Promise<Response> {
    const {
        retryOptions,
        ...fetchOptions
    } = options ?? {};

    const maxRetries = retryOptions?.maxRetries ?? 3;
    const initialDelayMs = retryOptions?.initialDelayMs ?? 1000;
    const maxDelayMs = retryOptions?.maxDelayMs ?? 30000;
    const shouldRetry = retryOptions?.shouldRetry ?? defaultShouldRetry;

    // Pass undefined to fetch if no options provided (not empty object)
    const fetchOpts = Object.keys(fetchOptions).length > 0 ? fetchOptions : undefined;
    const context: { lastError?: Error; lastResponse?: Response } = {};

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const result = await executeFetchAttempt(
            {
                url,
                fetchOptions: fetchOpts,
                attempt,
                maxRetries,
                initialDelayMs,
                maxDelayMs,
                shouldRetry,
            },
            context
        );

        if (result.status === 'success') {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- status === 'success' guarantees response exists
            return result.response!;
        }

        if (result.status === 'retry') {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- status === 'retry' guarantees delayMs exists
            await sleep(result.delayMs!);
            continue;
        }

        if (result.status === 'return') {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- status === 'return' guarantees response exists
            return result.response!;
        }

        if (result.status === 'throw-retryable') {
            // Retryable error that exhausted retries
            throw new MaxRetriesExceededError(
                maxRetries + 1,
                context.lastError ?? new Error('Unknown error'),
                context.lastResponse
            );
        }

        // status === 'throw-non-retryable'
        throw context.lastError ?? new Error('Unknown error');
    }

    // All retries exhausted
    throw new MaxRetriesExceededError(
        maxRetries + 1,
        context.lastError ?? new Error('Unknown error'),
        context.lastResponse
    );
}
