import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';

import { createComponentLogger } from '../utils/logger.js';
import type { AppContext } from '../core/context.js';
import { createAppContext, shutdownAppContext } from '../core/factory.js';
import { config } from '../config/index.js';
import { mapError } from '../utils/error-mapper.js';
import { registerContext } from '../core/container.js';
import { registerV1Routes } from './routes/v1.js';
import { getHealthMonitor, resetHealthMonitor } from '../services/health.service.js';
import { metrics } from '../utils/metrics.js';
import { backpressure } from '../utils/backpressure.js';
import { registerAuthMiddleware } from './middleware/index.js';

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
 * Validate a CORS origin URL.
 * Only allows http:// or https:// URLs to prevent protocol-based attacks.
 *
 * @security Rejects non-HTTP(S) protocols (file://, javascript:, data:, etc.)
 */
function isValidCorsOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parse and validate CORS origins from environment variable.
 *
 * @security CORS Security Implications:
 *
 * When `credentials: true` is enabled (as in this server), browsers will:
 * 1. Include cookies, HTTP authentication, and client-side certificates in cross-origin requests
 * 2. Allow the response to be read by the requesting origin
 *
 * Security considerations:
 * - NEVER use wildcard (*) origin with credentials - browsers will reject this
 * - Only whitelist trusted origins that genuinely need cross-origin access
 * - Each origin should be a specific, validated URL (not a pattern)
 * - Consider the principle of least privilege when adding origins
 *
 * Configuration:
 * Set AGENT_MEMORY_REST_CORS_ORIGINS to a comma-separated list of allowed origins.
 * Example: "https://app.example.com,https://admin.example.com"
 *
 * If not set or empty, CORS is disabled (same-origin only).
 *
 * @param envValue - Comma-separated list of allowed origins
 * @returns Array of validated origins, or false if CORS should be disabled
 */
function parseCorsOrigins(envValue: string | undefined): string[] | false {
  if (!envValue) {
    return false;
  }

  const origins = envValue.split(',').map((o) => o.trim()).filter(Boolean);
  const validOrigins: string[] = [];
  const invalidOrigins: string[] = [];

  for (const origin of origins) {
    if (isValidCorsOrigin(origin)) {
      validOrigins.push(origin);
    } else {
      invalidOrigins.push(origin);
    }
  }

  if (invalidOrigins.length > 0) {
    restLogger.warn(
      { invalidOrigins },
      'Invalid CORS origins ignored. Origins must be valid http:// or https:// URLs.'
    );
  }

  return validOrigins.length > 0 ? validOrigins : false;
}

/**
 * Create a REST API server with the provided AppContext.
 *
 * @param context - The application context (required per ADR-008)
 * @returns Promise resolving to configured Fastify instance
 */
export async function createServer(context: AppContext): Promise<FastifyInstance> {
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
  // See parseCorsOrigins() JSDoc for security implications of credentials: true
  await app.register(cors, {
    origin: parseCorsOrigins(process.env.AGENT_MEMORY_REST_CORS_ORIGINS),
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
  await app.register(helmet, {
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
  await app.register(compress, {
    global: true,
    threshold: 1024, // Only compress responses > 1KB
    encodings: ['gzip', 'deflate'], // Prefer gzip
  });

  // Register authentication middleware (request ID, rate limits, content-type, auth)
  // See src/restapi/middleware/auth.ts for implementation details
  registerAuthMiddleware(app, context);

  app.get('/health', async () => {
    const healthMonitor = getHealthMonitor();
    const lastCheck = healthMonitor.getLastCheckResult();

    // Get feedback queue stats if available
    const feedbackQueue = context.services.feedbackQueue;
    const feedbackQueueStats = feedbackQueue?.getStats();

    if (lastCheck) {
      return {
        ok: lastCheck.status !== 'unhealthy',
        status: lastCheck.status,
        uptimeSec: Math.round(process.uptime()),
        version: lastCheck.version,
        database: lastCheck.database,
        circuitBreakers: lastCheck.circuitBreakers.length,
        feedbackQueue: feedbackQueueStats
          ? {
              queueDepth: feedbackQueueStats.queueDepth,
              maxQueueSize: feedbackQueueStats.maxQueueSize,
              isRunning: feedbackQueueStats.isRunning,
              batchesProcessed: feedbackQueueStats.batchesProcessed,
              itemsProcessed: feedbackQueueStats.itemsProcessed,
              failures: feedbackQueueStats.failures,
            }
          : undefined,
      };
    }

    // Fallback for first request before periodic checks run
    return {
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      feedbackQueue: feedbackQueueStats
        ? {
            queueDepth: feedbackQueueStats.queueDepth,
            isRunning: feedbackQueueStats.isRunning,
          }
        : undefined,
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

  const app = await createServer(context);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    restLogger.info({ signal }, 'Shutting down REST API...');

    // Stop health monitoring
    healthMonitor.stopPeriodicChecks();
    backpressure.stopMonitoring();
    resetHealthMonitor();

    // Gracefully shutdown AppContext (drains feedback queue on SIGTERM)
    const drainQueue = signal === 'SIGTERM';
    await shutdownAppContext(context, { drainFeedbackQueue: drainQueue });

    // Close Fastify
    await app.close();

    restLogger.info('REST API shutdown complete');
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host, port });
  restLogger.info({ host, port }, 'REST API listening');
}
