/**
 * Structured logging utility using pino
 *
 * Provides consistent logging across the application with:
 * - Environment-based log levels
 * - Structured JSON logging for production
 * - Pretty printing for development
 * - Component-based context
 */

import pino from 'pino';
import { appendFileSync } from 'fs';
import { join } from 'path';

// Determine log level from environment variable (default: info)
// Ensure it's always a valid string, never undefined
function getLogLevel(): pino.Level {
  const envLevel = process.env.LOG_LEVEL;
  if (
    envLevel &&
    typeof envLevel === 'string' &&
    ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].includes(envLevel)
  ) {
    return envLevel as pino.Level;
  }
  return 'info';
}

const logLevel = getLogLevel();

// Check if running as MCP server (stdio mode)
// MCP servers use stdin/stdout for protocol, so we must not output anything to stdout
// Detection: stdin is not a TTY (piped/stdio mode) OR running index.js/ts
const isMcpServer =
  process.stdin.isTTY === false ||
  process.argv[1]?.endsWith('index.js') ||
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.includes('/dist/index.js');

// #region agent log
try {
  const logEntry =
    JSON.stringify({
      location: 'logger.ts:32',
      message: 'Logger initialization',
      data: {
        isMcpServer: isMcpServer,
        argv1: process.argv[1],
        stdinIsTTY: process.stdin.isTTY,
        nodeEnv: process.env.NODE_ENV,
      },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
      hypothesisId: 'A',
    }) + '\n';
  // Use IDE-agnostic debug log path (project root, not IDE-specific)
  const debugLogPath = join(process.cwd(), '.ide-debug.log');
  appendFileSync(debugLogPath, logEntry);
} catch {
  // Ignore debug log errors
}
// #endregion

// Create logger instance
// CRITICAL: When running as MCP server, ALL logs must go to stderr, never stdout
// This prevents pino JSON logs from corrupting the MCP protocol JSON-RPC stream
export const logger = isMcpServer
  ? pino(
      { level: logLevel },
      pino.destination({ dest: 2, sync: false }) // File descriptor 2 = stderr, async for performance
    )
  : pino({
      level: logLevel,
      ...(process.env.NODE_ENV !== 'production' && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }),
    });

/**
 * Create a child logger with component context
 *
 * @param component - Component name (e.g., 'embedding', 'query', 'audit')
 * @returns Child logger with component context
 */
export function createComponentLogger(component: string): pino.Logger {
  return logger.child({ component });
}

