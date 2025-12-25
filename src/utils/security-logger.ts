/**
 * Security event logging utility
 *
 * Provides structured logging for security-relevant events with standardized
 * format, context, and severity levels. Wraps the base logger with security-specific
 * functionality to enable monitoring, alerting, and audit compliance.
 *
 * Security events include:
 * - Authentication failures
 * - Rate limit violations
 * - Access control denials
 * - Suspicious activity patterns
 * - Security policy violations
 */

import type pino from 'pino';
import { createComponentLogger } from './logger.js';
import { sanitizeForLogging } from './sanitize.js';

/**
 * Security event types for categorization and filtering
 */
export enum SecurityEventType {
  AUTH_FAILURE = 'auth_failure',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  PERMISSION_DENIED = 'permission_denied',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  INVALID_INPUT = 'invalid_input',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  TOKEN_VALIDATION_FAILED = 'token_validation_failed',
  SECURITY_POLICY_VIOLATION = 'security_policy_violation',
}

/**
 * Security event severity levels
 */
export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Base interface for all security event details
 */
interface BaseSecurityDetails {
  /** Client IP address */
  ip?: string;
  /** User agent string */
  userAgent?: string;
  /** Request path or endpoint */
  path?: string;
  /** Request method (GET, POST, etc.) */
  method?: string;
  /** Agent ID if authenticated */
  agentId?: string;
  /** Request ID for correlation */
  requestId?: string;
  /** Additional context-specific data */
  metadata?: Record<string, unknown>;
}

/**
 * Details for authentication failure events
 */
export interface AuthFailureDetails extends BaseSecurityDetails {
  /** Reason for authentication failure */
  reason: string;
  /** Token type that failed (Bearer, API Key, etc.) */
  tokenType?: string;
  /** Whether this is a repeated failure from same source */
  repeated?: boolean;
}

/**
 * Details for rate limit exceeded events
 */
export interface RateLimitDetails extends BaseSecurityDetails {
  /** Type of rate limit exceeded */
  limitType: 'burst' | 'global' | 'per-agent' | 'health';
  /** Current request count */
  currentCount?: number;
  /** Maximum allowed requests */
  maxRequests?: number;
  /** Time window in milliseconds */
  windowMs?: number;
  /** Milliseconds until limit resets */
  retryAfterMs?: number;
}

/**
 * Details for permission denied events
 */
export interface PermissionDeniedDetails extends BaseSecurityDetails {
  /** Resource being accessed */
  resource: string;
  /** Action being attempted */
  action: string;
  /** Required permission */
  requiredPermission?: string;
  /** Scope of the permission check */
  scope?: string;
}

/**
 * Details for suspicious activity events
 */
export interface SuspiciousActivityDetails extends BaseSecurityDetails {
  /** Type of suspicious activity detected */
  activityType: string;
  /** Detailed description of the suspicious pattern */
  description: string;
  /** Confidence level of detection (0-1) */
  confidence?: number;
  /** Indicators that triggered the alert */
  indicators?: string[];
}

/**
 * Generic security event details
 */
export interface GenericSecurityDetails extends BaseSecurityDetails {
  /** Human-readable description of the event */
  description: string;
  /** Severity level override */
  severity?: SecuritySeverity;
}

/**
 * SecurityLogger wraps the base logger with security-specific functionality.
 * All security events are logged with consistent structure and proper severity.
 */
export class SecurityLogger {
  private readonly logger: pino.Logger;

  constructor() {
    this.logger = createComponentLogger('security');
  }

  /**
   * Log a failed authentication attempt
   *
   * @param details - Authentication failure details
   * @example
   * securityLogger.logAuthFailure({
   *   reason: 'Invalid API key',
   *   tokenType: 'Bearer',
   *   ip: '192.168.1.100',
   *   path: '/api/query',
   *   repeated: false
   * });
   */
  logAuthFailure(details: AuthFailureDetails): void {
    const sanitizedDetails = sanitizeForLogging(details) as Record<string, unknown>;
    this.logger.warn(
      {
        event: SecurityEventType.AUTH_FAILURE,
        severity: SecuritySeverity.MEDIUM,
        timestamp: new Date().toISOString(),
        ...sanitizedDetails,
      },
      `Authentication failed: ${details.reason}`
    );
  }

  /**
   * Log a rate limit violation
   *
   * @param details - Rate limit details
   * @example
   * securityLogger.logRateLimitExceeded({
   *   limitType: 'per-agent',
   *   agentId: 'cursor-ai',
   *   currentCount: 101,
   *   maxRequests: 100,
   *   windowMs: 60000,
   *   ip: '192.168.1.100'
   * });
   */
  logRateLimitExceeded(details: RateLimitDetails): void {
    const sanitizedDetails = sanitizeForLogging(details) as Record<string, unknown>;
    const severity =
      details.limitType === 'burst' ? SecuritySeverity.HIGH : SecuritySeverity.MEDIUM;

    this.logger.warn(
      {
        event: SecurityEventType.RATE_LIMIT_EXCEEDED,
        severity,
        timestamp: new Date().toISOString(),
        ...sanitizedDetails,
      },
      `Rate limit exceeded: ${details.limitType} limit`
    );
  }

