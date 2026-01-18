/**
 * Security validation utilities for extraction providers
 */

import { createComponentLogger } from '../../utils/logger.js';
import { createValidationError } from '../../core/errors.js';

const logger = createComponentLogger('extraction-validation');

// Security: Allowed OpenAI-compatible hosts
const ALLOWED_OPENAI_HOSTS = ['api.openai.com', 'api.anthropic.com'];

/**
 * Detect integer IP format to prevent SSRF bypass
 * Examples: 2130706433 (decimal for 127.0.0.1), 0x7f000001 (hex)
 */
export function isIntegerIpFormat(hostname: string): boolean {
  return /^\d+$/.test(hostname) || /^0x[0-9a-fA-F]+$/i.test(hostname);
}

/**
 * Validate URL for SSRF protection.
 * Rejects private IP ranges and ensures only approved protocols.
 */
export function validateExternalUrl(urlString: string, allowPrivate: boolean = false): void {
  const url = new URL(urlString);

  // Check protocol
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw createValidationError('url', `invalid scheme: ${url.protocol}. Only http/https allowed`);
  }

  if (!allowPrivate) {
    // Check for private/internal IP ranges
    let hostname = url.hostname.toLowerCase();

    // Strip IPv6 zone IDs (e.g., fe80::1%eth0) as they can bypass SSRF protections
    if (hostname.includes('%25') || hostname.includes('%')) {
      const originalHostname = hostname;
      const splitByEncoded = hostname.split('%25');
      const splitByPercent = (splitByEncoded[0] ?? hostname).split('%');
      hostname = splitByPercent[0] ?? hostname;
      logger.warn(
        { original: originalHostname, stripped: hostname },
        'SSRF protection: Stripped IPv6 zone ID from hostname'
      );
    }

    // Block integer IP format before pattern checks
    if (isIntegerIpFormat(hostname)) {
      throw createValidationError(
        'hostname',
        `SSRF protection: Integer IP format not allowed: ${hostname}. Use standard dotted notation`
      );
    }

    // IPv4 private patterns
    const privatePatterns = [
      /^127\./, // 127.0.0.0/8 (loopback)
      /^10\./, // 10.0.0.0/8 (private)
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12 (private)
      /^192\.168\./, // 192.168.0.0/16 (private)
      /^169\.254\./, // 169.254.0.0/16 (link-local, AWS metadata)
      /^0\.0\.0\.0$/, // 0.0.0.0
      /^localhost$/i, // localhost
    ];

    // IPv6 private patterns
    const ipv6PrivatePatterns = [
      /^\[?::1\]?$/i, // IPv6 loopback
      /^\[?fe80:/i, // link-local
      /^\[?fc[0-9a-f]{2}:/i, // unique local (fc00::/7)
      /^\[?fd[0-9a-f]{2}:/i, // unique local (fd00::/8)
      /^\[?ff[0-9a-f]{2}:/i, // multicast (ff00::/8)
    ];

    for (const pattern of privatePatterns) {
      if (pattern.test(hostname)) {
        throw createValidationError(
          'hostname',
          `SSRF protection: Private/internal addresses not allowed: ${hostname}`
        );
      }
    }

    for (const pattern of ipv6PrivatePatterns) {
      if (pattern.test(hostname)) {
        throw createValidationError(
          'hostname',
          `SSRF protection: Private IPv6 addresses not allowed: ${hostname}`
        );
      }
    }
  }
}

/**
 * Validate model name to prevent injection attacks.
 */
export function isValidModelName(modelName: string): boolean {
  // Allow alphanumeric, hyphens, underscores, colons (for tags like llama:7b), and dots
  const validPattern = /^[a-zA-Z0-9._:-]+$/;
  return validPattern.test(modelName) && modelName.length <= 100;
}

/**
 * Validate OpenAI-compatible base URL against allowlist.
 */
export function validateOpenAIBaseUrl(baseUrl: string | undefined, strictMode: boolean): void {
  if (!baseUrl) return; // Default API URL is fine

  const url = new URL(baseUrl);
  const hostname = url.hostname.toLowerCase();

  // Only allow localhost in development mode OR when strict mode is disabled
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && strictMode) {
      throw createValidationError(
        'baseUrl',
        'SSRF protection: localhost/127.0.0.1 not allowed in production. Set AGENT_MEMORY_EXTRACTION_STRICT_ALLOWLIST=false to override.'
      );
    }
    // Log at debug level - user already knows they're using localhost if they set the env var
    logger.debug({ baseUrl }, 'Using local OpenAI-compatible endpoint');
    return;
  }

  // Check against allowlist
  if (!ALLOWED_OPENAI_HOSTS.includes(hostname)) {
    if (strictMode) {
      throw createValidationError(
        'baseUrl',
        `not in allowlist: ${hostname}. Allowed: ${ALLOWED_OPENAI_HOSTS.join(', ')}`
      );
    }

    logger.warn(
      { hostname },
      'OpenAI base URL not in allowlist. Set AGENT_MEMORY_EXTRACTION_STRICT_ALLOWLIST=true to enforce blocking.'
    );
  }
}
