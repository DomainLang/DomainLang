/**
 * Tests for GitHub tag utilities.
 *
 * @module services/github-tags.test
 */
import { describe, test, expect } from 'vitest';
import { findLatestVersion, classifyUpgrade } from '../../src/services/github-tags.js';

describe('GitHub tag utilities', () => {
    describe('findLatestVersion', () => {
        interface FindLatestVersionCase {
            readonly name: string;
            readonly tags: string[];
            readonly expected: string | null;
        }

        const findLatestVersionCases: readonly FindLatestVersionCase[] = [
            {
                name: 'finds the highest semver tag',
                tags: ['v0.1.0', 'v0.2.0', 'v1.0.0', 'v0.9.0'],
                expected: 'v1.0.0',
            },
            {
                name: 'handles tags without v prefix',
                tags: ['1.0.0', '2.0.0', '1.5.0'],
                expected: '2.0.0',
            },
            {
                name: 'ignores non-semver tags',
                tags: ['latest', 'nightly', 'v1.0.0', 'beta'],
                expected: 'v1.0.0',
            },
            {
                name: 'returns null when no semver tags exist',
                tags: ['latest', 'nightly', 'beta'],
                expected: null,
            },
            {
                name: 'returns null for empty tag list',
                tags: [],
                expected: null,
            },
            {
                name: 'handles mixed v-prefix and non-prefix tags',
                tags: ['v1.0.0', '2.0.0', 'v0.5.0'],
                expected: '2.0.0',
            },
            {
                name: 'correctly compares patch versions',
                tags: ['v1.0.0', 'v1.0.1', 'v1.0.2'],
                expected: 'v1.0.2',
            },
        ];

        test.each(findLatestVersionCases)('$name', ({ tags, expected }) => {
            // Act
            const result = findLatestVersion(tags);

            // Assert
            expect(result).toBe(expected);
        });
    });

    describe('classifyUpgrade', () => {
        interface ClassifyUpgradeCase {
            readonly name: string;
            readonly current: string;
            readonly latest: string;
            readonly expected: 'major' | 'minor' | 'patch';
        }

        const classifyUpgradeCases: readonly ClassifyUpgradeCase[] = [
            {
                name: 'classifies major upgrade',
                current: 'v1.0.0',
                latest: 'v2.0.0',
                expected: 'major',
            },
            {
                name: 'classifies minor upgrade',
                current: 'v1.0.0',
                latest: 'v1.2.0',
                expected: 'minor',
            },
            {
                name: 'classifies patch upgrade',
                current: 'v1.0.0',
                latest: 'v1.0.3',
                expected: 'patch',
            },
            {
                name: 'handles versions without v prefix',
                current: '1.0.0',
                latest: '2.0.0',
                expected: 'major',
            },
            {
                name: 'classifies same version as patch',
                current: 'v1.0.0',
                latest: 'v1.0.0',
                expected: 'patch',
            },
        ];

        test.each(classifyUpgradeCases)('$name', ({ current, latest, expected }) => {
            // Act
            const result = classifyUpgrade(current, latest);

            // Assert
            expect(result).toBe(expected);
        });
    });
});