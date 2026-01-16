# ADR-0017: Unified Adapter Pattern

## Status

Accepted

## Context

Agent Memory needs to support multiple deployment topologies:

- Local development: SQLite, in-memory cache, file locks
- Single-server production: SQLite/PostgreSQL, LRU cache, file locks
- Distributed production: PostgreSQL, Redis cache, Redis locks, Redis events

Without abstraction, code would be littered with `if (isPostgres)` checks, and adding new backends would require touching many files.

We needed:

- Pluggable infrastructure without code changes
- Consistent interfaces across backend implementations
- Runtime backend selection via configuration
- Clean separation between business logic and infrastructure

## Decision

Use pluggable adapter interfaces for all infrastructure concerns. Each adapter type has a defined interface, with multiple implementations that can be swapped at runtime.

### Adapter Interfaces

```typescript
// Storage
interface IStorageAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

// Caching
interface ICacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Locking
interface ILockAdapter {
  acquire(key: string, ttlMs?: number): Promise<boolean>;
  release(key: string): Promise<void>;
  extend(key: string, ttlMs: number): Promise<boolean>;
}

// Events
interface IEventAdapter {
  publish(channel: string, event: unknown): Promise<void>;
  subscribe(channel: string, handler: (event: unknown) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
}

// Rate Limiting
interface IRateLimiterAdapter {
  tryAcquire(key: string, tokens?: number): Promise<boolean>;
  getRemaining(key: string): Promise<number>;
}

// Circuit Breaker
interface ICircuitBreakerAdapter {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): 'closed' | 'open' | 'half-open';
}
```

### Implementation Matrix

| Interface              | Local               | Distributed             |
| ---------------------- | ------------------- | ----------------------- |
| IStorageAdapter        | SQLiteAdapter       | PostgresAdapter         |
| ICacheAdapter          | LRUCacheAdapter     | RedisCacheAdapter       |
| ILockAdapter           | FileLockAdapter     | RedisLockAdapter        |
| IEventAdapter          | LocalEventAdapter   | RedisEventAdapter       |
| IRateLimiterAdapter    | TokenBucketAdapter  | RedisRateLimiterAdapter |
| ICircuitBreakerAdapter | LocalCircuitBreaker | (shared)                |

### Adapter Selection

Adapters are selected at startup based on configuration:

```typescript
// Container builds adapters based on config
const storage =
  config.database.type === 'postgresql'
    ? new PostgresAdapter(config.database)
    : new SQLiteAdapter(config.database);

const cache =
  config.cache.type === 'redis'
    ? new RedisCacheAdapter(config.redis)
    : new LRUCacheAdapter(config.cache);
```

### Async-First Design

All adapter methods are async (return Promises) even when the underlying implementation is synchronous. This ensures:

- Consistent API across implementations
- Easy swapping between sync (SQLite) and async (PostgreSQL) backends
- No breaking changes when upgrading from local to distributed

## Consequences

**Positive:**

- Backend changes require zero business logic modifications
- Each adapter is independently testable
- Clear contracts enable third-party implementations
- Runtime configuration enables same codebase for all environments
- Adapter composition enables hybrid deployments (e.g., SQLite + Redis cache)

**Negative:**

- Async overhead for synchronous operations (minimal in practice)
- Interface must be lowest-common-denominator (can't use PostgreSQL-specific features through interface)
- More files to maintain (interface + N implementations)
- Testing requires mocking adapter interfaces

## References

- Code locations:
  - `src/core/adapters/interfaces.ts` - All interface definitions
  - `src/core/adapters/sqlite.adapter.ts` - SQLite implementation
  - `src/core/adapters/postgres.adapter.ts` - PostgreSQL implementation
  - `src/core/adapters/lru-cache.adapter.ts` - LRU cache implementation
  - `src/core/adapters/redis-cache.adapter.ts` - Redis cache implementation
  - `src/core/adapters/local-event.adapter.ts` - Local pub/sub
  - `src/core/adapters/redis-event.adapter.ts` - Redis pub/sub
- Related ADRs: ADR-0013 (Multi-Backend Abstraction), ADR-0015 (Scaling Strategy)
- Principles: A2 (SQLite Default, PostgreSQL Scales), A3 (Layered Enhancement)
