/**
 * Tests for PackageDownloader service.
 * 
 * Tests cover ref resolution, tarball download, integrity verification,
 * cache integration, event emission, rate limiting, and error handling.
 */

import { describe, test, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { PackageDownloader } from '../../src/services/package-downloader.js';
import type { CredentialProvider, GitHubCredentials } from '../../src/services/credential-provider.js';
import type { PackageCache } from '../../src/services/package-cache.js';
import { createHash } from 'node:crypto';

// Mock fetch globally
globalThis.fetch = vi.fn();

describe('PackageDownloader', () => {
    let downloader: PackageDownloader;
    let mockCredentialProvider: CredentialProvider;
    let mockPackageCache: PackageCache;
    let mockEventCallback: Mock;
    let fetchMock: Mock;

    beforeEach(() => {
        // Arrange - Reset mocks before each test
        vi.clearAllMocks();
        fetchMock = globalThis.fetch as Mock;

        // Create mock credential provider
        mockCredentialProvider = {
            getGitHubCredentials: vi.fn().mockResolvedValue(undefined),
            getAuthorizationHeader: vi.fn().mockReturnValue(undefined),
        } as unknown as CredentialProvider;

        // Create mock package cache
        mockPackageCache = {
            has: vi.fn().mockResolvedValue(false),
            get: vi.fn().mockResolvedValue(undefined),
            put: vi.fn().mockResolvedValue('/cached/path'),
            remove: vi.fn().mockResolvedValue(undefined),
            clear: vi.fn().mockResolvedValue(undefined),
            getMetadata: vi.fn().mockResolvedValue(undefined),
            putMetadata: vi.fn().mockResolvedValue(undefined),
        } as unknown as PackageCache;

        // Create mock event callback
        mockEventCallback = vi.fn();

        // Create downloader instance
        downloader = new PackageDownloader(
            mockCredentialProvider,
            mockPackageCache,
            mockEventCallback
        );
    });

    afterEach(() => {
        // Cleanup to prevent memory leaks
        vi.clearAllMocks();
        fetchMock.mockReset();
    });

    describe('resolveRefToCommit', () => {
        test('should resolve tag to commit SHA', async () => {
            // Arrange - Mock unified /commits/{ref} endpoint
            const expectedSha = 'abc123def456789012345678901234567890abcd';
            fetchMock.mockResolvedValueOnce(
                createMockResponse(200, {
                    sha: expectedSha,
                    commit: { message: 'Release v1.0.0' },
                })
            );

            // Act
            const commitSha = await downloader.resolveRefToCommit('domainlang', 'core', 'v1.0.0');

            // Assert
            expect(commitSha).toBe(expectedSha);
            expect(fetchMock).toHaveBeenCalledWith(
                'https://api.github.com/repos/domainlang/core/commits/v1.0.0',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Accept': 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28',
                    }),
                })
            );
        });

        test('should resolve branch to commit SHA', async () => {
            // Arrange - Unified endpoint resolves branches in one call
            const expectedSha = 'def456abc789012345678901234567890abcdef1';
            fetchMock.mockResolvedValueOnce(
                createMockResponse(200, {
                    sha: expectedSha,
                    commit: { message: 'Latest on main' },
                })
            );

            // Act
            const commitSha = await downloader.resolveRefToCommit('acme', 'patterns', 'main');

            // Assert
            expect(commitSha).toBe(expectedSha);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock).toHaveBeenCalledWith(
                'https://api.github.com/repos/acme/patterns/commits/main',
                expect.any(Object)
            );
        });

        test('should validate commit SHA', async () => {
            // Arrange - Mock GitHub API response for commit validation
            const commitSha = 'abc123def456789012345678901234567890abcd';
            fetchMock.mockResolvedValueOnce(
                createMockResponse(200, {
                    sha: commitSha,
                    commit: { message: 'Test commit' },
                })
            );

            // Act
            const result = await downloader.resolveRefToCommit('owner', 'repo', commitSha);

            // Assert
            expect(result).toBe(commitSha);
            expect(fetchMock).toHaveBeenCalledWith(
                `https://api.github.com/repos/owner/repo/commits/${commitSha}`,
                expect.any(Object)
            );
        });

        test('should throw error when ref cannot be resolved', async () => {
            // Arrange - Unified endpoint returns 404
            fetchMock.mockResolvedValueOnce(createMockResponse(404, { message: 'Not Found' }));

            // Act & Assert
            await expect(
                downloader.resolveRefToCommit('owner', 'repo', 'nonexistent')
            ).rejects.toThrow(/Unable to resolve ref 'nonexistent'/);
        });

        test('should throw error when commit SHA not found', async () => {
            // Arrange - Commit validation fails
            const fakeSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
            fetchMock.mockResolvedValueOnce(createMockResponse(404, { message: 'Not Found' }));

            // Act & Assert
            await expect(
                downloader.resolveRefToCommit('owner', 'repo', fakeSha)
            ).rejects.toThrow(`Commit '${fakeSha}' not found`);
        });
    });

    describe('download', () => {
        test('should download package and compute integrity hash', async () => {
            // Arrange - Create test tarball content
            const tarballContent = Buffer.from('fake tarball content');
            const commitSha = 'abc123def456789012345678901234567890abcd';
            
            // Mock ref resolution (unified /commits/{ref} endpoint)
            fetchMock.mockResolvedValueOnce(
                createMockResponse(200, { sha: commitSha })
            );

            // Mock tarball download
            fetchMock.mockResolvedValueOnce(
                createMockStreamResponse(200, tarballContent, '100')
            );

            // Mock cache miss
            (mockPackageCache.get as Mock).mockResolvedValueOnce(undefined);
            (mockPackageCache.put as Mock).mockResolvedValueOnce('/cache/path');

            // Act
            const result = await downloader.download('domainlang', 'core', 'v1.0.0');

            // Assert - Verify integrity hash format (SRI sha512)
            expect(result.commitSha).toBe(commitSha);
            expect(result.integrity).toMatch(/^sha512-[A-Za-z0-9+/=]+$/);
            expect(result.path).toBe('/cache/path');

            // Verify integrity hash is correct
            const expectedHash = createHash('sha512').update(tarballContent).digest('base64');
            expect(result.integrity).toBe(`sha512-${expectedHash}`);
        });

        test('should return cached package without downloading', async () => {
            // Arrange - Mock ref resolution
            const commitSha = 'abc123def456789012345678901234567890abcd';
            fetchMock.mockResolvedValueOnce(
                createMockResponse(200, { sha: commitSha })
            );

            // Mock cache hit
            (mockPackageCache.get as Mock).mockResolvedValueOnce('/existing/cache/path');
            (mockPackageCache.getMetadata as Mock).mockResolvedValueOnce({
                integrity: 'sha512-test',
                resolved: 'https://api.github.com/repos/domainlang/core/tarball/abc123',
            });

            // Act
            const result = await downloader.download('domainlang', 'core', 'v1.0.0');

            // Assert - No tarball download should occur
            expect(result.commitSha).toBe(commitSha);
            expect(result.path).toBe('/existing/cache/path');
            expect(result.integrity).toBe('sha512-test');
            expect(fetchMock).toHaveBeenCalledTimes(1); // Only ref resolution, no tarball download
        });

        test('should extract tarball to cache', async () => {
            // Arrange
            const tarballContent = Buffer.from('test tarball');
            const commitSha = 'def456abc789012345678901234567890abcdef1';
            
            fetchMock
                .mockResolvedValueOnce(createMockResponse(200, { sha: commitSha }))
                .mockResolvedValueOnce(createMockStreamResponse(200, tarballContent));

            (mockPackageCache.get as Mock).mockResolvedValueOnce(undefined);
            const mockPut = mockPackageCache.put as Mock;
            mockPut.mockResolvedValueOnce('/extracted/path');

            // Act
            await downloader.download('acme', 'models', 'v2.0.0');

            // Assert - Cache put should be called with tarball path
            expect(mockPut).toHaveBeenCalledWith(
                'acme',
                'models',
                commitSha,
                expect.stringContaining('.tar.gz')
            );
        });
    });

    describe('event emission', () => {
        test('should emit resolving event', async () => {
            // Arrange
            const commitSha = 'abc123def456789012345678901234567890abcd';
            fetchMock.mockResolvedValueOnce(
                createMockResponse(200, { sha: commitSha })
            );
            (mockPackageCache.get as Mock).mockResolvedValueOnce('/cached');
            (mockPackageCache.getMetadata as Mock).mockResolvedValueOnce({
                integrity: 'sha512-test',
                resolved: 'https://api.github.com/test',
            });

            // Act
            await downloader.download('owner', 'repo', 'v1.0.0');

            // Assert
            expect(mockEventCallback).toHaveBeenCalledWith({
                type: 'resolving',
                pkg: 'owner/repo',
            });
        });

        test('should emit cached event for cache hit', async () => {
            // Arrange
            const commitSha = 'abc123def456789012345678901234567890abcd';
            fetchMock.mockResolvedValueOnce(
                createMockResponse(200, { sha: commitSha })
            );
            (mockPackageCache.get as Mock).mockResolvedValueOnce('/cached/path');
            (mockPackageCache.getMetadata as Mock).mockResolvedValueOnce({
                integrity: 'sha512-test',
                resolved: 'https://api.github.com/test',
            });

            // Act
            await downloader.download('owner', 'repo', 'main');

            // Assert
            expect(mockEventCallback).toHaveBeenCalledWith({
                type: 'cached',
                pkg: 'owner/repo',
                commit: commitSha,
            });
        });

        test('should emit downloading events with progress', async () => {
            // Arrange
            const tarballContent = Buffer.from('x'.repeat(1000));
            const commitSha = 'abc123def456789012345678901234567890abcd';
            
            fetchMock
                .mockResolvedValueOnce(createMockResponse(200, { sha: commitSha }))
                .mockResolvedValueOnce(createMockStreamResponse(200, tarballContent, '1000'));

            (mockPackageCache.get as Mock).mockResolvedValueOnce(undefined);

            // Act
            await downloader.download('owner', 'repo', 'v1.0.0');

            // Assert - Check for downloading events
            const downloadingEvents = mockEventCallback.mock.calls
                .map((call: unknown[]) => call[0])
                .filter((event: unknown) => {
                    return typeof event === 'object' && event !== null && 'type' in event && event.type === 'downloading';
                });

            expect(downloadingEvents.length).toBeGreaterThan(0);
            expect(downloadingEvents[0]).toMatchObject({
                type: 'downloading',
                pkg: 'owner/repo',
                bytesReceived: expect.any(Number),
            });
        });

        test('should emit extracting event before cache put', async () => {
            // Arrange
            const commitSha = 'abc123def456789012345678901234567890abcd';
            fetchMock
                .mockResolvedValueOnce(createMockResponse(200, { sha: commitSha }))
                .mockResolvedValueOnce(createMockStreamResponse(200, Buffer.from('test')));

            (mockPackageCache.get as Mock).mockResolvedValueOnce(undefined);

            // Act
            await downloader.download('owner', 'repo', 'v1.0.0');

            // Assert
            expect(mockEventCallback).toHaveBeenCalledWith({
                type: 'extracting',
                pkg: 'owner/repo',
            });
        });

        test('should emit complete event with integrity', async () => {
            // Arrange
            const tarballContent = Buffer.from('test content');
            const commitSha = 'abc123def456789012345678901234567890abcd';
            const expectedIntegrity = `sha512-${createHash('sha512').update(tarballContent).digest('base64')}`;

            fetchMock
                .mockResolvedValueOnce(createMockResponse(200, { sha: commitSha }))
                .mockResolvedValueOnce(createMockStreamResponse(200, tarballContent));

            (mockPackageCache.get as Mock).mockResolvedValueOnce(undefined);

            // Act
            await downloader.download('owner', 'repo', 'v1.0.0');

            // Assert
            expect(mockEventCallback).toHaveBeenCalledWith({
                type: 'complete',
                pkg: 'owner/repo',
                commit: commitSha,
                integrity: expectedIntegrity,
            });
        });

        test('should emit error event on download failure', async () => {
            // Arrange - Ref resolution fails (unified endpoint returns 404)
            fetchMock.mockResolvedValueOnce(createMockResponse(404, { message: 'Not Found' }));

            // Act & Assert
            await expect(
                downloader.download('owner', 'repo', 'nonexistent')
            ).rejects.toThrow();

            expect(mockEventCallback).toHaveBeenCalledWith({
                type: 'error',
                pkg: 'owner/repo',
                error: expect.stringContaining('Unable to resolve ref'),
            });
        });

        test('should emit rate-limit event when remaining < 10', async () => {
            // Arrange
            const commitSha = 'abc123def456789012345678901234567890abcd';
            const resetTime = Math.floor(Date.now() / 1000) + 3600;
            
            const responseWithRateLimit = createMockResponse(200, { sha: commitSha });
            responseWithRateLimit.headers.set('x-ratelimit-remaining', '5');
            responseWithRateLimit.headers.set('x-ratelimit-reset', resetTime.toString());
            
            fetchMock.mockResolvedValueOnce(responseWithRateLimit);
            (mockPackageCache.get as Mock).mockResolvedValueOnce('/cached');
            (mockPackageCache.getMetadata as Mock).mockResolvedValueOnce({
                integrity: 'sha512-test',
                resolved: 'https://api.github.com/test',
            });

            // Act
            await downloader.download('owner', 'repo', 'main');

            // Assert
            expect(mockEventCallback).toHaveBeenCalledWith({
                type: 'rate-limit',
                remaining: 5,
                resetAt: expect.any(Date),
            });
        });
    });

    describe('authentication', () => {
        test('should use Bearer token when credentials available', async () => {
            // Arrange
            const credentials: GitHubCredentials = { token: 'ghp_test_token' };
            (mockCredentialProvider.getGitHubCredentials as Mock).mockResolvedValueOnce(credentials);
            (mockCredentialProvider.getAuthorizationHeader as Mock).mockReturnValueOnce('Bearer ghp_test_token');

            fetchMock.mockResolvedValueOnce(
                createMockResponse(200, { sha: 'abc123' })
            );
            (mockPackageCache.get as Mock).mockResolvedValueOnce('/cached');
            (mockPackageCache.getMetadata as Mock).mockResolvedValueOnce({
                integrity: 'sha512-test',
                resolved: 'https://api.github.com/test',
            });

            // Act
            await downloader.download('owner', 'repo', 'main');

            // Assert
            expect(fetchMock).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer ghp_test_token',
                    }),
                })
            );
        });

        test('should handle 401 auth failure with helpful error', async () => {
            // Arrange - Mock 401 response for tag lookup
            fetchMock.mockResolvedValueOnce(createMockResponse(401, { message: 'Unauthorized' }));

            // Act & Assert - Call resolveTag directly which calls fetchGitHub
            await expect(async () => {
                // This will throw during tag resolution
                await downloader.resolveRefToCommit('private-owner', 'private-repo', 'v1.0.0');
            }).rejects.toThrow(/Authentication failed.*private-owner\/private-repo.*HTTP 401/);

            await expect(async () => {
                fetchMock.mockResolvedValueOnce(createMockResponse(401, { message: 'Unauthorized' }));
                await downloader.resolveRefToCommit('private-owner', 'private-repo', 'v1.0.0');
            }).rejects.toThrow(/gh auth login/);
        });

        test('should handle 403 forbidden with helpful error', async () => {
            // Arrange - Mock 403 response for tag lookup
            fetchMock.mockResolvedValueOnce(createMockResponse(403, { message: 'Forbidden' }));

            // Act & Assert
            await expect(async () => {
                await downloader.resolveRefToCommit('owner', 'repo', 'v1.0.0');
            }).rejects.toThrow(/Authentication failed.*HTTP 403/);

            await expect(async () => {
                fetchMock.mockResolvedValueOnce(createMockResponse(403, { message: 'Forbidden' }));
                await downloader.resolveRefToCommit('owner', 'repo', 'v1.0.0');
            }).rejects.toThrow(/GITHUB_TOKEN/);
        });
    });

    describe('error handling', () => {
        test('should handle 404 repository not found', async () => {
            // Arrange
            fetchMock.mockResolvedValueOnce(createMockResponse(404, { message: 'Not Found' }));

            // Act & Assert
            await expect(
                downloader.resolveRefToCommit('owner', 'nonexistent', 'abc123def456789012345678901234567890abcd')
            ).rejects.toThrow(`Commit 'abc123def456789012345678901234567890abcd' not found`);
        });

        test('should handle tarball download failure', async () => {
            // Arrange
            const commitSha = 'abc123def456789012345678901234567890abcd';
            fetchMock
                .mockResolvedValueOnce(createMockResponse(200, { sha: commitSha }))
                // Mock tarball download - return 500 for all retry attempts
                .mockResolvedValue(createMockResponse(500, { message: 'Server Error' }));

            (mockPackageCache.get as Mock).mockResolvedValueOnce(undefined);

            // Act & Assert
            await expect(async () => {
                await downloader.download('owner', 'repo', 'v1.0.0');
            }).rejects.toThrow();  // Will throw MaxRetriesExceededError from fetchWithRetry
        });

        test('should handle null response body', async () => {
            // Arrange
            const commitSha = 'abc123def456789012345678901234567890abcd';
            fetchMock
                .mockResolvedValueOnce(createMockResponse(200, { sha: commitSha }))
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    body: null,
                    headers: new Headers({ 'content-length': '0' }),
                } as Response);

            (mockPackageCache.get as Mock).mockResolvedValueOnce(undefined);

            // Act & Assert
            await expect(
                downloader.download('owner', 'repo', 'v1.0.0')
            ).rejects.toThrow('Response body is null');
        });
    });

    describe('integrity verification', () => {
        test('should compute SHA-512 hash in SRI format', async () => {
            // Arrange - Use known content for hash verification
            const tarballContent = Buffer.from('Hello, DomainLang!');
            const expectedHash = createHash('sha512').update(tarballContent).digest('base64');
            const expectedIntegrity = `sha512-${expectedHash}`;

            const commitSha = 'abc123def456789012345678901234567890abcd';
            fetchMock
                .mockResolvedValueOnce(createMockResponse(200, { sha: commitSha }))
                .mockResolvedValueOnce(createMockStreamResponse(200, tarballContent));

            (mockPackageCache.get as Mock).mockResolvedValueOnce(undefined);

            // Act
            const result = await downloader.download('owner', 'repo', 'v1.0.0');

            // Assert
            expect(result.integrity).toBe(expectedIntegrity);
        });

        test('should compute different hashes for different content', async () => {
            // Arrange - Two different downloads
            const content1 = Buffer.from('content-v1');
            const content2 = Buffer.from('content-v2');
            const commitSha = 'abc123def456789012345678901234567890abcd';

            // First download
            fetchMock
                .mockResolvedValueOnce(createMockResponse(200, { sha: commitSha }))
                .mockResolvedValueOnce(createMockStreamResponse(200, content1));
            (mockPackageCache.get as Mock).mockResolvedValueOnce(undefined);

            // Act
            const result1 = await downloader.download('owner', 'repo1', 'v1.0.0');

            // Second download
            fetchMock
                .mockResolvedValueOnce(createMockResponse(200, { sha: commitSha }))
                .mockResolvedValueOnce(createMockStreamResponse(200, content2));
            (mockPackageCache.get as Mock).mockResolvedValueOnce(undefined);

            const result2 = await downloader.download('owner', 'repo2', 'v1.0.0');

            // Assert - Different content should produce different hashes
            expect(result1.integrity).not.toBe(result2.integrity);
        });
    });
});

/**
 * Create a mock Response object for testing.
 */
function createMockResponse(status: number, data: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        headers: new Headers(),
        json: async () => data,
    } as Response;
}

/**
 * Create a mock streaming Response for tarball downloads.
 */
function createMockStreamResponse(
    status: number,
    content: Buffer,
    contentLength?: string
): Response {
    const headers = new Headers();
    if (contentLength) {
        headers.set('content-length', contentLength);
    }

    // Create ReadableStream from buffer
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(content));
            controller.close();
        },
    });

    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        headers,
        body: stream,
    } as Response;
}
