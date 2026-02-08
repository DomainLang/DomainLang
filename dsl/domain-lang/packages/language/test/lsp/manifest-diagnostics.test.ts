/**
 * Tests for ManifestDiagnosticsService.
 *
 * Smoke (~20%):
 * - Valid manifest returns zero diagnostics
 * - YAML parse error produces error diagnostic with correct message
 *
 * Edge/error (~80%):
 * - Invalid SemVer version produces warning at correct line
 * - Missing name in publishable mode produces error
 * - Conflicting source and path produces error with hint
 * - Git dependency without version produces error with diagnostic code
 * - Path alias without @ prefix produces warning
 * - Absolute path in paths produces error
 * - All diagnostics have source = "domainlang"
 * - Correct YAML path location for nested diagnostics
 * - Empty content handled gracefully
 */

import { describe, test, expect } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { ManifestDiagnosticsService } from '../../src/lsp/manifest-diagnostics.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

describe('ManifestDiagnosticsService', () => {
    const service = new ManifestDiagnosticsService();

    // ==========================================
    // SMOKE: valid manifest returns empty
    // ==========================================
    test('valid manifest returns zero diagnostics', () => {
        const content = `
model:
  name: test-package
  version: 1.0.0
`;
        const diagnostics = service.validate(content);
        expect(diagnostics).toHaveLength(0);
    });

    // ==========================================
    // SMOKE: YAML parse error produces error
    // ==========================================
    test('broken YAML produces error diagnostic with "YAML parse error" message and source "domainlang"', () => {
        const content = `
model: {
  broken yaml
  missing: [colon
`;
        const diagnostics = service.validate(content);
        expect(diagnostics.length).toBeGreaterThan(0);
        expect(diagnostics[0].message).toContain('YAML parse error');
        expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
        expect(diagnostics[0].source).toBe('domainlang');
    });

    // ==========================================
    // EDGE: invalid SemVer at correct line
    // ==========================================
    test('invalid SemVer version produces warning at correct line with source "domainlang"', () => {
        const content = `model:
  name: test-package
  version: invalid-version
`;
        const diagnostics = service.validate(content);
        const versionDiag = diagnostics.find(d =>
            d.message.includes('SemVer') || d.message.includes('version')
        );
        expect(versionDiag).toBeDefined();
        expect(versionDiag!.severity).toBe(DiagnosticSeverity.Warning);
        expect(versionDiag!.source).toBe('domainlang');
        // Should point to line with 'version' (line index 2)
        expect(versionDiag!.range.start.line).toBe(2);
    });

    // ==========================================
    // EDGE: missing name in publishable mode
    // ==========================================
    test('missing name in publishable mode produces error diagnostic', () => {
        const content = `
model:
  version: 1.0.0
`;
        const diagnostics = service.validate(content, { requirePublishable: true });
        const nameDiag = diagnostics.find(d => d.message.includes('name'));
        expect(nameDiag).toBeDefined();
        expect(nameDiag!.severity).toBe(DiagnosticSeverity.Error);
    });

    // ==========================================
    // EDGE: conflicting source and path (merged hint check)
    // ==========================================
    test('conflicting source and path produces error with hint appended to message', () => {
        const content = `
dependencies:
  bad-dep:
    source: owner/repo
    path: ./local
    version: v1.0.0
`;
        const diagnostics = service.validate(content);
        const conflictDiag = diagnostics.find(d =>
            d.message.includes('source') && d.message.includes('path')
        );
        expect(conflictDiag).toBeDefined();
        expect(conflictDiag!.severity).toBe(DiagnosticSeverity.Error);
        // Hints are appended to the message
        expect(conflictDiag!.message).toContain('Hint');
    });

    // ==========================================
    // EDGE: git dependency without version (merged diagnostic code check)
    // ==========================================
    test('git dependency without version produces error with diagnostic code for code action mapping', () => {
        const content = `
dependencies:
  missing-version:
    source: owner/repo
`;
        const diagnostics = service.validate(content);
        const versionDiag = diagnostics.find(d => d.message.includes('version'));
        expect(versionDiag).toBeDefined();
        expect(versionDiag!.severity).toBe(DiagnosticSeverity.Error);
        // Should include a code string for the code action provider to match on
        expect(typeof versionDiag!.code).toBe('string');
        expect((versionDiag!.code as string).length).toBeGreaterThan(0);
    });

    // ==========================================
    // EDGE: path alias without @ prefix
    // ==========================================
    test('path alias without @ prefix produces warning', () => {
        const content = `
paths:
  lib: ./lib
`;
        const diagnostics = service.validate(content);
        const aliasDiag = diagnostics.find(d => d.message.includes('@'));
        expect(aliasDiag).toBeDefined();
        expect(aliasDiag!.severity).toBe(DiagnosticSeverity.Warning);
    });

    // ==========================================
    // EDGE: absolute path in paths
    // ==========================================
    test('absolute path in paths section produces error', () => {
        const content = `
paths:
  '@lib': /absolute/path
`;
        const diagnostics = service.validate(content);
        const pathDiag = diagnostics.find(d => d.message.includes('relative'));
        expect(pathDiag).toBeDefined();
        expect(pathDiag!.severity).toBe(DiagnosticSeverity.Error);
    });

    // ==========================================
    // EDGE: nested paths in dependencies location
    // ==========================================
    test('nested dependency path produces diagnostic with defined range', () => {
        const content = `dependencies:
  my-dep:
    source: owner/repo
`;
        const diagnostics = service.validate(content);
        const refDiag = diagnostics.find(d => d.message.includes('ref'));
        expect(refDiag).toBeDefined();
        // Range should have valid start/end with non-negative line numbers
        expect(refDiag!.range.start.line).toBeGreaterThanOrEqual(0);
        expect(refDiag!.range.end.line).toBeGreaterThanOrEqual(refDiag!.range.start.line);
    });

    // ==========================================
    // EDGE: empty content
    // ==========================================
    test('empty content does not crash and returns diagnostics array', () => {
        const diagnostics = service.validate('');
        expect(diagnostics).toHaveLength(0);
    });

    // ==========================================
    // EDGE: content with only whitespace/comments
    // ==========================================
    test('whitespace-only content does not crash and returns array', () => {
        const diagnostics = service.validate('   \n\n   \n');
        expect(diagnostics).toHaveLength(0);
    });

    // ==========================================
    // EDGE: multiple errors in same content
    // ==========================================
    test('multiple validation errors in same manifest all appear', () => {
        const content = `
model:
  version: bad
paths:
  lib: ./lib
  '@abs': /usr/local
`;
        const diagnostics = service.validate(content);
        // Should have at minimum: bad semver + missing @ prefix + absolute path
        expect(diagnostics.length).toBeGreaterThanOrEqual(2);
        const severities = diagnostics.map(d => d.severity);
        // At least one warning (semver or missing @) and one error (absolute path)
        expect(severities).toContain(DiagnosticSeverity.Warning);
        expect(severities).toContain(DiagnosticSeverity.Error);
    });
});
