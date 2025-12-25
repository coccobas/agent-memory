# Security Event Logging

The security logging utility provides structured, standardized logging for security-relevant events across the Agent Memory system. This enables monitoring, alerting, and audit compliance for security incidents.

## Overview

Security events are logged using a dedicated `SecurityLogger` class that wraps the base Pino logger with security-specific context and formatting. All security events are:

- **Structured** - Logged in JSON format with consistent fields
- **Sanitized** - Sensitive data is automatically redacted
- **Categorized** - Events are tagged with specific security event types
- **Severity-graded** - Each event has an appropriate severity level

## Usage

### Import the Logger

```typescript
import { securityLogger } from '../utils/security-logger.js';
```

The `securityLogger` is a singleton instance ready to use. You can also create custom instances:

```typescript
import { SecurityLogger } from '../utils/security-logger.js';
const customLogger = new SecurityLogger();
```

### Logging Security Events

#### Authentication Failures

Log failed authentication attempts:

```typescript
securityLogger.logAuthFailure({
  reason: 'Invalid API key',
  tokenType: 'Bearer',
  ip: '192.168.1.100',
  path: '/api/query',
  userAgent: 'MyClient/1.0',
  repeated: false,
});
```

**Output:**
```json
{
  "level": "warn",
  "event": "auth_failure",
  "severity": "medium",
  "timestamp": "2025-12-25T09:30:00.000Z",
  "reason": "Invalid API key",
  "tokenType": "***REDACTED***",
  "ip": "192.168.1.100",
  "path": "/api/query",
  "userAgent": "MyClient/1.0",
  "msg": "Authentication failed: Invalid API key"
}
```

#### Rate Limit Violations

Log when rate limits are exceeded:

```typescript
securityLogger.logRateLimitExceeded({
  limitType: 'per-agent',
  agentId: 'cursor-ai',
  currentCount: 101,
  maxRequests: 100,
  windowMs: 60000,
  retryAfterMs: 5000,
  ip: '192.168.1.100',
});
```

**Severity:** `HIGH` for burst limits, `MEDIUM` for other limits

#### Permission Denials

Log access control failures:

```typescript
securityLogger.logPermissionDenied({
  resource: 'knowledge',
  action: 'write',
  agentId: 'cursor-ai',
  requiredPermission: 'knowledge:write',
  scope: 'project:123',
  path: '/api/knowledge/add',
});
```

#### Suspicious Activity

Log potential security threats:

```typescript
securityLogger.logSuspiciousActivity({
  activityType: 'sql_injection_attempt',
  description: 'SQL keywords detected in input',
  ip: '192.168.1.100',
  path: '/api/search',
  confidence: 0.85,
  indicators: ['UNION SELECT', 'DROP TABLE'],
});
```

**Severity:** Automatically determined by confidence level
- `confidence > 0.8` → `HIGH` severity
- `confidence ≤ 0.8` → `MEDIUM` severity

#### Invalid Input

Log malicious or malformed input:

```typescript
securityLogger.logInvalidInput({
  description: 'Path traversal attempt detected',
  path: '/api/files',
  metadata: { input: '../../../etc/passwd' },
});
```

#### Unauthorized Access

Log access attempts without credentials:

```typescript
securityLogger.logUnauthorizedAccess({
  description: 'Attempted access without credentials',
  path: '/api/admin',
  ip: '192.168.1.100',
  method: 'POST',
});
```

#### Generic Security Events

Log custom security events:

```typescript
securityLogger.logSecurityEvent('custom_security_check', {
  description: 'Unusual access pattern detected',
  severity: SecuritySeverity.LOW,
  agentId: 'cursor-ai',
  metadata: { pattern: 'high_frequency_writes' },
});
```

## Event Types

### Built-in Event Types

