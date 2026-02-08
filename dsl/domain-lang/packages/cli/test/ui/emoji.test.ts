/**
 * Tests for emoji utilities.
 *
 * @module ui/emoji.test
 */
import { describe, test, expect } from 'vitest';
import { EMOJI, getEmoji } from '../../src/ui/themes/emoji.js';

describe('Emoji utilities', () => {
    describe('EMOJI constants', () => {
        test('contains standard status emoji', () => {
            // Assert
            expect(EMOJI.success).toBeDefined();
            expect(EMOJI.error).toBeDefined();
            expect(EMOJI.warning).toBeDefined();
            expect(EMOJI.info).toBeDefined();
        });

        test('all emoji have trailing space', () => {
            // Assert
            for (const value of Object.values(EMOJI)) {
                expect(value).toMatch(/\s$/);
            }
        });
    });

    describe('getEmoji', () => {
        test('returns emoji for valid key', () => {
            // Act
            const result = getEmoji('success');

            // Assert
            expect(result).toBe(EMOJI.success);
        });

        test('returns emoji for different keys', () => {
            // Act / Assert
            expect(getEmoji('error')).toBe(EMOJI.error);
            expect(getEmoji('rocket')).toBe(EMOJI.rocket);
            expect(getEmoji('package')).toBe(EMOJI.package);
        });

        test('ignores textFallback when emoji exists', () => {
            // Act
            const result = getEmoji('success', '[OK]');

            // Assert
            expect(result).toBe(EMOJI.success);
        });
    });
});
