import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Model } from '@domainlang/language';
import { generateJavaScript } from '../src/generator.js';

vi.mock('node:fs');
vi.mock('node:path', async (importOriginal) => {
    const actual = await importOriginal<typeof path>();
    return {
        ...actual,
        join: vi.fn((...args: string[]) => args.join('/')),
    };
});
vi.mock('langium/generate');

describe('generator module', () => {
    let mockModel: Model;
    let mockFsExistSync: ReturnType<typeof vi.fn>;
    let mockFsMkdirSync: ReturnType<typeof vi.fn>;
    let mockFsWriteFileSync: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockModel = {
            elements: [],
        } as unknown as Model;

        mockFsExistSync = vi.fn().mockReturnValue(false);
        mockFsMkdirSync = vi.fn();
        mockFsWriteFileSync = vi.fn();

        vi.mocked(fs.existsSync).mockImplementation(mockFsExistSync);
        vi.mocked(fs.mkdirSync).mockImplementation(mockFsMkdirSync);
        vi.mocked(fs.writeFileSync).mockImplementation(mockFsWriteFileSync);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('generateJavaScript', () => {
        test('should generate JavaScript file with correct path', () => {
            const result = generateJavaScript(mockModel, '/path/to/model.dlang', undefined);
            expect(result).toContain('.js');
            expect(result).toContain('model');
        });

        test('should create destination directory if it does not exist', () => {
            mockFsExistSync.mockReturnValue(false);
            generateJavaScript(mockModel, '/path/to/model.dlang', '/output');

            expect(mockFsMkdirSync).toHaveBeenCalled();
        });

        test('should not create directory if it already exists', () => {
            mockFsExistSync.mockReturnValue(true);
            generateJavaScript(mockModel, '/path/to/model.dlang', '/output');

            expect(mockFsMkdirSync).not.toHaveBeenCalled();
        });

        test('should write file content', () => {
            mockFsExistSync.mockReturnValue(true);
            generateJavaScript(mockModel, '/path/to/model.dlang', '/output');

            expect(mockFsWriteFileSync).toHaveBeenCalled();
        });

        test('should use provided destination directory', () => {
            mockFsExistSync.mockReturnValue(true);
            generateJavaScript(mockModel, '/path/to/model.dlang', '/custom/destination');

            expect(mockFsExistSync).toHaveBeenCalledWith('/custom/destination');
        });

        test('should use generated directory when destination not provided', () => {
            mockFsExistSync.mockReturnValue(true);
            generateJavaScript(mockModel, '/path/to/model.dlang', undefined);

            expect(mockFsExistSync).toHaveBeenCalled();
        });

        test('should return file path with .js extension', () => {
            mockFsExistSync.mockReturnValue(true);
            const result = generateJavaScript(mockModel, '/path/to/model.dlang', '/output');

            expect(result).toMatch(/\.js$/);
        });

        test('should sanitize filename in output path', () => {
            mockFsExistSync.mockReturnValue(true);
            const result = generateJavaScript(mockModel, '/path/to/my-model.file.dlang', '/output');

            expect(result).toContain('mymodelfile');
            expect(result).toMatch(/\.js$/);
        });

        test('should create directory recursively', () => {
            mockFsExistSync.mockReturnValue(false);
            generateJavaScript(mockModel, '/path/to/model.dlang', '/output/deep/path');

            expect(mockFsMkdirSync).toHaveBeenCalledWith(
                '/output/deep/path',
                { recursive: true }
            );
        });

        test('should handle model with empty elements', () => {
            const emptyModel = { elements: [] } as unknown as Model;
            mockFsExistSync.mockReturnValue(true);

            const result = generateJavaScript(emptyModel, '/path/to/model.dlang', '/output');
            expect(result).toContain('.js');
        });

        test('should handle model with complex structure', () => {
            const complexModel = {
                elements: [{ name: 'test' }],
            } as unknown as Model;
            mockFsExistSync.mockReturnValue(true);

            const result = generateJavaScript(complexModel, '/path/to/model.dlang', '/output');
            expect(result).toContain('.js');
        });

        test('should return absolute path format', () => {
            mockFsExistSync.mockReturnValue(true);
            const result = generateJavaScript(mockModel, 'model.dlang', '/output');

            expect(result).toBeTruthy();
            expect(typeof result).toBe('string');
        });

        test('should handle multiple calls with different models', () => {
            mockFsExistSync.mockReturnValue(true);
            const model1 = { elements: [] } as unknown as Model;
            const model2 = { elements: [{ name: 'context' }] } as unknown as Model;

            const result1 = generateJavaScript(model1, '/path/to/model1.dlang', '/output');
            const result2 = generateJavaScript(model2, '/path/to/model2.dlang', '/output');

            expect(result1).not.toBe(result2);
            expect(mockFsWriteFileSync).toHaveBeenCalledTimes(2);
        });

        test('should append .js extension correctly', () => {
            mockFsExistSync.mockReturnValue(true);
            const result = generateJavaScript(mockModel, '/path/to/model.dlang', '/output');

            expect(result).toMatch(/model\.js$/);
        });
    });
});
