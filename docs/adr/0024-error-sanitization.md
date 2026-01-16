# ADR-0024: Error Sanitization Strategy

## Status

Accepted

## Context

Error messages often contain sensitive information:

- File paths (reveal server directory structure)
- IP addresses (reveal network topology)
- Connection strings (reveal credentials)
- Stack traces (reveal code structure)

In development, detailed errors aid debugging. In production, they create security risks. We needed a strategy that:

- Prevents information disclosure in production
- Maintains debuggability in development
- Is performant (errors happen frequently)
- Covers all common sensitive patterns

## Decision

Sanitize error messages in production using pre-compiled regex patterns while preserving full details in development.

### Sanitization Patterns

```typescript
// src/core/errors.ts
const SANITIZE_PATTERNS = {
  // Unix paths: /Users/name/project/... → [PATH]
  unixPaths: /\/(?:Users|home|var|tmp|opt|etc|usr)\/[^\s:,)'"]+/gi,

  // Windows paths: C:\Users\... → [PATH]
  windowsPaths: /[A-Z]:\\[^\s:,)'"]+/gi,

  // IPv4 addresses: 192.168.1.1 → [IP]
  ipv4: /\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,

  // Connection strings: postgres://user:pass@host → [CONNECTION]
  connectionStrings: /(?:postgres|postgresql|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@[^\s]+/gi,

  // Stack traces: at Function.name (file:line) → [STACK]
  stackTraces: /at\s+[\w.<>]+\s+\([^)]+\)/g,

  // Environment variables in messages: process.env.SECRET → [ENV]
  envVars: /process\.env\.[A-Z_]+/g,

  // UUIDs that might be session/request IDs
  uuids: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
};
```

### Pre-Compilation

Patterns are compiled once at module load, not per-error:

```typescript
// Compiled once at startup
const COMPILED_PATTERNS = Object.entries(SANITIZE_PATTERNS).map(([name, pattern]) => ({
  name,
  regex: new RegExp(pattern.source, pattern.flags),
  replacement: `[${name.toUpperCase()}]`,
}));
```

### Sanitization Function

```typescript
function sanitizeErrorMessage(message: string): string {
  if (process.env.NODE_ENV === 'development') {
    return message; // Full details in dev
  }

  let sanitized = message;
  for (const { regex, replacement } of COMPILED_PATTERNS) {
    sanitized = sanitized.replace(regex, replacement);
  }

  return sanitized;
}
```

### Error Code System

Complement sanitization with error codes for programmatic handling:

```typescript
enum ErrorCode {
  // Database errors: E1xxx
  E1001 = 'DATABASE_CONNECTION_FAILED',
  E1002 = 'DATABASE_QUERY_FAILED',
  E1003 = 'DATABASE_TRANSACTION_FAILED',

  // Validation errors: E2xxx
  E2001 = 'VALIDATION_FAILED',
  E2002 = 'INVALID_SCOPE',
  E2003 = 'INVALID_ENTRY_TYPE',

  // Permission errors: E3xxx
  E3001 = 'PERMISSION_DENIED',
  E3002 = 'AGENT_NOT_AUTHORIZED',

  // ... more codes
}

class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(sanitizeErrorMessage(message));
    this.name = code;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message, // Already sanitized
      // details omitted in production
      ...(process.env.NODE_ENV === 'development' && { details: this.details }),
    };
  }
}
```

### Usage in Error Handlers

```typescript
// MCP error handler
function handleError(error: unknown): MCPError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message, // Sanitized
    };
  }

  // Unknown errors get generic message in production
  const message =
    process.env.NODE_ENV === 'development' ? String(error) : 'An unexpected error occurred';

  return {
    code: 'E9999',
    message: sanitizeErrorMessage(message),
  };
}
```

## Consequences

**Positive:**

- No sensitive data in production error responses
- Full debugging info available in development
- Pre-compiled patterns are performant
- Error codes enable programmatic error handling
- Patterns are centralized and auditable

**Negative:**

- Sanitized errors harder to debug in production (use logs instead)
- Pattern maintenance required as new sensitive data types emerge
- Risk of over-sanitization (removing useful info)
- Must remember to use AppError, not raw Error

## References

- Code locations:
  - `src/core/errors.ts` - Sanitization and error classes
  - `src/mcp/handlers/*.ts` - Error handling in handlers
  - `src/utils/logger.ts` - Logging (preserves full details server-side)
- Related ADRs: None
- Principles: O1 (Deny by Default), O5 (Observable by Default)
