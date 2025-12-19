# Agent Memory Database - Architecture

> **Version:** 0.9.4
> **Last Updated:** 2025-12-18
> **Status:** Production Ready - Performance Optimized

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Database Schema](#database-schema)
- [Conflict Resolution System](#conflict-resolution-system)
- [MCP Tool Interface](#mcp-tool-interface)
- [Query System](#query-system)
- [Relevance Ranking](#relevance-ranking)
- [Predefined Tags](#predefined-tags-initial-set)
- [Session Modes](#session-modes)
- [Token Budget Awareness](#token-budget-awareness)
- [Performance Characteristics](#performance-characteristics)
- [Migration Path: SQLite → PostgreSQL](#migration-path-sqlite--postgresql)
- [Implementation Roadmap](#implementation-roadmap)
- [Design Decisions Log](#design-decisions-log)
- [Support for Large-Scale Agentic Workflows (MDAP)](#support-for-large-scale-agentic-workflows-mdap)
- [Conversation History System](#conversation-history-system)
- [References](#references)

---

## Overview

A structured memory backend for AI agents exposed via MCP. Agents query specific memory segments on-demand instead of loading entire knowledge bases into context.

### Key Design Principles

1. **Multi-agent concurrent access** - Multiple IDEs/agents can read/write simultaneously
2. **Hierarchical scoping** - Global → Organization → Project → Session
3. **Append-only versioning** - All changes are tracked, conflicts detected
4. **Cross-reference queries** - Find related entries across memory sections
5. **Token-budget aware** - Responses designed for minimal context consumption

### Academic Validation

Agent Memory's design aligns with recent research on large-scale agentic systems ([arXiv:2511.09030](https://arxiv.org/abs/2511.09030)), which demonstrates that solving million-step tasks requires:

- **Maximal decomposition** → Supported via hierarchical scoping
- **Multi-agent coordination** → File locks and conflict detection
- **Error tracking** → Append-only versioning with conflict flags
- **Reliable context** → Queryable, version-controlled memory

This architecture enables Massively Decomposed Agentic Processes (MDAPs) by providing persistent, queryable memory that scales to 1M+ step workflows.

---

## Technology Stack

<details>
<summary><strong>Show details</strong></summary>

### Core Technologies

| Component | Technology | Version | Rationale |
|-----------|------------|---------|-----------|
| **Language** | TypeScript | 5.x | Type safety, MCP ecosystem alignment |
| **Runtime** | Node.js | 20.x LTS | Stable, long-term support |
| **MCP Framework** | `@modelcontextprotocol/sdk` | 1.x | Official SDK, maximum control |
| **Database** | SQLite | 3.x | Portable, zero-config, fast |
| **SQLite Binding** | `better-sqlite3` | 11.x | Synchronous API, fastest binding |
| **ORM** | `drizzle-orm` | 0.29.x | Type-safe, lightweight, migrations |
| **Testing** | Vitest | 1.x | Fast, native ESM, TS support |

### Why These Choices

#### TypeScript over Python
- MCP SDK is TypeScript-first
- Existing project uses TypeScript (per CLAUDE.md)
- Better type safety for schema-heavy code
- No additional runtime dependency

#### Synchronous SQLite (`better-sqlite3`)
- Simpler code (no async chains for DB operations)
- Faster for this workload (no promise overhead)
- Typical query: 0.1-1ms (blocking acceptable)
- Easier transaction handling
- Can add worker threads later if needed

#### Drizzle ORM
- Type-safe queries generated from schema
- Built-in migration support
- Lightweight (~50KB)
- Works seamlessly with `better-sqlite3`
- Easy PostgreSQL migration path

#### Vitest
- Same API as Jest (no learning curve)
- Native TypeScript support
- Fastest test runner for ESM
- Excellent watch mode

### Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "drizzle-orm": "^0.29.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0",
    "drizzle-kit": "^0.20.0",
    "vitest": "^1.0.0"
  }
}
```

**Total runtime dependencies: 4 packages** (intentionally minimal)

### Project Structure

```
/agent-memory/
├── src/
│   ├── db/
│   │   ├── schema.ts           # Drizzle table definitions (21 tables)
│   │   ├── migrations/         # SQL migration files
│   │   ├── connection.ts       # Database connection with health checks
│   │   ├── init.ts             # Database initialization
│   │   └── repositories/       # Data access layer (12 repositories)
│   │       ├── tools.ts
│   │       ├── guidelines.ts
│   │       ├── knowledge.ts
│   │       ├── scopes.ts
│   │       ├── tags.ts
│   │       ├── file_locks.ts
│   │       ├── permissions.ts
│   │       ├── conflicts.ts
│   │       ├── conversations.ts
│   │       └── embedding-hooks.ts
│   ├── services/               # Business logic (20+ services)
│   │   ├── query.service.ts    # Cross-reference search with LRU caching
│   │   ├── vector.service.ts   # Semantic search with LanceDB
│   │   ├── embedding.service.ts # Embedding generation (OpenAI/local)
│   │   ├── validation.service.ts # Input validation
│   │   ├── permission.service.ts # Access control
│   │   ├── analytics.service.ts # Usage analytics
│   │   ├── audit.service.ts    # Audit logging
│   │   ├── voting.service.ts   # Multi-agent consensus
│   │   ├── duplicate.service.ts # Duplicate detection
│   │   ├── file-sync.service.ts # IDE rules synchronization
│   │   ├── import.service.ts   # Data import
│   │   └── export.service.ts   # Data export
│   ├── mcp/
│   │   ├── server.ts           # MCP server with 19 bundled tools
│   │   ├── handlers/           # Tool handlers (20 handlers)
│   │   ├── types.ts            # MCP type definitions
│   │   └── errors.ts           # Error formatting
│   ├── utils/
│   │   ├── lru-cache.ts        # LRU cache with TTL and partial eviction
│   │   ├── rate-limiter.ts     # Sliding window rate limiting
│   │   ├── memory-coordinator.ts # Global cache memory management
│   │   ├── sanitize.ts         # Sensitive data redaction (20+ patterns)
│   │   ├── logger.ts           # Pino-based structured logging
│   │   ├── retry.ts            # Exponential backoff retry
│   │   ├── type-guards.ts      # Runtime type validation
│   │   └── paths.ts            # Path normalization
│   └── index.ts                # Entry point
├── data/
│   ├── memory.db               # SQLite database
│   └── vectors.lance/          # LanceDB vector storage
├── tests/
│   ├── unit/                   # Unit tests (57 files, 802 tests)
│   ├── integration/            # Integration tests
│   └── fixtures/               # Test data
├── docs/                       # Documentation (17 files)
├── drizzle.config.ts           # Drizzle configuration
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Configuration

Database location depends on how you run the server:

- **Source / npm install:** defaults to `data/memory.db` under the Agent Memory project root (use `AGENT_MEMORY_DB_PATH` to override)
- **Docker image:** defaults to `/data/memory.db` (intended to be a bind-mounted volume)

```typescript
// src/config/index.ts (simplified)
export const config = {
  database: {
    path: process.env.AGENT_MEMORY_DB_PATH ?? 'data/memory.db',
  },
};
```

---

</details>

## Database Schema

<details>
<summary><strong>Show details</strong></summary>

### Core Entities

```
┌─────────────────────────────────────────────────────────────────┐
│                         SCOPES                                   │
├─────────────────────────────────────────────────────────────────┤
│  organizations ─┬─► projects ─┬─► sessions                      │
│                 │             │                                  │
│                 │             └─► project_tags                   │
│                 │                                                │
│                 └─► org_members                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      MEMORY SECTIONS                             │
├─────────────────────────────────────────────────────────────────┤
│  tools ─────────┬─► tool_versions (append-only)                 │
│                 └─► tool_tags                                    │
│                                                                  │
│  guidelines ────┬─► guideline_versions (append-only)            │
│                 └─► guideline_tags                               │
│                                                                  │
│  knowledge ─────┬─► knowledge_versions (append-only)            │
│                 └─► knowledge_tags                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      CROSS-REFERENCE                             │
├─────────────────────────────────────────────────────────────────┤
│  tags (controlled vocabulary + free-form)                        │
│  entry_relations (explicit links between entries)                │
│  conflict_log (concurrent write detection)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

### Table Definitions

#### Scope Tables

```sql
-- Organizations (for future multi-user)
CREATE TABLE organizations (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata        JSON
);

-- Projects within organizations
CREATE TABLE projects (
    id              TEXT PRIMARY KEY,
    org_id          TEXT REFERENCES organizations(id),
    name            TEXT NOT NULL,
    description     TEXT,
    root_path       TEXT,                    -- filesystem path if applicable
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata        JSON,                    -- goals, constraints, current state

    UNIQUE(org_id, name)
);

-- Sessions (working periods / scratch spaces)
CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    project_id      TEXT REFERENCES projects(id),
    name            TEXT,                    -- optional label
    purpose         TEXT,                    -- what this session is for
    agent_id        TEXT,                    -- which agent/IDE created it
    status          TEXT DEFAULT 'active',   -- active, paused, completed, discarded
    started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at        TIMESTAMP,
    metadata        JSON                     -- scratch notes, temp decisions
);
```

#### Memory Section Tables

```sql
-- Tools Registry
CREATE TABLE tools (
    id                  TEXT PRIMARY KEY,
    scope_type          TEXT NOT NULL,       -- 'global', 'org', 'project', 'session'
    scope_id            TEXT,                -- NULL for global, otherwise org/project/session id
    name                TEXT NOT NULL,
    category            TEXT,                -- 'mcp', 'cli', 'function', 'api'
    current_version_id  TEXT,                -- pointer to latest version
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          TEXT,                -- agent or user that created it

    UNIQUE(scope_type, scope_id, name)
);

CREATE TABLE tool_versions (
    id              TEXT PRIMARY KEY,
    tool_id         TEXT REFERENCES tools(id),
    version_num     INTEGER NOT NULL,
    description     TEXT,
    parameters      JSON,                    -- parameter schema
    examples        JSON,                    -- usage examples
    constraints     TEXT,                    -- usage guidelines
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by      TEXT,
    change_reason   TEXT,                    -- why this version was created
    conflict_flag   BOOLEAN DEFAULT FALSE,   -- set if concurrent write detected

    UNIQUE(tool_id, version_num)
);

-- Guidelines
CREATE TABLE guidelines (
    id                  TEXT PRIMARY KEY,
    scope_type          TEXT NOT NULL,
    scope_id            TEXT,
    name                TEXT NOT NULL,
    category            TEXT,                -- 'code_style', 'behavior', 'security', etc.
    priority            INTEGER DEFAULT 50,  -- 0-100, higher = more important
    current_version_id  TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          TEXT,

    UNIQUE(scope_type, scope_id, name)
);

CREATE TABLE guideline_versions (
    id              TEXT PRIMARY KEY,
    guideline_id    TEXT REFERENCES guidelines(id),
    version_num     INTEGER NOT NULL,
    content         TEXT NOT NULL,           -- the actual guideline text
    rationale       TEXT,                    -- why this guideline exists
    examples        JSON,                    -- good/bad examples
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by      TEXT,
    change_reason   TEXT,
    conflict_flag   BOOLEAN DEFAULT FALSE,

    UNIQUE(guideline_id, version_num)
);

-- Knowledge (general facts, decisions, context)
CREATE TABLE knowledge (
    id                  TEXT PRIMARY KEY,
    scope_type          TEXT NOT NULL,
    scope_id            TEXT,
    title               TEXT NOT NULL,
    category            TEXT,                -- 'decision', 'fact', 'context', 'reference'
    current_version_id  TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          TEXT,

    UNIQUE(scope_type, scope_id, title)
);

CREATE TABLE knowledge_versions (
    id              TEXT PRIMARY KEY,
    knowledge_id    TEXT REFERENCES knowledge(id),
    version_num     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    source          TEXT,                    -- where this knowledge came from
    confidence      REAL DEFAULT 1.0,        -- 0-1, how certain we are
    valid_until     TIMESTAMP,               -- expiration if applicable
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by      TEXT,
    change_reason   TEXT,
    conflict_flag   BOOLEAN DEFAULT FALSE,

    UNIQUE(knowledge_id, version_num)
);
```

#### Tag & Cross-Reference Tables

```sql
-- Tag taxonomy (hybrid: predefined + free-form)
CREATE TABLE tags (
    id              TEXT PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    category        TEXT,                    -- 'language', 'domain', 'custom'
    is_predefined   BOOLEAN DEFAULT FALSE,
    description     TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Entry-tag associations (polymorphic)
CREATE TABLE entry_tags (
    id              TEXT PRIMARY KEY,
    entry_type      TEXT NOT NULL,           -- 'tool', 'guideline', 'knowledge', 'project'
    entry_id        TEXT NOT NULL,
    tag_id          TEXT REFERENCES tags(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(entry_type, entry_id, tag_id)
);

-- Explicit relations between entries
CREATE TABLE entry_relations (
    id              TEXT PRIMARY KEY,
    source_type     TEXT NOT NULL,
    source_id       TEXT NOT NULL,
    target_type     TEXT NOT NULL,
    target_id       TEXT NOT NULL,
    relation_type   TEXT NOT NULL,           -- 'applies_to', 'depends_on', 'conflicts_with', 'related_to'
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by      TEXT,

    UNIQUE(source_type, source_id, target_type, target_id, relation_type)
);

-- Conflict detection log
CREATE TABLE conflict_log (
    id              TEXT PRIMARY KEY,
    entry_type      TEXT NOT NULL,
    entry_id        TEXT NOT NULL,
    version_a_id    TEXT NOT NULL,
    version_b_id    TEXT NOT NULL,
    detected_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved        BOOLEAN DEFAULT FALSE,
    resolution      TEXT,                    -- how it was resolved
    resolved_at     TIMESTAMP,
    resolved_by     TEXT
);
```

#### Indexes for Performance

```sql
-- Scope lookups
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_status ON sessions(status);

-- Entry lookups by scope
CREATE INDEX idx_tools_scope ON tools(scope_type, scope_id);
CREATE INDEX idx_guidelines_scope ON guidelines(scope_type, scope_id);
CREATE INDEX idx_knowledge_scope ON knowledge(scope_type, scope_id);

-- Version lookups
CREATE INDEX idx_tool_versions_tool ON tool_versions(tool_id);
CREATE INDEX idx_guideline_versions_guideline ON guideline_versions(guideline_id);
CREATE INDEX idx_knowledge_versions_knowledge ON knowledge_versions(knowledge_id);

-- Tag lookups
CREATE INDEX idx_entry_tags_entry ON entry_tags(entry_type, entry_id);
CREATE INDEX idx_entry_tags_tag ON entry_tags(tag_id);

-- Relation lookups
CREATE INDEX idx_relations_source ON entry_relations(source_type, source_id);
CREATE INDEX idx_relations_target ON entry_relations(target_type, target_id);

-- Conflict tracking
CREATE INDEX idx_conflicts_unresolved ON conflict_log(entry_type, entry_id) WHERE NOT resolved;
```

---

</details>

## Conflict Resolution System

<details>
<summary><strong>Show details</strong></summary>

### Write Flow

```
Agent A writes tool "git_commit"
         │
         ▼
┌─────────────────────────────────────┐
│ 1. Begin transaction                │
│ 2. Lock row for tool "git_commit"   │
│ 3. Get current version number (N)   │
│ 4. Check for in-flight writes       │
│    └─► If concurrent write detected │
│        └─► Set conflict_flag = true │
│ 5. Insert new version (N+1)         │
│ 6. Update current_version_id        │
│ 7. Commit transaction               │
└─────────────────────────────────────┘
```

### Conflict Detection

Conflict occurs when:
- Two writes to the same entry happen within a short window (configurable, e.g., 5 seconds)
- Both writes have the same base version number

When detected:
1. Both versions are stored
2. `conflict_flag = true` on the later version
3. Entry added to `conflict_log`
4. Query responses include conflict warning

### Resolution

```sql
-- View unresolved conflicts
SELECT * FROM conflict_log WHERE NOT resolved;

-- Mark resolved (keeps both versions, just clears the flag)
UPDATE conflict_log
SET resolved = true, resolution = 'kept_version_b', resolved_by = 'user'
WHERE id = ?;
```

---

</details>

## MCP Tool Interface

<details>
<summary><strong>Show details</strong></summary>

### Scope Management

**Note:** As of v0.2.0, tools are bundled with action-based routing. The old individual tool names are deprecated. See [Migration Guide](../docs/api-reference.md#migration-from-v010) for details.

| Tool | Actions | Description |
|------|---------|-------------|
| `memory_org` | `create`, `list` | Organization management |
| `memory_project` | `create`, `list`, `get`, `update` | Project management |
| `memory_session` | `start`, `end`, `list` | Session management |

### Tool Registry

| Tool | Actions | Description |
|------|---------|-------------|
| `memory_tool` | `add`, `update`, `get`, `list`, `history`, `deactivate` | Tool definitions |

### Guidelines

| Tool | Actions | Description |
|------|---------|-------------|
| `memory_guideline` | `add`, `update`, `get`, `list`, `history`, `deactivate` | Behavioral guidelines |

### Knowledge

| Tool | Actions | Description |
|------|---------|-------------|
| `memory_knowledge` | `add`, `update`, `get`, `list`, `history`, `deactivate` | Knowledge entries |

### Tags & Relations

| Tool | Actions | Description |
|------|---------|-------------|
| `memory_tag` | `create`, `list`, `attach`, `detach`, `for_entry` | Tag management |
| `memory_relation` | `create`, `list`, `delete` | Entry relations |

### Cross-Reference Queries & Management

| Tool | Actions | Description |
|------|---------|-------------|
| `memory_query` | `search`, `context` | Cross-reference search and context aggregation |
| `memory_task` | `add`, `get`, `list` | Task decomposition for MDAP workflows |
| `memory_voting` | `record_vote`, `get_consensus`, `list_votes`, `get_stats` | Multi-agent voting and consensus |
| `memory_analytics` | `get_stats`, `get_trends`, `get_subtask_stats`, `get_error_correlation`, `get_low_diversity` | Usage analytics and trends |
| `memory_permission` | `grant`, `revoke`, `check`, `list` | Permission management |
| `memory_conflict` | `list`, `resolve` | Conflict management |
| `memory_file_lock` | `checkout`, `checkin`, `status`, `list`, `force_unlock` | File locks for multi-agent coordination |
| `memory_health` | (no actions) | Health check and server status |
| `memory_init` | `init`, `status`, `reset` | Database initialization and migrations |
| `memory_export` | `export` | Export entries to JSON/Markdown/YAML/OpenAPI |
| `memory_import` | `import` | Import entries from JSON/YAML/Markdown/OpenAPI |

---

</details>

## Query System

<details>
<summary><strong>Show details</strong></summary>

### `memory_query` - The Power Tool

```typescript
interface MemoryQueryParams {
  // What to search
  types?: ('tools' | 'guidelines' | 'knowledge')[];

  // Scope filtering (inherits from higher scopes)
  scope?: {
    type: 'global' | 'org' | 'project' | 'session';
    id?: string;
    inherit?: boolean;  // include parent scopes (default: true)
  };

  // Tag-based filtering
  tags?: {
    include?: string[];      // must have ANY of these
    require?: string[];      // must have ALL of these
    exclude?: string[];      // must NOT have these
  };

  // Text search
  search?: string;           // searches name, description, content

  // Relation-based
  related_to?: {
    type: 'tool' | 'guideline' | 'knowledge' | 'project';
    id: string;
    relation?: string;       // specific relation type
  };

  // Output control
  limit?: number;            // max results (default: 20)
  include_versions?: boolean; // include version history
  include_inactive?: boolean; // include soft-deleted
}
```

### Query Examples

**1. Get all Python guidelines for current project:**
```json
{
  "types": ["guidelines"],
  "scope": { "type": "project", "id": "my-project", "inherit": true },
  "tags": { "require": ["python"] }
}
```

**2. Find tools related to a specific project:**
```json
{
  "types": ["tools"],
  "related_to": { "type": "project", "id": "my-project" }
}
```

**3. Search for anything about "authentication":**
```json
{
  "search": "authentication",
  "scope": { "type": "project", "id": "my-project", "inherit": true }
}
```

**4. Get high-priority security guidelines:**
```json
{
  "types": ["guidelines"],
  "tags": { "require": ["security"] },
  "scope": { "type": "global" }
}
```

### Scope Inheritance

When `inherit: true` (default), queries cascade up:

```
Session → Project → Organization → Global
```

Results are merged with scope priority (session overrides project, etc.).

---

</details>

## Relevance Ranking

<details>
<summary><strong>Show details</strong></summary>

Results are scored by:

1. **Explicit relations** (weight: 5.0)
   - Entry has direct relation to query target

2. **Tag overlap** (weight: 3.0)
   - Matching tags with query or related entries

3. **Scope proximity** (weight: 2.0)
   - Same session > same project > same org > global

4. **Text match** (weight: 1.0)
   - Keyword matches in name/description/content

5. **Priority** (for guidelines, weight: 1.5)
   - Higher priority guidelines ranked first

6. **Recency** (weight: 0.5)
   - More recently updated entries ranked slightly higher

---

</details>

## Predefined Tags (Initial Set)

<details>
<summary><strong>Show details</strong></summary>

### Languages
`python`, `typescript`, `javascript`, `rust`, `go`, `java`, `sql`, `bash`, `markdown`

### Domains
`web`, `cli`, `api`, `database`, `ml`, `devops`, `security`, `testing`, `documentation`

### Categories
`code_style`, `architecture`, `behavior`, `performance`, `error_handling`, `logging`

### Meta
`deprecated`, `experimental`, `stable`, `required`, `optional`

---

</details>

## Session Modes

<details>
<summary><strong>Show details</strong></summary>

Sessions serve dual purposes based on configuration:

### Working Period Mode
- Tracks what you're doing in a time-bounded way
- Auto-captures decisions and context
- Can be "paused" and "resumed"
- Entries persist after session ends

### Scratch Space Mode
- Experimental entries that might be discarded
- Session entries marked `ephemeral: true`
- On session end: prompt to promote or discard
- Promoted entries move to project scope

```sql
-- Session metadata distinguishes mode
metadata: {
  "mode": "working_period" | "scratch",
  "auto_promote": true | false,
  "ephemeral_entries": ["entry_id_1", "entry_id_2"]
}
```

---

</details>

## Token Budget Awareness

<details>
<summary><strong>Show details</strong></summary>

### Response Truncation

Each MCP tool response includes:

```json
{
  "results": [...],
  "meta": {
    "total_count": 45,
    "returned_count": 20,
    "truncated": true,
    "estimated_tokens": 1250,
    "has_more": true,
    "next_cursor": "abc123"
  }
}
```

### Compact Mode

For minimal token usage:

```json
{
  "compact": true  // Returns only names and IDs, not full content
}
```

### Pagination

```json
{
  "limit": 10,
  "cursor": "abc123"  // From previous response
}
```

---

</details>

## Performance Characteristics

<details>
<summary><strong>Show details</strong></summary>

### Query Performance

| Operation | Typical Latency | Notes |
|-----------|----------------|-------|
| **Simple Get** (by ID) | 0.1-0.5ms | Direct primary key lookup |
| **Get with Scope Inheritance** | 0.5-2ms | Up to 4 scope levels (session → project → org → global) |
| **List** (paginated) | 1-5ms | With indexes, linear with result set size |
| **Cross-Reference Query** | 5-20ms | Depends on scope size and filters |
| **Version History** | 1-3ms | Per entry, ordered query |
| **File Lock Check** | 0.2-1ms | Includes expired lock cleanup |

### Scalability Limits

| Metric | SQLite Limit | Recommended Max | Notes |
|--------|-------------|-----------------|-------|
| **Total Entries** | ~1M | ~100K | Query performance degrades after 100K entries |
| **Scope Size** | Unlimited | ~10K/scope | Cross-reference queries slow with large scopes |
| **Concurrent Reads** | Unlimited | ~100 | WAL mode supports high read concurrency |
| **Concurrent Writes** | 1 | 1 | SQLite serializes writes |
| **Query Result Size** | Configurable | 20-100 | Default limit: 20, max limit: 100 |
| **Database File Size** | 281TB | ~10GB | Practical limit for reasonable performance |

### Memory Usage

- **Base Memory**: ~10MB (Node.js + SQLite)
- **Per Connection**: ~1-2MB
- **Query Caching**: Not implemented (opportunity for optimization)
- **Result Sets**: Loaded entirely in memory (consider streaming for large results)

### Optimization Strategies

#### Current Optimizations

1. **Database Indexes**
   - Primary keys on all tables
   - Unique indexes on (scope, name/title)
   - Composite indexes on foreign keys
   - Index on file locks expiration

2. **WAL Mode**
   - Enabled by default for better concurrent reads
   - Checkpoint frequency: SQLite defaults

3. **Query Efficiency**
   - Limit clause on all list queries (default: 20, max: 100)
   - Soft cap at `limit * 2` for cross-reference queries
   - Expired lock cleanup on each lock operation

#### Potential Optimizations (Not Yet Implemented)

1. **Query Result Caching**
   - Cache global scope queries (rarely change)
   - TTL-based invalidation
   - Estimated improvement: 50-90% for repeated queries

2. **SQL-Level Filtering**
   - Move text search to SQL WHERE clauses
   - Use LIKE or full-text search
   - Estimated improvement: 30-50% for large datasets

3. **Connection Pooling**
   - Currently uses single connection
   - Pool size: 3-5 for multi-agent scenarios
   - Required for PostgreSQL migration

4. **Streaming Results**
   - Iterator-based result sets for large queries
   - Reduces memory pressure
   - Better for export/backup operations

### Performance Monitoring

Enable performance logging with environment variable:

```bash
export AGENT_MEMORY_PERF=1
```

Logs include:
- Query type and parameters
- Result counts (returned/total)
- Query duration in milliseconds

Example output:
```
[agent-memory] memory_query scope=project types=tools,guidelines results=15/42 durationMs=8
```

### Benchmarks

Based on a database with 1,000 entries (500 tools, 300 guidelines, 200 knowledge):

| Operation | Average | p95 | p99 |
|-----------|---------|-----|-----|
| Get by ID | 0.3ms | 0.5ms | 1ms |
| List (20 items) | 2ms | 4ms | 6ms |
| Cross-ref query | 12ms | 18ms | 25ms |
| Create entry | 3ms | 5ms | 8ms |
| Update entry | 4ms | 7ms | 12ms |

*Note: Benchmarks run on MacBook Pro M1, 16GB RAM, SSD storage*

---

</details>

## Migration Path: SQLite → PostgreSQL

<details>
<summary><strong>Show details</strong></summary>

### SQLite (Development/Single-User)

- Single file database
- No server setup
- Perfect for local agent use
- Connection: `sqlite:///path/to/memory.db`

### PostgreSQL (Production/Multi-User)

Schema is PostgreSQL-compatible. Migration requires:

1. Change connection string
2. Add connection pooling
3. Enable row-level locking (already designed for it)
4. Optional: Add `pg_trgm` extension for better text search

```sql
-- PostgreSQL-specific additions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_tools_name_trgm ON tools USING gin(name gin_trgm_ops);
CREATE INDEX idx_guidelines_content_trgm ON guideline_versions USING gin(content gin_trgm_ops);
```

---

</details>

## Implementation Roadmap

<details>
<summary><strong>Show details</strong></summary>

### Milestone 1: Foundation ✅
- [x] Architecture design
- [x] Technology stack selection
- [x] Database schema design
- [x] MCP tool interface design
- [x] Sample bootstrap data

### Milestone 2: Core CRUD ✅
- [x] Project setup (package.json, tsconfig, etc.)
- [x] Drizzle schema implementation (13 tables)
- [x] Database migrations
- [x] Tool registry CRUD with versioning
- [x] Guideline CRUD with versioning
- [x] Knowledge CRUD with versioning
- [x] Tag management (hybrid taxonomy)
- [x] Unit tests (8 passing)

### Milestone 3: MCP Server ✅
- [x] MCP server setup with @modelcontextprotocol/sdk
- [x] 35 MCP tool definitions
- [x] Scope handlers (org, project, session)
- [x] Tool handlers (add, update, get, list, history, deactivate)
- [x] Guideline handlers (add, update, get, list, history, deactivate)
- [x] Knowledge handlers (add, update, get, list, history, deactivate)
- [x] Tag handlers (create, list, attach, detach, forEntry)
- [x] Relation handlers (create, list, delete)
- [x] Main entry point and CLI support

### Milestone 4: Advanced Features ✅
- [x] Cross-reference query (`memory_query`) with relevance scoring
- [x] Context aggregation (`memory_query` with `action: "context"`)
- [x] Conflict detection and resolution
- [x] File locks for multi-agent coordination
- [x] Scope inheritance in queries
- [x] Semantic search with vector embeddings (LanceDB)
- [x] Fine-grained permissions system
- [x] Comprehensive integration tests

### Milestone 5: Performance & Security ✅ (v0.8.x)
- [x] LRU query caching with selective invalidation
- [x] Partial cache eviction (memory pressure handling)
- [x] Rate limiting (per-agent and global)
- [x] Sensitive data redaction in logs (20+ API key patterns)
- [x] N+1 query fixes (batch rowid lookups)
- [x] Scope chain caching
- [x] 802 passing tests with 80% coverage threshold
- [x] IDE rules synchronization (8 IDEs supported)

### Future Enhancements (Planned)
- [ ] Event sourcing for enhanced audit trails
- [ ] Redis caching for distributed deployments
- [ ] OpenTelemetry instrumentation
- [ ] PostgreSQL migration path
- [ ] Webhook notifications

---

</details>

## Design Decisions Log

<details>
<summary><strong>Show details</strong></summary>

| Date | Decision | Rationale |
|------|----------|-----------|
| 2024-01-15 | TypeScript over Python | MCP ecosystem alignment, type safety |
| 2024-01-15 | Synchronous SQLite | Simpler code, fast enough for use case |
| 2024-01-15 | Drizzle ORM | Type-safe, lightweight, good migrations |
| 2024-01-15 | Vitest for testing | Fast, native TS, same API as Jest |
| 2024-01-15 | Append-only versioning | Enables conflict detection, full history |
| 2024-01-15 | Hybrid tag taxonomy | Structure with flexibility |
| 2024-12-10 | 5-second conflict window | Balance between detecting conflicts and allowing rapid legitimate updates |
| 2024-12-10 | Scope inheritance default true | Most queries benefit from seeing parent scope data |
| 2024-12-10 | Soft delete only | Append-only philosophy, preserve history |
| 2024-12-10 | Removed exactOptionalPropertyTypes | Simplified handler type casting |

---

</details>

## Support for Large-Scale Agentic Workflows (MDAP)

<details>
<summary><strong>Show details</strong></summary>

### Massively Decomposed Agentic Processes

Recent research ([arXiv:2511.09030](https://arxiv.org/abs/2511.09030) - "Solving a Million-Step LLM Task with Zero Errors") demonstrates that LLM systems can reliably execute tasks with 1M+ steps using **Massively Decomposed Agentic Processes (MDAPs)**:

1. **Maximal Agentic Decomposition (MAD)** - Breaking tasks into minimal subtasks
2. **First-to-Ahead-by-k Voting** - Multi-agent consensus for error correction
3. **Red-Flagging** - Detecting and discarding unreliable responses
4. **Decorrelated Errors** - Ensuring agent diversity for effective voting

### How Agent Memory Enables MDAP

Agent Memory's architecture naturally supports MDAP workflows:

#### 1. Hierarchical Decomposition ✅

```
Task Decomposition Mapping:
┌─────────────────────────────────────────────────────────────┐
│ Million-Step Task                                            │
│   └─► Global Scope:     Domain knowledge, universal rules   │
│       └─► Organization:  Team standards, shared tools       │
│           └─► Project:   Task-specific decomposition        │
│               └─► Session: Individual subtask execution     │
└─────────────────────────────────────────────────────────────┘
```

- **Session scope** = Individual subtask context
- **Project scope** = Overall task decomposition
- **Org/Global scope** = Reusable patterns and knowledge

#### 2. Multi-Agent Coordination ✅

**File Locks (`file_locks` table)**:
- Prevent concurrent modifications to the same subtask
- Timeout mechanism for zombie detection
- Per-agent lock tracking

**Conflict Detection (`conflict_log` table)**:
- Detects concurrent writes within 5-second window
- Preserves both versions for analysis
- Enables learning from disagreements

#### 3. Version History for Reliability ✅

**Append-Only Versioning**:
- Every change tracked with timestamps
- Full audit trail for 1M+ step tasks
- Rollback capability if errors detected
- Change reasons documented

```sql
-- Example: Track subtask evolution
SELECT * FROM tool_versions 
WHERE tool_id = 'subtask-123' 
ORDER BY version_num DESC;
-- Returns complete history of subtask refinements
```

#### 4. Cross-Reference for Dependencies ✅

**Entry Relations**:
- `depends_on` - Subtask dependency graph
- `applies_to` - Which guidelines apply to which subtasks
- `related_to` - Similar subtasks for pattern recognition

```sql
-- Example: Find all subtasks that depend on a completed step
SELECT * FROM entry_relations 
WHERE source_type = 'tool' 
  AND source_id = 'completed-subtask-id'
  AND relation_type = 'depends_on';
```

### Current MDAP Capabilities

| MDAP Component | Agent Memory Support | Status |
|----------------|---------------------|--------|
| **Task Decomposition** | Hierarchical scoping (4 levels) | ✅ Ready |
| **Multi-Agent Execution** | File locks, conflict detection | ✅ Ready |
| **Error Tracking** | Version history, conflict log | ✅ Ready |
| **Context Management** | Queryable memory, scope inheritance | ✅ Ready |
| **Subtask Coordination** | Entry relations, session isolation | ✅ Ready |
| **Voting Storage** | Basic (knowledge.confidence field) | ⚠️ Limited |
| **Red-Flag Patterns** | Guidelines can store, not automated | ⚠️ Manual |
| **Success Rate Tracking** | Not implemented | ❌ Missing |
| **Agent Reliability Scoring** | Not implemented | ❌ Missing |

### Enhanced MDAP Support (Future)

To fully support MDAP workflows, future enhancements should include:

**1. Multi-Agent Voting Infrastructure** (HIGH PRIORITY)
```sql
CREATE TABLE agent_votes (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,
  vote_value TEXT,
  confidence REAL,
  created_at TEXT
);
```

**2. Red-Flag Pattern Detection** (MEDIUM PRIORITY)
- Automated detection of unreliable response patterns
- Learning from historical failures
- Pattern library versioning

**3. Subtask Success Analytics** (MEDIUM PRIORITY)
- Track success rate per subtask type
- Measure execution time distributions
- Identify bottleneck subtasks
- Predict total task cost

**4. Decorrelated Error Analysis** (MEDIUM PRIORITY)
- Measure error correlation between agents
- Alert when agents are too similar
- Suggest diversification strategies

### Example MDAP Workflow

```typescript
// 1. Store task decomposition
await memory_project.create({
  name: "million-step-task",
  metadata: {
    totalSteps: 1048576, // 2^20 steps
    decompositionDepth: 20,
    requiredAgents: 5
  }
});

// 2. Store subtask definition
await memory_tool.add({
  scopeType: "project",
  scopeId: "million-step-task",
  name: "subtask-move-disk",
  category: "mcp",
  description: "Atomic operation: move one disk"
});

// 3. Track subtask dependencies
await memory_relation.create({
  sourceType: "tool",
  sourceId: "subtask-3",
  targetType: "tool",
  targetId: "subtask-1",
  relationType: "depends_on"
});

// 4. Multiple agents vote on solution
// (Future: store votes in agent_votes table)
await memory_knowledge.add({
  scopeType: "session",
  scopeId: "agent-1-session",
  title: "subtask-3-solution",
  content: "move disk from peg A to peg C",
  confidence: 0.95
});

// 5. Query consensus across agents
const results = await memory_query({
  search: "subtask-3-solution",
  scope: { type: "project", id: "million-step-task" },
  types: ["knowledge"]
});
// Returns all agent solutions for voting
```

### Scaling Laws & Performance

Based on MDAP research, success probability with voting:

```
P(success) = 1 - (1 - p)^n

Where:
- p = single-agent success rate
- n = number of voting agents
- P(success) = overall success probability

Example:
- p = 0.95 (95% single-agent accuracy)
- n = 5 agents
- P(success) = 1 - (0.05)^5 = 0.9999997 (99.99997%)
```

Agent Memory enables this by:
- Storing multiple agent attempts (version history)
- Tracking confidence scores (knowledge.confidence)
- Maintaining isolated contexts (session scope)
- Preventing interference (file locks)

### Performance Characteristics for MDAP

For a million-step task with maximal decomposition:

| Metric | Value | Note |
|--------|-------|------|
| **Subtasks** | ~1M | One per atomic operation |
| **DB Entries** | ~2M | Subtask + result per step |
| **Query Time** | <50ms | With proper indexes |
| **Version History** | Complete | Full audit trail |
| **Storage** | ~500MB | For 1M subtasks |
| **Concurrent Agents** | 100+ | With file locks |

**Optimization Strategies**:
- Use session scope for temporary subtask data
- Archive completed subtasks to separate tables
- Implement FTS5 for faster subtask lookup
- Cache frequent decomposition patterns

---

</details>

## Conversation History System

<details>
<summary><strong>Show details</strong></summary>

### Purpose and Use Cases

The conversation history system tracks multi-turn interactions between agents and users, enabling:

1. **Context Continuity** - "What did we discuss about authentication last week?"
2. **Learning** - "What memory entries are most useful in conversations?"
3. **Pattern Recognition** - "What topics come up frequently?"
4. **Debugging** - "Why did the agent give this answer? What context did it use?"
5. **Knowledge Extraction** - "What new insights can we extract from conversations?"

### Architecture Overview

The conversation system consists of three main tables:

1. **`conversations`** - Conversation threads with metadata
2. **`conversation_messages`** - Individual messages in conversations
3. **`conversation_context`** - Links between conversations and memory entries

### Integration with Query System

When using `memory_query` with a `conversationId`, query results are automatically linked to the conversation:

```typescript
// Query with auto-linking
await memory_query({
  search: "authentication",
  conversationId: "conv_123",
  messageId: "msg_456",  // Optional: link to specific message
  autoLinkContext: true   // Default: true if conversationId provided
});
```

This enables:
- Automatic tracking of which memory entries were used
- Relevance score preservation from query results
- Message-level context tracking

### Integration with Audit System

All conversation operations are logged to the audit log:
- `action: 'create'` for conversation start
- `action: 'update'` for messages and updates
- `action: 'read'` for queries and retrievals

### Performance Considerations

- **Indexes**: All foreign keys and common query paths are indexed
- **Pagination**: Messages support pagination for large conversations
- **JSON Storage**: Metadata stored as JSON (efficient for flexible data)
- **Search**: Full-text search across titles and message content

### Storage Considerations

- **Conversation Size**: No hard limits, but consider archiving old conversations
- **Message Count**: Typical conversations have 10-100 messages
- **Context Links**: Each conversation may link to 5-50 memory entries
- **Archiving**: Completed/archived conversations can be moved to separate storage

### Example Workflow

```typescript
// 1. Start conversation
const { conversation } = await memory_conversation.start({
  projectId: "proj_123",
  title: "Authentication Discussion"
});

// 2. Add user message
await memory_conversation.add_message({
  conversationId: conversation.id,
  role: "user",
  content: "What guidelines apply to authentication?"
});

// 3. Query memory (auto-links results)
await memory_query({
  search: "authentication",
  conversationId: conversation.id,
  types: ["guidelines"]
});

// 4. Add agent response
await memory_conversation.add_message({
  conversationId: conversation.id,
  role: "agent",
  content: "Based on the guidelines...",
  contextEntries: [...],  // From query results
  toolsUsed: ["memory_query", "memory_guideline"]
});

// 5. End conversation
await memory_conversation.end({
  id: conversation.id,
  generateSummary: true
});
```

---

</details>

## References

### Technical Documentation
- [MCP SDK Documentation](https://modelcontextprotocol.io)
- [Drizzle ORM Docs](https://orm.drizzle.team)
- [better-sqlite3 Docs](https://github.com/WiseLibs/better-sqlite3)
- [Vitest Docs](https://vitest.dev)

### Research & Academic Validation
- [MDAP Research Paper](https://arxiv.org/abs/2511.09030) - "Solving a Million-Step LLM Task with Zero Errors"
- [MDAP Support Guide](./reference/mdap-support.md) - Practical guide to using Agent Memory for large-scale workflows
