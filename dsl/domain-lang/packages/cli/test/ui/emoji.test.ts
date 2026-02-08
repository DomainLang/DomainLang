/**
 * Tests for emoji utilities.
 *
 * @module ui/emoji.test
 */
import { describe, test, expect } from 'vitest';
import { EMOJI, getEmoji } from '../../src/ui/themes/emoji.js';

describe('Emoji utilities', () => {
    describe('EMOJI constants', () => {
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

        test('ignores textFallback when emoji exists', () => {
            // Act
            const result = getEmoji('success', '[OK]');

            // Assert
            expect(result).toBe(EMOJI.success);
        });
    });
});
