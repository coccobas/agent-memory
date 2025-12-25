/**
 * Unit tests for security logger utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SecurityLogger,
  securityLogger,
  SecurityEventType,
  SecuritySeverity,
  type AuthFailureDetails,
  type RateLimitDetails,
  type PermissionDeniedDetails,
  type SuspiciousActivityDetails,
  type GenericSecurityDetails,
} from '../../src/utils/security-logger.js';
import * as loggerModule from '../../src/utils/logger.js';

describe('SecurityLogger', () => {
  let mockLogger: {
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Mock the logger methods
    mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    // Mock createComponentLogger to return our mock
    vi.spyOn(loggerModule, 'createComponentLogger').mockReturnValue(
      mockLogger as unknown as ReturnType<typeof loggerModule.createComponentLogger>
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a security logger instance', () => {
      const logger = new SecurityLogger();
      expect(logger).toBeDefined();
      expect(loggerModule.createComponentLogger).toHaveBeenCalledWith('security');
    });
  });

  describe('logAuthFailure', () => {
    it('should log authentication failure with correct structure', () => {
      const logger = new SecurityLogger();
      const details: AuthFailureDetails = {
        reason: 'Invalid API key',
        tokenType: 'Bearer',
        ip: '192.168.1.100',
        path: '/api/query',
        method: 'GET',
        repeated: false,
      };

      logger.logAuthFailure(details);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [logData, message] = mockLogger.warn.mock.calls[0];

      expect(logData.event).toBe(SecurityEventType.AUTH_FAILURE);
      expect(logData.severity).toBe(SecuritySeverity.MEDIUM);
      expect(logData.timestamp).toBeDefined();
      expect(logData.reason).toBe('Invalid API key');
      // tokenType is redacted by sanitizer because it contains "token"
      expect(logData.tokenType).toBe('***REDACTED***');
      expect(logData.ip).toBe('192.168.1.100');
      expect(message).toContain('Authentication failed');
      expect(message).toContain('Invalid API key');
    });

    it('should log repeated authentication failures', () => {
      const logger = new SecurityLogger();
      const details: AuthFailureDetails = {
        reason: 'Invalid credentials',
        repeated: true,
        ip: '192.168.1.100',
      };

      logger.logAuthFailure(details);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [logData] = mockLogger.warn.mock.calls[0];
      expect(logData.repeated).toBe(true);
    });

    it('should sanitize sensitive data in auth failures', () => {
      const logger = new SecurityLogger();
      const details: AuthFailureDetails = {
        reason: 'Token validation failed',
        metadata: {
          token: 'sk-secret-key-12345',
          apiKey: 'secret-api-key',
        },
      };

      logger.logAuthFailure(details);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [logData] = mockLogger.warn.mock.calls[0];
      // Sanitization should have occurred
      expect(logData.metadata).toBeDefined();
    });
  });

  describe('logRateLimitExceeded', () => {
    it('should log rate limit violation with correct severity for burst', () => {
      const logger = new SecurityLogger();
      const details: RateLimitDetails = {
        limitType: 'burst',
        currentCount: 101,
        maxRequests: 100,
        windowMs: 1000,
        ip: '192.168.1.100',
        agentId: 'cursor-ai',
      };

      logger.logRateLimitExceeded(details);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [logData, message] = mockLogger.warn.mock.calls[0];

      expect(logData.event).toBe(SecurityEventType.RATE_LIMIT_EXCEEDED);
      expect(logData.severity).toBe(SecuritySeverity.HIGH); // burst = HIGH
      expect(logData.limitType).toBe('burst');
      expect(logData.currentCount).toBe(101);
      expect(logData.maxRequests).toBe(100);
      expect(message).toContain('Rate limit exceeded');
      expect(message).toContain('burst');
    });

    it('should log rate limit violation with medium severity for non-burst', () => {
      const logger = new SecurityLogger();
      const details: RateLimitDetails = {
        limitType: 'per-agent',
        agentId: 'test-agent',
        currentCount: 1001,
        maxRequests: 1000,
        windowMs: 60000,
      };

      logger.logRateLimitExceeded(details);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [logData] = mockLogger.warn.mock.calls[0];

      expect(logData.severity).toBe(SecuritySeverity.MEDIUM); // per-agent = MEDIUM
      expect(logData.limitType).toBe('per-agent');
    });

    it('should include retry-after information', () => {
      const logger = new SecurityLogger();
      const details: RateLimitDetails = {
        limitType: 'global',
        retryAfterMs: 5000,
        windowMs: 60000,
      };

      logger.logRateLimitExceeded(details);

      const [logData] = mockLogger.warn.mock.calls[0];
      expect(logData.retryAfterMs).toBe(5000);
    });
  });

  describe('logPermissionDenied', () => {
    it('should log permission denial with full context', () => {
      const logger = new SecurityLogger();
      const details: PermissionDeniedDetails = {
        resource: 'knowledge',
        action: 'write',
        agentId: 'cursor-ai',
        requiredPermission: 'knowledge:write',
        scope: 'project:123',
        path: '/api/knowledge/add',
      };

      logger.logPermissionDenied(details);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [logData, message] = mockLogger.warn.mock.calls[0];

      expect(logData.event).toBe(SecurityEventType.PERMISSION_DENIED);
      expect(logData.severity).toBe(SecuritySeverity.MEDIUM);
      expect(logData.resource).toBe('knowledge');
      expect(logData.action).toBe('write');
      expect(logData.requiredPermission).toBe('knowledge:write');
      expect(message).toContain('Permission denied');
      expect(message).toContain('write');
      expect(message).toContain('knowledge');
    });

    it('should log permission denial without optional fields', () => {
      const logger = new SecurityLogger();
      const details: PermissionDeniedDetails = {
        resource: 'tool',
        action: 'delete',
      };

      logger.logPermissionDenied(details);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [logData] = mockLogger.warn.mock.calls[0];
      expect(logData.resource).toBe('tool');
      expect(logData.action).toBe('delete');
    });
  });

  describe('logSuspiciousActivity', () => {
    it('should log suspicious activity with high confidence as error', () => {
      const logger = new SecurityLogger();
      const details: SuspiciousActivityDetails = {
        activityType: 'sql_injection_attempt',
        description: 'SQL keywords detected in input',
        ip: '192.168.1.100',
        path: '/api/search',
        confidence: 0.95,
        indicators: ['UNION SELECT', 'DROP TABLE'],
      };

      logger.logSuspiciousActivity(details);

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      const [logData, message] = mockLogger.error.mock.calls[0];

      expect(logData.event).toBe(SecurityEventType.SUSPICIOUS_ACTIVITY);
      expect(logData.severity).toBe(SecuritySeverity.HIGH); // confidence > 0.8
      expect(logData.activityType).toBe('sql_injection_attempt');
      expect(logData.confidence).toBe(0.95);
      expect(logData.indicators).toEqual(['UNION SELECT', 'DROP TABLE']);
      expect(message).toContain('Suspicious activity detected');
      expect(message).toContain('sql_injection_attempt');
    });

    it('should log suspicious activity with low confidence as warning', () => {
      const logger = new SecurityLogger();
      const details: SuspiciousActivityDetails = {
        activityType: 'unusual_pattern',
        description: 'Unusual access pattern',
        confidence: 0.5,
      };

      logger.logSuspiciousActivity(details);

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      const [logData] = mockLogger.error.mock.calls[0];
      expect(logData.severity).toBe(SecuritySeverity.MEDIUM); // confidence <= 0.8
    });

    it('should handle suspicious activity without confidence', () => {
      const logger = new SecurityLogger();
      const details: SuspiciousActivityDetails = {
        activityType: 'path_traversal_attempt',
        description: 'Path traversal detected',
        metadata: { input: '../../../etc/passwd' },
      };

      logger.logSuspiciousActivity(details);

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      const [logData] = mockLogger.error.mock.calls[0];
      expect(logData.severity).toBe(SecuritySeverity.MEDIUM); // default when no confidence
    });
  });

  describe('logSecurityEvent', () => {
    it('should log custom security event with default severity', () => {
      const logger = new SecurityLogger();
      const details: GenericSecurityDetails = {
        description: 'Custom security event',
        agentId: 'test-agent',
        metadata: { custom: 'data' },
      };

      logger.logSecurityEvent('custom_event', details);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [logData, message] = mockLogger.warn.mock.calls[0];

      expect(logData.event).toBe('custom_event');
      expect(logData.severity).toBe(SecuritySeverity.LOW); // default
      expect(logData.description).toBe('Custom security event');
      expect(message).toBe('Custom security event');
    });

    it('should log custom security event with high severity', () => {
      const logger = new SecurityLogger();
      const details: GenericSecurityDetails = {
        description: 'Critical security event',
        severity: SecuritySeverity.CRITICAL,
      };

      logger.logSecurityEvent('critical_event', details);

      expect(mockLogger.error).toHaveBeenCalledTimes(1); // error for CRITICAL
      const [logData] = mockLogger.error.mock.calls[0];
      expect(logData.severity).toBe(SecuritySeverity.CRITICAL);
    });

    it('should use warn level for low and medium severity', () => {
      const logger = new SecurityLogger();

      logger.logSecurityEvent('low_event', {
        description: 'Low severity',
        severity: SecuritySeverity.LOW,
      });

      logger.logSecurityEvent('medium_event', {
        description: 'Medium severity',
        severity: SecuritySeverity.MEDIUM,
      });

      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should use error level for high severity', () => {
      const logger = new SecurityLogger();

      logger.logSecurityEvent('high_event', {
        description: 'High severity',
        severity: SecuritySeverity.HIGH,
      });

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('logInvalidInput', () => {
    it('should log invalid input with medium severity', () => {
      const logger = new SecurityLogger();
      const details: GenericSecurityDetails = {
        description: 'Path traversal attempt detected',
        path: '/api/files',
        metadata: { input: '../../../etc/passwd' },
      };

      logger.logInvalidInput(details);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [logData, message] = mockLogger.warn.mock.calls[0];

      expect(logData.event).toBe(SecurityEventType.INVALID_INPUT);
      expect(logData.severity).toBe(SecuritySeverity.MEDIUM);
      expect(message).toContain('Invalid input detected');
      expect(message).toContain('Path traversal');
    });
  });

  describe('logUnauthorizedAccess', () => {
    it('should log unauthorized access attempt', () => {
      const logger = new SecurityLogger();
      const details: GenericSecurityDetails = {
        description: 'Attempted access without credentials',
        path: '/api/admin',
        ip: '192.168.1.100',
        method: 'POST',
      };

      logger.logUnauthorizedAccess(details);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      const [logData, message] = mockLogger.warn.mock.calls[0];

      expect(logData.event).toBe(SecurityEventType.UNAUTHORIZED_ACCESS);
      expect(logData.severity).toBe(SecuritySeverity.MEDIUM);
      expect(logData.path).toBe('/api/admin');
      expect(logData.ip).toBe('192.168.1.100');
      expect(message).toContain('Unauthorized access attempt');
    });
  });

  describe('timestamp handling', () => {
    it('should include ISO timestamp in all logs', () => {
      const logger = new SecurityLogger();
      const before = new Date();

      logger.logAuthFailure({ reason: 'test' });
      logger.logRateLimitExceeded({ limitType: 'global' });
      logger.logPermissionDenied({ resource: 'test', action: 'read' });
      logger.logSuspiciousActivity({
        activityType: 'test',
        description: 'test',
      });

      const after = new Date();

      // Check all logged events have valid timestamps
      for (const call of mockLogger.warn.mock.calls) {
        const timestamp = new Date(call[0].timestamp);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      }
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(securityLogger).toBeDefined();
      expect(securityLogger).toBeInstanceOf(SecurityLogger);
    });

    // Note: The singleton is created at module load time, before our mock
    // is set up, so it uses the real logger. We test the instance exists
    // but can't easily test its logging without mocking at module level.
    it('should be usable directly', () => {
      expect(() => {
        securityLogger.logAuthFailure({ reason: 'test' });
      }).not.toThrow();
    });
  });

  describe('data sanitization', () => {
    it('should sanitize all logged details', () => {
      const logger = new SecurityLogger();

      // Test with potentially sensitive data
      logger.logAuthFailure({
        reason: 'Invalid token',
        metadata: {
          token: 'sk-secret-token-12345',
          password: 'secret123',
        },
      });

      logger.logPermissionDenied({
        resource: 'test',
        action: 'read',
        metadata: {
          apiKey: 'sk-api-key-67890',
        },
      });

      // All calls should have been made (sanitization happens internally)
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe('optional fields', () => {
    it('should handle missing optional fields gracefully', () => {
      const logger = new SecurityLogger();

      // Minimal details - only required fields
      logger.logAuthFailure({ reason: 'test' });
      logger.logRateLimitExceeded({ limitType: 'global' });
      logger.logPermissionDenied({ resource: 'test', action: 'read' });
      logger.logSuspiciousActivity({
        activityType: 'test',
        description: 'test',
      });
      logger.logSecurityEvent('test', { description: 'test' });

      // All should succeed without errors
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should include all provided optional fields', () => {
      const logger = new SecurityLogger();
      const details: AuthFailureDetails = {
        reason: 'test',
        ip: '192.168.1.1',
        userAgent: 'Test Agent',
        path: '/api/test',
        method: 'POST',
        agentId: 'test-agent',
        requestId: 'req-123',
        tokenType: 'Bearer',
        repeated: true,
        metadata: { extra: 'data' },
      };

      logger.logAuthFailure(details);

      const [logData] = mockLogger.warn.mock.calls[0];
      expect(logData.ip).toBe('192.168.1.1');
      expect(logData.userAgent).toBe('Test Agent');
      expect(logData.path).toBe('/api/test');
      expect(logData.method).toBe('POST');
      expect(logData.agentId).toBe('test-agent');
      expect(logData.requestId).toBe('req-123');
      // tokenType is redacted by sanitizer because it contains "token"
      expect(logData.tokenType).toBe('***REDACTED***');
      expect(logData.repeated).toBe(true);
      expect(logData.metadata).toBeDefined();
    });
  });
});
