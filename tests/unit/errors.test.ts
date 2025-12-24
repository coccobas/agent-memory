/**
 * Unit tests for error utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AgentMemoryError,
  ErrorCodes,
  createValidationError,
  createNotFoundError,
  createConflictError,
  createFileLockError,
  sanitizeErrorMessage,
} from '../../src/core/errors.js';
import { createInvalidActionError, formatError } from '../../src/mcp/errors.js';

describe('AgentMemoryError', () => {
  it('should create error with message and code', () => {
    const error = new AgentMemoryError('Test error', ErrorCodes.NOT_FOUND);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(error.name).toBe('AgentMemoryError');
  });

  it('should include context in error', () => {
    const context = { field: 'test', value: 123 };
    const error = new AgentMemoryError('Test error', ErrorCodes.NOT_FOUND, context);
    expect(error.context).toEqual(context);
  });

  it('should serialize to JSON correctly', () => {
    const context = { field: 'test' };
    const error = new AgentMemoryError('Test error', ErrorCodes.NOT_FOUND, context);
    const json = error.toJSON();
    expect(json).toEqual({
      error: 'Test error',
      code: ErrorCodes.NOT_FOUND,
      context,
    });
  });
});

describe('createValidationError', () => {
  it('should create validation error with field and message', () => {
    const error = createValidationError('name', 'is required');
    expect(error.message).toContain('Validation error: name - is required');
    expect(error.code).toBe(ErrorCodes.MISSING_REQUIRED_FIELD);
    expect(error.context?.field).toBe('name');
  });

  it('should include suggestion when provided', () => {
    const error = createValidationError('name', 'is required', 'Provide a valid name');
    expect(error.message).toContain('Suggestion: Provide a valid name');
    expect(error.context?.suggestion).toBe('Provide a valid name');
  });
});

describe('createNotFoundError', () => {
  it('should create not found error without identifier', () => {
    const error = createNotFoundError('tool');
    expect(error.message).toBe('tool not found');
    expect(error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(error.context?.resource).toBe('tool');
  });

  it('should create not found error with identifier', () => {
    const error = createNotFoundError('tool', 'tool-123');
    expect(error.message).toBe('tool not found: tool-123');
    expect(error.context?.identifier).toBe('tool-123');
  });
});

describe('createConflictError', () => {
  it('should create conflict error with details', () => {
    const error = createConflictError('guideline', 'Version mismatch');
    expect(error.message).toContain('Conflict detected: guideline - Version mismatch');
    expect(error.code).toBe(ErrorCodes.CONFLICT);
    expect(error.context?.resource).toBe('guideline');
  });
});

describe('createFileLockError', () => {
  it('should create file lock error without lockedBy', () => {
    const error = createFileLockError('/path/to/file.ts');
    expect(error.message).toBe('File is locked: /path/to/file.ts');
    expect(error.code).toBe(ErrorCodes.FILE_LOCKED);
    expect(error.context?.filePath).toBe('/path/to/file.ts');
  });

  it('should create file lock error with lockedBy', () => {
    const error = createFileLockError('/path/to/file.ts', 'agent-123');
    expect(error.message).toBe('File is locked: /path/to/file.ts (locked by: agent-123)');
    expect(error.context?.lockedBy).toBe('agent-123');
  });
});

describe('createInvalidActionError', () => {
  it('should create invalid action error', () => {
    const error = createInvalidActionError('memory_tool', 'invalid', ['add', 'update']);
    expect(error.message).toBe("Invalid action 'invalid' for tool 'memory_tool'");
    expect(error.code).toBe(ErrorCodes.INVALID_ACTION);
    expect(error.context?.tool).toBe('memory_tool');
    expect(error.context?.action).toBe('invalid');
    expect(error.context?.validActions).toEqual(['add', 'update']);
  });
});

describe('formatError', () => {
  it('should format AgentMemoryError correctly', () => {
    const error = new AgentMemoryError('Test error', ErrorCodes.NOT_FOUND, { test: true });
    const formatted = formatError(error);
    expect(formatted).toEqual({
      error: 'Test error',
      code: ErrorCodes.NOT_FOUND,
      context: { test: true },
    });
  });

  it('should format regular Error correctly', () => {
    const error = new Error('Regular error');
    const formatted = formatError(error);
    expect(formatted).toEqual({
      error: 'Regular error',
      code: ErrorCodes.INTERNAL_ERROR,
    });
  });

  it('should format unknown error types', () => {
    const formatted = formatError('String error');
    expect(formatted).toEqual({
      error: 'String error',
      code: ErrorCodes.UNKNOWN_ERROR,
    });
  });

  it('should format null/undefined errors', () => {
    const formatted1 = formatError(null);
    expect(formatted1.error).toBe('null');
    expect(formatted1.code).toBe(ErrorCodes.UNKNOWN_ERROR);

    const formatted2 = formatError(undefined);
    expect(formatted2.error).toBe('undefined');
    expect(formatted2.code).toBe(ErrorCodes.UNKNOWN_ERROR);
  });
});

describe('sanitizeErrorMessage', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NODE_ENV = originalEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  describe('in development mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should not sanitize paths in development', () => {
      const message = 'Error in /Users/admin/project/file.ts';
      expect(sanitizeErrorMessage(message)).toBe(message);
    });

    it('should not sanitize IP addresses in development', () => {
      const message = 'Connection failed to 192.168.1.100';
      expect(sanitizeErrorMessage(message)).toBe(message);
    });
  });

  describe('in production mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    describe('Unix path sanitization', () => {
      it('should redact /Users paths', () => {
        const message = 'Error in /Users/admin/project/file.ts';
        expect(sanitizeErrorMessage(message)).toBe('Error in [REDACTED_PATH]');
      });

      it('should redact /home paths', () => {
        const message = 'Failed at /home/ubuntu/app/index.js';
        expect(sanitizeErrorMessage(message)).toBe('Failed at [REDACTED_PATH]');
      });

      it('should redact /var paths', () => {
        const message = 'Log error in /var/log/app.log';
        expect(sanitizeErrorMessage(message)).toBe('Log error in [REDACTED_PATH]');
      });

      it('should redact /etc paths', () => {
        const message = 'Config at /etc/app/config.json';
        expect(sanitizeErrorMessage(message)).toBe('Config at [REDACTED_PATH]');
      });

      it('should redact /root paths', () => {
        const message = 'Root file /root/.ssh/id_rsa';
        expect(sanitizeErrorMessage(message)).toBe('Root file [REDACTED_PATH]');
      });

      it('should redact /srv paths', () => {
        const message = 'Server at /srv/www/html/index.html';
        expect(sanitizeErrorMessage(message)).toBe('Server at [REDACTED_PATH]');
      });

      it('should redact /mnt, /lib, /bin, /sbin, /proc, /sys, /boot, /dev, /run paths', () => {
        const paths = ['/mnt/data', '/lib/x86_64', '/bin/bash', '/sbin/init', '/proc/1', '/sys/class', '/boot/grub', '/dev/sda1', '/run/lock'];
        paths.forEach(path => {
          const message = `Error at ${path}`;
          expect(sanitizeErrorMessage(message)).toBe('Error at [REDACTED_PATH]');
        });
      });
    });

    describe('Windows path sanitization', () => {
      it('should redact C:\\ paths', () => {
        const message = 'Error in C:\\Users\\Admin\\project\\file.ts';
        expect(sanitizeErrorMessage(message)).toBe('Error in [REDACTED_PATH]');
      });

      it('should redact other drive letters', () => {
        const message = 'Failed at D:\\Projects\\app\\index.js';
        expect(sanitizeErrorMessage(message)).toBe('Failed at [REDACTED_PATH]');
      });
    });

    describe('IP address sanitization', () => {
      it('should redact valid IPv4 addresses', () => {
        const message = 'Connection failed to 192.168.1.100';
        expect(sanitizeErrorMessage(message)).toBe('Connection failed to [REDACTED_IP]');
      });

      it('should redact multiple IP addresses', () => {
        const message = 'Proxy 10.0.0.1 failed to reach 172.16.0.50';
        expect(sanitizeErrorMessage(message)).toBe('Proxy [REDACTED_IP] failed to reach [REDACTED_IP]');
      });

      it('should redact edge case IPs', () => {
        const ips = ['0.0.0.0', '255.255.255.255', '127.0.0.1'];
        ips.forEach(ip => {
          const message = `Server at ${ip}`;
          expect(sanitizeErrorMessage(message)).toBe('Server at [REDACTED_IP]');
        });
      });
    });

    describe('Connection string sanitization', () => {
      it('should redact PostgreSQL connection strings', () => {
        const message = 'Failed to connect to postgres://user:pass@localhost:5432/db';
        expect(sanitizeErrorMessage(message)).toBe('Failed to connect to [REDACTED_CONNECTION_STRING]');
      });

      it('should redact MySQL connection strings', () => {
        const message = 'Error: mysql://admin:secret@db.example.com/mydb';
        expect(sanitizeErrorMessage(message)).toBe('Error: [REDACTED_CONNECTION_STRING]');
      });

      it('should redact Redis connection strings', () => {
        const message = 'Cache error redis://user:password@redis.local:6379';
        expect(sanitizeErrorMessage(message)).toBe('Cache error [REDACTED_CONNECTION_STRING]');
      });

      it('should redact MongoDB connection strings', () => {
        const message = 'DB error mongodb://admin:pass123@mongo.local/test';
        expect(sanitizeErrorMessage(message)).toBe('DB error [REDACTED_CONNECTION_STRING]');
      });

      it('should redact AMQP connection strings', () => {
        const message = 'Queue error amqp://guest:guest@rabbitmq:5672';
        expect(sanitizeErrorMessage(message)).toBe('Queue error [REDACTED_CONNECTION_STRING]');
      });
    });

    describe('Stack trace sanitization', () => {
      it('should redact stack trace function calls', () => {
        const message = 'Error at someFunction (/path/to/file.ts:10:5)';
        expect(sanitizeErrorMessage(message)).toBe('Error [REDACTED_STACK]');
      });

      it('should redact stack trace file references', () => {
        const message = 'Error at /path/to/file.ts:10:5';
        expect(sanitizeErrorMessage(message)).toBe('Error [REDACTED_STACK]');
      });
    });

    describe('Combined sanitization', () => {
      it('should redact multiple sensitive patterns', () => {
        const message = 'Connection from 192.168.1.1 to postgres://user:pass@10.0.0.5/db failed at /home/user/app.ts:50:10';
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).not.toContain('192.168.1.1');
        expect(sanitized).not.toContain('10.0.0.5');
        expect(sanitized).not.toContain('postgres://');
        expect(sanitized).not.toContain('/home/user/app.ts');
        expect(sanitized).toContain('[REDACTED_IP]');
        expect(sanitized).toContain('[REDACTED_CONNECTION_STRING]');
        expect(sanitized).toContain('[REDACTED_STACK]');
      });
    });
  });
});
