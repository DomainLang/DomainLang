/**
 * Tests for command runner utilities.
 *
 * @module commands/command-runner.test
 */
import { describe, test, expect, vi } from 'vitest';
import { getVersion } from '../../src/commands/command-runner.js';

// Mock useFirstRun to avoid filesystem side effects
vi.mock('../../src/ui/hooks/useFirstRun.js', () => ({
    isFirstRun: () => false,
    markFirstRunComplete: () => { /* no-op */ },
}));

describe('Command runner utilities', () => {
    describe('getVersion', () => {
        test('returns a valid semver version', async () => {
            // Act
            const version = await getVersion();

            // Assert
            expect(version).toMatch(/^\d+\.\d+\.\d+/);
        });
    });
});
