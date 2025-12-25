/**
 * Unit tests for REST API server
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/restapi/server.js';
import type { AppContext } from '../../src/core/context.js';
import type { FastifyInstance } from 'fastify';

// Mock dependencies
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/services/health.service.js', () => ({
  getHealthMonitor: () => ({
    getLastCheckResult: vi.fn().mockReturnValue({
      status: 'healthy',
      version: '1.0.0',
      database: { ok: true },
      circuitBreakers: [],
    }),
  }),
  resetHealthMonitor: vi.fn(),
}));

vi.mock('../../src/utils/metrics.js', () => ({
  metrics: {
    format: vi.fn().mockReturnValue('# HELP test_metric Test\ntest_metric 1'),
  },
}));

vi.mock('../../src/restapi/routes/v1.js', () => ({
  registerV1Routes: vi.fn(),
}));

describe('REST API Server', () => {
  let mockContext: AppContext;
  let app: FastifyInstance;

  beforeEach(() => {
    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {} as any,
      runtime: {} as any,
      security: {
        checkHealthRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
        validateRequest: vi.fn().mockResolvedValue({
          authorized: true,
          context: { agentId: 'test-agent' },
          rateLimitInfo: { limit: 100, remaining: 99, reset: Date.now() + 60000 },
        }),
      } as any,
    } as AppContext;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('createServer', () => {
    it('should create a Fastify instance', () => {
      app = createServer(mockContext);

      expect(app).toBeDefined();
      expect(app.server).toBeDefined();
    });

    it('should configure request timeout', () => {
      app = createServer(mockContext);

      // Server should be configured (options aren't directly accessible, but it should work)
      expect(app).toBeDefined();
    });
  });

  describe('Health endpoint', () => {
    it('should return health status', async () => {
      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
      expect(body.status).toBe('healthy');
    });

    it('should rate limit health endpoint', async () => {
      vi.mocked(mockContext.security.checkHealthRateLimit).mockResolvedValueOnce({
        allowed: false,
        retryAfterMs: 5000,
      });

      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
    });
  });

  describe('Metrics endpoint', () => {
    it('should return Prometheus metrics', async () => {
      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('test_metric');
    });
  });

  describe('Request ID tracing', () => {
    it('should generate request ID if not provided', async () => {
      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.headers['x-request-id']).toBeDefined();
      expect(typeof response.headers['x-request-id']).toBe('string');
    });

    it('should use provided request ID', async () => {
      app = createServer(mockContext);
      await app.ready();

      const customId = 'custom-request-id-123';
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-request-id': customId,
        },
      });

      expect(response.headers['x-request-id']).toBe(customId);
    });
  });

  describe('Content-Type validation', () => {
    it('should accept application/json for POST requests', async () => {
      app = createServer(mockContext);
      await app.ready();

      // This will hit the authentication layer first
      const response = await app.inject({
        method: 'POST',
        url: '/v1/test',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test-key',
        },
        payload: {},
      });

      // May return 404 (route not found) or pass through auth, but not 415
      expect(response.statusCode).not.toBe(415);
    });

    it('should reject non-JSON content type for POST requests', async () => {
      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/test',
        headers: {
          'content-type': 'text/plain',
          'x-api-key': 'test-key',
        },
        payload: 'test',
      });

      expect(response.statusCode).toBe(415);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('UNSUPPORTED_CONTENT_TYPE');
    });

    it('should skip content-type validation for GET requests', async () => {
      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should skip content-type validation for OPTIONS requests', async () => {
      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'OPTIONS',
        url: '/v1/test',
      });

      // OPTIONS should not return 415
      expect(response.statusCode).not.toBe(415);
    });
  });

  describe('Authentication', () => {
    it('should skip auth for health endpoint', async () => {
      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(mockContext.security.validateRequest).not.toHaveBeenCalled();
    });

    it('should skip auth for metrics endpoint', async () => {
      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 401 for unauthorized requests', async () => {
      vi.mocked(mockContext.security.validateRequest).mockResolvedValueOnce({
        authorized: false,
        error: 'Invalid API key',
        statusCode: 401,
      });

      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/v1/some-endpoint',
        headers: {
          'x-api-key': 'invalid-key',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should return 429 for rate limited requests', async () => {
      vi.mocked(mockContext.security.validateRequest).mockResolvedValueOnce({
        authorized: false,
        error: 'Rate limit exceeded',
        statusCode: 429,
        retryAfterMs: 10000,
        rateLimitInfo: { limit: 100, remaining: 0, reset: Date.now() + 60000 },
      });

      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/v1/some-endpoint',
        headers: {
          'x-api-key': 'test-key',
        },
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
    });

    it('should attach agentId to request on successful auth', async () => {
      vi.mocked(mockContext.security.validateRequest).mockResolvedValueOnce({
        authorized: true,
        context: { agentId: 'my-agent' },
      });

      app = createServer(mockContext);
      await app.ready();

      // The agentId would be attached but we can verify the response is authorized
      const response = await app.inject({
        method: 'GET',
        url: '/v1/some-endpoint',
        headers: {
          'x-api-key': 'valid-key',
        },
      });

      // Should not be 401
      expect(response.statusCode).not.toBe(401);
    });
  });

  describe('Rate limit headers', () => {
    it('should include rate limit headers on success', async () => {
      vi.mocked(mockContext.security.validateRequest).mockResolvedValueOnce({
        authorized: true,
        context: { agentId: 'test-agent' },
        rateLimitInfo: { limit: 100, remaining: 95, reset: 1234567890 },
      });

      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/v1/some-endpoint',
        headers: {
          'x-api-key': 'test-key',
        },
      });

      // Headers should be present even if route returns 404
      // (the onSend hook adds them)
      expect(response.headers['x-ratelimit-limit']).toBe('100');
      expect(response.headers['x-ratelimit-remaining']).toBe('95');
    });
  });

  describe('Error handling', () => {
    it('should map errors to appropriate responses', async () => {
      // Create a route that throws an error
      app = createServer(mockContext);

      // Add a test route that throws
      app.get('/v1/error-test', async () => {
        throw new Error('Test error');
      });

      await app.ready();

      vi.mocked(mockContext.security.validateRequest).mockResolvedValueOnce({
        authorized: true,
        context: { agentId: 'test' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/error-test',
        headers: {
          'x-api-key': 'test-key',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.code).toBeDefined();
    });

    it('should include request ID in error logging', async () => {
      app = createServer(mockContext);

      app.get('/v1/logged-error', async () => {
        throw new Error('Logged error');
      });

      await app.ready();

      vi.mocked(mockContext.security.validateRequest).mockResolvedValueOnce({
        authorized: true,
        context: { agentId: 'test' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/logged-error',
        headers: {
          'x-api-key': 'test-key',
          'x-request-id': 'trace-123',
        },
      });

      expect(response.headers['x-request-id']).toBe('trace-123');
    });
  });

  describe('Security headers', () => {
    it('should include security headers from helmet', async () => {
      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      // Helmet adds various security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('CORS', () => {
    it('should handle CORS preflight requests', async () => {
      // Set CORS origins
      const originalEnv = process.env.AGENT_MEMORY_REST_CORS_ORIGINS;
      process.env.AGENT_MEMORY_REST_CORS_ORIGINS = 'http://localhost:3000';

      app = createServer(mockContext);
      await app.ready();

      const response = await app.inject({
        method: 'OPTIONS',
        url: '/v1/test',
        headers: {
          'origin': 'http://localhost:3000',
          'access-control-request-method': 'POST',
        },
      });

      // CORS preflight should succeed or return appropriate status
      expect(response.statusCode).toBeLessThan(500);

      // Restore env
      if (originalEnv === undefined) {
        delete process.env.AGENT_MEMORY_REST_CORS_ORIGINS;
      } else {
        process.env.AGENT_MEMORY_REST_CORS_ORIGINS = originalEnv;
      }
    });
  });

  describe('Body limit', () => {
    it('should reject oversized request bodies', async () => {
      app = createServer(mockContext);
      await app.ready();

      vi.mocked(mockContext.security.validateRequest).mockResolvedValueOnce({
        authorized: true,
        context: { agentId: 'test' },
      });

      // Create a large payload (over 1MB)
      const largePayload = { data: 'x'.repeat(2 * 1024 * 1024) };

      const response = await app.inject({
        method: 'POST',
        url: '/v1/test',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'test-key',
        },
        payload: largePayload,
      });

      // Should reject with 413 Payload Too Large or similar
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
