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
        test('returns true for rich mode', () => {
            // Arrange
            const config = { mode: 'rich' as const, noColor: false, cwd: '/test' };

            // Act
            const result = shouldUseInk(config);

            // Assert
            expect(result).toBe(true);
        });

        test('returns false for json mode', () => {
            // Arrange
            const config = { mode: 'json' as const, noColor: false, cwd: '/test' };

            // Act
            const result = shouldUseInk(config);

            // Assert
            expect(result).toBe(false);
        });

        test('returns false for quiet mode', () => {
            // Arrange
            const config = { mode: 'quiet' as const, noColor: false, cwd: '/test' };

            // Act
            const result = shouldUseInk(config);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('shouldUseColors', () => {
        test('returns true for rich mode without no-color', () => {
            // Arrange
            const config = { mode: 'rich' as const, noColor: false, cwd: '/test' };

            // Act
            const result = shouldUseColors(config);

            // Assert
            expect(result).toBe(true);
        });

        test('returns false for rich mode with no-color', () => {
            // Arrange
            const config = { mode: 'rich' as const, noColor: true, cwd: '/test' };

            // Act
            const result = shouldUseColors(config);

            // Assert
            expect(result).toBe(false);
        });

        test('returns false for json mode', () => {
            // Arrange
            const config = { mode: 'json' as const, noColor: false, cwd: '/test' };

            // Act
            const result = shouldUseColors(config);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('shouldUseEmoji', () => {
        test('returns true for rich mode', () => {
            // Arrange
            const config = { mode: 'rich' as const, noColor: false, cwd: '/test' };

            // Act
            const result = shouldUseEmoji(config);

            // Assert
            expect(result).toBe(true);
        });

        test('returns false for quiet mode', () => {
            // Arrange
            const config = { mode: 'quiet' as const, noColor: false, cwd: '/test' };

            // Act
            const result = shouldUseEmoji(config);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('stripOutputFlags', () => {
        test('removes --json flag', () => {
            // Arrange
            const args = ['validate', '--json', 'file.dlang'];

            // Act
            const result = stripOutputFlags(args);

            // Assert
            expect(result).toEqual(['validate', 'file.dlang']);
        });

        test('removes --quiet flag', () => {
            // Arrange
            const args = ['--quiet', 'validate'];

            // Act
            const result = stripOutputFlags(args);

            // Assert
            expect(result).toEqual(['validate']);
        });

        test('removes -q flag', () => {
            // Arrange
            const args = ['-q', 'install'];

            // Act
            const result = stripOutputFlags(args);

            // Assert
            expect(result).toEqual(['install']);
        });

        test('removes --no-color flag', () => {
            // Arrange
            const args = ['validate', '--no-color', 'file.dlang'];

            // Act
            const result = stripOutputFlags(args);

            // Assert
            expect(result).toEqual(['validate', 'file.dlang']);
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
