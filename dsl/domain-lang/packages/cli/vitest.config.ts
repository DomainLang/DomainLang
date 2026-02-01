/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://vitest.dev/config/
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov', 'clover'],
            include: ['src/**'],
            exclude: [
                '**/node_modules/**',
                '**/*.test.ts',
                '**/*.spec.ts'
            ],
            reportsDirectory: './coverage',
            thresholds: {
                lines: 55,
                functions: 75,
                branches: 70,
                statements: 55
            }
        },
        include: ['**/*.test.ts']
    }
});
