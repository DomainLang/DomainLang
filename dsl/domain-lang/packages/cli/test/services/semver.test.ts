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
        test('parses basic semver', () => {
            const result = parseSemVer('1.2.3');
            expect(result).toEqual({
                major: 1,
                minor: 2,
                patch: 3,
                preRelease: undefined,
                original: '1.2.3',
            });
        });

        test('parses semver with v prefix', () => {
            const result = parseSemVer('v1.2.3');
            expect(result).toEqual({
                major: 1,
                minor: 2,
                patch: 3,
                preRelease: undefined,
                original: 'v1.2.3',
            });
        });

        test('parses semver with prerelease', () => {
            const result = parseSemVer('v1.0.0-alpha.1');
            expect(result).toEqual({
                major: 1,
                minor: 0,
                patch: 0,
                preRelease: 'alpha.1',
                original: 'v1.0.0-alpha.1',
            });
        });

        test('returns undefined for non-semver', () => {
            expect(parseSemVer('main')).toBeUndefined();
            expect(parseSemVer('abc123def')).toBeUndefined();
            expect(parseSemVer('invalid')).toBeUndefined();
        });
    });

    describe('detectRefType', () => {
        test.each([
            ['abc123def', 'commit'],
            ['1234567890abcdef1234567890abcdef12345678', 'commit'],
            ['v1.0.0', 'tag'],
            ['1.2.3', 'tag'],
            ['v1.0.0-alpha', 'tag'],
            ['main', 'branch'],
            ['develop', 'branch'],
            ['feature/foo', 'branch'],
        ] as const)('detectRefType(%s) → %s', (ref, expected) => {
            expect(detectRefType(ref)).toBe(expected);
        });
    });

    describe('parseRef', () => {
        test('parses tag refs with semver', () => {
            const result = parseRef('v1.2.3');
            expect(result.original).toBe('v1.2.3');
            expect(result.type).toBe('tag');
            expect(result.semver).not.toBeUndefined();
            expect(result.semver?.major).toBe(1);
        });

        test('parses branch refs without semver', () => {
            const result = parseRef('main');
            expect(result.original).toBe('main');
            expect(result.type).toBe('branch');
            expect(result.semver).toBeUndefined();
        });
    });

    describe('compareSemVer', () => {
        test('compares by major version', () => {
            const lower = parse('1.0.0');
            const higher = parse('2.0.0');
            expect(compareSemVer(lower, higher)).toBeLessThan(0);
            expect(compareSemVer(higher, lower)).toBeGreaterThan(0);
        });

        test('compares by minor version', () => {
            const a = parse('1.1.0');
            const b = parse('1.2.0');
            expect(compareSemVer(a, b)).toBeLessThan(0);
        });

        test('compares by patch version', () => {
            const a = parse('1.0.0');
            const b = parse('1.0.1');
            expect(compareSemVer(a, b)).toBeLessThan(0);
        });

        test('prerelease is less than release', () => {
            const a = parse('1.0.0-alpha');
            const b = parse('1.0.0');
            expect(compareSemVer(a, b)).toBeLessThan(0);
        });

        test('equal versions compare to zero', () => {
            const a = parse('1.2.3');
            const b = parse('1.2.3');
            expect(compareSemVer(a, b)).toBe(0);
        });
    });

    describe('pickLatestSemVer', () => {
        test('picks the latest version', () => {
            const refs = ['v1.0.0', 'v1.5.0', 'v1.2.0'];
            expect(pickLatestSemVer(refs)).toBe('v1.5.0');
        });

        test('handles mixed prefixes', () => {
            const refs = ['1.0.0', 'v2.0.0', '1.5.0'];
            expect(pickLatestSemVer(refs)).toBe('v2.0.0');
        });

        test('returns undefined for empty array', () => {
            expect(pickLatestSemVer([])).toBeUndefined();
        });

        test('returns undefined for non-semver refs', () => {
            expect(pickLatestSemVer(['main', 'develop'])).toBeUndefined();
        });

        test('prefers release over prerelease', () => {
            const refs = ['v1.0.0-alpha', 'v1.0.0'];
            expect(pickLatestSemVer(refs)).toBe('v1.0.0');
        });
    });

    describe('sortVersionsDescending', () => {
        test('sorts versions newest first', () => {
            const versions = ['v1.0.0', 'v2.0.0', 'v1.5.0'];
            expect(sortVersionsDescending(versions)).toEqual(['v2.0.0', 'v1.5.0', 'v1.0.0']);
        });

        test('does not mutate original array', () => {
            const versions = ['v1.0.0', 'v2.0.0'];
            sortVersionsDescending(versions);
            expect(versions).toEqual(['v1.0.0', 'v2.0.0']);
        });

        test('handles non-semver refs at the end', () => {
            const versions = ['main', 'v1.0.0', 'develop'];
            const sorted = sortVersionsDescending(versions);
            expect(sorted).toHaveLength(3);
            expect(sorted[0]).toBe('v1.0.0');
            expect(new Set(sorted.slice(1))).toEqual(new Set(['main', 'develop']));
        });
    });

    describe('isPreRelease', () => {
        test.each([
            ['v1.0.0-alpha', true],
            ['1.0.0-alpha.1', true],
            ['v1.0.0-beta', true],
            ['v1.0.0-rc.1', true],
            ['v1.0.0-dev', true],
            ['v1.0.0-snapshot', true],
            ['v1.0.0', false],
            ['1.2.3', false],
        ] as const)('isPreRelease(%s) → %s', (ref, expected) => {
            expect(isPreRelease(ref)).toBe(expected);
        });
    });

    describe('areSameMajor', () => {
        test('returns true for same major', () => {
            const a = parse('1.0.0');
            const b = parse('1.5.0');
            expect(areSameMajor(a, b)).toBe(true);
        });

        test('returns false for different major', () => {
            const a = parse('1.0.0');
            const b = parse('2.0.0');
            expect(areSameMajor(a, b)).toBe(false);
        });
    });

    describe('getMajorVersion', () => {
        test('extracts major version', () => {
            expect(getMajorVersion('v1.2.3')).toBe(1);
            expect(getMajorVersion('2.0.0')).toBe(2);
        });

        test('returns undefined for non-semver', () => {
            expect(getMajorVersion('main')).toBeUndefined();
        });
    });

    describe('filterStableVersions', () => {
        test('filters out prereleases', () => {
            const refs = ['v1.0.0', 'v1.1.0-alpha', 'v1.2.0'];
            expect(filterStableVersions(refs)).toEqual(['v1.0.0', 'v1.2.0']);
        });
    });

    describe('filterSemVerTags', () => {
        test('keeps only semver tags', () => {
            const refs = ['v1.0.0', 'main', 'abc123def', '1.2.3'];
            expect(filterSemVerTags(refs)).toEqual(['v1.0.0', '1.2.3']);
        });
    });
});
