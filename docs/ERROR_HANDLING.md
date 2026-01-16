# Error Handling Guidelines

## Overview

This document establishes the error handling policy for the agent-memory project. Consistent error handling improves debugging, prevents silent failures, and provides better error messages to users.

## Error Handling Policy

### 1. SERVICE LAYER

**Rules:**

- Throw `AgentMemoryError` or subclasses (DatabaseError, ValidationError, etc.)
- Log at error level with structured context
- Never swallow errors silently
- Include relevant context in error objects

**Example:**

```typescript
import { createComponentLogger } from '../utils/logger.js';
import { createDatabaseError } from '../core/errors.js';

const logger = createComponentLogger('myservice');

try {
  const result = await db.query(/* ... */);
  return result;
} catch (error) {
  logger.error({ error, query }, 'Database query failed');
  throw createDatabaseError(
    'Failed to execute query',
    error instanceof Error ? error : new Error(String(error))
  );
}
```

### 2. REPOSITORY LAYER

**Rules:**

- Throw `DatabaseError` for DB failures
- Wrap third-party errors with context
- Log at debug level for expected cases (e.g., not found)
- Log at error level for unexpected failures

**Example:**

```typescript
import { createComponentLogger } from '../utils/logger.js';
import { createDatabaseError } from '../core/errors.js';

const logger = createComponentLogger('repository');

async function getById(id: string): Promise<Entity | undefined> {
  try {
    const result = db.select()...;
    if (!result) {
      logger.debug({ id }, 'Entity not found');
      return undefined;
    }
    return result;
  } catch (error) {
    logger.error({ error, id }, 'Failed to fetch entity');
    throw createDatabaseError(
      `Failed to fetch entity ${id}`,
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
```

### 3. HANDLER LAYER (MCP)

**Rules:**

- Catch service errors
- Convert to MCP-formatted error responses
- Return error objects, don't throw
- Sanitize error messages in production

**Example:**

```typescript
export async function myHandler(context: AppContext, params: Record<string, unknown>) {
  try {
    // Validate params
    const id = getRequiredParam(params, 'id', isString);

    // Call service
    const result = await context.services.myService.doSomething(id);

    return { success: true, result };
  } catch (error) {
    // Log and return formatted error
    logger.error({ error, params }, 'Handler failed');
    return {
      error: error instanceof AgentMemoryError ? error.code : 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
```

### 4. RETRY LOGIC

**Rules:**

- Use `RetryExhaustedError` after max attempts
- Log each retry at debug level
- Log final failure at error level
- Include attempt count in context

**Example:**

```typescript
let lastError: Error | undefined;
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    return await operation();
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    logger.debug({ error, attempt, maxRetries }, 'Operation failed, retrying');
    await sleep(retryDelayMs * attempt);
  }
}

logger.error({ error: lastError, maxRetries }, 'Operation failed after all retries');
throw new RetryExhaustedError('operation', maxRetries, lastError);
```

## Timeout Handling

**Rules:**

- Wrap timeout errors with context
- Include timeout value in error message
- Use `TimeoutError` subclass when available

**Example:**

```typescript
try {
  const response = await this.client.chat.completions.create({
    ...options,
    timeout: this.config.timeoutMs,
  });
  return response;
} catch (error) {
  if (error.name === 'TimeoutError' || error.code === 'ETIMEDOUT') {
    logger.error({ timeoutMs: this.config.timeoutMs }, 'Operation timed out');
    throw new TimeoutError('extraction', this.config.timeoutMs, {
      provider: this.config.provider,
      model: this.config.model,
    });
  }
  throw error;
}
```

## Silent Error Anti-Patterns

### ❌ BAD: Silent Catch

```typescript
try {
  const session = await getSession(id);
} catch {
  // Session table may not exist
  // ❌ SILENT FAILURE - no logging
}
```

### ✅ GOOD: Logged Fallback

```typescript
try {
  const session = await getSession(id);
} catch (error) {
  logger.debug({ error, sessionId: id }, 'Session lookup failed, using fallback');
  // Fallback behavior is intentional and documented
}
```

## Error Context Guidelines

**Always include:**

- Operation being performed
- Relevant IDs (entryId, projectId, etc.)
- Configuration values (timeouts, limits)
- User-provided input (sanitized)

**Never include:**

- Passwords or API keys
- Full request/response bodies (use summaries)
- PII without consent
- Internal system paths in production

## Testing Error Paths

**All error handlers must have tests:**

```typescript
it('should handle database errors gracefully', async () => {
  // Mock failure
  vi.spyOn(db, 'query').mockRejectedValue(new Error('Connection failed'));

  // Verify error handling
  await expect(service.doSomething()).rejects.toThrow(DatabaseError);
  expect(logger.error).toHaveBeenCalledWith(
    expect.objectContaining({ error: expect.any(Error) }),
    'Database query failed'
  );
});
```

## Migration Checklist

When updating error handling in existing code:

- [ ] Add structured logger if not present
- [ ] Replace `console.*` with `logger.*`
- [ ] Add error context objects
- [ ] Ensure errors are thrown, not swallowed
- [ ] Add debug logging for expected failures
- [ ] Add error logging for unexpected failures
- [ ] Update tests to verify error handling
- [ ] Document intentional fallback behavior

## Summary

| Layer         | Throw                          | Log Level                            | Return Errors         |
| ------------- | ------------------------------ | ------------------------------------ | --------------------- |
| Service       | ✅ AgentMemoryError subclasses | error                                | ❌ Propagate up       |
| Repository    | ✅ DatabaseError               | error (unexpected), debug (expected) | ❌ Propagate up       |
| Handler (MCP) | ❌ Catch and format            | error                                | ✅ Formatted response |
| Retry Logic   | ✅ RetryExhaustedError         | debug (per attempt), error (final)   | ❌ Propagate up       |

## See Also

- `/src/core/errors.ts` - Error class definitions
- `/src/utils/logger.ts` - Logger utilities
- `/tests/unit/error-handling.test.ts` - Error handling tests
