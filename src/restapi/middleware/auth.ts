/**
 * Authentication & Authorization Middleware
 *
 * Extracted from server.ts for better separation of concerns.
 * Handles:
 * - Request ID generation and tracing
 * - Rate limit header management
 * - Content-Type validation
 * - Authentication and authorization via SecurityService
 */

import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../core/context.js';

/**
 * Register request ID tracing hook.
 *
 * Ensures every request has a unique ID for distributed tracing and debugging.
 * Accepts client-provided X-Request-ID or generates a new UUID.
 */
export function registerRequestIdHook(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request.headers['x-request-id'] as string) || randomUUID();
    request.requestId = requestId;
    reply.header('X-Request-ID', requestId);
  });
}

/**
 * Register rate limit response headers hook.
 *
 * Adds standard rate limit headers to all responses when rate limit info is available:
 * - X-RateLimit-Limit: Maximum requests allowed in the window
 * - X-RateLimit-Remaining: Requests remaining in current window
 * - X-RateLimit-Reset: Unix timestamp when the window resets
 */
export function registerRateLimitHeadersHook(app: FastifyInstance): void {
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.rateLimitInfo) {
      reply.header('X-RateLimit-Limit', String(request.rateLimitInfo.limit));
      reply.header('X-RateLimit-Remaining', String(request.rateLimitInfo.remaining));
      reply.header('X-RateLimit-Reset', String(request.rateLimitInfo.reset));
    }
  });
}

/**
 * Register Content-Type validation hook.
 *
 * Enforces application/json Content-Type for all mutating requests (POST, PUT, PATCH, DELETE).
 * Skips validation for:
 * - GET, HEAD, OPTIONS requests (no body expected)
 * - Health check endpoints (public monitoring)
 */
export function registerContentTypeValidationHook(app: FastifyInstance): void {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
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
}

/**
 * Configuration for public endpoints that bypass authentication.
 */
interface PublicEndpointConfig {
  /** Endpoints that are rate-limited but don't require auth (e.g., /health) */
  rateLimitedPublic: string[];
  /** Endpoints that are fully public (e.g., /metrics, OpenAPI spec) */
  fullyPublic: string[];
}

const DEFAULT_PUBLIC_ENDPOINTS: PublicEndpointConfig = {
  rateLimitedPublic: ['/health'],
  fullyPublic: ['/v1/openapi.json', '/metrics'],
};

/**
 * Register authentication and authorization hook.
 *
 * Handles:
 * 1. Public endpoint bypass (health, metrics, OpenAPI)
 * 2. Rate limiting for health endpoint by client IP
 * 3. Token-based authentication via SecurityService
 * 4. Rate limiting per agent and globally
 *
 * @param app - Fastify instance
 * @param context - Application context with SecurityService
 * @param publicEndpoints - Optional override for public endpoint configuration
 */
export function registerAuthHook(
  app: FastifyInstance,
  context: AppContext,
  publicEndpoints: PublicEndpointConfig = DEFAULT_PUBLIC_ENDPOINTS
): void {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.raw.url || request.url;

    if (typeof url === 'string') {
      // Check rate-limited public endpoints (e.g., health)
      for (const endpoint of publicEndpoints.rateLimitedPublic) {
        if (url.startsWith(endpoint)) {
          // Rate limit health endpoint by client IP to prevent DoS attacks
          // Uses Fastify's built-in request.ip which safely handles X-Forwarded-For when trustProxy is enabled
          const clientIp = request.ip ?? 'unknown';

          const healthCheck = await context.security.checkHealthRateLimit(clientIp);
          if (!healthCheck.allowed) {
            reply.header('Retry-After', String(Math.ceil((healthCheck.retryAfterMs ?? 1000) / 1000)));
            await reply
              .status(429)
              .send({ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' });
            return;
          }
          return; // Authenticated, continue
        }
      }

      // Check fully public endpoints (no rate limiting applied here)
      for (const endpoint of publicEndpoints.fullyPublic) {
        if (url === endpoint || url.startsWith(endpoint)) {
          return; // Public endpoint, no auth required
        }
      }
    }

    // Use centralized Security Service for authentication
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
}

/**
 * Register all authentication middleware hooks.
 *
 * This is the main entry point for setting up auth middleware.
 * Registers hooks in the correct order:
 * 1. Request ID (onRequest) - earliest, for tracing
 * 2. Rate limit headers (onSend) - adds headers to responses
 * 3. Content-Type validation (preHandler) - before processing
 * 4. Authentication (preHandler) - after content-type, validates identity
 *
 * @param app - Fastify instance
 * @param context - Application context with SecurityService
 */
export function registerAuthMiddleware(app: FastifyInstance, context: AppContext): void {
  registerRequestIdHook(app);
  registerRateLimitHeadersHook(app);
  registerContentTypeValidationHook(app);
  registerAuthHook(app, context);
}
