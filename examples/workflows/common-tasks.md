# Common Tasks

Quick reference for common operations in Agent Memory.

## Setup and Configuration

### Initialize a New Organization

```json
{
  "tool": "memory_org",
  "arguments": {
    "action": "create",
    "name": "Acme Corp",
    "metadata": {
      "description": "Main development organization",
      "team_size": 10
    }
  }
}
```

### Create a Project

```json
{
  "tool": "memory_project",
  "arguments": {
    "action": "create",
    "orgId": "org_abc123",
    "name": "Web App",
    "description": "Customer-facing web application",
    "rootPath": "/Users/dev/projects/webapp"
  }
}
```

### Start a Development Session

```json
{
  "tool": "memory_session",
  "arguments": {
    "action": "start",
    "projectId": "proj_xyz789",
    "name": "refactor-auth",
    "purpose": "Refactoring authentication module",
    "agentId": "claude-cursor-123"
  }
}
```

## Adding Memory Entries

### Add a Tool Definition

```json
{
  "tool": "memory_tool",
  "arguments": {
    "action": "add",
    "scopeType": "project",
    "scopeId": "proj_xyz789",
    "name": "run_tests",
    "category": "cli",
    "description": "Run test suite with pytest",
    "parameters": {
      "test_path": "string (optional)",
      "verbose": "boolean"
    },
    "examples": ["pytest tests/", "pytest tests/test_auth.py -v"],
    "constraints": "Must be run from project root",
    "createdBy": "developer"
  }
}
```

### Add a Guideline

```json
{
  "tool": "memory_guideline",
  "arguments": {
    "action": "add",
    "scopeType": "project",
    "scopeId": "proj_xyz789",
    "name": "error_handling",
    "category": "code_style",
    "priority": 85,
    "content": "Always use try-catch blocks for async operations. Log errors with context.",
    "rationale": "Prevents unhandled promise rejections and improves debugging",
    "examples": {
      "good": [
        "try { await fetchData() } catch (err) { logger.error('Failed to fetch', { err }) }"
      ],
      "bad": ["await fetchData() // No error handling"]
    },
    "createdBy": "lead-dev"
  }
}
```

### Add Knowledge

```json
{
  "tool": "memory_knowledge",
  "arguments": {
    "action": "add",
    "scopeType": "project",
    "scopeId": "proj_xyz789",
    "title": "Database Schema Change",
    "category": "decision",
    "content": "Added user_preferences table to store UI settings. Decision made after UX review on 2024-01-15.",
    "source": "Architecture meeting",
    "confidence": 1.0,
    "createdBy": "architect"
  }
}
```

## Querying Memory

### Find All Python Guidelines

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["guidelines"],
    "scope": {
      "type": "project",
      "id": "proj_xyz789",
      "inherit": true
    },
    "tags": {
      "require": ["python"]
    },
    "limit": 20
  }
}
```

### Search for Authentication-Related Entries

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["tools", "guidelines", "knowledge"],
    "scope": {
      "type": "project",
      "id": "proj_xyz789",
      "inherit": true
    },
    "search": "authentication",
    "limit": 20
  }
}
```

