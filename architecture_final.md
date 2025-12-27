# Agent Memory: Final Architecture Specification

**Version:** 1.5  
**Status:** Canonical Reference (High-Level)  
**Last Updated:** 2025-12-26 (Merged architecture guidelines into this canonical doc)

---

## 1. Executive Summary

Agent Memory is a dual-mode memory service that runs as an MCP host and optional REST API. Its architecture balances **planning-time clarity** with **run-time performance** by:

- **Centralizing state** in the Container → Runtime → AppContext hierarchy so all resources, caches, and adapters share a known lifecycle.
- **Abstracting persistence** via adapters, enabling SQLite for the standalone experience and PostgreSQL/Redis for enterprise without branching business logic.
- **Enforcing observable, testable boundaries** through services, handlers, and factories so tooling (rate limits, permissions, extraction, embedding) can be composed deterministically.
- **Prioritizing speed** via in-process caches, query pipeline stages, and controlled rate limiting; security and config churn stay isolated in their own services.

This document outlines the high-level layers, their responsibilities, and the recent architectural improvements that keep the platform maintainable.

---

## 2. Architecture Overview

```
                    ┌───────────────────────────────┐
                    │         MCP / REST            │
                    │ (CLI + Fastify transports)     │
                    └──────────────┬────────────────┘
                                   │
               ┌───────────────────▼───────────────────┐
               │          Transport Handlers           │
               │  (tool dispatcher, fastify controllers)│
               └──────────────┬───────────────┬────────┘
                              ▼               ▼
             ┌────────────────────────┐  ┌──────────────┐
             │ Application Core (AppContext) │ Runtime   │
             └──────────────┬─────────┬──────────────┘
                            │         │
                            ▼         ▼
               ┌──────────────────────────────┐
               │     Services & Pipeline       │
               │  (permission, verification,   │
               │   embedding, extraction,      │
               │   query pipeline stages)      │
               └──────────────┬──────────────┘
                              ▼
               ┌──────────────────────────────┐
               │       Persistence Layer       │
               │ (adapters → SQLite / PostgreSQL│
               │  + caches, locks, events)      │
               └──────────────────────────────┘
 ```

### Key Layers

| Layer | Responsibility |
| --- | --- |
| **Transport** | CLI/HTTP entry points parse arguments, authenticate requests (rate limits, tokens), and dispatch to context-aware handlers. |
| **Application Core** | Container manages the process-level runtime, `createAppContext` (with `context-wiring`) builds the per-server AppContext, and services orchestrate business logic. |
| **Services & Pipeline** | Permission, verification, embedding, and extraction services expose guarded APIs; query pipeline runs resolve→fetch→filter→score→format stages with caching/invalidation from the runtime. |
| **Persistence** | Storage/lock/cache/event adapters abstract SQLite vs PostgreSQL vs Redis; repositories remain the sole direct DB consumers. |
| **Security & Config** | SecurityService handles auth + rate limiting; config is driven by a centralized builder and moving toward a registry+Zod schema for uniform validation. |

### DOs
- DO treat Container → Runtime → AppContext as the canonical flow; register the runtime before building the AppContext.
- DO keep transports thin: auth + rate limit → context-aware handler.
- DO keep AppContext immutable once returned—construct everything up front and inject dependencies rather than mutating later.

### DONTs
- DON'T mix transport logic deep inside services; keep handler responsibilities limited to orchestration.
- DON'T instantiate new runtimes/services inside handlers—reuse the registered runtime and AppContext.

---

## 3. Core Abstractions

- **Container → Runtime → AppContext** remains the canonical dependency structure:
  - Container is process-scoped, creates/tears down the Runtime, and exposes current AppContext for handlers.
  - Runtime houses shared resources (memory coordinator, LRU query cache, rate limiters, optional embedding pipeline) and never leaks module-level singletons.
  - AppContext is per-transport (MCP or REST when running separately) but the same object can be shared when both servers run together; it bundles config, adapters, repos, services, security, query deps, and logger.

- **Factories**: All repositories, services, and query pipeline instances are created via explicit factory functions under `src/core/factory`. This keeps wiring deterministic, test-friendly, and easy to mock.

- **Context Wiring**: `createAppContext()` now resolves backend-specific adapters and delegates the shared service/query/security wiring to `src/core/factory/context-wiring.ts`. This helper ensures both SQLite and PostgreSQL paths reuse the same lifecycle and reduces duplicated logic.

