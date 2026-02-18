import { describe, test, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// Create mock function at module level
const mockExecFileAsync = vi.fn();

// Mock both child_process and util before any imports
vi.mock('node:child_process', () => ({
    execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
    promisify: () => mockExecFileAsync,
}));

// Import after mocks are set up
let CredentialProvider: any;

beforeAll(async () => {
    ({ CredentialProvider } = await import('../../src/services/credential-provider.js'));
});

describe('CredentialProvider', () => {
    let provider: any;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        // Arrange - Save original environment and create fresh provider
        originalEnv = { ...process.env };
        provider = new CredentialProvider();
        mockExecFileAsync.mockReset();
    });

    afterEach(() => {
        // Clean up - Restore original environment
        process.env = originalEnv;
    });

    describe('getGitHubCredentials', () => {
        describe('environment variable priority', () => {
            test('returns DLANG_GITHUB_TOKEN when set (highest priority)', async () => {
                // Arrange
                process.env['DLANG_GITHUB_TOKEN'] = 'dlang_token_123';
                process.env['GITHUB_TOKEN'] = 'github_token_456';

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toEqual({ token: 'dlang_token_123' });
                expect(mockExecFileAsync).not.toHaveBeenCalled();
            });

            test('returns GITHUB_TOKEN when DLANG_GITHUB_TOKEN not set', async () => {
                // Arrange
                delete process.env['DLANG_GITHUB_TOKEN'];
                process.env['GITHUB_TOKEN'] = 'github_token_456';

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toEqual({ token: 'github_token_456' });
                expect(mockExecFileAsync).not.toHaveBeenCalled();
            });

            test('falls back to git credential fill when no env vars set', async () => {
                // Arrange
                delete process.env['DLANG_GITHUB_TOKEN'];
                delete process.env['GITHUB_TOKEN'];
                mockExecFileAsync.mockResolvedValue({
                    stdout: 'username=testuser\npassword=testpass\n', // NOSONAR
                    stderr: '',
                });

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toEqual({
                    username: 'testuser',
                    password: 'testpass', // NOSONAR
                });
                expect(mockExecFileAsync).toHaveBeenCalledWith(
                    'git',
                    ['credential', 'fill'],
                    expect.objectContaining({
                        input: 'protocol=https\nhost=github.com\n\n',
                        encoding: 'utf8',
                        timeout: 5000,
                        env: expect.objectContaining({
                            GIT_TERMINAL_PROMPT: '0',
                        }),
                    })
                );
            });
        });

        describe('git credential fill parsing', () => {
            beforeEach(() => {
                // Arrange - Ensure no env vars interfere
                delete process.env['DLANG_GITHUB_TOKEN'];
                delete process.env['GITHUB_TOKEN'];
            });

            test('parses username and password from git credential output', async () => {
                // Arrange
                mockExecFileAsync.mockResolvedValue({
                    stdout: 'username=myuser\npassword=mytoken\n', // NOSONAR
                    stderr: '',
                });

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toEqual({
                    username: 'myuser',
                    password: 'mytoken', // NOSONAR
                });
            });

            test('handles passwords with equals signs correctly', async () => {
                // Arrange
                mockExecFileAsync.mockResolvedValue({
                    stdout: 'username=user\npassword=pass=with=equals\n', // NOSONAR
                    stderr: '',
                });

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toEqual({
                    username: 'user',
                    password: 'pass=with=equals', // NOSONAR
                });
            });

            test('returns undefined when git credential returns incomplete data', async () => {
                // Arrange
                mockExecFileAsync.mockResolvedValue({
                    stdout: 'username=onlyuser\n',
                    stderr: '',
                });

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toBeUndefined();
            });

            test('returns undefined when git credential returns empty output', async () => {
                // Arrange
                mockExecFileAsync.mockResolvedValue({
                    stdout: '',
                    stderr: '',
                });

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toBeUndefined();
            });

            test('uses correct host parameter for git credential query', async () => {
                // Arrange
                mockExecFileAsync.mockResolvedValue({
                    stdout: 'username=user\npassword=pass\n', // NOSONAR
                    stderr: '',
                });

                // Act
                await provider.getGitHubCredentials('gitlab.com');

                // Assert
                expect(mockExecFileAsync).toHaveBeenCalledWith(
                    'git',
                    ['credential', 'fill'],
                    expect.objectContaining({
                        input: 'protocol=https\nhost=gitlab.com\n\n',
                    })
                );
            });
        });

        describe('error handling', () => {
            beforeEach(() => {
                // Arrange - Ensure no env vars interfere
                delete process.env['DLANG_GITHUB_TOKEN'];
                delete process.env['GITHUB_TOKEN'];
            });

            test('returns undefined gracefully when git is not installed', async () => {
                // Arrange
                const notFoundError = new Error('Command failed: git credential fill');
                (notFoundError as NodeJS.ErrnoException).code = 'ENOENT';
                mockExecFileAsync.mockRejectedValue(notFoundError);

                // Suppress console.warn for this test
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toBeUndefined();
                expect(warnSpy).not.toHaveBeenCalled(); // ENOENT is silently handled

                warnSpy.mockRestore();
            });

            test('returns undefined silently when git credential fails', async () => {
                // Arrange
                mockExecFileAsync.mockRejectedValue(new Error('git credential helper failed'));

                // Suppress console.warn for this test
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toBeUndefined();
                expect(warnSpy).not.toHaveBeenCalled(); // Errors are silently handled

                warnSpy.mockRestore();
            });

            test('returns undefined silently on timeout', async () => {
                // Arrange
                const timeoutError = new Error('Command timed out after 5000ms');
                mockExecFileAsync.mockRejectedValue(timeoutError);

                // Suppress console.warn for this test
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toBeUndefined();
                expect(warnSpy).not.toHaveBeenCalled(); // Errors are silently handled

                warnSpy.mockRestore();
            });
        });

        describe('credential caching', () => {
            beforeEach(() => {
                delete process.env['DLANG_GITHUB_TOKEN'];
                delete process.env['GITHUB_TOKEN'];
            });

            test('caches git credentials and avoids repeated subprocess calls', async () => {
                // Arrange
                mockExecFileAsync.mockResolvedValue({
                    stdout: 'username=user\npassword=token123\n', // NOSONAR
                    stderr: '',
                });

                // Act - call twice
                const result1 = await provider.getGitHubCredentials('github.com');
                const result2 = await provider.getGitHubCredentials('github.com');

                // Assert - subprocess called only once, both return same value
                expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
                expect(result1).toEqual({ username: 'user', password: 'token123' }); // NOSONAR
                expect(result2).toEqual({ username: 'user', password: 'token123' }); // NOSONAR
            });

            test('caches undefined result to avoid retrying failed lookups', async () => {
                // Arrange - git credential fails
                mockExecFileAsync.mockRejectedValue(new Error('helper failed'));

                // Act - call twice
                const result1 = await provider.getGitHubCredentials('github.com');
                const result2 = await provider.getGitHubCredentials('github.com');

                // Assert - subprocess called only once, both return undefined
                expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
                expect(result1).toBeUndefined();
                expect(result2).toBeUndefined();
            });
        });
    });

    describe('getAuthorizationHeader', () => {
        describe('token authentication (Bearer)', () => {
            test('returns Bearer header for token credentials', () => {
                // Arrange
                const credentials = { token: 'ghp_abc123xyz' };

                // Act
                const result = provider.getAuthorizationHeader(credentials);

                // Assert
                expect(result).toBe('Bearer ghp_abc123xyz');
            });

            test('prefers token over username/password when both present', () => {
                // Arrange
                const credentials = {
                    token: 'ghp_token',
                    username: 'user',
                    password: 'pass', // NOSONAR
                };

                // Act
                const result = provider.getAuthorizationHeader(credentials);

                // Assert
                expect(result).toBe('Bearer ghp_token');
            });
        });

        describe('basic authentication', () => {
            test('returns Basic header for username/password credentials', () => {
                // Arrange
                const credentials = { username: 'testuser', password: 'testpass' }; // NOSONAR

                // Act
                const result = provider.getAuthorizationHeader(credentials);

                // Assert
                const expected = 'Basic ' + Buffer.from('testuser:testpass').toString('base64');
                expect(result).toBe(expected);
            });

            test('handles special characters in username and password', () => {
                // Arrange
                const credentials = { username: 'user@example.com', password: 'p@ss:w0rd!' }; // NOSONAR

                // Act
                const result = provider.getAuthorizationHeader(credentials);

                // Assert
                const expected = 'Basic ' + Buffer.from('user@example.com:p@ss:w0rd!').toString('base64');
                expect(result).toBe(expected);
            });

            test('returns undefined when only username is present', () => {
                // Arrange
                const credentials = { username: 'testuser' };

                // Act
                const result = provider.getAuthorizationHeader(credentials);

                // Assert
                expect(result).toBeUndefined();
            });

            test('returns undefined when only password is present', () => {
                // Arrange
                const credentials = { password: 'testpass' }; // NOSONAR

                // Act
                const result = provider.getAuthorizationHeader(credentials);

                // Assert
                expect(result).toBeUndefined();
            });
        });

        describe('edge cases', () => {
            test('returns undefined for undefined credentials', () => {
                // Arrange
                const credentials = undefined;

                // Act
                const result = provider.getAuthorizationHeader(credentials);

                // Assert
                expect(result).toBeUndefined();
            });

            test('returns undefined for empty credentials object', () => {
                // Arrange
                const credentials = {};

                // Act
                const result = provider.getAuthorizationHeader(credentials);

                // Assert
                expect(result).toBeUndefined();
            });
        });
    });
});
