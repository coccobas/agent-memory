# Agent Memory Project Principles

This document defines the guiding principles for the Agent Memory project. These principles inform all design decisions, feature development, and code reviews.

---

## Product Philosophy

### P1. Memory as Query, Not Dump

The system retrieves relevant knowledge on-demand rather than loading everything into context. Agents query what they need, when they need it.

### P2. Agent-First, Developer-Friendly

The primary user is the AI agent. The developer configures and monitors, but the agent operates autonomously. APIs are designed for LLM consumption first.

### P3. Zero-Config to Start, Deep Config to Scale

`npx agent-memory mcp` must work immediately. Advanced features (semantic search, permissions, multi-agent) are opt-in progressively.

### P4. Structured Over Freeform

Memory is categorized (Tools, Guidelines, Knowledge) with explicit types rather than a generic "memory blob." Structure enables better retrieval and governance.

### P5. Local-First, Cloud-Optional

Data lives on the user's machine by default. Cloud sync, hosted backends, or external services are optional enhancements, never requirements.

---

## Architecture Principles

### A1. Performance is a Feature

Sub-millisecond latency is a hard requirement, not a nice-to-have. Every feature must justify its performance cost. If it slows queries, it's opt-in or rejected.

### A2. SQLite Default, PostgreSQL Scales

SQLite (WAL mode, FTS5) is the default for local-first, zero-config deployments. PostgreSQL is the upgrade path for teams needing concurrent writes, multi-node deployments, or managed infrastructure. Some latency trade-off is acceptable when PostgreSQL unlocks capabilities SQLite cannot provide.

### A3. Layered Enhancement

Core functionality works without optional services. Semantic search enhances but doesn't replace FTS. Cross-encoder re-ranking enhances but doesn't replace base scoring. Each layer is independently valuable.

### A4. Scope Inheritance is Sacred

The hierarchy (global → org → project → session) is foundational. Queries always inherit up the chain. This model cannot be broken or bypassed without explicit opt-out.

### A5. Schema Stability Over Flexibility

The data model (tools, guidelines, knowledge, relations, tags) is stable. New entry types require significant justification. Prefer extending existing types over adding new ones.

### A6. Async by Default, Sync When Needed

Long-running operations (embeddings, LLM calls, summarization) are async with background processing. Core CRUD is sync for predictability. Never block the agent on optional enhancements.

---

## API Design Principles

### D1. Action-Based Tools

MCP tools use an `action` parameter pattern (`memory_guideline` with `action: "add" | "update" | "list"`). One tool per entity type, not one tool per operation. This reduces tool count and groups related operations.

### D2. Natural Language Gateway

`memory`, `memory_remember`, and `memory_quickstart` are the primary interfaces. Structured tools (`memory_guideline`, `memory_query`) exist for power users and edge cases. Optimize the simple path.

### D3. Fail Loud, Recover Gracefully

Invalid inputs return clear error messages, not silent failures. Transient failures (DB locks, network) retry automatically with backoff. Agent should know when they did something wrong vs when to retry.

### D4. Backwards Compatibility Within Major Versions

MCP tool signatures don't break within a major version. New optional parameters are fine. Removing parameters or changing behavior requires a major bump. Deprecation warnings precede removal by at least one minor version.

### D5. Consistent Naming

- Tools: `memory_<noun>` (e.g., `memory_guideline`, `memory_project`)
- Actions: lowercase verbs (`add`, `update`, `list`, `delete`)
- Parameters: camelCase
- Responses: include `_context` for debugging

### D6. Context Auto-Detection

Project, session, and agent IDs are auto-detected from working directory and environment when not explicitly provided. Explicit always overrides implicit.

---

## Development Standards

### S1. Tests Prove Behavior

Every feature requires tests. Unit tests for logic, integration tests for database operations, contract tests for MCP tools. No PR merges with failing tests.

### S2. TypeScript Strict Mode

`strict: true` in tsconfig. No `any` types except at system boundaries (external APIs, dynamic JSON). Type safety catches bugs before runtime.

### S3. ADRs for Architecture, Code for Implementation

Significant architectural decisions get an ADR before implementation. ADRs document the "why", code documents the "how". Reference ADRs in code comments (`// ADR-0009`).

### S4. Documentation Lives with Code

JSDoc for public APIs. README in each service directory. Docs update in the same PR as code changes. Stale docs are bugs.

### S5. Benchmark Before Optimize

Performance claims require benchmarks. Don't optimize without profiling. The `tests/benchmarks/` directory is the source of truth for performance metrics.

### S6. Single Responsibility Services

Each service does one thing. `embedding.service.ts` handles embeddings. `query-rewrite.service.ts` handles query rewriting. Composition over monoliths. New features get new services, not bloated existing ones.

---

## Operational Principles

### O1. Deny by Default

Permissions are restrictive until explicitly granted. Unknown agents have no write access. Production deployments require explicit permission grants. Development mode (`permissive`) is a convenience, not a default. See [ADR-0010](./adr/0010-permission-deny-by-default.md).

### O2. Data Durability Over Speed

WAL mode, fsync on commit. Memory loss is unacceptable. If forced to choose between a slow write and a lost write, choose slow. Async operations complete eventually, never silently fail.

### O3. Audit Everything

All writes are versioned with `createdBy`, `updatedBy`, timestamps. Version history is retained. Who changed what and when must always be answerable.

### O4. Graceful Degradation

If OpenAI is down, semantic search fails but FTS works. If embeddings are missing, queries return results without semantic ranking. Core functionality never depends on external services being available.

### O5. Observable by Default

Errors are logged with context. Metrics are exposed for critical paths. Debug mode shows query plans and scoring details. Silent failures are bugs.

### O6. No Data Lock-In

SQLite databases are portable files. Export tools exist for all data. No proprietary formats. Users can inspect, backup, and migrate their data without agent-memory running.

---

## Using These Principles

When making decisions:

1. **Feature proposals** — Does it align with Product Philosophy (P1-P5)?
2. **Architecture changes** — Does it respect Architecture Principles (A1-A6)?
3. **API additions** — Does it follow API Design (D1-D6)?
4. **Code reviews** — Does it meet Development Standards (S1-S6)?
5. **Deployment decisions** — Does it satisfy Operational Principles (O1-O6)?

When principles conflict, discuss trade-offs explicitly. Document exceptions in ADRs.

---

## Version History

| Date       | Change                         |
| ---------- | ------------------------------ |
| 2026-01-12 | Initial principles established |
