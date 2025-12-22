export { RateLimiter, type RateLimiterConfig } from './rate-limiter-core.js';

import { config } from '../config/index.js';

// Default rate limiter configurations from config
export const DEFAULT_RATE_LIMITS = {
  perAgent: config.rateLimit.perAgent,
  global: config.rateLimit.global,
  burst: config.rateLimit.burst,
} as const;