### DOs
- DO use `wireContext` when adding new shared wiring logic so both modes stay consistent.
- DO keep repository creation in `createRepositories` and pass `dbDeps` through to Adapters/Services.

### DONTs
- DON'T add backend-specific services outside the wiring helper—let `wireContext` handle shared lifecycles.
- DON'T leak `sqlite` handles into business logic when running PostgreSQL (use adapters instead).

---

## 4. Transport & Services

- **MCP & REST transports** perform identical auth → handler routing: they resolve agent identity (via SecurityService), check rate limits, and call context-aware handlers that use the AppContext.
- **Handlers** are generated via reusable factories (eg. CRUD builders) and always receive AppContext first, ensuring no module leaks.
- **Services** (permission, verification, embedding, extraction, etc.) encapsulate business rules and surface clear interfaces so handlers stay slim.

### DOs
- DO always pass AppContext to services and repositories rather than importing modules globally.
- DO generate handlers via factories to keep parameter extraction consistent.

### DONTs
- DON'T perform database mutations directly in handlers—delegate to repositories/services.
- DON'T bypass service interfaces even for internal tooling; maintain the abstraction layer.

---

## 5. Query Pipeline & Persistence

### DOs
- DO keep the pipeline stages linear and idempotent: resolve → fetch → FTS → filter → tag load → relations → score → format.
- DO share the runtime query cache through `wireQueryCache` and respect memory pressure hooks (MemoryCoordinator) before adding new cached entries.
- DO route every database call through the repository layer; treat adapters as the only gateway to Drizzle/better-sqlite3.
### DONTs
- DON'T mix persistence logic into services or handlers; use repositories or adapters instead.
- DON'T mutate pipeline context directly across asynchronous boundaries without considering instrumentation (startMs, cacheKey).
- DON'T bypass `wireQueryCache` when invalidating entries—use the runtime event bus to keep caches coherent.
- **Query pipeline** runs through discrete stages (resolve scope → fetch entries → FTS/semantic filtering → tag loading → relation expansion → scoring → format). Each stage receives the pipeline context for powerful instrumentation and caching.
- **Query cache** lives in the runtime, is shrink-wrapped by `LRUCache`, and invalidation is wired through `wireQueryCache`.
- **Persistence** uses adapter abstractions that hide the backend:
  - Storage adapters (SQLite/PostgreSQL) provide schema-specific implementations.
  - Cache, lock, and event adapters currently default to in-process implementations but are wired to swap in Redis when configured.
  - Repositories remain the only layer reaching into Drizzle/SQL helpers, ensuring services stay backend-agnostic.

---

## 6. Security & Observability

- **SecurityService** enforces authentication, rate limits, and downstream identity propagation. It now caches parsed `AGENT_MEMORY_REST_API_KEYS`, exposes `reloadApiKeys()` for hot reloads/testing, and performs timing-safe comparisons so the heavy parsing doesn’t run per-request.
- **Logging** via `utils/logger` respects MCP vs REST modes (MCP writes to stderr), uses sanitized serializers, and supports optional debug file appenders.
- **Instrumentation** surfaces via structured logging, config-driven log levels, and the runtime stats cache for table counts plus query/perf instrumentation.
### DOs
- DO call `SecurityService.validateRequest()` before dispatching in both MCP and REST transports.
- DO log through `createComponentLogger` so component names and metadata stay consistent.
- DO sanitize logs and avoid writing to stdout when MCP mode is active.
### DONTs
- DON'T print structured logs to MCP stdout; only log to stderr to avoid protocol corruption.
- DON'T allow handlers to perform auth/rate limit checks themselves; rely on the centralized service.
- DON'T disable instrumentation flags in production without evaluating performance telemetry needs.

---

## 7. Configuration & Governance

- **Config Registry** (src/config/registry/) provides a metadata-driven approach where each option declares (`envKey`, `default`, `description`, `schema`). The registry is validated via Zod at startup, catching typos and invalid values early. Documentation is auto-generated from the same registry via `npm run docs:generate:env`.
- **Validation pipeline** powers generated documentation (`docs/reference/env-vars.md`) and ensures new features (Redis, backup scheduling, vector config) stay synchronized across code and reference material.

---

## 7.1 Code Hygiene Guidance

Agent Memory must stay scalable, maintainable, modular, and performant. Follow these DOs/DON’Ts when touching shared code:

