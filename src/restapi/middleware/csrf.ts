/**
 * CSRF (Cross-Site Request Forgery) Protection Middleware
 *
 * Implements double-submit cookie pattern for CSRF protection:
 * 1. Server generates CSRF token and sets it in a cookie
 * 2. Client reads token from cookie and sends it in X-CSRF-Token header
 * 3. Server validates that cookie and header match
 *
 * Security:
 * - Uses cryptographically secure random tokens
 * - Tokens are session-scoped (bound to agent ID)
 * - SameSite=Strict cookie attribute prevents cross-site sending
 * - Validates on all state-changing requests (POST, PUT, PATCH, DELETE)
 *
 * HIGH-003 fix: Missing CSRF protection identified in code review
 */

import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createComponentLogger } from '../../utils/logger.js';

const csrfLogger = createComponentLogger('csrf');

// CSRF configuration
const CSRF_TOKEN_LENGTH = 32; // 256 bits
const CSRF_COOKIE_NAME = 'AGENT_MEMORY_CSRF';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// State-changing HTTP methods that require CSRF protection
const PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Generate a cryptographically secure CSRF token.
 * Uses 256 bits of entropy from crypto.randomBytes.
 *
 * @returns Base64-encoded random token
 */
function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('base64');
}

/**
 * Create an HMAC signature for CSRF token validation.
 * Binds token to agent ID to prevent token reuse across sessions.
 *
 * @param token - CSRF token
 * @param agentId - Agent ID from authenticated request
 * @param secret - Server secret for HMAC (from environment or runtime)
 * @returns HMAC signature
 */
function createTokenSignature(token: string, agentId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${token}:${agentId}`).digest('base64');
}

/**
 * Verify CSRF token matches the signature for the given agent.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param token - CSRF token from header
 * @param signature - CSRF signature from cookie
 * @param agentId - Agent ID from authenticated request
 * @param secret - Server secret for HMAC
 * @returns True if token is valid
 */
function verifyCsrfToken(
  token: string,
  signature: string,
  agentId: string,
  secret: string
): boolean {
  try {
    const expectedSignature = createTokenSignature(token, agentId, secret);
    const tokenBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    // Timing-safe comparison prevents timing attacks
    return (
      tokenBuffer.length === expectedBuffer.length && timingSafeEqual(tokenBuffer, expectedBuffer)
    );
  } catch (error) {
    csrfLogger.warn({ error }, 'CSRF token verification failed');
    return false;
  }
}

/**
 * Configuration for CSRF protection.
 */
export interface CsrfConfig {
  /** Server secret for HMAC signing. Should be at least 32 bytes of entropy. */
  secret: string;
  /** Endpoints that bypass CSRF protection (e.g., /health, /metrics) */
  exemptPaths?: string[];
  /** Cookie options */
  cookieOptions?: {
    /** Cookie domain (default: current domain) */
    domain?: string;
    /** Cookie path (default: /) */
    path?: string;
    /** Secure flag (default: true in production) */
    secure?: boolean;
  };
}

/**
 * Register CSRF protection middleware.
 *
 * Workflow:
 * 1. onRequest: Generate CSRF token if not present, set in cookie
 * 2. preHandler: Validate CSRF token for state-changing requests
 *
 * @param app - Fastify instance
 * @param config - CSRF configuration
 */
export function registerCsrfProtection(app: FastifyInstance, config: CsrfConfig): void {
  const secret = config.secret;
  const exemptPaths = config.exemptPaths || ['/health', '/metrics', '/v1/openapi.json'];
  const isProduction = process.env.NODE_ENV === 'production';

  // Validate secret strength
  if (!secret || secret.length < 32) {
    csrfLogger.error(
      { secretLength: secret?.length || 0 },
      'SECURITY: CSRF secret is too weak. Must be at least 32 characters.'
    );
    throw new Error('CSRF secret must be at least 32 characters');
  }

  /**
   * Hook 1: Generate and set CSRF token cookie on every request.
   * Client can read this and include it in subsequent requests.
   */
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.raw.url || request.url;

    // Skip exempt paths
    if (typeof url === 'string' && exemptPaths.some((path) => url.startsWith(path))) {
      return;
    }

    // Check if CSRF cookie already exists
    const existingToken = request.cookies?.[CSRF_COOKIE_NAME];

    if (!existingToken) {
      // Generate new token
      const token = generateCsrfToken();
      const agentId = request.agentId || 'anonymous'; // Will be set by auth middleware
      const signature = createTokenSignature(token, agentId, secret);

      // Set CSRF token in cookie
      void reply.setCookie(CSRF_COOKIE_NAME, signature, {
        httpOnly: true,
        secure: config.cookieOptions?.secure ?? isProduction,
        sameSite: 'strict', // HIGH-003 fix: Prevent CSRF via SameSite
        path: config.cookieOptions?.path || '/',
        domain: config.cookieOptions?.domain,
        maxAge: CSRF_TOKEN_TTL_MS / 1000, // Convert to seconds
      });

      csrfLogger.debug({ agentId, requestId: request.requestId }, 'Generated new CSRF token');
    }
  });

  /**
   * Hook 2: Validate CSRF token on state-changing requests.
   * Must run AFTER authentication middleware so agentId is available.
   */
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.raw.url || request.url;

    // Skip exempt paths
    if (typeof url === 'string' && exemptPaths.some((path) => url.startsWith(path))) {
      return;
    }

    // Only validate CSRF for state-changing methods
    if (!PROTECTED_METHODS.includes(request.method)) {
      return;
    }

    // Skip CSRF validation for API-key authenticated requests (machine-to-machine)
    // These are not vulnerable to CSRF attacks since they don't use browser sessions
    const authHeader = request.headers['authorization'];
    const apiKeyHeader = request.headers['x-api-key'];
    if (
      (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) ||
      typeof apiKeyHeader === 'string'
    ) {
      csrfLogger.debug(
        { method: request.method, url, requestId: request.requestId },
        'CSRF validation skipped: API key authentication'
      );
      return;
    }

    // Get CSRF token from header and cookie
    const headerToken = request.headers[CSRF_HEADER_NAME] as string | undefined;
    const cookieSignature = request.cookies?.[CSRF_COOKIE_NAME];
    const agentId = request.agentId || 'anonymous';

    // Both must be present
    if (!headerToken || !cookieSignature) {
      csrfLogger.warn(
        {
          method: request.method,
          url,
          hasHeader: !!headerToken,
          hasCookie: !!cookieSignature,
          agentId,
          requestId: request.requestId,
        },
        'CSRF validation failed: missing token or cookie'
      );

      await reply.status(403).send({
        error: 'CSRF token validation failed',
        code: 'CSRF_TOKEN_MISSING',
        details: {
          message:
            'CSRF token required. Include X-CSRF-Token header with value from AGENT_MEMORY_CSRF cookie.',
        },
      });
      return;
    }

    // Verify token
    if (!verifyCsrfToken(headerToken, cookieSignature, agentId, secret)) {
      csrfLogger.warn(
        {
          method: request.method,
          url,
          agentId,
          requestId: request.requestId,
        },
        'CSRF validation failed: invalid token'
      );

      await reply.status(403).send({
        error: 'CSRF token validation failed',
        code: 'CSRF_TOKEN_INVALID',
        details: {
          message: 'CSRF token is invalid or expired. Refresh the page to get a new token.',
        },
      });
      return;
    }

    csrfLogger.debug(
      { method: request.method, url, agentId, requestId: request.requestId },
      'CSRF validation passed'
    );
  });

  csrfLogger.info('CSRF protection enabled');
}
