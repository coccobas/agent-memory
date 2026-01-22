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
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isMcpServerMode } from './runtime.js';
import { sanitizeForLogging } from './sanitize.js';
import { config } from '../config/index.js';
import { correlationLoggerMixin } from './correlation.js';

// Configuration from centralized config
const DEBUG_ENABLED = config.logging.debug;

// Detect test environment and suppress logs to keep test output clean
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined;
const logLevel = config.logging.level;
const loggingEnabled = !isTest;

// Check if running as MCP server (stdio mode)
// MCP servers use stdin/stdout for protocol, so we must not output anything to stdout
const isMcpServer = isMcpServerMode();

// Conditional debug logging to log directory (only if AGENT_MEMORY_DEBUG=1)
// Uses async file I/O to avoid blocking the event loop at startup
if (DEBUG_ENABLED && !isTest) {
  // Use configured log path, fallback to tmpdir
  const logDir = config.paths.log;
  const debugLogPath = join(logDir, 'agent-memory-debug.log');
  const logEntry =
    JSON.stringify({
      timestamp: Date.now(),
      isMcpServer,
      argv1: process.argv[1],
      platform: process.platform,
    }) + '\n';
  // Bug #198 fix: Ensure log directory exists before writing
  // Fire-and-forget async write - don't block startup
  mkdir(logDir, { recursive: true })
    .then(() => appendFile(debugLogPath, logEntry))
    .catch((err) => {
      // Log to stderr as last resort since our logger isn't set up yet
      process.stderr.write(
        `[agent-memory] Debug log failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
    });
}

/**
 * Pino serializer that sanitizes sensitive data
 */
const sanitizingSerializer = (obj: unknown) => sanitizeForLogging(obj);

/**
 * Common pino options with security redaction
 */
const pinoOptions: pino.LoggerOptions = {
  level: logLevel,
  enabled: loggingEnabled,
  mixin: correlationLoggerMixin,
  redact: {
    paths: [
      'apiKey',
      'api_key',
      'OPENAI_API_KEY',
      'openaiApiKey',
      'token',
      'access_token',
      'accessToken',
      'secret',
      'password',
      'authorization',
      'Authorization',
      'admin_key',
      'adminKey',
      '*.apiKey',
      '*.api_key',
      '*.token',
      '*.secret',
      '*.password',
      '*.admin_key',
      '*.adminKey',
      'req.headers.authorization',
      'req.headers.Authorization',
    ],
    censor: '***REDACTED***',
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: sanitizingSerializer,
  },
};

// Create logger instance
// CRITICAL: When running as MCP server, ALL logs must go to stderr, never stdout
// This prevents pino JSON logs from corrupting the MCP protocol JSON-RPC stream
export const logger = isMcpServer
  ? pino(pinoOptions, pino.destination({ dest: 2, sync: false })) // File descriptor 2 = stderr, async for performance
  : pino({
      ...pinoOptions,
      ...(config.runtime.nodeEnv !== 'production' && {
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
