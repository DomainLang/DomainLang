/**
 * Vitest configuration for DomainLang CLI.
 *
 * @module
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'src/**/*.test.{ts,tsx}',
      'test/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'clover'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test-utils/**',
        '**/node_modules/**',
      ],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 55,
        functions: 75,
        branches: 70,
        statements: 55
      }
    },
    testTimeout: 30000,
  },
});
