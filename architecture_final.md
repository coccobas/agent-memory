# Agent Memory: Final Architecture Specification

**Version:** 1.4  
**Status:** Canonical Reference (High-Level)  
**Last Updated:** Reflects recent wiring, security, and config governance improvements

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

**Document Maintainers:** Architecture Team  
