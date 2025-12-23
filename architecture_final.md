# Agent Memory: Final Architecture Specification

**Version:** 1.1
**Date:** 2025-12-23
**Status:** Canonical Reference
**Last Updated:** All HIGH priority tasks completed (including embedding retry queue with stats, retry mechanism, and reindex CLI)

---

## 1. Executive Summary

This document establishes the canonical architecture for Agent Memory. It consolidates learnings from the architecture evaluation, documents current state, and defines the patterns that all future development must follow.

**Core Principles:**
1. **Explicit Dependencies** - All dependencies flow through `AppContext`; no hidden globals
2. **Single Source of Truth** - One way to do things, documented here
3. **Testability First** - Every component must be testable in isolation
4. **Database Agnostic** - Abstract storage layer; SQLite default, PostgreSQL for enterprise
5. **Enterprise Ready** - Design for horizontal scale, even if not implemented initially

---

## 2. Enterprise Scalability Strategy

### 2.1 Design Philosophy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DUAL-MODE ARCHITECTURE                                   │
│                                                                             │
│   ┌─────────────────────────┐         ┌─────────────────────────┐          │
│   │     STANDALONE MODE     │         │    ENTERPRISE MODE      │          │
│   │     (Default)           │         │    (Configuration)      │          │
│   ├─────────────────────────┤         ├─────────────────────────┤          │
│   │ • SQLite embedded       │         │ • PostgreSQL            │          │
│   │ • In-memory cache       │         │ • Redis cache           │          │
│   │ • Local file locks      │         │ • Distributed locks     │          │
│   │ • Single process        │         │ • Horizontal scaling    │          │
│   │ • Zero config           │         │ • Full enterprise       │          │
│   └─────────────────────────┘         └─────────────────────────┘          │
│                                                                             │
│   Same codebase, same APIs, different infrastructure adapters              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Abstraction Layers (Required for PostgreSQL Migration)

The following interfaces must be introduced to enable database-agnostic operation:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// STORAGE ADAPTER - Abstract database operations
// ═══════════════════════════════════════════════════════════════════════════

interface IStorageAdapter {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Transaction support
  transaction<T>(fn: (tx: ITransaction) => Promise<T>): Promise<T>;

  // Health & diagnostics
  healthCheck(): Promise<HealthStatus>;
  getMetrics(): StorageMetrics;
}

interface ITransaction {
  // Raw query execution (parameterized)
  execute<T>(sql: string, params?: unknown[]): Promise<T[]>;
  executeSingle<T>(sql: string, params?: unknown[]): Promise<T | null>;

  // Commit/rollback (usually automatic)
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY BUILDER - Database-agnostic query construction
// ═══════════════════════════════════════════════════════════════════════════

interface IQueryBuilder {
  // Continue using Drizzle ORM - it supports both SQLite and PostgreSQL
  // No custom abstraction needed here
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE ADAPTER - Abstract caching (memory vs Redis)
// ═══════════════════════════════════════════════════════════════════════════

interface ICacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;

  // Batch operations (important for performance)
  getMany<T>(keys: string[]): Promise<Map<string, T>>;
  setMany<T>(entries: Map<string, T>, ttlMs?: number): Promise<void>;

