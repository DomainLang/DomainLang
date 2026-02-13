/**
 * Tests for command runner utilities.
 *
 * @module commands/command-runner.test
 */
import { describe, test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVersion } from '../../src/commands/command-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__dirname, '..', '..', 'package.json');

describe('Command runner utilities', () => {
    describe('getVersion', () => {
        test('returns fail-safe default when package file cannot be read', async () => {
            // Arrange
            const failingFs = {
                readFile: async () => {
                    throw new Error('boom');
                },
            };

            // Act
            const version = await getVersion(failingFs as never);

            // Assert
            expect(version).toBe('0.0.0');
        });

        test('returns the actual CLI package version', async () => {
            // Arrange
            const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as { version: string };

            // Act
            const version = await getVersion();

            // Assert
            expect(version).toBe(packageJson.version);
        });
    });
});
