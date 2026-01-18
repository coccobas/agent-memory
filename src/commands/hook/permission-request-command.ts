/**
 * Permission Request Hook Command
 *
 * Handles the PermissionRequest Claude Code hook event.
 * Called when a tool requests permission from the user.
 *
 * Responsibilities:
 * 1. Log permission requests for analytics
 * 2. Check memory for auto-approve guidelines
 * 3. Learn from user permission patterns
 * 4. Record analytics metrics
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { getHookAnalyticsService } from '../../services/analytics/index.js';
import { getDb } from '../../db/connection.js';
import { guidelines, guidelineVersions } from '../../db/schema.js';
import { like, and, eq, isNull, or } from 'drizzle-orm';

const logger = createComponentLogger('permission-request');

/**
 * Configuration for PermissionRequest hook
 */
export interface PermissionRequestConfig {
  /** Enable logging permission requests (default: true) */
  logEnabled: boolean;
  /** Enable recording analytics metrics (default: true) */
  recordAnalytics: boolean;
  /** Enable auto-approve based on memory (default: true) */
  autoApproveEnabled: boolean;
  /** Enable learning from permission patterns (default: true) */
  enableLearning: boolean;
}

/**
 * Get configuration from environment variables
 */
function getConfig(overrides?: Partial<PermissionRequestConfig>): PermissionRequestConfig {
  const envLogEnabled = process.env.AGENT_MEMORY_PERMISSION_LOG_ENABLED;
  const envRecordAnalytics = process.env.AGENT_MEMORY_PERMISSION_RECORD_ANALYTICS;
  const envAutoApprove = process.env.AGENT_MEMORY_PERMISSION_AUTO_APPROVE;
  const envEnableLearning = process.env.AGENT_MEMORY_PERMISSION_ENABLE_LEARNING;

  return {
    logEnabled: overrides?.logEnabled ?? (envLogEnabled !== 'false' && envLogEnabled !== '0'),
    recordAnalytics:
      overrides?.recordAnalytics ?? (envRecordAnalytics !== 'false' && envRecordAnalytics !== '0'),
    autoApproveEnabled:
      overrides?.autoApproveEnabled ?? (envAutoApprove !== 'false' && envAutoApprove !== '0'),
    enableLearning:
      overrides?.enableLearning ?? (envEnableLearning !== 'false' && envEnableLearning !== '0'),
  };
}

/**
 * Check memory for auto-approve guidelines
 *
 * Searches for guidelines that indicate the user has previously
 * approved similar permission requests.
 */
async function checkAutoApproveGuidelines(
  projectId: string | undefined,
  toolName: string | undefined,
  permissionType: string | undefined
): Promise<{ shouldApprove: boolean; guideline?: string; guidelineId?: string }> {
  if (!toolName) {
    return { shouldApprove: false };
  }

  try {
    const db = getDb();

    // Build search patterns for auto-approve guidelines
    // Look for guidelines that mention "allow", "approve", or "auto" with the tool name
    const searchPatterns = [
      `%allow%${toolName}%`,
      `%approve%${toolName}%`,
      `%auto%${toolName}%`,
      `%always allow%${toolName}%`,
      `%${toolName}%without permission%`,
    ];

    // Include permission type in search if available
    if (permissionType) {
      searchPatterns.push(
        `%allow%${permissionType}%`,
        `%approve%${permissionType}%`
      );
    }

    // Build conditions for each pattern on guidelineVersions.content
    const patternConditions = searchPatterns.map((pattern) =>
      like(guidelineVersions.content, pattern)
    );

    // Query guidelines matching any pattern by joining with versions
    const matchingGuidelines = await db
      .select({
        id: guidelines.id,
        content: guidelineVersions.content,
      })
      .from(guidelines)
      .innerJoin(
        guidelineVersions,
        eq(guidelines.currentVersionId, guidelineVersions.id)
      )
      .where(
        and(
          or(...patternConditions),
          eq(guidelines.isActive, true),
          // Scope filter: global or project-specific
          projectId
            ? or(
                eq(guidelines.scopeType, 'global'),
                and(eq(guidelines.scopeType, 'project'), eq(guidelines.scopeId, projectId))
              )
            : or(eq(guidelines.scopeType, 'global'), isNull(guidelines.scopeType))
        )
      )
      .limit(1);

    if (matchingGuidelines.length > 0) {
      const guideline = matchingGuidelines[0];
      return {
        shouldApprove: true,
        guideline: guideline?.content ?? undefined,
        guidelineId: guideline?.id ?? undefined,
      };
    }

    return { shouldApprove: false };
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error), toolName },
      'Failed to check auto-approve guidelines (non-fatal)'
    );
    return { shouldApprove: false };
  }
}

