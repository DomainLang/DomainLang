/**
 * Tests for ManifestValidator.
 *
 * Verifies manifest validation and diagnostics:
 * - Model section validation (name, version)
 * - Dependency validation (source, path, version)
 * - Path alias validation
 */

import { describe, test, expect } from 'vitest';
import {
    ManifestValidator,
    ManifestIssueCodes,
    isManifestValid,
    validateManifest
} from '../../src/validation/manifest.js';
import type { ModelManifest } from '../../src/services/types.js';
import { IssueCodes } from '../../src/validation/constants.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

describe('ManifestValidator', () => {
    const validator = new ManifestValidator();

    describe('valid manifests', () => {
        test('accepts minimal valid manifest', () => {
            const result = validator.validate({});
            expect(result.valid).toBe(true);
            expect(result.errorCount).toBe(0);
            expect(result.diagnostics).toHaveLength(0);
        });

        test('accepts short-form dependencies', () => {
            const manifest: ModelManifest = {
                dependencies: { 'domainlang/core': 'v1.0.0' }
            };
            const result = validator.validate(manifest);
            expect(result.valid).toBe(true);
            expect(result.errorCount).toBe(0);
        });

        test('accepts valid SemVer versions', () => {
            for (const version of ['1.0.0', '2.3.4-beta', '0.0.1+build']) {
                const result = validator.validate({ model: { name: 'test', version } });
                const versionErrors = result.diagnostics.filter(d => d.code === ManifestIssueCodes.ModelInvalidVersion);
                expect(versionErrors).toHaveLength(0);
            }
        });

        test('accepts valid ref specs', () => {
            for (const ref of ['v1.0.0', 'main', 'abc1234567', '1.2.3']) {
                const result = validator.validate({ dependencies: { 'owner/repo': { ref } } });
                const missingRef = result.diagnostics.filter(d => d.code === IssueCodes.ImportMissingRef);
                expect(missingRef).toHaveLength(0);
            }
        });

        test('dependency without explicit source uses key as source', () => {
            const manifest: ModelManifest = {
                dependencies: { 'owner/repo': { ref: 'v1.0.0' } }
            };
            const result = validator.validate(manifest);
            expect(result.valid).toBe(true);
            expect(result.errorCount).toBe(0);
        });

        test('accepts valid path aliases with @ prefix and relative paths', () => {
            const manifest: ModelManifest = {
                paths: { '@': '.', '@lib': './lib', '@src': './src' }
            };
            const result = validator.validate(manifest);
            const pathDiagnostics = result.diagnostics.filter(d => d.path.startsWith('paths.'));
            expect(pathDiagnostics).toHaveLength(0);
        });
    });

    describe('model section validation', () => {
        test('requires name for publishable packages', () => {
            // Arrange
            const manifest: ModelManifest = {
                model: {
                    version: '1.0.0'
                }
            };

            // Act
            const result = validator.validate(manifest, { requirePublishable: true });

            // Assert
            expect(result.valid).toBe(false);
            const diagnostic = result.diagnostics.find(d => d.code === ManifestIssueCodes.ModelMissingName);
            expect(diagnostic).not.toBeUndefined();
            expect(diagnostic!.path).toBe('model.name');
            expect(diagnostic!.severity).toBe('error');
        });

        test('requires version for publishable packages', () => {
            // Arrange
            const manifest: ModelManifest = {
                model: {
                    name: 'my-package'
                }
            };

            // Act
            const result = validator.validate(manifest, { requirePublishable: true });

            // Assert
            expect(result.valid).toBe(false);
            const diagnostic = result.diagnostics.find(d => d.code === ManifestIssueCodes.ModelMissingVersion);
            expect(diagnostic).not.toBeUndefined();
            expect(diagnostic!.path).toBe('model.version');
            expect(diagnostic!.severity).toBe('error');
        });

        test('warns on invalid SemVer version', () => {
            // Arrange
            const manifest: ModelManifest = {
                model: {
                    name: 'my-package',
                    version: 'invalid-version'
                }
            };

            // Act
            const result = validator.validate(manifest);

            // Assert
            const diagnostic = result.diagnostics.find(d => d.code === ManifestIssueCodes.ModelInvalidVersion);
            expect(diagnostic).not.toBeUndefined();
            expect(diagnostic!.severity).toBe('warning');
            expect(diagnostic!.message).toContain('invalid-version');
        });

    });

    describe('dependency validation', () => {
        test('rejects conflicting source and path', () => {
            // Arrange
            const manifest: ModelManifest = {
                dependencies: {
                    'bad-dep': {
                        source: 'owner/repo',
                        path: './local',
                        ref: 'v1.0.0'
                    }
                }
            };

            // Act
            const result = validator.validate(manifest);

            // Assert
            expect(result.valid).toBe(false);
            const diagnostic = result.diagnostics.find(d =>
                d.code === IssueCodes.ImportConflictingSourcePath
            );
            expect(diagnostic).not.toBeUndefined();
            expect(diagnostic!.message).toContain('bad-dep');
        });

        test('requires ref for git dependencies', () => {
            // Arrange
            const manifest: ModelManifest = {
                dependencies: {
                    'missing-ref': {
                        source: 'owner/repo'
                    }
                }
            };

            // Act
            const result = validator.validate(manifest);

            // Assert
            expect(result.valid).toBe(false);
            const diagnostic = result.diagnostics.find(d =>
                d.code === IssueCodes.ImportMissingRef
            );
            expect(diagnostic).not.toBeUndefined();
            expect(diagnostic!.message).toContain('missing-ref');
        });

        test('rejects absolute paths in path dependencies', () => {
            // Arrange
            const manifest: ModelManifest = {
                dependencies: {
                    'absolute': {
                        path: '/absolute/path'
                    }
                }
            };

            // Act
            const result = validator.validate(manifest);

            // Assert
            expect(result.valid).toBe(false);
            const diagnostic = result.diagnostics.find(d =>
                d.code === IssueCodes.ImportAbsolutePath
            );
            expect(diagnostic).not.toBeUndefined();
            expect(diagnostic!.message).toContain('/absolute/path');
        });

        test('rejects invalid source format', () => {
            // Arrange
            const manifest: ModelManifest = {
                dependencies: {
                    'bad-source': {
                        source: 'not-valid-format',
                        ref: 'v1.0.0'
                    }
                }
            };

            // Act
            const result = validator.validate(manifest);

            // Assert
            const diagnostic = result.diagnostics.find(d =>
                d.code === ManifestIssueCodes.DependencyInvalidSource
            );
            expect(diagnostic).not.toBeUndefined();
            expect(diagnostic!.message).toContain('not-valid-format');
        });

        test('rejects dependency with neither source nor path', () => {
            // Arrange
            const manifest: ModelManifest = {
                dependencies: {
                    'empty-dep': {}
                }
            };

            // Act
            const result = validator.validate(manifest);

            // Assert
            // Key 'empty-dep' is not owner/repo format, so normalization adds it as source
            // but it won't match valid source format. Either way, we validate it produces diagnostics.
            expect(result.diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('path alias validation', () => {
        test('warns on path alias without @ prefix', () => {
            // Arrange
            const manifest: ModelManifest = {
                paths: {
                    'lib': './lib'
                }
            };

            // Act
            const result = validator.validate(manifest);

            // Assert
            const diagnostic = result.diagnostics.find(d =>
                d.code === ManifestIssueCodes.PathAliasMissingAtPrefix
            );
            expect(diagnostic).not.toBeUndefined();
            expect(diagnostic!.severity).toBe('warning');
            expect(diagnostic!.message).toContain('lib');
        });

        test('rejects absolute path in alias target', () => {
            // Arrange
            const manifest: ModelManifest = {
                paths: {
                    '@lib': '/absolute/path'
                }
            };

            // Act
            const result = validator.validate(manifest);

            // Assert
            expect(result.valid).toBe(false);
            const diagnostic = result.diagnostics.find(d =>
                d.code === ManifestIssueCodes.PathAliasAbsolutePath
            );
            expect(diagnostic).not.toBeUndefined();
            expect(diagnostic!.message).toContain('/absolute/path');
        });

    });

    describe('convenience functions', () => {
        test('isManifestValid returns true for valid and false for invalid', () => {
            // Act & Assert
            expect(isManifestValid({})).toBe(true);
            expect(isManifestValid({
                dependencies: {
                    bad: { source: 'a', path: 'b' }
                }
            })).toBe(false);
        });

        test('validateManifest returns diagnostics with expected codes', () => {
            // Arrange & Act
            const diagnostics = validateManifest({
                dependencies: {
                    'owner/repo': { source: 'owner/repo' }
                }
            });

            // Assert
            expect(diagnostics.length).toBeGreaterThan(0);
            // Should report missing ref for git dependency
            expect(diagnostics.some(d => d.code === IssueCodes.ImportMissingRef)).toBe(true);
        });
    });
});
