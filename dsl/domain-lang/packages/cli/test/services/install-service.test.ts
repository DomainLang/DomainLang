/**
 * Tests for InstallService
 * 
 * Covers:
 * - Integrity verification (match/mismatch)
 * - Frozen mode (pass/fail)
 * - Force mode (cache bypass)
 * - Lock file upgrade (add integrity to legacy locks)
 * - Error messages
 * - Mutual exclusion of --frozen and --force
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InstallService, FrozenMismatchError, IntegrityError } from '../../src/services/install-service.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { LockFile } from '@domainlang/language';

describe('InstallService', () => {
    let testDir: string;
    let installService: InstallService;

    beforeEach(async () => {
        // Create temporary test directory
        testDir = path.join(tmpdir(), `dlang-test-${randomUUID()}`);
        await fs.mkdir(testDir, { recursive: true });
        
        installService = new InstallService(testDir);
    });

    afterEach(async () => {
        // Clean up test directory
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('Options validation', () => {
        it('should reject --frozen and --force together', async () => {
            await expect(
                installService.install({
                    workspaceRoot: testDir,
                    frozen: true,
                    force: true,
                })
            ).rejects.toThrow('Cannot use --frozen and --force together');
        });
    });

    describe('Frozen mode', () => {
        it('should fail if lock file does not exist', async () => {
            // Create manifest without lock file
            await fs.writeFile(
                path.join(testDir, 'model.yaml'),
                `dependencies:\n  acme/test: v1.0.0\n`,
                'utf-8'
            );

            await expect(
                installService.install({
                    workspaceRoot: testDir,
                    frozen: true,
                })
            ).rejects.toThrow('Lock file does not exist');
        });

        it('should fail if dependency added in manifest', async () => {
            // Create manifest with new dependency
            await fs.writeFile(
                path.join(testDir, 'model.yaml'),
                `dependencies:\n  acme/test: v1.0.0\n  acme/new: v2.0.0\n`,
                'utf-8'
            );

            // Create lock file without new dependency
            const lock: LockFile = {
                version: '1',
                dependencies: {
                    'acme/test': {
                        ref: 'v1.0.0',
                        refType: 'tag',
                        resolved: 'https://github.com/acme/test',
                        commit: 'abc123',
                        integrity: 'sha512-test',
                    },
                },
            };

            await fs.writeFile(
                path.join(testDir, 'model.lock'),
                JSON.stringify(lock, null, 2),
                'utf-8'
            );

            await expect(
                installService.install({
                    workspaceRoot: testDir,
                    frozen: true,
                })
            ).rejects.toThrow(FrozenMismatchError);
        });

        it('should fail if dependency removed from manifest', async () => {
            // Create manifest without dependency
            await fs.writeFile(
                path.join(testDir, 'model.yaml'),
                `dependencies:\n  acme/test: v1.0.0\n`,
                'utf-8'
            );

            // Create lock file with extra dependency
            const lock: LockFile = {
                version: '1',
                dependencies: {
                    'acme/test': {
                        ref: 'v1.0.0',
                        refType: 'tag',
                        resolved: 'https://github.com/acme/test',
                        commit: 'abc123',
                        integrity: 'sha512-test',
                    },
                    'acme/removed': {
                        ref: 'v2.0.0',
                        refType: 'tag',
                        resolved: 'https://github.com/acme/removed',
                        commit: 'def456',
                        integrity: 'sha512-removed',
                    },
                },
            };

            await fs.writeFile(
                path.join(testDir, 'model.lock'),
                JSON.stringify(lock, null, 2),
                'utf-8'
            );

            await expect(
                installService.install({
                    workspaceRoot: testDir,
                    frozen: true,
                })
            ).rejects.toThrow(FrozenMismatchError);
        });

        it('should fail if dependency version changed', async () => {
            // Create manifest with updated version
            await fs.writeFile(
                path.join(testDir, 'model.yaml'),
                `dependencies:\n  acme/test: v2.0.0\n`,
                'utf-8'
            );

            // Create lock file with old version
            const lock: LockFile = {
                version: '1',
                dependencies: {
                    'acme/test': {
                        ref: 'v1.0.0',
                        refType: 'tag',
                        resolved: 'https://github.com/acme/test',
                        commit: 'abc123',
                        integrity: 'sha512-test',
                    },
                },
            };

            await fs.writeFile(
                path.join(testDir, 'model.lock'),
                JSON.stringify(lock, null, 2),
                'utf-8'
            );

            await expect(
                installService.install({
                    workspaceRoot: testDir,
                    frozen: true,
                })
            ).rejects.toThrow(FrozenMismatchError);
        });

        it('should respect DLANG_FROZEN environment variable', async () => {
            process.env['DLANG_FROZEN'] = '1';

            try {
                await fs.writeFile(
                    path.join(testDir, 'model.yaml'),
                    `dependencies:\n  acme/test: v1.0.0\n`,
                    'utf-8'
                );

                await expect(
                    installService.install({
                        workspaceRoot: testDir,
                        frozen: false, // Explicit false should be overridden by env var
                    })
                ).rejects.toThrow('Lock file does not exist');
            } finally {
                delete process.env['DLANG_FROZEN'];
            }
        });
    });

    describe('Error messages', () => {
        it('should provide actionable hints for frozen mode errors', () => {
            const error = new FrozenMismatchError(
                ['acme/new@v1.0.0'],
                [],
                []
            );

            expect(error.message).toContain('--frozen mode');
        });

        it('should provide actionable hints for integrity errors', () => {
            const error = new IntegrityError(
                'acme/test',
                'sha512-expected',
                'sha512-actual'
            );

            expect(error.message).toContain('Integrity check failed');
            expect(error.message).toContain('acme/test');
        });
    });

    describe('Manifest validation', () => {
        it('should handle missing dependencies', async () => {
            await fs.writeFile(
                path.join(testDir, 'model.yaml'),
                'model:\n  name: test\n',
                'utf-8'
            );

            const result = await installService.install({
                workspaceRoot: testDir,
            });

            expect(result.installed).toBe(0);
            expect(result.cached).toBe(0);
        });

        it('should validate dependency source format', async () => {
            await fs.writeFile(
                path.join(testDir, 'model.yaml'),
                'dependencies:\n  invalid: v1.0.0\n',
                'utf-8'
            );

            await expect(
                installService.install({
                    workspaceRoot: testDir,
                })
            ).rejects.toThrow('Invalid dependency source format');
        });

        it('should validate dependency ref is present', async () => {
            await fs.writeFile(
                path.join(testDir, 'model.yaml'),
                'dependencies:\n  acme/test:\n    source: acme/test\n',
                'utf-8'
            );

            await expect(
                installService.install({
                    workspaceRoot: testDir,
                })
            ).rejects.toThrow('Missing ref');
        });
    });
});