### DOs
- DO keep modules focused: each factory, service, and handler should do one job and expose a narrow interface.
- DO favor dependency injection over global state; pass AppContext or explicit deps rather than importing singletons.
- DO split large files (config builder, services) into smaller logical sections or helpers to keep cognitive load low.
- DO keep performance-sensitive code (query pipeline, caches, rate limiting) off the hot path unless necessary; add instrumentation when adding complexity.
- DO write regression tests for auth/caching/config parsing changes since they hit production traffic and can regress silently.

### DONTs
- DON'T add procedural logic to `src/config/index.ts`; add new config options as section definitions in `src/config/registry/sections/` so the registry stays the single source of truth.
- DON'T duplicate wiring between SQLite and PostgreSQL (use `wireContext`/adapter factories).
- DON'T ignore async boundaries when touching pipeline or persistence code—always respect `await` and handle errors centrally.
- DON'T sprinkle logging everywhere; prefer component loggers and configurability per transport to avoid noisy outputs.
- DON'T degrade performance by adding heavy parsing or synchronous loops in request paths—cache or memoize where it makes sense.

---

## 8. Guardrails for Coding

- **Testing Expectations:** Add unit or integration tests for any new behavior touching auth, caching, persistence, or config parsing. If a change affects the query pipeline or adapters, follow the existing benchmark/test patterns (vitest + Docker for PG) before merging.
- **Documentation Discipline:** Update architecture references (this doc and relevant README sections) and the env-var reference table whenever you wire new services, expose new config, or change transport behavior so consumers stay in sync.
- **Performance Checks:** Run existing benchmarks (`npm run bench:query`, etc.) or add targeted profiling when modifying cache-heavy paths to catch regressions before release.
- **Security Ops:** Always sanitize logs (relying on `utils/logger`) and never emit structured logs on MCP stdout. Treat secrets in configs (API keys, tokens) as sensitive when logging or storing telemetry.
- **Release Hygiene:** When wiring changes land or config surfaces grow, bump the architecture version/date in this doc and note the behavior in the changelog so downstream teams know what changed.

## 9. Recent Architecture Improvements

- **Centralized AppContext wiring** – `createAppContext()` resolves backend-specific adapters and passes shared wiring responsibilities (services, query pipeline, cache invalidation, security) to `src/core/factory/context-wiring.ts`, eliminating duplicated lifecycles between SQLite and PostgreSQL.
- **Security caching** – `SecurityService` now pre-parses `AGENT_MEMORY_REST_API_KEYS` into a cached Map, exposes `reloadApiKeys()`, and has dedicated unit tests, so HTTP requests now perform timing-safe lookups instead of reparsing the env var each time.
- **Config Registry (complete)** – The registry-driven config system in `src/config/registry/` uses Zod schemas for validation. Each option declares `envKey`, `default`, `description`, and `schema`. Documentation is auto-generated via `npm run docs:generate:env` (with CI check via `npm run docs:check:env`).

---

## 10. Architecture Guidelines (Mandatory)

> **For AI Agents**: These guidelines are MANDATORY. Before making architectural changes, modifying core infrastructure, or adding new services, you MUST read and follow these guidelines. Deviations require explicit user approval.

### Enforcement

- These rules are enforced by CI via `npm run lint:architecture` and ESLint.
- Legacy `get*Service()` accessors may exist during migration, but **new** `get*Service()` singleton accessors are rejected unless explicitly allowlisted.
- Legacy global event-bus access (`getEventBus()`) is allowed only in the existing compatibility shim(s) and must not spread to new files.

### Table of Contents

