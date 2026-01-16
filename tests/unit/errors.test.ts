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
  createEmbeddingProviderError,
  createVectorDbError,
  createVectorNotInitializedError,
  createVectorInvalidInputError,
  createSizeLimitError,
  createServiceUnavailableError,
  createPermissionError,
  createExtractionError,
  createExtractionUnavailableError,
  createEmbeddingDisabledError,
  createEmbeddingError,
  createEmbeddingEmptyTextError,
  DatabaseError,
  ConnectionError,
  NetworkError,
  CircuitBreakerError,
  RateLimitError,
  ResourceExhaustedError,
  TimeoutError,
  RetryExhaustedError,
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
        const paths = [
          '/mnt/data',
          '/lib/x86_64',
          '/bin/bash',
          '/sbin/init',
          '/proc/1',
          '/sys/class',
          '/boot/grub',
          '/dev/sda1',
          '/run/lock',
        ];
        paths.forEach((path) => {
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
        expect(sanitizeErrorMessage(message)).toBe(
          'Proxy [REDACTED_IP] failed to reach [REDACTED_IP]'
        );
      });

      it('should redact edge case IPs', () => {
        const ips = ['0.0.0.0', '255.255.255.255', '127.0.0.1'];
        ips.forEach((ip) => {
          const message = `Server at ${ip}`;
          expect(sanitizeErrorMessage(message)).toBe('Server at [REDACTED_IP]');
        });
      });
    });

    describe('Connection string sanitization', () => {
      it('should redact PostgreSQL connection strings', () => {
        const message = 'Failed to connect to postgres://user:pass@localhost:5432/db';
        expect(sanitizeErrorMessage(message)).toBe(
          'Failed to connect to [REDACTED_CONNECTION_STRING]'
        );
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
        const message =
          'Connection from 192.168.1.1 to postgres://user:pass@10.0.0.5/db failed at /home/user/app.ts:50:10';
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

describe('Specialized Error Classes', () => {
  it('should create DatabaseError with default code', () => {
    const error = new DatabaseError('DB connection failed');
    expect(error.code).toBe(ErrorCodes.DATABASE_ERROR);
    expect(error.name).toBe('DatabaseError');
  });

  it('should create DatabaseError with custom code', () => {
    const error = new DatabaseError('Migration failed', ErrorCodes.MIGRATION_ERROR);
    expect(error.code).toBe(ErrorCodes.MIGRATION_ERROR);
  });

  it('should create ConnectionError', () => {
    const error = new ConnectionError('Connection failed', true, { host: 'localhost' });
    expect(error.code).toBe(ErrorCodes.CONNECTION_ERROR);
    expect(error.name).toBe('ConnectionError');
    expect(error.isRetryable).toBe(true);
    expect(error.context?.host).toBe('localhost');
  });

  it('should create NetworkError', () => {
    const error = new NetworkError('Connection failed', 'API', true);
    expect(error.code).toBe(ErrorCodes.NETWORK_ERROR);
    expect(error.name).toBe('NetworkError');
    expect(error.service).toBe('API');
  });

  it('should create CircuitBreakerError', () => {
    const resetTime = Date.now() + 60000;
    const error = new CircuitBreakerError('ServiceA', resetTime);
    expect(error.code).toBe(ErrorCodes.CIRCUIT_BREAKER_OPEN);
    expect(error.name).toBe('CircuitBreakerError');
    expect(error.service).toBe('ServiceA');
    expect(error.context?.service).toBe('ServiceA');
  });

  it('should create RateLimitError', () => {
    const error = new RateLimitError(60000);
    expect(error.code).toBe(ErrorCodes.RATE_LIMITED);
    expect(error.name).toBe('RateLimitError');
    expect(error.retryAfterMs).toBe(60000);
  });

  it('should create ResourceExhaustedError', () => {
    const error = new ResourceExhaustedError('memory', 'Memory exhausted');
    expect(error.code).toBe(ErrorCodes.RESOURCE_EXHAUSTED);
    expect(error.name).toBe('ResourceExhaustedError');
    expect(error.resource).toBe('memory');
  });

  it('should create TimeoutError', () => {
    const error = new TimeoutError('API call', 5000);
    expect(error.code).toBe(ErrorCodes.TIMEOUT);
    expect(error.name).toBe('TimeoutError');
    expect(error.operation).toBe('API call');
    expect(error.timeoutMs).toBe(5000);
  });

  it('should create RetryExhaustedError', () => {
    const lastError = new Error('Connection failed');
    const error = new RetryExhaustedError('fetchData', 3, lastError);
    expect(error.code).toBe(ErrorCodes.RETRY_EXHAUSTED);
    expect(error.name).toBe('RetryExhaustedError');
    expect(error.operation).toBe('fetchData');
    expect(error.attempts).toBe(3);
    expect(error.lastError).toBe(lastError);
  });
});

describe('Error Factory Functions', () => {
  describe('createEmbeddingProviderError', () => {
    it('should create embedding provider error', () => {
      const error = createEmbeddingProviderError('openai', 'API rate limit exceeded');
      expect(error.message).toContain('openai');
      expect(error.message).toContain('API rate limit exceeded');
      expect(error.code).toBe(ErrorCodes.EMBEDDING_PROVIDER_ERROR);
      expect(error.context?.provider).toBe('openai');
    });
  });

  describe('createVectorDbError', () => {
    it('should create vector db error without details', () => {
      const error = createVectorDbError('search', 'Index not found');
      expect(error.message).toContain('search');
      expect(error.message).toContain('Index not found');
      expect(error.code).toBe(ErrorCodes.VECTOR_DB_ERROR);
      expect(error.context?.operation).toBe('search');
    });

    it('should create vector db error with details', () => {
      const error = createVectorDbError('insert', 'Dimension mismatch', {
        expected: 384,
        actual: 512,
      });
      expect(error.context?.expected).toBe(384);
      expect(error.context?.actual).toBe(512);
    });
  });

  describe('createVectorNotInitializedError', () => {
    it('should create vector not initialized error', () => {
      const error = createVectorNotInitializedError();
      expect(error.message).toContain('not initialized');
      expect(error.code).toBe(ErrorCodes.VECTOR_NOT_INITIALIZED);
      expect(error.context?.suggestion).toBeDefined();
    });
  });

  describe('createVectorInvalidInputError', () => {
    it('should create vector invalid input error', () => {
      const error = createVectorInvalidInputError('embedding', 'must be array of numbers');
      expect(error.message).toContain('embedding');
      expect(error.message).toContain('must be array of numbers');
      expect(error.code).toBe(ErrorCodes.VECTOR_INVALID_INPUT);
      expect(error.context?.field).toBe('embedding');
    });
  });

  describe('createSizeLimitError', () => {
    it('should create size limit error with default unit', () => {
      const error = createSizeLimitError('content', 10000, 15000);
      expect(error.message).toContain('10000');
      expect(error.message).toContain('15000');
      expect(error.message).toContain('characters');
      expect(error.code).toBe(ErrorCodes.SIZE_LIMIT_EXCEEDED);
    });

    it('should create size limit error with custom unit', () => {
      const error = createSizeLimitError('file', 1024, 2048, 'bytes');
      expect(error.message).toContain('bytes');
      expect(error.context?.unit).toBe('bytes');
    });
  });

  describe('createServiceUnavailableError', () => {
    it('should create service unavailable error without reason', () => {
      const error = createServiceUnavailableError('EmbeddingService');
      expect(error.message).toBe('EmbeddingService is unavailable');
      expect(error.code).toBe(ErrorCodes.SERVICE_UNAVAILABLE);
    });

    it('should create service unavailable error with reason', () => {
      const error = createServiceUnavailableError('VectorDB', 'Connection refused');
      expect(error.message).toBe('VectorDB is unavailable: Connection refused');
      expect(error.context?.service).toBe('VectorDB');
    });
  });

  describe('createPermissionError', () => {
    it('should create permission error without identifier', () => {
      const error = createPermissionError('write', 'file');
      expect(error.message).toContain('write');
      expect(error.message).toContain('access required');
      expect(error.code).toBe(ErrorCodes.PERMISSION_DENIED);
    });

    it('should create permission error with identifier', () => {
      const error = createPermissionError('read', 'guideline', 'guideline-123');
      expect(error.message).toContain('read');
      expect(error.message).toContain('guideline');
      expect(error.context?.identifier).toBe('guideline-123');
    });
  });

  describe('createExtractionError', () => {
    it('should create extraction error', () => {
      const error = createExtractionError('openai', 'JSON parse failed');
      expect(error.message).toContain('JSON parse failed');
      expect(error.message).toContain('openai');
      expect(error.code).toBe(ErrorCodes.EXTRACTION_FAILED);
    });
  });

  describe('createExtractionUnavailableError', () => {
    it('should create extraction unavailable error', () => {
      const error = createExtractionUnavailableError();
      expect(error.message).toContain('not available');
      expect(error.code).toBe(ErrorCodes.EXTRACTION_UNAVAILABLE);
    });
  });

  describe('createEmbeddingDisabledError', () => {
    it('should create embedding disabled error', () => {
      const error = createEmbeddingDisabledError();
      expect(error.message).toContain('disabled');
      expect(error.code).toBe(ErrorCodes.EMBEDDING_DISABLED);
    });
  });

  describe('createEmbeddingError', () => {
    it('should create embedding error', () => {
      const error = createEmbeddingError('Model not found');
      expect(error.message).toContain('Model not found');
      expect(error.code).toBe(ErrorCodes.EMBEDDING_FAILED);
    });
  });

  describe('createEmbeddingEmptyTextError', () => {
    it('should create embedding empty text error', () => {
      const error = createEmbeddingEmptyTextError();
      expect(error.message).toContain('empty');
      expect(error.code).toBe(ErrorCodes.EMBEDDING_EMPTY_TEXT);
    });
  });
});

// Import ErrorBuilder for testing
import { ErrorBuilder } from '../../src/core/errors.js';

describe('ErrorBuilder', () => {
  describe('validation()', () => {
    it('should create a validation error builder with field', () => {
      const error = ErrorBuilder.validation('email').build('Invalid email format');
      expect(error.code).toBe(ErrorCodes.MISSING_REQUIRED_FIELD);
      expect(error.context?.field).toBe('email');
      expect(error.message).toBe('Invalid email format');
    });

    it('should generate default message when none provided', () => {
      const error = ErrorBuilder.validation('username').build();
      expect(error.message).toBe('Validation error: username');
    });
  });

  describe('notFound()', () => {
    it('should create a not found error builder with resource', () => {
      const error = ErrorBuilder.notFound('project').build();
      expect(error.code).toBe(ErrorCodes.NOT_FOUND);
      expect(error.context?.resource).toBe('project');
      expect(error.message).toBe('project not found');
    });

    it('should create a not found error with identifier', () => {
      const error = ErrorBuilder.notFound('project', 'proj-123').build();
      expect(error.context?.identifier).toBe('proj-123');
      expect(error.message).toBe('project not found: proj-123');
    });

    it('should include default suggestion', () => {
      const error = ErrorBuilder.notFound('tool').build();
      expect(error.context?.suggestion).toContain('tool');
      expect(error.context?.suggestion).toContain('exists');
    });
  });

  describe('permission()', () => {
    it('should create a permission error builder', () => {
      const error = ErrorBuilder.permission('write', 'guideline').build();
      expect(error.code).toBe(ErrorCodes.PERMISSION_DENIED);
      expect(error.context?.action).toBe('write');
      expect(error.context?.resource).toBe('guideline');
    });

    it('should create a permission error with identifier', () => {
      const error = ErrorBuilder.permission('read', 'knowledge', 'k-123').build();
      expect(error.context?.identifier).toBe('k-123');
      expect(error.message).toContain('read');
      expect(error.message).toContain('knowledge k-123');
    });

    it('should generate default permission message without identifier', () => {
      const error = ErrorBuilder.permission('delete', 'tool').build();
      expect(error.message).toBe('Permission denied: delete access required');
    });

    it('should include default suggestion', () => {
      const error = ErrorBuilder.permission('admin', 'project').build();
      expect(error.context?.suggestion).toContain('admin');
      expect(error.context?.suggestion).toContain('project');
    });
  });

  describe('conflict()', () => {
    it('should create a conflict error builder', () => {
      const error = ErrorBuilder.conflict('guideline').build();
      expect(error.code).toBe(ErrorCodes.CONFLICT);
      expect(error.context?.resource).toBe('guideline');
      expect(error.message).toBe('Conflict detected: guideline');
    });

    it('should include suggestion about memory_conflict tool', () => {
      const error = ErrorBuilder.conflict('knowledge').build();
      expect(error.context?.suggestion).toContain('memory_conflict');
    });
  });

  describe('serviceUnavailable()', () => {
    it('should create a service unavailable error builder', () => {
      const error = ErrorBuilder.serviceUnavailable('EmbeddingService').build();
      expect(error.code).toBe(ErrorCodes.SERVICE_UNAVAILABLE);
      expect(error.context?.service).toBe('EmbeddingService');
      expect(error.message).toBe('EmbeddingService is unavailable');
    });

    it('should include service-specific suggestion', () => {
      const error = ErrorBuilder.serviceUnavailable('VectorDB').build();
      expect(error.context?.suggestion).toContain('VectorDB');
    });
  });

  describe('circuitBreakerOpen()', () => {
    it('should create a circuit breaker error builder', () => {
      const error = ErrorBuilder.circuitBreakerOpen('APIGateway').build();
      expect(error.code).toBe(ErrorCodes.CIRCUIT_BREAKER_OPEN);
      expect(error.context?.service).toBe('APIGateway');
      expect(error.message).toBe(
        'Service APIGateway is temporarily unavailable (circuit breaker open)'
      );
    });

    it('should include recovery suggestion', () => {
      const error = ErrorBuilder.circuitBreakerOpen('Database').build();
      expect(error.context?.suggestion).toContain('recovery');
    });
  });

  describe('withCode()', () => {
    it('should create a builder with custom error code', () => {
      const error = ErrorBuilder.withCode(ErrorCodes.DATABASE_ERROR).build('Custom DB error');
      expect(error.code).toBe(ErrorCodes.DATABASE_ERROR);
      expect(error.message).toBe('Custom DB error');
    });

    it('should generate generic message for unknown code', () => {
      const error = ErrorBuilder.withCode('CUSTOM_CODE').build();
      expect(error.message).toBe('An error occurred');
    });
  });

  describe('withSuggestion()', () => {
    it('should add suggestion to the error', () => {
      const error = ErrorBuilder.validation('email')
        .withSuggestion('Use a valid email format like user@example.com')
        .build('Invalid email');
      expect(error.context?.suggestion).toBe('Use a valid email format like user@example.com');
    });

    it('should override default suggestion', () => {
      const error = ErrorBuilder.notFound('project')
        .withSuggestion('Create the project first')
        .build();
      expect(error.context?.suggestion).toBe('Create the project first');
    });
  });

  describe('withContext()', () => {
    it('should add context to the error', () => {
      const error = ErrorBuilder.validation('password')
        .withContext({ minLength: 8, maxLength: 64 })
        .build('Password too short');
      expect(error.context?.minLength).toBe(8);
      expect(error.context?.maxLength).toBe(64);
      expect(error.context?.field).toBe('password');
    });

    it('should merge context with existing context', () => {
      const error = ErrorBuilder.notFound('tool', 'tool-123')
        .withContext({ searchedScopes: ['global', 'project'] })
        .build();
      expect(error.context?.resource).toBe('tool');
      expect(error.context?.identifier).toBe('tool-123');
      expect(error.context?.searchedScopes).toEqual(['global', 'project']);
    });

    it('should allow multiple withContext calls', () => {
      const error = ErrorBuilder.permission('write', 'guideline')
        .withContext({ userId: 'user-1' })
        .withContext({ projectId: 'proj-1' })
        .build();
      expect(error.context?.userId).toBe('user-1');
      expect(error.context?.projectId).toBe('proj-1');
    });
  });

  describe('withCause()', () => {
    it('should set the cause of the error', () => {
      const originalError = new Error('Connection refused');
      const error = ErrorBuilder.serviceUnavailable('Database').withCause(originalError).build();
      expect(error.cause).toBe(originalError);
    });

    it('should allow chaining with other methods', () => {
      const cause = new Error('Timeout');
      const error = ErrorBuilder.notFound('resource')
        .withContext({ attemptedAt: new Date().toISOString() })
        .withCause(cause)
        .withSuggestion('Try again later')
        .build();
      expect(error.cause).toBe(cause);
      expect(error.context?.suggestion).toBe('Try again later');
    });
  });

  describe('build()', () => {
    it('should use custom message when provided', () => {
      const error = ErrorBuilder.notFound('item').build('Item xyz was not found in the system');
      expect(error.message).toBe('Item xyz was not found in the system');
    });

    it('should generate default message when no message provided', () => {
      const error = ErrorBuilder.conflict('entry').build();
      expect(error.message).toBe('Conflict detected: entry');
    });

    it('should include suggestion in context', () => {
      const error = ErrorBuilder.validation('field').withSuggestion('Provide valid input').build();
      expect(error.context?.suggestion).toBe('Provide valid input');
    });

    it('should not include suggestion in context if not provided', () => {
      const error = ErrorBuilder.withCode(ErrorCodes.UNKNOWN_ERROR).build('Unknown error');
      expect(error.context?.suggestion).toBeUndefined();
    });
  });

  describe('fluent API chaining', () => {
    it('should support full chaining', () => {
      const cause = new Error('Network timeout');
      const error = ErrorBuilder.permission('execute', 'tool', 'tool-abc')
        .withContext({ requiredRole: 'admin' })
        .withSuggestion('Contact your administrator')
        .withCause(cause)
        .build('Custom permission error message');

      expect(error.code).toBe(ErrorCodes.PERMISSION_DENIED);
      expect(error.message).toBe('Custom permission error message');
      expect(error.context?.action).toBe('execute');
      expect(error.context?.resource).toBe('tool');
      expect(error.context?.identifier).toBe('tool-abc');
      expect(error.context?.requiredRole).toBe('admin');
      expect(error.context?.suggestion).toBe('Contact your administrator');
      expect(error.cause).toBe(cause);
    });

    it('should support method chaining in any order', () => {
      const error = ErrorBuilder.notFound('file')
        .withSuggestion('Check the file path')
        .withContext({ path: '/some/path' })
        .build();

      expect(error.context?.suggestion).toBe('Check the file path');
      expect(error.context?.path).toBe('/some/path');
    });
  });

  describe('default message generation', () => {
    it('should generate NOT_FOUND message with identifier', () => {
      const error = ErrorBuilder.notFound('session', 'sess-123').build();
      expect(error.message).toBe('session not found: sess-123');
    });

    it('should generate NOT_FOUND message without identifier', () => {
      const error = ErrorBuilder.notFound('session').build();
      expect(error.message).toBe('session not found');
    });

    it('should generate PERMISSION_DENIED message with identifier', () => {
      const error = ErrorBuilder.permission('write', 'doc', 'doc-123').build();
      expect(error.message).toBe('Permission denied: write access required for doc doc-123');
    });

    it('should generate PERMISSION_DENIED message without identifier', () => {
      const error = ErrorBuilder.permission('write', 'doc').build();
      expect(error.message).toBe('Permission denied: write access required');
    });

    it('should generate CONFLICT message', () => {
      const error = ErrorBuilder.conflict('version').build();
      expect(error.message).toBe('Conflict detected: version');
    });

    it('should generate SERVICE_UNAVAILABLE message', () => {
      const error = ErrorBuilder.serviceUnavailable('Redis').build();
      expect(error.message).toBe('Redis is unavailable');
    });

    it('should generate CIRCUIT_BREAKER_OPEN message', () => {
      const error = ErrorBuilder.circuitBreakerOpen('API').build();
      expect(error.message).toBe('Service API is temporarily unavailable (circuit breaker open)');
    });

    it('should generate MISSING_REQUIRED_FIELD message', () => {
      const error = ErrorBuilder.validation('name').build();
      expect(error.message).toBe('Validation error: name');
    });

    it('should generate fallback message for unknown codes', () => {
      const error = ErrorBuilder.withCode('CUSTOM').build();
      expect(error.message).toBe('An error occurred');
    });
  });
});
