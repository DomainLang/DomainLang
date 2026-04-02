import { describe, test, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { URI } from 'langium';
import { ImportValidator } from '../../src/validation/import.js';
import type { ImportStatement } from '../../src/generated/ast.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockServices = {
    imports: {
        ManifestManager: { getWorkspaceRoot: () => string };
        ImportResolver: { resolveFrom: (dir: string, uri: string) => Promise<URI> };
    };
    shared: { workspace: { IndexManager: { getCycleForDocument: (uri: string) => string[] | undefined } } };
};

type ValidatorPrivate = {
    validateLocalPathDependency: (dependencyPath: string, alias: string, accept: unknown, imp: unknown) => void;
    checkImportCycle: (doc: unknown, imp: unknown, accept: unknown) => void;
    validateImportResolves: (imp: unknown, doc: unknown, accept: unknown) => Promise<boolean>;
};

/** Minimal mock services object for ImportValidator construction. */
function makeServices({
    getWorkspaceRoot = (): string => '/workspace',
    resolveFrom = async (_dir: string, uri: string): Promise<URI> =>
        URI.file(path.resolve('/workspace', uri)),
    getCycleForDocument = (_uri: string): string[] | undefined => undefined,
}: {
    getWorkspaceRoot?: () => string;
    resolveFrom?: (dir: string, uri: string) => Promise<URI>;
    getCycleForDocument?: (uri: string) => string[] | undefined;
} = {}): MockServices {
    return {
        imports: {
            ManifestManager: { getWorkspaceRoot },
            ImportResolver: { resolveFrom },
        },
        shared: {
            workspace: {
                IndexManager: { getCycleForDocument },
            },
        },
    };
}

/** Minimal ImportStatement-shaped node. */
function makeImp(uri: string): ImportStatement {
    return { uri, $type: 'ImportStatement', $container: undefined } as unknown as ImportStatement;
}

/** Minimal LangiumDocument-shaped object with a file URI. */
function makeDoc(fsPath: string): { uri: URI } {
    return { uri: URI.file(fsPath) };
}

// ---------------------------------------------------------------------------
// B-001: Silent catch swallows security boundary check
// ---------------------------------------------------------------------------

describe('B-001: workspace boundary check failure is treated as a validation error', () => {
    test('emits error when getWorkspaceRoot throws instead of silently allowing the import', () => {
        // Arrange
        const accept = vi.fn();
        const services = makeServices({
            getWorkspaceRoot: () => {
                throw new Error('workspace not initialized');
            },
        });
        const validator = new ImportValidator(services as never);
        const imp = makeImp('shared/types');

        // Act — call the private method directly
        (validator as unknown as ValidatorPrivate).validateLocalPathDependency(
            './shared',
            'shared',
            accept,
            imp
        );

        // Assert — must report an error, not silently pass
        expect(accept).toHaveBeenCalledWith(
            'error',
            expect.stringContaining('escapes workspace'),
            expect.any(Object)
        );
    });
});

// ---------------------------------------------------------------------------
// R-008: Cycle detection must use full URIs, not basenames
// ---------------------------------------------------------------------------

describe('R-008: cycle detection distinguishes files with identical names in different directories', () => {
    let validator: ImportValidator;

    beforeAll(() => {
        // Cycle is in src/: types.dlang in src/ cycles with b.dlang in src/
        const cycleUris = [
            URI.file('/workspace/src/types.dlang').toString(),
            URI.file('/workspace/src/b.dlang').toString(),
        ];
        const services = makeServices({
            getCycleForDocument: () => cycleUris,
        });
        validator = new ImportValidator(services as never);
    });

    test('does not report a cycle for a different types.dlang in a different directory', () => {
        // Arrange — file in test/ imports ./types.dlang (resolves to /workspace/test/types.dlang)
        const accept = vi.fn();
        const doc = makeDoc('/workspace/test/a.dlang');
        const imp = makeImp('./types.dlang');

        // Act
        (validator as unknown as ValidatorPrivate).checkImportCycle(doc, imp, accept);

        // Assert — /workspace/test/types.dlang is NOT in the cycle; should NOT fire
        expect(accept).not.toHaveBeenCalled();
    });

    test('does report a cycle for the exact types.dlang that is part of the cycle', () => {
        // Arrange — file in src/ imports ./types.dlang (resolves to /workspace/src/types.dlang, IN the cycle)
        const accept = vi.fn();
        const doc = makeDoc('/workspace/src/a.dlang');
        const imp = makeImp('./types.dlang');

        // Act
        (validator as unknown as ValidatorPrivate).checkImportCycle(doc, imp, accept);

        // Assert — /workspace/src/types.dlang IS in the cycle; must fire
        expect(accept).toHaveBeenCalledWith(
            'warning',
            expect.stringContaining('cycle detected'),
            expect.any(Object)
        );
    });
});

// ---------------------------------------------------------------------------
// R-009: validateImportResolves must reject non-.dlang resolved files
// ---------------------------------------------------------------------------

describe('R-009: resolved import file must have .dlang extension', () => {
    test('emits a descriptive error when the resolved file exists but is not .dlang', async () => {
        // Arrange — resolver returns a real .json file
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-r009-'));
        try {
            const jsonFile = path.join(tempDir, 'config.json');
            await fs.writeFile(jsonFile, '{}');

            const accept = vi.fn();
            const services = makeServices({
                resolveFrom: async () => URI.file(jsonFile),
            });
            const validator = new ImportValidator(services as never);
            const imp = makeImp('./config.json');
            const doc = makeDoc(path.join(tempDir, 'test.dlang'));

            // Act
            const hadError = await (validator as unknown as ValidatorPrivate).validateImportResolves(
                imp,
                doc,
                accept
            );

            // Assert
            expect(hadError).toBe(true);
            expect(accept).toHaveBeenCalledWith(
                'error',
                expect.stringContaining('.dlang required'),
                expect.any(Object)
            );
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    test('does not emit an extension error for a valid .dlang file', async () => {
        // Arrange — resolver returns a real .dlang file
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-r009-ok-'));
        try {
            const dlangFile = path.join(tempDir, 'types.dlang');
            await fs.writeFile(dlangFile, 'Domain Types { vision: "Types" }');

            const accept = vi.fn();
            const services = makeServices({
                resolveFrom: async () => URI.file(dlangFile),
            });
            const validator = new ImportValidator(services as never);
            const imp = makeImp('./types.dlang');
            const doc = makeDoc(path.join(tempDir, 'test.dlang'));

            // Act
            const hadError = await (validator as unknown as ValidatorPrivate).validateImportResolves(
                imp,
                doc,
                accept
            );

            // Assert — no error should be emitted
            expect(hadError).toBe(false);
            expect(accept).not.toHaveBeenCalled();
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });
});
