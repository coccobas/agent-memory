# API Reference

Complete documentation for the 19 bundled MCP tools provided by Agent Memory (v0.8.3).

## Tool Bundling

Agent Memory uses action-based tool bundling to reduce LLM decision fatigue. Instead of 45+ individual tools, the server exposes 19 bundled tools with an `action` parameter to specify the operation.

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
- [memory_conversation](#memory_conversation) - Conversation history
- [memory_task](#memory_task) - Task decomposition
- [memory_voting](#memory_voting) - Multi-agent voting and consensus
- [memory_analytics](#memory_analytics) - Usage analytics and trends
- [memory_permission](#memory_permission) - Permission management
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

**Actions:** `add`, `update`, `get`, `list`, `history`, `deactivate`, `bulk_add`, `bulk_update`, `bulk_delete`

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

### Action: bulk_add

Add multiple tools in a single transaction.

```json
{
  "action": "bulk_add",
  "entries": [
    {
      "scopeType": "global",
      "name": "tool1",
      "category": "cli",
      "description": "First tool"
    },
    {
      "scopeType": "global",
      "name": "tool2",
      "category": "cli",
      "description": "Second tool"
    }
  ]
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `bulk_add` |
| `entries` | array | Yes | Array of tool entries (same structure as `add` action) |

**Response:**
```json
{
  "success": true,
  "tools": [...],
  "count": 2
}
```

### Action: bulk_update

Update multiple tools in a single transaction.

```json
{
  "action": "bulk_update",
  "updates": [
    {
      "id": "tool_abc123",
      "description": "Updated description 1"
    },
    {
      "id": "tool_xyz789",
      "description": "Updated description 2"
    }
  ]
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `bulk_update` |
| `updates` | array | Yes | Array of update objects with `id` and update fields |

### Action: bulk_delete

Deactivate multiple tools in a single transaction.

```json
{
  "action": "bulk_delete",
  "ids": ["tool_abc123", "tool_xyz789"]
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `bulk_delete` |
| `ids` | array | Yes | Array of tool IDs to deactivate |

**Response:**
```json
{
  "success": true,
  "deleted": [
    { "id": "tool_abc123", "success": true },
    { "id": "tool_xyz789", "success": true }
  ],
  "count": 2
}
```

---

## memory_guideline

Manage behavioral guidelines with versioning.

**Actions:** `add`, `update`, `get`, `list`, `history`, `deactivate`, `bulk_add`, `bulk_update`, `bulk_delete`

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

### Action: bulk_add

Add multiple guidelines in a single transaction. Same structure as `bulk_add` for tools.

### Action: bulk_update

Update multiple guidelines in a single transaction. Same structure as `bulk_update` for tools.

### Action: bulk_delete

Deactivate multiple guidelines in a single transaction. Same structure as `bulk_delete` for tools.

---

## memory_knowledge

Manage knowledge entries (facts, decisions, context) with versioning.

**Actions:** `add`, `update`, `get`, `list`, `history`, `deactivate`, `bulk_add`, `bulk_update`, `bulk_delete`

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

### Action: bulk_add

Add multiple knowledge entries in a single transaction. Same structure as `bulk_add` for tools.

### Action: bulk_update

Update multiple knowledge entries in a single transaction. Same structure as `bulk_update` for tools.

### Action: bulk_delete

Deactivate multiple knowledge entries in a single transaction. Same structure as `bulk_delete` for tools.

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
- `parent_task` - Source is parent task of target (for task decomposition)
- `subtask_of` - Source is subtask of target (inverse of parent_task)

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

## memory_permission

Manage fine-grained permissions for agents.

**Actions:** `grant`, `revoke`, `check`, `list`

### Action: grant

Grant a permission to an agent.

```json
{
  "action": "grant",
  "agent_id": "agent_123",
  "scope_type": "project",
  "scope_id": "proj_xyz789",
  "entry_type": "tool",
  "permission": "write",
  "created_by": "admin_001"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `grant` |
| `agent_id` | string | Yes | Agent identifier |
| `scope_type` | string | No | `global`, `org`, `project`, `session` |
| `scope_id` | string | No | Scope ID (required for non-global scopes) |
| `entry_type` | string | No | `tool`, `guideline`, `knowledge` |
| `permission` | string | Yes | `read`, `write`, `admin` |
| `created_by` | string | No | Creator identifier |

**Response:**
```json
{
  "permission": {
    "id": "perm_abc123",
    "agentId": "agent_123",
    "scopeType": "project",
    "scopeId": "proj_xyz789",
    "entryType": "tool",
    "permission": "write"
  },
  "message": "Permission granted successfully"
}
```

### Action: revoke

Revoke a permission from an agent.

```json
{
  "action": "revoke",
  "agent_id": "agent_123",
  "scope_type": "project",
  "scope_id": "proj_xyz789",
  "entry_type": "tool"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `revoke` |
| `agent_id` | string | Yes | Agent identifier |
| `scope_type` | string | No | Scope type to revoke |
| `scope_id` | string | No | Scope ID to revoke |
| `entry_type` | string | No | Entry type to revoke |
| `permission_id` | string | No | Specific permission ID to revoke |

**Response:**
```json
{
  "message": "Permission revoked successfully"
}
```

### Action: check

Check if an agent has permission to perform an action.

```json
{
  "action": "check",
  "agent_id": "agent_123",
  "action": "write",
  "scope_type": "project",
  "scope_id": "proj_xyz789",
  "entry_type": "tool"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `check` |
| `agent_id` | string | Yes | Agent identifier |
| `action` | string | Yes | Permission action: `read` or `write` |
| `scope_type` | string | Yes | Scope type |
| `scope_id` | string | No | Scope ID |
| `entry_type` | string | No | Entry type |

**Response:**
```json
{
  "has_permission": true,
  "agent_id": "agent_123",
  "action": "write",
  "scope_type": "project",
  "scope_id": "proj_xyz789",
  "entry_type": "tool"
}
```

### Action: list

List all permissions, optionally filtered.

```json
{
  "action": "list",
  "agent_id": "agent_123",
  "scope_type": "project",
  "limit": 20,
  "offset": 0
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `list` |
| `agent_id` | string | No | Filter by agent |
| `scope_type` | string | No | Filter by scope type |
| `scope_id` | string | No | Filter by scope ID |
| `entry_type` | string | No | Filter by entry type |
| `limit` | number | No | Max results |
| `offset` | number | No | Pagination offset |

**Response:**
```json
{
  "permissions": [
    {
      "id": "perm_abc123",
      "agentId": "agent_123",
      "scopeType": "project",
      "scopeId": "proj_xyz789",
      "entryType": "tool",
      "entryId": null,
      "permission": "write"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

## memory_query

Cross-reference search and context aggregation.

**Actions:** `search`, `context`

### Action: search

Cross-reference search across tools, guidelines, and knowledge.

**Basic Search:**
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
| `useFts5` | boolean | No | Use FTS5 full-text search instead of LIKE queries (default: false) |
| `fields` | string[] | No | Field-specific search: `["name", "description"]` (only with FTS5) |
| `fuzzy` | boolean | No | Enable typo tolerance (Levenshtein distance) |
| `regex` | boolean | No | Use regex instead of simple match |
| `createdAfter` | string | No | Filter by creation date (ISO timestamp) |
| `createdBefore` | string | No | Filter by creation date (ISO timestamp) |
| `updatedAfter` | string | No | Filter by update date (ISO timestamp) |
| `updatedBefore` | string | No | Filter by update date (ISO timestamp) |
| `priority.min` | number | No | Filter guidelines by minimum priority (0-100) |
| `priority.max` | number | No | Filter guidelines by maximum priority (0-100) |
| `semanticSearch` | boolean | No | Enable semantic/vector search (default: true if embeddings available) |
| `semanticThreshold` | number | No | Minimum similarity score 0-1 (default: 0.7) |

**FTS5 Full-Text Search:**

FTS5 provides better search capabilities than simple LIKE queries:

- **Relevance ranking** - Results ranked by BM25 relevance score
- **Phrase matching** - Use quotes: `"exact phrase"`
- **Prefix matching** - Use asterisk: `auth*` matches "authentication", "authorization"
- **Boolean operators** - Use AND, OR, NOT: `auth AND security`

Example with FTS5:
```json
{
  "action": "search",
  "types": ["tools", "guidelines"],
  "search": "authentication OR auth",
  "useFts5": true,
  "fields": ["name", "description"],
  "limit": 20
}
```

**Advanced Filtering:**

Example with date ranges and priority:
```json
{
  "action": "search",
  "types": ["guidelines"],
  "createdAfter": "2024-01-01T00:00:00Z",
  "priority": { "min": 70, "max": 100 },
  "fuzzy": true,
  "limit": 20
}
```

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

## memory_conversation

Manage conversation history for tracking agent-user and agent-agent interactions.

**Actions:** `start`, `add_message`, `get`, `list`, `update`, `link_context`, `get_context`, `search`, `end`, `archive`

### Action: start

Start a new conversation thread.

```json
{
  "action": "start",
  "projectId": "proj_xyz789",
  "agentId": "agent-1",
  "title": "Authentication Discussion",
  "metadata": { "tags": ["auth", "security"] }
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `start` |
| `sessionId` | string | No | Session ID (either sessionId or projectId required) |
| `projectId` | string | No | Project ID (either sessionId or projectId required) |
| `agentId` | string | No | Agent identifier |
| `title` | string | No | Conversation title |
| `metadata` | object | No | Additional metadata |

**Response:**
```json
{
  "success": true,
  "conversation": {
    "id": "conv_abc123",
    "projectId": "proj_xyz789",
    "agentId": "agent-1",
    "title": "Authentication Discussion",
    "status": "active",
    "startedAt": "2024-12-10T10:00:00Z"
  }
}
```

### Action: add_message

Add a message to a conversation.

```json
{
  "action": "add_message",
  "conversationId": "conv_abc123",
  "role": "user",
  "content": "What guidelines apply to authentication?",
  "contextEntries": [
    { "type": "guideline", "id": "guideline_123" }
  ],
  "toolsUsed": ["memory_query", "memory_guideline"]
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `add_message` |
| `conversationId` | string | Yes | Conversation ID |
| `role` | string | Yes | `user`, `agent`, or `system` |
| `content` | string | Yes | Message content |
| `contextEntries` | array | No | Memory entries used: `[{type: "tool"|"guideline"|"knowledge", id: string}]` |
| `toolsUsed` | array | No | Tools invoked: `["memory_query", ...]` |
| `metadata` | object | No | Additional metadata (tokens, model, etc.) |
| `agentId` | string | No | Agent identifier for permissions |

**Response:**
```json
{
  "success": true,
  "message": {
    "id": "msg_abc123",
    "conversationId": "conv_abc123",
    "role": "user",
    "content": "What guidelines apply to authentication?",
    "messageIndex": 0,
    "contextEntries": [...],
    "toolsUsed": ["memory_query"],
    "createdAt": "2024-12-10T10:01:00Z"
  }
}
```

### Action: get

Get a conversation with optional messages and context.

```json
{
  "action": "get",
  "id": "conv_abc123",
  "includeMessages": true,
  "includeContext": true
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `get` |
| `id` | string | Yes | Conversation ID |
| `includeMessages` | boolean | No | Include all messages (default: false) |
| `includeContext` | boolean | No | Include context links (default: false) |
| `agentId` | string | No | Agent identifier for permissions |

**Response:**
```json
{
  "success": true,
  "conversation": {
    "id": "conv_abc123",
    "title": "Authentication Discussion",
    "status": "active",
    "messages": [
      {
        "id": "msg_1",
        "role": "user",
        "content": "What guidelines apply?",
        "messageIndex": 0
      },
      {
        "id": "msg_2",
        "role": "agent",
        "content": "Based on the guidelines...",
        "messageIndex": 1
      }
    ],
    "context": [
      {
        "id": "ctx_1",
        "entryType": "guideline",
        "entryId": "guideline_123",
        "relevanceScore": 0.95
      }
    ]
  }
}
```

### Action: list

List conversations with filtering.

```json
{
  "action": "list",
  "projectId": "proj_xyz789",
  "status": "active",
  "limit": 20,
  "offset": 0
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `list` |
| `sessionId` | string | No | Filter by session ID |
| `projectId` | string | No | Filter by project ID |
| `agentId` | string | No | Filter by agent ID |
| `status` | string | No | Filter by status: `active`, `completed`, `archived` |
| `limit` | number | No | Max results (default: 20) |
| `offset` | number | No | Pagination offset |
| `agentId` | string | No | Agent identifier for permissions |

**Response:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "conv_abc123",
      "title": "Authentication Discussion",
      "status": "active",
      "startedAt": "2024-12-10T10:00:00Z"
    }
  ],
  "meta": {
    "totalCount": 1,
    "returnedCount": 1,
    "truncated": false,
    "hasMore": false
  }
}
```

### Action: update

Update conversation metadata.

```json
{
  "action": "update",
  "id": "conv_abc123",
  "title": "Updated Title",
  "status": "completed"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `update` |
| `id` | string | Yes | Conversation ID |
| `title` | string | No | New title |
| `status` | string | No | New status: `active`, `completed`, `archived` |
| `metadata` | object | No | Updated metadata |
| `agentId` | string | No | Agent identifier for permissions |

**Response:**
```json
{
  "success": true,
  "conversation": {
    "id": "conv_abc123",
    "title": "Updated Title",
    "status": "completed",
    "endedAt": "2024-12-10T11:00:00Z"
  }
}
```

### Action: link_context

Link a memory entry to a conversation or message.

```json
{
  "action": "link_context",
  "conversationId": "conv_abc123",
  "messageId": "msg_abc123",
  "entryType": "guideline",
  "entryId": "guideline_123",
  "relevanceScore": 0.95
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `link_context` |
| `conversationId` | string | Yes | Conversation ID |
| `messageId` | string | No | Message ID (to link to specific message) |
| `entryType` | string | Yes | `tool`, `guideline`, or `knowledge` |
| `entryId` | string | Yes | Entry ID |
| `relevanceScore` | number | No | Relevance score 0-1 |
| `agentId` | string | No | Agent identifier for permissions |

**Response:**
```json
{
  "success": true,
  "context": {
    "id": "ctx_abc123",
    "conversationId": "conv_abc123",
    "messageId": "msg_abc123",
    "entryType": "guideline",
    "entryId": "guideline_123",
    "relevanceScore": 0.95,
    "createdAt": "2024-12-10T10:02:00Z"
  }
}
```

### Action: get_context

Get context links for an entry or conversation.

```json
{
  "action": "get_context",
  "entryType": "guideline",
  "entryId": "guideline_123"
}
```

Or get context for a conversation:

```json
{
  "action": "get_context",
  "conversationId": "conv_abc123"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `get_context` |
| `conversationId` | string | No | Get context for conversation (either conversationId OR entryType+entryId required) |
| `entryType` | string | No | Get conversations using entry (either conversationId OR entryType+entryId required) |
| `entryId` | string | No | Entry ID |
| `agentId` | string | No | Agent identifier for permissions |

**Response:**
```json
{
  "success": true,
  "contexts": [
    {
      "id": "ctx_abc123",
      "conversationId": "conv_abc123",
      "entryType": "guideline",
      "entryId": "guideline_123",
      "relevanceScore": 0.95
    }
  ]
}
```

### Action: search

Search conversations by title and message content.

```json
{
  "action": "search",
  "search": "authentication",
  "projectId": "proj_xyz789",
  "limit": 20
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `search` |
| `search` | string | Yes | Search query string |
| `sessionId` | string | No | Filter by session ID |
| `projectId` | string | No | Filter by project ID |
| `agentId` | string | No | Filter by agent ID |
| `limit` | number | No | Max results (default: 20) |
| `offset` | number | No | Pagination offset |
| `agentId` | string | No | Agent identifier for permissions |

**Response:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "conv_abc123",
      "title": "Authentication Discussion",
      "status": "active"
    }
  ],
  "meta": {
    "totalCount": 1,
    "returnedCount": 1,
    "truncated": false,
    "hasMore": false
  }
}
```

### Action: end

End/complete a conversation.

```json
{
  "action": "end",
  "id": "conv_abc123",
  "generateSummary": true
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `end` |
| `id` | string | Yes | Conversation ID |
| `generateSummary` | boolean | No | Generate conversation summary (default: false) |
| `agentId` | string | No | Agent identifier for permissions |

**Response:**
```json
{
  "success": true,
  "conversation": {
    "id": "conv_abc123",
    "status": "completed",
    "endedAt": "2024-12-10T11:00:00Z"
  },
  "summary": "Conversation: Authentication Discussion\nStatus: completed\nMessages: 5 total (3 user, 2 agent)\nDuration: 60 minutes\nMemory entries used: 3"
}
```

### Action: archive

Archive a conversation.

```json
{
  "action": "archive",
  "id": "conv_abc123"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `archive` |
| `id` | string | Yes | Conversation ID |
| `agentId` | string | No | Agent identifier for permissions |

**Response:**
```json
{
  "success": true,
  "conversation": {
    "id": "conv_abc123",
    "status": "archived"
  }
}
```

### Integration with memory_query

When using `memory_query`, you can automatically link query results to conversations:

```json
{
  "action": "query",
  "search": "authentication",
  "conversationId": "conv_abc123",
  "messageId": "msg_abc123",
  "autoLinkContext": true
}
```

This will:
- Execute the query as normal
- Automatically link all result entries to the conversation
- Optionally link to a specific message if `messageId` is provided
- Extract relevance scores from query results

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `conversationId` | string | No | Conversation ID to link results to |
| `messageId` | string | No | Message ID to link results to (requires conversationId) |
| `autoLinkContext` | boolean | No | Auto-link results (default: true if conversationId provided) |

---

## memory_task

Manage task decomposition for MDAP workflows.

**Actions:** `add`, `get`, `list`

### Action: add

Create a task with subtasks, establishing decomposition relationships.

```json
{
  "action": "add",
  "parentTask": "task_parent_123",
  "subtasks": ["Subtask 1", "Subtask 2", "Subtask 3"],
  "decompositionStrategy": "maximal",
  "scopeType": "project",
  "scopeId": "proj_xyz789",
  "projectId": "proj_xyz789",
  "createdBy": "agent-1"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `add` |
| `parentTask` | string | No | ID of parent task (knowledge entry) |
| `subtasks` | array | Yes | Array of subtask descriptions/names |
| `decompositionStrategy` | string | No | `maximal`, `balanced`, or `minimal` (default: `balanced`) |
| `scopeType` | string | Yes | `global`, `org`, `project`, `session` |
| `scopeId` | string | Conditional | Required for non-global scopes |
| `projectId` | string | No | For storing decomposition metadata |
| `createdBy` | string | No | Creator identifier |

**Response:**
```json
{
  "success": true,
  "task": {
    "id": "task_abc123",
    "title": "Task with 3 subtask(s)"
  },
  "subtasks": [
    { "id": "subtask_1", "title": "Subtask 1" },
    { "id": "subtask_2", "title": "Subtask 2" },
    { "id": "subtask_3", "title": "Subtask 3" }
  ]
}
```

### Action: get

Get a task by ID with its subtasks.

```json
{
  "action": "get",
  "taskId": "task_abc123"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `get` |
| `taskId` | string | Yes | Task ID |

**Response:**
```json
{
  "task": {
    "id": "task_abc123",
    "title": "Task with 3 subtask(s)",
    "content": "Decomposition strategy: maximal\nSubtasks: Subtask 1, Subtask 2, Subtask 3"
  },
  "subtasks": [
    { "id": "subtask_1", "title": "Subtask 1" },
    { "id": "subtask_2", "title": "Subtask 2" },
    { "id": "subtask_3", "title": "Subtask 3" }
  ]
}
```

### Action: list

List tasks, optionally filtered by parent task.

```json
{
  "action": "list",
  "parentTaskId": "task_parent_123",
  "scopeType": "project",
  "scopeId": "proj_xyz789",
  "limit": 20,
  "offset": 0
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `list` |
| `parentTaskId` | string | No | Filter by parent task ID |
| `scopeType` | string | No | Filter by scope type |
| `scopeId` | string | No | Filter by scope ID |
| `limit` | number | No | Max results |
| `offset` | number | No | Pagination offset |

---

## memory_voting

Manage multi-agent voting and consensus for MDAP workflows.

**Actions:** `record_vote`, `get_consensus`, `list_votes`, `get_stats`

### Action: record_vote

Record a vote from an agent for a task.

```json
{
  "action": "record_vote",
  "taskId": "task_abc123",
  "agentId": "agent-1",
  "voteValue": { "move": { "disk": 1, "from": "A", "to": "C" } },
  "confidence": 0.95,
  "reasoning": "Move smallest disk to target"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `record_vote` |
| `taskId` | string | Yes | Task ID (references knowledge/tool entry) |
| `agentId` | string | Yes | Agent identifier |
| `voteValue` | object | Yes | Agent vote value (any JSON-serializable value) |
| `confidence` | number | No | Confidence level 0-1 (default: 1.0) |
| `reasoning` | string | No | Reasoning for this vote |

**Response:**
```json
{
  "success": true,
  "taskId": "task_abc123",
  "agentId": "agent-1",
  "message": "Vote recorded successfully"
}
```

### Action: get_consensus

Get consensus for a task using First-to-Ahead-by-k algorithm.

```json
{
  "action": "get_consensus",
  "taskId": "task_abc123",
  "k": 1
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `get_consensus` |
| `taskId` | string | Yes | Task ID |
| `k` | number | No | Number of votes ahead required for consensus (default: 1) |

**Response:**
```json
{
  "consensus": { "move": { "disk": 1, "from": "A", "to": "C" } },
  "voteCount": 5,
  "confidence": 0.98,
  "dissentingVotes": [],
  "voteDistribution": [
    {
      "voteValue": { "move": { "disk": 1, "from": "A", "to": "C" } },
      "count": 5,
      "agents": ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"]
    }
  ],
  "k": 1
}
```

### Action: list_votes

List all votes for a task.

```json
{
  "action": "list_votes",
  "taskId": "task_abc123"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `list_votes` |
| `taskId` | string | Yes | Task ID |

**Response:**
```json
{
  "votes": [
    {
      "id": "vote_1",
      "agentId": "agent-1",
      "voteValue": { "move": { "disk": 1, "from": "A", "to": "C" } },
      "confidence": 0.95,
      "reasoning": "Move smallest disk to target",
      "createdAt": "2024-12-10T10:00:00Z"
    }
  ],
  "total": 5
}
```

### Action: get_stats

Get voting statistics for a task.

```json
{
  "action": "get_stats",
  "taskId": "task_abc123"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `get_stats` |
| `taskId` | string | Yes | Task ID |

**Response:**
```json
{
  "totalVotes": 5,
  "uniqueVoteValues": 1,
  "averageConfidence": 0.96,
  "consensusReached": true,
  "consensusValue": { "move": { "disk": 1, "from": "A", "to": "C" } }
}
```

---

## memory_analytics

Get usage analytics and trends from audit log.

**Actions:** `get_stats`, `get_trends`, `get_subtask_stats`, `get_error_correlation`, `get_low_diversity`

### Action: get_stats

Get usage statistics.

```json
{
  "action": "get_stats",
  "scopeType": "project",
  "scopeId": "proj_xyz789",
  "startDate": "2024-12-01T00:00:00Z",
  "endDate": "2024-12-10T23:59:59Z"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `get_stats` |
| `scopeType` | string | No | Filter by scope type |
| `scopeId` | string | No | Filter by scope ID |
| `startDate` | string | No | Start date filter (ISO timestamp) |
| `endDate` | string | No | End date filter (ISO timestamp) |

**Response:**
```json
{
  "stats": {
    "totalActions": 1250,
    "actionsByType": {
      "create": 450,
      "update": 320,
      "query": 480
    },
    "successRate": 0.98,
    "averageExecutionTime": 12.5
  },
  "filters": {
    "scopeType": "project",
    "scopeId": "proj_xyz789",
    "startDate": "2024-12-01T00:00:00Z",
    "endDate": "2024-12-10T23:59:59Z"
  }
}
```

### Action: get_trends

Get trend data over time.

```json
{
  "action": "get_trends",
  "scopeType": "project",
  "scopeId": "proj_xyz789",
  "startDate": "2024-12-01T00:00:00Z",
  "endDate": "2024-12-10T23:59:59Z"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `get_trends` |
| `scopeType` | string | No | Filter by scope type |
| `scopeId` | string | No | Filter by scope ID |
| `startDate` | string | No | Start date filter (ISO timestamp) |
| `endDate` | string | No | End date filter (ISO timestamp) |

**Response:**
```json
{
  "trends": {
    "daily": [
      { "date": "2024-12-01", "actions": 120, "successRate": 0.97 },
      { "date": "2024-12-02", "actions": 135, "successRate": 0.98 }
    ]
  },
  "filters": {
    "scopeType": "project",
    "scopeId": "proj_xyz789"
  }
}
```

### Action: get_subtask_stats

Get subtask execution analytics.

```json
{
  "action": "get_subtask_stats",
  "projectId": "proj_xyz789",
  "subtaskType": "move-disk"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `get_subtask_stats` |
| `projectId` | string | No | Project ID for subtask stats |
| `subtaskType` | string | No | Filter by subtask type |

**Response:**
```json
{
  "subtaskStats": {
    "totalExecutions": 1000,
    "successRate": 0.99,
    "averageExecutionTime": 5.2,
    "byType": {
      "move-disk": { "count": 1000, "successRate": 0.99, "avgTime": 5.2 }
    }
  }
}
```

### Action: get_error_correlation

Calculate error correlation between two agents.

```json
{
  "action": "get_error_correlation",
  "agentA": "agent-1",
  "agentB": "agent-2",
  "timeWindow": {
    "start": "2024-12-01T00:00:00Z",
    "end": "2024-12-10T23:59:59Z"
  }
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `get_error_correlation` |
| `agentA` | string | Yes | First agent ID for correlation |
| `agentB` | string | Yes | Second agent ID for correlation |
| `timeWindow` | object | No | Time window for correlation analysis |
| `timeWindow.start` | string | No | Start timestamp |
| `timeWindow.end` | string | No | End timestamp |

**Response:**
```json
{
  "correlation": 0.15,
  "interpretation": "Low correlation - agents are decorrelated",
  "agentA": "agent-1",
  "agentB": "agent-2",
  "timeWindow": {
    "start": "2024-12-01T00:00:00Z",
    "end": "2024-12-10T23:59:59Z"
  }
}
```

### Action: get_low_diversity

Detect when agents have low diversity (high correlation).

```json
{
  "action": "get_low_diversity",
  "projectId": "proj_xyz789"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | string | Yes | `get_low_diversity` |
| `projectId` | string | No | Project ID to analyze |

**Response:**
```json
{
  "lowDiversityPairs": [
    {
      "agentA": "agent-1",
      "agentB": "agent-2",
      "correlation": 0.85,
      "warning": "High correlation detected - agents may be too similar"
    }
  ],
  "recommendations": [
    "Consider diversifying agent prompts or models"
  ]
}
```

---

## memory_permission

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
  "serverVersion": "0.8.3",
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
| `format` | string | No | Export format: `json`, `markdown`, `yaml`, or `openapi` (default: json) |
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
- **YAML:** Structured, readable format
- **OpenAPI:** OpenAPI specification format for API documentation

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
| `format` | string | No | Import format: `json`, `yaml`, `markdown`, or `openapi` (default: json, auto-detected if possible) |
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
- JSON, YAML, Markdown, and OpenAPI formats are supported for import
- Format is auto-detected if not specified
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
| `memory_task` | `memory_task` + `action: "add"`, `"get"`, `"list"` |
| `memory_voting` | `memory_voting` + `action: "record_vote"`, `"get_consensus"`, `"list_votes"`, `"get_stats"` |
| `memory_analytics` | `memory_analytics` + `action: "get_stats"`, `"get_trends"`, `"get_subtask_stats"`, `"get_error_correlation"`, `"get_low_diversity"` |
| `memory_conflicts` | `memory_conflict` + `action: "list"` |
| `memory_conflict_resolve` | `memory_conflict` + `action: "resolve"` |
