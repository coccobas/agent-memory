/**
 * PostToolUse Hook Command
 *
 * Handles the PostToolUse Claude Code hook event.
 * Called after a tool completes execution with its result.
 *
 * Responsibilities:
 * 1. Update tool events in BehaviorObserverService with results (success, duration)
 * 2. Record tool execution metrics for analytics
 * 3. Detect immediate error patterns
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { getBehaviorObserverService } from '../../services/capture/behavior-observer.js';
import { getHookAnalyticsService } from '../../services/analytics/index.js';
import { getHookLearningService } from '../../services/learning/index.js';

const logger = createComponentLogger('posttooluse');

/**
 * Configuration for PostToolUse hook
 */
export interface PostToolUseConfig {
  /** Enable updating behavior observer events (default: true) */
  updateBehaviorEvents: boolean;
  /** Enable recording analytics metrics (default: true) */
  recordAnalytics: boolean;
  /** Enable error pattern detection (default: true) */
  detectErrorPatterns: boolean;
  /** Enable learning from tool failures (default: true) */
  enableLearning: boolean;
  /** Enable knowledge extraction from successful tool outputs (default: true) */
  enableKnowledgeExtraction: boolean;
}

/**
 * Get configuration from environment variables
 */
function getConfig(overrides?: Partial<PostToolUseConfig>): PostToolUseConfig {
  const envUpdateEvents = process.env.AGENT_MEMORY_POSTTOOLUSE_UPDATE_EVENTS;
  const envRecordAnalytics = process.env.AGENT_MEMORY_POSTTOOLUSE_RECORD_ANALYTICS;
  const envDetectErrors = process.env.AGENT_MEMORY_POSTTOOLUSE_DETECT_ERRORS;
  const envEnableLearning = process.env.AGENT_MEMORY_POSTTOOLUSE_ENABLE_LEARNING;
  const envEnableKnowledge = process.env.AGENT_MEMORY_POSTTOOLUSE_ENABLE_KNOWLEDGE;

  return {
    updateBehaviorEvents:
      overrides?.updateBehaviorEvents ?? (envUpdateEvents !== 'false' && envUpdateEvents !== '0'),
    recordAnalytics:
      overrides?.recordAnalytics ?? (envRecordAnalytics !== 'false' && envRecordAnalytics !== '0'),
    detectErrorPatterns:
      overrides?.detectErrorPatterns ?? (envDetectErrors !== 'false' && envDetectErrors !== '0'),
    enableLearning:
      overrides?.enableLearning ?? (envEnableLearning !== 'false' && envEnableLearning !== '0'),
    enableKnowledgeExtraction:
      overrides?.enableKnowledgeExtraction ?? (envEnableKnowledge !== 'false' && envEnableKnowledge !== '0'),
  };
}

/**
 * Parse tool response to determine success/failure
 */
function parseToolResult(
  _toolName: string | undefined,
  toolResponse: unknown
): {
  success: boolean;
  errorType?: string;
  outputSummary?: string;
} {
  // Handle null/undefined response
  if (toolResponse === null || toolResponse === undefined) {
    return { success: true, outputSummary: '' };
  }

  // Convert to string for analysis
  const responseStr =
    typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);

  // Common error patterns
  const errorPatterns = [
    { pattern: /error:/i, type: 'error' },
    { pattern: /failed/i, type: 'failure' },
    { pattern: /exception/i, type: 'exception' },
    { pattern: /command not found/i, type: 'command_not_found' },
    { pattern: /permission denied/i, type: 'permission_denied' },
    { pattern: /no such file/i, type: 'file_not_found' },
    { pattern: /exit code [1-9]/i, type: 'non_zero_exit' },
    { pattern: /timed out/i, type: 'timeout' },
    { pattern: /ENOENT/i, type: 'file_not_found' },
    { pattern: /EACCES/i, type: 'permission_denied' },
    { pattern: /ETIMEDOUT/i, type: 'timeout' },
    { pattern: /ECONNREFUSED/i, type: 'connection_refused' },
  ];

  for (const { pattern, type } of errorPatterns) {
    if (pattern.test(responseStr)) {
      return {
        success: false,
        errorType: type,
        outputSummary: responseStr.slice(0, 500),
      };
    }
  }

  // Check for explicit error objects
  if (typeof toolResponse === 'object' && toolResponse !== null) {
    const resp = toolResponse as Record<string, unknown>;
    if ('error' in resp || 'success' in resp) {
      const hasError = 'error' in resp && resp.error;
      const explicitSuccess = 'success' in resp ? Boolean(resp.success) : !hasError;

      if (!explicitSuccess) {
        return {
          success: false,
          errorType: typeof resp.error === 'string' ? resp.error : 'unknown_error',
          outputSummary: responseStr.slice(0, 500),
        };
      }
    }
  }

  return {
    success: true,
    outputSummary: responseStr.slice(0, 200),
  };
}

/**
 * Extract file type from tool input for Read/Edit/Write operations
 */
function extractFileType(_toolName: string | undefined, toolInput: unknown): string | undefined {
  if (!toolInput || typeof toolInput !== 'object') return undefined;

  const input = toolInput as Record<string, unknown>;
  const filePath = (input.file_path ?? input.path ?? '') as string;

  if (!filePath) return undefined;

  // Extract extension
  const match = filePath.match(/\.([^./]+)$/);
  return match ? match[1]!.toLowerCase() : undefined;
}

