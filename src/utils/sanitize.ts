/**
 * Sanitization utilities for logging
 * Prevents accidental exposure of sensitive data in logs
 */

/**
 * Patterns that indicate sensitive data
 */
const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /auth/i,
  /bearer/i,
  /admin[-_]?key/i,
];

/**
 * Patterns for API key formats to mask
 *
 * Covers major cloud providers, SaaS services, and common token formats
 */
const API_KEY_PATTERNS = [
  // OpenAI API keys: sk-... (including project keys sk-proj-...)
  /sk-[a-zA-Z0-9\-_]{20,}/g,

  // Anthropic API keys: sk-ant-...
  /sk-ant-[a-zA-Z0-9\-_]{20,}/g,

  // AWS Access Key IDs: AKIA...
  /AKIA[A-Z0-9]{16}/g,

  // AWS Secret Access Keys (40 chars base64-like)
  /(?<![a-zA-Z0-9/+=])[a-zA-Z0-9/+=]{40}(?![a-zA-Z0-9/+=])/g,

  // GitHub tokens: ghp_... (personal), gho_... (OAuth), ghs_... (server), ghr_... (refresh)
  /gh[pors]_[a-zA-Z0-9]{36,}/g,

  // GitHub fine-grained tokens: github_pat_...
  /github_pat_[a-zA-Z0-9_]{22,}/g,

  // Stripe API keys: sk_live_..., sk_test_..., pk_live_..., pk_test_...
  /[sp]k_(live|test)_[a-zA-Z0-9]{24,}/g,

  // Stripe webhook signing secrets: whsec_...
  /whsec_[a-zA-Z0-9]{24,}/g,

  // Google API keys
  /AIza[a-zA-Z0-9\-_]{35}/g,

  // Google OAuth tokens
  /ya29\.[a-zA-Z0-9\-_]+/g,

  // Slack tokens: xoxb-..., xoxp-..., xoxa-..., xoxs-...
  /xox[bpas]-[a-zA-Z0-9-]{10,}/g,

  // Discord tokens and webhooks
  /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}/g,

  // Twilio API keys: SK...
  /SK[a-f0-9]{32}/g,

  // SendGrid API keys: SG...
  /SG\.[a-zA-Z0-9\-_]{22,}\.[a-zA-Z0-9\-_]{22,}/g,

  // Mailchimp API keys: ...-us1 (or other datacenter suffixes)
  /[a-f0-9]{32}-us\d{1,2}/g,

  // npm tokens: npm_...
  /npm_[a-zA-Z0-9]{36}/g,

  // PyPI tokens: pypi-...
  /pypi-[a-zA-Z0-9\-_]{50,}/g,

  // Heroku API keys
  /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g,

  // Generic API keys with common prefixes
  /api[-_]?key[-_]?[a-zA-Z0-9]{16,}/gi,

  // Bearer tokens
  /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,

  // JWT tokens (simplified pattern - three base64url segments)
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,

  // Private keys (PEM format markers)
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g,

  // Database connection strings with passwords
  /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/gi,
];

/**
 * Redaction placeholder
 */
const REDACTED = '***REDACTED***';

/**
 * Sanitize a value for safe logging
 * Recursively processes objects and arrays to mask sensitive data
 */
export function sanitizeForLogging(value: unknown): unknown {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle strings - mask API keys and sensitive patterns
  if (typeof value === 'string') {
    return maskSensitiveStrings(value);
  }

  // Handle arrays - recursively sanitize each element
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item));
  }

  // Handle objects - check keys and recursively sanitize values
  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(value)) {
      // If the key name suggests sensitive data, redact the entire value
      if (isSensitiveKey(key)) {
        sanitized[key] = REDACTED;
      } else {
        // Otherwise, recursively sanitize the value
        sanitized[key] = sanitizeForLogging(val);
      }
    }

    return sanitized;
  }

  // For primitives (numbers, booleans, etc.), return as-is
  return value;
}

/**
 * Check if a key name indicates sensitive data
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Mask API keys and sensitive patterns in strings
 */
function maskSensitiveStrings(str: string): string {
  let masked = str;

  // Apply all API key masking patterns
  for (const pattern of API_KEY_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      // Keep first few characters for debugging context
      const prefix = match.substring(0, Math.min(3, match.length));
      return `${prefix}...${REDACTED}`;
    });
  }

  return masked;
}

/**
 * Sanitize error objects for logging
 * Preserves error message and stack trace while masking sensitive data
 */
export function sanitizeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: maskSensitiveStrings(error.message),
      stack: error.stack ? maskSensitiveStrings(error.stack) : undefined,
      // Include any additional properties
      ...Object.fromEntries(
        Object.entries(error).map(([key, value]) => [key, sanitizeForLogging(value)])
      ),
    };
  }

  return sanitizeForLogging(error);
}

/**
 * Create a safe logger wrapper that automatically sanitizes all logged data
 */
export function createSafeLogger<T extends Record<string, (...args: unknown[]) => unknown>>(
  logger: T
): T {
  const safeLogger = {} as T;

  // Dynamically wrap logger methods - type assertions needed for generic logger interface
  for (const [method, fn] of Object.entries(logger)) {
    if (typeof fn === 'function') {
      // Wrap each logging method to sanitize arguments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic property assignment on generic type
      (safeLogger as Record<string, unknown>)[method] = (...args: unknown[]) => {
        const sanitizedArgs = args.map((arg) => {
          // Special handling for error objects
          if (arg instanceof Error) {
            return sanitizeError(arg);
          }
          return sanitizeForLogging(arg);
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- Calling original logger method
        return (fn as (...a: unknown[]) => unknown).apply(logger, sanitizedArgs);
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic property assignment on generic type
      (safeLogger as Record<string, unknown>)[method] = fn;
    }
  }

  return safeLogger;
}
