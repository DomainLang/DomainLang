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

    test('retries on HTTP 500 server error', async () => {
        // Arrange - Mock 500 then success
        const errorResponse = new Response('Internal Server Error', {
            status: 500,
            statusText: 'Internal Server Error',
        });
        const successResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce(errorResponse)
            .mockResolvedValueOnce(successResponse);

        // Act - Execute fetch with retry
        const responsePromise = fetchWithRetry('https://api.example.com/data');
        await vi.advanceTimersByTimeAsync(1500);
        const response = await responsePromise;

        // Assert - Verify retry on 5xx
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
    });

    test('retries on HTTP 502 bad gateway', async () => {
        // Arrange - Mock 502 then success
        const errorResponse = new Response('Bad Gateway', {
            status: 502,
            statusText: 'Bad Gateway',
        });
        const successResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce(errorResponse)
            .mockResolvedValueOnce(successResponse);

        // Act - Execute fetch with retry
        const responsePromise = fetchWithRetry('https://api.example.com/data');
        await vi.advanceTimersByTimeAsync(1500);
        const response = await responsePromise;

        // Assert - Verify retry on 502
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
    });

    test('retries on HTTP 503 service unavailable', async () => {
        // Arrange - Mock 503 then success
        const errorResponse = new Response('Service Unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
        });
        const successResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce(errorResponse)
            .mockResolvedValueOnce(successResponse);

        // Act - Execute fetch with retry
        const responsePromise = fetchWithRetry('https://api.example.com/data');
        await vi.advanceTimersByTimeAsync(1500);
        const response = await responsePromise;

        // Assert - Verify retry on 503
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
    });

    test('does not retry on HTTP 400 bad request', async () => {
        // Arrange - Mock 400 response
        const badRequestResponse = new Response('Bad Request', {
            status: 400,
            statusText: 'Bad Request',
        });
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(badRequestResponse);

        // Act - Execute fetch (should not retry)
        const response = await fetchWithRetry('https://api.example.com/data');

        // Assert - Verify single call, no retry
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(400);
    });

    test('does not retry on HTTP 401 unauthorized', async () => {
        // Arrange - Mock 401 response
        const unauthorizedResponse = new Response('Unauthorized', {
            status: 401,
            statusText: 'Unauthorized',
        });
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(unauthorizedResponse);

        // Act - Execute fetch (should not retry)
        const response = await fetchWithRetry('https://api.example.com/data');

        // Assert - Verify single call, no retry on auth failure
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(401);
    });

    test('does not retry on HTTP 403 forbidden', async () => {
        // Arrange - Mock 403 response
        const forbiddenResponse = new Response('Forbidden', {
            status: 403,
            statusText: 'Forbidden',
        });
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(forbiddenResponse);

        // Act - Execute fetch (should not retry)
        const response = await fetchWithRetry('https://api.example.com/data');

        // Assert - Verify single call, no retry on forbidden
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(403);
    });

    test('does not retry on HTTP 404 not found', async () => {
        // Arrange - Mock 404 response
        const notFoundResponse = new Response('Not Found', {
            status: 404,
            statusText: 'Not Found',
        });
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(notFoundResponse);

        // Act - Execute fetch (should not retry)
        const response = await fetchWithRetry('https://api.example.com/data');

        // Assert - Verify single call, no retry on not found
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(404);
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

        // Act - Execute fetch with custom maxDelayMs
        const responsePromise = fetchWithRetry('https://api.example.com/data', {
            retryOptions: { maxDelayMs: 5000 } // Cap at 5 seconds
        });
        
        // Should wait ~5000ms (capped), not 9999s
        await vi.advanceTimersByTimeAsync(5100);
        const response = await responsePromise;

        // Assert - Verify maxDelayMs cap applied
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
    });

    test('retries on network error ECONNRESET', async () => {
        // Arrange - Simulate connection reset error
        const networkError = new Error('fetch failed: ECONNRESET');
        const successResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockRejectedValueOnce(networkError)
            .mockResolvedValueOnce(successResponse);

        // Act - Execute fetch with retry
        const responsePromise = fetchWithRetry('https://api.example.com/data');
        await vi.advanceTimersByTimeAsync(1500);
        const response = await responsePromise;

        // Assert - Verify retry on network error
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
    });

    test('retries on network error ETIMEDOUT', async () => {
        // Arrange - Simulate timeout error
        const timeoutError = new Error('fetch failed: ETIMEDOUT');
        const successResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockRejectedValueOnce(timeoutError)
            .mockResolvedValueOnce(successResponse);

        // Act - Execute fetch with retry
        const responsePromise = fetchWithRetry('https://api.example.com/data');
        await vi.advanceTimersByTimeAsync(1500);
        const response = await responsePromise;

        // Assert - Verify retry on timeout
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
    });

    test('retries on network error ENOTFOUND', async () => {
        // Arrange - Simulate DNS resolution error
        const dnsError = new Error('fetch failed: ENOTFOUND');
        const successResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockRejectedValueOnce(dnsError)
            .mockResolvedValueOnce(successResponse);

        // Act - Execute fetch with retry
        const responsePromise = fetchWithRetry('https://api.example.com/data');
        await vi.advanceTimersByTimeAsync(1500);
        const response = await responsePromise;

        // Assert - Verify retry on DNS error
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
    });

    test('does not retry on non-network error', async () => {
        // Arrange - Non-retryable error
        const typeError = new TypeError('Invalid URL');
        const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValueOnce(typeError);

        // Act & Assert - Should throw immediately without retry
        await expect(fetchWithRetry('https://api.example.com/data')).rejects.toThrow(TypeError);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('uses custom maxRetries configuration', async () => {
        // Arrange - Configure 5 max retries
        const errorResponse = new Response('Server Error', {
            status: 500,
            statusText: 'Internal Server Error',
        });
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(errorResponse);

        // Act - Execute with custom maxRetries
        const responsePromise = fetchWithRetry('https://api.example.com/data', {
            retryOptions: { maxRetries: 5 }
        });
        
        // Attach rejection handler immediately to avoid unhandled rejection
        const rejectionPromise = expect(responsePromise).rejects.toThrow(MaxRetriesExceededError);
        
        await vi.advanceTimersByTimeAsync(40000); // Advance through all retries

        // Assert - Verify 6 total attempts (initial + 5 retries)
        await rejectionPromise;
        expect(fetchSpy).toHaveBeenCalledTimes(6);
    });

    test('uses custom initialDelayMs configuration', async () => {
        // Arrange - Configure 500ms initial delay
        const errorResponse = new Response('Server Error', {
            status: 500,
            statusText: 'Internal Server Error',
        });
        const successResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce(errorResponse)
            .mockResolvedValueOnce(successResponse);

        // Act - Execute with custom initialDelayMs
        const responsePromise = fetchWithRetry('https://api.example.com/data', {
            retryOptions: { initialDelayMs: 500 }
        });
        
        // Should retry after ~500ms instead of default 1000ms
        await vi.advanceTimersByTimeAsync(750);
        const response = await responsePromise;

        // Assert - Verify custom initial delay used
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
    });

    test('passes fetch options through to underlying fetch', async () => {
        // Arrange - Mock successful fetch with custom options
        const mockResponse = new Response('{"status": "ok"}', { status: 200 });
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);
        const customHeaders = { 'Authorization': 'Bearer token123' };

        // Act - Execute fetch with custom headers
        await fetchWithRetry('https://api.example.com/data', {
            method: 'POST',
            headers: customHeaders,
            body: '{"key": "value"}'
        });

        // Assert - Verify options passed to fetch
        expect(fetchSpy).toHaveBeenCalledWith('https://api.example.com/data', {
            method: 'POST',
            headers: customHeaders,
            body: '{"key": "value"}'
        });
    });

    test('handles successful response on final retry attempt', async () => {
        // Arrange - Fail exactly maxRetries times, then succeed
        const errorResponse = new Response('Server Error', {
            status: 500,
            statusText: 'Internal Server Error',
        });
        const successResponse = new Response('{"status": "ok"}', {
            status: 200,
            statusText: 'OK',
        });
        const fetchSpy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce(errorResponse)  // Attempt 0
            .mockResolvedValueOnce(errorResponse)  // Attempt 1
            .mockResolvedValueOnce(errorResponse)  // Attempt 2
            .mockResolvedValueOnce(successResponse); // Attempt 3 (final)

        // Act - Execute with maxRetries: 3
        const responsePromise = fetchWithRetry('https://api.example.com/data', {
            retryOptions: { maxRetries: 3 }
        });
        await vi.advanceTimersByTimeAsync(15000); // Advance through all delays
        const response = await responsePromise;

        // Assert - Verify success on final attempt
        expect(fetchSpy).toHaveBeenCalledTimes(4);
        expect(response.status).toBe(200);
    });
});
