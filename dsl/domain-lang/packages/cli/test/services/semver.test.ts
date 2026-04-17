import { describe, test, expect } from 'vitest';
import type { SemVer } from '../../src/services/types.js';
import {
    parseSemVer,
    compareSemVer,
    pickLatestSemVer,
    sortVersionsDescending,
    detectRefType,
    parseRef,
    isPreRelease,
    areSameMajor,
    getMajorVersion,
    filterStableVersions,
    filterSemVerTags,
} from '../../src/services/semver.js';

/**
 * Helper to parse SemVer with assertion - throws if invalid.
 * Only used in tests where we know the input is valid SemVer.
 */
function parse(version: string): SemVer {
    const result = parseSemVer(version);
    if (!result) {
        throw new Error(`Test setup error: '${version}' is not valid SemVer`);
    }
    return result;
}

describe('SemVer utilities', () => {
    describe('parseSemVer', () => {
        interface ParseCase {
            readonly version: string;
            readonly expected: SemVer | undefined;
            readonly name: string;
        }

        const parseCases: readonly ParseCase[] = [
            {
                version: '1.2.3',
                expected: {
                    major: 1,
                    minor: 2,
                    patch: 3,
                    preRelease: undefined,
                    original: '1.2.3',
                },
                name: 'basic semver',
            },
            {
                version: 'v1.2.3',
                expected: {
                    major: 1,
                    minor: 2,
                    patch: 3,
                    preRelease: undefined,
                    original: 'v1.2.3',
                },
                name: 'semver with v prefix',
            },
            {
                version: 'v1.0.0-alpha.1',
                expected: {
                    major: 1,
                    minor: 0,
                    patch: 0,
                    preRelease: 'alpha.1',
                    original: 'v1.0.0-alpha.1',
                },
                name: 'semver with prerelease',
            },
            {
                version: 'main',
                expected: undefined,
                name: 'non-semver branch ref',
            },
        ];

        test.each(parseCases)('parses $name', ({ version, expected }) => {
            // Act
            const result = parseSemVer(version);

            // Assert
            expect(result).toEqual(expected);
        });
    });

    describe('detectRefType', () => {
        interface DetectRefTypeCase {
            readonly ref: string;
            readonly expected: 'commit' | 'tag' | 'branch';
        }

        const detectCases: readonly DetectRefTypeCase[] = [
            { ref: 'abc123def', expected: 'commit' },
            { ref: '1234567890abcdef1234567890abcdef12345678', expected: 'commit' },
            { ref: 'v1.0.0', expected: 'tag' },
            { ref: '1.2.3', expected: 'tag' },
            { ref: 'v1.0.0-alpha', expected: 'tag' },
            { ref: 'main', expected: 'branch' },
            { ref: 'develop', expected: 'branch' },
            { ref: 'feature/foo', expected: 'branch' },
        ];

        test.each(detectCases)('detectRefType($ref) → $expected', ({ ref, expected }) => {
            // Act & Assert
            expect(detectRefType(ref)).toBe(expected);
        });
    });

    describe('parseRef', () => {
        test('parses tag refs with semver', () => {
            // Act
            const result = parseRef('v1.2.3');

            // Assert
            expect(result.original).toBe('v1.2.3');
            expect(result.type).toBe('tag');
            expect(result.semver).not.toBeUndefined();
            expect(result.semver?.major).toBe(1);
        });

        test('parses branch refs without semver', () => {
            // Act
            const result = parseRef('main');

            // Assert
            expect(result.original).toBe('main');
            expect(result.type).toBe('branch');
            expect(result.semver).toBeUndefined();
        });
    });

    describe('compareSemVer', () => {
        test('compares by major version', () => {
            // Arrange
            const lower = parse('1.0.0');
            const higher = parse('2.0.0');

            // Act & Assert
            expect(compareSemVer(lower, higher)).toBeLessThan(0);
            expect(compareSemVer(higher, lower)).toBeGreaterThan(0);
        });

        test('compares by minor version', () => {
            // Arrange
            const a = parse('1.1.0');
            const b = parse('1.2.0');

            // Act & Assert
            expect(compareSemVer(a, b)).toBeLessThan(0);
        });

        test('compares by patch version', () => {
            // Arrange
            const a = parse('1.0.0');
            const b = parse('1.0.1');

            // Act & Assert
            expect(compareSemVer(a, b)).toBeLessThan(0);
        });

        test('prerelease is less than release', () => {
            // Arrange
            const a = parse('1.0.0-alpha');
            const b = parse('1.0.0');

            // Act & Assert
            expect(compareSemVer(a, b)).toBeLessThan(0);
        });

        test('equal versions compare to zero', () => {
            // Arrange
            const a = parse('1.2.3');
            const b = parse('1.2.3');

            // Act & Assert
            expect(compareSemVer(a, b)).toBe(0);
        });
    });

    describe('pickLatestSemVer', () => {
        test('picks the latest version', () => {
            // Arrange
            const refs = ['v1.0.0', 'v1.5.0', 'v1.2.0'];

            // Act
            const result = pickLatestSemVer(refs);

            // Assert
            expect(result).toBe('v1.5.0');
        });

        test('handles mixed prefixes', () => {
            // Arrange
            const refs = ['1.0.0', 'v2.0.0', '1.5.0'];

            // Act
            const result = pickLatestSemVer(refs);

            // Assert
            expect(result).toBe('v2.0.0');
        });

        test('returns undefined for empty array', () => {
            // Arrange
            const refs: string[] = [];

            // Act & Assert
            expect(pickLatestSemVer(refs)).toBeUndefined();
        });

        test('returns undefined for non-semver refs', () => {
            // Arrange
            const refs = ['main', 'develop'];

            // Act & Assert
            expect(pickLatestSemVer(refs)).toBeUndefined();
        });

        test('prefers release over prerelease', () => {
            // Arrange
            const refs = ['v1.0.0-alpha', 'v1.0.0'];

            // Act
            const result = pickLatestSemVer(refs);

            // Assert
            expect(result).toBe('v1.0.0');
        });
    });

    describe('sortVersionsDescending', () => {
        test('sorts versions newest first', () => {
            // Arrange
            const versions = ['v1.0.0', 'v2.0.0', 'v1.5.0'];

            // Act
            const result = sortVersionsDescending(versions);

            // Assert
            expect(result).toEqual(['v2.0.0', 'v1.5.0', 'v1.0.0']);
        });

        test('does not mutate original array', () => {
            // Arrange
            const versions = ['v1.0.0', 'v2.0.0'];

            // Act
            sortVersionsDescending(versions);

            // Assert
            expect(versions).toEqual(['v1.0.0', 'v2.0.0']);
        });

        test('handles non-semver refs at the end', () => {
            // Arrange
            const versions = ['main', 'v1.0.0', 'develop'];

            // Act
            const sorted = sortVersionsDescending(versions);

            // Assert
            expect(sorted).toHaveLength(3);
            expect(sorted[0]).toBe('v1.0.0');
            expect(new Set(sorted.slice(1))).toEqual(new Set(['main', 'develop']));
        });
    });

    describe('isPreRelease', () => {
        interface PreReleaseCase {
            readonly ref: string;
            readonly expected: boolean;
        }

        const preReleaseCases: readonly PreReleaseCase[] = [
            { ref: 'v1.0.0-alpha', expected: true },
            { ref: '1.0.0-alpha.1', expected: true },
            { ref: 'v1.0.0-beta', expected: true },
            { ref: 'v1.0.0-rc.1', expected: true },
            { ref: 'v1.0.0-dev', expected: true },
            { ref: 'v1.0.0-snapshot', expected: true },
            { ref: 'v1.0.0', expected: false },
            { ref: '1.2.3', expected: false },
        ];

        test.each(preReleaseCases)('isPreRelease($ref) → $expected', ({ ref, expected }) => {
            // Act & Assert
            expect(isPreRelease(ref)).toBe(expected);
        });
    });

    describe('areSameMajor', () => {
        test('returns true for same major', () => {
            // Arrange
            const a = parse('1.0.0');
            const b = parse('1.5.0');

            // Act & Assert
            expect(areSameMajor(a, b)).toBe(true);
        });

        test('returns false for different major', () => {
            // Arrange
            const a = parse('1.0.0');
            const b = parse('2.0.0');

            // Act & Assert
            expect(areSameMajor(a, b)).toBe(false);
        });
    });

    describe('getMajorVersion', () => {
        test('extracts major version', () => {
            // Act & Assert
            expect(getMajorVersion('v1.2.3')).toBe(1);
            expect(getMajorVersion('2.0.0')).toBe(2);
        });

        test('returns undefined for non-semver', () => {
            // Act & Assert
            expect(getMajorVersion('main')).toBeUndefined();
        });
    });

    describe('filterStableVersions', () => {
        test('filters out prereleases', () => {
            // Arrange
            const refs = ['v1.0.0', 'v1.1.0-alpha', 'v1.2.0'];

            // Act
            const result = filterStableVersions(refs);

            // Assert
            expect(result).toEqual(['v1.0.0', 'v1.2.0']);
        });
    });

    describe('filterSemVerTags', () => {
        test('keeps only semver tags', () => {
            // Arrange
            const refs = ['v1.0.0', 'main', 'abc123def', '1.2.3'];

            // Act
            const result = filterSemVerTags(refs);

            // Assert
            expect(result).toEqual(['v1.0.0', '1.2.3']);
        });
    });
});