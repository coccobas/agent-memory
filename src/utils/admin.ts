/**
 * Admin-key verification for privileged operations.
 *
 * This project supports running as a local MCP server, where caller identity is
 * not cryptographically authenticated. For high-impact operations (permissions,
 * DB reset, backups, exports), require an explicit admin key.
 */

import { timingSafeEqual, createHash } from 'node:crypto';

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

export function getConfiguredAdminKey(): string | null {
  const key = process.env.AGENT_MEMORY_ADMIN_KEY;
  return key && key.length > 0 ? key : null;
}

export function requireAdminKey(params: object): void {
  const configured = getConfiguredAdminKey();
  if (!configured) {
    throw new AdminAuthError('Admin key not configured. Set AGENT_MEMORY_ADMIN_KEY.');
  }

  const p = params as Record<string, unknown>;
  const provided =
    typeof p.admin_key === 'string'
      ? p.admin_key
      : typeof p.adminKey === 'string'
        ? p.adminKey
        : null;

  if (!provided || !safeEqual(provided, configured)) {
    throw new AdminAuthError('Unauthorized: invalid admin key');
  }
}
