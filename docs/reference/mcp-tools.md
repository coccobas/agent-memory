# API Reference

Complete reference for MCP tools, REST API, and CLI commands.

## Table of Contents

- [MCP Tools](#mcp-tools)
  - [Scope Management](#scope-management)
  - [Memory Entries](#memory-entries)
  - [Querying](#querying)
  - [Organization](#organization)
  - [Multi-Agent](#multi-agent)
  - [Maintenance](#maintenance)
  - [Extraction & Verification](#extraction--verification)
- [REST API](#rest-api)
- [CLI Commands](#cli-commands)

---

## MCP Tools

All MCP tools use action-based requests:

```json
{ "action": "<action-name>", ...parameters }
```

### Common Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `scopeType` | `global \| org \| project \| session` | Scope level |
| `scopeId` | string | Required for non-global scopes |
| `inherit` | boolean | Include parent scopes in queries |

---

## Scope Management

### memory_org

Manage organizations (top-level grouping).

#### Org create

```json
// Request
{
  "action": "create",
  "name": "Engineering Team",
  "metadata": { "department": "engineering" }
}

// Response
{
  "id": "org-abc123",
  "name": "Engineering Team",
  "metadata": { "department": "engineering" },
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### Org list

```json
// Request
{ "action": "list", "limit": 20, "offset": 0 }

// Response
{
  "organizations": [
    { "id": "org-abc123", "name": "Engineering Team", ... }
  ],
  "total": 1
}
```

---

### memory_project

Manage projects within organizations.

#### Project create

```json
// Request
{
  "action": "create",
  "orgId": "org-abc123",
  "name": "api-service",
  "description": "Main REST API service",
  "rootPath": "/Users/dev/projects/api-service",
  "metadata": { "language": "typescript" }
}

// Response
{
  "id": "proj-def456",
  "orgId": "org-abc123",
  "name": "api-service",
  "description": "Main REST API service",
  "rootPath": "/Users/dev/projects/api-service",
  "createdAt": "2024-01-15T10:35:00Z"
}
```

#### Project list

```json
// Request
{ "action": "list", "orgId": "org-abc123", "limit": 20 }

// Response
{
  "projects": [
    { "id": "proj-def456", "name": "api-service", ... }
  ],
  "total": 1
}
```

#### get

```json
// Request
{ "action": "get", "id": "proj-def456" }

// Response
{
  "id": "proj-def456",
  "name": "api-service",
  "description": "Main REST API service",
  ...
}
```

#### update

```json
// Request
{
  "action": "update",
  "id": "proj-def456",
  "description": "Updated description",
  "metadata": { "language": "typescript", "version": "2.0" }
}

// Response
{ "id": "proj-def456", "description": "Updated description", ... }
```

---

### memory_session

Manage working sessions.

#### start

```json
// Request
{
  "action": "start",
  "projectId": "proj-def456",
  "name": "Implement user auth",
  "purpose": "Add JWT authentication to API endpoints",
  "agentId": "claude-code"
}

// Response
{
  "id": "sess-ghi789",
  "projectId": "proj-def456",
  "name": "Implement user auth",
  "status": "active",
  "startedAt": "2024-01-15T10:40:00Z"
}
```

#### end

```json
// Request
{
  "action": "end",
  "id": "sess-ghi789",
  "status": "completed"
}

// Response
{
  "id": "sess-ghi789",
  "status": "completed",
  "endedAt": "2024-01-15T11:30:00Z"
}
```

#### Session list

```json
// Request
{
  "action": "list",
  "projectId": "proj-def456",
  "status": "active",
  "limit": 10
}

// Response
{
  "sessions": [
    { "id": "sess-ghi789", "name": "Implement user auth", "status": "active", ... }
  ],
  "total": 1
}
```

---

## Memory Entries

### memory_guideline

Store rules and standards.

#### Guideline add

```json
// Request
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "name": "typescript-strict",
  "content": "Always enable strict mode in tsconfig.json with noImplicitAny: true",
  "category": "code_style",
  "priority": 90,
  "rationale": "Catches type errors at compile time",
  "examples": {
    "good": ["const x: string = 'hello'"],
    "bad": ["const x: any = 'hello'"]
  }
}

// Response
{
  "id": "guideline-jkl012",
  "name": "typescript-strict",
  "content": "Always enable strict mode...",
  "category": "code_style",
  "priority": 90,
  "version": 1,
  "createdAt": "2024-01-15T10:45:00Z"
}
```

#### Guideline update

```json
// Request
{
  "action": "update",
  "id": "guideline-jkl012",
  "content": "Updated content with more detail",
  "changeReason": "Added clarification for edge cases"
}

// Response
{
  "id": "guideline-jkl012",
  "content": "Updated content with more detail",
  "version": 2,
  "updatedAt": "2024-01-15T11:00:00Z"
}
```

#### Guideline get

```json
// Request
{ "action": "get", "id": "guideline-jkl012" }

// Response
{
  "id": "guideline-jkl012",
  "name": "typescript-strict",
  "content": "...",
  "category": "code_style",
  "priority": 90,
  "version": 2,
  ...
}
```

#### Guideline list

```json
// Request
{
  "action": "list",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "inherit": true,
  "limit": 50
}

// Response
{
  "guidelines": [
    { "id": "guideline-jkl012", "name": "typescript-strict", ... }
  ],
  "total": 1
}
```

#### history

```json
// Request
{ "action": "history", "id": "guideline-jkl012" }

// Response
{
  "versions": [
    { "version": 2, "content": "Updated content...", "updatedAt": "..." },
    { "version": 1, "content": "Original content...", "createdAt": "..." }
  ]
}
```

#### bulk_add

```json
// Request
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    { "name": "no-any", "content": "Never use 'any' type", "priority": 95 },
    { "name": "error-handling", "content": "Wrap async in try-catch", "priority": 80 },
    { "name": "naming", "content": "Use camelCase for variables", "priority": 70 }
  ]
}

// Response
{
  "entries": [
    { "id": "guideline-001", "name": "no-any", ... },
    { "id": "guideline-002", "name": "error-handling", ... },
    { "id": "guideline-003", "name": "naming", ... }
  ],
  "count": 3
}
```

#### deactivate

```json
// Request
{ "action": "deactivate", "id": "guideline-jkl012" }

// Response
{ "id": "guideline-jkl012", "isActive": false }
```

---

### memory_knowledge

Store facts and decisions.

#### Knowledge add

```json
// Request
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "title": "Authentication Strategy",
  "content": "We chose JWT over sessions for stateless auth. Tokens expire after 1 hour with refresh tokens valid for 7 days.",
  "category": "decision",
  "confidence": 0.95,
  "source": "Architecture meeting 2024-01-10"
}

// Response
{
  "id": "knowledge-mno345",
  "title": "Authentication Strategy",
  "content": "We chose JWT over sessions...",
  "category": "decision",
  "confidence": 0.95,
  "version": 1,
  "createdAt": "2024-01-15T10:50:00Z"
}
```

#### Knowledge Categories

| Category | Use For |
|----------|---------|
| `decision` | Architecture/design choices |
| `fact` | System behavior, configurations |
| `context` | Background information |
| `reference` | External documentation links |

#### Knowledge bulk_add

```json
// Request
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    { "title": "Database choice", "content": "PostgreSQL for ACID compliance", "category": "decision" },
    { "title": "API versioning", "content": "URL path versioning: /v1/, /v2/", "category": "fact" }
  ]
}

// Response
{
  "entries": [
    { "id": "knowledge-001", "title": "Database choice", ... },
    { "id": "knowledge-002", "title": "API versioning", ... }
  ],
  "count": 2
}
```

---

### memory_tool

Store command and script registry.

#### Tool add

```json
// Request
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "name": "test-coverage",
  "description": "Run tests with coverage report",
  "category": "cli",
  "parameters": {
    "type": "object",
    "properties": {
      "watch": { "type": "boolean", "description": "Watch mode" }
    }
  },
  "examples": [
    "npm run test:coverage",
    "npm run test -- --watch"
  ],
  "constraints": "Requires Node.js 20+"
}

// Response
{
  "id": "tool-pqr678",
  "name": "test-coverage",
  "description": "Run tests with coverage report",
  "category": "cli",
  "version": 1,
  "createdAt": "2024-01-15T10:55:00Z"
}
```

#### Tool Categories

| Category | Use For |
|----------|---------|
| `cli` | Command-line tools |
| `function` | Code functions/methods |
| `api` | API endpoints |
| `mcp` | MCP tools |

---

### memory_tag

Organize entries with tags.

#### attach

```json
// Request
{
  "action": "attach",
  "entryType": "guideline",
  "entryId": "guideline-jkl012",
  "tagName": "typescript"
}

// Response
{
  "entryId": "guideline-jkl012",
  "tagId": "tag-abc",
  "tagName": "typescript"
}
```

#### detach

```json
// Request
{
  "action": "detach",
  "entryType": "guideline",
  "entryId": "guideline-jkl012",
  "tagId": "tag-abc"
}

// Response
{ "success": true }
```

#### Tag create

```json
// Request
{
  "action": "create",
  "name": "security",
  "category": "domain",
  "description": "Security-related entries"
}

// Response
{
  "id": "tag-def",
  "name": "security",
  "category": "domain"
}
```

#### Tag list

```json
// Request
{ "action": "list", "category": "language", "limit": 50 }

// Response
{
  "tags": [
    { "id": "tag-abc", "name": "typescript", "category": "language" },
    { "id": "tag-xyz", "name": "python", "category": "language" }
  ],
  "total": 2
}
```

#### for_entry

```json
// Request
{
  "action": "for_entry",
  "entryType": "guideline",
  "entryId": "guideline-jkl012"
}

// Response
{
  "tags": [
    { "id": "tag-abc", "name": "typescript" },
    { "id": "tag-def", "name": "code-style" }
  ]
}
```

---

### memory_relation

Link related entries.

#### Relation create

```json
// Request
{
  "action": "create",
  "sourceType": "guideline",
  "sourceId": "guideline-jkl012",
  "targetType": "knowledge",
  "targetId": "knowledge-mno345",
  "relationType": "related_to"
}

// Response
{
  "id": "relation-stu901",
  "sourceType": "guideline",
  "sourceId": "guideline-jkl012",
  "targetType": "knowledge",
  "targetId": "knowledge-mno345",
  "relationType": "related_to"
}
```

#### Relation Types

| Type | Use For |
|------|---------|
| `applies_to` | Guideline applies to specific context |
| `depends_on` | Entry requires another |
| `conflicts_with` | Mutually exclusive entries |
| `related_to` | General association |
| `parent_task` | Task hierarchy |
| `subtask_of` | Task hierarchy |

---

## Querying

### memory_query

Search and retrieve memory.

#### context

Load all memory for a scope:

```json
// Request
{
  "action": "context",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "inherit": true,
  "compact": false,
  "limit": 50
}

// Response
{
  "guidelines": [
    { "id": "guideline-jkl012", "name": "typescript-strict", ... }
  ],
  "knowledge": [
    { "id": "knowledge-mno345", "title": "Authentication Strategy", ... }
  ],
  "tools": [
    { "id": "tool-pqr678", "name": "test-coverage", ... }
  ],
  "scope": {
    "type": "project",
    "id": "proj-def456",
    "inheritedFrom": ["org-abc123", "global"]
  }
}
```

#### search

Find specific entries:

```json
// Request
{
  "action": "search",
  "search": "authentication",
  "types": ["guidelines", "knowledge"],
  "scope": {
    "type": "project",
    "id": "proj-def456",
    "inherit": true
  },
  "limit": 20
}

// Response
{
  "results": [
    {
      "type": "knowledge",
      "entry": { "id": "knowledge-mno345", "title": "Authentication Strategy", ... },
      "score": 0.95
    }
  ],
  "total": 1
}
```

#### Advanced Search Options

```json
// Full-text search with FTS5
{
  "action": "search",
  "search": "JWT authentication",
  "useFts5": true,
  "fuzzy": true
}

// Semantic search (requires OpenAI key)
{
  "action": "search",
  "search": "how do we handle user login",
  "semanticSearch": true,
  "semanticThreshold": 0.7
}

// Filter by tags
{
  "action": "search",
  "tags": {
    "include": ["typescript"],
    "exclude": ["deprecated"]
  }
}

// Filter by priority
{
  "action": "search",
  "types": ["guidelines"],
  "priority": { "min": 80, "max": 100 }
}

// Date filters
{
  "action": "search",
  "createdAfter": "2024-01-01T00:00:00Z",
  "updatedBefore": "2024-02-01T00:00:00Z"
}

// Related entries
{
  "action": "search",
  "relatedTo": {
    "type": "knowledge",
    "id": "knowledge-mno345",
    "depth": 2
  }
}
```

---

## Organization

### memory_file_lock

Coordinate multi-agent file access.

#### checkout

```json
// Request
{
  "action": "checkout",
  "file_path": "/Users/dev/projects/api/src/auth.ts",
  "agent_id": "agent-1",
  "project_id": "proj-def456",
  "expires_in": 3600
}

// Response
{
  "locked": true,
  "lock_id": "lock-abc123",
  "expires_at": "2024-01-15T12:00:00Z"
}
```

#### checkin

```json
// Request
{
  "action": "checkin",
  "file_path": "/Users/dev/projects/api/src/auth.ts",
  "agent_id": "agent-1"
}

// Response
{ "released": true }
```

#### status

```json
// Request
{
  "action": "status",
  "file_path": "/Users/dev/projects/api/src/auth.ts"
}

// Response
{
  "locked": true,
  "agent_id": "agent-1",
  "locked_at": "2024-01-15T11:00:00Z",
  "expires_at": "2024-01-15T12:00:00Z"
}
```

---

### memory_task

Decompose work into subtasks.

#### Task add

```json
// Request
{
  "action": "add",
  "scopeType": "session",
  "scopeId": "sess-ghi789",
  "parentTask": "Implement auth",
  "subtasks": [
    "Create JWT utility functions",
    "Add auth middleware",
    "Update route handlers",
    "Write tests"
  ],
  "decompositionStrategy": "balanced"
}

// Response
{
  "taskId": "task-vwx234",
  "subtasks": [
    { "id": "subtask-001", "description": "Create JWT utility functions" },
    { "id": "subtask-002", "description": "Add auth middleware" },
    { "id": "subtask-003", "description": "Update route handlers" },
    { "id": "subtask-004", "description": "Write tests" }
  ]
}
```

---

## Multi-Agent

### memory_voting

Coordinate agent decisions.

#### record_vote

```json
// Request
{
  "action": "record_vote",
  "taskId": "task-vwx234",
  "agentId": "agent-1",
  "voteValue": { "choice": "approach-A", "reason": "Better performance" },
  "confidence": 0.85,
  "reasoning": "Approach A has O(n) complexity vs O(n²) for B"
}

// Response
{
  "voteId": "vote-yza567",
  "recorded": true
}
```

#### get_consensus

```json
// Request
{
  "action": "get_consensus",
  "taskId": "task-vwx234",
  "k": 2
}

// Response
{
  "hasConsensus": true,
  "winningValue": { "choice": "approach-A" },
  "votes": 3,
  "margin": 2
}
```

---

### memory_permission

Manage agent access.

#### grant

```json
// Request
{
  "action": "grant",
  "agent_id": "agent-1",
  "scope_type": "project",
  "scope_id": "proj-def456",
  "entry_type": "guideline",
  "permission": "write"
}

// Response
{
  "permission_id": "perm-bcd890",
  "granted": true
}
```

#### check

```json
// Request
{
  "action": "check",
  "agent_id": "agent-1",
  "scope_type": "project",
  "scope_id": "proj-def456",
  "entry_type": "guideline"
}

// Response
{
  "hasPermission": true,
  "level": "write"
}
```

---

## Maintenance

### memory_health

Check system status.

```json
// Request (no parameters required)
{}

// Response
{
  "status": "healthy",
  "version": "1.0.0",
  "database": {
    "connected": true,
    "path": "/Users/dev/.agent-memory/data/memory.db",
    "size": "2.5MB"
  },
  "vectorDb": {
    "connected": true,
    "entries": 150
  },
  "cache": {
    "entries": 45,
    "memoryMB": 12.5
  }
}
```

---

### memory_backup

Database backup operations.

#### Backup create

```json
// Request
{ "action": "create", "name": "pre-migration" }

// Response
{
  "filename": "memory-pre-migration-2024-01-15T11-00-00.db",
  "path": "/Users/dev/.agent-memory/backups/...",
  "size": "2.5MB"
}
```

#### Backup list

```json
// Request
{ "action": "list" }

// Response
{
  "backups": [
    { "filename": "memory-pre-migration-...", "createdAt": "...", "size": "2.5MB" }
  ]
}
```

#### restore

```json
// Request
{ "action": "restore", "filename": "memory-pre-migration-2024-01-15T11-00-00.db" }

// Response
{ "restored": true, "filename": "..." }
```

---

### memory_init

Database initialization.

#### Init status

```json
// Request
{ "action": "status" }

// Response
{
  "initialized": true,
  "version": "1.0.0",
  "migrations": {
    "applied": 15,
    "pending": 0
  }
}
```

#### init

```json
// Request
{ "action": "init", "force": false }

// Response
{ "initialized": true, "migrationsRun": 15 }
```

---

### memory_export

Export memory to file.

```json
// Request
{
  "action": "export",
  "format": "json",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "types": ["guidelines", "knowledge"],
  "includeVersions": true,
  "filename": "project-export.json"
}

// Response
{
  "filename": "project-export.json",
  "path": "/Users/dev/.agent-memory/exports/project-export.json",
  "entries": 25
}
```

Formats: `json`, `yaml`, `markdown`, `openapi`

---

### memory_import

Import memory from file.

```json
// Request
{
  "action": "import",
  "format": "json",
  "content": "{\"guidelines\": [...]}",
  "conflictStrategy": "update",
  "importedBy": "admin"
}

// Response
{
  "imported": {
    "guidelines": 10,
    "knowledge": 5,
    "tools": 3
  },
  "skipped": 2,
  "errors": []
}
```

Conflict strategies: `skip`, `update`, `replace`, `error`

---

## Extraction & Verification

### memory_observe

Extract memory from conversation context.

#### extract

```json
// Request
{
  "action": "extract",
  "context": "User mentioned they always use TypeScript strict mode and never use 'any'. They also decided to use PostgreSQL for the database.",
  "contextType": "conversation",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "autoStore": true,
  "confidenceThreshold": 0.7
}

// Response
{
  "extracted": [
    {
      "type": "guideline",
      "name": "typescript-strict",
      "content": "Always use TypeScript strict mode",
      "confidence": 0.92,
      "stored": true,
      "id": "guideline-new123"
    },
    {
      "type": "knowledge",
      "title": "Database choice",
      "content": "PostgreSQL selected for database",
      "confidence": 0.88,
      "stored": true,
      "id": "knowledge-new456"
    }
  ]
}
```

---

### memory_verify

Verify actions against guidelines.

#### pre_check

```json
// Request
{
  "action": "pre_check",
  "sessionId": "sess-ghi789",
  "agentId": "agent-1",
  "proposedAction": {
    "type": "code_generate",
    "filePath": "/src/utils.ts",
    "content": "const x: any = 'test';",
    "description": "Add utility function"
  }
}

// Response
{
  "blocked": true,
  "violations": [
    {
      "guidelineId": "guideline-jkl012",
      "name": "no-any-types",
      "severity": "high",
      "message": "Code contains 'any' type which violates typescript-strict guideline"
    }
  ]
}
```

---

### memory_hook

Generate IDE verification hooks.

#### install

```json
// Request
{
  "action": "install",
  "ide": "claude",
  "projectPath": "/Users/dev/projects/api-service",
  "projectId": "proj-def456"
}

// Response
{
  "installed": true,
  "files": [
    "/Users/dev/projects/api-service/.claude/hooks.json"
  ]
}
```

Supported IDEs: `claude`, `cursor`, `vscode`

---

### memory_consolidate

Reduce memory redundancy.

#### find_similar

```json
// Request
{
  "action": "find_similar",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "threshold": 0.85,
  "entryTypes": ["guidelines"]
}

// Response
{
  "groups": [
    {
      "entries": [
        { "id": "guideline-001", "name": "no-any", "similarity": 1.0 },
        { "id": "guideline-002", "name": "avoid-any-type", "similarity": 0.92 }
      ],
      "recommendation": "merge"
    }
  ]
}
```

#### dedupe

```json
// Request
{
  "action": "dedupe",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "threshold": 0.9,
  "dryRun": false
}

// Response
{
  "removed": 3,
  "kept": 25
}
```

---

## REST API

REST is **disabled by default**. Enable with environment variables:

```bash
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret-key
```

### Authentication

Include in every request (except `/health`):

```
Authorization: Bearer <API_KEY>
```
or
```
X-API-Key: <API_KEY>
```

### Endpoints

#### GET /health

No authentication required.

```bash
curl http://127.0.0.1:8787/health
```

Response:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600
}
```

#### POST /v1/query

Search memory entries.

```bash
curl -X POST http://127.0.0.1:8787/v1/query \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-app",
    "types": ["guidelines", "knowledge"],
    "scope": {
      "type": "project",
      "id": "proj-def456",
      "inherit": true
    },
    "search": "authentication",
    "semanticSearch": true,
    "semanticThreshold": 0.7,
    "limit": 20
  }'
```

Response:

```json
{
  "results": [
    {
      "type": "knowledge",
      "entry": {
        "id": "knowledge-mno345",
        "title": "Authentication Strategy",
        "content": "..."
      },
      "score": 0.92
    }
  ],
  "total": 1
}
```

#### POST /v1/context

Get aggregated context for a scope.

```bash
curl -X POST http://127.0.0.1:8787/v1/context \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-app",
    "scopeType": "project",
    "scopeId": "proj-def456",
    "inherit": true,
    "compact": false,
    "limitPerType": 50
  }'
```

Response:

```json
{
  "guidelines": [...],
  "knowledge": [...],
  "tools": [...]
}
```

### Error Responses

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key"
  }
}
```

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `RATE_LIMITED` | 429 | Too many requests |

---

## CLI Commands

### Server Commands

```bash
# Start MCP server (default)
agent-memory mcp

# Start REST server
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=secret \
agent-memory rest

# Start both servers
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=secret \
agent-memory both
```

### Utility Commands

```bash
# Check version
agent-memory --version

# Verify response content
echo "content" | agent-memory verify-response --type code_generate

# Run hooks (for Claude Code integration)
agent-memory hook pretooluse --project-id proj-def456
agent-memory hook stop --project-id proj-def456
agent-memory hook userpromptsubmit --project-id proj-def456
```

### Environment Variables

Key variables (see [full reference](reference/environment-variables.md)):

```bash
# Data location
AGENT_MEMORY_DATA_DIR=~/.agent-memory

# Semantic search
AGENT_MEMORY_OPENAI_API_KEY=sk-...

# REST API
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret
AGENT_MEMORY_REST_HOST=127.0.0.1
AGENT_MEMORY_REST_PORT=8787

# Permissions (for single-agent setups)
AGENT_MEMORY_PERMISSIONS_MODE=permissive
```

---

## See Also

- [Getting Started](../getting-started.md) - First workflow walkthrough
- [Environment Variables](environment-variables.md) - All configuration options
- [Workflows Guide](../guides/workflows.md) - Common usage patterns
- [Architecture](../concepts/architecture.md) - System design