/**
 * Categorize the permission request
 */
function categorizePermission(
  toolName: string | undefined,
  permissionType: string | undefined
): string {
  const tool = (toolName ?? '').toLowerCase();
  const type = (permissionType ?? '').toLowerCase();

  // Known permission categories
  if (tool === 'bash' || tool.includes('shell') || tool.includes('exec')) {
    if (type.includes('write') || type.includes('delete')) {
      return 'shell_destructive';
    }
    return 'shell';
  }

  if (tool === 'write' || tool === 'edit') {
    return 'file_write';
  }

  if (tool === 'read' || tool === 'glob' || tool === 'grep') {
    return 'file_read';
  }

  if (tool.includes('web') || tool.includes('http') || tool.includes('fetch')) {
    return 'network';
  }

  if (tool.includes('git')) {
    return 'git';
  }

  if (type) {
    return type;
  }

  return 'other';
}

/**
 * Run the PermissionRequest hook command
 */
export async function runPermissionRequestCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
  config?: Partial<PermissionRequestConfig>;
}): Promise<HookCommandResult> {
  const { projectId, agentId: _agentId, input, config: configOverrides } = params;
  const config = getConfig(configOverrides);

  const sessionId = input.session_id || null;
  const toolName = input.tool_name;
  const permissionType = input.permission_type;

  logger.debug(
    {
      sessionId,
      projectId,
      toolName,
      permissionType,
    },
    'PermissionRequest hook invoked'
  );

  // Collect output
  const stdout: string[] = [];
  const stderr: string[] = [];

  // Categorize the permission
  const category = categorizePermission(toolName, permissionType);

  // Step 1: Log permission request
  if (config.logEnabled) {
    logger.debug(
      {
        sessionId,
        toolName,
        permissionType,
        category,
      },
      'Permission request received'
    );
  }

  // Step 2: Record analytics metric (using notification channel for permission requests)
  if (config.recordAnalytics) {
    try {
      const analyticsService = getHookAnalyticsService();
      // Use notification metric type for permission requests
      await analyticsService.recordNotification({
        sessionId: sessionId ?? undefined,
        projectId,
        type: 'permission_request',
        message: `${toolName ?? 'unknown'}:${permissionType ?? 'unknown'}`,
        severity: 'info',
        category,
      });

      logger.debug(
        {
          sessionId,
          toolName,
          category,
        },
        'Permission request metric recorded'
      );
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        'Failed to record permission request metric (non-blocking)'
      );
    }
  }

  // Step 3: Check memory for auto-approve guidelines
  if (config.autoApproveEnabled) {
    try {
      const autoApproveResult = await checkAutoApproveGuidelines(
        projectId,
        toolName,
        permissionType
      );

      if (autoApproveResult.shouldApprove) {
        logger.info(
          {
            sessionId,
            toolName,
            permissionType,
            guidelineId: autoApproveResult.guidelineId,
          },
          'Permission auto-approved based on memory guideline'
        );

        // Return approval - Claude Code expects 'approved' on stdout for blocking hooks
        stdout.push('approved');
        return { exitCode: 0, stdout, stderr };
      }
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        'Failed to check auto-approve guidelines (non-blocking)'
      );
    }
  }

  // Step 4: Learning from permission requests
  // Note: Learning from denials happens when we observe the user's response
  // in subsequent hooks (UserPromptSubmit or notification)
  if (config.enableLearning) {
    // Future: Track permission request patterns for learning
    logger.debug(
      {
        sessionId,
        toolName,
        category,
      },
      'Permission request tracked for learning'
    );
  }

  // Let user decide - return empty response (no auto-approve)
  return { exitCode: 0, stdout, stderr };
}
