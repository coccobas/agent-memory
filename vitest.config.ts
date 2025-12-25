import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve .js imports to .ts source files for tests
      '../../src': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/benchmarks/**'],
    // Enable dev mode for tests to auto-fix migration checksum mismatches
    // Enable permissive mode for tests to allow full access without explicit permissions
    env: {
      AGENT_MEMORY_DEV_MODE: '1',
      AGENT_MEMORY_DATA_DIR: './data/test', // Isolate tests from production database
      AGENT_MEMORY_PERMISSIONS_MODE: 'permissive',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/db/migrations/**',
        'src/cli/**', // CLI commands are thin wrappers tested via integration
        'src/cli.ts', // CLI entry point
        'src/index.ts', // Main entry point
        '**/example.ts', // Example files
        '**/examples/**', // Example directories
        '**/*.example.ts', // Example pattern files
        '**/index.ts', // Index/barrel files - re-exports don't need direct tests
        'src/core/errors/cli-error.ts', // CLI error class
        '**/integration-test.ts', // Integration test utilities
        '**/*.test.ts', // Test files in src directory
        '**/types.ts', // Type definition files
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    setupFiles: ['tests/fixtures/setup.ts'],
  },
  // Benchmark configuration
  bench: {
    globals: true,
    environment: 'node',
    include: ['tests/benchmarks/**/*.bench.ts'],
    env: {
      AGENT_MEMORY_DEV_MODE: '1',
      AGENT_MEMORY_DATA_DIR: './data/benchmark', // Isolate benchmarks from production
    },
    reporters: ['default'],
  },
});
