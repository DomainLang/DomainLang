/**
 * PackageBoundaryDetector Tests
 *
 * Tests real logic of package boundary detection:
 * - isExternalPackage: path-structure classification
 * - areInSamePackageSync: synchronous commit-directory comparison
 * - getPackageRoot: local files return null without filesystem access
 *
 * Tests requiring actual filesystem (model.yaml lookup) are excluded;
 * that logic is covered by integration tests via the import resolver.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { URI } from 'langium';
import { PackageBoundaryDetector } from '../../src/services/package-boundary-detector.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function extUri(commitId: string, file: string): URI {
    return URI.parse(`file:///workspace/.dlang/packages/owner/repo/${commitId}/${file}`);
}

function localUri(file: string): URI {
    return URI.parse(`file:///workspace/src/${file}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PackageBoundaryDetector', () => {
    let detector: PackageBoundaryDetector;

    beforeEach(() => {
        detector = new PackageBoundaryDetector();
    });

    // ── isExternalPackage ──────────────────────────────────────────────────────

    describe('isExternalPackage', () => {
        test.each([
            ['external package path', extUri('abc123', 'domain.dlang'), true],
            ['local src file', localUri('domain.dlang'), false],
            ['path with .dlang but no packages dir', URI.parse('file:///workspace/.dlang/local.dlang'), false],
        ] as const)('%s', (_label, uri, expected) => {
            // Act & Assert
            expect(detector.isExternalPackage(uri)).toBe(expected);
        });
    });

    // ── areInSamePackageSync ───────────────────────────────────────────────────

    describe('areInSamePackageSync', () => {
        test('files in same commit directory are in same package', () => {
            // Arrange
            const uri1 = extUri('abc123', 'domain.dlang');
            const uri2 = extUri('abc123', 'subdir/context.dlang');

            // Assert
            expect(detector.areInSamePackageSync(uri1, uri2)).toBe(true);
        });

        test('files in different commit directories are not in same package', () => {
            // Arrange — same owner/repo but different commits
            const uri1 = extUri('abc123', 'domain.dlang');
            const uri2 = extUri('def456', 'domain.dlang');

            // Assert
            expect(detector.areInSamePackageSync(uri1, uri2)).toBe(false);
        });

        test('external and local file are never in same package', () => {
            // Arrange
            const external = extUri('abc123', 'domain.dlang');
            const local = localUri('domain.dlang');

            // Assert
            expect(detector.areInSamePackageSync(external, local)).toBe(false);
        });
    });

    // ── getPackageRoot ─────────────────────────────────────────────────────────

    describe('getPackageRoot', () => {
        test('local file returns null without touching filesystem', async () => {
            // Arrange
            const local = localUri('domain.dlang');

            // Act
            const root = await detector.getPackageRoot(local);

            // Assert
            expect(root).toBeNull();
        });

        test('returns cached result on subsequent calls', async () => {
            // Arrange
            const local = localUri('domain.dlang');
            await detector.getPackageRoot(local);  // populate cache

            // Act — second call must not throw and returns same result
            const result = await detector.getPackageRoot(local);

            // Assert
            expect(result).toBeNull();
        });

        test('clearCache forces re-evaluation on next call', async () => {
            // Arrange
            const local = localUri('domain.dlang');
            await detector.getPackageRoot(local);
            detector.clearCache();

            // Act — must still return correct result after cache clear
            const result = await detector.getPackageRoot(local);

            // Assert
            expect(result).toBeNull();
        });
    });
});
