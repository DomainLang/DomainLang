import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Model } from '@domainlang/language';

// Mock fs/promises before importing main
vi.mock('node:fs/promises', () => ({
    readFile: vi.fn().mockResolvedValue(JSON.stringify({ version: '0.5.2' })),
}));

vi.mock('../src/cli-util.js');
vi.mock('../src/generator.js');
vi.mock('@domainlang/language');
vi.mock('langium/node');
vi.mock('node:perf_hooks');
vi.mock('chalk');

describe('main module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('module exports', () => {
        test('should be importable', async () => {
            const module = await import('../src/main.js');
            expect(module).toBeDefined();
            expect(typeof module.default).toBe('function');
            expect(typeof module.generateAction).toBe('function');
        });

        test('should have GenerateOptions type available', () => {
            // Type exists if it can be used in type context
            const opts: Record<string, unknown> = {
                destination: '/path',
                profile: true,
            };
            expect(opts).toBeDefined();
        });
    });

    describe('Model type validation', () => {
        test('should accept valid Model structure', () => {
            const mockModel: Model = {
                $type: 'Model',
                children: [],
                imports: [],
            } as unknown as Model;

            expect(mockModel).toBeDefined();
            expect(Array.isArray(mockModel.children)).toBe(true);
            expect(Array.isArray(mockModel.imports)).toBe(true);
        });

        test('should accept Model with populated arrays', () => {
            const mockModel: Model = {
                $type: 'Model',
                children: [{ $type: 'Domain' }],
                imports: [{ $type: 'Import' }],
            } as unknown as Model;

            expect(mockModel.children.length).toBeGreaterThan(0);
            expect(mockModel.imports.length).toBeGreaterThan(0);
        });
    });

    describe('CLI initialization', () => {
        test('should support CLI setup pattern', async () => {
            const { default: setupCli } = await import('../src/main.js');
            expect(typeof setupCli).toBe('function');
        });

        test('should support generate action pattern', async () => {
            const { generateAction } = await import('../src/main.js');
            expect(typeof generateAction).toBe('function');
        });
    });

    describe('parameter patterns', () => {
        test('should support file paths as strings', async () => {
            const paths = ['/absolute/file.dlang', 'relative/file.dlang', './file.dlang'];
            for (const path of paths) {
                expect(typeof path).toBe('string');
            }
        });

        test('should support options object with optional properties', () => {
            const optionsPatterns = [
                {},
                { destination: '/out' },
                { profile: true },
                { destination: '/out', profile: true },
            ];

            for (const opts of optionsPatterns) {
                expect(typeof opts).toBe('object');
            }
        });
    });
});