### Get Full Context for Current Project

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "context",
    "scopeType": "project",
    "scopeId": "proj_xyz789",
    "inherit": true,
    "limit": 15
  }
}
```

## Updating and Managing

### Update a Guideline

```json
{
  "tool": "memory_guideline",
  "arguments": {
    "action": "update",
    "id": "gl_abc123",
    "content": "Updated guideline content with new best practices",
    "changeReason": "Incorporated feedback from code review",
    "updatedBy": "senior-dev"
  }
}
```

### View Version History

```json
{
  "tool": "memory_tool",
  "arguments": {
    "action": "history",
    "id": "tool_def456"
  }
}
```

### Deactivate an Entry

```json
{
  "tool": "memory_guideline",
  "arguments": {
    "action": "deactivate",
    "id": "gl_old123"
  }
}
```

## Tags and Relations

### Create a Custom Tag

```json
{
  "tool": "memory_tag",
  "arguments": {
    "action": "create",
    "name": "frontend",
    "category": "custom",
    "description": "Frontend-related entries"
  }
}
```

### Attach Tags to an Entry

```json
{
  "tool": "memory_tag",
  "arguments": {
    "action": "attach",
    "entryType": "guideline",
    "entryId": "gl_abc123",
    "tagName": "python"
  }
}
```

### Create a Relation Between Entries

```json
{
  "tool": "memory_relation",
  "arguments": {
    "action": "create",
    "sourceType": "guideline",
    "sourceId": "gl_security_001",
    "targetType": "tool",
    "targetId": "tool_auth_check",
    "relationType": "applies_to",
    "createdBy": "security-team"
  }
}
```

### List Relations for an Entry

```json
{
  "tool": "memory_relation",
  "arguments": {
    "action": "list",
    "sourceType": "guideline",
    "sourceId": "gl_security_001"
  }
}
```

## File Locking (Multi-Agent)

### Check if File is Locked

```json
{
  "tool": "memory_file_lock",
  "arguments": {
    "action": "status",
    "file_path": "/absolute/path/to/file.ts"
  }
}
```

### Checkout a File Lock

```json
{
  "tool": "memory_file_lock",
  "arguments": {
    "action": "checkout",
    "file_path": "/absolute/path/to/file.ts",
    "agent_id": "agent-123",
    "session_id": "sess_abc",
    "project_id": "proj_xyz789",
    "expires_in": 3600,
    "metadata": {
      "purpose": "refactoring authentication"
    }
  }
}
```

### Release a File Lock

```json
{
  "tool": "memory_file_lock",
  "arguments": {
    "action": "checkin",
    "file_path": "/absolute/path/to/file.ts",
    "agent_id": "agent-123"
  }
}
```

### List All Active Locks

```json
{
  "tool": "memory_file_lock",
  "arguments": {
    "action": "list",
    "project_id": "proj_xyz789"
  }
}
```

## Conflict Management

### List Unresolved Conflicts

```json
{
  "tool": "memory_conflict",
  "arguments": {
    "action": "list",
    "resolved": false,
    "limit": 20
  }
}
```

### Resolve a Conflict

```json
{
  "tool": "memory_conflict",
  "arguments": {
    "action": "resolve",
    "id": "conflict_789",
    "resolution": "Kept version B as it includes the latest security updates",
    "resolvedBy": "team-lead"
  }
}
```

## Session Management

### List Active Sessions

```json
{
  "tool": "memory_session",
  "arguments": {
    "action": "list",
    "status": "active",
    "limit": 20
  }
}
```

### End a Session

```json
{
  "tool": "memory_session",
  "arguments": {
    "action": "end",
    "id": "sess_abc123",
    "status": "completed"
  }
}
```

## Maintenance

### Check System Health

```json
{
  "tool": "memory_health",
  "arguments": {}
}
```

### Initialize/Migrate Database

```json
{
  "tool": "memory_init",
  "arguments": {
    "action": "init",
    "verbose": true
  }
}
```

### Check Migration Status

```json
{
  "tool": "memory_init",
  "arguments": {
    "action": "status"
  }
}
```

### Backup Database (via npm)

```bash
npm run db:backup
```

### Restore Database (via npm)

```bash
npm run db:restore data/backup-1234567890.db
```

## Tips

### Compact Mode for Large Queries

Add `"compact": true` to get only IDs and names:

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["tools"],
    "compact": true,
    "limit": 100
  }
}
```

### Scope Inheritance

Set `"inherit": false` to only search the specific scope:

```json
{
  "tool": "memory_guideline",
  "arguments": {
    "action": "list",
    "scopeType": "project",
    "scopeId": "proj_xyz789",
    "inherit": false
  }
}
```

### Filter by Multiple Tags

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["guidelines"],
    "tags": {
      "require": ["python", "security"],
      "exclude": ["deprecated"]
    }
  }
}
```
