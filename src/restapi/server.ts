import Fastify, { type FastifyInstance } from 'fastify';

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

// Extend Fastify request to include authenticated agent ID
declare module 'fastify' {
  interface FastifyRequest {
    agentId?: string;
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
  });

  app.addHook('preHandler', async (request, reply) => {
    const url = request.raw.url || request.url;

    // Skip auth for public endpoints
    if (typeof url === 'string') {
      if (url.startsWith('/health')) {
        // Rate limit health endpoint by client IP to prevent DoS attacks
        const forwardedFor = request.headers['x-forwarded-for'];
        let clientIp = request.ip ?? 'unknown';
        if (forwardedFor !== undefined) {
          const firstIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
          if (firstIp !== undefined) {
            const parts = String(firstIp).split(',');
            clientIp = parts[0]?.trim() ?? clientIp;
          }
        }

        const healthCheck = context.security.checkHealthRateLimit(clientIp);
        if (!healthCheck.allowed) {
          reply.header('Retry-After', String(Math.ceil((healthCheck.retryAfterMs ?? 1000) / 1000)));
          await reply.status(429).send({ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' });
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
    const result = context.security.validateRequest({
      headers: request.headers,
    });

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

  app.setErrorHandler((error, _request, reply) => {
    restLogger.error({ error }, 'REST API request failed');

    // Use centralized Error Mapper
    const mapped = mapError(error);

    // If it's a server error in production, hide details
    const safeMessage =
      mapped.statusCode >= 500 && process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : mapped.message;

    void reply.status(mapped.statusCode).send({
      error: safeMessage,
      code: mapped.code,
      details: mapped.details,
    });
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
