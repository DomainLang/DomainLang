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
import { describe, test, beforeEach, afterEach, expect } from 'vitest';
import { createDomainLangServices } from '../../src/domain-lang-module.js';
import { EmptyFileSystem } from 'langium';

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
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    // ========================================================================
    // Smoke: basic relative resolve (~20%)
    // ========================================================================

    test('resolves relative local imports without manifest', async () => {
        const base = path.join(tempDir, 'proj');
        const types = path.join(base, 'types.dlang');
        await writeFile(types, 'Domain X {}');

        const uri = await resolver.resolveFrom(base, './types.dlang');
        expect(uri.fsPath).toBe(types);
    });

    // ========================================================================
    // Edge: error handling
    // ========================================================================

    describe('Edge: error handling', () => {

        test('external import without manifest produces error', async () => {
            const base = path.join(tempDir, 'no-manifest');
            await fs.mkdir(base, { recursive: true });

            await expect(resolver.resolveFrom(base, 'acme/core'))
                .rejects.toThrow(/requires model\.yaml/i);
        });

        test('unknown path alias produces helpful error', async () => {
            const base = path.join(tempDir, 'proj');
            const manifest = `model:\n  name: sample\n`;
            await writeFile(path.join(base, 'model.yaml'), manifest);

            await expect(resolver.resolveFrom(base, '@unknown/stuff'))
                .rejects.toThrow(/unknown path alias.*@unknown/i);
        });

        test('relative import to non-existent file throws', async () => {
            const base = path.join(tempDir, 'proj');
            await fs.mkdir(base, { recursive: true });

            await expect(resolver.resolveFrom(base, './nonexistent.dlang'))
                .rejects.toThrow();
        });

        test('invalid file extension produces helpful error', async () => {
            // Arrange - imports.md: "Invalid file extension '.txt' in import './types.txt'"
            const base = path.join(tempDir, 'bad-ext');
            await writeFile(path.join(base, 'types.txt'), 'not a dlang file');

            // Act & Assert
            await expect(resolver.resolveFrom(base, './types.txt'))
                .rejects.toThrow(/Invalid file extension/i);
        });

        test('relative import to non-existent file produces file-not-found error', async () => {
            // Arrange - imports.md: "Import file not found: './types.dlang'"
            const base = path.join(tempDir, 'missing-file');
            await fs.mkdir(base, { recursive: true });

            // Act & Assert
            await expect(resolver.resolveFrom(base, './types.dlang'))
                .rejects.toThrow();
        });

        test('external dependency not in model.yaml or not installed produces error', async () => {
            // Arrange - imports.md: "Dependency 'patterns' not found in model.yaml"
            const base = path.join(tempDir, 'dep-not-found');
            const manifest = `model:\n  name: sample\n  version: 1.0.0\ndependencies:\n  acme/core: "v1.0.0"\n`;
            await writeFile(path.join(base, 'model.yaml'), manifest);

            // Act & Assert - try to resolve a dep that's declared but not installed
            await expect(resolver.resolveFrom(base, 'acme/core'))
                .rejects.toThrow(/not installed/i);
        });
    });

    // ========================================================================
    // Edge: path alias resolution
    // ========================================================================

    describe('Edge: path alias resolution', () => {

        test('resolves path alias from manifest (monorepo support)', async () => {
            const base = path.join(tempDir, 'proj');
            const manifest = `model:\n  name: sample\npaths:\n  "@shared": ./shared\n`;
            await writeFile(path.join(base, 'model.yaml'), manifest);
            const sharedIndex = path.join(base, 'shared', 'index.dlang');
            const sharedTypes = path.join(base, 'shared', 'types.dlang');
            await writeFile(sharedIndex, 'Domain Shared {}');
            await writeFile(sharedTypes, 'Domain Types {}');

            const indexUri = await resolver.resolveFrom(base, '@shared');
            const typesUri = await resolver.resolveFrom(base, '@shared/types.dlang');

            expect(indexUri.fsPath).toBe(sharedIndex);
            expect(typesUri.fsPath).toBe(sharedTypes);
        });

        test('resolves implicit @/ alias to workspace root (PRS-010)', async () => {
            const base = path.join(tempDir, 'proj');
            const manifest = `model:\n  name: sample\n`;  // No paths section
            await writeFile(path.join(base, 'model.yaml'), manifest);
            const libUtils = path.join(base, 'lib', 'utils.dlang');
            await writeFile(libUtils, 'Domain Utils {}');

            const uri = await resolver.resolveFrom(base, '@/lib/utils.dlang');
            expect(uri.fsPath).toBe(libUtils);
        });

        test('implicit @/ alias resolves to subdirectory index.dlang', async () => {
            const base = path.join(tempDir, 'proj');
            const manifest = `model:\n  name: sample\n`;
            await writeFile(path.join(base, 'model.yaml'), manifest);
            const indexFile = path.join(base, 'shared', 'index.dlang');
            await writeFile(indexFile, 'Domain Shared {}');

            const uri = await resolver.resolveFrom(base, '@/shared');
            expect(uri.fsPath).toBe(indexFile);
        });
    });

    // ========================================================================
    // Edge: directory-first resolution
    // ========================================================================

    describe('Edge: directory-first resolution', () => {

        test('file fallback when no directory exists', async () => {
            const base = path.join(tempDir, 'proj');
            const typesFile = path.join(base, 'types.dlang');
            await writeFile(typesFile, 'Domain Types {}');
            // NOT creating types/ directory

            const uri = await resolver.resolveFrom(base, './types');
            expect(uri.fsPath).toBe(typesFile);
        });

        test('directory-first prefers index.dlang over .dlang file', async () => {
            const base = path.join(tempDir, 'proj');
            const typesIndex = path.join(base, 'types', 'index.dlang');
            const typesFile = path.join(base, 'types.dlang');
            await writeFile(typesIndex, 'Domain TypesIndex {}');
            await writeFile(typesFile, 'Domain TypesFile {}');

            const uri = await resolver.resolveFrom(base, './types');
            expect(uri.fsPath).toBe(typesIndex);
        });

        test('explicit .dlang extension resolves directly', async () => {
            const base = path.join(tempDir, 'proj');
            const typesFile = path.join(base, 'types.dlang');
            await writeFile(typesFile, 'Domain Types {}');
            // Also create directory
            const typesIndex = path.join(base, 'types', 'index.dlang');
            await writeFile(typesIndex, 'Domain TypesIndex {}');

            const uri = await resolver.resolveFrom(base, './types.dlang');
            expect(uri.fsPath).toBe(typesFile);
        });
    });

    // ========================================================================
    // Edge: relative path variants
    // ========================================================================

    describe('Edge: relative path variants', () => {

        test('resolves from subdirectory with parent reference', async () => {
            const base = path.join(tempDir, 'proj');
            const sharedFile = path.join(base, 'shared.dlang');
            await writeFile(sharedFile, 'Domain Shared {}');
            const subDir = path.join(base, 'sub');
            await fs.mkdir(subDir, { recursive: true });

            // Resolving from subdir referencing parent
            const uri = await resolver.resolveFrom(subDir, '../shared.dlang');
            expect(uri.fsPath).toBe(sharedFile);
        });

        test('resolves deeply nested relative import', async () => {
            const base = path.join(tempDir, 'proj');
            const nestedFile = path.join(base, 'a', 'b', 'c', 'deep.dlang');
            await writeFile(nestedFile, 'Domain Deep {}');

            const uri = await resolver.resolveFrom(base, './a/b/c/deep.dlang');
            expect(uri.fsPath).toBe(nestedFile);
        });
    });
});
