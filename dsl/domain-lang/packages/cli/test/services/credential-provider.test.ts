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
            interface EnvPriorityCase {
                readonly name: string;
                readonly dlangToken?: string;
                readonly githubToken?: string;
                readonly expectedToken?: string;
            }

            const envCases: readonly EnvPriorityCase[] = [
                {
                    name: 'returns DLANG_GITHUB_TOKEN when set (highest priority)',
                    dlangToken: 'dlang_token_123',
                    githubToken: 'github_token_456',
                    expectedToken: 'dlang_token_123',
                },
                {
                    name: 'returns GITHUB_TOKEN when DLANG_GITHUB_TOKEN not set',
                    githubToken: 'github_token_456',
                    expectedToken: 'github_token_456',
                },
            ];

            test.each(envCases)('$name', async ({ dlangToken, githubToken, expectedToken }) => {
                // Arrange
                if (dlangToken) process.env['DLANG_GITHUB_TOKEN'] = dlangToken;
                else delete process.env['DLANG_GITHUB_TOKEN'];
                if (githubToken) process.env['GITHUB_TOKEN'] = githubToken;
                else delete process.env['GITHUB_TOKEN'];

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toEqual({ token: expectedToken });
                expect(mockExecFileAsync).not.toHaveBeenCalled();
            });
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

        describe('git credential fill parsing', () => {
            beforeEach(() => {
                // Arrange - Ensure no env vars interfere
                delete process.env['DLANG_GITHUB_TOKEN'];
                delete process.env['GITHUB_TOKEN'];
            });

            interface ParseCase {
                readonly name: string;
                readonly stdout: string;
                readonly expected: { username: string; password: string } | undefined;
            }

            const parseCases: readonly ParseCase[] = [
                {
                    name: 'parses username and password from git credential output',
                    stdout: 'username=myuser\npassword=mytoken\n', // NOSONAR
                    expected: { username: 'myuser', password: 'mytoken' }, // NOSONAR
                },
                {
                    name: 'handles passwords with equals signs correctly',
                    stdout: 'username=user\npassword=pass=with=equals\n', // NOSONAR
                    expected: { username: 'user', password: 'pass=with=equals' }, // NOSONAR
                },
                {
                    name: 'returns undefined when git credential returns incomplete data',
                    stdout: 'username=onlyuser\n',
                    expected: undefined,
                },
                {
                    name: 'returns undefined when git credential returns empty output',
                    stdout: '',
                    expected: undefined,
                },
            ];

            test.each(parseCases)('$name', async ({ stdout, expected }) => {
                // Arrange
                mockExecFileAsync.mockResolvedValue({ stdout, stderr: '' });

                // Act
                const result = await provider.getGitHubCredentials('github.com');

                // Assert
                expect(result).toEqual(expected);
            });
        });

        test('uses correct host parameter for git credential query', async () => {
            // Arrange
            delete process.env['DLANG_GITHUB_TOKEN'];
            delete process.env['GITHUB_TOKEN'];
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

        describe('error handling', () => {
            beforeEach(() => {
                // Arrange - Ensure no env vars interfere
                delete process.env['DLANG_GITHUB_TOKEN'];
                delete process.env['GITHUB_TOKEN'];
            });

            interface ErrorCase {
                readonly name: string;
                readonly error: Error;
                readonly shouldLog: boolean;
            }

            const errorCases: readonly ErrorCase[] = [
                {
                    name: 'git is not installed',
                    error: (() => {
                        const err = new Error('Command failed: git credential fill');
                        (err as NodeJS.ErrnoException).code = 'ENOENT';
                        return err;
                    })(),
                    shouldLog: false, // ENOENT is silently handled
                },
                {
                    name: 'git credential helper fails',
                    error: new Error('git credential helper failed'),
                    shouldLog: false, // Errors are silently handled
                },
                {
                    name: 'timeout occurs',
                    error: new Error('Command timed out after 5000ms'),
                    shouldLog: false, // Errors are silently handled
                },
            ];

            test.each(errorCases)('returns undefined silently when $name', async ({ error }) => {
                // Arrange
                mockExecFileAsync.mockRejectedValue(error);
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
            interface BasicAuthCase {
                readonly name: string;
                readonly username?: string;
                readonly password?: string; // NOSONAR
                readonly expectedHeader: string | undefined;
            }

            const basicAuthCases: readonly BasicAuthCase[] = [
                {
                    name: 'returns Basic header for username/password credentials',
                    username: 'testuser',
                    password: 'testpass', // NOSONAR
                    expectedHeader: 'Basic ' + Buffer.from('testuser:testpass').toString('base64'),
                },
                {
                    name: 'handles special characters in username and password',
                    username: 'user@example.com',
                    password: 'p@ss:w0rd!', // NOSONAR
                    expectedHeader: 'Basic ' + Buffer.from('user@example.com:p@ss:w0rd!').toString('base64'),
                },
                {
                    name: 'returns undefined when only username is present',
                    username: 'testuser',
                    expectedHeader: undefined,
                },
                {
                    name: 'returns undefined when only password is present',
                    password: 'testpass', // NOSONAR
                    expectedHeader: undefined,
                },
            ];

            test.each(basicAuthCases)('$name', ({ username, password, expectedHeader }) => {
                // Arrange
                const credentials: any = {};
                if (username !== undefined) credentials.username = username;
                if (password !== undefined) credentials.password = password;

                // Act
                const result = provider.getAuthorizationHeader(credentials);

                // Assert
                expect(result).toBe(expectedHeader);
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