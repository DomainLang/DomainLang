/**
 * Tests for output mode utilities.
 *
 * @module utils/output-mode.test
 */
import { describe, test, expect, afterEach, vi } from 'vitest';
import {
    parseOutputConfig,
    shouldUseInk,
    shouldUseColors,
    shouldUseEmoji,
    stripOutputFlags,
} from '../../src/utils/output-mode.js';

describe('Output mode utilities', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    describe('parseOutputConfig', () => {
        test('defaults to rich mode with colors', () => {
            // Arrange
            const args: string[] = [];

            // Act
            const config = parseOutputConfig(args);

            // Assert
            expect(config.mode).toBe('rich');
            expect(config.noColor).toBe(false);
        });

        test('detects --json flag', () => {
            // Arrange
            const args = ['validate', '--json', 'model.dlang'];

            // Act
            const config = parseOutputConfig(args);

            // Assert
            expect(config.mode).toBe('json');
        });

        test('detects --quiet flag', () => {
            // Arrange
            const args = ['validate', '--quiet'];

            // Act
            const config = parseOutputConfig(args);

            // Assert
            expect(config.mode).toBe('quiet');
        });

        test('detects -q short flag', () => {
            // Arrange
            const args = ['-q', 'validate'];

            // Act
            const config = parseOutputConfig(args);

            // Assert
            expect(config.mode).toBe('quiet');
        });

        test('detects --no-color flag', () => {
            // Arrange
            const args = ['validate', '--no-color'];

            // Act
            const config = parseOutputConfig(args);

            // Assert
            expect(config.noColor).toBe(true);
        });

        test('detects NO_COLOR environment variable', () => {
            // Arrange
            vi.stubEnv('NO_COLOR', '1');
            const args: string[] = [];

            // Act
            const config = parseOutputConfig(args);

            // Assert
            expect(config.noColor).toBe(true);
        });

        test('detects TERM=dumb environment', () => {
            // Arrange
            vi.stubEnv('TERM', 'dumb');
            const args: string[] = [];

            // Act
            const config = parseOutputConfig(args);

            // Assert
            expect(config.noColor).toBe(true);
        });

        test('includes cwd in config', () => {
            // Arrange
            const args: string[] = [];

            // Act
            const config = parseOutputConfig(args);

            // Assert
            expect(config.cwd).toBe(process.cwd());
        });
    });

    describe('shouldUseInk', () => {
        test.each([
            { mode: 'rich' as const, expected: true },
            { mode: 'json' as const, expected: false },
            { mode: 'quiet' as const, expected: false },
        ])('returns $expected for $mode mode', ({ mode, expected }) => {
            // Arrange
            const config = { mode, noColor: false, cwd: '/test' };

            // Act / Assert
            expect(shouldUseInk(config)).toBe(expected);
        });
    });

    describe('shouldUseColors', () => {
        test.each([
            { mode: 'rich' as const, noColor: false, expected: true },
            { mode: 'rich' as const, noColor: true, expected: false },
            { mode: 'json' as const, noColor: false, expected: false },
        ])('returns $expected for $mode mode (noColor=$noColor)', ({ mode, noColor, expected }) => {
            // Arrange
            const config = { mode, noColor, cwd: '/test' };

            // Act / Assert
            expect(shouldUseColors(config)).toBe(expected);
        });
    });

    describe('shouldUseEmoji', () => {
        test.each([
            { mode: 'rich' as const, expected: true },
            { mode: 'quiet' as const, expected: false },
        ])('returns $expected for $mode mode', ({ mode, expected }) => {
            // Arrange
            const config = { mode, noColor: false, cwd: '/test' };

            // Act / Assert
            expect(shouldUseEmoji(config)).toBe(expected);
        });
    });

    describe('stripOutputFlags', () => {
        test.each([
            { args: ['validate', '--json', 'file.dlang'], expected: ['validate', 'file.dlang'], label: '--json' },
            { args: ['--quiet', 'validate'], expected: ['validate'], label: '--quiet' },
            { args: ['-q', 'install'], expected: ['install'], label: '-q' },
            { args: ['validate', '--no-color', 'file.dlang'], expected: ['validate', 'file.dlang'], label: '--no-color' },
        ])('removes $label flag', ({ args, expected }) => {
            // Act / Assert
            expect(stripOutputFlags(args)).toEqual(expected);
        });

        test('removes multiple output flags', () => {
            // Arrange
            const args = ['--json', '--no-color', 'validate'];

            // Act
            const result = stripOutputFlags(args);

            // Assert
            expect(result).toEqual(['validate']);
        });

        test('preserves non-output flags', () => {
            // Arrange
            const args = ['validate', '--verbose', 'file.dlang'];

            // Act
            const result = stripOutputFlags(args);

            // Assert
            expect(result).toEqual(['validate', '--verbose', 'file.dlang']);
        });
    });
});
