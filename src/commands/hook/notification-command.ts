/**
 * Notification Hook Command
 *
 * Handles the Notification Claude Code hook event.
 * Called when Claude sends a notification to the user.
 *
 * Responsibilities:
 * 1. Log notifications for session analytics
 * 2. Track notification patterns (errors, warnings)
 * 3. Optional: filter/customize notifications
 * 4. Record analytics metrics
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { getHookAnalyticsService } from '../../services/analytics/index.js';
import { getHookLearningService } from '../../services/learning/index.js';

const logger = createComponentLogger('notification');

/**
 * Configuration for Notification hook
 */
export interface NotificationConfig {
  /** Enable logging notifications (default: true) */
  logEnabled: boolean;
  /** Enable recording analytics metrics (default: true) */
  recordAnalytics: boolean;
  /** Regex pattern to filter notifications (default: undefined = no filter) */
  filterPattern?: string;
  /** Track notification patterns for insights (default: true) */
  trackPatterns: boolean;
  /** Enable learning from error notifications (default: true) */
  enableLearning: boolean;
}

/**
 * Get configuration from environment variables
 */
function getConfig(overrides?: Partial<NotificationConfig>): NotificationConfig {
  const envLogEnabled = process.env.AGENT_MEMORY_NOTIFICATION_LOG_ENABLED;
  const envRecordAnalytics = process.env.AGENT_MEMORY_NOTIFICATION_RECORD_ANALYTICS;
  const envFilterPattern = process.env.AGENT_MEMORY_NOTIFICATION_FILTER;
  const envTrackPatterns = process.env.AGENT_MEMORY_NOTIFICATION_TRACK_PATTERNS;
  const envEnableLearning = process.env.AGENT_MEMORY_NOTIFICATION_ENABLE_LEARNING;

  return {
    logEnabled: overrides?.logEnabled ?? (envLogEnabled !== 'false' && envLogEnabled !== '0'),
    recordAnalytics:
      overrides?.recordAnalytics ?? (envRecordAnalytics !== 'false' && envRecordAnalytics !== '0'),
    filterPattern: overrides?.filterPattern ?? envFilterPattern,
    trackPatterns:
      overrides?.trackPatterns ?? (envTrackPatterns !== 'false' && envTrackPatterns !== '0'),
    enableLearning:
      overrides?.enableLearning ?? (envEnableLearning !== 'false' && envEnableLearning !== '0'),
  };
}

/**
 * Determine severity level from notification type and content
 */
function determineSeverity(
  notificationType: string | undefined,
  message: string | undefined
): 'error' | 'warning' | 'info' {
  const type = (notificationType ?? '').toLowerCase();
  const msg = (message ?? '').toLowerCase();

  // Check notification type first
  if (type.includes('error') || type.includes('fail')) {
    return 'error';
  }
  if (type.includes('warn')) {
    return 'warning';
  }
  if (type.includes('info') || type.includes('success')) {
    return 'info';
  }

  // Check message content
  const errorPatterns = [/error/i, /failed/i, /exception/i, /critical/i, /fatal/i];
  const warningPatterns = [/warning/i, /warn/i, /caution/i, /deprecated/i];

  if (errorPatterns.some((p) => p.test(msg))) {
    return 'error';
  }
  if (warningPatterns.some((p) => p.test(msg))) {
    return 'warning';
  }

  return 'info';
}

/**
 * Categorize notification for analytics grouping
 */
function categorizeNotification(
  notificationType: string | undefined,
  message: string | undefined
): string {
  const type = (notificationType ?? '').toLowerCase();
  const msg = (message ?? '').toLowerCase();

  // Known notification categories
  const categories: Array<{ patterns: RegExp[]; category: string }> = [
    { patterns: [/permission/i, /access denied/i], category: 'permission' },
    { patterns: [/network/i, /connection/i, /timeout/i], category: 'network' },
    { patterns: [/file/i, /directory/i, /path/i], category: 'filesystem' },
    { patterns: [/build/i, /compile/i, /bundle/i], category: 'build' },
    { patterns: [/test/i, /spec/i, /assert/i], category: 'test' },
    { patterns: [/lint/i, /format/i, /style/i], category: 'lint' },
    { patterns: [/git/i, /commit/i, /push/i, /pull/i], category: 'git' },
    { patterns: [/install/i, /package/i, /dependency/i], category: 'package' },
    { patterns: [/type/i, /typescript/i, /schema/i], category: 'type' },
    { patterns: [/memory/i, /cpu/i, /resource/i], category: 'resource' },
    { patterns: [/task/i, /complete/i, /done/i], category: 'task' },
  ];

  const combined = `${type} ${msg}`;
  for (const { patterns, category } of categories) {
    if (patterns.some((p) => p.test(combined))) {
      return category;
    }
  }

  // Use notification type as category if available
  if (type && type !== 'notification') {
    return type;
  }

  return 'other';
}

