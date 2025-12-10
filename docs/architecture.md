# Agent Memory Database - Architecture

> **Version:** 0.1.0 (Implementation Phase)
> **Last Updated:** 2024-12-10
> **Status:** Milestone 3 Complete - MCP Server Implemented

## Overview

A structured memory backend for AI agents exposed via MCP. Agents query specific memory segments on-demand instead of loading entire knowledge bases into context.

### Key Design Principles

1. **Multi-agent concurrent access** - Multiple IDEs/agents can read/write simultaneously
2. **Hierarchical scoping** - Global → Organization → Project → Session
3. **Append-only versioning** - All changes are tracked, conflicts detected
4. **Cross-reference queries** - Find related entries across memory sections
5. **Token-budget aware** - Responses designed for minimal context consumption

---

## Technology Stack

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
│   │   ├── schema.ts           # Drizzle table definitions
│   │   ├── migrations/         # SQL migration files
│   │   ├── connection.ts       # Database connection
│   │   └── repositories/       # Data access layer
│   │       ├── tools.ts
│   │       ├── guidelines.ts
│   │       ├── knowledge.ts
│   │       ├── scopes.ts
│   │       └── tags.ts
│   ├── services/
│   │   ├── tools.service.ts    # Business logic
│   │   ├── guidelines.service.ts
│   │   ├── knowledge.service.ts
│   │   ├── query.service.ts    # Cross-reference search
│   │   └── conflict.service.ts # Conflict detection
│   ├── mcp/
│   │   ├── server.ts           # MCP server setup
│   │   ├── handlers/           # Tool handlers
│   │   │   ├── tools.handler.ts
│   │   │   ├── guidelines.handler.ts
│   │   │   ├── knowledge.handler.ts
│   │   │   ├── scopes.handler.ts
│   │   │   └── query.handler.ts
│   │   └── types.ts            # MCP type definitions
│   └── index.ts                # Entry point
├── data/
│   └── memory.db               # SQLite database
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── examples/
│   └── bootstrap-data.sql      # Sample data
├── docs/
│   └── architecture.md         # This document
├── drizzle.config.ts           # Drizzle configuration
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Configuration

Database location: `/data/memory.db`

```typescript
// src/db/connection.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const sqlite = new Database('./data/memory.db');
export const db = drizzle(sqlite);
```

---

## Database Schema

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

## Conflict Resolution System

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

## MCP Tool Interface

### Scope Management

| Tool | Description |
|------|-------------|
| `memory_org_create` | Create organization |
| `memory_org_list` | List organizations |
| `memory_project_create` | Create project in org |
| `memory_project_list` | List projects (optionally by org) |
| `memory_project_get` | Get project details with metadata |
| `memory_session_start` | Start a new session |
| `memory_session_end` | End session (complete or discard) |
| `memory_session_list` | List sessions for a project |

### Tool Registry

| Tool | Description |
|------|-------------|
| `memory_tool_add` | Add new tool definition |
| `memory_tool_update` | Update tool (creates new version) |
| `memory_tool_get` | Get tool by name (with scope inheritance) |
| `memory_tool_list` | List tools (filtered by scope, category, tags) |
| `memory_tool_history` | Get version history for a tool |
| `memory_tool_deactivate` | Soft-delete a tool |

### Guidelines

| Tool | Description |
|------|-------------|
| `memory_guideline_add` | Add new guideline |
| `memory_guideline_update` | Update guideline |
| `memory_guideline_get` | Get guideline by name |
| `memory_guideline_list` | List guidelines (with priority ordering) |
| `memory_guideline_history` | Get version history |
| `memory_guideline_deactivate` | Soft-delete |

### Knowledge

| Tool | Description |
|------|-------------|
| `memory_knowledge_add` | Add knowledge entry |
| `memory_knowledge_update` | Update entry |
| `memory_knowledge_get` | Get by title |
| `memory_knowledge_list` | List entries |
| `memory_knowledge_history` | Version history |
| `memory_knowledge_deactivate` | Soft-delete |

### Tags & Relations

| Tool | Description |
|------|-------------|
| `memory_tag_create` | Create new tag |
| `memory_tag_list` | List tags (predefined + custom) |
| `memory_tag_attach` | Attach tag to entry |
| `memory_tag_detach` | Remove tag from entry |
| `memory_relation_create` | Create relation between entries |
| `memory_relation_list` | List relations for an entry |
| `memory_relation_delete` | Remove relation |

### Cross-Reference Queries

| Tool | Description |
|------|-------------|
| `memory_query` | **Main query tool** - cross-reference search |
| `memory_context` | Get full context for current project/session |
| `memory_conflicts` | List unresolved conflicts |
| `memory_conflict_resolve` | Mark conflict as resolved |

---

## Query System

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

## Relevance Ranking

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

## Predefined Tags (Initial Set)

### Languages
`python`, `typescript`, `javascript`, `rust`, `go`, `java`, `sql`, `bash`, `markdown`

### Domains
`web`, `cli`, `api`, `database`, `ml`, `devops`, `security`, `testing`, `documentation`

### Categories
`code_style`, `architecture`, `behavior`, `performance`, `error_handling`, `logging`

### Meta
`deprecated`, `experimental`, `stable`, `required`, `optional`

---

## Session Modes

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

## Token Budget Awareness

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

## Migration Path: SQLite → PostgreSQL

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

## Implementation Roadmap

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

### Milestone 3: MCP Server ✅ (Current)
- [x] MCP server setup with @modelcontextprotocol/sdk
- [x] 35 MCP tool definitions
- [x] Scope handlers (org, project, session)
- [x] Tool handlers (add, update, get, list, history, deactivate)
- [x] Guideline handlers (add, update, get, list, history, deactivate)
- [x] Knowledge handlers (add, update, get, list, history, deactivate)
- [x] Tag handlers (create, list, attach, detach, forEntry)
- [x] Relation handlers (create, list, delete)
- [x] Main entry point and CLI support

### Milestone 4: Advanced Features
- [ ] Cross-reference query (`memory_query`)
- [ ] Conflict detection and resolution
- [ ] Session lifecycle management
- [ ] Scope inheritance in queries

### Milestone 5: Polish
- [ ] Integration tests
- [ ] Performance optimization
- [ ] Example workflows
- [ ] MCP client testing

---

## Design Decisions Log

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

## References

- [MCP SDK Documentation](https://modelcontextprotocol.io)
- [Drizzle ORM Docs](https://orm.drizzle.team)
- [better-sqlite3 Docs](https://github.com/WiseLibs/better-sqlite3)
- [Vitest Docs](https://vitest.dev)
