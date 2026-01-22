/**
 * MCP Notification Service
 *
 * Provides a way to send MCP logging notifications from tool handlers.
 * The server instance is set on startup and can be used to send
 * notifications that appear in Claude Code's UI.
 *
 * Notification levels (from MCP spec):
 * - debug: Detailed debugging information
 * - info: General informational messages
 * - notice: Normal but significant events
 * - warning: Warning conditions
 * - error: Error conditions
 * - critical: Critical conditions
 * - alert: Action must be taken immediately
 * - emergency: System is unusable
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('notification-service');

// MCP logging levels
export type LoggingLevel =
  | 'debug'
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical'
  | 'alert'
  | 'emergency';

// Singleton server reference
let serverInstance: Server | null = null;

/**
 * Set the MCP server instance for sending notifications
 * Called once during server startup
 */
export function setNotificationServer(server: Server): void {
  serverInstance = server;
  logger.debug('Notification server configured');
}

/**
 * Clear the server reference (for testing/shutdown)
 */
export function clearNotificationServer(): void {
  serverInstance = null;
}

/**
 * Send a logging notification to the MCP client
 *
 * @param level - Severity level
 * @param message - The message to display
 * @param loggerName - Optional logger name for categorization
 */
export async function sendNotification(
  level: LoggingLevel,
  message: string,
  loggerName?: string
): Promise<void> {
  if (!serverInstance) {
    logger.debug({ level, message }, 'Notification skipped (no server)');
    return;
  }

  try {
    await serverInstance.sendLoggingMessage({
      level,
      data: message,
      logger: loggerName ?? 'agent-memory',
    });
    logger.debug({ level, loggerName }, 'Notification sent');
  } catch (error) {
    // Don't fail the operation if notification fails
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to send notification'
    );
  }
}

/**
 * Convenience methods for common notification levels
 */
export const notify = {
  /**
   * Send an info-level notification (general information)
   */
  info: (message: string, loggerName?: string) => sendNotification('info', message, loggerName),

  /**
   * Send a notice-level notification (significant events)
   */
  notice: (message: string, loggerName?: string) => sendNotification('notice', message, loggerName),

  /**
   * Send a warning-level notification
   */
  warning: (message: string, loggerName?: string) =>
    sendNotification('warning', message, loggerName),

  /**
   * Send an error-level notification
   */
  error: (message: string, loggerName?: string) => sendNotification('error', message, loggerName),

  /**
   * Send a debug-level notification
   */
  debug: (message: string, loggerName?: string) => sendNotification('debug', message, loggerName),
};
