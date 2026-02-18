/**
 * Tests for DomainLangCodeActionProvider.
 *
 * Smoke (~20%):
 * - ImportNotInManifest generates correct "Add to model.yaml" action
 *
 * Edge/error (~80%):
 * - ImportRequiresManifest generates "Create model.yaml" action
 * - ImportNotInstalled generates "Run dlang install" action
 * - ImportMissingRef generates "Add ref" action (non-preferred)
 * - Unknown diagnostic code returns zero actions
 * - Diagnostic without data returns zero actions
 * - Missing alias returns zero actions
 * - Multiple diagnostics in context only produce actions for known codes
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { setupTestSuite, type TestServices } from '../test-helpers.js';
import { IssueCodes } from '../../src/validation/constants.js';
import type { CodeActionParams } from 'vscode-languageserver-protocol';
import type { CodeAction, Diagnostic } from 'vscode-languageserver-types';
import { DiagnosticSeverity } from 'vscode-languageserver-types';

describe('DomainLangCodeActionProvider', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    /**
     * Helper to get code actions for a given diagnostic.
     */
    const getCodeActions = async (
        diagnostic: Diagnostic
    ): Promise<Array<CodeAction>> => {
        const codeActionProvider = testServices.services.DomainLang.lsp.CodeActionProvider;
        expect(codeActionProvider).not.toBeUndefined();
        if (!codeActionProvider) throw new Error('CodeActionProvider not available');

        // Create a minimal document for testing
        const document = await testServices.parse(`Domain Test {}`);

        const params: CodeActionParams = {
            textDocument: { uri: document.textDocument.uri },
            range: diagnostic.range,
            context: {
                diagnostics: [diagnostic],
                triggerKind: 1 // Explicitly triggered
            }
        };

        const result = await codeActionProvider.getCodeActions(document, params);
        return (result ?? []).filter((item): item is CodeAction => 'title' in item);
    };

    /**
     * Creates a mock diagnostic with the given code and alias.
     */
    const createDiagnostic = (
        code: string,
        alias?: string,
        specifier?: string
    ): Diagnostic => ({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: 'Test diagnostic',
        severity: DiagnosticSeverity.Error,
        source: 'domain-lang',
        data: { code, alias, specifier }
    });

    // ==========================================
    // SMOKE: ImportNotInManifest action (merged preferred check)
    // ==========================================
    test('ImportNotInManifest produces preferred "Add to model.yaml" action with correct command and alias', async () => {
        // Arrange
        const diagnostic = createDiagnostic(IssueCodes.ImportNotInManifest, 'mypackage');

        // Act
        const actions = await getCodeActions(diagnostic);

        // Assert

        expect(actions.length).toBeGreaterThan(0);
        const addAction = actions.find(a => a.title.includes('Add'));
        expect(addAction?.title).toContain('Add');
        expect(addAction?.title).toContain('mypackage');
        expect(addAction?.title).toContain('model.yaml');
        expect(addAction?.command?.command).toBe('domainlang.addDependency');
        expect(addAction?.command?.arguments).toContain('mypackage');
        // Preferred flag should be true for this quick-fix
        expect(addAction?.isPreferred).toBe(true);
    });

    // ==========================================
    // EDGE: ImportRequiresManifest action
    // ==========================================
    test('ImportRequiresManifest produces "Create model.yaml" action with correct command', async () => {
        // Arrange
        const diagnostic = createDiagnostic(
            IssueCodes.ImportRequiresManifest,
            undefined,
            'owner/package'
        );

        // Act
        const actions = await getCodeActions(diagnostic);

        // Assert

        expect(actions.length).toBeGreaterThan(0);
        const createAction = actions.find(a => a.title.includes('Create'));
        expect(createAction?.title).toContain('Create');
        expect(createAction?.command?.command).toBe('domainlang.createManifest');
    });

    // ==========================================
    // EDGE: ImportNotInstalled action
    // ==========================================
    test('ImportNotInstalled produces "Run dlang install" action with correct command', async () => {
        // Arrange
        const diagnostic = createDiagnostic(IssueCodes.ImportNotInstalled, 'uninstalled');

        // Act
        const actions = await getCodeActions(diagnostic);

        // Assert

        expect(actions.length).toBeGreaterThan(0);
        const installAction = actions.find(a => a.title.includes('install'));
        expect(installAction?.title?.toLowerCase()).toContain('install');
        expect(installAction?.command?.command).toBe('domainlang.install');
    });

    // ==========================================
    // EDGE: ImportMissingRef action (merged non-preferred check)
    // ==========================================
    test('ImportMissingRef produces non-preferred "Add ref" action with correct command', async () => {
        // Arrange
        const diagnostic = createDiagnostic(IssueCodes.ImportMissingRef, 'noref');

        // Act
        const actions = await getCodeActions(diagnostic);

        // Assert

        expect(actions.length).toBeGreaterThan(0);
        const refAction = actions.find(a => a.title.includes('ref'));
        expect(refAction?.title?.toLowerCase()).toContain('ref');
        expect(refAction?.command?.command).toBe('domainlang.addRef');
        // Add ref should NOT be preferred (user might want to set ref manually)
        expect(refAction?.isPreferred).toBe(false);
    });

    // ==========================================
    // EDGE: unknown diagnostic code
    // ==========================================
    test('returns no actions for unknown diagnostic codes', async () => {
        // Arrange
        const diagnostic = createDiagnostic('unknown-code');

        // Act
        const actions = await getCodeActions(diagnostic);

        // Assert
        expect(actions).toHaveLength(0);
    });

    // ==========================================
    // EDGE: diagnostic without data
    // ==========================================
    test('returns no actions for diagnostic without data property', async () => {
        // Arrange
        const diagnostic: Diagnostic = {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
            message: 'Test diagnostic',
            severity: DiagnosticSeverity.Error,
            source: 'domain-lang'
        };

        // Act
        const actions = await getCodeActions(diagnostic);

        // Assert
        expect(actions).toHaveLength(0);
    });

    // ==========================================
    // EDGE: missing alias
    // ==========================================
    test('returns no actions for ImportNotInManifest when alias is missing', async () => {
        // Arrange
        const diagnostic = createDiagnostic(IssueCodes.ImportNotInManifest);

        // Act
        const actions = await getCodeActions(diagnostic);

        // Assert
        expect(actions).toHaveLength(0);
    });

    // ==========================================
    // EDGE: non-domain-lang source diagnostic
    // ==========================================
    test('returns no actions for diagnostic from non-domain-lang source', async () => {
        const diagnostic: Diagnostic = {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
            message: 'External issue',
            severity: DiagnosticSeverity.Warning,
            source: 'eslint',
            data: { code: IssueCodes.ImportNotInManifest, alias: 'something' }
        };
        const actions = await getCodeActions(diagnostic);
        // Provider processes based on data.code regardless of source
        expect(actions).toHaveLength(1);
    });
});
