/**
 * Admin-key verification for privileged operations.
 *
 * This project supports running as a local MCP server, where caller identity is
 * not cryptographically authenticated. For high-impact operations (permissions,
 * DB reset, backups, exports), require an explicit admin key.
 *
 * NEW: Uses unified AGENT_MEMORY_API_KEY as the admin key.
 * Falls back to AGENT_MEMORY_ADMIN_KEY for backward compatibility.
 */

import { timingSafeEqual, createHash } from 'node:crypto';
import { getUnifiedApiKey, isDevMode } from '../config/auth.js';

export class AdminAuthError extends Error {
  override name = 'AdminAuthError';
}

/**
 * Timing-safe string comparison that prevents length oracle attacks.
 * Uses SHA-256 hashing to normalize lengths before comparison.
 */
function safeEqual(a: string, b: string): boolean {
  const aVal = a ?? '';
  const bVal = b ?? '';

  // Hash both values to normalize to equal length (32 bytes)
  const aHash = createHash('sha256').update(aVal).digest();
  const bHash = createHash('sha256').update(bVal).digest();

  // Perform timing-safe comparison
  const isMatch = timingSafeEqual(aHash, bHash);

  // Reject empty credentials (after timing-safe work)
  const bothNonEmpty = aVal.length > 0 && bVal.length > 0;

  return isMatch && bothNonEmpty;
}

/**
 * Get the configured admin key.
 *
 * Uses unified API key (AGENT_MEMORY_API_KEY) as the admin key.
 * Falls back to legacy AGENT_MEMORY_ADMIN_KEY for backward compatibility.
 *
 * @deprecated Use getUnifiedApiKey() from config/auth.ts instead
 */
export function getConfiguredAdminKey(): string | null {
  // Use the unified API key system
  return getUnifiedApiKey();
}

/**
 * Require admin key for privileged operations.
 *
 * In dev mode (AGENT_MEMORY_DEV_MODE=true), admin key validation is skipped.
 * This allows local development without setting up keys.
 *
 * @param params - Object containing admin_key or adminKey property
 * @throws AdminAuthError if key is missing or invalid (in production mode)
 */
export function requireAdminKey(params: object): void {
  // In dev mode, skip admin key validation
  if (isDevMode()) {
    return;
  }

  const configured = getUnifiedApiKey();
  if (!configured) {
    throw new AdminAuthError(
      'API key not configured. Set AGENT_MEMORY_API_KEY or enable dev mode with AGENT_MEMORY_DEV_MODE=true.'
    );
  }

  const p = params as Record<string, unknown>;
  const provided =
    typeof p.admin_key === 'string'
      ? p.admin_key
      : typeof p.adminKey === 'string'
        ? p.adminKey
        : typeof p.api_key === 'string'
          ? p.api_key
          : typeof p.apiKey === 'string'
            ? p.apiKey
            : null;

  if (!provided || !safeEqual(provided, configured)) {
    throw new AdminAuthError('Unauthorized: invalid API key');
  }
}

/**
 * Check if admin key is configured (for validation purposes).
 */
export function isAdminKeyConfigured(): boolean {
  return getUnifiedApiKey() !== null;
}
