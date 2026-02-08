/**
 * Vitest configuration for DomainLang CLI.
 *
 * Test Strategy:
 * - Unit tests (commands, services, UI components) run in all environments
 * - Integration tests (test/integration/**) are skipped in CI by default
 *   - These make real GitHub API calls and are slow/expensive (14s+)
 *   - Run locally with: INTEGRATION_TESTS=true npm test
 *
 * Memory Management:
 * - All Ink renders are automatically unmounted after each test via test/setup.ts
 * - This prevents React tree leaks and orphaned setInterval timers
 * - Network-calling services are mocked in tests to avoid real HTTP requests
 * - Worker heap is set to 4GB (sufficient with proper cleanup)
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
    // Auto-cleanup Ink renders after each test to prevent memory leaks
    setupFiles: ['./test/setup.ts'],
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
        lines: 65,
        functions: 65,
        branches: 55,
        statements: 55
      }
    },
    testTimeout: 30000,
    // Vitest v4: Use forks pool for process.chdir() support and memory management
    // Forks pool is required for tests using process.chdir() (init.test, remove.test, add.test)
    pool: 'forks',
    // Limit concurrent workers to control memory pressure in CI
    maxWorkers: isCI ? 1 : 2,
    // 4GB heap is sufficient with proper cleanup; 8GB masked memory leaks
    execArgv: ['--max-old-space-size=4096'],
  },
});
