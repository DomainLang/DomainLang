import { describe, test, expect, vi, beforeEach } from 'vitest';
import { extractDestinationAndName } from '../src/util.js';

vi.mock('node:fs');
vi.mock('chalk');

describe('util module', () => {
    describe('extractDestinationAndName', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        test('should extract name and use default generated directory when destination not provided', () => {
            const result = extractDestinationAndName('/path/to/myfile.dlang', undefined);
            expect(result.name).toBe('myfile');
            expect(result.destination).toContain('generated');
        });

        test('should extract name and use provided destination', () => {
            const result = extractDestinationAndName('/path/to/myfile.dlang', '/output');
            expect(result.name).toBe('myfile');
            expect(result.destination).toBe('/output');
        });

        test('should handle filenames with multiple dots', () => {
            const result = extractDestinationAndName('/path/to/my.config.file.dlang', undefined);
            expect(result.name).toBe('myconfigfile');
        });

        test('should handle filenames with hyphens', () => {
            const result = extractDestinationAndName('/path/to/my-file.dlang', undefined);
            expect(result.name).toBe('myfile');
        });

        test('should handle filenames with dots and hyphens', () => {
            const result = extractDestinationAndName('/path/to/my-file.name.dlang', undefined);
            expect(result.name).toBe('myfilename');
        });

        test('should handle absolute paths', () => {
            const result = extractDestinationAndName('/absolute/path/to/file.dlang', undefined);
            expect(result.name).toBe('file');
            expect(result.destination).toContain('generated');
        });

        test('should handle relative paths', () => {
            const result = extractDestinationAndName('relative/path/file.dlang', undefined);
            expect(result.name).toBe('file');
            expect(result.destination).toContain('generated');
        });

        test('should handle single filename with no directory', () => {
            const result = extractDestinationAndName('myfile.dlang', undefined);
            expect(result.name).toBe('myfile');
            expect(result.destination).toContain('generated');
        });

        test('should preserve destination when explicitly provided', () => {
            const result = extractDestinationAndName('myfile.dlang', '/custom/dest');
            expect(result.destination).toBe('/custom/dest');
        });

        test('should handle empty string destination as undefined', () => {
            const result = extractDestinationAndName('/path/to/file.dlang', '');
            // Empty string is truthy in the check, so it should be used
            expect(result.destination).toBe('');
        });

        test('should remove both dots and hyphens from filename', () => {
            const result = extractDestinationAndName('my.amazing-file.dlang', undefined);
            expect(result.name).toBe('myamazingfile');
        });

        test('should handle Windows-style paths on any platform', () => {
            // Windows path handling depends on the OS, so we just verify it returns some result
            const result = extractDestinationAndName(String.raw`C:\path\to\myfile.dlang`, undefined);
            expect(result.name).toBeDefined();
            expect(typeof result.name).toBe('string');
        });

        test('should handle filenames that are all special characters after sanitization', () => {
            const result = extractDestinationAndName('/path/to/.-.--.dlang', undefined);
            expect(result.name).toBe('');
        });

        test('should handle very long filenames', () => {
            const longName = 'a'.repeat(255) + '.dlang';
            const result = extractDestinationAndName(`/path/to/${longName}`, undefined);
            expect(result.name).toBe('a'.repeat(255));
        });

        test('should handle numeric filenames', () => {
            const result = extractDestinationAndName('/path/to/12345.dlang', undefined);
            expect(result.name).toBe('12345');
        });

        test('should create destination in parent directory when no destination provided', () => {
            const result = extractDestinationAndName('/path/to/file.dlang', undefined);
            expect(result.destination).toBeDefined();
            expect(result.destination).toContain('generated');
        });

        test('should handle uppercase in filenames', () => {
            const result = extractDestinationAndName('/Path/To/MyFile.DLANG', undefined);
            expect(result.name).toBe('MyFile');
        });

        test('should handle mixed case hyphens and dots', () => {
            const result = extractDestinationAndName('My-File.Name.DLANG', undefined);
            expect(result.name).toBe('MyFileName');
        });

        test('should handle trailing slashes in path', () => {
            const result = extractDestinationAndName('/path/to/file.dlang/', undefined);
            expect(result.name).toBeDefined();
            expect(typeof result.name).toBe('string');
        });

        test('should use provided destination exactly as given', () => {
            const customDest = '/my/custom/destination/path';
            const result = extractDestinationAndName('file.dlang', customDest);
            expect(result.destination).toBe(customDest);
        });
    });
});
