import { timingSafeEqual, createHash } from 'node:crypto';
import { createComponentLogger } from '../utils/logger.js';
import { securityLogger } from '../utils/security-logger.js';
import type { Config } from '../config/index.js';
import type { IRateLimiterAdapter } from '../core/adapters/interfaces.js';
import { createLocalRateLimiterAdapter } from '../core/adapters/local-rate-limiter.adapter.js';
import { getUnifiedApiKey, isDevMode } from '../config/auth.js';

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
  rateLimitInfo?: {
    limit: number;
    remaining: number;
    reset: number;
  };
}

type AuthMapping = { key: string; agentId: string };

/**
 * HMAC-indexed API key entry for O(1) lookup with timing-safe verification.
 *
 * Security approach:
 * 1. Pre-compute SHA-256 hash of each API key at construction time
 * 2. During lookup, hash the incoming token once
 * 3. Use Map.get() for O(1) hash lookup (no timing leak - hash comparison is constant)
 * 4. Perform timing-safe comparison of actual keys to confirm (prevents hash collision attacks)
 *
 * This provides O(1) average case while maintaining timing-safe security guarantees.
 */
interface HashedKeyEntry {
  /** Original API key (for timing-safe verification) */
  key: string;
  /** Associated agent ID */
  agentId: string;
}

/**
 * Parsed API key configuration with HMAC-indexed lookup.
 * - byHash: Map from SHA-256 hex hash → key entry (for O(1) lookup)
 * - entries: Array of all mappings (for fallback iteration if needed)
 */
