# Agent Memory — CLAUDE.md

MCP server providing persistent, queryable memory for AI agents. SQLite-backed with hierarchical scoping (Global → Org → Project → Session), three memory types (Tools, Guidelines, Knowledge), semantic search, and multi-agent coordination.

## Quick Commands

```bash
npm run build          # Full build (all targets)
npm run build:mcp      # MCP server only
npm run dev            # Watch mode (tsx)
npm run test:run       # Run tests once
npm run test:coverage  # Tests with coverage report
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier auto-format
npm run validate       # Full validation (lint + architecture + format + typecheck + tests)
npm run db:generate    # Generate Drizzle migrations
npm run db:migrate     # Run migrations
npm start              # Run MCP server (production)
```

## Architecture

**Layered architecture with strict boundaries:**

1. **MCP Handlers** (`src/mcp/handlers/`) — Parameter validation, permission checks, response formatting. NO business logic here.
2. **Services** (`src/services/`) — Business logic, cross-cutting concerns. NO direct database access.
3. **Repositories** (`src/db/repositories/`) — Data access layer. All writes wrapped in `transaction()`.
4. **Database** (`src/db/schema.ts`, `src/db/migrations/`) — Drizzle ORM table definitions and SQL migrations.

**Mandatory rules (see `architecture_final.md` for full details):**

- NO module-level singletons or `getInstance()` patterns
- NO `require()` to break circular dependencies
- NO business logic in MCP handlers
- NO direct database access outside repositories
- NO hidden dependencies resolved at runtime
- Access services via `runtime.services.*` (dependency injection)
- Run `npm run lint:architecture` to verify compliance

## Tech Stack

- TypeScript 5.7 (strict mode, ES2022, NodeNext modules)
- SQLite via better-sqlite3 + Drizzle ORM
- Vitest for testing
- Fastify for optional REST API
- LanceDB for vector search
- Zod for runtime validation

## Code Conventions

**Files:** `kebab-case.ts` (e.g., `knowledge.handler.ts`)
**Types:** `PascalCase` (e.g., `KnowledgeAddParams`)
**Functions:** `camelCase` (e.g., `getById`)
**Constants:** `UPPER_SNAKE_CASE` (e.g., `DEFAULT_LIMIT`)
**Repos:** `camelCase` + `Repo` (e.g., `knowledgeRepo`)
**Handlers:** `camelCase` + `Handlers` (e.g., `knowledgeHandlers`)

**Formatting:** Prettier — 100-char lines, single quotes, 2-space indent, semicolons required, ES5 trailing commas.

**Import order:** External → Internal → Type imports (`import type`).

**Immutability:** Always create new objects, never mutate. All data patterns are append-only.

**Error handling:** Use `AgentMemoryError` with categorized error codes (1000s: validation, 2000s: resources, 3000s: locks, 4000s: database, 5000s: system). Format with `formatError()` for MCP responses.

## Key Patterns

- **Action-based routing:** 17 bundled MCP tools with `action` parameter routing to handler methods
- **Append-only versioning:** Every update creates a new version, never modifies existing
- **Scope inheritance:** Queries traverse session → project → org → global with `inherit: true`
- **Conflict detection:** 5-second window for concurrent writes, both versions stored
- **Embeddings:** Generated asynchronously (fire-and-forget), never block on generation
- **Type casting:** Use `cast<T>(params)` in handlers, validate required fields at runtime

## Testing

- **Framework:** Vitest (`tests/unit/`, `tests/integration/`, `tests/e2e/`)
- **Coverage target:** 80% lines/functions, 70% branches
- **Pattern:** Arrange-Act-Assert, `describe`/`it` blocks, `should <behavior>` naming
- **Database:** Each test suite uses its own isolated test database
- **Mocking:** Mock `getDb()` via `vi.mock()`, use `setupTestDb`/`cleanupTestDb` from `tests/fixtures/test-helpers.ts`
- **Run single file:** `npm test tests/integration/knowledge.test.ts`

## Project Structure

```
src/
├── cli/              # CLI entry points
├── config/           # Configuration registry
├── core/             # DI container, runtime, adapters, interfaces
├── db/
│   ├── schema.ts     # Drizzle table definitions
│   ├── migrations/   # 50+ numbered SQL migrations
│   └── repositories/ # 33+ data access repositories
├── mcp/
│   ├── server.ts     # MCP server setup
│   ├── handlers/     # Action-based tool handlers
│   └── descriptors/  # Tool definitions
├── services/         # 70+ business logic modules
├── restapi/          # Optional REST API (Fastify)
└── utils/            # Shared utilities
tests/
├── unit/             # Repository and service tests
├── integration/      # Handler and MCP tool tests
├── e2e/              # End-to-end tests
├── fixtures/         # Test helpers and mocks
└── benchmarks/       # Performance benchmarks
dashboard/            # React/Vite/Tailwind frontend
docs/adr/             # 26+ Architecture Decision Records
rules/developer/      # Developer rules (loaded by Claude Code)
```

## Commit Messages

Format: `<type>: <description>` — Types: feat, fix, refactor, docs, test, chore, perf, ci.