  /**
   * Log an access control failure
   *
   * @param details - Permission denial details
   * @example
   * securityLogger.logPermissionDenied({
   *   resource: 'knowledge',
   *   action: 'write',
   *   agentId: 'cursor-ai',
   *   requiredPermission: 'knowledge:write',
   *   scope: 'project:123'
   * });
   */
  logPermissionDenied(details: PermissionDeniedDetails): void {
    const sanitizedDetails = sanitizeForLogging(details) as Record<string, unknown>;
    this.logger.warn(
      {
        event: SecurityEventType.PERMISSION_DENIED,
        severity: SecuritySeverity.MEDIUM,
        timestamp: new Date().toISOString(),
        ...sanitizedDetails,
      },
      `Permission denied: ${details.action} on ${details.resource}`
    );
  }

  /**
   * Log suspicious activity that may indicate a security threat
   *
   * @param details - Suspicious activity details
   * @example
   * securityLogger.logSuspiciousActivity({
   *   activityType: 'sql_injection_attempt',
   *   description: 'SQL keywords detected in input',
   *   ip: '192.168.1.100',
   *   path: '/api/search',
   *   confidence: 0.85,
   *   indicators: ['UNION SELECT', 'DROP TABLE']
   * });
   */
  logSuspiciousActivity(details: SuspiciousActivityDetails): void {
    const sanitizedDetails = sanitizeForLogging(details) as Record<string, unknown>;
    const severity =
      details.confidence && details.confidence > 0.8
        ? SecuritySeverity.HIGH
        : SecuritySeverity.MEDIUM;

    this.logger.error(
      {
        event: SecurityEventType.SUSPICIOUS_ACTIVITY,
        severity,
        timestamp: new Date().toISOString(),
        ...sanitizedDetails,
      },
      `Suspicious activity detected: ${details.activityType} - ${details.description}`
    );
  }

  /**
   * Log a generic security event with custom type
   *
   * @param eventType - Type of security event
   * @param details - Event details
   * @example
   * securityLogger.logSecurityEvent('custom_event', {
   *   description: 'Unusual access pattern detected',
   *   severity: SecuritySeverity.LOW,
   *   agentId: 'cursor-ai',
   *   metadata: { pattern: 'high_frequency_writes' }
   * });
   */
  logSecurityEvent(eventType: string, details: GenericSecurityDetails): void {
    const sanitizedDetails = sanitizeForLogging(details) as Record<string, unknown>;
    const severity = details.severity ?? SecuritySeverity.LOW;
    const logLevel = this.selectLogLevel(severity);

    this.logger[logLevel](
      {
        event: eventType,
        severity,
        timestamp: new Date().toISOString(),
        ...sanitizedDetails,
      },
      details.description
    );
  }

  /**
   * Log invalid input that may indicate malicious intent
   *
   * @param details - Details about the invalid input
   * @example
   * securityLogger.logInvalidInput({
   *   description: 'Path traversal attempt detected',
   *   path: '/api/files',
   *   metadata: { input: '../../../etc/passwd' }
   * });
   */
  logInvalidInput(details: GenericSecurityDetails): void {
    const sanitizedDetails = sanitizeForLogging(details) as Record<string, unknown>;
    this.logger.warn(
      {
        event: SecurityEventType.INVALID_INPUT,
        severity: SecuritySeverity.MEDIUM,
        timestamp: new Date().toISOString(),
        ...sanitizedDetails,
      },
      `Invalid input detected: ${details.description}`
    );
  }

  /**
   * Log unauthorized access attempt
   *
   * @param details - Details about the unauthorized access
   * @example
   * securityLogger.logUnauthorizedAccess({
   *   description: 'Attempted access without credentials',
   *   path: '/api/admin',
   *   ip: '192.168.1.100'
   * });
   */
  logUnauthorizedAccess(details: GenericSecurityDetails): void {
    const sanitizedDetails = sanitizeForLogging(details) as Record<string, unknown>;
    this.logger.warn(
      {
        event: SecurityEventType.UNAUTHORIZED_ACCESS,
        severity: SecuritySeverity.MEDIUM,
        timestamp: new Date().toISOString(),
        ...sanitizedDetails,
      },
      `Unauthorized access attempt: ${details.description}`
    );
  }

  /**
   * Select appropriate log level based on severity
   */
  private selectLogLevel(severity: SecuritySeverity): 'warn' | 'error' {
    return severity === SecuritySeverity.HIGH || severity === SecuritySeverity.CRITICAL
      ? 'error'
      : 'warn';
  }
}

/**
 * Singleton instance for convenient import
 */
export const securityLogger = new SecurityLogger();