| Event Type | Description | Typical Severity |
|------------|-------------|------------------|
| `auth_failure` | Failed authentication attempt | `MEDIUM` |
| `rate_limit_exceeded` | Rate limit violation | `HIGH` (burst), `MEDIUM` (other) |
| `permission_denied` | Access control failure | `MEDIUM` |
| `suspicious_activity` | Potential security threat | `HIGH` or `MEDIUM` |
| `invalid_input` | Malicious/malformed input | `MEDIUM` |
| `unauthorized_access` | No credentials provided | `MEDIUM` |
| `token_validation_failed` | Token verification failure | `MEDIUM` |
| `security_policy_violation` | Policy breach | Varies |

### Severity Levels

| Severity | Log Level | Description | Use Cases |
|----------|-----------|-------------|-----------|
| `LOW` | `warn` | Informational security event | Anomalies, low-confidence detections |
| `MEDIUM` | `warn` | Standard security violation | Failed auth, rate limits, permission denials |
| `HIGH` | `error` | Serious security incident | Burst limit exceeded, high-confidence threats |
| `CRITICAL` | `error` | Critical security breach | System compromise, data exfiltration |

## Event Details Structure

All security events include a common base structure with optional additional fields:

### Base Fields (Available for All Events)

```typescript
interface BaseSecurityDetails {
  ip?: string;              // Client IP address
  userAgent?: string;       // User agent string
  path?: string;            // Request path or endpoint
  method?: string;          // HTTP method (GET, POST, etc.)
  agentId?: string;         // Authenticated agent ID
  requestId?: string;       // Request correlation ID
  metadata?: Record<string, unknown>; // Additional context
}
```

### Event-Specific Fields

#### AuthFailureDetails
```typescript
{
  reason: string;           // Required: Why auth failed
  tokenType?: string;       // Bearer, API Key, etc.
  repeated?: boolean;       // Repeated failure from same source
}
```

#### RateLimitDetails
```typescript
{
  limitType: 'burst' | 'global' | 'per-agent' | 'health'; // Required
  currentCount?: number;    // Current request count
  maxRequests?: number;     // Max allowed requests
  windowMs?: number;        // Time window in milliseconds
  retryAfterMs?: number;    // Milliseconds until reset
}
```

#### PermissionDeniedDetails
```typescript
{
  resource: string;         // Required: Resource being accessed
  action: string;           // Required: Action attempted
  requiredPermission?: string; // Permission needed
  scope?: string;           // Scope of permission check
}
```

#### SuspiciousActivityDetails
```typescript
{
  activityType: string;     // Required: Type of suspicious activity
  description: string;      // Required: Detailed description
  confidence?: number;      // Detection confidence (0-1)
  indicators?: string[];    // Indicators that triggered alert
}
```

## Integration Examples

### Security Service Integration

The `SecurityService` integrates the security logger to track authentication and rate limiting events:

```typescript
// In SecurityService.validateRequest()

// Log failed authentication
if (token && !resolved) {
  securityLogger.logAuthFailure({
    reason: 'Invalid or unrecognized token',
    tokenType: 'Bearer',
    userAgent: String(headers['user-agent'] ?? ''),
  });
}

// Log rate limit exceeded
if (!limitResult.allowed) {
  securityLogger.logRateLimitExceeded({
    limitType: 'per-agent',
    agentId,
    currentCount: limitResult.limit,
    maxRequests: limitResult.limit,
    retryAfterMs: limitResult.retryAfterMs,
  });
}
```

### Permission Service Integration

Example of logging permission denials:

```typescript
if (!hasPermission(agentId, scope, entryType, 'write')) {
  securityLogger.logPermissionDenied({
    resource: entryType,
    action: 'write',
    agentId,
    requiredPermission: `${entryType}:write`,
    scope: `${scope.type}:${scope.id}`,
  });
  throw new PermissionError(`Permission denied`);
}
```

### Input Validation Integration

Example of logging suspicious input:

