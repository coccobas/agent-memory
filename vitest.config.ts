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
    testTimeout: 10000, // 10 second default for tests
    hookTimeout: 10000, // 10 seconds for beforeEach/afterEach
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
        // =============================================================================
        // CATEGORY 1: Database Migrations
        // Rationale: Migrations are one-time scripts that modify database schema.
        // They are tested implicitly when the test database initializes.
        // =============================================================================
        'src/db/migrations/**',

        // =============================================================================
        // CATEGORY 2: Entry Points & CLI
        // Rationale: Entry points are thin wrappers that initialize the application.
        // CLI commands invoke core services which are unit tested directly.
        // These are validated via end-to-end integration tests.
        // =============================================================================
        'src/cli/**',
        'src/cli.ts',
        'src/index.ts',
        'src/core/errors/cli-error.ts',

        // =============================================================================
        // CATEGORY 3: Examples & Documentation
        // Rationale: Example files exist for documentation purposes only.
        // They are not production code and don't require test coverage.
        // =============================================================================
        '**/example.ts',
        '**/examples/**',
        '**/*.example.ts',

        // =============================================================================
        // CATEGORY 4: Type Definitions & Barrel Files
        // Rationale: Type-only files contain no runtime logic to test.
        // Index/barrel files are re-exports with no logic.
        // =============================================================================
        '**/types.ts',
        '**/index.ts',

        // =============================================================================
        // CATEGORY 5: Test Utilities
        // Rationale: Files within src/ that exist to support testing.
        // These are test infrastructure, not production code.
        // =============================================================================
        '**/integration-test.ts',
        '**/*.test.ts',

        // =============================================================================
        // CATEGORY 6: External Service Adapters
        // Rationale: Adapters for external services (Redis, PostgreSQL, embeddings)
        // require running instances of those services. They are tested via
        // integration tests with real service connections.
        // =============================================================================
        'src/core/adapters/redis-*.ts',
        'src/core/adapters/postgresql.adapter.ts',
        'src/core/adapters/memory-cache.adapter.ts',
        'src/db/vector-stores/**',
        'src/services/embedding/**',
        'src/services/fts/**',

        // =============================================================================
        // CATEGORY 7: Server & API Layer
        // Rationale: HTTP/MCP servers require full application context and are
        // tested via integration tests that make real requests. Unit testing
        // the thin handler wrappers provides little value.
        // =============================================================================
        'src/mcp/server.ts',
        'src/mcp/descriptors/**',
        'src/mcp/handlers/**',
        'src/restapi/**',

        // =============================================================================
        // CATEGORY 8: Factory & Lifecycle
        // Rationale: Factory files orchestrate dependency creation and lifecycle.
        // They require full application context and are tested via integration
        // tests that verify the complete initialization sequence.
        // =============================================================================
        'src/db/factory.ts',
        'src/core/factory.ts',
        'src/core/factory/**',
        'src/core/lifecycle-coordinator.ts',

        // =============================================================================
        // CATEGORY 9: Complex Orchestration Services
        // Rationale: These services coordinate multiple subsystems and require
        // complex integration scenarios. Unit testing individual methods in
        // isolation would miss critical interaction bugs.
        // =============================================================================
        'src/services/feedback/collectors/**',
        'src/services/feedback/repositories/**',
        'src/services/feedback/evaluators/**',
        'src/services/feedback/strategies/**',
        'src/services/feedback/index.ts',
        'src/services/consolidation/**',
        'src/services/forgetting/**',
        'src/services/librarian/**',
        'src/services/summarization/**',
        'src/services/capture/**',
        'src/services/extraction/**',
        'src/services/session.service.ts',
        'src/services/file-sync/**',
        'src/services/query-rewrite/**',
        'src/services/export/lora/**',

        // =============================================================================
        // CATEGORY 10: Commands & Utilities (Integration-Tested)
        // Rationale: Command handlers and utilities that depend heavily on
        // application context. Tested via integration tests.
        // =============================================================================
        'src/commands/hook/review.ts',
        'src/commands/hook/session-summary.ts',
        'src/db/cursor-db.ts',
        'src/utils/markdown.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70, // Branch coverage is inherently harder to achieve due to error handling paths and edge cases
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