interface ParsedApiKeyMap {
  byHash: Map<string, HashedKeyEntry>;
  entries: AuthMapping[];
}

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

  private readonly burstLimiter: IRateLimiterAdapter;
  private readonly globalLimiter: IRateLimiterAdapter;
  private readonly perAgentLimiter: IRateLimiterAdapter;
  private readonly healthLimiter: IRateLimiterAdapter;

  /** Cached parsed API key mappings (key → agentId) */
  private parsedApiKeyMap: ParsedApiKeyMap;

  constructor(
    config: Config,
    rateLimiters?: {
      perAgent: IRateLimiterAdapter;
      global: IRateLimiterAdapter;
      burst: IRateLimiterAdapter;
    }
  ) {
    this.restAuthDisabled = config.security.restAuthDisabled;
    this.restApiKey = config.security.restApiKey;
    this.restApiKeys = config.security.restApiKeys;
    this.restAgentId = config.security.restAgentId;

    // Use provided rate limiters or create local ones
    if (rateLimiters) {
      this.perAgentLimiter = rateLimiters.perAgent;
      this.globalLimiter = rateLimiters.global;
      this.burstLimiter = rateLimiters.burst;
    } else {
      const enabled = config.rateLimit.enabled;
      this.burstLimiter = createLocalRateLimiterAdapter({ ...config.rateLimit.burst, enabled });
      this.globalLimiter = createLocalRateLimiterAdapter({ ...config.rateLimit.global, enabled });
      this.perAgentLimiter = createLocalRateLimiterAdapter({
        ...config.rateLimit.perAgent,
        enabled,
      });
    }

    this.healthLimiter = createLocalRateLimiterAdapter({
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
    logger.debug({ keyCount: this.parsedApiKeyMap.byHash.size }, 'Reloaded API key mappings');
  }

  /**
   * Build the HMAC-indexed API key map from raw configuration.
   * Pre-computes SHA-256 hashes for O(1) lookup while maintaining timing-safe verification.
   * Called once at construction and on explicit reload.
   */
  private buildApiKeyMap(): ParsedApiKeyMap {
    const mappings = this.parseApiKeyMappings();
    const byHash = new Map<string, HashedKeyEntry>();

    for (const m of mappings) {
      // Pre-compute SHA-256 hash for O(1) lookup
      const hash = createHash('sha256').update(m.key).digest('hex');
      byHash.set(hash, { key: m.key, agentId: m.agentId });
    }

    return { byHash, entries: mappings };
  }

  /**
   * Parse API Key mappings from configuration
   */
  private parseApiKeyMappings(): AuthMapping[] {
    const raw = this.restApiKeys;
    if (!raw) return [];

    try {
      // Try JSON first
      // JSON.parse returns unknown - validate structure before use
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (item) => item && typeof item.key === 'string' && typeof item.agentId === 'string'
        ) as AuthMapping[];
      }
      if (typeof parsed === 'object' && parsed !== null) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
   *
   * Uses HMAC-indexed lookup for O(1) average case:
   * 1. Hash the incoming token once (constant time)
   * 2. Look up by hash in Map (O(1) - no timing leak from comparison)
   * 3. If found, perform timing-safe comparison to verify (prevents hash collision attacks)
   *
   * This is significantly faster than O(n) iteration for large key sets while
   * maintaining security through timing-safe verification of the actual key.
   */
  resolveAgentId(token: string): string | null {
    // 1. O(1) HMAC-indexed lookup in parsed API key mappings
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const candidate = this.parsedApiKeyMap.byHash.get(tokenHash);

    if (candidate) {
      // Verify with timing-safe comparison (prevents hash collision attacks)
      if (safeEqual(token, candidate.key)) {
        return candidate.agentId;
      }
    }

    // 2. Check Single Key (legacy/simple config)
    const singleKey = this.restApiKey;
    if (singleKey && safeEqual(token, singleKey)) {
      return this.restAgentId;
    }

    // 3. Check unified API key (new simplified config)
    const unifiedKey = getUnifiedApiKey();
    if (unifiedKey && safeEqual(token, unifiedKey)) {
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
  async validateRequest(input: {
    headers?: Record<string, string | string[] | undefined>;
    args?: Record<string, unknown>;
    skipAuth?: boolean;
  }): Promise<SecurityResult> {
    // DEV MODE: Bypass all authentication
    if (isDevMode()) {
      logger.debug('Dev mode enabled - bypassing authentication');
      // Still do rate limiting even in dev mode
      const limitResult = await this.checkRateLimits('dev-mode-agent');
      return {
        authorized: true,
        context: { agentId: 'dev-mode-agent' },
        rateLimitInfo:
          limitResult.limit !== undefined &&
          limitResult.remaining !== undefined &&
          limitResult.reset !== undefined
            ? {
                limit: limitResult.limit,
                remaining: limitResult.remaining,
                reset: limitResult.reset,
              }
            : undefined,
      };
    }

    // 1. Resolve Identity
    let agentId: string | undefined;
    let tokenProvided = false;

    // Check headers (REST style)
    if (input.headers) {
      const authHeader = input.headers['authorization'];
      const apiKeyHeader = input.headers['x-api-key'];

      let token: string | undefined;
      let tokenType: string | undefined;
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
        tokenType = 'Bearer';
      } else if (typeof apiKeyHeader === 'string') {
        token = apiKeyHeader;
        tokenType = 'API Key';
      }

      if (token) {
        tokenProvided = true;
        const resolved = this.resolveAgentId(token);
        if (resolved) {
          agentId = resolved;
          logger.debug({ agentId }, 'Resolved identity from token');
        } else {
          // Token provided but invalid - log auth failure
          securityLogger.logAuthFailure({
            reason: 'Invalid or unrecognized token',
            tokenType,
            userAgent: String(input.headers['user-agent'] ?? ''),
          });
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

      // Log unauthorized access attempt
      if (!tokenProvided) {
        securityLogger.logUnauthorizedAccess({
          description: 'No authentication credentials provided',
          userAgent: String(input.headers['user-agent'] ?? ''),
        });
      }

      return { authorized: false, error: 'Unauthorized', statusCode: 401 };
    }

    // 2. Rate Limiting
    const limitResult = await this.checkRateLimits(agentId);
    if (!limitResult.allowed) {
      logger.warn({ agentId, reason: limitResult.reason }, 'Rate limit exceeded');

      // Log rate limit violation with security logger
      const limitType = limitResult.reason?.includes('burst')
        ? 'burst'
        : limitResult.reason?.includes('global')
          ? 'global'
          : limitResult.reason?.includes('agent')
            ? 'per-agent'
            : ('global' as const);

      securityLogger.logRateLimitExceeded({
        limitType,
        agentId,
        currentCount: limitResult.limit,
        maxRequests: limitResult.limit,
        retryAfterMs: limitResult.retryAfterMs,
      });

      return {
        authorized: false,
        error: limitResult.reason ?? 'Rate limit exceeded',
        statusCode: 429,
        retryAfterMs: limitResult.retryAfterMs,
        rateLimitInfo:
          limitResult.limit !== undefined &&
          limitResult.remaining !== undefined &&
          limitResult.reset !== undefined
            ? {
                limit: limitResult.limit,
                remaining: limitResult.remaining,
                reset: limitResult.reset,
              }
            : undefined,
      };
    }

    return {
      authorized: true,
      context: { agentId },
      rateLimitInfo:
        limitResult.limit !== undefined &&
        limitResult.remaining !== undefined &&
        limitResult.reset !== undefined
          ? {
              limit: limitResult.limit,
              remaining: limitResult.remaining,
              reset: limitResult.reset,
            }
          : undefined,
    };
  }

  isAuthConfigured(): boolean {
    // In dev mode, auth is effectively "configured" (bypassed)
    if (isDevMode()) {
      return true;
    }

    return Boolean(
      (this.restApiKeys && this.restApiKeys.length > 0) ||
      (this.restApiKey && this.restApiKey.length > 0) ||
      getUnifiedApiKey()
    );
  }

  private async checkRateLimits(agentId?: string): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfterMs?: number;
    limit?: number;
    remaining?: number;
    reset?: number;
  }> {
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    const burstResult = await this.burstLimiter.check('global');
    if (!burstResult.allowed) {
      return {
        allowed: false,
        reason: 'Burst rate limit exceeded',
        retryAfterMs: burstResult.retryAfterMs,
        limit: burstResult.remaining + 1, // remaining + current request
        remaining: burstResult.remaining,
        reset: now + Math.ceil((burstResult.retryAfterMs ?? 0) / 1000),
      };
    }

    const globalResult = await this.globalLimiter.check('global');
    if (!globalResult.allowed) {
      return {
        allowed: false,
        reason: 'Global rate limit exceeded',
        retryAfterMs: globalResult.retryAfterMs,
        limit: globalResult.remaining + 1,
        remaining: globalResult.remaining,
        reset: now + Math.ceil((globalResult.retryAfterMs ?? 0) / 1000),
      };
    }

    if (agentId) {
      const agentResult = await this.perAgentLimiter.check(agentId);
      if (!agentResult.allowed) {
        return {
          allowed: false,
          reason: `Rate limit exceeded for agent ${agentId}`,
          retryAfterMs: agentResult.retryAfterMs,
          limit: agentResult.remaining + 1,
          remaining: agentResult.remaining,
          reset: now + Math.ceil((agentResult.retryAfterMs ?? 0) / 1000),
        };
      }
      // Return successful rate limit info from per-agent limiter
      return {
        allowed: true,
        limit: agentResult.remaining + 1,
        remaining: agentResult.remaining,
        reset: now + Math.ceil(agentResult.resetMs / 1000),
      };
    }

    // Return successful rate limit info from global limiter if no agentId
    return {
      allowed: true,
      limit: globalResult.remaining + 1,
      remaining: globalResult.remaining,
      reset: now + Math.ceil(globalResult.resetMs / 1000),
    };
  }

  /**
   * Check rate limit for health endpoint requests.
   * Health endpoint has stricter limits to prevent DoS attacks.
   */
  async checkHealthRateLimit(
    clientIp: string
  ): Promise<{ allowed: boolean; retryAfterMs?: number }> {
    const result = await this.healthLimiter.check(clientIp);
    return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
  }
}
