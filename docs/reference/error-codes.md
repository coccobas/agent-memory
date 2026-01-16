# Error Codes Reference

Agent Memory uses structured error codes for programmatic error handling. All errors follow the pattern `EXXXX` where the first digit indicates the error category.

## Error Categories

| Range       | Category   | Description                                    |
| ----------- | ---------- | ---------------------------------------------- |
| E1000-E1999 | Validation | Input validation failures                      |
| E2000-E2999 | Resource   | Resource-related errors (not found, conflicts) |
| E3000-E3999 | Locks      | File lock errors                               |
| E4000-E4999 | Database   | Database and migration errors                  |
| E5000-E5999 | System     | Internal and unknown errors                    |
| E6000-E6999 | Permission | Access control errors                          |

---

## Validation Errors (E1000-E1999)

<details>
<summary><strong>Show details</strong></summary>

### E1000 - MISSING_REQUIRED_FIELD

**Description:** A required field was not provided in the request.

**Example:**

```json
{
  "error": "Validation error: scopeType - required field missing",
  "code": "E1000",
  "context": {
    "field": "scopeType",
    "suggestion": "Provide a valid scopeType: global, org, project, or session"
  }
}
```

**Resolution:** Include the required field in your request.

---

### E1001 - INVALID_SCOPE_TYPE

**Description:** The provided scope type is not valid.

**Valid Values:** `global`, `org`, `project`, `session`

**Example:**

```json
{
  "error": "Invalid scope type: 'invalid'",
  "code": "E1001"
}
```

**Resolution:** Use one of the valid scope types.

---

### E1002 - INVALID_ACTION

**Description:** The action specified is not valid for the tool.

**Example:**

```json
{
  "error": "Invalid action 'invalid' for tool 'memory_guideline'",
  "code": "E1002",
  "context": {
    "tool": "memory_guideline",
    "action": "invalid",
    "validActions": ["add", "update", "get", "list", "history", "deactivate"]
  }
}
```

**Resolution:** Use one of the valid actions listed in the error context.

---

### E1003 - INVALID_FILE_PATH

**Description:** The file path provided is invalid or malformed.

**Example:**

```json
{
  "error": "Invalid file path: path cannot be empty",
  "code": "E1003"
}
```

**Resolution:** Provide a valid absolute or relative file path.

---

### E1004 - INVALID_PARAMETER

**Description:** A parameter value is invalid.

**Example:**

```json
{
  "error": "Invalid parameter: limit must be between 1 and 100",
  "code": "E1004"
}
```

**Resolution:** Check the parameter requirements in the API reference.

---

</details>

## Resource Errors (E2000-E2999)

<details>
<summary><strong>Show details</strong></summary>

### E2000 - NOT_FOUND

**Description:** The requested resource was not found.

**Example:**

```json
{
  "error": "guideline not found: gl_abc123",
  "code": "E2000",
  "context": {
    "resource": "guideline",
    "identifier": "gl_abc123",
    "suggestion": "Check that the guideline exists and you have the correct ID"
  }
}
```

**Resolution:** Verify the resource ID exists. Use list operations to find valid IDs.

---

### E2001 - ALREADY_EXISTS

**Description:** Attempted to create a resource that already exists.

**Example:**

```json
{
  "error": "Tool with name 'my-tool' already exists in this scope",
  "code": "E2001"
}
```

**Resolution:** Use a different name or update the existing resource instead.

---

### E2002 - CONFLICT

**Description:** A conflict was detected, typically from concurrent writes.

**Example:**

```json
{
  "error": "Conflict detected: guideline - concurrent update within 5 seconds",
  "code": "E2002",
  "context": {
    "resource": "guideline",
    "suggestion": "Check for recent updates and resolve using memory_conflict tool"
  }
}
```

**Resolution:** Use `memory_conflict` tool to list and resolve conflicts.

---

</details>

## Lock Errors (E3000-E3999)

<details>
<summary><strong>Show details</strong></summary>

