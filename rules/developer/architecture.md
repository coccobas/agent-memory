---
description: Agent Memory architecture and how the software works
globs: ['**/*.ts', '**/*.md']
alwaysApply: true
---

# Agent Memory Architecture

<critical>
## MANDATORY: Architecture Guidelines

Before making ANY architectural changes, modifying core infrastructure, or adding new services, you MUST read and follow the guidelines in:

**`/architecture_final.md`** (project root, see “Architecture Guidelines (Mandatory)”)

This document contains binding rules for:

- Layered architecture and layer boundaries
- Dependency injection patterns (NEVER use module-level singletons)
- Service registry usage (access via `runtime.services.*`)
- Adapter patterns for swappable backends
- Repository patterns and interfaces
- Error handling with proper error codes
- Configuration registry usage
- Event system patterns

**Key prohibitions:**

- NO synchronous `require()` to break circular dependencies
- NO module-level singletons or `getInstance()` patterns
- NO business logic in MCP handlers
- NO direct database access in services (use repositories)
- NO hidden dependencies resolved at runtime

**Enforcement:**

- `npm run lint:architecture` (runs in `npm run validate` / CI) rejects new hidden-dependency patterns (eg. `require()` and new `get*Service()` singletons outside the legacy allowlist).

Deviations from these guidelines require explicit user approval.
</critical>

---

## System Overview

Agent Memory is an MCP (Model Context Protocol) server providing a structured memory backend for AI agents. Instead of loading entire knowledge bases into context, agents query specific memory segments on-demand.

### Core Design Principles

1. **Multi-agent concurrent access** - Multiple IDEs/agents can read/write simultaneously
2. **Hierarchical scoping** - Global → Organization → Project → Session (4 levels)
3. **Append-only versioning** - All changes are tracked, conflicts detected
4. **Cross-reference queries** - Find related entries across memory sections
5. **Token-budget aware** - Responses designed for minimal context consumption

## Technology Stack

- **TypeScript 5.x** - Type safety, MCP ecosystem alignment
- **Node.js 20.x LTS** - Stable runtime
- **MCP SDK** (`@modelcontextprotocol/sdk`) - Official SDK for MCP integration
- **SQLite 3.x** - Portable, zero-config database
- **better-sqlite3** - Synchronous API, fastest binding
- **Drizzle ORM 0.29.x** - Type-safe, lightweight, migrations
- **Vitest** - Fast testing with native ESM and TS support

## Architecture Layers

### 1. MCP Server Layer (`src/mcp/server.ts`)

- **17 bundled tools** with action-based routing (consolidated from 45+ individual tools)
- Each tool supports multiple actions (e.g., `memory_tool` supports: add, update, get, list, history, deactivate, bulk_add, bulk_update, bulk_delete)
- Action-based routing: `bundledHandlers[toolName](params)` extracts `action` and routes to appropriate handler
- Error handling: All errors formatted via `formatError()` for consistent MCP responses

### 2. Handler Layer (`src/mcp/handlers/`)

- **Purpose**: MCP tool interface, parameter validation, permission checks
- **Pattern**: Each handler file exports an object with action methods
- **Responsibilities**:
  - Validate input parameters
  - Check permissions (via `permission.service.ts`)
  - Call service/repository methods
  - Log audit events (via `audit.service.ts`)
  - Format responses
  - Handle errors

**Example handler pattern:**

```typescript
export const knowledgeHandlers = {
  add(params: Record<string, unknown>) {
    // 1. Cast and validate params
    // 2. Check permissions
    // 3. Check for duplicates (warn only)
    // 4. Validate entry data
    // 5. Call repository
    // 6. Check for red flags
    // 7. Log audit
    // 8. Return result
  },
};
```

### 3. Service Layer (`src/services/`)

- **Purpose**: Business logic, cross-cutting concerns
- **Services**:
  - `query.service.ts` - Cross-reference search, relevance scoring, caching
  - `permission.service.ts` - Access control checks
  - `audit.service.ts` - Action logging
  - `validation.service.ts` - Entry validation
  - `duplicate.service.ts` - Duplicate detection
  - `redflag.service.ts` - Unreliable pattern detection
  - `embedding.service.ts` - Semantic search embeddings
  - `vector.service.ts` - Vector similarity search
  - `export.service.ts` / `import.service.ts` - Data exchange
  - `analytics.service.ts` - Usage analytics
  - `voting.service.ts` - Multi-agent consensus

### 4. Repository Layer (`src/db/repositories/`)

- **Purpose**: Data access, database operations
- **Pattern**: Each repository exports an object with CRUD methods
- **Responsibilities**:
  - Create/Read/Update/Delete operations
  - Version management (append-only)
  - Conflict detection (5-second window)
  - Scope inheritance resolution
  - Transaction management

**Key patterns:**

- All writes use `transaction()` wrapper for atomicity
- Append-only versioning: every update creates new version
- Conflict detection: checks if last write was within 5 seconds
- Soft deletes: `isActive` flag, never hard delete (preserve history)

### 5. Database Schema (`src/db/schema.ts`)

