/**
 * Rate Limit Configuration Builders
 *
 * Builds rate limiting nested configuration from environment variables.
 */

import {
  rateLimitPerAgentOptions,
  rateLimitGlobalOptions,
  rateLimitBurstOptions,
} from '../registry/index.js';
import { getEnvInt } from './helpers.js';

/**
 * Rate limit configuration for a single limit type.
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Build rate limit per-agent config with proper typing.
 * Controls rate limiting per individual agent.
 *
 * @returns Per-agent rate limit configuration
 */
export function buildRateLimitPerAgent(): RateLimitConfig {
  return {
    maxRequests: getEnvInt(
      rateLimitPerAgentOptions.maxRequests.envKey,
      rateLimitPerAgentOptions.maxRequests.defaultValue
    ),
    windowMs: getEnvInt(
      rateLimitPerAgentOptions.windowMs.envKey,
      rateLimitPerAgentOptions.windowMs.defaultValue
    ),
  };
}

/**
 * Build rate limit global config with proper typing.
 * Controls rate limiting across all agents combined.
 *
 * @returns Global rate limit configuration
 */
export function buildRateLimitGlobal(): RateLimitConfig {
  return {
    maxRequests: getEnvInt(
      rateLimitGlobalOptions.maxRequests.envKey,
      rateLimitGlobalOptions.maxRequests.defaultValue
    ),
    windowMs: getEnvInt(
      rateLimitGlobalOptions.windowMs.envKey,
      rateLimitGlobalOptions.windowMs.defaultValue
    ),
  };
}

/**
 * Build rate limit burst config with proper typing.
 * Controls burst allowance for short-term request spikes.
 *
 * @returns Burst rate limit configuration
 */
export function buildRateLimitBurst(): RateLimitConfig {
  return {
    maxRequests: getEnvInt(
      rateLimitBurstOptions.maxRequests.envKey,
      rateLimitBurstOptions.maxRequests.defaultValue
    ),
    windowMs: getEnvInt(
      rateLimitBurstOptions.windowMs.envKey,
      rateLimitBurstOptions.windowMs.defaultValue
    ),
  };
}
