import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, MaxRetriesExceededError } from '../../src/services/fetch-utils.js';

/**
 * Comprehensive test suite for fetchWithRetry utility.
 * Tests retry logic, exponential backoff, rate limit handling, and error scenarios.
 */

describe('fetchWithRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    test('returns successful response without retries', async () => {
        // Arrange - Mock successful fetch
        const mockResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

        // Act - Execute fetch
        const responsePromise = fetchWithRetry('https://api.example.com/data');
        const response = await responsePromise;

        // Assert - Verify single successful call
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledWith('https://api.example.com/data', undefined);
        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
    });

    test('retries on HTTP 429 with exponential backoff', async () => {
        // Arrange - Mock 429 responses then success
        const rateLimitResponse = new Response('Rate limit exceeded', {
            status: 429,
            statusText: 'Too Many Requests',
        });
        const successResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce(rateLimitResponse)
            .mockResolvedValueOnce(successResponse);

        // Act - Execute fetch with retry
        const responsePromise = fetchWithRetry('https://api.example.com/data');
        
        // Fast-forward through first retry delay (~1000ms with jitter)
        await vi.advanceTimersByTimeAsync(1500);
        const response = await responsePromise;

        // Assert - Verify retry occurred
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
    });

    describe('HTTP status code handling', () => {
        interface RetryCase {
            readonly status: number;
            readonly statusText: string;
            readonly shouldRetry: boolean;
        }

        const statusCases: readonly RetryCase[] = [
            // 5xx errors should retry
            { status: 500, statusText: 'Internal Server Error', shouldRetry: true },
            { status: 502, statusText: 'Bad Gateway', shouldRetry: true },
            { status: 503, statusText: 'Service Unavailable', shouldRetry: true },
            // 4xx client errors should NOT retry
            { status: 400, statusText: 'Bad Request', shouldRetry: false },
            { status: 401, statusText: 'Unauthorized', shouldRetry: false },
            { status: 403, statusText: 'Forbidden', shouldRetry: false },
            { status: 404, statusText: 'Not Found', shouldRetry: false },
        ];

        test.each(statusCases)('HTTP $status $statusText (retry=$shouldRetry)', async ({ status, statusText, shouldRetry }) => {
            // Arrange - Mock error then success
            const errorResponse = new Response(statusText, {
                status,
                statusText,
            });
            const successResponse = new Response('{"status": "ok"}', {
                status: 200,
                statusText: 'OK',
            });
            const fetchSpy = vi.spyOn(global, 'fetch')
                .mockResolvedValueOnce(errorResponse)
                .mockResolvedValueOnce(successResponse);

            // Act - Execute fetch
            const responsePromise = fetchWithRetry('https://api.example.com/data');
            
            if (shouldRetry) {
                await vi.advanceTimersByTimeAsync(1500);
            }
            const response = await responsePromise;

            // Assert
            expect(response.status).toBe(shouldRetry ? 200 : status);
            expect(fetchSpy).toHaveBeenCalledTimes(shouldRetry ? 2 : 1);
        });
    });

    test('uses exponential backoff timing 1s → 2s → 4s', async () => {
        // Arrange - Mock failures then success
        const errorResponse = new Response('Server Error', {
            status: 500,
            statusText: 'Internal Server Error',
        });
        const successResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce(errorResponse)  // Attempt 0 fails
            .mockResolvedValueOnce(errorResponse)  // Attempt 1 fails
            .mockResolvedValueOnce(errorResponse)  // Attempt 2 fails
            .mockResolvedValueOnce(successResponse); // Attempt 3 succeeds

        // Act - Execute fetch with retries
        const responsePromise = fetchWithRetry('https://api.example.com/data');
        
        // First retry: ~1000ms (1s with jitter ±25%)
        await vi.advanceTimersByTimeAsync(1500);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        
        // Second retry: ~2000ms (2s with jitter ±25%)
        await vi.advanceTimersByTimeAsync(2500);
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        
        // Third retry: ~4000ms (4s with jitter ±25%)
        await vi.advanceTimersByTimeAsync(5000);
        expect(fetchSpy).toHaveBeenCalledTimes(4);
        
        const response = await responsePromise;

        // Assert - Verify exponential backoff pattern
        expect(response.status).toBe(200);
    });

    test('throws MaxRetriesExceededError when max retries exceeded', async () => {
        // Arrange - Mock continuous failures
        const errorResponse = new Response('Server Error', {
            status: 500,
            statusText: 'Internal Server Error',
        });
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(errorResponse);

        // Act - Execute fetch expecting failure
        const responsePromise = fetchWithRetry('https://api.example.com/data', {
            retryOptions: { maxRetries: 2 }
        });
        
        // Attach rejection handler immediately to avoid unhandled rejection
        const rejectionPromise = expect(responsePromise).rejects.toThrow(MaxRetriesExceededError);
        
        // Advance through all retry delays
        await vi.advanceTimersByTimeAsync(10000);

        // Assert - Verify MaxRetriesExceededError thrown
        await rejectionPromise;
        await expect(responsePromise).rejects.toThrow(/Maximum retry attempts \(3\) exceeded/);
        expect(fetchSpy).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('uses custom shouldRetry function', async () => {
        // Arrange - Custom retry logic: only retry on 503
        const customShouldRetry = (_error: Error, response?: Response): boolean => {
            return response?.status === 503;
        };
        
        const serviceUnavailable = new Response('Service Unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
        });
        const serverError = new Response('Server Error', {
            status: 500,
            statusText: 'Internal Server Error',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce(serviceUnavailable) // Should retry
            .mockResolvedValueOnce(serverError);       // Should NOT retry (custom logic)

        // Act - Execute with custom shouldRetry
        const responsePromise = fetchWithRetry('https://api.example.com/data', {
            retryOptions: { shouldRetry: customShouldRetry }
        });
        await vi.advanceTimersByTimeAsync(1500);
        const response = await responsePromise;

        // Assert - Verify custom retry logic applied
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(500); // Returns 500 without retrying
    });

    describe('Rate limit header handling', () => {
        test('respects Retry-After header with seconds', async () => {
            // Arrange - 429 response with Retry-After in seconds
            const rateLimitResponse = new Response('Rate limit exceeded', {
                status: 429,
                statusText: 'Too Many Requests',
                headers: { 'retry-after': '5' }, // 5 seconds
            });
            const successResponse = new Response('{"status": "ok"}', {
                status: 200,
                statusText: 'OK',
            });
            const fetchSpy = vi.spyOn(global, 'fetch')
                .mockResolvedValueOnce(rateLimitResponse)
                .mockResolvedValueOnce(successResponse);

            // Act - Execute fetch
            const responsePromise = fetchWithRetry('https://api.example.com/data');
            
            // Should wait ~5000ms as specified in Retry-After
            await vi.advanceTimersByTimeAsync(5100);
            const response = await responsePromise;

            // Assert - Verify Retry-After honored
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            expect(response.status).toBe(200);
        });

        test('respects Retry-After header with HTTP date', async () => {
            // Arrange - 429 response with Retry-After as HTTP date
            const futureDate = new Date(Date.now() + 3000); // 3 seconds from now
            const rateLimitResponse = new Response('Rate limit exceeded', {
                status: 429,
                statusText: 'Too Many Requests',
                headers: { 'retry-after': futureDate.toUTCString() },
            });
            const successResponse = new Response('{"status": "ok"}', {
                status: 200,
                statusText: 'OK',
            });
            const fetchSpy = vi.spyOn(global, 'fetch')
                .mockResolvedValueOnce(rateLimitResponse)
                .mockResolvedValueOnce(successResponse);

            // Act - Execute fetch
            const responsePromise = fetchWithRetry('https://api.example.com/data');
            
            // Should wait ~3000ms as specified in Retry-After date
            await vi.advanceTimersByTimeAsync(3100);
            const response = await responsePromise;

            // Assert - Verify HTTP date Retry-After honored
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            expect(response.status).toBe(200);
        });

        test('respects X-RateLimit-Reset header', async () => {
            // Arrange - 429 response with X-RateLimit-Reset (GitHub API style)
            const futureTimestamp = Math.floor((Date.now() + 4000) / 1000); // 4 seconds from now
            const rateLimitResponse = new Response('Rate limit exceeded', {
                status: 429,
                statusText: 'Too Many Requests',
                headers: { 'x-ratelimit-reset': futureTimestamp.toString() },
            });
            const successResponse = new Response('{"status": "ok"}', {
                status: 200,
                statusText: 'OK',
            });
            const fetchSpy = vi.spyOn(global, 'fetch')
                .mockResolvedValueOnce(rateLimitResponse)
                .mockResolvedValueOnce(successResponse);

            // Act - Execute fetch
            const responsePromise = fetchWithRetry('https://api.example.com/data');
            
            // Should wait ~4000ms as specified in X-RateLimit-Reset
            await vi.advanceTimersByTimeAsync(4100);
            const response = await responsePromise;

            // Assert - Verify X-RateLimit-Reset honored
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            expect(response.status).toBe(200);
        });

        test('caps delay at maxDelayMs even with large Retry-After', async () => {
            // Arrange - 429 response with excessive Retry-After
            const rateLimitResponse = new Response('Rate limit exceeded', {
                status: 429,
                statusText: 'Too Many Requests',
                headers: { 'retry-after': '9999' }, // Exceeds maxDelayMs (30s default)
            });
            const successResponse = new Response('{"status": "ok"}', {
                status: 200,
                statusText: 'OK',
            });
            const fetchSpy = vi.spyOn(global, 'fetch')
                .mockResolvedValueOnce(rateLimitResponse)
                .mockResolvedValueOnce(successResponse);

            // Act - Execute fetch
            const responsePromise = fetchWithRetry('https://api.example.com/data');
            
            // Should wait only ~30000ms (capped), not 9999 seconds
            await vi.advanceTimersByTimeAsync(31000);
            const response = await responsePromise;

            // Assert - Verify cap applied
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            expect(response.status).toBe(200);
        });
    });
});