### E3000 - FILE_LOCKED

**Description:** The file is currently locked by another agent.

**Example:**

```json
{
  "error": "File is locked: /src/index.ts (locked by: agent-2)",
  "code": "E3000",
  "context": {
    "filePath": "/src/index.ts",
    "lockedBy": "agent-2",
    "suggestion": "Wait for the lock to be released or use force_unlock if stale"
  }
}
```

**Resolution:** Wait for the lock to expire or be released. Use `force_unlock` only if the lock is clearly stale.

---

### E3001 - LOCK_NOT_FOUND

**Description:** The specified lock does not exist.

**Example:**

```json
{
  "error": "Lock not found for file: /src/missing.ts",
  "code": "E3001"
}
```

**Resolution:** The file may not be locked. Check lock status before attempting to release.

---

### E3002 - LOCK_EXPIRED

**Description:** The lock has expired.

**Example:**

```json
{
  "error": "Lock expired for file: /src/index.ts",
  "code": "E3002"
}
```

**Resolution:** Acquire a new lock before proceeding with modifications.

---

</details>

## Database Errors (E4000-E4999)

<details>
<summary><strong>Show details</strong></summary>

### E4000 - DATABASE_ERROR

**Description:** A general database operation failed.

**Example:**

```json
{
  "error": "Database error: constraint violation",
  "code": "E4000"
}
```

**Resolution:** Check the error details. May indicate data integrity issues.

---

### E4001 - MIGRATION_ERROR

**Description:** A database migration failed.

**Example:**

```json
{
  "error": "Migration failed: 0005_add_permissions.sql",
  "code": "E4001"
}
```

**Resolution:** Check migration file syntax. Review database state. Use `memory_init` with `verbose: true` for details.

---

</details>

## System Errors (E5000-E5999)

<details>
<summary><strong>Show details</strong></summary>

### E5000 - UNKNOWN_ERROR

**Description:** An unexpected error occurred.

**Example:**

```json
{
  "error": "An unexpected error occurred",
  "code": "E5000"
}
```

**Resolution:** Check server logs for details. Report if persistent.

---

### E5001 - INTERNAL_ERROR

**Description:** An internal server error occurred.

**Example:**

```json
{
  "error": "Internal error: failed to generate embedding",
  "code": "E5001"
}
```

**Resolution:** Check configuration and dependencies. May indicate missing API keys or service unavailability.

---

</details>

## Permission Errors (E6000-E6999)

<details>
<summary><strong>Show details</strong></summary>

### E6000 - PERMISSION_DENIED

**Description:** The agent does not have permission for the requested operation.

**Example:**

```json
{
  "error": "Permission denied: write access required for guideline gl_abc123",
  "code": "E6000",
  "context": {
    "action": "write",
    "resource": "guideline",
    "identifier": "gl_abc123",
    "suggestion": "Ensure you have write permissions for this guideline"
  }
}
```

**Resolution:** Request appropriate permissions from an admin, or use an agent with sufficient access.

---

</details>

## Error Handling Best Practices

<details>
<summary><strong>Show details</strong></summary>

### 1. Check Error Codes Programmatically

```typescript
if (result.code === 'E2000') {
  // Handle not found
} else if (result.code?.startsWith('E1')) {
  // Handle validation errors
}
```

### 2. Use Error Context

Error context provides additional information for debugging and user feedback:

```typescript
if (result.context?.suggestion) {
  console.log(`Suggestion: ${result.context.suggestion}`);
}
```

### 3. Implement Retry Logic

For transient errors (E3000 file locks, E5001 internal errors), implement retry with backoff:

```typescript
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 'E3000' || error.code === 'E5001') {
        await sleep(1000 * (i + 1)); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}
```

</details>

## See Also

- [MCP Tools](mcp-tools.md) - Complete tool documentation
- [Security](../concepts/security.md) - Security features and best practices
- [Troubleshooting](../guides/troubleshooting.md) - Common issues and solutions
