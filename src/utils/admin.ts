/**
 * Admin-key verification for privileged operations.
 *
 * This project supports running as a local MCP server, where caller identity is
 * not cryptographically authenticated. For high-impact operations (permissions,
 * DB reset, backups, exports), require an explicit admin key.
 */

import { timingSafeEqual } from 'node:crypto';

export class AdminAuthError extends Error {
  override name = 'AdminAuthError';
}

function safeEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length buffers
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
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
