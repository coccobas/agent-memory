# Testing Guide

Comprehensive guide to testing Agent Memory.

## Table of Contents

- [Overview](#overview)
- [Running Tests](#running-tests)
- [Test Timeout Patterns](#test-timeout-patterns)
- [Environment Variable Handling](#environment-variable-handling)
- [Test Database Isolation](#test-database-isolation)
- [Coverage Requirements](#coverage-requirements)
- [Writing Good Tests](#writing-good-tests)
- [Test Structure](#test-structure)
- [Test Fixtures](#test-fixtures)
- [Mocking Patterns](#mocking-patterns)
- [Debugging Tests](#debugging-tests)
- [CI/CD Integration](#cicd-integration)

---

## Overview

Agent Memory uses [Vitest](https://vitest.dev/) as its test framework. The test suite includes:

- **Unit tests** (`tests/unit/`) - Test individual modules in isolation
- **Integration tests** (`tests/integration/`) - Test component interactions
- **Security tests** (`tests/security/`) - Test security-related functionality
- **Benchmarks** (`tests/benchmarks/`) - Performance measurements

Coverage requirements:

| Metric     | Threshold |
| ---------- | --------- |
| Statements | 80%       |
| Branches   | 70%       |
| Functions  | 80%       |
| Lines      | 80%       |

---

## Running Tests

### All Tests

```bash
# Run all tests once
npm run test:run

# Run tests in watch mode (re-runs on file changes)
npm test

# Run with coverage report
npm run test:coverage
```

### Specific Test Files

```bash
# Run a specific test file
npx vitest run tests/unit/services/guideline.test.ts

# Run tests matching a pattern
npx vitest run --grep "guideline"

# Run tests in a directory
npx vitest run tests/integration/
```

### Test Suites by Type

```bash
# Unit tests only
npx vitest run tests/unit/

# Integration tests only
npx vitest run tests/integration/

# Security tests only
npx vitest run tests/security/

# Benchmarks (separate command)
npm run bench
```

### Filtering Tests

```bash
# Run tests matching description
npx vitest run -t "should create guideline"

# Run tests in specific file matching pattern
npx vitest run tests/unit/services/guideline.test.ts -t "add"
```

---

## Test Timeout Patterns

### Default Timeouts

The project uses global timeout settings in `vitest.config.ts`:

```typescript
test: {
  testTimeout: 10000,   // 10 second default for tests
  hookTimeout: 10000,   // 10 seconds for beforeEach/afterEach
}
```

### Custom Timeouts for Slow Tests

For tests that legitimately need more time (e.g., embedding operations, batch processing), specify a custom timeout as the third argument:

```typescript
it('should process large batch with embeddings', async () => {
  // ... test code
}, 30000); // 30 second timeout
```

### When to Use Custom Timeouts

Use custom timeouts sparingly for:

- **Embedding operations** - Model initialization can be slow on first run
- **Batch processing** - Large data operations may need more time
- **Concurrent database operations** - Lock contention can cause delays

```typescript
// Good: Specific justification for increased timeout
it('should initialize embedding model and process batch', async () => {
  // Model init + embedding generation
}, 45000); // Increased timeout for embedding operations (model init can be slow)

// Bad: Hiding a performance issue
it('should query database', async () => {
  // If this needs 30s, something is wrong
}, 30000);
```

### Fixing Timeout Issues

If a test times out, investigate the root cause:

1. **Check for unresolved promises** - Missing `await` or unhandled callbacks
2. **Check for infinite loops** - Logic errors in retry/polling code
3. **Check database locks** - Concurrent tests may cause contention
4. **Check external dependencies** - Mock external services instead of calling them

---

## Environment Variable Handling

### Using snapshotConfig and restoreConfig

For tests that modify configuration, use the snapshot/restore pattern:

```typescript
import { snapshotConfig, restoreConfig, reloadConfig } from '../../src/config/index.js';

describe('feature requiring config changes', () => {
  let configSnapshot: Config;

  beforeEach(() => {
    configSnapshot = snapshotConfig();
  });

  afterEach(() => {
    restoreConfig(configSnapshot);
  });

  it('should work with modified config', () => {
    process.env.AGENT_MEMORY_SOME_SETTING = 'test-value';
    reloadConfig();
    // ... test code
  });
});
```

### Using withTestEnv Helper

For cleaner syntax, use the `withTestEnv` helper:

```typescript
import { withTestEnv } from '../../src/config/index.js';

it('should work with custom environment', async () => {
  await withTestEnv(
    {
      AGENT_MEMORY_EMBEDDING_PROVIDER: 'disabled',
      AGENT_MEMORY_LOG_LEVEL: 'silent',
    },
    async () => {
      // Test code runs with modified env
      // Env is automatically restored after
    }
  );
});
```

### Manual Environment Handling

For simple cases, save and restore manually:

```typescript
describe('permission mode tests', () => {
  let previousPermMode: string | undefined;

  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
  });
});
```

---

## Test Database Isolation

### Each Test File Gets Isolated Database

Use unique database paths per test file to prevent interference:

```typescript
import { setupTestDb, cleanupTestDb, registerTestContext } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-my-feature.db';

let testDb: ReturnType<typeof setupTestDb>;
let context: AppContext;

beforeAll(() => {
  testDb = setupTestDb(TEST_DB_PATH);
  context = registerTestContext(testDb);
});

afterAll(() => {
  testDb.sqlite.close();
  cleanupTestDb(TEST_DB_PATH);
});
```

### Using createTestContext

For integration tests that need the full application context:

```typescript
import { setupTestDb, createTestContext, cleanupTestDb } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-integration.db';

describe('integration test', () => {
  let testDb: ReturnType<typeof setupTestDb>;
  let context: AppContext;

  beforeAll(async () => {
    testDb = setupTestDb(TEST_DB_PATH);
    context = await createTestContext(testDb);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });
});
```

### Test Data Factories

Use the provided factory functions for consistent test data:

```typescript
import {
  createTestOrg,
  createTestProject,
  createTestSession,
  createTestGuideline,
  createTestKnowledge,
  createTestTool,
  seedPredefinedTags,
} from '../fixtures/test-helpers.js';

beforeAll(() => {
  seedPredefinedTags(db);

  const org = createTestOrg(db, 'Test Org');
  const project = createTestProject(db, 'Test Project', org.id);
  const session = createTestSession(db, project.id, 'Test Session');

  createTestGuideline(db, 'test-guideline', 'project', project.id);
  createTestKnowledge(db, 'test-knowledge', 'project', project.id);
  createTestTool(db, 'test-tool', 'project', project.id);
});
```

### Do Not Share State Between Tests

Each test should be independent:

```typescript
// Bad: Tests depend on each other
let createdId: string;

it('should create entry', async () => {
  const result = await service.create({ name: 'test' });
  createdId = result.id; // Sharing state!
});

it('should get entry', async () => {
  const result = await service.get(createdId); // Depends on previous test
});

// Good: Each test creates its own data
it('should create entry', async () => {
  const result = await service.create({ name: 'test' });
  expect(result.id).toBeDefined();
});

it('should get entry', async () => {
  const created = await service.create({ name: 'test' });
  const result = await service.get(created.id);
  expect(result.name).toBe('test');
});
```

---

## Coverage Requirements

### Thresholds

The project enforces coverage thresholds in `vitest.config.ts`:

```typescript
thresholds: {
  lines: 80,
  functions: 80,
  branches: 70,
  statements: 80,
}
```

### Running Coverage

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/index.html
```

### Codecov Integration

Coverage is automatically uploaded to Codecov in CI. The GitHub workflow includes:

```yaml
- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

### Ignoring Coverage

For code that should not be covered (debug utilities, unreachable branches):

```typescript
// For entire file
/* v8 ignore file */

// For specific line
const debugOnly = true; // v8 ignore

// For block
/* v8 ignore start */
if (process.env.DEBUG) {
  console.log('debug info');
}
/* v8 ignore stop */
```

### Coverage Exclusions

The project excludes certain files from coverage requirements. See `vitest.config.ts` for the full list with rationale for each category:

- Database migrations (tested implicitly)
- CLI entry points (tested via integration tests)
- Type definitions and barrel files (no runtime logic)
- External service adapters (require running services)

---

## Writing Good Tests

### Use Descriptive Test Names

Test names should explain the scenario being tested:

```typescript
// Bad
it('works', async () => {});
it('test 1', async () => {});

// Good
it('should create guideline with valid input', async () => {});
it('should reject duplicate names in same scope', async () => {});
it('should inherit guidelines from parent scope when inherit=true', async () => {});
```

### Follow Arrange-Act-Assert Pattern

Structure tests clearly:

```typescript
it('should update guideline content', async () => {
  // Arrange
  const { guideline } = createTestGuideline(db, 'test', 'global');
  const newContent = 'Updated content';

  // Act
  const result = await service.update(guideline.id, { content: newContent });

  // Assert
  expect(result.content).toBe(newContent);
  expect(result.versionNum).toBe(2);
});
```

### Mock External Services

Never hit real APIs in tests:

```typescript
import { vi } from 'vitest';

// Mock OpenAI
vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
    },
  })),
}));
```

### Test Edge Cases and Error Conditions

```typescript
describe('validation', () => {
  it('should reject empty name', async () => {
    await expect(service.create({ name: '' })).rejects.toThrow(/name is required/);
  });

  it('should handle null input gracefully', async () => {
    await expect(service.create(null as any)).rejects.toThrow();
  });

  it('should reject name exceeding max length', async () => {
    const longName = 'a'.repeat(256);
    await expect(service.create({ name: longName })).rejects.toThrow(/too long/);
  });
});
```

### Test Async Code Correctly

```typescript
describe('async operations', () => {
  it('should handle async success', async () => {
    const result = await service.fetchData();
    expect(result).toBeDefined();
  });

  it('should handle async errors', async () => {
    await expect(service.fetchInvalid()).rejects.toThrow('Not found');
  });

  it('should handle concurrent operations', async () => {
    const results = await Promise.all([
      service.create({ name: 'a' }),
      service.create({ name: 'b' }),
      service.create({ name: 'c' }),
    ]);
    expect(results).toHaveLength(3);
  });
});
```

---

## Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── *.test.ts            # Service and utility tests
│   └── ...
├── integration/             # Integration tests
│   ├── *.test.ts            # Cross-component tests
│   └── ...
├── security/                # Security-focused tests
│   ├── sql-injection.test.ts
│   ├── path-traversal.test.ts
│   └── dos-stress.test.ts
├── benchmarks/              # Performance benchmarks
│   ├── *.bench.ts           # Vitest benchmarks
│   └── run-*.ts             # Quality evaluation scripts
└── fixtures/                # Test utilities
    ├── setup.ts             # Global test setup
    ├── test-helpers.ts      # Test factories and utilities
    ├── db-utils.ts          # Database utilities
    └── migration-loader.ts  # Migration loading
```

---

## Test Fixtures

### Available Factory Functions

```typescript
// Scope creation
createTestOrg(db, name?, metadata?)
createTestProject(db, name?, orgId?, description?, rootPath?, metadata?)
createTestSession(db, projectId?, name?, purpose?, agentId?, metadata?)

// Entry creation (returns entry + version)
createTestGuideline(db, name, scopeType?, scopeId?, category?, priority?, content?)
createTestKnowledge(db, title, scopeType?, scopeId?, content?, source?)
createTestTool(db, name, scopeType?, scopeId?, category?, description?)
createTestExperience(db, title, scopeType?, scopeId?, level?, category?, content?, scenario?)

// Conversation creation
createTestConversation(db, sessionId?, projectId?, agentId?, title?, status?, metadata?)
createTestMessage(db, conversationId, role?, content?, messageIndex?, contextEntries?, toolsUsed?, metadata?)
createTestContextLink(db, conversationId, entryType, entryId, messageId?, relevanceScore?)

// Setup utilities
seedPredefinedTags(db)
```

### Repository Access

```typescript
import { createTestRepositories } from '../fixtures/test-helpers.js';

const repos = createTestRepositories(testDb);

// Access individual repositories
const guidelines = await repos.guidelines.list({ scopeType: 'global' });
const tags = await repos.tags.list();
```

---

## Mocking Patterns

### Mocking Services

```typescript
import { vi } from 'vitest';

const mockEmbedding = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

const service = new QueryService({
  embeddingService: { embed: mockEmbedding },
});

// Verify mock was called
expect(mockEmbedding).toHaveBeenCalledWith('test query');
```

### Mocking Database Connection

```typescript
vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db, // Use test database
  };
});
```

### Mocking File System

```typescript
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Configure mock behavior
vi.mocked(existsSync).mockReturnValue(true);
vi.mocked(readFileSync).mockReturnValue('file contents');
```

---

## Debugging Tests

### Using Debug Mode

```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/vitest run tests/unit/specific.test.ts
```

### Console Output

```typescript
it('should show output', async () => {
  const result = await service.complexOperation();

  console.log('Result:', result);
  console.dir(result, { depth: 5 });

  expect(result).toBeDefined();
});
```

### Isolating Tests

```typescript
// Run only this test
it.only('should isolate this test', async () => {});

// Skip this test
it.skip('should be skipped', async () => {});

// Mark test as todo
it.todo('should implement this feature');
```

### Verbose Database Logging

```typescript
beforeEach(() => {
  process.env.AGENT_MEMORY_DEBUG = '1';
});

afterEach(() => {
  delete process.env.AGENT_MEMORY_DEBUG;
});
```

---

## CI/CD Integration

### GitHub Actions

The project uses GitHub Actions for CI. Tests run on every push and pull request:

```yaml
- run: npm run ci:test
```

The `ci:test` script includes:

1. Restore migrations
2. Build project
3. Run linting
4. Check architecture rules
5. Format verification
6. Type checking
7. Run all tests

### Pre-validation

Before submitting a PR, run the full validation locally:

```bash
npm run validate
```

This runs lint, layer checks, architecture checks, format verification, type checking, and all tests.

---

## See Also

- [Development Guide](development.md) - Development setup
- [Architecture](../explanation/architecture.md) - System design
- [Error Codes](../reference/error-codes.md) - Error reference
