/**
 * Filesystem service abstraction for testability and runtime portability.
 * 
 * This module provides a comprehensive abstraction over node:fs operations,
 * allowing:
 * - Easy mocking in tests without OOM issues in Vitest forks pool
 * - Future migration to Bun or other runtimes
 * - Consistent error handling across the CLI
 * 
 * @module services/filesystem
 */
import {
    existsSync as nodeExistsSync,
    mkdirSync as nodeMkdirSync,
    writeFileSync as nodeWriteFileSync,
    readFileSync as nodeReadFileSync,
    createWriteStream as nodeCreateWriteStream,
} from 'node:fs';
import {
    readdir as nodeReaddir,
    stat as nodeStat,
    readFile as nodeReadFile,
    writeFile as nodeWriteFile,
    mkdir as nodeMkdir,
    rm as nodeRm,
    rmdir as nodeRmdir,
    rename as nodeRename,
    unlink as nodeUnlink,
    copyFile as nodeCopyFile,
} from 'node:fs/promises';
import type { Stats, Dirent } from 'node:fs';

/**
 * Directory entry returned by readdir with file types.
 */
export interface DirEntry {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
}

/**
 * File stats returned by stat.
 */
export interface FileStats {
    size: number;
    isDirectory(): boolean;
    isFile(): boolean;
    mtime: Date;
}

/**
 * Options for mkdir operation.
 */
export interface MkdirOptions {
    recursive?: boolean;
}

/**
 * Options for rm operation.
 */
export interface RmOptions {
    recursive?: boolean;
    force?: boolean;
}

/**
 * Writable stream interface for file writing.
 * Abstracts WriteStream for runtime portability.
 */
export interface WritableFileStream {
    write(chunk: Buffer | string): boolean;
    write(chunk: Buffer | string, callback: (error: Error | null | undefined) => void): void;
    end(): void;
    end(callback: (error: Error | null | undefined) => void): void;
    on(event: 'finish' | 'error', listener: (...args: unknown[]) => void): this;
    close(): void;
}

/**
 * Comprehensive filesystem operations interface.
 * 
 * Abstracts all filesystem operations used by the CLI for:
 * - Testability (easy mocking without OOM issues)
 * - Runtime portability (future Bun migration)
 * - Consistent API across sync/async operations
 */
export interface FileSystemService {
    // ─────────────────────────────────────────────────────────────────────────
    // Synchronous Operations
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check if a path exists synchronously.
     */
    existsSync(path: string): boolean;

    /**
     * Read file contents synchronously.
     */
    readFileSync(path: string, encoding: BufferEncoding): string;

    /**
     * Write file contents synchronously.
     */
    writeFileSync(path: string, data: string, encoding?: BufferEncoding): void;

    /**
     * Create directory synchronously.
     */
    mkdirSync(path: string, options?: MkdirOptions): void;

    /**
     * Create a writable stream for file writing.
     * Used for streaming large files (e.g., tarball downloads).
     */
    createWriteStream(path: string): WritableFileStream;

    // ─────────────────────────────────────────────────────────────────────────
    // Asynchronous Operations
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Read file contents asynchronously.
     */
    readFile(path: string, encoding: BufferEncoding): Promise<string>;

    /**
     * Write file contents asynchronously.
     */
    writeFile(path: string, data: string, encoding?: BufferEncoding): Promise<void>;

    /**
     * Read directory contents with file types.
     */
    readdir(path: string): Promise<DirEntry[]>;

    /**
     * Get file/directory stats.
     */
    stat(path: string): Promise<FileStats>;

    /**
     * Create directory (with optional recursive creation).
     */
    mkdir(path: string, options?: MkdirOptions): Promise<void>;

    /**
     * Remove file or directory.
     */
    rm(path: string, options?: RmOptions): Promise<void>;

    /**
     * Remove empty directory.
     */
    rmdir(path: string): Promise<void>;

    /**
     * Rename/move file or directory.
     */
    rename(oldPath: string, newPath: string): Promise<void>;

    /**
     * Delete a file.
     */
    unlink(path: string): Promise<void>;

    /**
     * Copy a file.
     */
    copyFile(src: string, dest: string): Promise<void>;
}

/**
 * Default filesystem service using Node.js fs operations.
 * 
 * This implementation wraps node:fs and node:fs/promises to provide
 * a consistent API that can be easily mocked in tests or replaced
 * with Bun-compatible implementations in the future.
 */
export class NodeFileSystemService implements FileSystemService {
    // ─────────────────────────────────────────────────────────────────────────
    // Synchronous Operations
    // ─────────────────────────────────────────────────────────────────────────

    existsSync(path: string): boolean {
        return nodeExistsSync(path);
    }

    readFileSync(path: string, encoding: BufferEncoding): string {
        return nodeReadFileSync(path, encoding);
    }

    writeFileSync(path: string, data: string, encoding: BufferEncoding = 'utf-8'): void {
        nodeWriteFileSync(path, data, encoding);
    }

    mkdirSync(path: string, options?: MkdirOptions): void {
        nodeMkdirSync(path, options);
    }

    createWriteStream(path: string): WritableFileStream {
        return nodeCreateWriteStream(path) as WritableFileStream;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Asynchronous Operations
    // ─────────────────────────────────────────────────────────────────────────

    async readFile(path: string, encoding: BufferEncoding): Promise<string> {
        return nodeReadFile(path, encoding);
    }

    async writeFile(path: string, data: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
        await nodeWriteFile(path, data, encoding);
    }

    async readdir(path: string): Promise<DirEntry[]> {
        const entries = await nodeReaddir(path, { withFileTypes: true });
        return entries.map((e: Dirent) => ({
            name: e.name,
            isDirectory: () => e.isDirectory(),
            isFile: () => e.isFile(),
        }));
    }

    async stat(path: string): Promise<FileStats> {
        const stats: Stats = await nodeStat(path);
        return {
            size: stats.size,
            isDirectory: () => stats.isDirectory(),
            isFile: () => stats.isFile(),
            mtime: stats.mtime,
        };
    }

    async mkdir(path: string, options?: MkdirOptions): Promise<void> {
        await nodeMkdir(path, options);
    }

    async rm(path: string, options?: RmOptions): Promise<void> {
        await nodeRm(path, options);
    }

    async rmdir(path: string): Promise<void> {
        await nodeRmdir(path);
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        await nodeRename(oldPath, newPath);
    }

    async unlink(path: string): Promise<void> {
        await nodeUnlink(path);
    }

    async copyFile(src: string, dest: string): Promise<void> {
        await nodeCopyFile(src, dest);
    }
}

/**
 * Default singleton instance for production use.
 * Import this for actual filesystem operations.
 */
export const defaultFileSystem = new NodeFileSystemService();