```typescript
if (containsSqlKeywords(input)) {
  securityLogger.logSuspiciousActivity({
    activityType: 'sql_injection_attempt',
    description: 'SQL keywords detected in user input',
    confidence: 0.9,
    indicators: detectSqlPatterns(input),
    metadata: { field: 'search_query' },
  });
  throw new ValidationError('Invalid input');
}
```

## Monitoring and Alerting

Security logs can be consumed by monitoring systems for:

### Real-time Alerting

Filter on high-severity events:
```bash
# Example: Monitor for HIGH or CRITICAL security events
cat logs/agent-memory.log | \
  jq 'select(.event and (.severity == "high" or .severity == "critical"))'
```

### Pattern Detection

Detect repeated failures from same source:
```bash
# Example: Find IPs with multiple auth failures
cat logs/agent-memory.log | \
  jq 'select(.event == "auth_failure")' | \
  jq -s 'group_by(.ip) | map({ip: .[0].ip, count: length}) | sort_by(.count) | reverse'
```

### Rate Limit Analysis

Analyze rate limit violations:
```bash
# Example: Count rate limit violations by type
cat logs/agent-memory.log | \
  jq 'select(.event == "rate_limit_exceeded")' | \
  jq -s 'group_by(.limitType) | map({type: .[0].limitType, count: length})'
```

## Data Sanitization

All security event data is automatically sanitized using the existing sanitization utilities. This ensures:

1. **Sensitive key names** are redacted (e.g., `tokenType`, `apiKey`, `password`)
2. **API keys and tokens** in string values are masked
3. **Nested objects** are recursively sanitized
4. **Audit compliance** is maintained while protecting sensitive data

Example sanitization:
```typescript
// Input
{
  tokenType: 'Bearer',
  metadata: {
    apiKey: 'sk-secret-key-12345'
  }
}

// Output (sanitized)
{
  tokenType: '***REDACTED***',
  metadata: {
    apiKey: '***REDACTED***'
  }
}
```

## Best Practices

### DO

✅ **Log all security-relevant events** - Authentication, authorization, rate limiting, suspicious patterns
✅ **Include context** - IP, user agent, path, agent ID when available
✅ **Use appropriate severity** - Match severity to actual risk level
✅ **Provide clear descriptions** - Make events actionable for security teams
✅ **Log before throwing errors** - Ensure events are captured even if exceptions follow

### DON'T

❌ **Don't log sensitive data** - Sanitization helps, but avoid logging secrets entirely
❌ **Don't over-log** - Balance security visibility with noise
❌ **Don't block operations** - Logging should be fast and non-blocking
❌ **Don't duplicate logs** - Use security logger OR standard logger, not both

## Performance Considerations

- Security logging uses async I/O (via Pino)
- Sanitization adds minimal overhead (~microseconds)
- Logs to stderr in MCP server mode (no stdout pollution)
- Automatically disabled in test environment
- JSON formatting optimized for machine parsing

## Testing

Security logger behavior is fully tested:

```bash
npm test -- tests/unit/security-logger.test.ts
```

Tests cover:
- All event types and severity levels
- Data sanitization
- Timestamp generation
- Optional field handling
- Singleton instance behavior

## Related Documentation

- [Error Codes](./error-codes.md) - Application error code reference
- [Environment Variables](./env-vars.md) - Logging configuration
- [REST API](./rest-api.md) - API authentication and security
- [MCP Tools](./mcp-tools.md) - Permission system integration

## Implementation Details

**Source Files:**
- `/src/utils/security-logger.ts` - SecurityLogger class and types
- `/src/utils/sanitize.ts` - Data sanitization utilities
- `/src/utils/logger.ts` - Base Pino logger configuration
- `/tests/unit/security-logger.test.ts` - Comprehensive test suite

**Integration Points:**
- `SecurityService` - Authentication and rate limiting
- `PermissionService` - Access control
- `ValidationService` - Input validation
- REST API middleware - Request validation
