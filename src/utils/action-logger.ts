/**
 * Simple Action Logger
 *
 * Logs MCP tool calls to a file for diagnostics.
 * Helps monitor server health over extended operation.
 *
 * Log format (tab-separated for easy parsing):
 * timestamp \t tool \t action \t status \t duration \t project \t session \t details
 */

import { appendFileSync, mkdirSync, existsSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config/index.js';

const LOG_FILE = 'mcp-actions.log';
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB before rotation

let logPath: string | null = null;

/**
 * Get the log file path, creating the directory if needed
 */
function getLogPath(): string {
  if (logPath) return logPath;

  const dataDir = config.paths.dataDir;
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  logPath = join(dataDir, LOG_FILE);
  return logPath;
}

/**
 * Rotate log file if it exceeds max size
 */
function maybeRotate(path: string): void {
  try {
    if (existsSync(path)) {
      const stats = statSync(path);
      if (stats.size > MAX_LOG_SIZE) {
        const rotatedPath = path.replace('.log', `.${Date.now()}.log`);
        renameSync(path, rotatedPath);
      }
    }
  } catch {
    // Ignore rotation errors
  }
}

export interface ActionLogEntry {
  tool: string;
  action?: string;
  status: 'ok' | 'error';
  durationMs: number;
  projectId?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Log an MCP action to the log file
 */
export function logAction(entry: ActionLogEntry): void {
  try {
    const path = getLogPath();
    maybeRotate(path);

    const timestamp = new Date().toISOString();
    const details = entry.error ? `error:${entry.error.slice(0, 100)}` : '';

    // Tab-separated format for easy parsing
    const line =
      [
        timestamp,
        entry.tool,
        entry.action ?? '-',
        entry.status,
        `${entry.durationMs}ms`,
        entry.projectId ?? '-',
        entry.sessionId ?? '-',
        details,
      ].join('\t') + '\n';

    appendFileSync(path, line);
  } catch {
    // Silently ignore logging errors - don't break the tool
  }
}

/**
 * Log server startup
 */
export function logStartup(): void {
  try {
    const path = getLogPath();
    maybeRotate(path);

    const line = `${new Date().toISOString()}\t===== SERVER STARTED =====\tpid:${process.pid}\tnode:${process.version}\n`;
    appendFileSync(path, line);
  } catch {
    // Ignore
  }
}

/**
 * Log server shutdown
 */
export function logShutdown(reason: string): void {
  try {
    const path = getLogPath();
    const line = `${new Date().toISOString()}\t===== SERVER STOPPED =====\treason:${reason}\n`;
    appendFileSync(path, line);
  } catch {
    // Ignore
  }
}
