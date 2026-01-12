# ADR-0025: Test Isolation Pattern

## Status

Accepted

## Context

Agent Memory has 1200+ tests that need to run:
- In parallel (for speed)
- Without shared state (for reliability)
- Against real databases (for accuracy)
- With injectable dependencies (for flexibility)

Module-level singletons break test isolation:

```typescript
// Bad: Shared state across tests
import { db } from './database';  // Same instance for all tests

test('test A', () => {
  db.insert(...);  // Affects test B
});

test('test B', () => {
  db.query(...);  // Sees test A's data
});
```

We needed:
- Per-test database isolation
- Factory-based dependency creation
- Parallel test execution support
- Same patterns as production code

## Decision

Use factory functions to create test fixtures with injected dependencies, avoiding module-level singletons. Each test gets an isolated database and fresh service instances.

### Test Database Setup

```typescript
// tests/fixtures/test-helpers.ts
export async function setupTestDb(): Promise<TestContext> {
  // Create unique in-memory database per test
  const dbPath = `:memory:`;  // Or unique file path for persistence
  const db = await createDatabase({ type: 'sqlite', path: dbPath });

  // Run migrations
  await runMigrations(db);

  return {
    db,
    cleanup: async () => {
      await db.close();
    },
  };
}
```

### Repository Factory

```typescript
export function createTestRepositories(db: Database): Repositories {
  // Create fresh repository instances with test database
  return {
    guideline: new GuidelineRepository(db),
    knowledge: new KnowledgeRepository(db),
    tool: new ToolRepository(db),
    session: new SessionRepository(db),
    // ... other repositories
  };
}
```

### Service Factory

```typescript
export function createTestServices(
  repos: Repositories,
  overrides?: Partial<ServiceDependencies>,
): Services {
  const deps: ServiceDependencies = {
    cache: new LRUCacheAdapter({ maxSize: 100 }),
    eventBus: new LocalEventAdapter(),
    ...overrides,
  };

  return {
    guideline: new GuidelineService(repos.guideline, deps.cache),
    knowledge: new KnowledgeService(repos.knowledge, deps.cache),
    query: new QueryService(repos, deps.cache, deps.eventBus),
    // ... other services
  };
}
```

### Test Structure

```typescript
// tests/unit/guideline.test.ts
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { setupTestDb, createTestRepositories, createTestServices } from '../fixtures/test-helpers';

describe('GuidelineService', () => {
  let ctx: TestContext;
  let services: Services;

  beforeEach(async () => {
    // Fresh database per test
    ctx = await setupTestDb();
    const repos = createTestRepositories(ctx.db);
    services = createTestServices(repos);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('should create guideline', async () => {
    const result = await services.guideline.add({
      name: 'test-guideline',
      content: 'Test content',
      scopeType: 'global',
    });

    expect(result.name).toBe('test-guideline');
  });

  it('should not see other test data', async () => {
    // This test has fresh database, no data from previous test
    const list = await services.guideline.list({ scopeType: 'global' });
    expect(list).toHaveLength(0);
  });
});
```

### Container Reset for Integration Tests

```typescript
// tests/integration/mcp-handlers.test.ts
import { Container } from '../../src/core/container';

describe('MCP Handlers', () => {
  beforeEach(async () => {
    // Reset singleton container
    Container.resetInstance();

    // Initialize with test config
    const container = Container.getInstance();
    await container.initialize({
      database: { type: 'sqlite', path: ':memory:' },
      // ... test config
    });
  });

  afterEach(() => {
    Container.resetInstance();
  });
});
```

### Parallel Execution

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    // Run tests in parallel
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
    // Each test file gets isolated environment
    isolate: true,
  },
});
```

### Mock Injection

```typescript
// Override specific dependencies for testing
const mockEmbeddingService = {
  generate: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
};

const services = createTestServices(repos, {
  embeddingService: mockEmbeddingService,
});

// Test with mock
await services.query.search({ query: 'test' });
expect(mockEmbeddingService.generate).toHaveBeenCalled();
```

## Consequences

**Positive:**
- Tests run in parallel without interference
- Each test has predictable starting state
- Same factory pattern as production code
- Easy to inject mocks for unit tests
- Failures are reproducible (no shared state)

**Negative:**
- Test setup overhead (creating database per test)
- Must remember to use factories, not imports
- Integration tests slower than unit tests with mocks
- Cleanup required to prevent resource leaks

## References

- Code locations:
  - `tests/fixtures/test-helpers.ts` - Test factories
  - `tests/fixtures/test-data.ts` - Sample data generators
  - `vitest.config.ts` - Parallel execution config
  - `src/core/container.ts:resetInstance()` - Singleton reset
- Related ADRs: ADR-0020 (Hybrid DI Container)
- Principles: S1 (Tests Prove Behavior)
