/**
 * Vitest configuration for DomainLang CLI.
 *
 * Test Strategy:
 * - Unit tests (commands, services, UI components) run in all environments
 * - Integration tests (test/integration/**) are skipped in CI by default
 *   - These make real GitHub API calls and are slow/expensive (14s+)
 *   - Run locally with: INTEGRATION_TESTS=true npm test
 * - Memory limits: Large test suite may exceed heap during cleanup
 *   - Workaround: NODE_OPTIONS=--max-old-space-size=4096 npm test
 *
 * @module
 */
import { defineConfig } from 'vitest/config';

const isCI = process.env.CI === 'true';
const runIntegration = process.env.INTEGRATION_TESTS === 'true';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'src/**/*.test.{ts,tsx}',
      'test/**/*.test.{ts,tsx}',
    ],
    // Skip integration tests in CI by default (expensive, slow, real network calls)
    exclude: isCI && !runIntegration ? ['test/integration/**'] : [],
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
    // Limit parallelism to reduce memory pressure
    poolOptions: {
      threads: {
        maxThreads: 2,
      },
    },
  },
});
