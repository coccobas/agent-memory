---
description: Coding standards and how we write software
globs: ['**/*.ts']
alwaysApply: true
---

# Coding Standards

## TypeScript Configuration

- **Strict mode**: Enabled (`strict: true` in `tsconfig.json`)
- **Module system**: ES modules (`"module": "NodeNext"`)
- **Target**: ES2022
- **Type checking**: All strict checks enabled:
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noImplicitReturns: true`
  - `noFallthroughCasesInSwitch: true`
  - `noUncheckedIndexedAccess: true`

## Code Style

### Formatting

- **Prettier**: Auto-formatting with project config
- **Line length**: 100 characters
- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Trailing commas**: ES5 style

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `knowledge.handler.ts`, `file_locks.ts`)
- **Types/Interfaces**: `PascalCase` (e.g., `KnowledgeAddParams`, `ScopeType`)
- **Functions/Variables**: `camelCase` (e.g., `getById`, `scopeType`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_LIMIT`, `CONFLICT_WINDOW_MS`)
- **Repositories**: `camelCase` with `Repo` suffix (e.g., `knowledgeRepo`, `toolRepo`)
- **Handlers**: `camelCase` with `Handlers` suffix (e.g., `knowledgeHandlers`, `toolHandlers`)

### Type Safety

- **Avoid `any`**: Use `unknown` and type guards instead
- **Type imports**: Use `import type` for type-only imports
- **Explicit types**: Prefer explicit return types for public APIs
- **Type assertions**: Minimize use, prefer type guards

**Example:**

```typescript
// Good
import type { KnowledgeAddParams } from '../types.js';
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

// Bad
function handler(params: any): any { ... }
```

## Project Structure

### Directory Organization

```
src/
├── db/
│   ├── schema.ts           # Drizzle table definitions
│   ├── connection.ts       # Database connection
│   ├── init.ts             # Database initialization
│   ├── migrations/         # SQL migration files
│   └── repositories/       # Data access layer
├── mcp/
│   ├── server.ts           # MCP server setup
│   ├── handlers/           # Tool handlers
│   ├── types.ts            # MCP type definitions
│   └── errors.ts           # Error utilities
└── services/               # Business logic
```

### File Organization

1. **Imports**: Grouped by source (external, internal, types)
2. **Constants**: At top of file
3. **Types/Interfaces**: After constants
4. **Implementation**: Main code
5. **Exports**: At end

**Example:**

```typescript
// External imports
import { eq, and } from 'drizzle-orm';

// Internal imports
import { getDb } from '../connection.js';
import { knowledge } from '../schema.js';

// Type imports
import type { Knowledge, ScopeType } from '../schema.js';

// Constants
const DEFAULT_LIMIT = 20;

// Types
export interface CreateKnowledgeInput { ... }

// Implementation
export const knowledgeRepo = { ... };
```

## Design Patterns

### Repository Pattern

- **Location**: `src/db/repositories/`
- **Pattern**: Export object with CRUD methods
- **Naming**: `{entity}Repo` (e.g., `knowledgeRepo`, `toolRepo`)
- **Methods**: `create`, `getById`, `getBy{Field}`, `list`, `update`, `getHistory`, `deactivate`

**Example:**

```typescript
export const knowledgeRepo = {
  create(input: CreateKnowledgeInput): KnowledgeWithVersion {
    return transaction(() => {
      // Implementation
    });
  },

  getById(id: string): KnowledgeWithVersion | undefined {
    // Implementation
  },

  // ... other methods
};
```

### Service Pattern

- **Location**: `src/services/`
- **Purpose**: Business logic, cross-cutting concerns
- **Naming**: `{domain}.service.ts` (e.g., `query.service.ts`, `permission.service.ts`)
- **Pattern**: Export functions or objects with methods

### Handler Pattern

- **Location**: `src/mcp/handlers/`
- **Purpose**: MCP tool interface
- **Naming**: `{entity}.handler.ts` (e.g., `knowledge.handler.ts`)
- **Pattern**: Export object with action methods matching tool actions

**Handler structure:**

```typescript
export const knowledgeHandlers = {
  add(params: Record<string, unknown>) {
    // 1. Cast params
    const { scopeType, title, content } = cast<KnowledgeAddParams>(params);

    // 2. Validate
    if (!scopeType) throw new Error('scopeType is required');

    // 3. Check permissions
    if (agentId && !checkPermission(...)) {
      throw new Error('Permission denied');
    }

    // 4. Business logic (duplicate check, validation, etc.)

    // 5. Call repository
    const knowledge = knowledgeRepo.create(input);

    // 6. Log audit
    logAction({ ... });

    // 7. Return result
    return { success: true, knowledge };
  }
};
```