- **Drizzle ORM** table definitions
- **Core tables**:
  - Scope: `organizations`, `projects`, `sessions`
  - Memory sections: `tools`, `guidelines`, `knowledge` (each with `*_versions` tables)
  - Cross-reference: `tags`, `entry_tags`, `entry_relations`
  - Coordination: `file_locks`, `conflict_log`
  - Advanced: `entry_embeddings`, `permissions`, `audit_log`, `agent_votes`

## Memory Sections

Three main memory sections, each with identical patterns:

1. **Tools** - Registry of available tools/commands (MCP, CLI, functions, APIs)
2. **Guidelines** - Rules and best practices (code style, security policies)
3. **Knowledge** - Facts, decisions, context (architecture decisions, domain knowledge)

Each section has:

- Main table (e.g., `tools`) with metadata
- Versions table (e.g., `tool_versions`) with append-only history
- Same CRUD operations: `add`, `update`, `get`, `list`, `history`, `deactivate`
- Bulk operations: `bulk_add`, `bulk_update`, `bulk_delete`

## Hierarchical Scoping

**Scope hierarchy** (highest to lowest priority):

1. **Session** - Temporary working context
2. **Project** - Project-specific decisions and patterns
3. **Organization** - Team-wide standards
4. **Global** - Applies everywhere (e.g., security best practices)

**Scope inheritance**: When querying a scope, can inherit from parent scopes (default: `inherit: true`)

**Example**: Querying a session scope with `inherit: true` will search:

- Session scope (highest priority)
- Project scope (parent)
- Organization scope (grandparent)
- Global scope (lowest priority)

## Versioning System

- **Append-only**: Every update creates a new version, never modifies existing versions
- **Version numbers**: Sequential integers starting at 1
- **Current version**: Tracked via `currentVersionId` pointer
- **Conflict detection**: If two writes happen within 5 seconds with same base version, both stored with `conflictFlag: true`
- **History**: Full audit trail via `getHistory(id)` method

## Conflict Resolution

- **Detection**: Automatic detection when concurrent writes occur within 5-second window
- **Storage**: Both versions stored, conflict logged in `conflict_log` table
- **Resolution**: Manual via `memory_conflict` tool (list, resolve)
- **Flagging**: Later version marked with `conflictFlag: true`

## Query System

### Cross-Reference Query (`memory_query`)

- **Search across** all memory sections (tools, guidelines, knowledge)
- **Filtering**:
  - Scope (with inheritance)
  - Tags (include, require, exclude)
  - Text search (with FTS5 support)
  - Relations (find related entries)
  - Date ranges
  - Priority ranges (for guidelines)
- **Scoring**: Relevance ranking based on:
  - Explicit relations (weight: 5.0)
  - Tag overlap (weight: 3.0)
  - Scope proximity (weight: 2.0)
  - Text match (weight: 1.0)
  - Priority (weight: 1.5 for guidelines)
  - Recency (weight: 0.5)
  - Semantic similarity (if embeddings available, hybrid scoring)

### Semantic Search

- **Embeddings**: Generated asynchronously on create/update
- **Vector storage**: LanceDB for vector similarity search
- **Hybrid scoring**: 70% semantic similarity, 30% other factors
- **Threshold**: Default 0.7 similarity score

### Query Caching

- **Strategy**: Conservative (5-minute TTL) for global scope queries
- **Cache key**: Deterministic JSON string of query parameters
- **Invalidation**: Automatic on scope/entry changes
- **Performance**: 50-90% improvement for repeated global queries

## Multi-Agent Coordination

### File Locks

- **Purpose**: Prevent concurrent file modifications
- **Operations**: `checkout`, `checkin`, `status`, `list`, `force_unlock`
- **Timeout**: Default 3600 seconds (1 hour), max 86400 (24 hours)
- **Expiration**: Automatic cleanup of expired locks

### Permissions

- **Granularity**: Per-agent, per-scope, per-entry-type, per-entry
- **Actions**: `read`, `write`, `admin`
- **Default**: No permissions (must be explicitly granted)
- **Checking**: `checkPermission(agentId, action, entryType, entryId, scopeType, scopeId)`

### Audit Logging

- **Tracks**: All actions (create, update, delete, read, query)
- **Fields**: agentId, action, entryType, entryId, scopeType, scopeId, executionTime, success
- **Purpose**: Compliance, debugging, analytics

## Error Handling

- **Custom error class**: `AgentMemoryError` with error codes
- **Error codes**: Categorized (1000s: validation, 2000s: resources, 3000s: locks, 4000s: database, 5000s: system)
- **Formatting**: `formatError()` converts to MCP response format
- **Context**: Errors include helpful suggestions

## Performance Characteristics

- **Query latency**: 0.1-20ms depending on complexity
- **Scalability**: ~100K entries recommended max
- **Concurrent reads**: Unlimited (WAL mode)
- **Concurrent writes**: Serialized (SQLite limitation)
- **Memory usage**: ~10MB base + 1-2MB per connection

## MDAP Support

Agent Memory supports **Massively Decomposed Agentic Processes (MDAPs)** for million-step tasks:

- **Task decomposition**: Hierarchical scoping maps to task hierarchy
- **Multi-agent coordination**: File locks and conflict detection
- **Error tracking**: Version history and conflict log
- **Context management**: Queryable memory with scope inheritance
- **Voting infrastructure**: `agent_votes` table for consensus
- **Analytics**: Success rate tracking, error correlation
