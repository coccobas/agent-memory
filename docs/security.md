# Security

This document describes the security features and best practices for Agent Memory.

## Overview

Agent Memory provides multiple layers of security for multi-agent environments:

1. **Permission System** - Fine-grained access control
2. **File Locks** - Prevent concurrent file modifications
3. **Audit Logging** - Complete action trail
4. **Rate Limiting** - Prevent abuse
5. **Data Sanitization** - Protect sensitive information in logs

## Permission System

### How It Works

Agent Memory uses a permission system to control access to memory entries. Permissions are checked at the handler level before any operation is performed.

### Permission Levels

| Level | Description |
|-------|-------------|
| `read` | View entries and query data |
| `write` | Create, update, and deactivate entries |
| `admin` | Full access including permission management |

### Permission Scope

Permissions can be granted at multiple levels:
- **Global** - Applies to all entries
- **Entry Type** - Applies to specific types (tools, guidelines, knowledge)
- **Scope** - Applies within a specific scope (org, project, session)
- **Entry** - Applies to a specific entry

### Default Behavior

**Important:** When no permissions are configured, Agent Memory defaults to **full access** for backward compatibility. This is intentional to ensure existing setups continue to work.

To enable permission enforcement:

```json
{
  "name": "memory_permission",
  "arguments": {
    "action": "grant",
    "agent_id": "my-agent",
    "scope_type": "project",
    "scope_id": "proj-123",
    "entry_type": "guideline",
    "permission": "write",
    "created_by": "admin"
  }
}
```

### Checking Permissions

```json
{
  "name": "memory_permission",
  "arguments": {
    "action": "check",
    "agent_id": "my-agent",
    "permission": "write",
    "scope_type": "project",
    "scope_id": "proj-123",
    "entry_type": "guideline"
  }
}
```

### Best Practices

1. **Start restrictive** - Grant only necessary permissions
2. **Use scopes** - Limit permissions to specific projects/sessions
3. **Audit regularly** - Review permission grants periodically
4. **Use agent IDs** - Always identify agents for permission tracking

## File Locks

### Purpose

File locks prevent multiple agents from modifying the same file simultaneously, avoiding conflicts and data corruption.

### Lock Operations

```json
// Acquire a lock
{
  "name": "memory_file_lock",
  "arguments": {
    "action": "checkout",
    "file_path": "/path/to/file.ts",
    "agent_id": "my-agent",
    "expires_in": 3600
  }
}

// Release a lock
{
  "name": "memory_file_lock",
  "arguments": {
    "action": "checkin",
    "file_path": "/path/to/file.ts",
    "agent_id": "my-agent"
  }
}
```

### Lock Timeout

- **Default timeout:** 3600 seconds (1 hour)
- **Maximum timeout:** 86400 seconds (24 hours)
- Expired locks are automatically released

### Force Unlock

Use with caution - only when a lock is clearly stale:

```json
{
  "name": "memory_file_lock",
  "arguments": {
    "action": "force_unlock",
    "file_path": "/path/to/file.ts",
    "agent_id": "admin-agent"
  }
}
```

## Audit Logging

### What's Logged

All operations are logged with:
- Agent ID
- Action type (create, update, delete, read, query)
- Entry type and ID
- Scope information
- Execution time
- Success/failure status

### Querying Audit Logs

Audit logs are stored in the `audit_log` table and can be queried using the `memory_analytics` tool:

```json
{
  "name": "memory_analytics",
  "arguments": {
    "action": "get_stats",
    "scopeType": "project",
    "scopeId": "proj-123"
  }
}
```

### Retention

Audit logs are retained indefinitely by default. Consider implementing a cleanup strategy for production environments.

## Rate Limiting

### How It Works

Agent Memory implements sliding window rate limiting to prevent abuse:

- **Per-agent limits** - Each agent has individual rate limits
- **Global limits** - Overall system limits

### Configuration

Rate limiting is built into the system. Current default limits:
- 100 requests per minute per agent
- 1000 requests per minute globally

### Rate Limit Errors

When rate limited, you'll receive an error with code `E5001` (INTERNAL_ERROR) and a message indicating rate limiting.

## Data Sanitization

### Sensitive Data in Logs

Agent Memory automatically sanitizes sensitive data in logs:

- API keys are redacted
- Passwords are masked
- Tokens are truncated

### What's Protected

The sanitization system detects and redacts:
- Environment variable patterns (e.g., `OPENAI_API_KEY`)
- Bearer tokens
- Password fields
- Secret/key patterns

### Best Practices

1. **Don't log sensitive data** - Use the built-in sanitization
2. **Use environment variables** - Don't hardcode secrets
3. **Review logs** - Periodically check logs for sensitive data leaks

## Conflict Detection

### How It Works

Agent Memory detects conflicts when:
- Two writes to the same entry happen within 5 seconds
- Both writes have the same base version number

### Conflict Storage

When conflicts are detected:
- Both versions are stored
- Later version is flagged with `conflictFlag: true`
- Conflict is logged in `conflict_log` table

### Resolution

```json
{
  "name": "memory_conflict",
  "arguments": {
    "action": "list",
    "resolved": false
  }
}
```

## Security Checklist

### For Production Deployments

- [ ] Configure explicit permissions (don't rely on default full access)
- [ ] Set appropriate agent IDs for all operations
- [ ] Enable audit logging review process
- [ ] Configure rate limits appropriate for your use case
- [ ] Review conflict resolution procedures
- [ ] Set up database backups
- [ ] Use secure paths for database storage

### For Multi-Agent Environments

- [ ] Implement file lock policies
- [ ] Define clear agent ID naming conventions
- [ ] Set up permission hierarchies
- [ ] Configure conflict notification/alerting
- [ ] Document agent responsibilities and access levels

## Environment Variables

Security-related environment variables:

| Variable | Description |
|----------|-------------|
| `AGENT_MEMORY_DB_PATH` | Database file location (secure this path) |
| `AGENT_MEMORY_OPENAI_API_KEY` | API key for embeddings (keep secret) |

See [Environment Variables](./reference/environment-variables.md) for common options and [Advanced Environment Variables](./reference/environment-variables-advanced.md) for the full list.

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public issue
2. Contact the maintainers privately
3. Provide detailed reproduction steps
4. Allow time for a fix before disclosure

## See Also

- [Architecture](./architecture.md) - System design details
- [Error Codes](./reference/error-codes.md) - Error handling reference
- [API Reference](./api-reference.md) - Complete tool documentation
