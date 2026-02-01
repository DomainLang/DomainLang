import path from 'node:path';
import fs from 'node:fs/promises';
import YAML from 'yaml';
import type { ModelManifest } from '../services/types.js';

const DEFAULT_MANIFEST_FILENAME = 'model.yaml';
const DEFAULT_ENTRY_FILE = 'index.dlang';

/**
 * Checks if a file exists at the given path.
 */
export async function fileExists(targetPath: string): Promise<boolean> {
    try {
        await fs.access(targetPath);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

/**
 * Finds the nearest model.yaml manifest by walking up from startPath.
 * 
 * @param startPath - Directory to start searching from
 * @returns Absolute path to model.yaml, or undefined if not found
 */
export async function findNearestManifest(startPath: string): Promise<string | undefined> {
    let current = path.resolve(startPath);
    const { root } = path.parse(current);

    while (true) {
        const candidate = path.join(current, DEFAULT_MANIFEST_FILENAME);
        if (await fileExists(candidate)) {
            return candidate;
        }

        if (current === root) {
            return undefined;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }
}

/**
 * Finds the workspace root (directory containing model.yaml).
 * 
 * @param startPath - Directory to start searching from
 * @returns Absolute path to workspace root, or undefined if no manifest found
 */
export async function findWorkspaceRoot(startPath: string): Promise<string | undefined> {
    const manifestPath = await findNearestManifest(startPath);
    return manifestPath ? path.dirname(manifestPath) : undefined;
}

/**
 * Reads and parses a model.yaml manifest.
 * 
 * @param manifestPath - Absolute path to model.yaml
 * @returns Parsed manifest, or undefined if file doesn't exist
 * @throws Error if file exists but cannot be parsed
 */
export async function readManifest(manifestPath: string): Promise<ModelManifest | undefined> {
    try {
        const content = await fs.readFile(manifestPath, 'utf-8');
        return (YAML.parse(content) ?? {}) as ModelManifest;
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}

/**
 * Reads the entry point from a manifest file.
 * 
 * @param manifestPath - Absolute path to model.yaml
 * @returns Entry file path (relative), defaults to 'index.dlang'
 */
export async function readEntryFromManifest(manifestPath: string): Promise<string> {
    try {
        const manifest = await readManifest(manifestPath);
        return manifest?.model?.entry ?? DEFAULT_ENTRY_FILE;
    } catch {
        return DEFAULT_ENTRY_FILE;
    }
}

/**
 * Gets the absolute entry file path for a manifest.
 * 
 * @param manifestPath - Absolute path to model.yaml
 * @returns Absolute path to the entry file
 */
export async function getEntryPath(manifestPath: string): Promise<string> {
    const entry = await readEntryFromManifest(manifestPath);
    return path.resolve(path.dirname(manifestPath), entry);
}

/**
 * Discovers all manifest files within given directories.
 * Only checks direct children, not recursive subdirectories.
 * 
 * @param directories - Array of absolute directory paths to search
 * @returns Array of manifest info objects
 */
export async function findManifestsInDirectories(
    directories: string[]
): Promise<Array<{ manifestPath: string; entryPath: string }>> {
    const results: Array<{ manifestPath: string; entryPath: string }> = [];

    for (const dir of directories) {
        const manifestPath = await findNearestManifest(dir);
        if (manifestPath) {
            const entryPath = await getEntryPath(manifestPath);
            results.push({ manifestPath, entryPath });
        }
    }

    return results;
}

/** Default manifest filename */
export { DEFAULT_MANIFEST_FILENAME, DEFAULT_ENTRY_FILE };
