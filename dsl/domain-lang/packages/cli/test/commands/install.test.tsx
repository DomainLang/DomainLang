/**
 * Tests for the Install command component.
 * Tests loading states, success scenarios, frozen mode, force mode, and error handling.
 *
 * @module commands/install.test
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, flushAsync } from '../../src/test-utils/render.js';
import { Install, runInstall } from '../../src/commands/install.js';
import type { CommandContext } from '../../src/commands/types.js';
import { InstallService, FrozenMismatchError, IntegrityError } from '../../src/services/install-service.js';

// Mock InstallService - Vitest v4 requires wrapping class in vi.fn()
vi.mock('../../src/services/install-service.js', () => ({
    InstallService: vi.fn(class {
        install = vi.fn();
    }),
    FrozenMismatchError: class FrozenMismatchError extends Error {
        constructor(
            public readonly added: string[],
            public readonly removed: string[],
            public readonly changed: Array<{ pkg: string; manifestRef: string; lockRef: string }>
        ) {
            super('Lock file is out of sync');
            this.name = 'FrozenMismatchError';
        }
    },
    IntegrityError: class IntegrityError extends Error {
        constructor(
            public readonly pkg: string,
            public readonly expected: string,
            public readonly actual: string
        ) {
            super(`Integrity check failed for '${pkg}'`);
            this.name = 'IntegrityError';
        }
    },
}));

describe('Install command', () => {
    const defaultContext: CommandContext = {
        mode: 'rich',
        noColor: false,
        cwd: '/test/project',
        version: '0.1.0',
        isFirstRun: false,
    };

    let mockInstall: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup mock install method - Vitest v4 pattern
        mockInstall = vi.fn();
        const MockInstallService = vi.mocked(InstallService);
        MockInstallService.mockImplementation(class {
            install = mockInstall;
        } as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loading state', () => {
        it('shows spinner while installing', () => {
            // Arrange
            mockInstall.mockReturnValue(new Promise(() => {})); // Never resolves

            // Act
            const { lastFrame } = render(
                <Install options={{}} context={defaultContext} />,
            );

            // Assert - should show loading spinner
            const output = lastFrame();
            expect(output).toContain('Resolving dependencies');
        });
    });

    describe('success scenarios', () => {
        it('displays success banner with package count', async () => {
            // Arrange
            mockInstall.mockResolvedValue({
                installed: 2,
                cached: 1,
                lockFileModified: true,
                warnings: [],
            });

            // Act
            const { lastFrame } = render(
                <Install options={{}} context={defaultContext} />,
            );
            await flushAsync(); // Ignore exit call

            // Assert
            const output = lastFrame();
            expect(output).toContain('3 packages installed successfully');
        });

        it('shows correct summary data', async () => {
            // Arrange
            mockInstall.mockResolvedValue({
                installed: 2,
                cached: 1,
                lockFileModified: true,
                warnings: [],
            });

            // Act
            const { lastFrame } = render(
                <Install options={{}} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain('3 installed, 1 cached');
            expect(output).toContain('model.lock updated');
            expect(output).toContain('SHA-512 verified');
        });

        it('displays warnings when present', async () => {
            // Arrange
            mockInstall.mockResolvedValue({
                installed: 1,
                cached: 0,
                lockFileModified: true,
                warnings: [
                    "Dependency 'acme/lib' has no integrity hash (legacy lock file)"
                ],
            });

            // Act
            const { lastFrame } = render(
                <Install options={{}} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain('Warnings (1)');
            expect(output).toContain('has no integrity hash');
        });

        it('handles cache hits correctly', async () => {
            // Arrange
            mockInstall.mockResolvedValue({
                installed: 0,
                cached: 3,
                lockFileModified: false,
                warnings: [],
            });

            // Act
            const { lastFrame } = render(
                <Install options={{}} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain('3 packages installed successfully');
            expect(output).toContain('3 installed, 3 cached');
            expect(output).toContain('model.lock unchanged');
        });
    });

    describe('frozen mode', () => {
        it('accepts frozen flag', () => {
            // Arrange
            mockInstall.mockReturnValue(new Promise(() => {}));

            // Act
            render(
                <Install options={{ frozen: true }} context={defaultContext} />,
            );

            // Assert - should call service with frozen option
            expect(mockInstall).toHaveBeenCalledWith(
                expect.objectContaining({ frozen: true })
            );
        });

        it('displays frozen mismatch error with added packages', async () => {
            // Arrange
            const error = new FrozenMismatchError(
                ['acme/new-lib@v1.0.0'],
                [],
                []
            );
            mockInstall.mockRejectedValue(error);

            // Act
            const { lastFrame } = render(
                <Install options={{ frozen: true }} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain('Lock file is out of sync');
            expect(output).toContain('Added in manifest');
            expect(output).toContain('acme/new-lib@v1.0.0');
        });

        it('displays frozen mismatch error with removed packages', async () => {
            // Arrange
            const error = new FrozenMismatchError(
                [],
                ['acme/old-lib'],
                []
            );
            mockInstall.mockRejectedValue(error);

            // Act
            const { lastFrame } = render(
                <Install options={{ frozen: true }} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain('Removed from manifest');
            expect(output).toContain('acme/old-lib');
        });

        it('displays frozen mismatch error with changed refs', async () => {
            // Arrange
            const error = new FrozenMismatchError(
                [],
                [],
                [{ pkg: 'acme/lib', manifestRef: 'v2.0.0', lockRef: 'v1.0.0' }]
            );
            mockInstall.mockRejectedValue(error);

            // Act
            const { lastFrame } = render(
                <Install options={{ frozen: true }} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain('Changed refs');
            expect(output).toContain('acme/lib');
            expect(output).toContain('v1.0.0 → v2.0.0');
        });

        it('shows helpful hint for frozen mode errors', async () => {
            // Arrange
            const error = new FrozenMismatchError(['acme/lib@v1.0.0'], [], []);
            mockInstall.mockRejectedValue(error);

            // Act
            const { lastFrame } = render(
                <Install options={{ frozen: true }} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain("Run 'dlang install' without --frozen");
        });
    });

    describe('force mode', () => {
        it('accepts force flag', () => {
            // Arrange
            mockInstall.mockReturnValue(new Promise(() => {}));

            // Act
            render(
                <Install options={{ force: true }} context={defaultContext} />,
            );

            // Assert - should call service with force option
            expect(mockInstall).toHaveBeenCalledWith(
                expect.objectContaining({ force: true })
            );
        });
    });

    describe('integrity errors', () => {
        it('displays integrity error with package details', async () => {
            // Arrange
            const error = new IntegrityError(
                'acme/lib',
                'sha512-abc123...',
                'sha512-def456...'
            );
            mockInstall.mockRejectedValue(error);

            // Act
            const { lastFrame } = render(
                <Install options={{}} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain('Integrity verification failed');
            expect(output).toContain('acme/lib');
            expect(output).toContain('sha512-abc123');
            expect(output).toContain('sha512-def456');
        });

        it('shows helpful hints for integrity errors', async () => {
            // Arrange
            const error = new IntegrityError(
                'acme/lib',
                'sha512-abc',
                'sha512-def'
            );
            mockInstall.mockRejectedValue(error);

            // Act
            const { lastFrame } = render(
                <Install options={{}} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain('corrupted cache');
            expect(output).toContain('dlang cache-clear');
        });
    });

    describe('error handling', () => {
        it('displays generic error messages', async () => {
            // Arrange
            mockInstall.mockRejectedValue(new Error('No model.yaml found'));

            // Act
            const { lastFrame } = render(
                <Install options={{}} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain('No model.yaml found');
        });

        it('shows helpful hint for generic errors', async () => {
            // Arrange
            mockInstall.mockRejectedValue(new Error('Something went wrong'));

            // Act
            const { lastFrame } = render(
                <Install options={{}} context={defaultContext} />,
            );
            await flushAsync();

            // Assert
            const output = lastFrame();
            expect(output).toContain('Check that model.yaml exists');
        });
    });

    describe('JSON output mode', () => {
        const jsonContext: CommandContext = {
            ...defaultContext,
            mode: 'json',
        };

        it('outputs JSON for successful installation', async () => {
            // Arrange
            const writeStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('exit');
            });
            mockInstall.mockResolvedValue({
                installed: 2,
                cached: 1,
                lockFileModified: true,
                warnings: [],
            });

            // Act
            try {
                await runInstall({}, jsonContext);
            } catch { /* expected: process.exit throws */ }

            // Assert
            expect(writeStdout).toHaveBeenCalledWith(
                expect.stringContaining('"success":true')
            );
            expect(writeStdout).toHaveBeenCalledWith(
                expect.stringContaining('"installed":2')
            );
            expect(exit).toHaveBeenCalledWith(0);

            writeStdout.mockRestore();
            exit.mockRestore();
        });

        it('outputs JSON for frozen mode errors', async () => {
            // Arrange
            const writeStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('exit');
            });
            const error = new FrozenMismatchError(['acme/lib@v1.0.0'], [], []);
            mockInstall.mockRejectedValue(error);

            // Act
            try {
                await runInstall({ frozen: true }, jsonContext);
            } catch { /* expected: process.exit throws */ }

            // Assert
            expect(writeStdout).toHaveBeenCalledWith(
                expect.stringContaining('"success":false')
            );
            expect(writeStdout).toHaveBeenCalledWith(
                expect.stringContaining('Lock file out of sync')
            );
            expect(exit).toHaveBeenCalledWith(1);

            writeStdout.mockRestore();
            exit.mockRestore();
        });

        it('outputs JSON for integrity errors', async () => {
            // Arrange
            const writeStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('exit');
            });
            const error = new IntegrityError('acme/lib', 'sha512-abc', 'sha512-def');
            mockInstall.mockRejectedValue(error);

            // Act
            try {
                await runInstall({}, jsonContext);
            } catch { /* expected: process.exit throws */ }

            // Assert
            expect(writeStdout).toHaveBeenCalledWith(
                expect.stringContaining('"success":false')
            );
            expect(writeStdout).toHaveBeenCalledWith(
                expect.stringContaining('Integrity verification failed')
            );
            expect(exit).toHaveBeenCalledWith(1);

            writeStdout.mockRestore();
            exit.mockRestore();
        });
    });

    describe('quiet output mode', () => {
        const quietContext: CommandContext = {
            ...defaultContext,
            mode: 'quiet',
        };

        it('outputs minimal text for successful installation', async () => {
            // Arrange
            const writeStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('exit');
            });
            mockInstall.mockResolvedValue({
                installed: 2,
                cached: 1,
                lockFileModified: true,
                warnings: [],
            });

            // Act
            try {
                await runInstall({}, quietContext);
            } catch { /* expected: process.exit throws */ }

            // Assert
            expect(writeStdout).toHaveBeenCalledWith('Installed 2 packages (1 from cache)\n');
            expect(exit).toHaveBeenCalledWith(0);

            writeStdout.mockRestore();
            exit.mockRestore();
        });

        it('outputs errors to stderr in quiet mode', async () => {
            // Arrange
            const writeStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
            const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('exit');
            });
            mockInstall.mockRejectedValue(new Error('No model.yaml found'));

            // Act
            try {
                await runInstall({}, quietContext);
            } catch { /* expected: process.exit throws */ }

            // Assert
            expect(writeStderr).toHaveBeenCalledWith('No model.yaml found\n');
            expect(exit).toHaveBeenCalledWith(1);

            writeStderr.mockRestore();
            exit.mockRestore();
        });
    });

    describe('component structure', () => {
        it('renders with correct props', () => {
            // Arrange
            mockInstall.mockReturnValue(new Promise(() => {}));
            const options = { frozen: false, force: false };

            // Act
            const { lastFrame } = render(
                <Install options={options} context={defaultContext} />,
            );

            // Assert - component renders without error
            expect(lastFrame()).toBeDefined();
        });
    });
});

