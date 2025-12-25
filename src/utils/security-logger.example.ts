/**
 * Security Logger Usage Examples
 *
 * This file demonstrates various use cases for the security logger.
 * These examples show how to integrate security logging throughout the application.
 */

import { securityLogger, SecuritySeverity } from './security-logger.js';

/**
 * Example 1: Authentication Failures
 * Log when authentication fails due to invalid credentials
 */
export function exampleAuthFailure() {
  // Invalid API key attempt
  securityLogger.logAuthFailure({
    reason: 'Invalid API key provided',
    tokenType: 'API Key',
    ip: '192.168.1.100',
    path: '/api/knowledge/add',
    method: 'POST',
    userAgent: 'curl/7.79.1',
  });

  // Expired token
  securityLogger.logAuthFailure({
    reason: 'Token has expired',
    tokenType: 'Bearer',
    ip: '10.0.1.50',
    path: '/api/guideline/list',
    userAgent: 'PostmanRuntime/7.29.0',
    repeated: false,
  });

  // Repeated failures (possible brute force)
  securityLogger.logAuthFailure({
    reason: 'Invalid credentials - 5th attempt',
    tokenType: 'Bearer',
    ip: '192.168.1.100',
    repeated: true,
    metadata: {
      attemptCount: 5,
      timeWindow: '60s',
    },
  });
}

/**
 * Example 2: Rate Limit Violations
 * Log when clients exceed rate limits
 */
export function exampleRateLimitViolations() {
  // Burst limit exceeded (serious)
  securityLogger.logRateLimitExceeded({
    limitType: 'burst',
    agentId: 'cursor-ai',
    currentCount: 21,
    maxRequests: 20,
    windowMs: 1000,
    retryAfterMs: 500,
    ip: '192.168.1.100',
  });

  // Per-agent limit exceeded
  securityLogger.logRateLimitExceeded({
    limitType: 'per-agent',
    agentId: 'test-agent',
    currentCount: 1001,
    maxRequests: 1000,
    windowMs: 60000,
    retryAfterMs: 5000,
  });

  // Global rate limit
  securityLogger.logRateLimitExceeded({
    limitType: 'global',
    currentCount: 10001,
    maxRequests: 10000,
    windowMs: 3600000,
    retryAfterMs: 60000,
    metadata: {
      peakHour: true,
    },
  });
}

/**
 * Example 3: Permission Denials
 * Log when access control prevents an action
 */
export function examplePermissionDenials() {
  // Write permission denied
  securityLogger.logPermissionDenied({
    resource: 'knowledge',
    action: 'write',
    agentId: 'read-only-agent',
    requiredPermission: 'knowledge:write',
    scope: 'project:abc-123',
    path: '/api/knowledge/add',
  });

  // Delete permission denied
  securityLogger.logPermissionDenied({
    resource: 'guideline',
    action: 'delete',
    agentId: 'cursor-ai',
    requiredPermission: 'guideline:delete',
    scope: 'global',
    metadata: {
      guidelineId: 'gl-456',
      scopeType: 'global',
    },
  });

  // Cross-project access denied
  securityLogger.logPermissionDenied({
    resource: 'tool',
    action: 'read',
    agentId: 'project-a-agent',
    scope: 'project:project-b',
    metadata: {
      attemptedProject: 'project-b',
      agentProject: 'project-a',
    },
  });
}

/**
 * Example 4: Suspicious Activity Detection
 * Log potential security threats
 */
export function exampleSuspiciousActivity() {
  // SQL injection attempt (high confidence)
  securityLogger.logSuspiciousActivity({
    activityType: 'sql_injection_attempt',
    description: 'SQL keywords detected in search query',
    ip: '203.0.113.45',
    path: '/api/search',
    confidence: 0.95,
    indicators: ['UNION SELECT', 'DROP TABLE', '--'],
    metadata: {
      query: 'test" UNION SELECT * FROM users--',
      field: 'searchQuery',
    },
  });

  // Path traversal attempt
  securityLogger.logSuspiciousActivity({
    activityType: 'path_traversal_attempt',
    description: 'Directory traversal pattern detected',
    ip: '203.0.113.45',
    path: '/api/files/read',
    confidence: 0.9,
    indicators: ['../../../', '/etc/passwd'],
    metadata: {
      requestedPath: '../../../etc/passwd',
    },
  });

  // XSS attempt (medium confidence)
  securityLogger.logSuspiciousActivity({
    activityType: 'xss_attempt',
    description: 'Script tags in user input',
    ip: '198.51.100.10',
    path: '/api/knowledge/add',
    confidence: 0.7,
    indicators: ['<script>', 'javascript:'],
    metadata: {
      field: 'content',
    },
  });

  // Unusual access pattern
  securityLogger.logSuspiciousActivity({
    activityType: 'unusual_access_pattern',
    description: 'Sequential ID enumeration detected',
    ip: '198.51.100.10',
    confidence: 0.6,
    indicators: ['sequential_ids', 'high_frequency'],
    metadata: {
      requestCount: 100,
      timeWindow: '10s',
      pattern: 'id_1,id_2,id_3,...,id_100',
    },
  });
}

/**
 * Example 5: Invalid Input
 * Log malformed or malicious input
 */