/**
 * Categorize bash commands for analytics
 */
function categorizeCommand(toolName: string | undefined, toolInput: unknown): string | undefined {
  if (toolName?.toLowerCase() !== 'bash') return undefined;

  if (!toolInput || typeof toolInput !== 'object') return undefined;

  const input = toolInput as Record<string, unknown>;
  const command = ((input.command ?? '') as string).toLowerCase();

  // Command categories
  const categories: Array<{ patterns: RegExp[]; category: string }> = [
    { patterns: [/^git\s/], category: 'git' },
    { patterns: [/^npm\s/, /^yarn\s/, /^pnpm\s/], category: 'package_manager' },
    { patterns: [/^docker\s/, /^docker-compose\s/], category: 'docker' },
    { patterns: [/^kubectl\s/, /^helm\s/], category: 'kubernetes' },
    { patterns: [/^npm test/, /^jest/, /^vitest/, /^pytest/, /^go test/], category: 'test' },
    { patterns: [/^npm run build/, /^tsc/, /^make/, /^cargo build/], category: 'build' },
    { patterns: [/^npm start/, /^npm run dev/, /^node\s/], category: 'run' },
    { patterns: [/^curl\s/, /^wget\s/, /^http\s/], category: 'network' },
    { patterns: [/^ls\s/, /^cat\s/, /^find\s/, /^grep\s/], category: 'file_system' },
  ];

  for (const { patterns, category } of categories) {
    if (patterns.some((p) => p.test(command))) {
      return category;
    }
  }

  return 'other';
}

/**
 * Calculate approximate size of input/output
 */
function calculateSize(data: unknown): number | undefined {
  if (data === null || data === undefined) return 0;
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return str.length;
}

/**
 * Run the PostToolUse hook command
 */
export async function runPostToolUseCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
  config?: Partial<PostToolUseConfig>;
}): Promise<HookCommandResult> {
  const { projectId, agentId: _agentId, input, config: configOverrides } = params;
  const config = getConfig(configOverrides);

  const sessionId = input.session_id || null;
  const toolName = input.tool_name;
  const toolInput = input.tool_input;
  const toolResponse = input.tool_response;

  logger.debug(
    {
      sessionId,
      projectId,
      toolName,
      hasResponse: toolResponse !== undefined,
    },
    'PostToolUse hook invoked'
  );

  // Collect output
  const stdout: string[] = [];
  const stderr: string[] = [];

  // Parse tool result
  const { success, errorType, outputSummary } = parseToolResult(toolName, toolResponse);

  // Step 1: Update behavior observer event with result
  if (config.updateBehaviorEvents && sessionId) {
    try {
      const behaviorObserver = getBehaviorObserverService();
      behaviorObserver.updateLatestEventResult(sessionId, {
        success,
        outputSummary,
      });

      logger.debug(
        { sessionId, toolName, success },
        'Behavior observer event updated with result'
      );
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        'Failed to update behavior observer event (non-blocking)'
      );
    }
  }

  // Step 2: Record analytics metric
  if (config.recordAnalytics) {
    try {
      const analyticsService = getHookAnalyticsService();
      await analyticsService.recordToolExecution({
        sessionId: sessionId ?? undefined,
        projectId,
        toolName: toolName ?? 'unknown',
        success,
        errorType,
        inputSize: calculateSize(toolInput),
        outputSize: calculateSize(toolResponse),
        fileType: extractFileType(toolName, toolInput),
        commandCategory: categorizeCommand(toolName, toolInput),
      });

      logger.debug(
        { sessionId, toolName, success },
        'Tool execution metric recorded'
      );
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        'Failed to record tool execution metric (non-blocking)'
      );
    }
  }

  // Step 3: Detect immediate error patterns
  if (config.detectErrorPatterns && !success && errorType) {
    logger.debug(
      {
        sessionId,
        toolName,
        errorType,
        outputSummary: outputSummary?.slice(0, 100),
      },
      'Tool execution failed'
    );
  }

  // Step 4: Learn from tool failures (create experiences for Librarian)
  if (config.enableLearning && !success && sessionId && toolName) {
    try {
      const learningService = getHookLearningService();
      const result = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName,
        toolInput,
        errorType,
        errorMessage: outputSummary,
        timestamp: new Date().toISOString(),
      });

      if (result.experienceCreated) {
        logger.info(
          {
            sessionId,
            toolName,
            experienceId: result.experienceId,
          },
          'Experience created from tool failure'
        );
      }
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
          toolName,
        },
        'Failed to record tool failure for learning (non-blocking)'
      );
    }
  }

  // Step 5: Extract knowledge from successful tool outputs
  if (config.enableKnowledgeExtraction && success && sessionId && toolName && toolResponse) {
    try {
      const learningService = getHookLearningService();
      const toolOutput = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);

      const result = await learningService.onToolSuccess({
        sessionId,
        projectId,
        toolName,
        toolInput,
        toolOutput,
        timestamp: new Date().toISOString(),
      });

      if (result.knowledgeCreated) {
        logger.info(
          {
            sessionId,
            toolName,
            knowledgeCount: result.knowledgeIds.length,
          },
          'Knowledge extracted from tool output'
        );
      }
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
          toolName,
        },
        'Failed to extract knowledge from tool output (non-blocking)'
      );
    }
  }

  // PostToolUse is always non-blocking (exit code 0)
  return { exitCode: 0, stdout, stderr };
}
