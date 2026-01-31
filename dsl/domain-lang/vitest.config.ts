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
            include: ['src'],
            exclude: ['**/generated'],
            reportsDirectory: './packages/language/coverage',
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 75,
                statements: 80
            }
        },
        deps: {
            interopDefault: true
        },
        include: ['**/*.test.ts']
    }
});
