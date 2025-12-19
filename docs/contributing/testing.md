# Testing Guide

Comprehensive guide to testing Agent Memory.

## Table of Contents

- [Quick Start](#quick-start)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Fixtures](#test-fixtures)
- [Mocking Patterns](#mocking-patterns)
- [Coverage](#coverage)
- [Debugging Tests](#debugging-tests)
- [CI/CD Integration](#cicd-integration)

---

## Quick Start

```bash
# Run all tests
npm run test:run

# Run tests in watch mode
npm run test

# Run full validation (lint + typecheck + tests)
npm run validate
```

---

## Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── services/            # Service layer tests
│   ├── handlers/            # MCP handler tests
│   ├── utils/               # Utility function tests
│   └── config/              # Configuration tests
├── integration/             # Integration tests
│   ├── mcp/                 # MCP protocol tests
│   ├── rest/                # REST API tests
│   └── database/            # Database operation tests
├── benchmarks/              # Performance benchmarks
├── fixtures/                # Test data and mocks
│   ├── data/                # Sample data files
│   └── mocks/               # Mock implementations
└── helpers/                 # Test utilities
    ├── setup.ts             # Global test setup
    ├── database.ts          # Database test helpers
    └── factories.ts         # Test data factories
```

---

## Running Tests

### All Tests

```bash
# Single run
npm run test:run

# Watch mode (re-runs on changes)
npm run test

# With coverage
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

### Test Suites

```bash
# Unit tests only
npx vitest run tests/unit/

# Integration tests only
npx vitest run tests/integration/

# Benchmarks
npx vitest bench
```

### Filtering Tests

```bash
# Run tests matching description
npx vitest run -t "should create guideline"

# Run tests in specific file matching pattern
npx vitest run tests/unit/services/guideline.test.ts -t "add"
```

---

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GuidelineService } from '../../../src/services/guideline';
import { createTestDatabase, cleanupTestDatabase } from '../../helpers/database';

describe('GuidelineService', () => {
  let db: Database;
  let service: GuidelineService;

  beforeEach(async () => {
    db = await createTestDatabase();
    service = new GuidelineService(db);
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  describe('add', () => {
    it('should create a new guideline', async () => {
      const result = await service.add({
        scopeType: 'global',
        name: 'test-guideline',
        content: 'Test content',
      });

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^guideline-/);
      expect(result.name).toBe('test-guideline');
    });

    it('should reject duplicate names in same scope', async () => {
      await service.add({
        scopeType: 'global',
        name: 'duplicate',
        content: 'First',
      });

      await expect(
        service.add({
          scopeType: 'global',
          name: 'duplicate',
          content: 'Second',
        })
      ).rejects.toThrow(/already exists/);
    });
  });
});
```

### Testing Async Code

```typescript
describe('async operations', () => {
  it('should handle async success', async () => {
    const result = await service.fetchData();
    expect(result).toBeDefined();
  });

  it('should handle async errors', async () => {
    await expect(service.fetchInvalid()).rejects.toThrow('Not found');
  });

  it('should handle timeouts', async () => {
    await expect(service.slowOperation()).rejects.toThrow('Timeout');
  }, 10000); // Custom timeout
});
```

### Testing MCP Handlers

```typescript
import { describe, it, expect } from 'vitest';
import { handleGuidelineAdd } from '../../../src/mcp/handlers/guideline';
import { createMockContext } from '../../helpers/mcp';

describe('MCP guideline handler', () => {
  it('should add guideline via MCP', async () => {
    const ctx = createMockContext();

    const result = await handleGuidelineAdd(ctx, {
      action: 'add',
      scopeType: 'global',
      name: 'test',
      content: 'Test content',
    });

    expect(result.id).toBeDefined();
    expect(result.name).toBe('test');
  });

  it('should validate required fields', async () => {
    const ctx = createMockContext();

    await expect(
      handleGuidelineAdd(ctx, {
        action: 'add',
        scopeType: 'global',
        // Missing name and content
      })
    ).rejects.toThrow(/name is required/);
  });
});
```

### Testing REST API

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp } from '../../helpers/rest';

describe('REST API /v1/query', () => {
  let app: Express;
  const API_KEY = 'test-api-key';

  beforeAll(async () => {
    app = await createTestApp({ apiKey: API_KEY });
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('should return 401 without auth', async () => {
    const response = await request(app)
      .post('/v1/query')
      .send({ agentId: 'test' });

    expect(response.status).toBe(401);
  });

  it('should query with valid auth', async () => {
    const response = await request(app)
      .post('/v1/query')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({
        agentId: 'test',
        types: ['guidelines'],
        scope: { type: 'global' },
      });

    expect(response.status).toBe(200);
    expect(response.body.results).toBeDefined();
  });
});
```

---

## Test Fixtures

### Using Factories

```typescript
// tests/helpers/factories.ts
import { faker } from '@faker-js/faker';

export function createGuideline(overrides = {}) {
  return {
    name: faker.lorem.slug(),
    content: faker.lorem.paragraph(),
    category: 'code_style',
    priority: faker.number.int({ min: 1, max: 100 }),
    ...overrides,
  };
}

export function createKnowledge(overrides = {}) {
  return {
    title: faker.lorem.sentence(),
    content: faker.lorem.paragraphs(2),
    category: 'fact',
    confidence: faker.number.float({ min: 0.5, max: 1 }),
    ...overrides,
  };
}

export function createProject(overrides = {}) {
  return {
    name: faker.lorem.slug(),
    description: faker.lorem.sentence(),
    rootPath: `/tmp/${faker.string.uuid()}`,
    ...overrides,
  };
}
```

### Using Factories in Tests

```typescript
import { createGuideline, createProject } from '../../helpers/factories';

describe('bulk operations', () => {
  it('should add multiple guidelines', async () => {
    const project = await projectService.create(createProject());

    const guidelines = Array.from({ length: 5 }, () =>
      createGuideline({ scopeType: 'project', scopeId: project.id })
    );

    const result = await service.bulkAdd(guidelines);
    expect(result.count).toBe(5);
  });
});
```

### Static Fixtures

```typescript
// tests/fixtures/data/guidelines.json
[
  {
    "name": "no-any",
    "content": "Never use 'any' type",
    "category": "code_style",
    "priority": 95
  },
  {
    "name": "error-handling",
    "content": "Always handle errors",
    "category": "code_style",
    "priority": 90
  }
]

// Using in tests
import guidelines from '../../fixtures/data/guidelines.json';

describe('import', () => {
  it('should import guidelines from JSON', async () => {
    const result = await importService.import({
      format: 'json',
      content: JSON.stringify({ guidelines }),
    });
    expect(result.imported.guidelines).toBe(2);
  });
});
```

---

## Mocking Patterns

### Mocking Services

```typescript
import { vi } from 'vitest';

describe('with mocked dependencies', () => {
  it('should use mocked embedding service', async () => {
    const mockEmbedding = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

    const service = new QueryService({
      embeddingService: { embed: mockEmbedding },
    });

    await service.semanticSearch('test query');

    expect(mockEmbedding).toHaveBeenCalledWith('test query');
  });
});
```

### Mocking External APIs

```typescript
import { vi, beforeEach, afterEach } from 'vitest';
import { OpenAI } from 'openai';

vi.mock('openai');

describe('OpenAI integration', () => {
  beforeEach(() => {
    vi.mocked(OpenAI).mockImplementation(() => ({
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should generate embeddings', async () => {
    const result = await embeddingService.embed('test');
    expect(result).toHaveLength(3);
  });
});
```

### Mocking Database

```typescript
import { vi } from 'vitest';

describe('with mocked database', () => {
  const mockDb = {
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    }),
    transaction: vi.fn((fn) => fn),
  };

  it('should execute query', async () => {
    mockDb.prepare().get.mockReturnValue({ id: '1', name: 'test' });

    const service = new GuidelineService(mockDb);
    const result = await service.get('1');

    expect(result.name).toBe('test');
  });
});
```

---

## Coverage

### Running Coverage

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/index.html
```

### Coverage Requirements

| Category | Minimum |
|----------|---------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

### Ignoring Coverage

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

---

## Debugging Tests

### Using Debug Mode

```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/vitest run tests/unit/specific.test.ts
```

### Console Output

```typescript
describe('debugging', () => {
  it('should show output', async () => {
    const result = await service.complexOperation();

    // These will appear in test output
    console.log('Result:', result);
    console.dir(result, { depth: 5 });

    expect(result).toBeDefined();
  });
});
```

### Isolating Tests

```typescript
// Run only this test
it.only('should isolate this test', async () => {
  // ...
});

// Skip this test
it.skip('should be skipped', async () => {
  // ...
});

// Mark test as todo
it.todo('should implement this feature');
```

### Verbose Database Logging

```typescript
// In test setup
beforeEach(() => {
  process.env.AGENT_MEMORY_DEBUG = '1';
});

afterEach(() => {
  delete process.env.AGENT_MEMORY_DEBUG;
});
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npm run validate

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Pre-commit Hook

```bash
# .husky/pre-commit
npm run test:run
```

---

## Test Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/benchmarks/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['tests/**', 'dist/**'],
    },
    setupFiles: ['tests/helpers/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
```

### Test Setup File

```typescript
// tests/helpers/setup.ts
import { beforeAll, afterAll } from 'vitest';

// Disable logging during tests
process.env.LOG_LEVEL = 'silent';

// Set test environment
process.env.NODE_ENV = 'test';

beforeAll(async () => {
  // Global setup
});

afterAll(async () => {
  // Global cleanup
});
```

---

## Best Practices

1. **One assertion per test** - Keep tests focused
2. **Descriptive names** - Test names should explain the scenario
3. **Arrange-Act-Assert** - Structure tests clearly
4. **Isolate tests** - Tests should not depend on each other
5. **Use factories** - Avoid hardcoded test data
6. **Clean up** - Always clean up test data
7. **Mock external services** - Don't hit real APIs in tests
8. **Test edge cases** - Empty inputs, nulls, boundaries

---

## See Also

- [Development Guide](development.md) - Development setup
- [Contributing](CONTRIBUTING.md) - Contribution guidelines
- [Architecture](../concepts/architecture.md) - System design
