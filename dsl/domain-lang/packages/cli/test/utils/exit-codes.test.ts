/**
 * Tests for exit code utilities.
 *
 * @module utils/exit-codes.test
 */
import { describe, test, expect } from 'vitest';
import { EXIT, getExitCodeDescription } from '../../src/utils/exit-codes.js';

describe('Exit code utilities', () => {
    describe('getExitCodeDescription', () => {
        test.each([
            [EXIT.SUCCESS, 'Success'],
            [EXIT.VALIDATION_ERROR, 'Validation failed'],
            [EXIT.FILE_NOT_FOUND, 'File not found'],
            [EXIT.PARSE_ERROR, 'Syntax error'],
            [EXIT.CONFIG_ERROR, 'Configuration error'],
            [EXIT.NETWORK_ERROR, 'Network error'],
            [EXIT.UNKNOWN_COMMAND, 'Unknown command'],
        ])('describes exit code %i as %s', (code, expected) => {
            // Act
            const result = getExitCodeDescription(code);

            // Assert
            expect(result).toBe(expected);
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