  // Stats
  getStats(): CacheStats;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCK ADAPTER - Abstract distributed locking
// ═══════════════════════════════════════════════════════════════════════════

interface ILockAdapter {
  acquire(resource: string, ttlMs: number, ownerId: string): Promise<LockHandle | null>;
  release(handle: LockHandle): Promise<boolean>;
  extend(handle: LockHandle, ttlMs: number): Promise<boolean>;
  isLocked(resource: string): Promise<boolean>;
  getOwner(resource: string): Promise<string | null>;
}

interface LockHandle {
  resource: string;
  ownerId: string;
  token: string;  // For Redis Redlock pattern
  expiresAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT ADAPTER - Abstract pub/sub (local vs Redis)
// ═══════════════════════════════════════════════════════════════════════════

interface IEventAdapter {
  publish(channel: string, event: unknown): Promise<void>;
  subscribe(channel: string, handler: (event: unknown) => void): Unsubscribe;
}
```

### 2.3 Implementation Roadmap

```
Phase 0: Foundation (COMPLETED - 2025-12-23)
═══════════════════════════════════════════════════
┌─────────────────────────────────────────────────────────────────┐
│ Task                              │ Status    │ Blocks          │
├───────────────────────────────────┼───────────┼─────────────────┤
│ Transaction retry w/ backoff      │ ✅ DONE   │ -               │
│ Make all repos async (Promise<T>) │ ✅ DONE   │ -               │
│ Remove legacy permission exports  │ ✅ DONE   │ -               │
│ Shared AppContext for REST        │ ✅ DONE   │ -               │
└─────────────────────────────────────────────────────────────────┘

Phase 1: Abstraction Layer (Next Sprint)
═══════════════════════════════════════════════════
┌─────────────────────────────────────────────────────────────────┐
│ Task                              │ Status    │ Blocks          │
├───────────────────────────────────┼───────────┼─────────────────┤
│ Define IStorageAdapter interface  │ TODO      │ -               │
│ Define ICacheAdapter interface    │ TODO      │ -               │
│ Define ILockAdapter interface     │ TODO      │ -               │
│ Define IEventAdapter interface    │ TODO      │ -               │
│ Implement SQLiteStorageAdapter    │ TODO      │ Interface       │
│ Implement MemoryCacheAdapter      │ TODO      │ Interface       │
│ Implement LocalLockAdapter        │ TODO      │ Interface       │
│ Implement LocalEventAdapter       │ TODO      │ Interface       │
│ Refactor repos to use adapters    │ TODO      │ Adapters        │
└─────────────────────────────────────────────────────────────────┘

Phase 2: PostgreSQL Support (Q2)
═══════════════════════════════════════════════════
┌─────────────────────────────────────────────────────────────────┐
│ Task                              │ Status    │ Blocks          │
├───────────────────────────────────┼───────────┼─────────────────┤
│ Implement PostgresStorageAdapter  │ TODO      │ Phase 1         │
│ Add connection pooling (pg-pool)  │ TODO      │ PostgresAdapter │
│ Migrate FTS5 to PostgreSQL tsvector│ TODO     │ PostgresAdapter │
│ Update Drizzle schema for PG      │ TODO      │ PostgresAdapter │
│ Add PG-specific migrations        │ TODO      │ Schema          │
│ Integration tests with PostgreSQL │ TODO      │ All above       │
└─────────────────────────────────────────────────────────────────┘

Phase 3: Distributed Infrastructure (Q3)
═══════════════════════════════════════════════════
┌─────────────────────────────────────────────────────────────────┐
│ Task                              │ Status    │ Blocks          │
├───────────────────────────────────┼───────────┼─────────────────┤
│ Implement RedisCacheAdapter       │ TODO      │ Phase 1         │
│ Implement RedisLockAdapter        │ TODO      │ Phase 1         │
│ Implement RedisEventAdapter       │ TODO      │ Phase 1         │
│ Add Redis connection management   │ TODO      │ Redis adapters  │
│ Implement Redlock for dist locks  │ TODO      │ RedisLockAdapter│
│ Horizontal scaling tests          │ TODO      │ All above       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Configuration for Enterprise Mode

```typescript
// Environment-driven adapter selection
interface EnterpriseConfig {
  // Storage
  storage: {
    adapter: 'sqlite' | 'postgresql';

    // SQLite options
    sqlite?: {
      path: string;
      walMode: boolean;
    };

    // PostgreSQL options
    postgresql?: {
      connectionString: string;
      poolMin: number;
      poolMax: number;
      ssl: boolean;
    };
  };

  // Caching
  cache: {
    adapter: 'memory' | 'redis';

    memory?: {
      maxSizeMB: number;
    };

    redis?: {
      url: string;
      keyPrefix: string;
      cluster?: boolean;
    };
  };

  // Distributed locking
  locks: {
    adapter: 'local' | 'redis';

    redis?: {
      url: string;
      retryCount: number;
      retryDelayMs: number;
    };
  };

  // Events/Pub-Sub
  events: {
    adapter: 'local' | 'redis';

    redis?: {
      url: string;
      channel: string;
    };
  };
}
```

```bash
# Standalone mode (default)
AGENT_MEMORY_STORAGE_ADAPTER=sqlite
AGENT_MEMORY_CACHE_ADAPTER=memory
AGENT_MEMORY_LOCK_ADAPTER=local

# Enterprise mode
AGENT_MEMORY_STORAGE_ADAPTER=postgresql
AGENT_MEMORY_POSTGRESQL_URL=postgres://user:pass@host:5432/agentmemory
AGENT_MEMORY_POSTGRESQL_POOL_MAX=20
AGENT_MEMORY_CACHE_ADAPTER=redis
AGENT_MEMORY_REDIS_URL=redis://host:6379
AGENT_MEMORY_LOCK_ADAPTER=redis
```

### 2.5 What Changes vs What Stays the Same

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAYS THE SAME                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✅ Repository interfaces (IGuidelineRepository, etc.)                        │
│ ✅ Service interfaces (IEmbeddingService, etc.)                              │
│ ✅ Handler signatures (ContextAwareHandler)                                  │
│ ✅ AppContext structure                                                      │
│ ✅ MCP/REST API contracts                                                    │
│ ✅ Error codes and hierarchy                                                 │
│ ✅ Query pipeline stages                                                     │
│ ✅ Drizzle ORM (supports both SQLite and PostgreSQL)                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        CHANGES (Behind Adapters)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🔄 Database connection (SQLite → PostgreSQL connection pool)                 │
│ 🔄 Transaction handling (sync → async)                                       │
│ 🔄 Full-text search (FTS5 → tsvector)                                       │
│ 🔄 Cache storage (LRU in-memory → Redis)                                    │
│ 🔄 File locks (local table → Redis distributed locks)                       │
│ 🔄 Event bus (EventEmitter → Redis pub/sub)                                 │
│ 🔄 Prepared statements (better-sqlite3 → pg prepared)                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 PostgreSQL-Specific Considerations

#### Full-Text Search Migration

```sql
-- SQLite FTS5 (current)
CREATE VIRTUAL TABLE guidelines_fts USING fts5(name, content);

-- PostgreSQL tsvector (future)
ALTER TABLE guidelines ADD COLUMN search_vector tsvector;
CREATE INDEX guidelines_search_idx ON guidelines USING GIN(search_vector);

-- Auto-update trigger
CREATE TRIGGER guidelines_search_update
  BEFORE INSERT OR UPDATE ON guidelines
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', name, content);
```

#### Connection Pooling

```typescript
// PostgreSQL requires proper connection pooling
interface PostgresStorageAdapter extends IStorageAdapter {
  // Pool management
  getPoolStats(): {
    total: number;
    idle: number;
    waiting: number;
  };

  // Acquire connection with timeout
  withConnection<T>(fn: (conn: PoolClient) => Promise<T>): Promise<T>;
}
```

#### Async Everywhere

```typescript
// SQLite (sync, current)
function getById(id: string): Guideline | undefined {
  return db.select().from(guidelines).where(eq(guidelines.id, id)).get();
}

// PostgreSQL (async, future) - Repository interface must support both
async function getById(id: string): Promise<Guideline | undefined> {
  const [result] = await db.select().from(guidelines).where(eq(guidelines.id, id));
  return result;
}

// Solution: All repository methods return Promise (even for SQLite)
interface IGuidelineRepository {
  getById(id: string): Promise<GuidelineWithVersion | undefined>;  // Always async
}
```

### 2.7 Scaling Characteristics by Mode

| Aspect | Standalone (SQLite) | Enterprise (PostgreSQL + Redis) |
|--------|--------------------|---------------------------------|
| **Write throughput** | ~1-5K/sec | ~50-100K/sec |
| **Read throughput** | ~3-4M/sec (cached) | ~500K/sec (distributed) |
| **Horizontal scaling** | ❌ No | ✅ Yes |
| **Data volume** | 10-50GB | Terabytes |
| **Concurrent agents** | 10-50 | 1000+ |
| **High availability** | ❌ No | ✅ Yes (replicas) |
| **Multi-region** | ❌ No | ✅ Yes |
| **Deployment complexity** | Zero config | Requires infrastructure |
| **Cost** | Free | PostgreSQL + Redis hosting |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TRANSPORTS                                      │
│  ┌─────────────────────┐              ┌─────────────────────┐               │
│  │     MCP Server      │              │    REST Server      │               │
│  │   (stdio/SSE)       │              │    (Fastify)        │               │
│  └──────────┬──────────┘              └──────────┬──────────┘               │
└─────────────┼────────────────────────────────────┼──────────────────────────┘
              │                                    │
              ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HANDLERS                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Tool Dispatcher  ─────► Handler Factory (createCrudHandlers)       │    │
│  │                   ─────► Context-Aware Handlers                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION CORE                                │
│                                                                             │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐               │
│  │   Container   │───►│    Runtime    │───►│  AppContext   │               │
│  │   (Process)   │    │   (Shared)    │    │  (Per-Server) │               │
│  └───────────────┘    └───────────────┘    └───────────────┘               │
│                              │                     │                        │
│                              ▼                     ▼                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         SERVICES                                     │   │
│  │  ┌──────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐     │   │
│  │  │Permission│  │Verification│  │ Embedding  │  │  Extraction  │     │   │
│  │  │ Service  │  │  Service   │  │  Service   │  │   Service    │     │   │
│  │  └──────────┘  └────────────┘  └────────────┘  └──────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      QUERY PIPELINE                                  │   │
│  │  resolve → fetch → fts → filter → tags → relations → score → format │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PERSISTENCE                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        REPOSITORIES                                  │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │    │
│  │  │Guidelines│ │Knowledge │ │  Tools   │ │  Scopes  │ │   Tags   │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌────────────────────────────┐       ┌────────────────────────────┐       │
│  │   SQLite (better-sqlite3)  │       │   LanceDB (Vector Store)   │       │
│  │   + Drizzle ORM            │       │   (Optional)               │       │
│  └────────────────────────────┘       └────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Abstractions

### 3.1 Container → Runtime → AppContext Hierarchy

This is the **canonical dependency hierarchy**. All code must follow this pattern.

```typescript
// Container: Process-level singleton (one per process)
// - Holds Runtime reference
// - Holds AppContext reference (for backward compatibility)
// - Provides reset() for test cleanup
class Container {
  private runtime: Runtime | null;
  private context: AppContext | null;
}

// Runtime: Shared resources across servers (one per process)
// - Memory coordinator (cache pressure management)
// - Rate limiters (per-agent, global, burst)
// - Embedding pipeline reference
// - Query cache
// - Stats cache
interface Runtime {
  memoryCoordinator: MemoryCoordinator;
  rateLimiters: RateLimiters;
  embeddingPipeline: EmbeddingPipeline | null;
  statsCache: StatsCache;
  queryCache: QueryCache;
}

// AppContext: Per-server dependencies (one per MCP/REST server)
// - Database connections (db) and `storageAdapter`
// - Optional `sqlite` handle (standalone mode only)
// - All repositories
// - All services
// - Query pipeline dependencies
// - Security service
// - Config
interface AppContext {
  config: Config;
  db: AppDb;
  storageAdapter: IStorageAdapter;
  logger: Logger;
  queryDeps: PipelineDependencies;
  security: SecurityService;
  runtime: Runtime;
  services: AppContextServices;
  repos: Repositories;
  sqlite?: Database.Database; // present only in standalone mode
}

All database interactions should go through `storageAdapter` (or the optional `sqlite` handle when running in standalone mode). This keeps the API consistent whether the underlying store is SQLite, PostgreSQL, or a future adapter.
```

**Key Rules:**
1. **Runtime** is created once at process startup via `createRuntime()`
2. **Runtime** is registered with Container via `registerRuntime()`
3. **AppContext** is created via `createAppContext(config, runtime?)`
4. **Handlers** receive `AppContext` as first argument
5. **AppContext** should usually be instantiated once per transport, but when MCP and REST run together ADR-008 requires them to share that instance.
6. **Never** import database/services directly; always go through `AppContext`

### 3.2 Factory Functions

All complex object creation goes through factory functions in `src/core/factory/`:

```
src/core/
├── factory.ts              # Main: createAppContext()
├── factory/
│   ├── repositories.ts     # createRepositories(dbDeps)
│   ├── services.ts         # createServices(config, runtime, db)
│   └── query-pipeline.ts   # createQueryPipeline(config, runtime)
├── runtime.ts              # createRuntime(config)
├── container.ts            # Container class + convenience exports
├── context.ts              # Type definitions (AppContext, services interfaces)
├── errors.ts               # Error classes and factory functions
└── types.ts                # Shared types (AppDb, DatabaseDeps)
```

**Pattern for new factories:**

```typescript
// src/core/factory/new-subsystem.ts
export function createNewSubsystem(deps: SubsystemDeps): NewSubsystem {
  // Explicit dependency injection
  const { db, config, logger } = deps;

  // Create and return fully initialized subsystem
  return {
    // ...
  };
}
```

### 3.3 Repository Pattern

All data access goes through repositories. Repositories are the **only** code that touches the database directly.

**Location:** `src/db/repositories/`

**Interface Pattern:**
```typescript
// src/core/interfaces/repositories.ts
export interface IGuidelineRepository {
  create(input: CreateGuidelineInput): Promise<GuidelineWithVersion>;
  getById(id: string): Promise<GuidelineWithVersion | undefined>;
  getByName(name: string, scopeType: ScopeType, scopeId?: string, inherit?: boolean): Promise<GuidelineWithVersion | undefined>;
  list(filter?: ListGuidelinesFilter, options?: PaginationOptions): Promise<GuidelineWithVersion[]>;
  update(id: string, input: UpdateGuidelineInput): Promise<GuidelineWithVersion | undefined>;
  getHistory(guidelineId: string): Promise<GuidelineVersion[]>;
  deactivate(id: string): Promise<boolean>;
  reactivate(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
```

**Implementation Pattern:**
```typescript
// src/db/repositories/guidelines.ts
export function createGuidelineRepository(deps: DatabaseDeps): IGuidelineRepository {
  const { db, sqlite } = deps;

  return {
    create(input) {
      // Implementation using db (Drizzle) or sqlite (better-sqlite3)
    },
    // ... other methods
  };
}
```

**Key Rules:**
1. Repositories are created via factory functions with injected dependencies
2. Repositories return domain objects, not database rows
3. Complex queries use Drizzle; bulk/FTS operations use raw SQLite
4. All mutations use `transactionWithDb()` for atomicity

### 3.4 Handler Pattern

All MCP/REST handlers follow the **context-aware handler** pattern:

```typescript
// Handler signature
type ContextAwareHandler = (
  context: AppContext,
  params: Record<string, unknown>
) => unknown;

// Example handler
export function handleGuidelineAdd(context: AppContext, params: Record<string, unknown>) {
  // 1. Extract and validate params
  const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
  const agentId = getRequiredParam(params, 'agentId', isString);

  // 2. Check permissions
  context.services.permission.check(agentId, 'write', 'guideline', null, scopeType, scopeId);

  // 3. Business logic using context.repos
  const entry = context.repos.guidelines.create({ ... });

  // 4. Return formatted response
  return formatTimestamps({ success: true, guideline: entry });
}
```

**Handler Factory for CRUD:**
```typescript
// src/mcp/handlers/factory.ts
const handlers = createCrudHandlers<GuidelineWithVersion, CreateInput, UpdateInput>({
  entryType: 'guideline',
  getRepo: (ctx) => ctx.repos.guidelines,
  responseKey: 'guideline',
  responseListKey: 'guidelines',
  nameField: 'name',
  extractAddParams: (params, defaults) => ({ ... }),
  extractUpdateParams: (params) => ({ ... }),
  // ...
});
```

---

## 4. Error Handling Strategy

### 4.1 Error Hierarchy

All errors inherit from `AgentMemoryError`:

```typescript
// src/core/errors.ts
class AgentMemoryError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) { ... }
}
```

**Error Codes:**
| Range | Category |
|-------|----------|
| E1000-E1999 | Validation errors |
| E2000-E2999 | Resource errors (not found, conflict) |
| E3000-E3999 | Lock errors |
| E4000-E4999 | Database errors |
| E5000-E5999 | System errors |
| E6000-E6999 | Permission errors |
| E7000-E7999 | Extraction errors |
| E8000-E8999 | Embedding errors |
| E9000-E9999 | Vector errors |

### 4.2 Error Factory Functions

Always use factory functions to create errors:

```typescript
// Good
throw createValidationError('scopeId', 'is required for project scope', 'Provide projectId');
throw createNotFoundError('guideline', id);
throw createPermissionError('write', 'guideline', id);

// Bad - don't throw generic errors
throw new Error('Guideline not found');
```

### 4.3 Error Handling in Handlers

```typescript
// Handlers throw; tool-runner catches and formats
try {
  const result = handler(context, params);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
} catch (error) {
  return formatError(error); // MCP-formatted error response
}
```

---

## 5. Service Architecture

### 5.1 Service Registration

Services are created in `createServices()` and attached to `AppContext.services`:

```typescript
interface AppContextServices {
  embedding: IEmbeddingService;
  vector: IVectorService;
  extraction: IExtractionService;
  permission: PermissionService;
  verification: VerificationService;
}
```

### 5.2 Service Interfaces

Each service has an interface in `src/core/context.ts`:

```typescript
export interface IEmbeddingService {
  isAvailable(): boolean;
  getProvider(): 'openai' | 'local' | 'disabled';
  embed(text: string): Promise<{ embedding: number[]; model: string; provider: string }>;
  embedBatch(texts: string[]): Promise<{ embeddings: number[][]; model: string; provider: string }>;
  clearCache(): void;
  cleanup(): void;
}
```

### 5.3 Service Usage in Handlers

```typescript
// Always access services through context
const hasPermission = context.services.permission.check(agentId, 'write', ...);

// If service might be undefined (optional services)
if (context.services?.embedding?.isAvailable()) {
  const result = await context.services.embedding.embed(text);
}
```

---

## 6. Query Pipeline Architecture

### 6.1 Pipeline Stages

The query pipeline processes requests through 8 discrete stages:

```
┌─────────┐  ┌───────┐  ┌─────┐  ┌────────┐  ┌──────┐  ┌───────────┐  ┌───────┐  ┌────────┐
│ resolve │──│ fetch │──│ fts │──│ filter │──│ tags │──│ relations │──│ score │──│ format │
└─────────┘  └───────┘  └─────┘  └────────┘  └──────┘  └───────────┘  └───────┘  └────────┘
```

1. **resolve** - Resolve scope chain with inheritance
2. **fetch** - Load entries from database
3. **fts** - Apply full-text search filtering
4. **filter** - Apply additional filters (date, priority, etc.)
5. **tags** - Batch load tags for entries
6. **relations** - Load related entries if requested
7. **score** - Calculate relevance/recency scores
8. **format** - Format for response

### 6.2 Pipeline Dependencies

```typescript
interface PipelineDependencies {
  getDb: () => DbInstance;
  getPreparedStatement: (sql: string) => Database.Statement;
  executeFts5Search: (...) => Record<QueryEntryType, Set<string>>;
  getTagsForEntries: (...) => Record<string, Tag[]>;
  traverseRelationGraph: (...) => Record<QueryEntryType, Set<string>>;
  resolveScopeChain: (...) => ScopeDescriptor[];
  cache?: QueryCacheOps;
}
```

### 6.3 Caching Strategy

- Query cache is LRU-based, owned by Runtime
- Cache keys are deterministic hashes of query params
- Invalidation via event bus on entry changes
- Memory pressure managed by MemoryCoordinator

---

## 7. Database Strategy

### 7.1 SQLite Configuration

```typescript
// WAL mode for concurrent reads
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('cache_size = -64000'); // 64MB cache
```

### 7.2 Transaction Pattern

```typescript
// All mutations use this adapter-based wrapper
export async function transactionWith<T>(
  adapter: IStorageAdapter,
  fn: (tx: ITransaction) => Promise<T>
): Promise<T> {
  return adapter.transaction(fn);
}

// Usage (works for both SQLite and PostgreSQL)
const result = await transactionWith(context.storageAdapter, async (tx) => {
  const entry = await repo.create(input);
  await tagsRepo.attach({ entryType: 'guideline', entryId: entry.id, tagName: 'important' });
  return entry;
});
```

**Adapter implementations:**

```typescript
// SQLite adapter (wraps sync transaction)
class SQLiteStorageAdapter implements IStorageAdapter {
  async transaction<T>(fn: (tx: ITransaction) => Promise<T>): Promise<T> {
    return this.sqlite.transaction(async () => {
      const tx = new SQLiteTransaction(this.sqlite);
      return fn(tx);
    })();
  }
}

// PostgreSQL adapter (native async transaction)
class PostgresStorageAdapter implements IStorageAdapter {
  async transaction<T>(fn: (tx: ITransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new PostgresTransaction(client);
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

### 7.3 Prepared Statement Caching

```typescript
// Statements are cached by SQL string
const stmt = getPreparedStatement('SELECT * FROM guidelines WHERE id = ?');
const result = stmt.get(id);
```

---

## 8. Testing Strategy

### 8.1 Test Isolation

```typescript
// Each test file creates isolated Container
const container = new Container();
let context: AppContext;

beforeEach(async () => {
  container.reset();
  const runtime = createRuntime(testConfig);
  container.registerRuntime(runtime);
  context = await createAppContext(testConfig, runtime);
  container.registerContext(context);
});

afterEach(() => {
  container.reset();
});
```

### 8.2 Repository Testing

```typescript
// Direct repository testing with real SQLite
const deps = createTestDatabaseDeps(); // In-memory SQLite
const repo = createGuidelineRepository(deps);

const entry = repo.create({ name: 'test', content: 'content', scopeType: 'global' });
expect(entry.id).toBeDefined();
```

### 8.3 Handler Testing

```typescript
// Context-aware handler testing
const mockContext = createMockAppContext();
const result = handleGuidelineAdd(mockContext, {
  scopeType: 'global',
  name: 'test',
  content: 'test content',
  agentId: 'test-agent',
});
expect(result.success).toBe(true);
```

---

## 9. Migration Plan: Remaining Work

### 9.1 HIGH Priority (Next Sprint)

| Task | Location | Status | Details |
|------|----------|--------|---------|
| **Transaction retry logic** | `src/db/connection.ts` | ✅ DONE | Added `transactionWithRetry()` with configurable `AGENT_MEMORY_TX_RETRIES` and `AGENT_MEMORY_TX_DELAY_MS`. Exponential backoff on SQLITE_BUSY/SQLITE_LOCKED. |
| **Embedding retry queue** | `src/db/repositories/embedding-hooks.ts` | ✅ DONE | In-memory bounded queue with concurrency control. Retry with exponential backoff. Stats exposed in health endpoint. Reindex CLI command added. |
| **Shared AppContext for REST** | `src/restapi/server.ts` | ✅ DONE | Refactored `createServer()` to require `AppContext`. Removed fallback context creation. |
| **Remove legacy permission exports** | `src/services/permission.service.ts` | ✅ DONE | Deleted deprecated function wrappers (~547 lines). All callers now use `PermissionService` class via context. |

**Sprint Deliverables (All Complete):**
```typescript
// 1. New config options
interface Config {
  transaction: {
    maxRetries: number;    // AGENT_MEMORY_TX_RETRIES, default 3
    baseDelayMs: number;   // AGENT_MEMORY_TX_DELAY_MS, default 10
  };
  embedding: {
    maxConcurrency: number; // AGENT_MEMORY_EMBEDDING_MAX_CONCURRENCY, default 4
    maxRetries: number;     // AGENT_MEMORY_EMBEDDING_MAX_RETRIES, default 3
    retryDelayMs: number;   // AGENT_MEMORY_EMBEDDING_RETRY_DELAY_MS, default 1000
  };
}

// 2. REST server signature change
export async function createServer(context: AppContext): Promise<FastifyInstance>

// 3. Health endpoint addition
{
  "status": "ok",
  "embeddingQueue": {
    "pending": 5,
    "inFlight": 2,
    "processed": 1234,
    "failed": 0,
    "skippedStale": 3,
    "retried": 1,
    "failedPendingRetry": 0,
    "maxConcurrency": 4
  }
}

// 4. Reindex CLI command
agent-memory reindex [--type <type>] [--batch-size <n>] [--delay <ms>] [--force] [--retry-failed] [--stats]
```

### 9.2 MEDIUM Priority (Next Quarter)

| Task | Location | Details |
|------|----------|---------|
| **Eliminate `getDb()` calls** | Various | ✅ DONE - All service functions now accept explicit `db: DbClient` parameter. Handlers pass `context.db`. No implicit `getDb()` fallbacks remain outside connection module. |
| **Batch tag loading** | `src/services/query/stages/tags.ts` | ✅ DONE - Already implemented with batched queries (2-3 queries, not N+1). |
| **Reindex CLI command** | `src/cli.ts`, `src/commands/reindex.ts` | ✅ DONE - Added `agent-memory reindex` with `--type`, `--batch-size`, `--delay`, `--force`, `--retry-failed`, `--stats` options. |
| **Backup scheduler** | `src/services/backup-scheduler.service.ts` | ✅ DONE - `node-cron` scheduler with `AGENT_MEMORY_BACKUP_SCHEDULE`, `AGENT_MEMORY_BACKUP_RETENTION`, `AGENT_MEMORY_BACKUP_ENABLED` env vars. Status exposed in health endpoint. |
| **Cursor pagination** | `src/mcp/handlers/factory.ts`, `src/db/repositories/base.ts` | ✅ DONE - `encodeCursor`/`decodeCursor` helpers, `normalizePagination` handles cursor, list responses include `hasMore`, `truncated`, `nextCursor`. |

### 9.3 MEDIUM-HIGH Priority (Phase 1 - Abstraction Layer)

These tasks prepare the codebase for PostgreSQL without breaking SQLite. **Must complete before Phase 2.**

| Task | Location | Status | Details |
|------|----------|--------|---------|
| **Define adapter interfaces** | `src/core/interfaces/adapters.ts` | TODO | `IStorageAdapter`, `ICacheAdapter`, `ILockAdapter`, `IEventAdapter` |
| **Implement SQLiteStorageAdapter** | `src/db/adapters/sqlite.adapter.ts` | TODO | Wrap current SQLite logic behind interface |
| **Implement MemoryCacheAdapter** | `src/cache/adapters/memory.adapter.ts` | TODO | Wrap LRUCache behind `ICacheAdapter` |
| **Implement LocalLockAdapter** | `src/locks/adapters/local.adapter.ts` | TODO | Wrap FileLockRepository behind `ILockAdapter` |
| **Implement LocalEventAdapter** | `src/events/adapters/local.adapter.ts` | TODO | Wrap EventEmitter behind `IEventAdapter` |
| **Make repos async** | `src/db/repositories/*.ts` | ✅ DONE | All repository methods now return `Promise<T>`. All handlers/services updated to use `await`. |
| **Wire adapters in factory** | `src/core/factory/adapters.ts` | TODO | Factory selects adapter based on config |

### 9.4 Phase 2 - PostgreSQL Support (Q2)

| Task | Location | Details |
|------|----------|---------|
| **PostgresStorageAdapter** | `src/db/adapters/postgres.adapter.ts` | Connection pool, async queries |
| **Drizzle PostgreSQL dialect** | `src/db/schema-pg.ts` | PostgreSQL-specific schema (tsvector, etc.) |
| **FTS migration** | `src/services/fts-pg.service.ts` | `tsvector` implementation replacing FTS5 |
| **PostgreSQL migrations** | `src/db/migrations-pg/` | Separate migration folder for PG |
| **Integration tests** | `tests/integration-pg/` | Test suite running against real PostgreSQL |

### 9.5 Phase 3 - Distributed Infrastructure (Q3)

| Task | Location | Details |
|------|----------|---------|
| **RedisCacheAdapter** | `src/cache/adapters/redis.adapter.ts` | ioredis-based caching |
| **RedisLockAdapter** | `src/locks/adapters/redis.adapter.ts` | Redlock algorithm implementation |
| **RedisEventAdapter** | `src/events/adapters/redis.adapter.ts` | Redis pub/sub for cross-instance events |
| **Horizontal scaling tests** | `tests/scaling/` | Multi-instance coordination tests |

### 9.6 LOW Priority (Future/Optional)

| Task | Rationale |
|------|-----------|
| **Worker threads for queries** | If main thread blocking becomes an issue. Move `executeQueryPipeline` to worker. |
| **Circuit breaker for LLM calls** | Prevent cascading failures when OpenAI/Anthropic APIs are down. |
| **Multi-region support** | PostgreSQL read replicas with geo-routing. |

### 9.7 Tech Debt Tracking

```
┌─────────────────────────────────────────────────────────────────────┐
│ Category                │ Current │ Target │ Effort │ Impact       │
├─────────────────────────┼─────────┼────────┼────────┼──────────────┤
│ Global accessor calls   │ ~86     │ 0      │ HIGH   │ Testability  │
│ Legacy permission funcs │ 0 ✅    │ 0      │ -      │ Maintenance  │
│ Fire-and-forget embeds  │ NO ✅   │ NO     │ -      │ Data quality │
│ REST context drift      │ NO ✅   │ NO     │ -      │ Consistency  │
│ N+1 tag queries         │ YES     │ NO     │ LOW    │ Performance  │
│ Sync repository methods │ NO ✅   │ NO     │ -      │ PG readiness │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Architecture Decision Records (ADRs)

### ADR-001: SQLite as Primary Database

**Status:** Accepted

**Context:** Need a persistent storage solution for AI agent memory with high read performance and zero-config deployment.

**Decision:** Use SQLite with better-sqlite3 (synchronous) + Drizzle ORM.

**Rationale:**
- Zero configuration (embedded database)
- Excellent read performance (single-digit ms queries)
- WAL mode enables concurrent reads
- Simple deployment (single file)

**Consequences:**
- Single-writer limitation (acceptable for use case)
- No horizontal scaling without migration
- Must implement transaction retry for SQLITE_BUSY

### ADR-002: Container/Runtime/AppContext Hierarchy

**Status:** Accepted

**Context:** Need clear dependency management supporting both MCP and REST transports sharing state.

**Decision:** Three-tier hierarchy:
- Container (process singleton)
- Runtime (shared resources)
- AppContext (per-server dependencies)

**Rationale:**
- Explicit dependency flow
- Testable (create isolated containers)
- Supports both MCP and REST sharing Runtime

### ADR-003: Handler Factory Pattern

**Status:** Accepted

**Context:** 40%+ code duplication across CRUD handlers for different entry types.

**Decision:** Implement `createCrudHandlers()` factory generating standardized handlers.

**Rationale:**
- Eliminates duplication
- Ensures consistent behavior (permissions, audit, validation)
- Single place to add cross-cutting concerns

### ADR-004: Event-Driven Cache Invalidation

**Status:** Accepted

**Context:** Need to invalidate query cache when entries change.

**Decision:** Central event bus emits `entry:changed` events; cache subscribes.

**Rationale:**
- Decoupled (repositories don't know about cache)
- Reliable (all entry changes emit events)
- Testable (mock event bus in tests)

### ADR-005: LanceDB for Vector Storage

**Status:** Accepted

**Context:** Need vector storage for semantic search embeddings.

**Decision:** Use LanceDB as optional vector store alongside SQLite.

**Rationale:**
- High-performance vector operations
- Embedded (no external service)
- Optional (system works without it)

**Consequences:**
- Additional storage layer to manage
- Need cleanup job for orphaned embeddings

### ADR-006: In-Memory Embedding Retry Queue

**Status:** Implemented (2025-12-23)

**Context:** Fire-and-forget embedding generation can silently fail, leaving entries without embeddings.

**Decision:** Implement in-memory bounded queue with retry logic. NOT persisted to SQLite.

**Rationale:**
- Simpler implementation
- Lower complexity than persistent queue
- Embeddings can be regenerated manually if needed
- Re-embedding CLI command provides recovery path

**Consequences:**
- Failed embeddings lost on restart
- CLI command `agent-memory reindex` provides manual recovery
- Queue uses concurrency control to prevent overwhelming the embedding service

**Implementation (Actual):**
```typescript
// Location: src/db/repositories/embedding-hooks.ts

// Queue stats
interface EmbeddingQueueStats {
  pending: number;           // Jobs waiting in queue
  inFlight: number;          // Currently processing
  processed: number;         // Successfully completed
  failed: number;            // Exhausted all retries
  skippedStale: number;      // Skipped (newer version queued)
  retried: number;           // Succeeded after retry
  failedPendingRetry: number; // Waiting for retry
  maxConcurrency: number;    // Concurrent job limit
}

// Config options
AGENT_MEMORY_EMBEDDING_MAX_CONCURRENCY=4  // Default: 4
AGENT_MEMORY_EMBEDDING_MAX_RETRIES=3      // Default: 3
AGENT_MEMORY_EMBEDDING_RETRY_DELAY_MS=1000 // Default: 1000 (exponential backoff)

// CLI command
agent-memory reindex [--type <type>] [--batch-size <n>] [--delay <ms>] [--force] [--retry-failed] [--stats]
```

### ADR-007: Configurable Transaction Retry

**Status:** Accepted

**Context:** Database transactions can fail under contention (SQLITE_BUSY for SQLite, deadlocks for PostgreSQL).

**Decision:** Implement retry logic with exponential backoff at the adapter level, configurable via environment variables.

**Configuration:**
```bash
AGENT_MEMORY_TX_RETRIES=3        # Max retry attempts (default: 3)
AGENT_MEMORY_TX_DELAY_MS=10      # Base delay in ms (default: 10)
```

**Implementation:**
```typescript
// Retry logic lives in IStorageAdapter.transaction()
async function transactionWithRetry<T>(
  adapter: IStorageAdapter,
  fn: (tx: ITransaction) => Promise<T>,
  maxRetries = config.txRetries,
  baseDelayMs = config.txDelayMs
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await adapter.transaction(fn);
    } catch (error) {
      if (isRetryableError(error) && attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Transaction failed after max retries');
}

// Database-specific retry detection
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // SQLite
    if ('code' in error && error.code === 'SQLITE_BUSY') return true;
    // PostgreSQL
    if (error.message.includes('deadlock detected')) return true;
    if (error.message.includes('could not serialize')) return true;
  }
  return false;
}
```

### ADR-008: Shared AppContext for MCP and REST

**Status:** Accepted

**Context:** REST server currently has some dependency drift from MCP, creating different repo/service instances.

**Decision:** Both MCP and REST servers share a single AppContext instance.

**Implementation:**
```typescript
// In server startup (cli.ts or main entry)
const runtime = createRuntime(extractRuntimeConfig(config));
registerRuntime(runtime);

const context = await createAppContext(config, runtime);
registerContext(context);

// Both transports receive the same context
const mcpServer = await createMcpServer(context);
const restServer = await createRestServer(context);
```

**Rationale:**
- Single source of truth for all dependencies
- No configuration drift between transports
- Consistent behavior across MCP and REST
- Shared caching benefits both transports

**Migration Steps:**
1. Refactor `src/restapi/server.ts` to accept `AppContext`
2. Remove inline repository/service creation in REST routes
3. Update controllers to use `context.repos.*` and `context.services.*`

### ADR-009: Dual-Mode Architecture (Standalone/Enterprise)

**Status:** Accepted

**Context:** System needs to support both zero-config standalone deployment (SQLite) and enterprise-scale deployment (PostgreSQL + Redis) from the same codebase.

**Decision:** Implement adapter-based architecture with four abstraction layers:
- `IStorageAdapter` - Database operations
- `ICacheAdapter` - Caching (memory or Redis)
- `ILockAdapter` - Distributed locking
- `IEventAdapter` - Pub/sub events

**Implementation Phases:**
1. Phase 1: Define interfaces + implement SQLite/local adapters (wrap existing code)
2. Phase 2: Implement PostgreSQL adapter + migrations
3. Phase 3: Implement Redis adapters for distributed deployment

**Key Decisions:**
- All repository methods return `Promise<T>` (async-first, even for SQLite)
- Drizzle ORM handles dialect differences where possible
- FTS requires separate implementations (FTS5 vs tsvector)
- Configuration via environment variables determines adapter selection

**Rationale:**
- Same codebase for all deployment scenarios
- Zero breaking changes for existing users
- Enterprise users can scale horizontally
- Clean separation of concerns

**Trade-offs:**
- Async-everywhere adds slight overhead for SQLite
- Two FTS implementations to maintain
- More complex testing (need both DB adapters covered)
- Abstraction layer adds indirection

### ADR-010: Async-First Repository Interfaces

**Status:** Accepted

**Context:** SQLite (better-sqlite3) is synchronous, PostgreSQL is async. Need consistent interface.

**Decision:** All repository interface methods return `Promise<T>`, even for synchronous SQLite operations.

**Implementation:**
```typescript
// Interface (always async)
interface IGuidelineRepository {
  getById(id: string): Promise<GuidelineWithVersion | undefined>;
}

// SQLite implementation (wrap sync in Promise)
function createGuidelineRepository(deps: DatabaseDeps): IGuidelineRepository {
  return {
    async getById(id: string) {
      // Sync SQLite call, but async signature
      return db.select().from(guidelines).where(eq(guidelines.id, id)).get();
    }
  };
}

// PostgreSQL implementation (naturally async)
function createGuidelineRepository(deps: DatabaseDeps): IGuidelineRepository {
  return {
    async getById(id: string) {
      const [result] = await db.select().from(guidelines).where(eq(guidelines.id, id));
      return result;
    }
  };
}
```

**Rationale:**
- Consistent interface regardless of backend
- No breaking changes when switching databases
- Handlers don't need to know which database is in use

**Trade-offs:**
- Minor overhead for SQLite (Promise wrapper)
- All callers must use `await` even for SQLite
- Slightly more complex stack traces

---

## 11. Code Style & Conventions

### 11.1 Import Order

```typescript
// 1. Node built-ins
import { existsSync } from 'node:fs';

// 2. External packages
import { eq } from 'drizzle-orm';

// 3. Internal - types first
import type { AppContext } from '../core/context.js';
import type { Guideline } from '../db/schema.js';

// 4. Internal - implementations
import { createValidationError } from '../core/errors.js';
import { createComponentLogger } from '../utils/logger.js';
```

### 11.2 Function Signatures

```typescript
// Good - explicit types, destructured params
export function createGuideline(
  deps: DatabaseDeps,
  input: CreateGuidelineInput
): GuidelineWithVersion {
  const { db, sqlite } = deps;
  // ...
}

// Bad - any types, loose params
export function createGuideline(deps: any, input: any) {
  // ...
}
```

### 11.3 Error Handling

```typescript
// Good - use factory functions
throw createNotFoundError('guideline', id);

// Bad - generic errors
throw new Error(`Guideline ${id} not found`);
```

### 11.4 Logging

```typescript
// Create logger per component
const logger = createComponentLogger('guidelines');

// Log with context object first
logger.info({ guidelineId: id, scopeType }, 'Guideline created');
logger.error({ error, guidelineId: id }, 'Failed to create guideline');
```

---

## 12. Checklist for New Features

Before implementing a new feature, verify:

- [ ] Does it fit the Container/Runtime/AppContext hierarchy?
- [ ] Are dependencies injected (not imported directly)?
- [ ] Is there a repository interface if it touches the database?
- [ ] Does the handler follow the context-aware pattern?
- [ ] Are errors thrown using factory functions?
- [ ] Is there a corresponding test file?
- [ ] Does it emit events for cache invalidation (if relevant)?
- [ ] Is audit logging in place for mutations?
- [ ] Are permissions checked?

---

## 13. Glossary

| Term | Definition |
|------|------------|
| **AppContext** | Per-server container holding all dependencies |
| **Container** | Process-level singleton managing Runtime and AppContext |
| **Runtime** | Shared resources (rate limiters, caches, memory coordinator) |
| **Repository** | Data access layer for a specific entity type |
| **Handler** | Function processing MCP/REST requests |
| **Pipeline** | Stage-based query processor |
| **Scope** | Hierarchy level (global → org → project → session) |

---

## Appendix A: File Structure

```
src/
├── cli.ts                    # CLI entry point
├── config/                   # Configuration
│   └── index.ts
├── core/                     # Core abstractions
│   ├── container.ts          # DI container
│   ├── context.ts            # AppContext types
│   ├── errors.ts             # Error classes
│   ├── factory.ts            # Main factory
│   ├── factory/              # Sub-factories
│   │   ├── repositories.ts
│   │   ├── services.ts
│   │   └── query-pipeline.ts
│   ├── interfaces/           # Interfaces
│   │   └── repositories.ts
│   ├── memory-coordinator.ts # Memory pressure management
│   ├── runtime.ts            # Runtime definition
│   └── types.ts              # Shared types
├── db/                       # Database layer
│   ├── connection.ts         # Connection management
│   ├── factory.ts            # DB connection factory
│   ├── migrations/           # SQL migrations
│   ├── repositories/         # Repository implementations
│   └── schema/               # Drizzle schema
├── mcp/                      # MCP transport
│   ├── descriptors/          # Tool definitions
│   ├── handlers/             # Request handlers
│   ├── server.ts             # MCP server setup
│   └── tool-runner.ts        # Tool dispatch
├── restapi/                  # REST transport
│   ├── controllers/          # Route handlers
│   └── server.ts             # Fastify server
├── services/                 # Business logic
│   ├── query/                # Query pipeline
│   │   ├── pipeline.ts       # Pipeline orchestration
│   │   └── stages/           # Pipeline stages
│   ├── embedding.service.ts
│   ├── extraction.service.ts
│   ├── permission.service.ts
│   └── ...
└── utils/                    # Utilities
    ├── events.ts             # Event bus
    ├── logger.ts             # Logging
    ├── lru-cache.ts          # LRU cache
    └── type-guards.ts        # Runtime type checking
```

---

**Document Maintainers:** Architecture Team
**Review Cycle:** Quarterly or on major changes
