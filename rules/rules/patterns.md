---
description: Design patterns and conventions used in the codebase
globs: ["**/*.ts"]
alwaysApply: false
---

# Design Patterns and Conventions

## Action-Based Routing Pattern

MCP tools use action-based routing: 17 tools with multiple actions each (instead of 45+ individual tools). Server extracts `action` from params and routes to handler methods. Benefits: Reduced tool count, consistent interface, type safety, easier maintenance.

## Append-Only Versioning Pattern

All entries use append-only versioning. Updates create new versions, never modify existing. Process: Get latest version → Calculate new version number → Check conflicts (5-second window) → Create new version → Update current version pointer. Benefits: Full history, conflict detection, rollback capability, immutable data.

## Scope Inheritance Pattern

Queries inherit from parent scopes. With `inherit: true` (default), querying session searches: session → project → org → global. Build scope chain by traversing parent relationships. Benefits: Flexibility, efficiency, priority (child scopes override parent).

## Permission Check Pattern

All write operations check permissions before executing. Use `checkPermission(agentId, action, entryType, entryId, scopeType, scopeId)`. Granularity: Per-agent, per-scope, per-entry-type, per-entry. Actions: `read`, `write`, `admin`.

## Audit Logging Pattern

All actions logged via `logAction()` with agentId, action, entryType, entryId, scopeType, scopeId, executionTime, success. Benefits: Compliance, debugging, analytics.

## Duplicate Detection Pattern

Check for duplicates using `checkForDuplicates()` with Levenshtein distance. Warn but don't block creation. Returns similarity scores for similar entries.

## Red Flag Detection Pattern

Detect unreliable patterns (vague content, missing sources) via `detectRedFlags()`. Returns array of issues with pattern, severity (low/medium/high), description. Warn but don't block.

## Query Caching Pattern

Cache global scope queries (rarely change) to improve performance. Check cache before query, cache result after. TTL: 5-10 minutes. Strategies: Conservative (5min, 100 entries), Aggressive (10min, 200 entries), Disabled.

## Embedding Generation Pattern

Generate embeddings asynchronously (fire-and-forget) for semantic search. Use `generateEmbeddingAsync()` - don't await, don't block. Benefits: Non-blocking, resilient, background processing.

## Type Casting Pattern

Safely cast MCP parameters using `cast<T>(params)`. Provides TypeScript autocomplete and type checking. Still validate required fields at runtime. Use consistently across all handlers.
