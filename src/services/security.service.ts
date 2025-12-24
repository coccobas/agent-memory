import { timingSafeEqual, createHash } from 'node:crypto';
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

/**
 * Parsed API key configuration for efficient lookup.
 * Keys are API keys, values are agent IDs.
 */
type ParsedApiKeyMap = Map<string, string>;

/**
 * Timing-safe string comparison that prevents length and null oracle attacks.
 *
 * Security approach:
 * 1. Always perform work even for null/empty inputs (no early returns)
 * 2. Hash both inputs to normalize lengths before comparison
 * 3. Use crypto.timingSafeEqual for the final comparison
 */
function safeEqual(a: string, b: string): boolean {
  // Normalize inputs: treat null/undefined as empty string
  const aVal = a ?? '';
  const bVal = b ?? '';

  // Hash both values to:
  // 1. Normalize to equal length (SHA-256 always produces 32 bytes)
  // 2. Prevent length oracle attacks
  // 3. Add constant-time processing regardless of input
  const aHash = createHash('sha256').update(aVal).digest();
  const bHash = createHash('sha256').update(bVal).digest();

  // Perform timing-safe comparison
  const isMatch = timingSafeEqual(aHash, bHash);

  // Also check that neither input was empty (reject empty credentials)
  // This check happens AFTER the timing-safe comparison to prevent timing leaks
  const bothNonEmpty = aVal.length > 0 && bVal.length > 0;

  return isMatch && bothNonEmpty;
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
  private readonly healthLimiter: RateLimiter;

  /** Cached parsed API key mappings (key → agentId) */
  private parsedApiKeyMap: ParsedApiKeyMap;

  constructor(config: Config) {
    this.restAuthDisabled = config.security.restAuthDisabled;
    this.restApiKey = config.security.restApiKey;
    this.restApiKeys = config.security.restApiKeys;
    this.restAgentId = config.security.restAgentId;

    const enabled = config.rateLimit.enabled;
    this.burstLimiter = new RateLimiter({ ...config.rateLimit.burst, enabled });
    this.globalLimiter = new RateLimiter({ ...config.rateLimit.global, enabled });
    this.perAgentLimiter = new RateLimiter({ ...config.rateLimit.perAgent, enabled });
    this.healthLimiter = new RateLimiter({
      maxRequests: 60,
      windowMs: 60000,
      enabled: true,
      minBurstProtection: 20,
    });

    // Parse API keys once at construction (not per-request)
    this.parsedApiKeyMap = this.buildApiKeyMap();
  }

  /**
   * Reload API key mappings from the stored raw configuration.
   * Useful for hot reload scenarios or testing.
   */
  reloadApiKeys(): void {
    this.parsedApiKeyMap = this.buildApiKeyMap();
    logger.debug({ keyCount: this.parsedApiKeyMap.size }, 'Reloaded API key mappings');
  }

  /**
   * Build the API key map from raw configuration.
   * Called once at construction and on explicit reload.
   */
  private buildApiKeyMap(): ParsedApiKeyMap {
    const mappings = this.parseApiKeyMappings();
    const map = new Map<string, string>();
    for (const m of mappings) {
      map.set(m.key, m.agentId);
    }
    return map;
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
   * Resolve Agent ID from a bearer token or API key.
   * Uses cached API key map for O(1) lookup.
   */
  resolveAgentId(token: string): string | null {
    // 1. Check cached mappings (O(1) lookup by iterating for timing-safe comparison)
    // Note: We iterate to use timing-safe comparison, but the map is pre-parsed
    for (const [key, agentId] of this.parsedApiKeyMap) {
      if (safeEqual(token, key)) return agentId;
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

  /**
   * Check rate limit for health endpoint requests.
   * Health endpoint has stricter limits to prevent DoS attacks.
   */
  checkHealthRateLimit(clientIp: string): { allowed: boolean; retryAfterMs?: number } {
    const result = this.healthLimiter.check(clientIp);
    return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
  }
}