1. [Layered Architecture](#layered-architecture)
2. [Dependency Injection](#dependency-injection)
3. [Service Registry](#service-registry)
4. [Adapters](#adapters)
5. [Repositories](#repositories)
6. [Error Handling](#error-handling)
7. [Configuration](#configuration)
8. [Event System](#event-system)
9. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
10. [Adding New Features](#adding-new-features)

---

### Layered Architecture

The codebase follows a strict layered architecture. Respect layer boundaries.

```
┌─────────────────────────────────────────────────────┐
│                    MCP Layer                         │
│              src/mcp/ (handlers, server)             │
├─────────────────────────────────────────────────────┤
│                  Service Layer                       │
│     src/services/ (business logic, orchestration)    │
├─────────────────────────────────────────────────────┤
│                    Core Layer                        │
│   src/core/ (runtime, container, context, factory)   │
├─────────────────────────────────────────────────────┤
│                 Repository Layer                     │
│         src/db/repositories/ (data access)           │
├─────────────────────────────────────────────────────┤
│                  Database Layer                      │
│      src/db/ (schema, migrations, connection)        │
├─────────────────────────────────────────────────────┤
│                   Adapters                           │
│   src/core/adapters/ (storage, cache, lock, event)   │
└─────────────────────────────────────────────────────┘
```

#### Rules

1. **Dependencies flow downward only**: Upper layers may depend on lower layers, never the reverse.
2. **MCP handlers are thin**: They validate input, call services, and format output. No business logic.
3. **Services orchestrate**: Business logic lives in services, not handlers or repositories.
4. **Repositories are data-only**: No business logic, just CRUD and queries.
5. **Adapters are swappable**: They implement interfaces, allowing local/distributed backends.

---

### Dependency Injection

All dependencies MUST be injected explicitly. No hidden dependencies.

#### Runtime is the Root

```typescript
// CORRECT: Get dependencies from runtime
const runtime = getRuntime();
const feedbackService = runtime.services.getFeedbackService();
const eventBus = runtime.eventBus;

// WRONG: Import module-level singletons
import { getFeedbackService } from '../services/feedback'; // DEPRECATED
```

#### Constructor Injection

```typescript
// CORRECT: Dependencies injected via constructor
export class MyService {
  constructor(
    private readonly db: DbClient,
    private readonly eventBus: EventBus,
    private readonly config: Config
  ) {}
}

// WRONG: Resolving dependencies inside constructor
export class MyService {
  private readonly eventBus: EventBus;
  constructor() {
    this.eventBus = getEventBus(); // Hidden dependency!
  }
}
```

#### Factory Functions

Use factory functions for complex object creation:

```typescript
// CORRECT: Factory function with explicit deps
export function createMyService(deps: MyServiceDeps): MyService {
  return new MyService(deps.db, deps.eventBus, deps.config);
}

// Factory is called from core/factory.ts or runtime initialization
```

---

### Service Registry

Services are managed by the ServiceRegistry, owned by Runtime.

#### Accessing Services

```typescript
// CORRECT: Access via runtime
const runtime = getRuntime();
const service = runtime.services.getFeedbackService();

// CORRECT: Null check for optional services
const rlService = runtime.services.getRLService();
if (rlService) {
  await rlService.train();
}
```

#### Adding New Services

1. Add the service interface to `ServiceRegistry` in `src/core/service-registry.ts`
2. Add getter method: `getMyService(): MyService | null`
3. Add initialization method: `initMyService(deps): MyService`
4. Initialize in `src/core/factory.ts` if needed at startup
5. **DO NOT** create module-level singletons

```typescript
// In service-registry.ts
interface ServiceRegistry {
  getMyService(): MyService | null;
  initMyService(deps: MyServiceDeps): MyService;
}
```

#### Service Lifecycle

- Services are lazily initialized on first access or explicitly via `init*` methods
- `reset()` clears all services (for testing)
- `shutdown()` gracefully stops services (drain queues, close connections)

---

### Adapters

Adapters abstract infrastructure concerns (storage, cache, locks, events).

#### Interface-First Design

```typescript
// Define interface in src/core/adapters/interfaces.ts
export interface ICacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Implement for each backend
export class MemoryCacheAdapter implements ICacheAdapter { ... }
export class RedisCacheAdapter implements ICacheAdapter { ... }
```

#### Adapter Selection

Adapters are selected at runtime based on configuration:

```typescript
// In src/core/adapters/index.ts
export function createAdapters(deps: AdapterDeps): Adapters {
  // Select implementation based on config/deps
  const cache = config.redis.enabled
    ? createRedisCacheAdapter(config)
    : createMemoryCacheAdapter();
  return { storage, cache, lock, event };
}
```

#### Adding New Adapters

1. Define interface in `src/core/adapters/interfaces.ts`
2. Create implementations (local + distributed if applicable)
3. Export via `src/core/adapters/index.ts`
4. Integrate into `createAdapters()` factory

---

### Repositories

Repositories provide data access with consistent patterns.

#### Repository Interfaces

All repositories MUST have an interface in `src/core/interfaces/repositories.ts`:

```typescript
export interface IMyRepository {
  create(input: CreateMyInput): Promise<MyEntity>;
  getById(id: string): Promise<MyEntity | undefined>;
  list(filter?: ListMyFilter, options?: PaginationOptions): Promise<MyEntity[]>;
  update(id: string, input: UpdateMyInput): Promise<MyEntity | undefined>;
  delete(id: string): Promise<boolean>;
}
```

#### Implementation Pattern

```typescript
// In src/db/repositories/my.repository.ts
export class MyRepository implements IMyRepository {
  constructor(private readonly db: DbClient) {}

  // Use base helpers for common operations
  create(input: CreateMyInput): Promise<MyEntity> {
    const id = generateId();
    const timestamp = now();
    // ... implementation
  }
}
```

#### Shared Utilities

Use utilities from `src/db/repositories/base.ts`:
- `generateId()` - UUID generation
- `now()` - ISO timestamp
- `createPaginatedResult()` - Standard pagination
- `cascadeDeleteRelatedRecordsWithDb()` - Cleanup related data
- `encodeCursor()` / `decodeCursor()` - Cursor pagination

---

### Error Handling

Use the centralized error system in `src/core/errors.ts`.

#### Error Codes

All errors MUST use defined error codes:

```typescript
// CORRECT: Use ErrorCodes
throw new AgentMemoryError(
  'Resource not found',
  ErrorCodes.NOT_FOUND,
  { resource: 'guideline', id }
);

// CORRECT: Use ErrorBuilder for common patterns
throw ErrorBuilder.notFound('guideline', id)
  .withContext({ searchedScopes: ['project', 'global'] })
  .build();

// WRONG: Ad-hoc error codes
throw new AgentMemoryError('Not found', 'CUSTOM_404', {}); // Don't invent codes!
```

#### Error Categories

| Range | Category | Example |
|-------|----------|---------|
| E1000-E1999 | Validation | MISSING_REQUIRED_FIELD, INVALID_SCOPE_TYPE |
| E2000-E2999 | Resource | NOT_FOUND, ALREADY_EXISTS, CONFLICT |
| E3000-E3999 | Locks | FILE_LOCKED, LOCK_NOT_FOUND |
| E4000-E4999 | Database | DATABASE_ERROR, CONNECTION_ERROR |
| E5000-E5999 | System | INTERNAL_ERROR, SERVICE_UNAVAILABLE |
| E6000-E6999 | Permission | PERMISSION_DENIED |
| E7000-E7999 | Extraction | EXTRACTION_FAILED |
| E8000-E8999 | Embedding | EMBEDDING_FAILED |
| E9000-E9999 | Vector | VECTOR_DB_ERROR |
| E10000-E10999 | Network | NETWORK_ERROR, TIMEOUT |

#### Adding New Error Codes

Add to `ErrorCodes` in `src/core/errors.ts` in the appropriate range.

---

### Configuration

Configuration is centralized in `src/config/`.

#### Registry-Based Configuration

All config options are defined in `src/config/registry/sections/`:

```typescript
// In src/config/registry/sections/my-section.ts
export const mySectionOptions = {
  myOption: {
    envKey: 'AGENT_MEMORY_MY_OPTION',
    defaultValue: 'default',
    description: 'Description of what this option does',
    schema: z.string(),
    parse: 'string', // or 'int', 'boolean', 'number', 'path'
  },
};
```

#### Accessing Configuration

```typescript
// CORRECT: Import the config singleton
import { config } from '../config/index.js';
const value = config.mySection.myOption;

// CORRECT: For testing, use reloadConfig()
import { reloadConfig } from '../config/index.js';
process.env.AGENT_MEMORY_MY_OPTION = 'test-value';
reloadConfig();
```

#### Adding New Config Options

1. Add to appropriate section in `src/config/registry/sections/`
2. Add to `Config` interface in `src/config/index.ts`
3. Run `npm run docs:generate:env` to update documentation

---

### Event System

Events enable loose coupling between components.

#### Using Events

```typescript
// CORRECT: Get EventBus from runtime
const eventBus = runtime.eventBus;

// Subscribe to events
const unsubscribe = eventBus.subscribe((event) => {
  if (event.action === 'update' && event.entryType === 'guideline') {
    // Handle event
  }
});

// Emit events
eventBus.emit({
  entryType: 'guideline',
  entryId: id,
  scopeType: 'project',
  scopeId: projectId,
  action: 'update',
});

// Cleanup
unsubscribe();
```

#### Event Types

Events follow the `EntryChangedEvent` interface:

```typescript
interface EntryChangedEvent {
  entryType: 'tool' | 'guideline' | 'knowledge';
  entryId: string;
  scopeType: ScopeType;
  scopeId: string | null;
  action: 'create' | 'update' | 'delete' | 'deactivate';
}
```

---

### Anti-Patterns to Avoid

#### 1. Synchronous `require()` for Circular Dependencies

```typescript
// WRONG: Using require() to break circular dependencies
getCaptureStateManager(): CaptureStateManager {
  const { CaptureStateManager } = require('../services/capture/state.js');
  return new CaptureStateManager();
}

// CORRECT: Use async initialization or restructure dependencies
async initCaptureStateManager(): Promise<CaptureStateManager> {
  const { CaptureStateManager } = await import('../services/capture/state.js');
  return new CaptureStateManager();
}

// BETTER: Restructure to avoid circular dependency
// - Move shared types to separate file
// - Use dependency injection
// - Use interface + late binding
```

#### 2. Module-Level Singletons

```typescript
// WRONG: Module-level singleton
let instance: MyService | null = null;
export function getMyService(): MyService {
  if (!instance) instance = new MyService();
  return instance;
}

// CORRECT: Use ServiceRegistry
runtime.services.getMyService();
```

#### 3. Hidden Dependencies

```typescript
// WRONG: Importing and using global state
import { globalCache } from '../utils/cache';

// CORRECT: Inject as dependency
constructor(private readonly cache: ICacheAdapter) {}
```

#### 4. Business Logic in Handlers

```typescript
// WRONG: Business logic in MCP handler
export async function handleCreate(params: CreateParams, ctx: AppContext) {
  // Validation is OK
  if (!params.name) throw new Error('Name required');

  // Business logic should be in service!
  const existing = await ctx.repos.guidelines.getByName(params.name);
  if (existing && existing.priority > params.priority) {
    // Complex business rule - move to service!
  }
}

// CORRECT: Delegate to service
export async function handleCreate(params: CreateParams, ctx: AppContext) {
  validateCreateParams(params);
  return await guidelineService.create(params);
}
```

#### 5. Direct Database Access in Services

```typescript
// WRONG: Direct SQL in service
class MyService {
  doSomething() {
    this.db.execute('SELECT * FROM guidelines WHERE ...');
  }
}

// CORRECT: Use repository
class MyService {
  constructor(private readonly guidelineRepo: IGuidelineRepository) {}

  doSomething() {
    return this.guidelineRepo.list({ scopeType: 'project' });
  }
}
```

---

### Adding New Features

Follow this checklist when adding new features:

#### New Entity Type

1. [ ] Define schema in `src/db/schema.ts`
2. [ ] Create migration in `src/db/migrations/`
3. [ ] Define repository interface in `src/core/interfaces/repositories.ts`
4. [ ] Implement repository in `src/db/repositories/`
5. [ ] Add to `Repositories` type in `src/core/interfaces/repositories.ts`
6. [ ] Create repository in `src/core/factory.ts`
7. [ ] Create MCP handler using `createCrudHandlers()` factory
8. [ ] Register handler in `src/mcp/handlers/index.ts`
9. [ ] Add tests

#### New Service

1. [ ] Create service class in `src/services/my-service/`
2. [ ] Define dependencies interface
3. [ ] Add to ServiceRegistry interface
4. [ ] Add getter and init methods to ServiceRegistry
5. [ ] Initialize in factory if needed at startup
6. [ ] Add tests

#### New Adapter

1. [ ] Define interface in `src/core/adapters/interfaces.ts`
2. [ ] Create local implementation
3. [ ] Create distributed implementation (if applicable)
4. [ ] Add to `Adapters` type
5. [ ] Integrate into `createAdapters()` factory
6. [ ] Add tests

#### New Configuration Option

1. [ ] Add to appropriate section in `src/config/registry/sections/`
2. [ ] Add to `Config` interface
3. [ ] Run `npm run docs:generate:env`
4. [ ] Update `.env.example` if needed

---

#### Summary

| Principle | Do | Don't |
|-----------|-----|-------|
| Dependencies | Inject via constructor | Use module-level singletons |
| Services | Access via `runtime.services` | Import getter functions |
| Events | Use `runtime.eventBus` | Use deprecated `getEventBus()` |
| Errors | Use `ErrorCodes` and `ErrorBuilder` | Invent ad-hoc error codes |
| Config | Define in registry | Hardcode values |
| Business Logic | Put in services | Put in handlers or repositories |
| Data Access | Use repositories | Write raw SQL in services |
| Circular Deps | Restructure code | Use `require()` |

---

*Last updated: 2025-12-26*

**Document Maintainers:** Architecture Team  
