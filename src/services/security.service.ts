import { timingSafeEqual } from 'node:crypto';
import { createComponentLogger } from '../utils/logger.js';
import type { Config } from '../config/index.js';
import { RateLimiter } from '../utils/rate-limiter-core.js';

const logger = createComponentLogger('security');

export interface SecurityContext {
  agentId?: string;
}

export interface SecurityResult {
  authorized: boolean;
  error?: string;
  statusCode?: number;
  retryAfterMs?: number;
  context?: SecurityContext;
}

type AuthMapping = { key: string; agentId: string };

function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Service to handle authentication and rate limiting
 */
export class SecurityService {
  private readonly restAuthDisabled: boolean;
  private readonly restApiKey: string | undefined;
  private readonly restApiKeys: string | undefined;
  private readonly restAgentId: string;

  private readonly burstLimiter: RateLimiter;
  private readonly globalLimiter: RateLimiter;
  private readonly perAgentLimiter: RateLimiter;

  constructor(config: Config) {
    this.restAuthDisabled = config.security.restAuthDisabled;
    this.restApiKey = config.security.restApiKey;
    this.restApiKeys = config.security.restApiKeys;
    this.restAgentId = config.security.restAgentId;

    const enabled = config.rateLimit.enabled;
    this.burstLimiter = new RateLimiter({ ...config.rateLimit.burst, enabled });
    this.globalLimiter = new RateLimiter({ ...config.rateLimit.global, enabled });
    this.perAgentLimiter = new RateLimiter({ ...config.rateLimit.perAgent, enabled });
  }

  /**
   * Parse API Key mappings from configuration
   */
  private parseApiKeyMappings(): AuthMapping[] {
    const raw = this.restApiKeys;
    if (!raw) return [];

    try {
      // Try JSON first
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item) => item && typeof item.key === 'string' && typeof item.agentId === 'string'
        ) as AuthMapping[];
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.entries(parsed)
          .map(([key, agentId]) => ({
            key,
            agentId: String(agentId),
          }))
          .filter((m) => m.agentId.length > 0);
      }
    } catch {
      // Fall through to comma-separated
    }

    // Fallback: key:agentId,key2:agentId2
    return raw
      .split(',')
      .map((p) => {
        const sep = p.includes('=') ? '=' : ':';
        const [key, agentId] = p.split(sep);
        return { key: (key ?? '').trim(), agentId: (agentId ?? '').trim() };
      })
      .filter((m) => m.key && m.agentId);
  }

  /**
   * Resolve Agent ID from a bearer token or API key
   */
  resolveAgentId(token: string): string | null {
    // 1. Check Mappings
    const mappings = this.parseApiKeyMappings();
    for (const m of mappings) {
      if (safeEqual(token, m.key)) return m.agentId;
    }

    // 2. Check Single Key
    const singleKey = this.restApiKey;
    if (singleKey && safeEqual(token, singleKey)) {
      return this.restAgentId;
    }

    return null;
  }

  /**
   * Validate a request for Auth and Rate Limits
   *
   * @param input.headers - Request headers (for REST)
   * @param input.args - Tool arguments (for MCP)
   * @param input.skipAuth - Force skip auth (use with caution)
   */
  validateRequest(input: {
    headers?: Record<string, string | string[] | undefined>;
    args?: Record<string, unknown>;
    skipAuth?: boolean;
  }): SecurityResult {
    // 1. Resolve Identity
    let agentId: string | undefined;

    // Check headers (REST style)
    if (input.headers) {
      const authHeader = input.headers['authorization'];
      const apiKeyHeader = input.headers['x-api-key'];

      let token: string | undefined;
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      } else if (typeof apiKeyHeader === 'string') {
        token = apiKeyHeader;
      }

      if (token) {
        const resolved = this.resolveAgentId(token);
        if (resolved) {
          agentId = resolved;
          logger.debug({ agentId }, 'Resolved identity from token');
        }
      }
    }

    // Check args (MCP style) - usually trusted in MCP mode if not using auth
    if (!agentId && input.args && typeof input.args.agentId === 'string') {
      agentId = input.args.agentId;
      logger.debug({ agentId }, 'Resolved identity from args');
    }

    // If Auth is strictly required but missing
    if (!input.skipAuth && !this.restAuthDisabled && !agentId && input.headers) {
      // Only fail if headers were provided (implying REST context where auth is expected)
      // For MCP, agentId is optional unless we enforce it later
      if (!this.isAuthConfigured()) {
        return { authorized: false, error: 'Auth not configured', statusCode: 503 };
      }
      return { authorized: false, error: 'Unauthorized', statusCode: 401 };
    }

    // 2. Rate Limiting
    const limitResult = this.checkRateLimits(agentId);
    if (!limitResult.allowed) {
      logger.warn({ agentId, reason: limitResult.reason }, 'Rate limit exceeded');
      return {
        authorized: false,
        error: limitResult.reason ?? 'Rate limit exceeded',
        statusCode: 429,
        retryAfterMs: limitResult.retryAfterMs,
      };
    }

    return {
      authorized: true,
      context: { agentId },
    };
  }

  isAuthConfigured(): boolean {
    return Boolean(
      (this.restApiKeys && this.restApiKeys.length > 0) ||
      (this.restApiKey && this.restApiKey.length > 0)
    );
  }

  private checkRateLimits(agentId?: string): {
    allowed: boolean;
    reason?: string;
    retryAfterMs?: number;
  } {
    const burstResult = this.burstLimiter.check('global');
    if (!burstResult.allowed) {
      return {
        allowed: false,
        reason: 'Burst rate limit exceeded',
        retryAfterMs: burstResult.retryAfterMs,
      };
    }

    const globalResult = this.globalLimiter.check('global');
    if (!globalResult.allowed) {
      return {
        allowed: false,
        reason: 'Global rate limit exceeded',
        retryAfterMs: globalResult.retryAfterMs,
      };
    }

    if (agentId) {
      const agentResult = this.perAgentLimiter.check(agentId);
      if (!agentResult.allowed) {
        return {
          allowed: false,
          reason: `Rate limit exceeded for agent ${agentId}`,
          retryAfterMs: agentResult.retryAfterMs,
        };
      }
    }

    return { allowed: true };
  }
}
