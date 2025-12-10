# API Reference

Complete documentation for all 35 MCP tools provided by Agent Memory.

## Table of Contents

- [Scope Management](#scope-management)
- [Tool Registry](#tool-registry)
- [Guidelines](#guidelines)
- [Knowledge](#knowledge)
- [Tags](#tags)
- [Relations](#relations)

---

## Scope Management

Manage the hierarchical scope structure: Organizations → Projects → Sessions.

### memory_org_create

Create a new organization.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Organization name |
| `metadata` | object | No | Additional metadata (JSON) |

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

---

### memory_org_list

List all organizations.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max results (default: 50) |
| `offset` | number | No | Pagination offset |

**Response:**
```json
{
  "organizations": [...],
  "meta": { "returnedCount": 5 }
}
```

---

### memory_project_create

Create a new project within an organization.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `orgId` | string | No | Parent organization ID |
| `name` | string | Yes | Project name |
| `description` | string | No | Project description |
| `rootPath` | string | No | Filesystem path |
| `metadata` | object | No | Goals, constraints, state |

**Response:**
```json
{
  "success": true,
  "project": {
    "id": "proj_xyz789",
    "orgId": "org_abc123",
    "name": "My Project",
    "createdAt": "2024-12-10T10:00:00Z"
  }
}
```

---

### memory_project_get

Get a project by ID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Project ID |

---

### memory_project_list

List projects, optionally filtered by organization.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `orgId` | string | No | Filter by organization |
| `limit` | number | No | Max results |
| `offset` | number | No | Pagination offset |

---

### memory_session_start

Start a new working session.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | string | Yes | Parent project ID |
| `name` | string | No | Session label |
| `purpose` | string | No | What this session is for |
| `agentId` | string | No | Which agent/IDE created it |
| `metadata` | object | No | Scratch notes, temp decisions |

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "sess_def456",
    "projectId": "proj_xyz789",
    "status": "active",
    "startedAt": "2024-12-10T10:00:00Z"
  }
}
```

---

### memory_session_end

End a session.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Session ID |
| `status` | string | No | Final status: `completed`, `paused`, `discarded` |

---

### memory_session_list

List sessions for a project.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | string | Yes | Project ID |
| `status` | string | No | Filter by status |
| `limit` | number | No | Max results |
| `offset` | number | No | Pagination offset |

---

## Tool Registry

Manage tool definitions with versioning.

### memory_tool_add

Add a new tool definition.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeType` | string | Yes | `global`, `org`, `project`, `session` |
| `scopeId` | string | Conditional | Required unless scopeType is `global` |
| `name` | string | Yes | Tool name (unique within scope) |
| `category` | string | No | `mcp`, `cli`, `function`, `api` |
| `description` | string | No | Tool description |
| `parameters` | object | No | Parameter schema (JSON) |
| `examples` | array | No | Usage examples |
| `constraints` | string | No | Usage guidelines/limitations |
| `createdBy` | string | No | Who created this entry |

**Response:**
```json
{
  "success": true,
  "tool": {
    "id": "tool_abc123",
    "name": "git_commit",
    "scopeType": "global",
    "currentVersionId": "tv_xyz789",
    "isActive": true,
    "currentVersion": {
      "id": "tv_xyz789",
      "versionNum": 1,
      "description": "Commit staged changes",
      "parameters": {...}
    }
  }
}
```

---

### memory_tool_update

Update a tool (creates new version).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Tool ID |
| `description` | string | No | New description |
| `parameters` | object | No | Updated parameters |
| `examples` | array | No | Updated examples |
| `constraints` | string | No | Updated constraints |
| `changeReason` | string | No | Why this update was made |
| `updatedBy` | string | No | Who made the update |

**Note:** Each update creates a new version. The previous version is preserved in history.

---

### memory_tool_get

Get a tool by ID or name.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Conditional | Tool ID (use this OR name) |
| `name` | string | Conditional | Tool name (requires scopeType) |
| `scopeType` | string | Conditional | Required when using name |
| `scopeId` | string | Conditional | Required for non-global scope |
| `inherit` | boolean | No | Include parent scopes (default: true) |

**Scope Inheritance:**
When `inherit: true`, the query looks for the tool in this order:
1. Current scope (session/project/org)
2. Parent scopes up to global

The first match is returned.

---

### memory_tool_list

List tools with filtering.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeType` | string | No | Filter by scope type |
| `scopeId` | string | No | Filter by scope ID |
| `category` | string | No | Filter by category |
| `includeInactive` | boolean | No | Include deactivated tools |
| `limit` | number | No | Max results |
| `offset` | number | No | Pagination offset |

---

### memory_tool_history

Get version history for a tool.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Tool ID |

**Response:**
```json
{
  "versions": [
    {
      "id": "tv_v3",
      "versionNum": 3,
      "description": "...",
      "changeReason": "Added new parameter",
      "createdAt": "2024-12-10T12:00:00Z"
    },
    {
      "id": "tv_v2",
      "versionNum": 2,
      "description": "...",
      "changeReason": "Fixed typo",
      "createdAt": "2024-12-10T11:00:00Z"
    },
    {
      "id": "tv_v1",
      "versionNum": 1,
      "description": "...",
      "changeReason": null,
      "createdAt": "2024-12-10T10:00:00Z"
    }
  ]
}
```

---

### memory_tool_deactivate

Soft-delete a tool.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Tool ID |

**Note:** The tool is marked inactive but not deleted. History is preserved.

---

## Guidelines

Manage guidelines and best practices with versioning.

### memory_guideline_add

Add a new guideline.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeType` | string | Yes | `global`, `org`, `project`, `session` |
| `scopeId` | string | Conditional | Required unless scopeType is `global` |
| `name` | string | Yes | Guideline name (unique within scope) |
| `category` | string | No | `code_style`, `behavior`, `security`, etc. |
| `priority` | number | No | 0-100, higher = more important (default: 50) |
| `content` | string | Yes | The guideline text |
| `rationale` | string | No | Why this guideline exists |
| `examples` | object | No | `{ good: [...], bad: [...] }` |
| `createdBy` | string | No | Who created this entry |

**Response:**
```json
{
  "success": true,
  "guideline": {
    "id": "gl_abc123",
    "name": "error-handling",
    "priority": 80,
    "currentVersion": {
      "content": "Always use try-catch for async operations...",
      "rationale": "Prevents unhandled promise rejections"
    }
  }
}
```

---

### memory_guideline_update

Update a guideline (creates new version).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Guideline ID |
| `category` | string | No | Updated category |
| `priority` | number | No | Updated priority |
| `content` | string | No | Updated content |
| `rationale` | string | No | Updated rationale |
| `examples` | object | No | Updated examples |
| `changeReason` | string | No | Why this update was made |
| `updatedBy` | string | No | Who made the update |

---

### memory_guideline_get

Get a guideline by ID or name.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Conditional | Guideline ID (use this OR name) |
| `name` | string | Conditional | Guideline name (requires scopeType) |
| `scopeType` | string | Conditional | Required when using name |
| `scopeId` | string | Conditional | Required for non-global scope |
| `inherit` | boolean | No | Include parent scopes (default: true) |

---

### memory_guideline_list

List guidelines with filtering.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeType` | string | No | Filter by scope type |
| `scopeId` | string | No | Filter by scope ID |
| `category` | string | No | Filter by category |
| `includeInactive` | boolean | No | Include deactivated |
| `limit` | number | No | Max results |
| `offset` | number | No | Pagination offset |

**Note:** Results are ordered by priority (highest first).

---

### memory_guideline_history

Get version history for a guideline.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Guideline ID |

---

### memory_guideline_deactivate

Soft-delete a guideline.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Guideline ID |

---

## Knowledge

Manage knowledge entries (facts, decisions, context) with versioning.

### memory_knowledge_add

Add a new knowledge entry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeType` | string | Yes | `global`, `org`, `project`, `session` |
| `scopeId` | string | Conditional | Required unless scopeType is `global` |
| `title` | string | Yes | Entry title (unique within scope) |
| `category` | string | No | `decision`, `fact`, `context`, `reference` |
| `content` | string | Yes | The knowledge content |
| `source` | string | No | Where this knowledge came from |
| `confidence` | number | No | 0-1, how certain (default: 1.0) |
| `validUntil` | string | No | Expiration timestamp (ISO 8601) |
| `createdBy` | string | No | Who created this entry |

**Response:**
```json
{
  "success": true,
  "knowledge": {
    "id": "kn_abc123",
    "title": "API Rate Limits",
    "category": "fact",
    "currentVersion": {
      "content": "The API allows 1000 requests per minute...",
      "source": "API documentation",
      "confidence": 1.0
    }
  }
}
```

---

### memory_knowledge_update

Update a knowledge entry (creates new version).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Knowledge ID |
| `category` | string | No | Updated category |
| `content` | string | No | Updated content |
| `source` | string | No | Updated source |
| `confidence` | number | No | Updated confidence |
| `validUntil` | string | No | Updated expiration |
| `changeReason` | string | No | Why this update was made |
| `updatedBy` | string | No | Who made the update |

---

### memory_knowledge_get

Get a knowledge entry by ID or title.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Conditional | Knowledge ID (use this OR title) |
| `title` | string | Conditional | Entry title (requires scopeType) |
| `scopeType` | string | Conditional | Required when using title |
| `scopeId` | string | Conditional | Required for non-global scope |
| `inherit` | boolean | No | Include parent scopes (default: true) |

---

### memory_knowledge_list

List knowledge entries with filtering.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `scopeType` | string | No | Filter by scope type |
| `scopeId` | string | No | Filter by scope ID |
| `category` | string | No | Filter by category |
| `includeInactive` | boolean | No | Include deactivated |
| `limit` | number | No | Max results |
| `offset` | number | No | Pagination offset |

---

### memory_knowledge_history

Get version history for a knowledge entry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Knowledge ID |

---

### memory_knowledge_deactivate

Soft-delete a knowledge entry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Knowledge ID |

---

## Tags

Manage tags for categorizing entries.

### memory_tag_create

Create a new tag.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Tag name (unique) |
| `category` | string | No | `language`, `domain`, `custom` |
| `description` | string | No | Tag description |

**Response:**
```json
{
  "success": true,
  "tag": {
    "id": "tag_abc123",
    "name": "python",
    "category": "language",
    "isPredefined": false
  },
  "existed": false
}
```

**Note:** If a tag with the same name already exists, returns the existing tag with `existed: true`.

---

### memory_tag_list

List all tags.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | No | Filter by category |
| `isPredefined` | boolean | No | Filter by predefined status |
| `limit` | number | No | Max results |
| `offset` | number | No | Pagination offset |

---

### memory_tag_attach

Attach a tag to an entry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entryType` | string | Yes | `tool`, `guideline`, `knowledge`, `project` |
| `entryId` | string | Yes | The entry's ID |
| `tagId` | string | Conditional | Tag ID (use this OR tagName) |
| `tagName` | string | Conditional | Tag name (creates if doesn't exist) |

**Response:**
```json
{
  "success": true,
  "entryTag": {
    "id": "et_abc123",
    "entryType": "guideline",
    "entryId": "gl_xyz789",
    "tagId": "tag_python"
  }
}
```

---

### memory_tag_detach

Remove a tag from an entry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entryType` | string | Yes | `tool`, `guideline`, `knowledge`, `project` |
| `entryId` | string | Yes | The entry's ID |
| `tagId` | string | Yes | Tag ID to remove |

---

### memory_tags_for_entry

Get all tags attached to an entry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entryType` | string | Yes | `tool`, `guideline`, `knowledge`, `project` |
| `entryId` | string | Yes | The entry's ID |

**Response:**
```json
{
  "tags": [
    { "id": "tag_python", "name": "python", "category": "language" },
    { "id": "tag_security", "name": "security", "category": "domain" }
  ]
}
```

---

## Relations

Create explicit links between entries.

### memory_relation_create

Create a relation between two entries.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sourceType` | string | Yes | Source entry type |
| `sourceId` | string | Yes | Source entry ID |
| `targetType` | string | Yes | Target entry type |
| `targetId` | string | Yes | Target entry ID |
| `relationType` | string | Yes | Relation type (see below) |
| `createdBy` | string | No | Who created this relation |

**Relation Types:**
- `applies_to` - Guideline/tool applies to a project
- `depends_on` - Entry depends on another
- `conflicts_with` - Entries are mutually exclusive
- `related_to` - General association

**Response:**
```json
{
  "success": true,
  "relation": {
    "id": "rel_abc123",
    "sourceType": "guideline",
    "sourceId": "gl_xyz",
    "targetType": "project",
    "targetId": "proj_abc",
    "relationType": "applies_to"
  }
}
```

---

### memory_relation_list

List relations for an entry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sourceType` | string | No | Filter by source type |
| `sourceId` | string | No | Filter by source ID |
| `targetType` | string | No | Filter by target type |
| `targetId` | string | No | Filter by target ID |
| `relationType` | string | No | Filter by relation type |
| `limit` | number | No | Max results |
| `offset` | number | No | Pagination offset |

---

### memory_relation_delete

Delete a relation.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Conditional | Relation ID (use this OR all fields below) |
| `sourceType` | string | Conditional | Source entry type |
| `sourceId` | string | Conditional | Source entry ID |
| `targetType` | string | Conditional | Target entry type |
| `targetId` | string | Conditional | Target entry ID |
| `relationType` | string | Conditional | Relation type |

---

## Error Handling

All tools return errors in a consistent format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common error scenarios:
- Missing required parameters
- Entry not found (for get/update/delete operations)
- Duplicate entry (when unique constraint violated)
- Invalid scope configuration

---

## Response Metadata

List operations include metadata:

```json
{
  "results": [...],
  "meta": {
    "returnedCount": 20
  }
}
```

Future versions will add:
- `totalCount` - Total matching entries
- `truncated` - Whether results were limited
- `estimatedTokens` - Token budget estimation
- `nextCursor` - Pagination cursor
