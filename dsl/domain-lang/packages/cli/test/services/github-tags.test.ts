/**
 * Tests for GitHub tag utilities.
 *
 * @module services/github-tags.test
 */
import { describe, test, expect } from 'vitest';
import { findLatestVersion, classifyUpgrade } from '../../src/services/github-tags.js';

describe('GitHub tag utilities', () => {
    describe('findLatestVersion', () => {
        test('finds the highest semver tag', () => {
            // Arrange
            const tags = ['v0.1.0', 'v0.2.0', 'v1.0.0', 'v0.9.0'];

            // Act
            const result = findLatestVersion(tags);

            // Assert
            expect(result).toBe('v1.0.0');
        });

        test('handles tags without v prefix', () => {
            // Arrange
            const tags = ['1.0.0', '2.0.0', '1.5.0'];

            // Act
            const result = findLatestVersion(tags);

            // Assert
            expect(result).toBe('2.0.0');
        });

        test('ignores non-semver tags', () => {
            // Arrange
            const tags = ['latest', 'nightly', 'v1.0.0', 'beta'];

            // Act
            const result = findLatestVersion(tags);

            // Assert
            expect(result).toBe('v1.0.0');
        });

        test('returns null when no semver tags exist', () => {
            // Arrange
            const tags = ['latest', 'nightly', 'beta'];

            // Act
            const result = findLatestVersion(tags);

            // Assert
            expect(result).toBeNull();
        });

        test('returns null for empty tag list', () => {
            // Arrange
            const tags: string[] = [];

            // Act
            const result = findLatestVersion(tags);

            // Assert
            expect(result).toBeNull();
        });

        test('handles mixed v-prefix and non-prefix tags', () => {
            // Arrange
            const tags = ['v1.0.0', '2.0.0', 'v0.5.0'];

            // Act
            const result = findLatestVersion(tags);

            // Assert
            expect(result).toBe('2.0.0');
        });

        test('correctly compares patch versions', () => {
            // Arrange
            const tags = ['v1.0.0', 'v1.0.1', 'v1.0.2'];

            // Act
            const result = findLatestVersion(tags);

            // Assert
            expect(result).toBe('v1.0.2');
        });
    });

    describe('classifyUpgrade', () => {
        test('classifies major upgrade', () => {
            // Arrange
            const current = 'v1.0.0';
            const latest = 'v2.0.0';

            // Act
            const result = classifyUpgrade(current, latest);

            // Assert
            expect(result).toBe('major');
        });

        test('classifies minor upgrade', () => {
            // Arrange
            const current = 'v1.0.0';
            const latest = 'v1.2.0';

            // Act
            const result = classifyUpgrade(current, latest);

            // Assert
            expect(result).toBe('minor');
        });

        test('classifies patch upgrade', () => {
            // Arrange
            const current = 'v1.0.0';
            const latest = 'v1.0.3';

            // Act
            const result = classifyUpgrade(current, latest);

            // Assert
            expect(result).toBe('patch');
        });

        test('handles versions without v prefix', () => {
            // Arrange
            const current = '1.0.0';
            const latest = '2.0.0';

            // Act
            const result = classifyUpgrade(current, latest);

            // Assert
            expect(result).toBe('major');
        });

        test('classifies same version as patch', () => {
            // Arrange
            const current = 'v1.0.0';
            const latest = 'v1.0.0';

            // Act
            const result = classifyUpgrade(current, latest);

            // Assert
            expect(result).toBe('patch');
        });
    });
});
