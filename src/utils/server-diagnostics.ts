/**
 * Server Diagnostics Utility
 *
 * Provides diagnostic information about the MCP server process,
 * including stale code detection to help developers identify when
 * the server needs to be restarted after rebuilding.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StaleCodeInfo {
  /** Whether the running code is stale (dist was modified after process start) */
  isStale: boolean;
  /** When the current process started */
  processStartedAt?: Date;
  /** When the dist/cli.js file was last modified */
  distModifiedAt?: Date;
  /** Human-readable message explaining the stale code situation */
  message?: string;
  /** Error message if detection failed */
  error?: string;
}

export interface ServerDiagnostics {
  /** Process ID */
  processId: number;
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Human-readable uptime string */
  uptimeFormatted: string;
  /** Memory usage in MB */
  memoryUsageMB: number;
  /** Stale code detection result */
  staleCode: StaleCodeInfo;
  /** When diagnostics were collected */
  timestamp: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format duration in seconds to human-readable string
 */
function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0 || (hours === 0 && minutes === 0)) {
    parts.push(`${secs}s`);
  }

  return parts.join(' ');
}

/**
 * Format time difference to human-readable string
 */
function formatTimeDifference(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} min ago`
      : `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  if (minutes > 0) {
    return `${minutes} min ago`;
  }
  return `${seconds} seconds ago`;
}

/**
 * Get the default dist entry point path
 */
function getDefaultDistPath(): string {
  // Try to determine the dist path relative to this file
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const projectRoot = path.resolve(path.dirname(thisFile), '..', '..');
    return path.join(projectRoot, 'dist', 'cli.js');
  } catch {
    // Fallback to cwd-based path
    return path.join(process.cwd(), 'dist', 'cli.js');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the running code is stale (dist was modified after process start)
 *
 * This helps detect when a developer has rebuilt the project but the MCP server
 * is still running the old compiled code and needs to be restarted.
 *
 * @param distPath - Path to the dist entry file to check (defaults to dist/cli.js)
 * @returns StaleCodeInfo with detection results
 */
export async function checkStaleCode(distPath?: string): Promise<StaleCodeInfo> {
  try {
    const targetPath = distPath ?? getDefaultDistPath();

    // Calculate when the process started
    const uptimeMs = process.uptime() * 1000;
    const processStartedAt = new Date(Date.now() - uptimeMs);

    // Get the modification time of the dist file
    const stats = await fs.stat(targetPath);
    const distModifiedAt = stats.mtime;

    // If dist was modified AFTER the process started, code is stale
    // Use a small buffer (1 second) to handle timing edge cases
    const isStale = distModifiedAt.getTime() > processStartedAt.getTime() + 1000;

    if (isStale) {
      const timeSinceModification = Date.now() - distModifiedAt.getTime();
      return {
        isStale: true,
        processStartedAt,
        distModifiedAt,
        message:
          `Running stale code! dist/ was rebuilt ${formatTimeDifference(timeSinceModification)} ` +
          `but the server was started at ${processStartedAt.toLocaleTimeString()}. ` +
          `Restart Claude Code to pick up new changes.`,
      };
    }

    return {
      isStale: false,
      processStartedAt,
      distModifiedAt,
    };
  } catch (error) {
    return {
      isStale: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get comprehensive server diagnostics
 *
 * Includes process info, memory usage, and stale code detection.
 *
 * @param distPath - Optional custom dist path for stale code detection
 * @returns ServerDiagnostics object
 */
export async function getServerDiagnostics(distPath?: string): Promise<ServerDiagnostics> {
  const uptimeSeconds = process.uptime();
  const memoryUsage = process.memoryUsage();
  const staleCode = await checkStaleCode(distPath);

  return {
    processId: process.pid,
    uptimeSeconds: Math.round(uptimeSeconds),
    uptimeFormatted: formatUptime(uptimeSeconds),
    memoryUsageMB: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
    staleCode,
    timestamp: new Date(),
  };
}
