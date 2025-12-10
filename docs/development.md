# Development Guide

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm (comes with Node.js)

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Memory
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run tests**
   ```bash
   npm test
   ```

The database will be automatically initialized on first run. No manual migration is required!

## Development Workflow

### Running the Development Server

```bash
npm run dev
# or
npm run dev:watch
```

This starts the MCP server in watch mode, automatically rebuilding on file changes.

### Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage
```

### Code Quality

#### Linting

```bash
# Check for linting errors
npm run lint

# Fix linting errors automatically
npm run lint:fix
```

#### Formatting

```bash
# Format all code
npm run format

# Check formatting without modifying files
npm run format:check
```

#### Type Checking

```bash
npm run typecheck
```

#### Validate Everything

Run all checks at once:

```bash
npm run validate
```

This runs linting, formatting check, type checking, and tests.

### Database Management

#### Database Location

By default, the database is stored at `data/memory.db`. You can customize this with the `AGENT_MEMORY_DB_PATH` environment variable:

```bash
export AGENT_MEMORY_DB_PATH=/custom/path/to/memory.db
```

#### Backup and Restore

```bash
# Create a backup
npm run db:backup

# Restore from backup
npm run db:restore data/backup-1234567890.db
```

#### Database Studio

Launch Drizzle Studio to inspect the database visually:

```bash
npm run db:studio
```

#### Generate Migrations

If you modify the schema in `src/db/schema.ts`:

```bash
npm run db:generate
```

### Project Structure

```
agent-memory/
├── src/
│   ├── db/
│   │   ├── schema.ts              # Database schema definitions
│   │   ├── connection.ts          # Database connection
│   │   ├── init.ts                # Auto-initialization logic
│   │   ├── migrations/            # SQL migration files
│   │   └── repositories/          # Data access layer
│   ├── services/
│   │   └── query.service.ts       # Query and caching logic
│   ├── mcp/
│   │   ├── server.ts              # MCP server setup
│   │   ├── handlers/              # Tool handlers
│   │   └── types.ts               # Type definitions
│   └── index.ts                   # Entry point
├── tests/
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   └── fixtures/                  # Test helpers
├── docs/                          # Documentation
├── examples/                      # Example workflows
└── scripts/                       # Development utilities
```

## Code Style Guidelines

### TypeScript

- Use TypeScript strict mode (already configured)
- Prefer `type` over `interface` for type aliases
- Use explicit return types for public functions
- Avoid `any` - use `unknown` instead

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `query.service.ts`)
- **Classes**: `PascalCase` (e.g., `QueryCache`)
- **Functions/Methods**: `camelCase` (e.g., `getAppliedMigrations`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `CONFLICT_WINDOW_MS`)
- **Types/Interfaces**: `PascalCase` (e.g., `CreateToolInput`)

### Imports

- Use `import type` for type-only imports
- Group imports: external libraries, then internal modules
- Use absolute imports from `src/` when possible

### Error Handling

- Throw descriptive errors with context
- Use `Error` or custom error classes
- Include suggestions in error messages when helpful

### Comments

- Use JSDoc for public functions and complex logic
- Avoid obvious comments
- Explain "why" not "what" in comments

## Testing Guidelines

### Test Structure

- Place unit tests in `tests/unit/`
- Place integration tests in `tests/integration/`
- Use descriptive test names: `describe('what you're testing', () => it('should do something', () => ...))`

### Test Helpers

Use the fixtures in `tests/fixtures/test-helpers.ts`:

```typescript
import { createTestDb, createTestTool } from '../fixtures/test-helpers.js';

describe('My Feature', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('should work', () => {
    const tool = createTestTool(db, 'my-tool');
    expect(tool.name).toBe('my-tool');
  });
});
```

### Coverage Goals

- Current: ~78% statement coverage
- Target: >80% (not yet achieved due to testing limitations - see below)
- Test edge cases and error conditions
- Integration tests for critical paths

#### Test Coverage Details

**Current Coverage (228 tests passing):**
- Statements: ~77%
- Functions: ~77%
- Branches: ~67%
- Lines: ~79%

**Coverage Limitations:**

The project aims for >80% coverage, but currently sits at ~78% due to challenges testing MCP server handlers:

1. **MCP Server Handler Testing** (`src/mcp/server.ts`):
   - The MCP SDK's `Server` class manages handlers internally and doesn't expose them for direct testing
   - Handler logic requires transport connection which complicates unit testing
   - **Solution**: Individual handler logic is thoroughly tested through integration tests for each tool (memory_org, memory_query, etc.)
   - The server's `createServer()` function is tested, but the internal `CallToolRequest` handler dispatch logic has limited coverage

2. **Entry Point Testing** (`src/index.ts`):
   - The CLI entry point runs server startup which is tested through integration tests
   - Direct testing would require mocking process.argv and process.exit

**What IS Well Tested:**
- ✅ All database repositories (79-98% coverage)
- ✅ All handler business logic (85-96% coverage)
- ✅ Error handling utilities (80%+ coverage)
- ✅ Query service (88-91% coverage)
- ✅ Database initialization (86% coverage)

**Strategy:**
- Focus on testing business logic and handlers (well covered)
- Accept limitation on server transport/handler dispatch layer
- Individual tool handlers are fully tested through integration tests

## Debugging

### Enable Performance Logging

```bash
export AGENT_MEMORY_PERF=1
npm run dev
```

### Enable Query Caching Statistics

Query caching is enabled by default. To disable:

```bash
export AGENT_MEMORY_CACHE=0
npm run dev
```

### VS Code Debugging

If you have the VS Code configuration set up (see `.vscode/launch.json`), you can:

1. Set breakpoints in your code
2. Press F5 or go to Run > Start Debugging
3. Choose "Debug MCP Server"

### Common Issues

#### Database Locked Error

If you get a "database is locked" error:

1. Make sure no other process is accessing the database
2. Check for zombie processes: `ps aux | grep node`
3. Delete the lock files: `rm data/*.db-shm data/*.db-wal`

#### Tests Hanging

If tests hang or timeout:

1. Make sure all database connections are closed
2. Check for unclosed promises
3. Run tests with increased timeout: `vitest run --testTimeout=10000`

#### Migration Errors

If migrations fail:

1. Check the migration files in `src/db/migrations/`
2. The database might be in an inconsistent state - use `npm run db:backup` first
3. You can reset the database with the `memory_init` tool (action: 'reset')

## Performance Optimization

### Query Performance

- Use indexes for frequently queried fields
- Limit result sets with `limit` parameter (default: 20, max: 100)
- Use `compact` mode to reduce payload size
- Enable query caching for global scope queries (enabled by default)

### Database Performance

- WAL mode is enabled by default for better concurrency
- Keep the database file on SSD for best performance
- Regular VACUUM operations can improve performance (run via Drizzle Studio)

## Contributing

Before submitting a PR:

1. Run `npm run validate` to ensure all checks pass
2. Add tests for new features
3. Update documentation if needed
4. Follow the code style guidelines
5. Write clear commit messages

See [CONTRIBUTING.md](../CONTRIBUTING.md) for more details.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DB_PATH` | `data/memory.db` | Custom database file path |
| `AGENT_MEMORY_PERF` | `0` | Enable performance logging (set to `1`) |
| `AGENT_MEMORY_CACHE` | `1` | Enable query caching (set to `0` to disable) |

## Resources

- [Architecture Documentation](./architecture.md)
- [API Reference](./api-reference.md)
- [Testing Guide](./testing-guide.md)
- [Data Model](./data-model.md)
- [Example Workflows](../examples/workflows/)
