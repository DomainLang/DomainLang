import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { extractDestinationAndName } from '../src/cli-util.js';

describe('extractDestinationAndName', () => {
    it('derives default destination from source directory', () => {
        const filePath = path.join('/workspace/models', 'customer-facing.dlang');
        const result = extractDestinationAndName(filePath, undefined);

        expect(result.destination).toBe(path.join('/workspace/models', 'generated'));
        expect(result.name).toBe('customerfacing');
    });

    it('respects explicit destination option', () => {
        const filePath = 'domain-model.dlang';
        const result = extractDestinationAndName(filePath, '/tmp/output');

        expect(result.destination).toBe('/tmp/output');
        expect(result.name).toBe('domainmodel');
    });

    it('should sanitize name by removing dots', () => {
        const result = extractDestinationAndName('/path/file.config.dlang', undefined);
        expect(result.name).not.toContain('.');
    });

    it('should sanitize name by removing hyphens', () => {
        const result = extractDestinationAndName('/path/file-name.dlang', undefined);
        expect(result.name).not.toContain('-');
    });

    it('should extract just the filename without extension', () => {
        const result = extractDestinationAndName('/some/path/myfile.dlang', '/output');
        expect(result.name).toBe('myfile');
    });

    it('should handle nested paths', () => {
        const result = extractDestinationAndName('/a/b/c/d/file.dlang', undefined);
        expect(result.name).toBe('file');
        expect(result.destination).toBeDefined();
    });

    it('should work with relative paths', () => {
        const result = extractDestinationAndName('./file.dlang', undefined);
        expect(result.name).toBe('file');
    });

    it('should work with just a filename', () => {
        const result = extractDestinationAndName('file.dlang', undefined);
        expect(result.name).toBe('file');
    });

    it('should preserve explicit destination over parent directory', () => {
        const result = extractDestinationAndName('/some/path/file.dlang', '/explicit/path');
        expect(result.destination).toBe('/explicit/path');
    });

    it('should handle multiple dots in filename', () => {
        const result = extractDestinationAndName('/path/file.test.spec.dlang', undefined);
        expect(result.name).toBe('filetestspec');
    });

    it('should handle multiple hyphens in filename', () => {
        const result = extractDestinationAndName('/path/my-file-name.dlang', undefined);
        expect(result.name).toBe('myfilename');
    });

    it('should handle mixed dots and hyphens', () => {
        const result = extractDestinationAndName('/path/my-file.name.dlang', undefined);
        expect(result.name).toBe('myfilename');
    });

    it('should return name as string type', () => {
        const result = extractDestinationAndName('/file.dlang', undefined);
        expect(typeof result.name).toBe('string');
    });

    it('should return destination as string type', () => {
        const result = extractDestinationAndName('/file.dlang', '/output');
        expect(typeof result.destination).toBe('string');
    });

    it('should handle different file extensions', () => {
        const result1 = extractDestinationAndName('file.dlang', undefined);
        const result2 = extractDestinationAndName('file.ts', undefined);
        const result3 = extractDestinationAndName('file.js', undefined);
        expect(result1.name).toBe('file');
        expect(result2.name).toBe('file');
        expect(result3.name).toBe('file');
    });

    it('should return non-empty name for normal inputs', () => {
        const result = extractDestinationAndName('/path/file.dlang', undefined);
        expect(result.name.length).toBeGreaterThan(0);
    });

    it('should return non-empty destination for normal inputs', () => {
        const result = extractDestinationAndName('/path/file.dlang', undefined);
        expect(result.destination.length).toBeGreaterThan(0);
    });

    it('should handle uppercase letters in filename', () => {
        const result = extractDestinationAndName('/path/MyFile.dlang', undefined);
        expect(result.name).toBe('MyFile');
    });

    it('should preserve numbers in filename', () => {
        const result = extractDestinationAndName('/path/file123.dlang', undefined);
        expect(result.name).toBe('file123');
    });

    it('should handle paths with numbers in directories', () => {
        const result = extractDestinationAndName('/path123/file.dlang', undefined);
        expect(result.name).toBe('file');
    });

    it('should handle empty string destination as explicit path', () => {
        const result = extractDestinationAndName('/path/file.dlang', '');
        expect(result.destination).toBe('');
    });

    it('should handle complex directory structures', () => {
        const result = extractDestinationAndName('/long/complex/nested/directory/structure/file.dlang', '/output');
        expect(result.destination).toBe('/output');
        expect(result.name).toBe('file');
    });

    it('should handle underscore preservation in names', () => {
        const result = extractDestinationAndName('/path/my_file_name.dlang', undefined);
        expect(result.name).toBe('my_file_name');
    });
});

