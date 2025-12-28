# ADR-0013: Multi-Backend Abstraction

## Status

Accepted

## Context

The application needs to support multiple deployment scenarios:
- **SQLite**: Local/embedded deployments, development, testing
- **PostgreSQL**: Production deployments with high concurrency
- **pgvector**: PostgreSQL with vector similarity search

Each backend has different:
- Connection management (file vs connection pool)
- Transaction handling (sync vs async)
- Vector search capabilities (none vs pgvector extension)

## Decision

Implement multi-backend support through adapter abstraction:

**Storage Adapter Interface:**
```typescript
interface IStorageAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

**Backend-Specific Implementations:**
- `SQLiteStorageAdapter`: Uses better-sqlite3 (sync)
- `PostgreSQLStorageAdapter`: Uses pg with connection pooling
- `PgVectorAdapter`: Extends PostgreSQL with vector operations

**Configuration:**
```bash
# SQLite (default)
AGENT_MEMORY_DB_PATH=./data/memory.db

# PostgreSQL
AGENT_MEMORY_DATABASE_URL=postgres://user:pass@host:5432/db

# Vector backend selection
AGENT_MEMORY_VECTOR_BACKEND=sqlite | pgvector
```

**Transaction Handling:**
- SQLite: `transactionWithRetry()` handles SQLITE_BUSY
- PostgreSQL: Adapter handles deadlocks, serialization failures
- Both use exponential backoff for retries

## Consequences

**Positive:**
- Deploy anywhere (embedded to cloud)
- Backend-appropriate optimizations
- Vector search scales with pgvector
- Same API regardless of backend

**Negative:**
- Complexity of maintaining multiple adapters
- Testing matrix expands with backends
- Some features may not be available on all backends

## References

- Storage adapters: `src/storage/adapters/`
- PostgreSQL adapter: `src/storage/adapters/postgresql.ts`
- Vector abstraction: `src/services/embedding/vector-store.ts`
- Related: ADR-0007 (Transaction Retry Logic)
