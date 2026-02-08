/**
 * Vitest configuration for DomainLang CLI.
 *
 * Test Strategy:
 * - Unit tests (commands, services, UI components) run in all environments
 * - Integration tests (test/integration/**) are skipped in CI by default
 *   - These make real GitHub API calls and are slow/expensive (14s+)
 *   - Run locally with: INTEGRATION_TESTS=true npm test
 *
 * Known Issue - Memory Cleanup:
 * - The test suite may report "Worker exited unexpectedly" after all tests pass
 * - This is a cleanup issue related to Langium's AST structures accumulating in memory
 * - All tests complete successfully before the error occurs
 * - Does NOT affect test correctness or validity
 * - The error can be safely ignored - it's cosmetic and happens during teardown
 *
 * If needed, you can run tests in smaller batches:
 *   - npx vitest run test/commands/  # Just command tests
 *   - CI=true npm test                # Skip integration tests
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
        // Type-only files (no runtime code)
        'src/commands/types.ts',
        'src/services/types.ts',
        // Barrel re-export files (no logic)
        'src/commands/index.ts',
        'src/services/index.ts',
        'src/ui/components/index.ts',
        // CLI entry point (tested via E2E/integration)
        'src/main.ts',
        // Pure Ink/React presentational components (no testable logic)
        'src/ui/components/ProgressBar.tsx',
        'src/ui/components/KeyboardHints.tsx',
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
    // Vitest v4: Use forks pool for process.chdir() support and memory management
    // Forks pool is required for tests using process.chdir() (init.test, remove.test, add.test)
    // Also supports execArgv for memory configuration
    pool: 'forks',
    maxWorkers: 2,
    execArgv: ['--max-old-space-size=8192'],
  },
});