## Error Handling

### Custom Error Class

- **Class**: `AgentMemoryError` (extends `Error`)
- **Location**: `src/mcp/errors.ts`
- **Properties**: `message`, `code`, `context`
- **Formatting**: `formatError()` converts to MCP response format

**Usage:**

```typescript
import { AgentMemoryError, ErrorCodes } from '../errors.js';

throw new AgentMemoryError('Knowledge entry not found', ErrorCodes.NOT_FOUND, {
  resource: 'knowledge',
  identifier: id,
});
```

### Error Codes

- **1000-1999**: Validation errors
- **2000-2999**: Resource errors (not found, conflicts)
- **3000-3999**: Lock errors
- **4000-4999**: Database errors
- **5000-5999**: System errors

### Error Handling in Handlers

- **Try-catch**: Wrap handler logic in try-catch
- **Format**: Use `formatError()` for MCP responses
- **Context**: Include helpful suggestions in error context

## Transaction Management

- **Wrapper**: `transaction()` function from `connection.ts`
- **Usage**: Wrap all write operations
- **Pattern**: Return value from transaction callback

**Example:**

```typescript
return transaction(() => {
  const db = getDb();
  // Multiple database operations
  db.insert(knowledge).values(entry).run();
  db.insert(knowledgeVersions).values(version).run();
  return result;
});
```

## Parameter Validation

### Handler Validation

- **Required fields**: Check explicitly, throw errors
- **Type casting**: Use `cast<T>()` helper for type safety
- **Validation service**: Use `validateEntry()` for complex validation

**Example:**

```typescript
const { scopeType, title, content } = cast<KnowledgeAddParams>(params);

if (!scopeType) throw new Error('scopeType is required');
if (!title) throw new Error('title is required');
if (!content) throw new Error('content is required');

const validation = validateEntry('knowledge', { title, content }, scopeType, scopeId);
if (!validation.valid) {
  throw new Error(`Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`);
}
```

## Documentation

### JSDoc Comments

- **Public APIs**: All exported functions/classes should have JSDoc
- **Format**: Standard JSDoc with `@param`, `@returns`, `@throws`
- **Examples**: Include usage examples for complex functions

**Example:**

```typescript
/**
 * Create a new knowledge entry with initial version
 *
 * @param input - Knowledge creation parameters including scope, title, and initial content
 * @returns The created knowledge entry with its current version
 * @throws Error if a knowledge entry with the same title already exists in the scope
 */
create(input: CreateKnowledgeInput): KnowledgeWithVersion { ... }
```

## Code Quality

### Linting

- **ESLint**: Configured with TypeScript plugin
- **Rules**: Strict TypeScript rules, Prettier integration
- **Unused variables**: Error (can prefix with `_` to ignore)
- **Console**: Warn only (use `console.warn` or `console.error`)

### Type Checking

- **Command**: `npm run typecheck`
- **Strict**: All strict checks enabled
- **No implicit any**: Required

### Formatting

- **Command**: `npm run format` (write), `npm run format:check` (check)
- **Auto-fix**: `npm run lint:fix` for ESLint, `npm run format` for Prettier

## Testing

- **Framework**: Vitest
- **Location**: `tests/` (unit: `tests/unit/`, integration: `tests/integration/`)
- **Pattern**: Use `describe` blocks, `it` for tests
- **Fixtures**: Use `test-helpers.ts` for common setup
- **Coverage**: Target ~78% (current baseline)

**Example:**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';

describe('Knowledge Integration', () => {
  beforeAll(() => {
    // Setup
  });

  afterAll(() => {
    // Cleanup
  });

  it('should add a knowledge entry', () => {
    // Test
  });
});
```

## Version Control

### Commit Messages

- **Format**: `<type>: <subject>`
- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- **Body**: Optional, describe what and why
- **Footer**: Optional, reference issues

**Example:**

```
feat: add file lock timeout validation

- Validate lock timeout is between 0 and max value
- Add test for timeout validation
- Update error messages to be more descriptive
```

## Performance

### Query Optimization

- **Indexes**: Use database indexes for frequent queries
- **Caching**: Use query cache for global scope queries
- **Pagination**: Always use `limit` and `offset`
- **Soft caps**: Use `limit * 2` for initial fetch, then trim

### Performance Logging

- **Environment variable**: `AGENT_MEMORY_PERF=1`
- **Logging**: Query type, parameters, duration, result counts
- **Format**: `[agent-memory] memory_query scope=project types=tools,guidelines results=15/42 durationMs=8`