/**
 * Check if notification matches filter pattern
 */
function matchesFilter(
  message: string | undefined,
  notificationType: string | undefined,
  filterPattern: string | undefined
): boolean {
  if (!filterPattern) {
    return true; // No filter, include all
  }

  try {
    const regex = new RegExp(filterPattern, 'i');
    const combined = `${notificationType ?? ''} ${message ?? ''}`;
    return regex.test(combined);
  } catch {
    // Invalid regex, include all
    return true;
  }
}

/**
 * Run the Notification hook command
 */
export async function runNotificationCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
  config?: Partial<NotificationConfig>;
}): Promise<HookCommandResult> {
  const { projectId, agentId: _agentId, input, config: configOverrides } = params;
  const config = getConfig(configOverrides);

  const sessionId = input.session_id || null;
  const notificationType = input.notification_type;
  const message = input.message ?? input.text;

  logger.debug(
    {
      sessionId,
      projectId,
      notificationType,
      messageLength: message?.length ?? 0,
    },
    'Notification hook invoked'
  );

  // Collect output
  const stdout: string[] = [];
  const stderr: string[] = [];

  // Check filter
  if (!matchesFilter(message, notificationType, config.filterPattern)) {
    logger.debug(
      {
        sessionId,
        notificationType,
        filterPattern: config.filterPattern,
      },
      'Notification filtered out'
    );
    return { exitCode: 0, stdout, stderr };
  }

  // Determine severity and category
  const severity = determineSeverity(notificationType, message);
  const category = categorizeNotification(notificationType, message);

  // Step 1: Log notification
  if (config.logEnabled) {
    const logFn = severity === 'error' ? logger.warn : logger.debug;
    logFn.call(
      logger,
      {
        sessionId,
        notificationType,
        severity,
        category,
        message: message?.slice(0, 200),
      },
      'Notification received'
    );
  }

  // Step 2: Record analytics metric
  if (config.recordAnalytics) {
    try {
      const analyticsService = getHookAnalyticsService();
      await analyticsService.recordNotification({
        sessionId: sessionId ?? undefined,
        projectId,
        type: notificationType ?? 'notification',
        message: message ?? '',
        severity,
        category,
      });

      logger.debug(
        {
          sessionId,
          notificationType,
          severity,
        },
        'Notification metric recorded'
      );
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        'Failed to record notification metric (non-blocking)'
      );
    }
  }

  // Step 3: Track patterns (for future insights)
  if (config.trackPatterns && severity === 'error') {
    // Future: Could track error frequency, patterns, etc.
    logger.debug(
      {
        sessionId,
        category,
        severity,
      },
      'Error notification tracked for pattern analysis'
    );
  }

  // Step 4: Learn from error notifications (create experiences for Librarian)
  if (config.enableLearning && severity === 'error' && sessionId && message) {
    try {
      const learningService = getHookLearningService();
      const result = await learningService.onErrorNotification({
        sessionId,
        projectId,
        errorType: category, // Use category as error type for pattern grouping
        message,
        timestamp: new Date().toISOString(),
      });

      if (result.patternDetected) {
        logger.info(
          {
            sessionId,
            category,
            experienceCreated: result.experienceCreated,
            experienceId: result.experienceId,
          },
          'Error pattern detected from notifications'
        );
      }
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        'Failed to process notification for learning (non-blocking)'
      );
    }
  }

  // Notification hook is always non-blocking (exit code 0)
  return { exitCode: 0, stdout, stderr };
}
