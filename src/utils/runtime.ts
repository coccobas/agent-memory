/**
 * Runtime detection utilities
 * Cross-platform compatible detection for MCP server mode
 */

import { normalize, sep } from 'node:path';

/**
 * Normalize a path for cross-platform comparison
 */
function normalizePath(path: string | undefined): string {
  if (!path) return '';
  return normalize(path).toLowerCase();
}

/**
 * Check if running as MCP server (stdio mode)
 */
export function isMcpServerMode(): boolean {
  // stdin not a TTY means piped/stdio mode
  // Note: isTTY is undefined (not false) when stdin is piped
  if (!process.stdin.isTTY) {
    return true;
  }

  const scriptPath = normalizePath(process.argv[1]);

  // Check for common entry points
  if (
    scriptPath.endsWith('index.js') ||
    scriptPath.endsWith('index.ts') ||
    scriptPath.endsWith('cli.js') ||
    scriptPath.endsWith('cli.ts')
  ) {
    return true;
  }

  // Check for dist directory pattern (cross-platform)
  const distPattern = `${sep}dist${sep}`.toLowerCase();
  if (
    scriptPath.includes(distPattern) &&
    (scriptPath.endsWith('index.js') || scriptPath.endsWith('cli.js'))
  ) {
    return true;
  }

  return false;
}

/**
 * Check if this is the main module being executed
 */
export function isMainModule(): boolean {
  const scriptPath = normalizePath(process.argv[1]);

  return (
    scriptPath.endsWith('index.js') ||
    scriptPath.endsWith('index.ts') ||
    scriptPath.endsWith('cli.js') ||
    scriptPath.endsWith('cli.ts') ||
    scriptPath.includes('agent-memory')
  );
}

/**
 * Get platform-specific path separator info
 */
export function getPlatformInfo(): { sep: string; isWindows: boolean; isMac: boolean } {
  return {
    sep,
    isWindows: process.platform === 'win32',
    isMac: process.platform === 'darwin',
  };
}
