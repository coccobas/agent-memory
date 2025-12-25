import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import { randomUUID } from 'crypto';

import { createComponentLogger } from '../utils/logger.js';
import type { AppContext } from '../core/context.js';
import { createAppContext } from '../core/factory.js';
import { config } from '../config/index.js';
import { mapError } from '../utils/error-mapper.js';
import { registerContext } from '../core/container.js';
import { registerV1Routes } from './routes/v1.js';
import { getHealthMonitor, resetHealthMonitor } from '../services/health.service.js';
import { metrics } from '../utils/metrics.js';
import { backpressure } from '../utils/backpressure.js';

// Extend Fastify request to include authenticated agent ID, request ID, and rate limit info
declare module 'fastify' {
  interface FastifyRequest {
    agentId?: string;
    requestId?: string;
    rateLimitInfo?: {
      limit: number;
      remaining: number;
      reset: number;
    };
  }
}

const restLogger = createComponentLogger('restapi');

/**
 * Create a REST API server with the provided AppContext.
 *
 * @param context - The application context (required per ADR-008)
 * @returns Configured Fastify instance
 */
export function createServer(context: AppContext): FastifyInstance {
  const app = Fastify({
    // Fastify v5 expects a config object here; we keep Fastify logging off and rely on our own logger.
    logger: false,
    disableRequestLogging: true,
    bodyLimit: 1024 * 1024, // 1 MiB
    connectionTimeout: 30000, // 30 second connection timeout
    requestTimeout: 60000, // 60 second request timeout to prevent resource exhaustion
    trustProxy: process.env.AGENT_MEMORY_REST_TRUST_PROXY === 'true', // Enable trustProxy to use Fastify's built-in IP parsing (HIGH-001 fix)
  });

  // Register CORS plugin early, before other plugins and routes
  const corsOrigins = process.env.AGENT_MEMORY_REST_CORS_ORIGINS;
  void app.register(cors, {
    origin: corsOrigins ? corsOrigins.split(',').map((o) => o.trim()) : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-ID', 'X-Request-ID', 'X-API-Key'],
    exposedHeaders: [
      'X-Request-ID',
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    maxAge: 86400,
  });

  // HIGH-006: Security headers via helmet
  void app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for error pages
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: 'deny',
    },
    noSniff: true,
    ieNoOpen: true,
    xssFilter: true,
  });

  // HIGH-004: Response compression for performance
  void app.register(compress, {
    global: true,
    threshold: 1024, // Only compress responses > 1KB
    encodings: ['gzip', 'deflate'], // Prefer gzip
  });

  // HIGH-017: Request ID tracing for observability
  app.addHook('onRequest', async (request, reply) => {
    const requestId = (request.headers['x-request-id'] as string) || randomUUID();
    request.requestId = requestId;
    reply.header('X-Request-ID', requestId);
  });

  // Add rate limit headers to all responses
  app.addHook('onSend', async (request, reply) => {
    if (request.rateLimitInfo) {
      reply.header('X-RateLimit-Limit', String(request.rateLimitInfo.limit));
      reply.header('X-RateLimit-Remaining', String(request.rateLimitInfo.remaining));
      reply.header('X-RateLimit-Reset', String(request.rateLimitInfo.reset));
    }
  });

  // HIGH-003: Content-Type validation for non-GET requests
  app.addHook('preHandler', async (request, reply) => {
    // Skip for GET, HEAD, OPTIONS, and health endpoints
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.url.startsWith('/health')) {
      return;
    }

    const contentType = request.headers['content-type'];
    if (!contentType?.toLowerCase().includes('application/json')) {
      await reply.status(415).send({
        error: 'Unsupported Media Type',
        code: 'UNSUPPORTED_CONTENT_TYPE',
        details: {
          expected: 'application/json',
          received: contentType || 'none',
        },
      });
      return;
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    const url = request.raw.url || request.url;

    // Skip auth for public endpoints
    if (typeof url === 'string') {
      if (url.startsWith('/health')) {
        // Rate limit health endpoint by client IP to prevent DoS attacks
        // Use Fastify's built-in request.ip which safely handles X-Forwarded-For when trustProxy is enabled (HIGH-001 fix)
        const clientIp = request.ip ?? 'unknown';

        const healthCheck = await context.security.checkHealthRateLimit(clientIp);
        if (!healthCheck.allowed) {
          reply.header('Retry-After', String(Math.ceil((healthCheck.retryAfterMs ?? 1000) / 1000)));
          await reply
            .status(429)
            .send({ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' });
          return;
        }
        return;
      }

      // OpenAPI spec endpoint is public for documentation
      if (url === '/v1/openapi.json' || url.startsWith('/metrics')) {
        return;
      }
    }

    // Use centralized Security Service
    // We pass the headers directly. Fastify headers are IncomingHttpHeaders (Record<string, string | string[] | undefined>)
    // which matches our interface.
    const result = await context.security.validateRequest({
      headers: request.headers,
    });

    // Attach rate limit info to request for downstream use
    if (result.rateLimitInfo) {
      request.rateLimitInfo = result.rateLimitInfo;
    }

    if (!result.authorized) {
      const code =
        result.statusCode === 429
          ? 'RATE_LIMIT_EXCEEDED'
          : result.statusCode === 503
            ? 'SERVICE_UNAVAILABLE'
            : 'UNAUTHORIZED';
      if (result.retryAfterMs) {
        reply.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      }
      // Add rate limit headers for failed requests too
      if (result.rateLimitInfo) {
        reply.header('X-RateLimit-Limit', String(result.rateLimitInfo.limit));
        reply.header('X-RateLimit-Remaining', String(result.rateLimitInfo.remaining));
        reply.header('X-RateLimit-Reset', String(result.rateLimitInfo.reset));
      }
      await reply.status(result.statusCode || 401).send({
        error: result.error,
        retryAfterMs: result.retryAfterMs,
        code,
      });
      return;
    }

    // Attach derived identity for downstream handlers
    if (result.context?.agentId) {
      request.agentId = result.context.agentId;
    }
  });

  app.get('/health', async () => {
    const healthMonitor = getHealthMonitor();
    const lastCheck = healthMonitor.getLastCheckResult();

    if (lastCheck) {
      return {
        ok: lastCheck.status !== 'unhealthy',
        status: lastCheck.status,
        uptimeSec: Math.round(process.uptime()),
        version: lastCheck.version,
        database: lastCheck.database,
        circuitBreakers: lastCheck.circuitBreakers.length,
      };
    }

    // Fallback for first request before periodic checks run
    return {
      ok: true,
      uptimeSec: Math.round(process.uptime()),
    };
  });

  // Prometheus metrics endpoint
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return metrics.format();
  });

  // Register Routes
  registerV1Routes(app, context);

  app.setErrorHandler(async (error, request, reply) => {
    // HIGH-017: Include request ID in error logs for tracing
    restLogger.error({ error, requestId: request.requestId }, 'REST API request failed');

    // Use centralized Error Mapper
    const mapped = mapError(error);

    // If it's a server error in production, hide details (HIGH-005 fix)
    const isProduction = process.env.NODE_ENV === 'production';
    const safeMessage =
      mapped.statusCode >= 500 && isProduction ? 'Internal Server Error' : mapped.message;

    // Also hide details for 5xx errors in production (HIGH-005 fix)
    const responseBody = {
      error: safeMessage,
      code: mapped.code,
      ...(mapped.statusCode < 500 || !isProduction ? { details: mapped.details } : {}),
    };

    await reply.status(mapped.statusCode).send(responseBody); // CRIT-010 fix: use await instead of void
  });

  return app;
}

export async function runServer(): Promise<void> {
  if (!config.rest.enabled) {
    restLogger.info('REST API disabled. Set AGENT_MEMORY_REST_ENABLED=true to enable.');
    return;
  }

  const host = config.rest.host;
  const port = config.rest.port;

  // Initialize AppContext
  const context = await createAppContext(config);

  // Register with container for services that use getDb()/getSqlite()
  registerContext(context);

  // Initialize and start health monitoring
  const healthMonitor = getHealthMonitor();
  if (context.adapters) {
    healthMonitor.initialize({
      storageAdapter: context.adapters.storage,
      cacheStatsProvider: () => ({
        size: context.runtime.queryCache.cache.size,
        memoryMB: context.runtime.queryCache.cache.stats.memoryMB,
      }),
    });
    healthMonitor.startPeriodicChecks();
  }

  // Start backpressure monitoring
  backpressure.startMonitoring();

  const app = createServer(context);

  // Graceful shutdown
  const shutdown = async () => {
    restLogger.info('Shutting down REST API...');
    healthMonitor.stopPeriodicChecks();
    backpressure.stopMonitoring();
    resetHealthMonitor();
    await app.close();
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  await app.listen({ host, port });
  restLogger.info({ host, port }, 'REST API listening');
}