export function exampleInvalidInput() {
  // Path traversal in file path
  securityLogger.logInvalidInput({
    description: 'Path traversal attempt in file parameter',
    path: '/api/files',
    method: 'GET',
    metadata: {
      parameter: 'filename',
      value: '../../../etc/passwd',
    },
  });

  // Oversized payload
  securityLogger.logInvalidInput({
    description: 'Payload exceeds maximum size',
    path: '/api/knowledge/add',
    method: 'POST',
    metadata: {
      maxSize: '1MB',
      actualSize: '10MB',
    },
  });

  // Invalid JSON structure
  securityLogger.logInvalidInput({
    description: 'Malformed JSON in request body',
    path: '/api/guideline/add',
    method: 'POST',
    metadata: {
      error: 'Unexpected token',
    },
  });
}

/**
 * Example 6: Unauthorized Access
 * Log attempts to access protected resources without credentials
 */
export function exampleUnauthorizedAccess() {
  // No credentials provided
  securityLogger.logUnauthorizedAccess({
    description: 'Attempted to access protected endpoint without credentials',
    path: '/api/admin/users',
    method: 'GET',
    ip: '203.0.113.100',
    userAgent: 'Mozilla/5.0',
  });

  // Accessing admin endpoint
  securityLogger.logUnauthorizedAccess({
    description: 'Non-admin user attempted to access admin panel',
    path: '/api/admin/settings',
    method: 'PUT',
    ip: '192.168.1.50',
    metadata: {
      requiredRole: 'admin',
      userRole: 'user',
    },
  });
}

/**
 * Example 7: Custom Security Events
 * Log application-specific security events
 */
export function exampleCustomSecurityEvents() {
  // Data exfiltration attempt
  securityLogger.logSecurityEvent('data_exfiltration_attempt', {
    description: 'Large data export request detected',
    severity: SecuritySeverity.HIGH,
    agentId: 'cursor-ai',
    metadata: {
      recordCount: 10000,
      exportFormat: 'csv',
      dataType: 'user_records',
    },
  });

  // Configuration change
  securityLogger.logSecurityEvent('config_modification', {
    description: 'Security configuration modified',
    severity: SecuritySeverity.MEDIUM,
    agentId: 'admin-agent',
    metadata: {
      setting: 'rate_limit.enabled',
      oldValue: true,
      newValue: false,
    },
  });

  // Password policy violation
  securityLogger.logSecurityEvent('password_policy_violation', {
    description: 'Weak password detected',
    severity: SecuritySeverity.LOW,
    metadata: {
      violations: ['too_short', 'no_special_chars'],
      minLength: 12,
      actualLength: 6,
    },
  });
}

/**
 * Example 8: Real-world Integration Pattern
 * How to integrate security logging into a typical API endpoint
 */
export function exampleApiEndpointIntegration(
  req: { headers: Record<string, string>; body: unknown; ip: string },
  agentId?: string
) {
  // 1. Validate authentication
  if (!agentId) {
    securityLogger.logUnauthorizedAccess({
      description: 'No authentication credentials provided',
      path: '/api/knowledge/add',
      method: 'POST',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    throw new Error('Unauthorized');
  }

  // 2. Validate input
  if (typeof req.body !== 'object' || !req.body) {
    securityLogger.logInvalidInput({
      description: 'Invalid request body',
      path: '/api/knowledge/add',
      metadata: {
        bodyType: typeof req.body,
      },
    });
    throw new Error('Invalid input');
  }

  // 3. Check permissions
  const hasPermission = checkPermission(agentId, 'knowledge', 'write');
  if (!hasPermission) {
    securityLogger.logPermissionDenied({
      resource: 'knowledge',
      action: 'write',
      agentId,
      path: '/api/knowledge/add',
    });
    throw new Error('Permission denied');
  }

  // Process request...
}

// Mock function for example
function checkPermission(_agentId: string, _resource: string, _action: string): boolean {
  return true;
}

/**
 * Example 9: Correlation with Request IDs
 * Track security events across distributed systems
 */
export function exampleRequestCorrelation() {
  const requestId = 'req-abc-123';

  securityLogger.logAuthFailure({
    reason: 'Token validation failed',
    requestId,
    path: '/api/query',
    metadata: {
      service: 'auth-service',
      traceId: 'trace-xyz-789',
    },
  });

  // Later in the request flow...
  securityLogger.logPermissionDenied({
    resource: 'knowledge',
    action: 'read',
    requestId,
    metadata: {
      service: 'permission-service',
      traceId: 'trace-xyz-789',
    },
  });
}

/**
 * Example 10: Monitoring and Alerting Patterns
 * Examples of log queries for security monitoring
 */
export function exampleMonitoringQueries() {
  /*
  # Query 1: Find high-severity security events
  cat logs/agent-memory.log | \
    jq 'select(.event and (.severity == "high" or .severity == "critical"))'

  # Query 2: Detect brute force attempts (repeated auth failures)
  cat logs/agent-memory.log | \
    jq 'select(.event == "auth_failure" and .repeated == true)'

  # Query 3: Track rate limit violations by agent
  cat logs/agent-memory.log | \
    jq 'select(.event == "rate_limit_exceeded")' | \
    jq -s 'group_by(.agentId) | map({agent: .[0].agentId, count: length})'

  # Query 4: Monitor suspicious activity
  cat logs/agent-memory.log | \
    jq 'select(.event == "suspicious_activity" and .confidence > 0.8)'

  # Query 5: Identify IPs with multiple security events
  cat logs/agent-memory.log | \
    jq 'select(.event and .ip)' | \
    jq -s 'group_by(.ip) | map({ip: .[0].ip, events: length}) | sort_by(.events) | reverse'
  */
}
