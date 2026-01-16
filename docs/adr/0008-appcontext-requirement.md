# ADR-0008: AppContext Requirement

## Status

Accepted

## Context

The application requires access to multiple shared resources:

- Database connection (Drizzle ORM instance)
- Raw SQLite connection (for transactions)
- Repository instances (guidelines, knowledge, tools, etc.)
- Service instances (permission, validation, etc.)

Previously, these were accessed via global singletons, which caused:

- Difficult testing (can't isolate test databases)
- Circular dependency issues
- Hidden dependencies in function signatures

## Decision

Introduce `AppContext` as the central dependency container:

```typescript
interface AppContext {
  db: AppDb; // Drizzle ORM instance
  sqlite: Database; // Raw better-sqlite3 instance
  repos: Repositories; // All repository instances
  services: Services; // All service instances
}
```

**Constraints:**

1. `AppContext` must be created via `createAppContext()` before any operations
2. All MCP handlers receive `AppContext` as first parameter
3. `getDb()` and `getSqlite()` throw if called before initialization
4. Tests use `registerDatabase()` to inject isolated test instances

## Consequences

**Positive:**

- Explicit dependencies (no hidden globals)
- Test isolation (each test can have its own database)
- Eliminates circular dependency issues
- Enables future PostgreSQL adapter injection

**Negative:**

- Requires passing context through call chains
- Initial setup ceremony before operations
- Migration effort from global patterns

## References

- Code location: `src/core/context.ts`
- Container: `src/core/container.ts`
- MCP server initialization: `src/restapi/server.ts:103`
- Test utilities: `tests/fixtures/test-helpers.ts`
