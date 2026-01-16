# Multi-Agent & MDAP Support

Agent Memory supports large-scale, multi-agent workflows for distributed AI systems.

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Task Decomposition](#task-decomposition)
- [Voting & Consensus](#voting--consensus)
- [File Locking](#file-locking)
- [Conflict Detection](#conflict-detection)
- [Permissions](#permissions)
- [Deployment Patterns](#deployment-patterns)

---

## Overview

Agent Memory provides infrastructure for coordinating multiple AI agents working on the same project:

| Feature            | Purpose                                 |
| ------------------ | --------------------------------------- |
| Task decomposition | Break work into parallelizable subtasks |
| Voting & consensus | Coordinate agent decisions              |
| File locking       | Prevent concurrent file modifications   |
| Conflict detection | Identify and resolve memory conflicts   |
| Permissions        | Control agent access to scopes          |

---

## Core Concepts

### Agent Identity

Each agent should have a unique identifier:

```json
{
  "agentId": "agent-1"
}
```

Agent IDs are used for:

- Permission checks
- Rate limiting
- Audit logging
- File lock ownership

### Session Management

Sessions group related work by an agent:

```json
// Tool: memory_session
{
  "action": "start",
  "projectId": "proj-123",
  "name": "Implement feature X",
  "agentId": "agent-1"
}
```

Multiple agents can have concurrent sessions on the same project.

---

## Task Decomposition

Break large tasks into subtasks that can be parallelized.

### Create Task Decomposition

```json
// Tool: memory_task
{
  "action": "add",
  "scopeType": "session",
  "scopeId": "sess-abc",
  "parentTask": "Implement user authentication",
  "subtasks": [
    "Create JWT utility module",
    "Add authentication middleware",
    "Update API routes",
    "Write unit tests",
    "Write integration tests"
  ],
  "decompositionStrategy": "balanced"
}
```

### Decomposition Strategies

| Strategy   | Description                    |
| ---------- | ------------------------------ |
| `maximal`  | Many small, fine-grained tasks |
| `balanced` | Moderate task size (default)   |
| `minimal`  | Fewer, larger tasks            |

### Get Task Status

```json
// Tool: memory_task
{
  "action": "get",
  "taskId": "task-123"
}
```

### List Subtasks

```json
// Tool: memory_task
{
  "action": "list",
  "parentTaskId": "task-123"
}
```

---

## Voting & Consensus

When multiple agents need to agree on an approach.

### Record a Vote

```json
// Tool: memory_voting
{
  "action": "record_vote",
  "taskId": "task-123",
  "agentId": "agent-1",
  "voteValue": {
    "approach": "redis-cache",
    "reason": "Better for distributed systems"
  },
  "confidence": 0.85,
  "reasoning": "Redis provides atomic operations and pub/sub needed for our use case"
}
```

### Check Consensus

```json
// Tool: memory_voting
{
  "action": "get_consensus",
  "taskId": "task-123",
  "k": 2 // Require 2-vote margin
}
```

Response:

```json
{
  "hasConsensus": true,
  "winningValue": { "approach": "redis-cache" },
  "votes": 3,
  "margin": 2
}
```

### View All Votes

```json
// Tool: memory_voting
{
  "action": "list_votes",
  "taskId": "task-123"
}
```

### Voting Statistics

```json
// Tool: memory_voting
{
  "action": "get_stats",
  "taskId": "task-123"
}
```

---

## File Locking

Prevent concurrent modifications to the same file.

### Checkout (Lock) File

```json
// Tool: memory_file_lock
{
  "action": "checkout",
  "file_path": "/path/to/project/src/auth.ts",
  "agent_id": "agent-1",
  "project_id": "proj-123",
  "expires_in": 3600 // Lock expires in 1 hour
}
```

Response:

```json
{
  "locked": true,
  "lock_id": "lock-abc",
  "expires_at": "2024-01-15T12:00:00Z"
}
```

### Check Lock Status

```json
// Tool: memory_file_lock
{
  "action": "status",
  "file_path": "/path/to/project/src/auth.ts"
}
```

### Checkin (Release) File

```json
// Tool: memory_file_lock
{
  "action": "checkin",
  "file_path": "/path/to/project/src/auth.ts",
  "agent_id": "agent-1"
}
```

### List All Locks

```json
// Tool: memory_file_lock
{
  "action": "list",
  "project_id": "proj-123"
}
```

### Force Unlock (Admin)

```json
// Tool: memory_file_lock
{
  "action": "force_unlock",
  "file_path": "/path/to/project/src/auth.ts",
  "reason": "Agent crashed, releasing stale lock"
}
```

---

## Conflict Detection

Detect when agents create conflicting memory entries.

### Automatic Detection

Conflicts are automatically detected when:

- Multiple agents update the same entry within a time window
- Entries with contradictory content are created

### List Conflicts

```json
// Tool: memory_conflict
{
  "action": "list",
  "entryType": "guideline",
  "resolved": false // Only unresolved
}
```

### Resolve Conflict

```json
// Tool: memory_conflict
{
  "action": "resolve",
  "id": "conflict-123",
  "resolution": "Kept agent-1's version as it was more specific",
  "resolvedBy": "admin"
}
```

### Configuration

```bash
# Time window for conflict detection (ms)
AGENT_MEMORY_CONFLICT_WINDOW_MS=5000

# High error correlation threshold
AGENT_MEMORY_HIGH_ERROR_CORRELATION_THRESHOLD=0.7
```

---

## Permissions

Control which agents can access which scopes.

### Grant Permission

```json
// Tool: memory_permission
{
  "action": "grant",
  "agent_id": "agent-1",
  "scope_type": "project",
  "scope_id": "proj-123",
  "entry_type": "guideline",
  "permission": "write"
}
```

Permission levels:

- `read` - Can query entries
- `write` - Can create/update entries
- `admin` - Can delete entries and manage permissions

### Check Permission

```json
// Tool: memory_permission
{
  "action": "check",
  "agent_id": "agent-1",
  "scope_type": "project",
  "scope_id": "proj-123",
  "entry_type": "guideline"
}
```

### List Permissions

```json
// Tool: memory_permission
{
  "action": "list",
  "agent_id": "agent-1"
}
```

### Revoke Permission

```json
// Tool: memory_permission
{
  "action": "revoke",
  "permission_id": "perm-123"
}
```

### Permissive Mode

For single-agent or trusted environments:

```bash
AGENT_MEMORY_PERMISSIONS_MODE=permissive agent-memory mcp
```

---

## Deployment Patterns

### Single Server, Multiple Agents

All agents connect to one Agent Memory instance:

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Agent 1 │     │ Agent 2 │     │ Agent 3 │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     └───────────────┴───────────────┘
                     │
              ┌──────┴──────┐
              │Agent Memory │
              │   Server    │
              └─────────────┘
```

**Configuration:**

```bash
# Enable rate limiting per agent
AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX=100

# Enable conflict detection
AGENT_MEMORY_CONFLICT_WINDOW_MS=5000
```

### REST API for External Agents

Use REST API for agents outside the MCP ecosystem:

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=shared-secret \
agent-memory both
```

Agents query via HTTP:

```bash
curl -X POST http://server:8787/v1/query \
  -H "Authorization: Bearer shared-secret" \
  -H "Content-Type: application/json" \
  -d '{"agentId": "external-agent", "types": ["guidelines"]}'
```

### High Availability

For production deployments:

1. **Read Replicas**: Use SQLite read replicas for query scaling
2. **Shared Storage**: Mount database on shared filesystem
3. **Health Monitoring**: Poll `/health` endpoint
4. **Backup Strategy**: Regular automated backups

```bash
# Create backup before deployments
agent-memory backup create --name "pre-deploy"
```

---

## Analytics

Track multi-agent performance.

### Get Statistics

```json
// Tool: memory_analytics
{
  "action": "get_stats",
  "scopeType": "project",
  "scopeId": "proj-123"
}
```

### Get Trends

```json
// Tool: memory_analytics
{
  "action": "get_trends",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

### Agent Error Correlation

```json
// Tool: memory_analytics
{
  "action": "get_error_correlation",
  "agentA": "agent-1",
  "agentB": "agent-2"
}
```

---

## Best Practices

### 1. Always Use Agent IDs

```json
{
  "agentId": "agent-1" // Required for proper tracking
}
```

### 2. Lock Before Modify

```json
// 1. Lock
{ "action": "checkout", "file_path": "...", "agent_id": "..." }

// 2. Modify file

// 3. Release
{ "action": "checkin", "file_path": "...", "agent_id": "..." }
```

### 3. Use Sessions

Group related work in sessions for better audit trails:

```json
// Start session
{ "action": "start", "name": "Feature X", "agentId": "..." }

// ... do work ...

// End session
{ "action": "end", "id": "sess-123", "status": "completed" }
```

### 4. Handle Lock Failures

When lock acquisition fails:

```json
{
  "locked": false,
  "owner": "agent-2",
  "expires_at": "2024-01-15T12:00:00Z"
}
```

Options:

- Wait and retry
- Skip this file
- Request force unlock (with proper authorization)

### 5. Monitor Conflicts

Regularly check for unresolved conflicts:

```json
{
  "action": "list",
  "resolved": false
}
```

---

## See Also

- [Workflows Guide](../guides/workflows.md) - Multi-agent workflows
- [Performance Guide](../guides/performance.md) - Optimization
- [MCP Tools](mcp-tools.md) - Complete tool docs
