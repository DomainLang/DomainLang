/**
 * Tests for ASCII art utilities.
 *
 * @module ui/AsciiArt.test
 */
import { describe, test, expect } from 'vitest';
import {
    getAsciiArt,
    getBannerContext,
    ASCII_LOGO_WIDE,
    ASCII_WORDMARK_WIDE,
    ASCII_LOGO_MEDIUM,
    ASCII_WORDMARK_MEDIUM,
    ASCII_LOGO_NARROW,
    ASCII_WORDMARK_NARROW,
} from '../../src/ui/components/AsciiArt.js';

describe('AsciiArt utilities', () => {
    describe('getAsciiArt', () => {
        test('returns wide logo for terminals >= 100 columns', () => {
            // Arrange
            const width = 120;

            // Act
            const result = getAsciiArt(width);

            // Assert
            expect(result.logo).toBe(ASCII_LOGO_WIDE);
            expect(result.wordmark).toBe(ASCII_WORDMARK_WIDE);
        });

        test('returns medium logo for terminals 60-99 columns', () => {
            // Arrange
            const width = 80;

            // Act
            const result = getAsciiArt(width);

            // Assert
            expect(result.logo).toBe(ASCII_LOGO_MEDIUM);
            expect(result.wordmark).toBe(ASCII_WORDMARK_MEDIUM);
        });

        test('returns narrow logo for terminals < 60 columns', () => {
            // Arrange
            const width = 40;

            // Act
            const result = getAsciiArt(width);

            // Assert
            expect(result.logo).toBe(ASCII_LOGO_NARROW);
            expect(result.wordmark).toBe(ASCII_WORDMARK_NARROW);
        });

        test('returns wide logo at exact boundary of 100', () => {
            // Arrange
            const width = 100;

            // Act
            const result = getAsciiArt(width);

            // Assert
            expect(result.logo).toBe(ASCII_LOGO_WIDE);
        });

        test('returns medium logo at exact boundary of 60', () => {
            // Arrange
            const width = 60;

            // Act
            const result = getAsciiArt(width);

            // Assert
            expect(result.logo).toBe(ASCII_LOGO_MEDIUM);
        });
    });

    describe('getBannerContext', () => {
        test('returns first-run when isFirstRun is true', () => {
            // Arrange / Act
            const result = getBannerContext('validate', true);

            // Assert
            expect(result).toBe('first-run');
        });

        test('returns help for undefined command', () => {
            // Arrange / Act
            const result = getBannerContext(undefined, false);

            // Assert
            expect(result).toBe('help');
        });

        test('returns help for help command', () => {
            // Arrange / Act
            const result = getBannerContext('help', false);

            // Assert
            expect(result).toBe('help');
        });

        test('returns help for --help flag', () => {
            // Arrange / Act
            const result = getBannerContext('--help', false);

            // Assert
            expect(result).toBe('help');
        });

        test('returns help for -h flag', () => {
            // Arrange / Act
            const result = getBannerContext('-h', false);

            // Assert
            expect(result).toBe('help');
        });

        test('returns init for init command', () => {
            // Arrange / Act
            const result = getBannerContext('init', false);

            // Assert
            expect(result).toBe('init');
        });

        test('returns none for regular commands', () => {
            // Arrange / Act
            const result = getBannerContext('validate', false);

            // Assert
            expect(result).toBe('none');
        });

        test('prioritizes first-run over any command', () => {
            // Arrange / Act
            const result = getBannerContext('init', true);

            // Assert
            expect(result).toBe('first-run');
        });
    });
});
