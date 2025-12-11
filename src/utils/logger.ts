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

// Determine log level from environment variable (default: info)
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'info');

// Create logger instance
export const logger = pino({
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


