# ADR-0020: Hybrid Dependency Injection Container

## Status

Accepted

## Context

Agent Memory needs to manage dependencies at two different scopes:

1. **Process-scoped (singletons)**: Database connections, caches, event buses, circuit breakers - resources that are expensive to create and should be shared across all requests.

2. **Request-scoped**: Service instances, repositories, transaction boundaries - resources that should be isolated per request for safety and testability.

Pure singleton patterns make testing difficult (shared state between tests). Pure request-scoped DI is wasteful for shared resources. We needed a hybrid approach.

Additional requirements:
- Avoid module-level singletons (import-time side effects)
- Support test isolation (each test gets fresh state)
- Enable lazy initialization (don't create resources until needed)
- Provide explicit lifecycle management (startup/shutdown)

## Decision

Use a hybrid approach combining a process-scoped singleton container (for shared resources) and request-scoped AppContext (for request isolation).

### Container (Process Scope)

```typescript
// src/core/container.ts
class Container {
  private static instance: Container | null = null;
  private initialized = false;

  // Shared resources (lazy-initialized)
  private _db: Database | null = null;
  private _cache: ICacheAdapter | null = null;
  private _eventBus: IEventAdapter | null = null;
  private _rateLimiter: IRateLimiterAdapter | null = null;

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  // For testing: reset singleton
  static resetInstance(): void {
    if (Container.instance) {
      Container.instance.shutdown();
      Container.instance = null;
    }
  }

  async initialize(config: Config): Promise<void> {
    if (this.initialized) return;

    this._db = await createDatabase(config.database);
    this._cache = createCacheAdapter(config.cache);
    this._eventBus = createEventAdapter(config.events);
    // ... other shared resources

    this.initialized = true;
  }

  get db(): Database {
    if (!this._db) throw new Error('Container not initialized');
    return this._db;
  }

  // ... other getters
}
```

### AppContext (Request Scope)

```typescript
// src/core/context.ts
interface AppContext {
  // Request metadata
  requestId: string;
  agentId: string;
  timestamp: Date;

  // Request-scoped services (created per-request)
  services: {
    guideline: GuidelineService;
    knowledge: KnowledgeService;
    tool: ToolService;
    query: QueryService;
  };

  // Transaction boundary
  transaction?: TransactionScope;
}

function createAppContext(container: Container, request: Request): AppContext {
  const requestId = generateRequestId();

  return {
    requestId,
    agentId: request.agentId,
    timestamp: new Date(),
    services: {
      // Services get shared resources from container
      guideline: new GuidelineService(container.db, container.cache),
      knowledge: new KnowledgeService(container.db, container.cache),
      tool: new ToolService(container.db, container.cache),
      query: new QueryService(container.db, container.cache, container.eventBus),
    },
  };
}
```

### Lifecycle Management

```
Application Start:
  Container.getInstance().initialize(config)
    → Creates DB connection
    → Creates caches
    → Creates event bus
    → Runs migrations

Request Handling:
  createAppContext(container, request)
    → Creates request-scoped services
    → Services use shared container resources
    → Context disposed after request

Application Shutdown:
  Container.getInstance().shutdown()
    → Closes DB connections
    → Flushes caches
    → Unsubscribes events

Testing:
  beforeEach: Container.resetInstance()
    → Fresh container per test
    → No shared state pollution
```

### Dependency Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Container (Singleton)                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │   DB    │  │  Cache  │  │ Events  │  │  Rate   │    │
│  │ (shared)│  │ (shared)│  │ (shared)│  │ Limiter │    │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │
└───────┼────────────┼────────────┼────────────┼──────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────┐
│                 AppContext (Per-Request)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Guideline  │  │  Knowledge  │  │    Query    │      │
│  │   Service   │  │   Service   │  │   Service   │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## Consequences

**Positive:**
- Shared resources are created once, reused efficiently
- Request isolation prevents cross-request contamination
- Test isolation via `Container.resetInstance()`
- Explicit initialization order (no import-time surprises)
- Clear lifecycle management (startup/shutdown)
- Services don't need to know about singleton patterns

**Negative:**
- Two-level abstraction adds complexity
- Must remember to call `resetInstance()` in tests
- Container initialization is async (must await before handling requests)
- Services must be created with container resources (slight coupling)

## References

- Code locations:
  - `src/core/container.ts` - Container implementation
  - `src/core/context.ts` - AppContext interface and factory
  - `src/db/connection.ts` - Database connection helpers
  - `tests/fixtures/test-helpers.ts` - Test utilities using resetInstance
- Related ADRs: ADR-0008 (AppContext Requirement)
- Principles: S1 (Tests Prove Behavior), S6 (Single Responsibility Services)
