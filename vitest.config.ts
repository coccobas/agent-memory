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
      exclude: ['src/db/migrations/**'],
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
