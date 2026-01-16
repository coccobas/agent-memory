---
description: Testing guidelines and patterns
globs: ['tests/**/*.ts', '**/*.test.ts']
alwaysApply: false
---

# Testing Guidelines

## Testing Framework

- **Framework**: Vitest
- **Location**: `tests/` directory
  - `tests/unit/` - Unit tests for services and repositories
  - `tests/integration/` - Integration tests for handlers and MCP tools
  - `tests/fixtures/` - Test helpers and fixtures

## Test Structure

### Basic Test Structure

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-knowledge.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

// Mock database connection
vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

describe('Feature Name', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('Sub-feature', () => {
    it('should do something', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## Test Helpers

### Database Setup

**Location**: `tests/fixtures/test-helpers.ts`

```typescript
export function setupTestDb(dbPath: string): {
  sqlite: Database;
  db: ReturnType<typeof drizzle>;
} {
  // Create in-memory or file-based test database
  // Run migrations
  // Return database instances
}

export function cleanupTestDb(dbPath: string): void {
  // Remove test database file
}
```

### Test Data Creation

```typescript
export function createTestProject(db: ReturnType<typeof drizzle>): Project {
  // Create test project
  // Return created project
}

export function createTestKnowledge(
  db: ReturnType<typeof drizzle>,
  title: string
): {
  knowledge: KnowledgeWithVersion;
} {
  // Create test knowledge entry
  // Return created entry
}
```

## Unit Tests

### Repository Tests

**Location**: `tests/unit/`

**Pattern**:

- Test each repository method
- Test error cases
- Test edge cases

**Example**:

```typescript
describe('knowledgeRepo', () => {
  it('should create a knowledge entry', () => {
    const knowledge = knowledgeRepo.create({
      scopeType: 'global',
      title: 'Test',
      content: 'Content',
    });

    expect(knowledge.title).toBe('Test');
    expect(knowledge.currentVersion).toBeDefined();
  });

  it('should return undefined for non-existent entry', () => {
    const knowledge = knowledgeRepo.getById('non-existent');
    expect(knowledge).toBeUndefined();
  });
});
```

### Service Tests

**Location**: `tests/unit/`

**Pattern**:

- Test business logic
- Test edge cases
- Mock dependencies if needed

**Example**:

```typescript
describe('query.service', () => {
  it('should resolve scope chain with inheritance', () => {
    const chain = resolveScopeChain({
      type: 'session',
      id: sessionId,
      inherit: true,
    });

    expect(chain).toHaveLength(4); // session, project, org, global
    expect(chain[0].scopeType).toBe('session');
  });
});
```

## Integration Tests

### Handler Tests

**Location**: `tests/integration/`

**Pattern**:

- Test full handler flow
- Test parameter validation
- Test permission checks
- Test error handling

**Example**:

```typescript
describe('Knowledge Integration', () => {
  describe('memory_knowledge_add', () => {
    it('should add a knowledge entry with all fields', () => {
      const result = knowledgeHandlers.add({
        scopeType: 'global',
        title: 'Test Knowledge',
        content: 'Test content',
        source: 'https://example.com',
        confidence: 0.9,
      });

      expect(result.success).toBe(true);
      expect(result.knowledge).toBeDefined();
      expect(result.knowledge.title).toBe('Test Knowledge');
    });

    it('should require scopeType', () => {
      expect(() => {
        knowledgeHandlers.add({ title: 'test', content: 'content' });
      }).toThrow('scopeType is required');
    });
  });
});
```

### MCP Tool Tests

**Location**: `tests/integration/`

**Pattern**:

- Test tool actions
- Test error responses
- Test response format

**Example**:

```typescript
describe('memory_knowledge tool', () => {
  it('should handle add action', async () => {
    const result = await bundledHandlers.memory_knowledge({
      action: 'add',
      scopeType: 'global',
      title: 'Test',
      content: 'Content',
    });

    expect(result.success).toBe(true);
  });

  it('should handle invalid action', async () => {
    expect(() => {
      bundledHandlers.memory_knowledge({
        action: 'invalid',
      });
    }).toThrow('Unknown action');
  });
});
```

## Test Coverage

### Current Coverage

- **Target**: ~78% (current baseline)
- **Command**: `npm run test:coverage`
- **Report**: Generated in `coverage/` directory

### Coverage Goals

- **Repositories**: 90%+ (critical data access)
- **Services**: 80%+ (business logic)
- **Handlers**: 70%+ (integration points)
- **Utilities**: 90%+ (helper functions)

## Test Best Practices

### 1. Isolation

- Each test should be independent
- Use `beforeAll`/`afterAll` for setup/teardown
- Use `beforeEach`/`afterEach` if needed for per-test setup

### 2. Naming

- **Describe blocks**: Feature or component name
- **Test names**: Should describe what is being tested
- **Format**: `should <expected behavior>`

**Example**:

```typescript
describe('knowledgeRepo', () => {
  describe('create', () => {
    it('should create a knowledge entry with initial version', () => { ... });
    it('should throw error if title already exists in scope', () => { ... });
  });
});
```

### 3. Arrange-Act-Assert

- **Arrange**: Set up test data
- **Act**: Execute the code under test
- **Assert**: Verify the results

**Example**:

```typescript
it('should update knowledge and create new version', () => {
  // Arrange
  const { knowledge } = createTestKnowledge(db, 'update_test');
  const originalVersionId = knowledge.currentVersionId;

  // Act
  const result = knowledgeHandlers.update({
    id: knowledge.id,
    content: 'Updated content',
  });

  // Assert
  expect(result.success).toBe(true);
  expect(result.knowledge.currentVersionId).not.toBe(originalVersionId);
});
```

### 4. Test Edge Cases

- **Empty inputs**: Empty strings, null, undefined
- **Boundary values**: Min/max limits
- **Error conditions**: Invalid inputs, missing resources
- **Concurrent operations**: Multiple agents, conflicts

**Example**:

```typescript
it('should handle empty search query', () => {
  const result = executeMemoryQuery({
    search: '',
    types: ['tools'],
  });

  expect(result.results).toBeDefined();
});

it('should handle limit exceeding max', () => {
  const result = executeMemoryQuery({
    limit: 1000, // Exceeds MAX_LIMIT
    types: ['tools'],
  });

  expect(result.meta.returnedCount).toBeLessThanOrEqual(MAX_LIMIT);
});
```

### 5. Mock External Dependencies

- **Database**: Use test database (not production)
- **External APIs**: Mock if needed
- **File system**: Use test paths

**Example**:

```typescript
vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual('../../src/db/connection.js');
  return {
    ...actual,
    getDb: () => testDb,
  };
});
```

### 6. Clean Up

- **Database**: Clean up test databases
- **Files**: Remove test files
- **State**: Reset state between tests

**Example**:

```typescript
afterAll(() => {
  sqlite.close();
  cleanupTestDb(TEST_DB_PATH);
});
```

## Running Tests

### Commands

- **Run all tests**: `npm test` (watch mode)
- **Run once**: `npm run test:run`
- **Coverage**: `npm run test:coverage`
- **Specific file**: `npm test tests/integration/knowledge.test.ts`

### Watch Mode

- **Default**: Vitest runs in watch mode
- **Auto-rerun**: Tests rerun on file changes
- **Filter**: Use `.only` or `.skip` for focused testing

**Example**:

```typescript
describe.only('Focus on this test', () => {
  it('should run this test', () => { ... });
});

it.skip('Skip this test', () => { ... });
```

## Test Data

### Fixtures

- **Location**: `tests/fixtures/`
- **Purpose**: Reusable test data creation
- **Pattern**: Factory functions

**Example**:

```typescript
export function createTestProject(db: ReturnType<typeof drizzle>, name = 'test-project'): Project {
  const projectId = generateId();
  const project: NewProject = {
    id: projectId,
    name,
    createdAt: now(),
  };
  db.insert(projects).values(project).run();
  return db.select().from(projects).where(eq(projects.id, projectId)).get()!;
}
```

### Test Isolation

- **Separate databases**: Each test suite uses its own database
- **Unique IDs**: Use `generateId()` for unique identifiers
- **No shared state**: Tests don't depend on each other

## Performance Testing

### Performance Logging

- **Environment variable**: `AGENT_MEMORY_PERF=1`
- **Logging**: Query duration, result counts
- **Benchmarks**: Use for performance-critical code

**Example**:

```typescript
it('should complete query within 50ms', () => {
  const start = Date.now();
  const result = executeMemoryQuery({ ... });
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(50);
});
```

## Debugging Tests

### Debug Mode

- **VS Code**: Use debugger with Vitest configuration
- **Console**: Use `console.log` (removed in production)
- **Breakpoints**: Set breakpoints in test or source code

### Common Issues

1. **Database not reset**: Ensure `afterAll` cleans up
2. **Mock not working**: Check import paths
3. **Type errors**: Ensure test types match source types
4. **Async issues**: Use `async/await` or return promises
