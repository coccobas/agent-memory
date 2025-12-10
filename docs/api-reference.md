# API Reference

Complete documentation for the 15 bundled MCP tools provided by Agent Memory (v0.3.0).

## Tool Bundling

Agent Memory uses action-based tool bundling to reduce LLM decision fatigue. Instead of 45+ individual tools, the server exposes 15 bundled tools with an `action` parameter to specify the operation.

**Benefits:**
- Reduced tool count for faster LLM decisions
- Consistent interface pattern across all tools
- Easier to discover related operations

## Table of Contents

- [memory_org](#memory_org) - Organization management
- [memory_project](#memory_project) - Project management
- [memory_session](#memory_session) - Session management
- [memory_tool](#memory_tool) - Tool registry
- [memory_guideline](#memory_guideline) - Guidelines
- [memory_knowledge](#memory_knowledge) - Knowledge entries
- [memory_tag](#memory_tag) - Tag management
- [memory_relation](#memory_relation) - Entry relations
- [memory_file_lock](#memory_file_lock) - File locks for multi-agent coordination
- [memory_query](#memory_query) - Cross-reference query and context
- [memory_conflict](#memory_conflict) - Conflict management
- [memory_health](#memory_health) - Health check and server status
- [memory_init](#memory_init) - Database initialization and migrations
- [memory_export](#memory_export) - Export entries to JSON/Markdown/YAML
- [memory_import](#memory_import) - Import entries from JSON

---

## memory_org

Manage organizations (top-level grouping).

**Actions:** `create`, `list`

### Action: create

Create a new organization.

```json
{
  "action": "create",
  "name": "My Company",
  "metadata": { "plan": "enterprise" }
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `create` |
| `name` | string | Yes | Organization name |
| `metadata` | object | No | Additional metadata |

**Response:**
```json
{
  "success": true,
  "organization": {
    "id": "org_abc123",
    "name": "My Company",
    "createdAt": "2024-12-10T10:00:00Z"
  }
}
```

### Action: list

List all organizations.

```json
{
  "action": "list",
  "limit": 20,
  "offset": 0
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `list` |
| `limit` | number | No | Max results (default: 50) |
| `offset` | number | No | Pagination offset |

---

## memory_project

Manage projects within organizations.

**Actions:** `create`, `list`, `get`, `update`

### Action: create

Create a new project.

```json
{
  "action": "create",
  "name": "My Project",
  "orgId": "org_abc123",
  "description": "A sample project",
  "rootPath": "/path/to/project",
  "metadata": { "goals": ["ship v1"] }
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `create` |
| `name` | string | Yes | Project name |
| `orgId` | string | No | Parent organization ID |
| `description` | string | No | Project description |
| `rootPath` | string | No | Filesystem path |
| `metadata` | object | No | Goals, constraints, state |

### Action: list

List projects, optionally filtered by organization.

```json
{
  "action": "list",
  "orgId": "org_abc123",
  "limit": 20
}
```

### Action: get

Get a project by ID or name.

```json
{
  "action": "get",
  "id": "proj_xyz789"
}
```

or by name:

```json
{
  "action": "get",
  "name": "My Project",
  "orgId": "org_abc123"
}
```

### Action: update

Update a project.

```json
{
  "action": "update",
  "id": "proj_xyz789",
  "description": "Updated description",
  "metadata": { "status": "active" }
}
```

---

## memory_session

Manage working sessions within projects.

**Actions:** `start`, `end`, `list`

### Action: start

Start a new working session.

```json
{
  "action": "start",
  "projectId": "proj_xyz789",
  "name": "Feature Development",
  "purpose": "Implement user authentication",
  "agentId": "claude-code-v1",
  "metadata": { "mode": "tdd" }
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `start` |
| `projectId` | string | No | Parent project ID |
| `name` | string | No | Session label |
| `purpose` | string | No | What this session is for |
| `agentId` | string | No | Which agent/IDE created it |
| `metadata` | object | No | Scratch notes, temp decisions |

### Action: end

End a session.

```json
{
  "action": "end",
  "id": "sess_def456",
  "status": "completed"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `end` |
| `id` | string | Yes | Session ID |
| `status` | string | No | Final status: `completed`, `discarded` |

### Action: list

List sessions for a project.

```json
{
  "action": "list",
  "projectId": "proj_xyz789",
  "status": "active"
}
```

---

## memory_tool

Manage tool definitions with versioning.

**Actions:** `add`, `update`, `get`, `list`, `history`, `deactivate`

### Action: add

Add a new tool definition.

```json
{
  "action": "add",
  "scopeType": "global",
  "name": "git_commit",
  "category": "cli",
  "description": "Commit staged changes to git",
  "parameters": {
    "message": { "type": "string", "required": true }
  },
  "examples": [{ "message": "feat: add login" }],
  "constraints": "Only commit when tests pass"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `add` |
| `scopeType` | string | Yes | `global`, `org`, `project`, `session` |
| `scopeId` | string | Conditional | Required unless `global` |
| `name` | string | Yes | Tool name (unique within scope) |
| `category` | string | No | `mcp`, `cli`, `function`, `api` |
| `description` | string | No | Tool description |
| `parameters` | object | No | Parameter schema |
| `examples` | array | No | Usage examples |
| `constraints` | string | No | Usage guidelines |
| `createdBy` | string | No | Creator identifier |

### Action: update

Update a tool (creates new version).

```json
{
  "action": "update",
  "id": "tool_abc123",
  "description": "Updated description",
  "changeReason": "Clarified usage"
}
```

### Action: get

Get a tool by ID or name.

```json
{
  "action": "get",
  "name": "git_commit",
  "scopeType": "global",
  "inherit": true
}
```

**Scope Inheritance:** When `inherit: true`, searches current scope then parent scopes up to global.

### Action: list

List tools with filtering.

```json
{
  "action": "list",
  "scopeType": "project",
  "scopeId": "proj_xyz789",
  "category": "cli"
}
```

### Action: history

Get version history for a tool.

```json
{
  "action": "history",
  "id": "tool_abc123"
}
```

### Action: deactivate

Soft-delete a tool (preserves history).

```json
{
  "action": "deactivate",
  "id": "tool_abc123"
}
```

---

## memory_guideline

Manage behavioral guidelines with versioning.

**Actions:** `add`, `update`, `get`, `list`, `history`, `deactivate`

### Action: add

Add a new guideline.

```json
{
  "action": "add",
  "scopeType": "global",
  "name": "error-handling",
  "category": "code_style",
  "priority": 80,
  "content": "Always use try-catch for async operations",
  "rationale": "Prevents unhandled promise rejections",
  "examples": {
    "good": ["try { await fetch() } catch (e) { ... }"],
    "bad": ["await fetch()"]
  }
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `add` |
| `scopeType` | string | Yes | `global`, `org`, `project`, `session` |
| `scopeId` | string | Conditional | Required unless `global` |
| `name` | string | Yes | Guideline name |
| `category` | string | No | `code_style`, `behavior`, `security`, etc. |
| `priority` | number | No | 0-100, higher = more important (default: 50) |
| `content` | string | Yes | The guideline text |
| `rationale` | string | No | Why this guideline exists |
| `examples` | object | No | `{ good: [...], bad: [...] }` |
| `createdBy` | string | No | Creator identifier |

### Action: update

Update a guideline (creates new version).

```json
{
  "action": "update",
  "id": "gl_abc123",
  "priority": 90,
  "changeReason": "Elevated priority after incident"
}
```

### Action: get

Get a guideline by ID or name.

```json
{
  "action": "get",
  "name": "error-handling",
  "scopeType": "global"
}
```

### Action: list

List guidelines (ordered by priority).

```json
{
  "action": "list",
  "scopeType": "project",
  "scopeId": "proj_xyz789",
  "category": "security"
}
```

### Action: history

Get version history.

```json
{
  "action": "history",
  "id": "gl_abc123"
}
```

### Action: deactivate

Soft-delete a guideline.

```json
{
  "action": "deactivate",
  "id": "gl_abc123"
}
```

---

## memory_knowledge

Manage knowledge entries (facts, decisions, context) with versioning.

**Actions:** `add`, `update`, `get`, `list`, `history`, `deactivate`

### Action: add

Add a new knowledge entry.

```json
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj_xyz789",
  "title": "API Rate Limits",
  "category": "fact",
  "content": "The API allows 1000 requests per minute",
  "source": "API documentation",
  "confidence": 1.0,
  "validUntil": "2025-12-31T23:59:59Z"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `add` |
| `scopeType` | string | Yes | `global`, `org`, `project`, `session` |
| `scopeId` | string | Conditional | Required unless `global` |
| `title` | string | Yes | Entry title |
| `category` | string | No | `decision`, `fact`, `context`, `reference` |
| `content` | string | Yes | The knowledge content |
| `source` | string | No | Where this knowledge came from |
| `confidence` | number | No | 0-1, how certain (default: 1.0) |
| `validUntil` | string | No | Expiration timestamp (ISO 8601) |
| `createdBy` | string | No | Creator identifier |

### Action: update

Update a knowledge entry (creates new version).

```json
{
  "action": "update",
  "id": "kn_abc123",
  "content": "Updated rate limit: 2000 requests per minute",
  "changeReason": "API was upgraded"
}
```

### Action: get

Get a knowledge entry by ID or title.

```json
{
  "action": "get",
  "title": "API Rate Limits",
  "scopeType": "project",
  "scopeId": "proj_xyz789"
}
```

### Action: list

List knowledge entries.

```json
{
  "action": "list",
  "scopeType": "project",
  "scopeId": "proj_xyz789",
  "category": "decision"
}
```

### Action: history

Get version history.

```json
{
  "action": "history",
  "id": "kn_abc123"
}
```

### Action: deactivate

Soft-delete a knowledge entry.

```json
{
  "action": "deactivate",
  "id": "kn_abc123"
}
```

---

## memory_tag

Manage tags for categorizing entries.

**Actions:** `create`, `list`, `attach`, `detach`, `for_entry`

### Action: create

Create a new tag.

```json
{
  "action": "create",
  "name": "python",
  "category": "language",
  "description": "Python programming language"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `create` |
| `name` | string | Yes | Tag name (unique) |
| `category` | string | No | `language`, `domain`, `category`, `meta`, `custom` |
| `description` | string | No | Tag description |

**Note:** If a tag already exists, returns the existing tag with `existed: true`.

### Action: list

List all tags.

```json
{
  "action": "list",
  "category": "language",
  "isPredefined": true
}
```

### Action: attach

Attach a tag to an entry.

```json
{
  "action": "attach",
  "entryType": "guideline",
  "entryId": "gl_xyz789",
  "tagName": "python"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `attach` |
| `entryType` | string | Yes | `tool`, `guideline`, `knowledge`, `project` |
| `entryId` | string | Yes | Entry ID |
| `tagId` | string | Conditional | Tag ID (use this OR tagName) |
| `tagName` | string | Conditional | Tag name (creates if doesn't exist) |

### Action: detach

Remove a tag from an entry.

```json
{
  "action": "detach",
  "entryType": "guideline",
  "entryId": "gl_xyz789",
  "tagId": "tag_python"
}
```

### Action: for_entry

Get all tags for an entry.

```json
{
  "action": "for_entry",
  "entryType": "guideline",
  "entryId": "gl_xyz789"
}
```

---

## memory_relation

Create explicit links between entries.

**Actions:** `create`, `list`, `delete`

### Action: create

Create a relation between two entries.

```json
{
  "action": "create",
  "sourceType": "guideline",
  "sourceId": "gl_xyz",
  "targetType": "project",
  "targetId": "proj_abc",
  "relationType": "applies_to"
}
```

**Relation Types:**
- `applies_to` - Guideline/tool applies to a project
- `depends_on` - Entry depends on another
- `conflicts_with` - Entries are mutually exclusive
- `related_to` - General association

### Action: list

List relations.

```json
{
  "action": "list",
  "sourceType": "guideline",
  "sourceId": "gl_xyz"
}
```

### Action: delete

Delete a relation.

```json
{
  "action": "delete",
  "id": "rel_abc123"
}
```

or by fields:

```json
{
  "action": "delete",
  "sourceType": "guideline",
  "sourceId": "gl_xyz",
  "targetType": "project",
  "targetId": "proj_abc",
  "relationType": "applies_to"
}
```

---

## memory_file_lock

Manage file locks for multi-agent coordination.

**Actions:** `checkout`, `checkin`, `status`, `list`, `force_unlock`

### Action: checkout

Lock a file for exclusive write access.

```json
{
  "action": "checkout",
  "file_path": "/path/to/file.ts",
  "agent_id": "claude-code-1",
  "session_id": "sess_abc123",
  "project_id": "proj_xyz789",
  "expires_in": 3600,
  "metadata": { "reason": "refactoring" }
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `checkout` |
| `file_path` | string | Yes | Absolute filesystem path |
| `agent_id` | string | Yes | Agent/IDE identifier |
| `session_id` | string | No | Session reference |
| `project_id` | string | No | Project reference |
| `expires_in` | number | No | Lock timeout in seconds (default: 3600) |
| `metadata` | object | No | Additional metadata |

### Action: checkin

Release a file lock.

```json
{
  "action": "checkin",
  "file_path": "/path/to/file.ts",
  "agent_id": "claude-code-1"
}
```

### Action: status

Check if a file is locked.

```json
{
  "action": "status",
  "file_path": "/path/to/file.ts"
}
```

**Response:**
```json
{
  "success": true,
  "isLocked": true,
  "lock": {
    "filePath": "/path/to/file.ts",
    "checkedOutBy": "claude-code-1",
    "checkedOutAt": "2024-12-10T10:00:00Z",
    "expiresAt": "2024-12-10T11:00:00Z"
  }
}
```

### Action: list

List active file locks.

```json
{
  "action": "list",
  "project_id": "proj_xyz789",
  "agent_id": "claude-code-1"
}
```

### Action: force_unlock

Force unlock a file (admin operation).

```json
{
  "action": "force_unlock",
  "file_path": "/path/to/file.ts",
  "agent_id": "admin-agent",
  "reason": "Agent crashed, releasing lock"
}
```

---

## memory_query

Cross-reference search and context aggregation.

**Actions:** `search`, `context`

### Action: search

Cross-reference search across tools, guidelines, and knowledge.

```json
{
  "action": "search",
  "types": ["tools", "guidelines", "knowledge"],
  "scope": {
    "type": "project",
    "id": "proj_xyz789",
    "inherit": true
  },
  "tags": {
    "include": ["python"],
    "require": ["security"],
    "exclude": ["deprecated"]
  },
  "search": "authentication",
  "relatedTo": {
    "type": "project",
    "id": "proj_xyz789",
    "relation": "applies_to"
  },
  "limit": 20,
  "compact": false
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `search` |
| `types` | string[] | No | `tools`, `guidelines`, `knowledge` |
| `scope.type` | string | No | `global`, `org`, `project`, `session` |
| `scope.id` | string | Conditional | Scope ID (required for non-global) |
| `scope.inherit` | boolean | No | Include parent scopes (default: true) |
| `tags.include` | string[] | No | Entries should have ANY of these |
| `tags.require` | string[] | No | Entries must have ALL of these |
| `tags.exclude` | string[] | No | Entries must NOT have these |
| `search` | string | No | Free-text search |
| `relatedTo.type` | string | No | Related entry type |
| `relatedTo.id` | string | No | Related entry ID |
| `relatedTo.relation` | string | No | Relation type |
| `limit` | number | No | Max results (default: 20) |
| `includeVersions` | boolean | No | Include version history |
| `includeInactive` | boolean | No | Include deactivated entries |
| `compact` | boolean | No | Return compact results |
| `semanticSearch` | boolean | No | Enable semantic/vector search (default: true if embeddings available) |
| `semanticThreshold` | number | No | Minimum similarity score 0-1 (default: 0.7) |

**Response:**
```json
{
  "results": [
    {
      "type": "guideline",
      "id": "gl_abc123",
      "scopeType": "global",
      "score": 9.5,
      "tags": [{ "id": "tag_security", "name": "security" }],
      "guideline": {
        "id": "gl_abc123",
        "name": "parameterized_sql",
        "priority": 95
      }
    }
  ],
  "meta": {
    "totalCount": 12,
    "returnedCount": 1,
    "truncated": false,
    "hasMore": true
  }
}
```

### Action: context

Get aggregated context for a scope.

```json
{
  "action": "context",
  "scopeType": "project",
  "scopeId": "proj_xyz789",
  "inherit": true,
  "compact": false,
  "limit": 10
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `context` |
| `scopeType` | string | Yes | `global`, `org`, `project`, `session` |
| `scopeId` | string | Conditional | Required for non-global scopes |
| `inherit` | boolean | No | Include parent scopes (default: true) |
| `compact` | boolean | No | Return compact entries |
| `limit` | number | No | Max results per type |

**Response:**
```json
{
  "scope": { "type": "project", "id": "proj_xyz789" },
  "tools": [...],
  "guidelines": [...],
  "knowledge": [...],
  "meta": {
    "totalCount": 25,
    "returnedCount": 25,
    "truncated": false,
    "hasMore": false
  }
}
```

---

## memory_conflict

Manage version conflicts.

**Actions:** `list`, `resolve`

### Action: list

List conflicts (default: unresolved only).

```json
{
  "action": "list",
  "entryType": "tool",
  "resolved": false,
  "limit": 20
}
```

**Response:**
```json
{
  "conflicts": [
    {
      "id": "conf_abc123",
      "entryType": "tool",
      "entryId": "tool-git-commit",
      "versionAId": "tv-v1",
      "versionBId": "tv-v2",
      "detectedAt": "2024-12-10T12:00:00Z",
      "resolved": false
    }
  ],
  "meta": { "returnedCount": 1 }
}
```

### Action: resolve

Mark a conflict as resolved.

```json
{
  "action": "resolve",
  "id": "conf_abc123",
  "resolution": "Kept version tv-v2 as canonical",
  "resolvedBy": "maintainer"
}
```

---

## Error Handling

All tools return errors in a consistent format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common error scenarios:
- Missing required `action` parameter
- Unknown action for a tool
- Missing required parameters for the action
- Entry not found
- Duplicate entry (unique constraint violated)
- Invalid scope configuration
- File already locked (for file lock operations)

---

## memory_health

Check server health and database status.

This tool has no parameters and returns server version, database stats, and cache information.

**Example:**
```json
{
  "name": "memory_health"
}
```

**Response:**
```json
{
  "serverVersion": "0.3.0",
  "status": "healthy",
  "database": {
    "type": "SQLite",
    "inMemory": false,
    "walEnabled": true
  },
  "cache": {
    "enabled": true,
    "size": 42,
    "hits": 1234,
    "misses": 567
  },
  "tables": {
    "organizations": 2,
    "projects": 5,
    "sessions": 10,
    "tools": 45,
    "guidelines": 32,
    "knowledge": 28,
    "tags": 18,
    "fileLocks": 0,
    "conflicts": 0
  }
}
```

---

## memory_export

Export memory entries to JSON, Markdown, or YAML formats for backup, documentation, or migration.

**Actions:** `export`

### Action: export

Export entries with optional filtering.

```json
{
  "action": "export",
  "types": ["tools", "guidelines"],
  "scopeType": "project",
  "scopeId": "proj_123",
  "format": "json",
  "includeVersions": true
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `export` |
| `types` | array | No | Entry types to export: `tools`, `guidelines`, `knowledge` (default: all) |
| `scopeType` | string | No | Filter by scope type: `global`, `org`, `project`, `session` |
| `scopeId` | string | No | Filter by scope ID |
| `tags` | array | No | Filter by tags (entries must have any of these tags) |
| `format` | string | No | Export format: `json`, `markdown`, or `yaml` (default: json) |
| `includeVersions` | boolean | No | Include full version history (default: false) |
| `includeInactive` | boolean | No | Include inactive entries (default: false) |

**Response:**
```json
{
  "success": true,
  "format": "json",
  "content": "{\"version\":\"1.0\",\"exportedAt\":\"2024-12-10T...\",\"entries\":{...}}",
  "metadata": {
    "exportedAt": "2024-12-10T21:52:00.000Z",
    "entryCount": 25,
    "types": ["tools", "guidelines"],
    "scopeType": "project",
    "scopeId": "proj_123"
  }
}
```

**Export Formats:**

- **JSON:** Full structured data with all metadata, tags, relations, and optionally version history
- **Markdown:** Human-readable documentation format with headings and formatting
- **YAML:** Structured, readable format (export only)

**Use Cases:**
- Backup knowledge bases to Git repositories
- Generate documentation from memory entries
- Share knowledge between projects or teams
- Archive project-specific guidelines

---

## memory_import

Import memory entries from JSON format with intelligent conflict resolution.

**Actions:** `import`

### Action: import

Import entries with configurable conflict handling.

```json
{
  "action": "import",
  "content": "{\"version\":\"1.0\",\"entries\":{...}}",
  "format": "json",
  "conflictStrategy": "update",
  "importedBy": "admin-user"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `import` |
| `content` | string | Yes | Content to import (JSON string from export) |
| `format` | string | No | Import format: `json` (default: json) |
| `conflictStrategy` | string | No | Conflict resolution: `skip`, `update`, `replace`, `error` (default: update) |
| `scopeMapping` | object | No | Map old scopes to new: `{"global:": {"type": "project", "id": "proj_123"}}` |
| `generateNewIds` | boolean | No | Generate new IDs for imported entries (default: false) |
| `importedBy` | string | No | User/agent performing the import |

**Conflict Strategies:**
- **`update`** - Update existing entries, create new ones (default, safest for merging)
- **`skip`** - Skip existing entries, only create new ones (preserves existing)
- **`replace`** - Replace existing entries completely (overwrites)
- **`error`** - Throw error if any entry already exists (strict, no modifications)

**Response:**
```json
{
  "success": true,
  "created": 15,
  "updated": 10,
  "skipped": 0,
  "errors": [],
  "details": {
    "tools": { "created": 5, "updated": 3, "skipped": 0 },
    "guidelines": { "created": 7, "updated": 5, "skipped": 0 },
    "knowledge": { "created": 3, "updated": 2, "skipped": 0 }
  }
}
```

**Scope Mapping Example:**

When importing entries from one project to another:

```json
{
  "action": "import",
  "content": "...",
  "scopeMapping": {
    "project:old-proj-id": {
      "type": "project",
      "id": "new-proj-id"
    }
  }
}
```

**Notes:**
- Currently only JSON import is fully supported
- YAML and Markdown import will return an error (export-only formats)
- Tags are automatically created if they don't exist
- Relations are preserved when IDs match
- Use `conflictStrategy: "error"` for dry-run validation

---

## memory_init

Manage database initialization and migrations.

**Actions:** `init`, `status`, `reset`

### Action: init

Initialize the database or apply pending migrations.

```json
{
  "action": "init",
  "force": false,
  "verbose": false
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `init` |
| `force` | boolean | No | Force re-initialization even if already initialized |
| `verbose` | boolean | No | Enable verbose output |

**Response:**
```json
{
  "success": true,
  "initialized": true,
  "migrationsApplied": ["0000_lying_the_hand", "0001_add_file_locks"],
  "totalMigrations": 2,
  "pendingMigrations": []
}
```

### Action: status

Check database initialization status.

```json
{
  "action": "status"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `status` |

**Response:**
```json
{
  "initialized": true,
  "totalMigrations": 2,
  "appliedMigrations": ["0000_lying_the_hand", "0001_add_file_locks"],
  "pendingMigrations": []
}
```

### Action: reset

**WARNING:** This will delete all data in the database. Use with extreme caution.

Reset the database by dropping all tables and re-initializing.

```json
{
  "action": "reset",
  "confirm": true,
  "verbose": false
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `reset` |
| `confirm` | boolean | Yes | Must be `true` to confirm reset |
| `verbose` | boolean | No | Enable verbose output |

**Response:**
```json
{
  "success": true,
  "message": "Database reset successfully"
}
```

---

## Migration from v0.1.0

If you were using the individual tools (v0.1.0), here's how to migrate:

| Old Tool | New Tool + Action |
|----------|-------------------|
| `memory_org_create` | `memory_org` + `action: "create"` |
| `memory_org_list` | `memory_org` + `action: "list"` |
| `memory_project_create` | `memory_project` + `action: "create"` |
| `memory_project_list` | `memory_project` + `action: "list"` |
| `memory_project_get` | `memory_project` + `action: "get"` |
| `memory_project_update` | `memory_project` + `action: "update"` |
| `memory_session_start` | `memory_session` + `action: "start"` |
| `memory_session_end` | `memory_session` + `action: "end"` |
| `memory_session_list` | `memory_session` + `action: "list"` |
| `memory_tool_add` | `memory_tool` + `action: "add"` |
| `memory_tool_update` | `memory_tool` + `action: "update"` |
| `memory_tool_get` | `memory_tool` + `action: "get"` |
| `memory_tool_list` | `memory_tool` + `action: "list"` |
| `memory_tool_history` | `memory_tool` + `action: "history"` |
| `memory_tool_deactivate` | `memory_tool` + `action: "deactivate"` |
| `memory_guideline_*` | `memory_guideline` + corresponding action |
| `memory_knowledge_*` | `memory_knowledge` + corresponding action |
| `memory_tag_create` | `memory_tag` + `action: "create"` |
| `memory_tag_list` | `memory_tag` + `action: "list"` |
| `memory_tag_attach` | `memory_tag` + `action: "attach"` |
| `memory_tag_detach` | `memory_tag` + `action: "detach"` |
| `memory_tags_for_entry` | `memory_tag` + `action: "for_entry"` |
| `memory_relation_create` | `memory_relation` + `action: "create"` |
| `memory_relation_list` | `memory_relation` + `action: "list"` |
| `memory_relation_delete` | `memory_relation` + `action: "delete"` |
| `memory_file_checkout` | `memory_file_lock` + `action: "checkout"` |
| `memory_file_checkin` | `memory_file_lock` + `action: "checkin"` |
| `memory_file_lock_status` | `memory_file_lock` + `action: "status"` |
| `memory_file_lock_list` | `memory_file_lock` + `action: "list"` |
| `memory_file_lock_force_unlock` | `memory_file_lock` + `action: "force_unlock"` |
| `memory_query` | `memory_query` + `action: "search"` |
| `memory_context` | `memory_query` + `action: "context"` |
| `memory_conflicts` | `memory_conflict` + `action: "list"` |
| `memory_conflict_resolve` | `memory_conflict` + `action: "resolve"` |
