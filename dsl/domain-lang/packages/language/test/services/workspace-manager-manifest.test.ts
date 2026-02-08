/**
 * WorkspaceManager Manifest Tests
 *
 * Per PRS-010 Phase 2, these tests validate:
 * - Manifest file discovery by walking up directory tree
 * - YAML parsing and validation
 * - Dependency lookup by alias
 * - Path field for local dependencies with sandboxing
 * - Mutual exclusivity of source and path fields
 * - NEW: Support for both short form (owner/package: version) and extended form
 *
 * ~20% smoke (one discovery + parse test), ~80% edge (hierarchy, sandboxing,
 * mutual exclusivity, empty YAML, invalid alias, missing manifest).
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { WorkspaceManager } from '../../src/services/workspace-manager.js';
import type { DependencySpec, ExtendedDependencySpec } from '../../src/services/types.js';

/**
 * Helper to normalize a dependency to extended form for testing.
 */
function normalizeDep(key: string, dep: DependencySpec | undefined): ExtendedDependencySpec | undefined {
    if (dep === undefined) return undefined;
    if (typeof dep === 'string') {
        return { source: key, ref: dep };
    }
    return dep.source ? dep : { ...dep, source: key };
}

let tempDir: string;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-workspace-manager-'));
});

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe('WorkspaceManager manifest handling (PRS-010 Phase 2)', () => {
    // ========================================================================
    // Smoke: manifest discovery and parsing (~20%)
    // ========================================================================

    test('discovers manifest and parses model metadata and dependencies', async () => {
        const manifestDir = path.join(tempDir, 'project');
        await fs.mkdir(manifestDir, { recursive: true });
        const manifestContent = `model:
  name: sample
  version: 1.0.0
  entry: index.dlang
dependencies:
  core:
    source: domainlang/core
    ref: v1.0.0
`;
        await fs.writeFile(path.join(manifestDir, 'model.yaml'), manifestContent);
        const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });

        await manager.initialize(manifestDir);
        const manifest = await manager.getManifest();
        const manifestPath = await manager.getManifestPath();

        expect(manifestPath).toBe(path.join(manifestDir, 'model.yaml'));
        expect(manifest?.model?.name).toBe('sample');
        expect(manifest?.model?.version).toBe('1.0.0');
        expect(manifest?.model?.entry).toBe('index.dlang');
        const coreDep = normalizeDep('core', manifest?.dependencies?.core);
        expect(coreDep?.source).toBe('domainlang/core');
        expect(coreDep?.ref).toBe('v1.0.0');
    });

    // ========================================================================
    // Edge: directory tree walking
    // ========================================================================

    describe('Edge: directory tree walking', () => {

        test('finds nearest manifest when initializing from nested folder', async () => {
            const rootDir = path.join(tempDir, 'project');
            const nestedDir = path.join(rootDir, 'nested', 'deep');
            await fs.mkdir(nestedDir, { recursive: true });
            await fs.writeFile(path.join(rootDir, 'model.yaml'), 'model:\n  name: sample\n');
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });

            await manager.initialize(nestedDir);
            const resolvedManifestPath = await manager.getManifestPath();

            expect(resolvedManifestPath).toBe(path.join(rootDir, 'model.yaml'));
        });

        test('stops at first manifest when multiple exist in hierarchy', async () => {
            const root = path.join(tempDir, 'workspace');
            const sub1 = path.join(root, 'sub1');
            const sub2 = path.join(sub1, 'sub2');
            await fs.mkdir(sub2, { recursive: true });

            await fs.writeFile(path.join(root, 'model.yaml'), 'model:\n  name: root\n');
            await fs.writeFile(path.join(sub1, 'model.yaml'), 'model:\n  name: sub1\n');

            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
            await manager.initialize(sub2);
            const foundManifest = await manager.getManifestPath();

            expect(foundManifest).toBe(path.join(sub1, 'model.yaml'));
        });

        test('handles missing manifest gracefully', async () => {
            const emptyDir = path.join(tempDir, 'no-manifest');
            await fs.mkdir(emptyDir, { recursive: true });
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });

            await manager.initialize(emptyDir);

            expect(await manager.getManifestPath()).toBeUndefined();
            expect(await manager.getManifest()).toBeUndefined();
        });
    });

    // ========================================================================
    // Edge: YAML parsing edge cases
    // ========================================================================

    describe('Edge: YAML parsing edge cases', () => {

        test('handles empty YAML file', async () => {
            const manifestDir = path.join(tempDir, 'empty-yaml');
            await fs.mkdir(manifestDir, { recursive: true });
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), '');

            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
            await manager.initialize(manifestDir);

            // An empty file should return a manifest path but the model should be undefined/null
            const manifestPath = await manager.getManifestPath();
            expect(manifestPath).toBe(path.join(manifestDir, 'model.yaml'));
            const manifest = await manager.getManifest();
            expect(manifest?.model).toBeFalsy();
        });

        test('handles YAML with only model name (minimal valid manifest)', async () => {
            const manifestDir = path.join(tempDir, 'minimal');
            await fs.mkdir(manifestDir, { recursive: true });
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), 'model:\n  name: minimal\n');

            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
            await manager.initialize(manifestDir);
            const manifest = await manager.getManifest();

            expect(manifest?.model?.name).toBe('minimal');
            expect(manifest?.dependencies).toBeUndefined();
        });
    });

    // ========================================================================
    // Edge: dependency parsing (extended and short forms)
    // ========================================================================

    describe('Edge: dependency parsing', () => {

        test('parses manifest dependencies including local paths', async () => {
            const manifestDir = path.join(tempDir, 'project');
            await fs.mkdir(manifestDir, { recursive: true });
            const manifestContent = `model:
  name: sample
  version: 1.0.0
dependencies:
  core:
    source: domainlang/core
    ref: v1.0.0
  shared:
    path: ./shared
`;
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), manifestContent);
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });

            await manager.initialize(manifestDir);
            const manifest = await manager.getManifest();

            const coreDep = normalizeDep('core', manifest?.dependencies?.core);
            const sharedDep = normalizeDep('shared', manifest?.dependencies?.shared);
            expect(coreDep?.source).toBe('domainlang/core');
            expect(coreDep?.ref).toBe('v1.0.0');
            expect(sharedDep?.path).toBe('./shared');
        });

        test('parses short-form dependencies (owner/package: version)', async () => {
            const manifestDir = path.join(tempDir, 'project');
            await fs.mkdir(manifestDir, { recursive: true });
            const manifestContent = `model:
  name: sample
  version: 1.0.0
dependencies:
  domainlang/core: v1.0.0
  ddd-community/patterns: v2.3.1
`;
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), manifestContent);
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });

            await manager.initialize(manifestDir);
            const manifest = await manager.getManifest();

            const coreDep = normalizeDep('domainlang/core', manifest?.dependencies?.['domainlang/core']);
            const patternsDep = normalizeDep('ddd-community/patterns', manifest?.dependencies?.['ddd-community/patterns']);
            expect(coreDep?.source).toBe('domainlang/core');
            expect(coreDep?.ref).toBe('v1.0.0');
            expect(patternsDep?.source).toBe('ddd-community/patterns');
            expect(patternsDep?.ref).toBe('v2.3.1');
        });

        test('retrieves dependency with description field', async () => {
            const manifestDir = path.join(tempDir, 'project');
            await fs.mkdir(manifestDir, { recursive: true });
            const manifestContent = `dependencies:
  patterns:
    source: domainlang/patterns
    ref: v2.1.0
    description: "DDD pattern library"
`;
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), manifestContent);
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });

            await manager.initialize(manifestDir);
            const manifest = await manager.getManifest();
            const patternsDep = normalizeDep('patterns', manifest?.dependencies?.patterns);

            expect(patternsDep?.source).toBe('domainlang/patterns');
            expect(patternsDep?.ref).toBe('v2.1.0');
            expect(patternsDep?.description).toBe('DDD pattern library');
        });
    });

    // ========================================================================
    // Edge: source/path mutual exclusivity
    // ========================================================================

    describe('Edge: source/path mutual exclusivity', () => {

        test('rejects manifest that mixes source and path in one dependency', async () => {
            const manifestDir = path.join(tempDir, 'project');
            await fs.mkdir(manifestDir, { recursive: true });
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), `dependencies:
  invalid:
    source: domainlang/core
    path: ../shared
    ref: v1.0.0
`);
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
            await manager.initialize(manifestDir);

            await expect(manager.getManifest()).rejects.toThrow(/Cannot specify both 'source' and 'path'/i);
        });
    });

    // ========================================================================
    // Edge: path sandboxing
    // ========================================================================

    describe('Edge: path sandboxing for local dependencies', () => {

        test('rejects local path dependency that escapes workspace', async () => {
            const manifestDir = path.join(tempDir, 'project');
            await fs.mkdir(manifestDir, { recursive: true });
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), `dependencies:
  secrets:
    path: ../../secrets
`);
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
            await manager.initialize(manifestDir);

            await expect(manager.getManifest()).rejects.toThrow(/outside workspace boundary/i);
        });

        test('allows local path dependency within workspace boundary', async () => {
            const manifestDir = path.join(tempDir, 'project');
            const sharedDir = path.join(manifestDir, 'shared');
            await fs.mkdir(sharedDir, { recursive: true });
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), `dependencies:
  shared:
    path: ./shared
`);
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
            await manager.initialize(manifestDir);
            const manifest = await manager.getManifest();

            const sharedDep = normalizeDep('shared', manifest?.dependencies?.shared);
            expect(sharedDep?.path).toBe('./shared');
        });

        test('allows nested relative paths within workspace', async () => {
            const manifestDir = path.join(tempDir, 'project');
            const sharedDir = path.join(manifestDir, 'lib', 'shared');
            await fs.mkdir(sharedDir, { recursive: true });
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), `dependencies:
  shared:
    path: ./lib/shared
`);
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
            await manager.initialize(manifestDir);
            const manifest = await manager.getManifest();

            const sharedDepNested = normalizeDep('shared', manifest?.dependencies?.shared);
            expect(sharedDepNested?.path).toBe('./lib/shared');
        });
    });

    // ========================================================================
    // Edge: path alias validation (PRS-010)
    // ========================================================================

    describe('Edge: path alias validation', () => {

        test('rejects path alias that does not start with @', async () => {
            const manifestDir = path.join(tempDir, 'project');
            await fs.mkdir(manifestDir, { recursive: true });
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), `model:
  name: sample
paths:
  shared: ./shared
`);
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
            await manager.initialize(manifestDir);

            await expect(manager.getManifest()).rejects.toThrow(/must start with '@'/i);
        });

        test('rejects path alias that escapes workspace boundary', async () => {
            const manifestDir = path.join(tempDir, 'project');
            await fs.mkdir(manifestDir, { recursive: true });
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), `model:
  name: sample
paths:
  "@secrets": ../../../etc/secrets
`);
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
            await manager.initialize(manifestDir);

            await expect(manager.getManifest()).rejects.toThrow(/outside workspace boundary/i);
        });

        test('allows valid path alias within workspace', async () => {
            const manifestDir = path.join(tempDir, 'project');
            const sharedDir = path.join(manifestDir, 'packages', 'shared');
            await fs.mkdir(sharedDir, { recursive: true });
            await fs.writeFile(path.join(manifestDir, 'model.yaml'), `model:
  name: sample
paths:
  "@shared": ./packages/shared
`);
            const manager = new WorkspaceManager({ autoResolve: false, allowNetwork: false });
            await manager.initialize(manifestDir);
            const aliases = await manager.getPathAliases();

            expect(aliases?.['@shared']).toBe('./packages/shared');
        });
    });
});
