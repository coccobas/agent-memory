# Workflows Guide

Practical patterns for using Agent Memory in real-world scenarios.

Use this guide when you want a repeatable “how we use memory” playbook (onboarding a project, running sessions, multi-agent coordination, and maintenance).

## Table of Contents

- [Setting Up a New Project](#setting-up-a-new-project)
- [Memory-First Development](#memory-first-development)
- [Multi-Agent Coordination](#multi-agent-coordination)
- [Memory Consolidation](#memory-consolidation)
- [Backup and Recovery](#backup-and-recovery)
- [Export and Import](#export-and-import)
- [Verification Workflows](#verification-workflows)

---

## Setting Up a New Project

Complete workflow for onboarding a project to Agent Memory.

### Step 1: Create Organization (Optional)

Organizations group related projects:

```json
// Tool: memory_org
{
  "action": "create",
  "name": "Engineering",
  "metadata": {
    "department": "engineering",
    "team": "backend"
  }
}
```

Skip this if you only have one project.

### Step 2: Create Project

```json
// Tool: memory_project
{
  "action": "create",
  "orgId": "org-abc123",
  "name": "api-service",
  "description": "REST API backend service",
  "rootPath": "/Users/dev/projects/api-service",
  "metadata": {
    "language": "typescript",
    "framework": "express"
  }
}
```

### Step 3: Bootstrap Core Guidelines

Store your project's essential rules:

```json
// Tool: memory_guideline
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    {
      "name": "typescript-strict",
      "content": "Use TypeScript strict mode with noImplicitAny enabled",
      "category": "code_style",
      "priority": 95
    },
    {
      "name": "error-handling",
      "content": "All async functions must use try-catch with proper error logging",
      "category": "code_style",
      "priority": 90
    },
    {
      "name": "api-versioning",
      "content": "All API endpoints must be versioned with /v1/, /v2/ prefix",
      "category": "architecture",
      "priority": 85
    },
    {
      "name": "no-secrets-in-code",
      "content": "Never hardcode secrets. Use environment variables for all credentials",
      "category": "security",
      "priority": 100
    }
  ]
}
```

### Step 4: Document Key Decisions

```json
// Tool: memory_knowledge
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    {
      "title": "Database Choice",
      "content": "Using PostgreSQL for ACID compliance and JSON support. Decided 2024-01.",
      "category": "decision"
    },
    {
      "title": "Authentication Strategy",
      "content": "JWT-based auth with 1-hour access tokens and 7-day refresh tokens.",
      "category": "decision"
    },
    {
      "title": "Project Structure",
      "content": "src/ contains: routes/, services/, models/, middleware/, utils/",
      "category": "fact"
    }
  ]
}
```

### Step 5: Register Common Commands

```json
// Tool: memory_tool
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    {
      "name": "dev-server",
      "description": "Start development server with hot reload",
      "category": "cli",
      "examples": ["npm run dev"]
    },
    {
      "name": "test-suite",
      "description": "Run full test suite with coverage",
      "category": "cli",
      "examples": ["npm run test:coverage"]
    },
    {
      "name": "db-migrate",
      "description": "Run database migrations",
      "category": "cli",
      "examples": ["npm run migrate:up", "npm run migrate:down"]
    }
  ]
}
```

### Step 6: Tag Everything

```json
// Tool: memory_tag (call for each entry)
{
  "action": "attach",
  "entryType": "guideline",
  "entryId": "guideline-001",
  "tagName": "typescript"
}
```

---

## Memory-First Development

Pattern for using memory effectively during development.

### Start of Session

Always query context first:

```json
// Tool: memory_query
{
  "action": "context",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "inherit": true
}
```

Start a session to group work:

```json
// Tool: memory_session
{
  "action": "start",
  "projectId": "proj-def456",
  "name": "Add user authentication",
  "purpose": "Implement JWT auth for API endpoints",
  "agentId": "claude-code"
}
```

### During Development

**Before searching the filesystem**, check memory:

```json
// Tool: memory_query
{
  "action": "search",
  "search": "authentication JWT",
  "types": ["knowledge", "guidelines"],
  "scope": {
    "type": "project",
    "id": "proj-def456",
    "inherit": true
  }
}
```

**Store new discoveries** as you work:

```json
// Tool: memory_knowledge
{
  "action": "add",
  "scopeType": "session",
  "scopeId": "sess-ghi789",
  "title": "Auth middleware location",
  "content": "Auth middleware is in src/middleware/auth.ts, exports verifyToken()",
  "category": "fact"
}
```

**Promote session knowledge to project** when confirmed:

```json
// Tool: memory_knowledge
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "title": "Auth middleware location",
  "content": "Auth middleware is in src/middleware/auth.ts, exports verifyToken()",
  "category": "fact"
}
```

### End of Session

```json
// Tool: memory_session
{
  "action": "end",
  "id": "sess-ghi789",
  "status": "completed"
}
```

---

## Multi-Agent Coordination

Patterns for multiple agents working on the same project.

### File Locking

Before modifying files:

```json
// Tool: memory_file_lock
{
  "action": "checkout",
  "file_path": "/Users/dev/projects/api/src/auth.ts",
  "agent_id": "agent-1",
  "project_id": "proj-def456",
  "expires_in": 3600
}
```

After completing work:

```json
// Tool: memory_file_lock
{
  "action": "checkin",
  "file_path": "/Users/dev/projects/api/src/auth.ts",
  "agent_id": "agent-1"
}
```

Check if file is available:

```json
// Tool: memory_file_lock
{
  "action": "status",
  "file_path": "/Users/dev/projects/api/src/auth.ts"
}
```

### Task Decomposition

Break large tasks into subtasks:

```json
// Tool: memory_task
{
  "action": "add",
  "scopeType": "session",
  "scopeId": "sess-ghi789",
  "parentTask": "Implement authentication",
  "subtasks": [
    "Create JWT utility module",
    "Add auth middleware",
    "Update user routes",
    "Write unit tests",
    "Write integration tests"
  ],
  "decompositionStrategy": "balanced"
}
```

### Consensus Voting

When agents need to agree on an approach:

```json
// Agent 1 votes
// Tool: memory_voting
{
  "action": "record_vote",
  "taskId": "task-abc123",
  "agentId": "agent-1",
  "voteValue": { "approach": "middleware-based" },
  "confidence": 0.9,
  "reasoning": "Middleware pattern is cleaner and more reusable"
}

// Agent 2 votes
// Tool: memory_voting
{
  "action": "record_vote",
  "taskId": "task-abc123",
  "agentId": "agent-2",
  "voteValue": { "approach": "middleware-based" },
  "confidence": 0.85,
  "reasoning": "Consistent with existing codebase patterns"
}

// Check for consensus
// Tool: memory_voting
{
  "action": "get_consensus",
  "taskId": "task-abc123",
  "k": 1
}
```

### Permission Management

Grant agent access to specific scopes:

```json
// Tool: memory_permission
{
  "action": "grant",
  "agent_id": "agent-1",
  "scope_type": "project",
  "scope_id": "proj-def456",
  "entry_type": "guideline",
  "permission": "write"
}
```

Check permissions before operations:

```json
// Tool: memory_permission
{
  "action": "check",
  "agent_id": "agent-1",
  "scope_type": "project",
  "scope_id": "proj-def456",
  "entry_type": "guideline"
}
```

---

## Memory Consolidation

Periodically clean up redundant entries.

### Find Similar Entries

```json
// Tool: memory_consolidate
{
  "action": "find_similar",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "threshold": 0.85,
  "entryTypes": ["guidelines", "knowledge"],
  "limit": 20
}
```

### Deduplicate (Dry Run First)

```json
// Tool: memory_consolidate
{
  "action": "dedupe",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "threshold": 0.9,
  "dryRun": true
}
```

If results look good:

```json
// Tool: memory_consolidate
{
  "action": "dedupe",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "threshold": 0.9,
  "dryRun": false,
  "consolidatedBy": "maintenance-agent"
}
```

### Archive Stale Entries

Remove entries not accessed in 90 days:

```json
// Tool: memory_consolidate
{
  "action": "archive_stale",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "staleDays": 90,
  "dryRun": true
}
```

---

## Backup and Recovery

### Create Regular Backups

```json
// Tool: memory_backup
{
  "action": "create",
  "name": "weekly-backup"
}
```

### List Available Backups

```json
// Tool: memory_backup
{ "action": "list" }
```

### Restore from Backup

```json
// Tool: memory_backup
{
  "action": "restore",
  "filename": "memory-weekly-backup-2024-01-15T00-00-00.db"
}
```

### Cleanup Old Backups

Keep only the 5 most recent:

```json
// Tool: memory_backup
{
  "action": "cleanup",
  "keepCount": 5
}
```

---

## Export and Import

### Export Project Memory

Export to JSON:

```json
// Tool: memory_export
{
  "action": "export",
  "format": "json",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "types": ["guidelines", "knowledge", "tools"],
  "includeVersions": true,
  "filename": "project-export.json"
}
```

Export to Markdown (human-readable):

```json
// Tool: memory_export
{
  "action": "export",
  "format": "markdown",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "filename": "project-memory.md"
}
```

### Import Memory

Import from JSON:

```json
// Tool: memory_import
{
  "action": "import",
  "format": "json",
  "content": "{\"guidelines\": [...], \"knowledge\": [...]}",
  "conflictStrategy": "update",
  "importedBy": "admin"
}
```

Conflict strategies:

- `skip` - Don't import if exists
- `update` - Update existing entries
- `replace` - Delete and recreate
- `error` - Fail on conflict

### Transfer Between Projects

Export from source:

```json
// Tool: memory_export
{
  "action": "export",
  "scopeType": "project",
  "scopeId": "proj-source",
  "format": "json"
}
```

Import to target with scope mapping:

```json
// Tool: memory_import
{
  "action": "import",
  "format": "json",
  "content": "<exported-content>",
  "scopeMapping": {
    "proj-source": { "type": "project", "id": "proj-target" }
  },
  "generateNewIds": true
}
```

---

## Verification Workflows

### Pre-Check Before Code Changes

Before writing code:

```json
// Tool: memory_verify
{
  "action": "pre_check",
  "sessionId": "sess-ghi789",
  "agentId": "agent-1",
  "proposedAction": {
    "type": "code_generate",
    "filePath": "/src/auth/login.ts",
    "content": "function login(user: any) {...}",
    "description": "Add login function"
  }
}
```

Response if blocked:

```json
{
  "blocked": true,
  "violations": [
    {
      "guidelineId": "guideline-001",
      "name": "no-any-types",
      "severity": "high",
      "message": "Using 'any' type violates typescript-strict guideline"
    }
  ]
}
```

### Post-Check Logging

After completing an action:

```json
// Tool: memory_verify
{
  "action": "post_check",
  "sessionId": "sess-ghi789",
  "agentId": "agent-1",
  "completedAction": {
    "type": "code_generate",
    "filePath": "/src/auth/login.ts",
    "description": "Added login function with proper typing"
  }
}
```

### Install IDE Hooks

For Claude Code:

```json
// Tool: memory_hook
{
  "action": "install",
  "ide": "claude",
  "projectPath": "/Users/dev/projects/api-service",
  "projectId": "proj-def456"
}
```

Check installation status:

```json
// Tool: memory_hook
{
  "action": "status",
  "ide": "claude",
  "projectPath": "/Users/dev/projects/api-service"
}
```

---

## Best Practices

### 1. Always Start with Context

```json
// First call in every session
{
  "action": "context",
  "scopeType": "project",
  "inherit": true
}
```

### 2. Check Before Storing

Prevent duplicates:

```json
{
  "action": "search",
  "search": "<topic>",
  "types": ["guidelines", "knowledge"]
}
```

### 3. Tag Everything

Minimum 2-3 tags per entry for discoverability.

### 4. Use Appropriate Scopes

| Scope | Use For |
|-------|---------|
| `global` | Universal standards (security, best practices) |
| `org` | Team-wide conventions |
| `project` | Project-specific rules and facts |
| `session` | Temporary/experimental knowledge |

### 5. Promote Validated Knowledge

Start in session scope, promote to project when confirmed:

```
Session → Project → Org → Global
```

### 6. Regular Maintenance

- Weekly: Consolidate similar entries
- Monthly: Archive stale entries
- Before releases: Create backup

---

## See Also

- [Getting Started](../getting-started.md) - First workflow walkthrough
- [MCP Tools](../reference/mcp-tools.md) - Complete tool documentation
- [Examples](examples.md) - Real-world usage examples
- [Multi-Agent Support](../reference/mdap-support.md) - Advanced coordination
