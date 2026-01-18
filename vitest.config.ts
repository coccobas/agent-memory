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
      NODE_ENV: 'development',
      AGENT_MEMORY_DEV_MODE: '1',
      AGENT_MEMORY_DATA_DIR: './data/test', // Isolate tests from production database
      AGENT_MEMORY_PERMISSIONS_MODE: 'permissive',
      AGENT_MEMORY_ALLOW_PERMISSIVE: '1',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        // =============================================================================
        // PERMANENT EXCLUSIONS - These will always be excluded from coverage
        // =============================================================================

        // CATEGORY 1: Database Migrations
        // Rationale: Migrations are one-time scripts that modify database schema.
        // They are tested implicitly when the test database initializes.
        'src/db/migrations/**',

        // CATEGORY 2: Entry Points & CLI
        // Rationale: Entry points are thin wrappers that initialize the application.
        // CLI commands invoke core services which are unit tested directly.
        // These are validated via end-to-end integration tests.
        'src/cli/**',
        'src/cli.ts',
        'src/index.ts',
        'src/core/errors/cli-error.ts',

        // CATEGORY 3: Examples & Documentation
        // Rationale: Example files exist for documentation purposes only.
        // They are not production code and don't require test coverage.
        '**/example.ts',
        '**/examples/**',
        '**/*.example.ts',

        // CATEGORY 4: Type Definitions & Barrel Files
        // Rationale: Type-only files contain no runtime logic to test.
        // Index/barrel files are re-exports with no logic.
        '**/types.ts',
        '**/index.ts',

        // CATEGORY 5: Test Utilities
        // Rationale: Files within src/ that exist to support testing.
        // These are test infrastructure, not production code.
        '**/integration-test.ts',
        '**/*.test.ts',

        // CATEGORY 8: Factory & Lifecycle
        // Rationale: Factory files orchestrate dependency creation and lifecycle.
        // They require full application context and are tested via integration
        // tests that verify the complete initialization sequence.
        'src/db/factory.ts',
        'src/core/factory.ts',
        'src/core/factory/**',
        'src/core/lifecycle-coordinator.ts',

        // =============================================================================
        // TEMPORARY EXCLUSIONS - Review periodically to add unit tests
        // Last reviewed: 2026-01-18
        // =============================================================================

        // CATEGORY 6: External Service Adapters
        // Rationale: Adapters for external services (Redis, PostgreSQL, embeddings)
        // require running instances of those services. They are tested via
        // integration tests with real service connections.
        // TODO: Add unit tests with mocked connections where feasible
        'src/core/adapters/redis-*.ts',
        'src/core/adapters/postgresql.adapter.ts',
        'src/core/adapters/memory-cache.adapter.ts',
        'src/db/vector-stores/**',
        'src/services/embedding/**',
        'src/services/fts/**',

        // CATEGORY 7: Server & API Layer
        // Rationale: HTTP/MCP servers and descriptors require full application
        // context. Handlers are unit tested (tests/unit/*-handler.test.ts).
        // Note: src/mcp/handlers/** was removed - has 33+ unit test files
        // TODO: Consider adding server-level unit tests with mocked handlers
        'src/mcp/server.ts',
        'src/mcp/descriptors/**',
        'src/restapi/**',

        // CATEGORY 9: Complex Orchestration Services (Reduced)
        // Rationale: Services without dedicated unit tests.
        // Feedback subsystem - collectors/evaluators/repos tested via feedback-queue.test.ts
        // TODO: Add unit tests for feedback collectors/evaluators
        'src/services/feedback/collectors/**',
        'src/services/feedback/repositories/**',
        'src/services/feedback/evaluators/**',
        'src/services/file-sync/**',
        // Note: Removed services with unit tests:
        // - src/services/consolidation/** → consolidation*.test.ts
        // - src/services/forgetting/** → forgetting*.test.ts
        // - src/services/librarian/** → librarian*.test.ts
        // - src/services/summarization/** → hierarchical-summarization.service.test.ts
        // - src/services/capture/** → capture.service.test.ts
        // - src/services/extraction/** → extraction*.test.ts
        // - src/services/session.service.ts → session-timeout.service.test.ts
        // - src/services/query-rewrite/** → query-rewrite.service.test.ts
        // - src/services/export/lora/** → lora*.test.ts

        // CATEGORY 10: Commands & Utilities (Integration-Tested)
        // Rationale: Command handlers and utilities that depend heavily on
        // application context. Tested via integration tests.
        // TODO: Add unit tests for command handlers
        'src/commands/hook/review.ts',
        'src/commands/hook/session-summary.ts',
        'src/db/cursor-db.ts',
        'src/utils/markdown.ts',
      ],
      // Thresholds updated per code review recommendations (2026-01-18)
      // Target: 80% lines/functions/statements, 70% branches
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    setupFiles: ['tests/fixtures/setup.ts'],
    globalTeardown: ['tests/teardown.ts'],
  },
  // Benchmark configuration
  bench: {
    globals: true,
    environment: 'node',
    include: ['tests/benchmarks/**/*.bench.ts'],
    env: {
      NODE_ENV: 'development',
      AGENT_MEMORY_DEV_MODE: '1',
      AGENT_MEMORY_DATA_DIR: './data/benchmark', // Isolate benchmarks from production
      AGENT_MEMORY_PERMISSIONS_MODE: 'permissive',
      AGENT_MEMORY_ALLOW_PERMISSIVE: '1',
    },
    reporters: ['default'],
  },
});
