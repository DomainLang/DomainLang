/**
 * ImportResolver Tests
 *
 * Tests import resolution: relative local, path alias, @/ implicit alias,
 * directory-first vs file fallback, and error handling for unknown imports.
 *
 * ~20% smoke (basic relative local), ~80% edge (missing file, unknown alias,
 * directory-first precedence, same specifier different workspace).
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import { createDomainLangServices } from '../../src/domain-lang-module.js';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { setLspRuntimeSettings } from '../../src/services/lsp-runtime-settings.js';

let resolver: ReturnType<typeof createDomainLangServices>["DomainLang"]["imports"]["ImportResolver"];
let tempDir: string;

async function writeFile(filePath: string, content = ''): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
}

describe('ImportResolver (PRS-010 Phase 3)', () => {
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-import-resolver-'));
        const servicesLocal = createDomainLangServices(EmptyFileSystem).DomainLang;
        resolver = servicesLocal.imports.ImportResolver;
        setLspRuntimeSettings({ traceImports: false, infoLogs: false });
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    // ========================================================================
    // Smoke: basic relative resolve (~20%)
    // ========================================================================

    test('smoke: resolves relative local imports without manifest', async () => {
        // Arrange
        const base = path.join(tempDir, 'proj');
        const types = path.join(base, 'types.dlang');
        await writeFile(types, 'Domain X {}');

        // Act
        const uri = await resolver.resolveFrom(base, './types.dlang');

        // Assert
        expect(uri.fsPath).toBe(types);
    });

    // ========================================================================
    // Edge: error handling
    // ========================================================================

    interface ErrorHandlingCase {
        readonly scenario: string;
        readonly setup: (base: string) => Promise<void>;
        readonly specifier: string;
        readonly expectedErrorPattern: RegExp;
    }

    const errorCases: readonly ErrorHandlingCase[] = [
        {
            scenario: 'external import without manifest produces error',
            setup: async base => {
                await fs.mkdir(base, { recursive: true });
            },
            specifier: 'acme/core',
            expectedErrorPattern: /requires model\.yaml/i,
        },
        {
            scenario: 'unknown path alias produces helpful error',
            setup: async base => {
                await writeFile(path.join(base, 'model.yaml'), 'model:\n  name: sample\n');
            },
            specifier: '@unknown/stuff',
            expectedErrorPattern: /unknown path alias.*@unknown/i,
        },
        {
            scenario: 'relative import to non-existent file throws',
            setup: async base => {
                await fs.mkdir(base, { recursive: true });
            },
            specifier: './nonexistent.dlang',
            expectedErrorPattern: /Cannot resolve|not found|does not exist/i,
        },
        {
            scenario: 'invalid file extension produces helpful error',
            setup: async base => {
                await writeFile(path.join(base, 'types.txt'), 'not a dlang file');
            },
            specifier: './types.txt',
            expectedErrorPattern: /invalid file extension/i,
        },
        {
            scenario: 'external dependency not installed produces error',
            setup: async base => {
                const manifest = 'model:\n  name: sample\n  version: 1.0.0\ndependencies:\n  acme/core: "v1.0.0"\n';
                await writeFile(path.join(base, 'model.yaml'), manifest);
            },
            specifier: 'acme/core',
            expectedErrorPattern: /not installed/i,
        },
    ];

    test.each(errorCases)('$scenario', async ({ setup, specifier, expectedErrorPattern }) => {
        // Arrange
        const base = path.join(tempDir, `error-test-${Math.random()}`);
        await setup(base);

        // Act & Assert
        await expect(resolver.resolveFrom(base, specifier))
            .rejects.toThrow(expectedErrorPattern);
    });

    // ========================================================================
    // Edge: path alias resolution
    // ========================================================================

    describe('Edge: path alias resolution', () => {

        test('resolves path alias from manifest (monorepo support)', async () => {
            // Arrange
            const base = path.join(tempDir, 'proj');
            const manifest = `model:\n  name: sample\npaths:\n  "@shared": ./shared\n`;
            await writeFile(path.join(base, 'model.yaml'), manifest);
            const sharedIndex = path.join(base, 'shared', 'index.dlang');
            const sharedTypes = path.join(base, 'shared', 'types.dlang');
            await writeFile(sharedIndex, 'Domain Shared {}');
            await writeFile(sharedTypes, 'Domain Types {}');

            // Act
            const indexUri = await resolver.resolveFrom(base, '@shared');
            const typesUri = await resolver.resolveFrom(base, '@shared/types.dlang');

            // Assert
            expect(indexUri.fsPath).toBe(sharedIndex);
            expect(typesUri.fsPath).toBe(sharedTypes);
        });

        interface ImplicitAliasCase {
            readonly scenario: string;
            readonly specifier: string;
            readonly files: Array<{ path: string; content: string }>;
            readonly expectedPath: string;
        }

        const implicitAliasCases: readonly ImplicitAliasCase[] = [
            {
                scenario: 'resolves implicit @/ alias to workspace root',
                specifier: '@/lib/utils.dlang',
                files: [{ path: 'lib/utils.dlang', content: 'Domain Utils {}' }],
                expectedPath: 'lib/utils.dlang',
            },
            {
                scenario: 'resolves to subdirectory index.dlang',
                specifier: '@/shared',
                files: [{ path: 'shared/index.dlang', content: 'Domain Shared {}' }],
                expectedPath: 'shared/index.dlang',
            },
        ];

        test.each(implicitAliasCases)('$scenario', async ({ specifier, files, expectedPath }) => {
            // Arrange
            const base = path.join(tempDir, `implicit-alias-${Math.random()}`);
            const manifest = `model:\n  name: sample\n`;
            await writeFile(path.join(base, 'model.yaml'), manifest);

            for (const file of files) {
                await writeFile(path.join(base, file.path), file.content);
            }

            // Act
            const uri = await resolver.resolveFrom(base, specifier);

            // Assert
            expect(uri.fsPath).toBe(path.join(base, expectedPath));
        });
    });

    // ========================================================================
    // Edge: directory-first resolution
    // ========================================================================

    describe('Edge: directory-first resolution', () => {

        interface DirectoryFirstCase {
            readonly scenario: string;
            readonly files: Array<{ path: string; content: string }>;
            readonly specifier: string;
            readonly expectedFile: string;
        }

        const directoryFirstCases: readonly DirectoryFirstCase[] = [
            {
                scenario: 'file fallback when no directory exists',
                files: [{ path: 'types.dlang', content: 'Domain Types {}' }],
                specifier: './types',
                expectedFile: 'types.dlang',
            },
            {
                scenario: 'directory-first prefers index.dlang over .dlang file',
                files: [
                    { path: 'types/index.dlang', content: 'Domain TypesIndex {}' },
                    { path: 'types.dlang', content: 'Domain TypesFile {}' },
                ],
                specifier: './types',
                expectedFile: 'types/index.dlang',
            },
            {
                scenario: 'explicit .dlang extension resolves directly',
                files: [
                    { path: 'types.dlang', content: 'Domain Types {}' },
                    { path: 'types/index.dlang', content: 'Domain TypesIndex {}' },
                ],
                specifier: './types.dlang',
                expectedFile: 'types.dlang',
            },
        ];

        test.each(directoryFirstCases)('$scenario', async ({ files, specifier, expectedFile }) => {
            // Arrange
            const base = path.join(tempDir, `dir-first-${Math.random()}`);
            for (const file of files) {
                await writeFile(path.join(base, file.path), file.content);
            }

            // Act
            const uri = await resolver.resolveFrom(base, specifier);

            // Assert
            expect(uri.fsPath).toBe(path.join(base, expectedFile));
        });
    });

    // ========================================================================
    // Edge: relative path variants
    // ========================================================================

    describe('Edge: relative path variants', () => {

        test('resolves from subdirectory with parent reference', async () => {
            // Arrange
            const base = path.join(tempDir, 'proj');
            const sharedFile = path.join(base, 'shared.dlang');
            await writeFile(sharedFile, 'Domain Shared {}');
            const subDir = path.join(base, 'sub');
            await fs.mkdir(subDir, { recursive: true });

            // Act
            const uri = await resolver.resolveFrom(subDir, '../shared.dlang');

            // Assert
            expect(uri.fsPath).toBe(sharedFile);
        });

        test('resolves deeply nested relative import', async () => {
            // Arrange
            const base = path.join(tempDir, 'proj');
            const nestedFile = path.join(base, 'a', 'b', 'c', 'deep.dlang');
            await writeFile(nestedFile, 'Domain Deep {}');

            // Act
            const uri = await resolver.resolveFrom(base, './a/b/c/deep.dlang');

            // Assert
            expect(uri.fsPath).toBe(nestedFile);
        });
    });

    // ========================================================================
    // Edge: trace flag parsing
    // ========================================================================

    describe('Edge: trace flag parsing', () => {
        test('traceImports=false does not emit trace logs', async () => {
            // Arrange
            setLspRuntimeSettings({ traceImports: false });
            const base = path.join(tempDir, 'trace-off');
            const target = path.join(base, 'types.dlang');
            await writeFile(target, 'Domain X {}');
            const doc = { uri: URI.file(path.join(base, 'main.dlang')) } as LangiumDocument;
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            // Act
            await resolver.resolveForDocument(doc, './types.dlang');

            // Assert
            const traceCalls = warnSpy.mock.calls
                .flat()
                .filter(arg => typeof arg === 'string' && arg.includes('[ImportResolver]'));
            expect(traceCalls).toHaveLength(0);

            warnSpy.mockRestore();
        });

        test('traceImports=true emits trace logs', async () => {
            // Arrange
            setLspRuntimeSettings({ traceImports: true });
            const base = path.join(tempDir, 'trace-on');
            const target = path.join(base, 'types.dlang');
            await writeFile(target, 'Domain X {}');
            const doc = { uri: URI.file(path.join(base, 'main.dlang')) } as LangiumDocument;
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            // Act
            await resolver.resolveForDocument(doc, './types.dlang');

            // Assert
            const traceCalls = warnSpy.mock.calls
                .flat()
                .filter(arg => typeof arg === 'string' && arg.includes('ImportResolver'));
            expect(traceCalls.length).toBeGreaterThan(0);

            warnSpy.mockRestore();
        });
    });

    // ========================================================================
    // Security: workspace boundary enforcement
    // ========================================================================

    describe('Security: workspace boundary enforcement', () => {
        test('rejects import that escapes workspace root when manifest is present', async () => {
            // Arrange - workspace with model.yaml at proj root
            const proj = path.join(tempDir, 'proj-secured');
            await writeFile(path.join(proj, 'model.yaml'), 'model:\n  name: secured\n');
            await writeFile(path.join(proj, 'main.dlang'), '');

            // Act & Assert
            await expect(
                resolver.resolveFrom(proj, '../../outside.dlang')
            ).rejects.toMatchObject({
                reason: 'escapes-workspace',
            });
        });

        test('allows parent-reference import in standalone mode (no manifest)', async () => {
            // Arrange - no model.yaml, standalone mode
            const base = path.join(tempDir, 'standalone', 'sub');
            const parentFile = path.join(tempDir, 'standalone', 'shared.dlang');
            await writeFile(parentFile, 'Domain Shared {}');
            await fs.mkdir(base, { recursive: true });

            // Act
            const uri = await resolver.resolveFrom(base, '../shared.dlang');

            // Assert
            expect(uri.fsPath).toBe(parentFile);
        });
    });
});