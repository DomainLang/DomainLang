/**
 * Tests for DomainLangCodeActionProvider.
 *
 * Organized around three behavioural concepts:
 *  - Dispatch: each known diagnostic code produces exactly one correctly-shaped action.
 *  - No-op guards: malformed or unknown diagnostics produce zero actions.
 *  - Source independence: dispatch is driven by diagnostic.code, not diagnostic.source.
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

    const getCodeActions = async (diagnostic: Diagnostic): Promise<CodeAction[]> => {
        const provider = testServices.services.DomainLang.lsp.CodeActionProvider;
        if (!provider) throw new Error('CodeActionProvider not available');

        const document = await testServices.parse(`Domain Test {}`);
        const params: CodeActionParams = {
            textDocument: { uri: document.textDocument.uri },
            range: diagnostic.range,
            context: { diagnostics: [diagnostic], triggerKind: 1 }
        };
        const result = await provider.getCodeActions(document, params);
        return (result ?? []).filter((item): item is CodeAction => 'title' in item);
    };

    const makeDiagnostic = (
        code: string | undefined,
        data?: Record<string, unknown>,
        source = 'domain-lang'
    ): Diagnostic => ({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: 'Test diagnostic',
        severity: DiagnosticSeverity.Error,
        source,
        ...(code !== undefined ? { code } : {}),
        ...(data !== undefined ? { data } : {})
    });

    // ==========================================
    // Dispatch: known code -> exactly one action with correct shape.
    // ==========================================
    interface DispatchCase {
        readonly name: string;
        readonly code: string;
        readonly data: Record<string, unknown>;
        readonly titleFragments: readonly string[];
        readonly command: string;
        readonly args: readonly unknown[];
        readonly isPreferred: boolean;
    }

    const dispatchCases: readonly DispatchCase[] = [
        {
            name: 'ImportNotInManifest -> addDependency (preferred)',
            code: IssueCodes.ImportNotInManifest,
            data: { alias: 'mypackage' },
            titleFragments: ['Add', 'mypackage', 'model.yaml'],
            command: 'domainlang.addDependency',
            args: ['mypackage'],
            isPreferred: true
        },
        {
            name: 'ImportRequiresManifest -> createManifest (preferred)',
            code: IssueCodes.ImportRequiresManifest,
            data: { specifier: 'owner/package' },
            titleFragments: ['Create', 'model.yaml', 'owner'],
            command: 'domainlang.createManifest',
            args: ['owner', 'owner/package'],
            isPreferred: true
        },
        {
            name: 'ImportNotInstalled -> install (preferred)',
            code: IssueCodes.ImportNotInstalled,
            data: { alias: 'uninstalled' },
            titleFragments: ['install', 'uninstalled'],
            command: 'domainlang.install',
            args: [],
            isPreferred: true
        },
        {
            name: 'ImportMissingRef -> addRef (not preferred)',
            code: IssueCodes.ImportMissingRef,
            data: { alias: 'noref' },
            titleFragments: ['ref', 'noref'],
            command: 'domainlang.addRef',
            args: ['noref'],
            isPreferred: false
        }
    ];

    test.each(dispatchCases)('dispatch: $name', async ({ code, data, titleFragments, command, args, isPreferred }) => {
        // Arrange
        const diagnostic = makeDiagnostic(code, data);

        // Act
        const actions = await getCodeActions(diagnostic);

        // Assert
        expect(actions).toHaveLength(1);
        const [action] = actions;
        for (const fragment of titleFragments) {
            expect(action.title).toContain(fragment);
        }
        expect(action.command?.command).toBe(command);
        expect(action.command?.arguments ?? []).toEqual(args);
        expect(action.isPreferred).toBe(isPreferred);
    });

    // ==========================================
    // No-op guards: malformed / unknown diagnostics produce no actions.
    // ==========================================
    const noOpCases: ReadonlyArray<{ name: string; diagnostic: Diagnostic }> = [
        {
            name: 'unknown diagnostic code',
            diagnostic: makeDiagnostic('unknown-code', { alias: 'x' })
        },
        {
            name: 'diagnostic without data property',
            diagnostic: makeDiagnostic(IssueCodes.ImportNotInManifest)
        },
        {
            name: 'alias-based code with missing alias',
            diagnostic: makeDiagnostic(IssueCodes.ImportNotInManifest, {})
        },
        {
            name: 'diagnostic without code',
            diagnostic: makeDiagnostic(undefined, { alias: 'x' })
        }
    ];

    test.each(noOpCases)('no-op: $name produces zero actions', async ({ diagnostic }) => {
        // Act
        const actions = await getCodeActions(diagnostic);

        // Assert
        expect(actions).toHaveLength(0);
    });

    // ==========================================
    // Source independence: dispatch keyed on code, not source.
    // ==========================================
    test('dispatch ignores diagnostic.source when code matches', async () => {
        // Arrange - same payload as ImportNotInManifest dispatch but foreign source
        const diagnostic = makeDiagnostic(
            IssueCodes.ImportNotInManifest,
            { alias: 'something' },
            'eslint'
        );

        // Act
        const actions = await getCodeActions(diagnostic);

        // Assert
        expect(actions).toHaveLength(1);
        expect(actions[0].command?.command).toBe('domainlang.addDependency');
    });
});
