/**
 * Tests for the Init command component.
 * Tests project scaffolding, file generation, and error handling.
 *
 * @module commands/init.test
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../../src/test-utils/render.js';
import { Init, runInit } from '../../src/commands/init.js';
import type { CommandContext } from '../../src/commands/types.js';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Create a temporary test directory.
 */
function createTempDir(name: string): string {
    const tempPath = resolve(tmpdir(), `dlang-test-${name}-${Date.now()}`);
    mkdirSync(tempPath, { recursive: true });
    return tempPath;
}

/**
 * Clean up test directory.
 */
function cleanupTempDir(path: string): void {
    if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
    }
}

describe('Init command component', () => {
    const defaultContext: CommandContext = {
        mode: 'rich',
        noColor: false,
        cwd: '/test/project',
        version: '0.1.0',
        isFirstRun: false,
    };

    let tempDir: string;
    let originalCwd: string;

    beforeEach(() => {
        vi.clearAllMocks();
        originalCwd = process.cwd();
        tempDir = createTempDir('init');
        process.chdir(tempDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        cleanupTempDir(tempDir);
        vi.restoreAllMocks();
    });

    describe('loading state', () => {
        it('shows spinner while creating project', () => {
            const { lastFrame } = render(
                <Init targetDir="my-project" context={defaultContext} autoExit={false} />,
            );
            const output = lastFrame();
            expect(output).toContain('Creating project');
        });
    });

    describe('component structure', () => {
        it('renders loading message for provided target directory', () => {
            // Arrange & Act
            const { lastFrame } = render(
                <Init targetDir="test-project" context={defaultContext} autoExit={false} />,
            );

            // Assert
            const output = lastFrame() ?? '';
            expect(output).toContain('Creating project');
        });
    });
});

describe('Init file generation', () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(() => {
        originalCwd = process.cwd();
        tempDir = createTempDir('gen');
        process.chdir(tempDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        cleanupTempDir(tempDir);
    });

    describe('file creation', () => {
        it('creates model.yaml with correct content', async () => {
            const context: CommandContext = {
                mode: 'quiet',
                noColor: false,
                cwd: tempDir,
                version: '0.1.0',
                isFirstRun: false,
            };
            const targetDir = 'new-project';
            const targetPath = resolve(tempDir, targetDir);

            try {
                await runInit(targetDir, true, context);
            } catch {
                // Ignore process.exit
            }

            const modelPath = resolve(targetPath, 'model.yaml');
            expect(existsSync(modelPath)).toBe(true);

            const content = readFileSync(modelPath, 'utf-8');
            expect(content).toContain('model:');
            expect(content).toContain('name: new-project');
            expect(content).toContain('version: 0.1.0');
            expect(content).toContain('entry: index.dlang');
        });

        it('creates index.dlang from template', async () => {
            const context: CommandContext = {
                mode: 'quiet',
                noColor: false,
                cwd: tempDir,
                version: '0.1.0',
                isFirstRun: false,
            };
            const targetDir = 'test-project';
            const targetPath = resolve(tempDir, targetDir);

            try {
                await runInit(targetDir, true, context);
            } catch {
                // Ignore process.exit
            }

            const indexPath = resolve(targetPath, 'index.dlang');
            expect(existsSync(indexPath)).toBe(true);

            const content = readFileSync(indexPath, 'utf-8');
            expect(content).toContain('test-project');
        });

        it('creates .gitignore from template', async () => {
            const context: CommandContext = {
                mode: 'quiet',
                noColor: false,
                cwd: tempDir,
                version: '0.1.0',
                isFirstRun: false,
            };
            const targetDir = 'ignore-project';
            const targetPath = resolve(tempDir, targetDir);

            try {
                await runInit(targetDir, true, context);
            } catch {
                // Ignore process.exit
            }

            const gitignorePath = resolve(targetPath, '.gitignore');
            expect(existsSync(gitignorePath)).toBe(true);

            const content = readFileSync(gitignorePath, 'utf-8');
            expect(content).toContain('.dlang/');
        });

        it('creates domains directory with .gitkeep', async () => {
            const context: CommandContext = {
                mode: 'quiet',
                noColor: false,
                cwd: tempDir,
                version: '0.1.0',
                isFirstRun: false,
            };
            const targetDir = 'dir-project';
            const targetPath = resolve(tempDir, targetDir);

            try {
                await runInit(targetDir, true, context);
            } catch {
                // Ignore process.exit
            }

            expect(existsSync(resolve(targetPath, 'domains/.gitkeep'))).toBe(true);
        });
    });

    describe('model.yaml structure', () => {
        it('generates correct YAML structure with paths and dependencies', async () => {
            const context: CommandContext = {
                mode: 'quiet',
                noColor: false,
                cwd: tempDir,
                version: '0.1.0',
                isFirstRun: false,
            };
            const targetDir = 'yaml-test';
            const targetPath = resolve(tempDir, targetDir);

            try {
                await runInit(targetDir, true, context);
            } catch {
                // Ignore process.exit
            }

            const modelPath = resolve(targetPath, 'model.yaml');
            const content = readFileSync(modelPath, 'utf-8');

            expect(content).toContain('model:');
            expect(content).toContain('paths:');
            expect(content).toContain('dependencies:');
        });
    });

    describe('error handling', () => {
        it('errors when directory already exists', async () => {
            // Arrange
            const targetDir = 'existing-dir';
            mkdirSync(resolve(tempDir, targetDir), { recursive: true });
            const context: CommandContext = {
                mode: 'quiet',
                noColor: false,
                cwd: tempDir,
                version: '0.1.0',
                isFirstRun: false,
            };

            const mockStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
            const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('process.exit');
            });

            try {
                // Act
                await runInit(targetDir, true, context);
            } catch {
                // process.exit throws
            }

            // Assert
            expect(mockStderr).toHaveBeenCalled();
            expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Directory already exists'));
            expect(mockExit).toHaveBeenCalledWith(1);
            mockStderr.mockRestore();
            mockExit.mockRestore();
        });

        it('errors when model.yaml already exists in current directory', async () => {
            // Arrange
            writeFileSync(resolve(tempDir, 'model.yaml'), 'existing content', 'utf-8');
            const context: CommandContext = {
                mode: 'quiet',
                noColor: false,
                cwd: tempDir,
                version: '0.1.0',
                isFirstRun: false,
            };

            const mockStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
            const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('process.exit');
            });

            try {
                // Act
                await runInit(undefined, true, context);
            } catch {
                // process.exit throws
            }

            // Assert
            expect(mockStderr).toHaveBeenCalled();
            expect(mockStderr).toHaveBeenCalledWith(expect.stringContaining('Project already initialized'));
            expect(mockExit).toHaveBeenCalledWith(1);
            mockStderr.mockRestore();
            mockExit.mockRestore();
        });
    });
});

