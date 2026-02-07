/**
 * Tests for the Help command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../../src/test-utils/render.js';
import { Help, runHelp } from '../../src/commands/help.js';
import type { CommandContext } from '../../src/commands/types.js';

// Mock stdout.write for non-rich modes
const originalWrite = process.stdout.write;
const originalExit = process.exit;
let stdoutOutput: string;

beforeEach(() => {
    stdoutOutput = '';
    process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
        stdoutOutput += typeof chunk === 'string' ? chunk : chunk.toString();
        return true;
    }) as typeof process.stdout.write;
    process.exit = vi.fn() as unknown as typeof process.exit;
});

afterEach(() => {
    process.stdout.write = originalWrite;
    process.exit = originalExit;
});

describe('Help command', () => {
    it('renders rich help output', () => {
        // Arrange
        const context: CommandContext = {
            version: '1.0.0',
            isFirstRun: false,
            mode: 'rich',
            noColor: false,
            cwd: '/test/project',
        };

        // Act
        const { lastFrame } = render(
            <Help context={context} />,
            80,
        );

        // Assert
        expect(lastFrame()).toMatchSnapshot();
    });

    it('outputs JSON help when mode is json', () => {
        // Arrange
        const context: CommandContext = {
            version: '1.0.0',
            isFirstRun: false,
            mode: 'json',
            noColor: false,
            cwd: '/test/project',
        };

        // Act
        runHelp(context);

        // Assert
        const output = JSON.parse(stdoutOutput);
        expect(output.version).toBe('1.0.0');
        expect(output.commands).toBeInstanceOf(Array);
        expect(output.options).toBeInstanceOf(Array);
    });

    it('outputs minimal help when mode is quiet', () => {
        // Arrange
        const context: CommandContext = {
            version: '2.0.0',
            isFirstRun: false,
            mode: 'quiet',
            noColor: false,
            cwd: '/test/project',
        };

        // Act
        runHelp(context);

        // Assert
        expect(stdoutOutput).toContain('dlang v2.0.0');
        expect(stdoutOutput).toContain('Commands:');
    });
});
