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
        test.each([
            { width: 120, expectedLogo: ASCII_LOGO_WIDE,   expectedWordmark: ASCII_WORDMARK_WIDE,   tier: 'wide (>= 100)' },
            { width: 100, expectedLogo: ASCII_LOGO_WIDE,   expectedWordmark: ASCII_WORDMARK_WIDE,   tier: 'wide boundary (= 100)' },
            { width: 80,  expectedLogo: ASCII_LOGO_MEDIUM, expectedWordmark: ASCII_WORDMARK_MEDIUM, tier: 'medium (60-99)' },
            { width: 60,  expectedLogo: ASCII_LOGO_MEDIUM, expectedWordmark: ASCII_WORDMARK_MEDIUM, tier: 'medium boundary (= 60)' },
            { width: 40,  expectedLogo: ASCII_LOGO_NARROW, expectedWordmark: ASCII_WORDMARK_NARROW, tier: 'narrow (< 60)' },
        ])('returns $tier logo for width=$width', ({ width, expectedLogo, expectedWordmark }) => {
            // Act
            const result = getAsciiArt(width);

            // Assert
            expect(result.logo).toBe(expectedLogo);
            expect(result.wordmark).toBe(expectedWordmark);
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

        test.each(['help', '--help', '-h'])('returns help for %s', (cmd) => {
            // Act / Assert
            expect(getBannerContext(cmd, false)).toBe('help');
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
