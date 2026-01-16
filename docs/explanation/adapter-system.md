# Adapter System

Agent Memory uses an adapter pattern to abstract persistence backends. This allows swapping between SQLite and PostgreSQL (or adding new backends) without changing business logic.

## Overview

```
┌─────────────────────────────────────────┐
│         Business Logic Layer            │
│  (services, handlers, query pipeline)   │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│          Adapter Interfaces             │
│  StorageAdapter, LockAdapter,           │
│  CacheAdapter, EventAdapter             │
└──────────────────┬──────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌─────────┐  ┌──────────┐  ┌─────────┐
│ SQLite  │  │ PostgreSQL│  │  Redis  │
│ Adapter │  │  Adapter  │  │ Adapter │
└─────────┘  └──────────┘  └─────────┘
```

---

## Adapter Types

### StorageAdapter

Handles database operations:

- Query execution
- Transaction management
- Connection pooling

**Implementations:**

- `SQLiteAdapter` - Default, single-node
- `PostgreSQLAdapter` - Enterprise, distributed

### LockAdapter

Handles distributed locking:

- File locks for multi-agent coordination
- Transaction locks

**Implementations:**

- `InMemoryLockAdapter` - Default, single-process
- `RedisLockAdapter` - Distributed, multi-node

### CacheAdapter

Handles query caching:

- LRU cache management
- Cache invalidation

**Implementations:**

- `InMemoryCacheAdapter` - Default, per-process
- `RedisCacheAdapter` - Distributed, shared across nodes

### EventAdapter

Handles cross-process events:

- Cache invalidation broadcasts
- Real-time updates

**Implementations:**

- `InMemoryEventAdapter` - Default, single-process
- `RedisEventAdapter` - Pub/sub across nodes

---

## Backend Selection

The backend is selected via environment variable:

```bash
# SQLite (default)
AGENT_MEMORY_DB_TYPE=sqlite

# PostgreSQL
AGENT_MEMORY_DB_TYPE=postgresql
```

### SQLite Configuration

```bash
AGENT_MEMORY_DB_PATH=~/.agent-memory/data/memory.db
AGENT_MEMORY_DB_BUSY_TIMEOUT_MS=5000
```

### PostgreSQL Configuration

```bash
AGENT_MEMORY_DB_TYPE=postgresql
AGENT_MEMORY_PG_HOST=localhost
AGENT_MEMORY_PG_PORT=5432
AGENT_MEMORY_PG_DATABASE=agent_memory
AGENT_MEMORY_PG_USER=postgres
AGENT_MEMORY_PG_PASSWORD=secret
AGENT_MEMORY_PG_SSL=true
AGENT_MEMORY_PG_POOL_MIN=2
AGENT_MEMORY_PG_POOL_MAX=10
```

---

## Distributed Mode with Redis

Enable Redis for multi-node deployments:

```bash
AGENT_MEMORY_REDIS_ENABLED=true
AGENT_MEMORY_REDIS_HOST=localhost
AGENT_MEMORY_REDIS_PORT=6379
```

This switches:

- `LockAdapter` → `RedisLockAdapter`
- `CacheAdapter` → `RedisCacheAdapter`
- `EventAdapter` → `RedisEventAdapter`

---

## How Adapters Work

### Context Wiring

During startup, `createAppContext()` resolves adapters based on configuration:

```typescript
// Simplified flow
const dbType = config.dbType; // 'sqlite' or 'postgresql'
const redisEnabled = config.redis.enabled;

// Select storage adapter
const storageAdapter =
  dbType === 'postgresql'
    ? new PostgreSQLAdapter(config.postgresql)
    : new SQLiteAdapter(config.database);

// Select distributed adapters
const lockAdapter = redisEnabled ? new RedisLockAdapter(config.redis) : new InMemoryLockAdapter();
```

### Service Independence

Services receive adapters via dependency injection:

```typescript
class QueryService {
  constructor(
    private storage: StorageAdapter,
    private cache: CacheAdapter
  ) {}

  async search(params: SearchParams) {
    // Uses storage adapter - works with SQLite or PostgreSQL
    const results = await this.storage.query(params);
    return results;
  }
}
```

---

## Adding New Backends

To add a new backend (e.g., MySQL):

1. **Implement the adapter interface:**

   ```typescript
   class MySQLAdapter implements StorageAdapter {
     query(sql: string, params: unknown[]): Promise<unknown[]>;
     transaction<T>(fn: () => T): Promise<T>;
     // ... other methods
   }
   ```

2. **Add configuration section:**

   ```typescript
   // src/config/registry/sections/mysql.ts
   export const mysqlSection = {
     name: 'mysql',
     options: {
       /* ... */
     },
   };
   ```

3. **Wire in context factory:**
   ```typescript
   // src/core/factory/context.ts
   if (config.dbType === 'mysql') {
     adapter = new MySQLAdapter(config.mysql);
   }
   ```

---

## Testing with Adapters

Adapters make testing easier:

```typescript
// Use in-memory adapters for tests
const testAdapter = new InMemoryStorageAdapter();
const service = new QueryService(testAdapter, mockCache);

// Test without database
await service.search({ query: 'test' });
expect(testAdapter.queries).toContain('test');
```

---

## Benefits

| Benefit         | Description                                    |
| --------------- | ---------------------------------------------- |
| **Flexibility** | Swap backends without code changes             |
| **Testability** | Mock adapters for unit tests                   |
| **Scalability** | Start with SQLite, scale to PostgreSQL         |
| **Isolation**   | Business logic doesn't know about SQL dialects |

---

## See Also

- [Architecture](architecture.md) - System overview
- [PostgreSQL Setup](../guides/postgresql-setup.md) - Enterprise database guide
- [Redis Distributed](../guides/redis-distributed.md) - Multi-node setup