describe('Init JSON mode', () => {
    let tempDir: string;
    let originalCwd: string;
    let mockExit: any;
    let mockStdout: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called');
        });
        mockStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        originalCwd = process.cwd();
        tempDir = createTempDir('json');
        process.chdir(tempDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        cleanupTempDir(tempDir);
        mockStdout.mockRestore();
        mockExit.mockRestore();
    });

    it('outputs JSON format with --json flag', async () => {
        // Arrange
        const context: CommandContext = {
            mode: 'json',
            noColor: false,
            cwd: tempDir,
            version: '0.1.0',
            isFirstRun: false,
        };

        try {
            // Act
            await runInit('json-project', true, context);
        } catch {
            // process.exit throws in test environment
        }

        // Assert
        const output = mockStdout.mock.calls.map(call => String(call[0])).join('');
        const jsonLine = output.split('\n').find(line => line.trim().startsWith('{'));
        expect(jsonLine).toBeDefined();
        const payload = JSON.parse(jsonLine ?? '{}') as { success: boolean; projectPath: string; files: string[] };
        expect(payload.success).toBe(true);
        expect(payload.projectPath).toContain('json-project');
        expect(payload.files).toEqual(expect.arrayContaining(['model.yaml', 'index.dlang', '.gitignore']));
    });
});

describe('Init quiet mode', () => {
    let tempDir: string;
    let originalCwd: string;
    let mockExit: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called');
        });
        vi.spyOn(console, 'log').mockImplementation(() => {});
        originalCwd = process.cwd();
        tempDir = createTempDir('quiet');
        process.chdir(tempDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        cleanupTempDir(tempDir);
        vi.restoreAllMocks();
    });

    it('outputs minimal text with --quiet flag', async () => {
        // Arrange
        const mockStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const context: CommandContext = {
            mode: 'quiet',
            noColor: false,
            cwd: tempDir,
            version: '0.1.0',
            isFirstRun: false,
        };

        try {
            // Act
            await runInit('quiet-project', true, context);
        } catch {
            // process.exit throws in test environment
        }

        // Assert
        expect(mockStdout).toHaveBeenCalledWith('Project created successfully\n');
        expect(mockExit).toHaveBeenCalled();
        mockStdout.mockRestore();
    });
});
