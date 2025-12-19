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
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMcpServerMode } from './runtime.js';
import { sanitizeForLogging } from './sanitize.js';
import { config } from '../config/index.js';

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
if (DEBUG_ENABLED && !isTest) {
  try {
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
    appendFileSync(debugLogPath, logEntry);
  } catch {
    // Ignore debug log errors - directory may not exist yet
  }
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
  // Redact sensitive field paths
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
      '*.apiKey',
      '*.api_key',
      '*.token',
      '*.secret',
      '*.password',
      'req.headers.authorization',
      'req.headers.Authorization',
    ],
    censor: '***REDACTED***',
  },
  // Custom serializers for complex objects
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