describe('runInstall function', () => {
    const defaultContext: CommandContext = {
        mode: 'quiet',
        noColor: false,
        cwd: '/test/project',
        version: '0.1.0',
        isFirstRun: false,
    };

    let mockInstall: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup mock InstallService - Vitest v4 requires class pattern
        mockInstall = vi.fn();
        const MockInstallService = vi.mocked(InstallService);
        MockInstallService.mockImplementation(class {
            install = mockInstall;
        } as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('calls InstallService with correct options', async () => {
        // Arrange
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('exit');
        });
        mockInstall.mockResolvedValue({
            installed: 1,
            cached: 0,
            lockFileModified: true,
            warnings: [],
        });

        // Act
        try {
            await runInstall({ frozen: true, force: false }, defaultContext);
        } catch { /* expected: process.exit throws */ }

        // Assert
        expect(mockInstall).toHaveBeenCalledWith(
            expect.objectContaining({
                frozen: true,
                force: false,
                workspaceRoot: '/test/project',
            })
        );

        exit.mockRestore();
    });

    it('handles success in JSON mode', async () => {
        // Arrange
        const writeStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('exit');
        });
        mockInstall.mockResolvedValue({
            installed: 1,
            cached: 0,
            lockFileModified: true,
            warnings: [],
        });

        // Act
        try {
            await runInstall({}, { ...defaultContext, mode: 'json' });
        } catch { /* expected: process.exit throws */ }

        // Assert
        expect(writeStdout).toHaveBeenCalledWith(
            expect.stringContaining('"success":true')
        );
        expect(exit).toHaveBeenCalledWith(0);

        writeStdout.mockRestore();
        exit.mockRestore();
    });

    it('handles errors in JSON mode', async () => {
        // Arrange
        const writeStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('exit');
        });
        mockInstall.mockRejectedValue(new Error('Test error'));

        // Act
        try {
            await runInstall({}, { ...defaultContext, mode: 'json' });
        } catch { /* expected: process.exit throws */ }

        // Assert
        expect(writeStdout).toHaveBeenCalledWith(
            expect.stringContaining('"success":false')
        );
        expect(writeStdout).toHaveBeenCalledWith(
            expect.stringContaining('Test error')
        );
        expect(exit).toHaveBeenCalledWith(1);

        writeStdout.mockRestore();
        exit.mockRestore();
    });
});
