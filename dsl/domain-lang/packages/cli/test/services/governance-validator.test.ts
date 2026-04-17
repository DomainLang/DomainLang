import { describe, test, expect } from 'vitest';
import { GovernanceValidator, loadGovernancePolicy } from '../../src/services/governance-validator.js';
import type { LockFile, GovernancePolicy } from '../../src/services/types.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('GovernanceValidator', () => {
    describe('validate', () => {
        interface ValidateCase {
            readonly name: string;
            readonly policy: GovernancePolicy;
            readonly lockFile: LockFile;
            readonly shouldHaveViolations: boolean;
            readonly violationType?: string;
        }

        const validateCases: readonly ValidateCase[] = [
            {
                name: 'passes validation with no policy',
                policy: {},
                lockFile: {
                    version: '1',
                    dependencies: {
                        'acme/patterns': {
                            ref: '1.0.0',
                            refType: 'tag',
                            resolved: 'https://github.com/acme/patterns',
                            commit: 'abc123',
                        },
                    },
                },
                shouldHaveViolations: false,
            },
            {
                name: 'detects blocked source',
                policy: { allowedSources: ['github.com/acme'] },
                lockFile: {
                    version: '1',
                    dependencies: {
                        'evil/malware': {
                            ref: '1.0.0',
                            refType: 'tag',
                            resolved: 'https://github.com/evil/malware',
                            commit: 'xxx',
                        },
                    },
                },
                shouldHaveViolations: true,
                violationType: 'blocked-source',
            },
            {
                name: 'detects unstable versions',
                policy: { requireStableVersions: true },
                lockFile: {
                    version: '1',
                    dependencies: {
                        'acme/patterns': {
                            ref: '1.0.0-beta',
                            refType: 'tag',
                            resolved: 'https://github.com/acme/patterns',
                            commit: 'abc',
                        },
                    },
                },
                shouldHaveViolations: true,
                violationType: 'unstable-version',
            },
            {
                name: 'allows stable versions',
                policy: { requireStableVersions: true },
                lockFile: {
                    version: '1',
                    dependencies: {
                        'acme/patterns': {
                            ref: '1.0.0',
                            refType: 'tag',
                            resolved: 'https://github.com/acme/patterns',
                            commit: 'abc',
                        },
                    },
                },
                shouldHaveViolations: false,
            },
            {
                name: 'detects blocked packages',
                policy: { blockedPackages: ['evil/malware', 'test/blocked'] },
                lockFile: {
                    version: '1',
                    dependencies: {
                        'evil/malware': {
                            ref: '1.0.0',
                            refType: 'tag',
                            resolved: 'https://github.com/evil/malware',
                            commit: 'xxx',
                        },
                    },
                },
                shouldHaveViolations: true,
                violationType: 'blocked-source',
            },
        ];

        test.each(validateCases)('$name', async ({ policy, lockFile, shouldHaveViolations, violationType }) => {
            // Arrange
            const validator = new GovernanceValidator(policy);

            // Act
            const violations = await validator.validate(lockFile, '/tmp/test');

            // Assert
            if (shouldHaveViolations) {
                expect(violations.length).toBeGreaterThan(0);
                if (violationType) {
                    expect(violations[0].type).toBe(violationType);
                }
            } else {
                expect(violations).toEqual([]);
            }
        });
    });

    describe('generateAuditReport', () => {
        test('generates report with no violations', async () => {
            // Arrange
            const policy: GovernancePolicy = {};
            const validator = new GovernanceValidator(policy);
            const lockFile: LockFile = {
                version: '1',
                dependencies: {
                    'acme/patterns': {
                        ref: '1.0.0',
                        refType: 'tag',
                        resolved: 'https://github.com/acme/patterns',
                        commit: 'abc123',
                    },
                },
            };

            // Act
            const report = await validator.generateAuditReport(lockFile, '/tmp/test');

            // Assert
            expect(report).toContain('Dependency Audit Report');
            expect(report).toContain('acme/patterns');
            expect(report).toContain('No policy violations');
        });

        test('generates report with violations', async () => {
            // Arrange
            const policy: GovernancePolicy = { requireStableVersions: true };
            const validator = new GovernanceValidator(policy);
            const lockFile: LockFile = {
                version: '1',
                dependencies: {
                    'acme/patterns': {
                        ref: '1.0.0-alpha',
                        refType: 'tag',
                        resolved: 'https://github.com/acme/patterns',
                        commit: 'abc',
                    },
                },
            };

            // Act
            const report = await validator.generateAuditReport(lockFile, '/tmp/test');

            // Assert
            expect(report).toContain('Violations:');
            expect(report).toContain('alpha');
        });
    });

    describe('loadGovernanceMetadata', () => {
        test('returns empty metadata when file missing', async () => {
            // Arrange
            const validator = new GovernanceValidator({});

            // Act
            const metadata = await validator.loadGovernanceMetadata('/nonexistent');

            // Assert
            expect(metadata).toEqual({});
        });
    });
});

describe('loadGovernancePolicy', () => {
    test('returns empty policy when file missing', async () => {
        // Arrange
        const path = '/nonexistent';

        // Act
        const policy = await loadGovernancePolicy(path);

        // Assert
        expect(policy).toEqual({});
    });

    test('loads governance policy from model.yaml', async () => {
        // Arrange
        let tempDir: string | undefined;
        try {
            tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-gov-test-'));
            const manifestPath = path.join(tempDir, 'model.yaml');
            const manifest = `
model:
  name: test
  version: 1.0.0

governance:
  requireStableVersions: true
  allowedSources:
    - github.com/acme
`;
            await fs.writeFile(manifestPath, manifest, 'utf-8');

            // Act
            const policy = await loadGovernancePolicy(tempDir);

            // Assert
            expect(policy.requireStableVersions).toBe(true);
            expect(policy.allowedSources).toEqual(['github.com/acme']);
        } finally {
            if (tempDir) {
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        }
    });
});