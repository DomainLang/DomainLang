/**
 * Tests for exit code utilities.
 *
 * @module utils/exit-codes.test
 */
import { describe, test, expect } from 'vitest';
import { EXIT, getExitCodeDescription } from '../../src/utils/exit-codes.js';

describe('Exit code utilities', () => {
    describe('EXIT constants', () => {
        test('defines standard exit codes', () => {
            // Assert
            expect(EXIT.SUCCESS).toBe(0);
            expect(EXIT.VALIDATION_ERROR).toBe(1);
            expect(EXIT.FILE_NOT_FOUND).toBe(2);
            expect(EXIT.PARSE_ERROR).toBe(3);
            expect(EXIT.CONFIG_ERROR).toBe(4);
            expect(EXIT.NETWORK_ERROR).toBe(10);
            expect(EXIT.UNKNOWN_COMMAND).toBe(127);
        });
    });

    describe('getExitCodeDescription', () => {
        test('describes SUCCESS', () => {
            // Act
            const result = getExitCodeDescription(EXIT.SUCCESS);

            // Assert
            expect(result).toBe('Success');
        });

        test('describes VALIDATION_ERROR', () => {
            // Act
            const result = getExitCodeDescription(EXIT.VALIDATION_ERROR);

            // Assert
            expect(result).toBe('Validation failed');
        });

        test('describes FILE_NOT_FOUND', () => {
            // Act
            const result = getExitCodeDescription(EXIT.FILE_NOT_FOUND);

            // Assert
            expect(result).toBe('File not found');
        });

        test('describes PARSE_ERROR', () => {
            // Act
            const result = getExitCodeDescription(EXIT.PARSE_ERROR);

            // Assert
            expect(result).toBe('Syntax error');
        });

        test('describes CONFIG_ERROR', () => {
            // Act
            const result = getExitCodeDescription(EXIT.CONFIG_ERROR);

            // Assert
            expect(result).toBe('Configuration error');
        });

        test('describes NETWORK_ERROR', () => {
            // Act
            const result = getExitCodeDescription(EXIT.NETWORK_ERROR);

            // Assert
            expect(result).toBe('Network error');
        });

        test('describes UNKNOWN_COMMAND', () => {
            // Act
            const result = getExitCodeDescription(EXIT.UNKNOWN_COMMAND);

            // Assert
            expect(result).toBe('Unknown command');
        });

        test('returns Unknown error for unrecognized code', () => {
            // Arrange
            const unknownCode = 99 as never;

            // Act
            const result = getExitCodeDescription(unknownCode);

            // Assert
            expect(result).toBe('Unknown error');
        });
    });
});
