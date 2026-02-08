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
                '**/generated/**',
                '**/node_modules/**',
                '**/*.test.ts',
                '**/*.spec.ts',
                '**/test-helpers.ts'
            ],
            reportsDirectory: './coverage',
            thresholds: {
                lines: 65,
                functions: 75,
                branches: 65,
                statements: 65
            }
        },
        deps: {
            interopDefault: true
        },
        include: ['**/*.test.ts']
    }
});
