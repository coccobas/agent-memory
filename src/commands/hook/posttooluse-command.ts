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

import { createHash } from 'crypto';
import { createComponentLogger } from '../../utils/logger.js';
import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { getBehaviorObserverService } from '../../services/capture/behavior-observer.js';
import { getHookAnalyticsService } from '../../services/analytics/index.js';
import { getHookLearningService } from '../../services/learning/index.js';
import { getOutcomeAnalyzerService } from '../../services/learning/outcome-analyzer.service.js';
import { isContextRegistered, getContext } from '../../core/container.js';
import {
  classifyOutcome,
  redactSensitive,
  summarizeInput,
  summarizeOutput,
  hashInput,
} from './outcome-utils.js';

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
      overrides?.enableKnowledgeExtraction ??
      (envEnableKnowledge !== 'false' && envEnableKnowledge !== '0'),
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
 * Normalize error message for signature generation
 * Removes paths, line numbers, timestamps, and PIDs to ensure
 * same conceptual error produces same signature across sessions
 */
function normalizeErrorMessage(message: string): string {
  let normalized = message;

  // Remove absolute paths (e.g., /Users/..., /home/..., C:\Users\...)
  normalized = normalized.replace(/\/Users\/[^/\s]+/g, '<path>');
  normalized = normalized.replace(/\/home\/[^/\s]+/g, '<path>');
  normalized = normalized.replace(/C:\\Users\\[^\\]+/g, '<path>');

  // Remove line numbers (e.g., :123:45, line 123)
  normalized = normalized.replace(/:\d+:\d+/g, '');
  normalized = normalized.replace(/line\s+\d+/gi, '');

  // Remove timestamps (ISO 8601 and epoch)
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.Z\d]*/g, '<timestamp>');
  normalized = normalized.replace(/\d{10,13}/g, '<epoch>');

  // Remove process IDs (e.g., pid 12345)
  normalized = normalized.replace(/pid\s+\d+/gi, 'pid <redacted>');

  return normalized.trim();
}

/**
 * Generate error signature for deduplication
 * Hash of toolName + errorType + normalized message
 */
function generateErrorSignature(
  toolName: string | undefined,
  errorType: string | undefined,
  errorMessage: string | undefined
): string {
  const normalized = normalizeErrorMessage(errorMessage || '');
  const signatureInput = `${toolName || 'unknown'}:${errorType || 'unknown'}:${normalized}`;
  return createHash('sha256').update(signatureInput).digest('hex');
}

/**
 * Generate hash of tool input for privacy-safe storage
 */
function hashToolInput(toolInput: unknown): string {
  const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
  return createHash('sha256').update(inputStr).digest('hex');
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

      logger.debug({ sessionId, toolName, success }, 'Behavior observer event updated with result');
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

      logger.debug({ sessionId, toolName, success }, 'Tool execution metric recorded');
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

  // Step 3: Record tool outcome (success/failure/partial) to tool_outcomes table
  if (sessionId && toolName) {
    try {
      const ctx = getContext();
      const toolOutcomesRepo = ctx.repos.toolOutcomes;

      if (toolOutcomesRepo) {
        const outputSummaryStr = outputSummary || '';
        const outcomeType = classifyOutcome(success, outputSummaryStr);

        const lastOutcome = await toolOutcomesRepo.getLastOutcomeForSession(sessionId);
        const precedingToolId = lastOutcome?.id ?? null;

        let durationMs: number | null = null;
        if (lastOutcome) {
          const lastTime = new Date(lastOutcome.createdAt).getTime();
          const now = Date.now();
          if (now - lastTime < 300000) {
            durationMs = now - lastTime;
          }
        }

        const outcomeId = await toolOutcomesRepo.record({
          sessionId,
          projectId: projectId || undefined,
          toolName,
          outcome: outcomeType,
          outcomeType: success ? undefined : errorType,
          message: success ? redactSensitive(outputSummaryStr) : outputSummaryStr,
          toolInputHash: hashInput(toolInput ?? ''),
          inputSummary: redactSensitive(summarizeInput(toolInput, 200)),
          outputSummary: redactSensitive(summarizeOutput(toolResponse, 500)),
          durationMs: durationMs || undefined,
          precedingToolId: precedingToolId || undefined,
        });

        logger.debug(
          {
            sessionId,
            toolName,
            outcome: outcomeType,
            outcomeId,
          },
          'Tool outcome recorded'
        );

        await toolOutcomesRepo.incrementAndGetToolCount(sessionId);

        // Step 3.5: Trigger periodic analysis if threshold reached (fire-and-forget)
        triggerPeriodicAnalysis(sessionId, toolOutcomesRepo).catch((err) => {
          logger.debug(
            {
              error: err instanceof Error ? err.message : String(err),
              sessionId,
            },
            'Periodic analysis trigger failed (non-blocking)'
          );
        });
      }
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
          toolName,
        },
        'Failed to record tool outcome (non-blocking)'
      );
    }
  }

  // Step 4: Detect immediate error patterns and store in error_log (dual-write for failures)
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

    // Store error in error_log table (non-blocking, fire-and-forget)
    if (sessionId && toolName) {
      try {
        const ctx = getContext();
        if (ctx.repos.errorLog) {
          const errorSignature = generateErrorSignature(toolName, errorType, outputSummary);
          const toolInputHash = toolInput ? hashToolInput(toolInput) : undefined;

          ctx.repos.errorLog
            .record({
              sessionId,
              projectId,
              toolName,
              errorType,
              errorMessage: outputSummary,
              errorSignature,
              toolInputHash,
            })
            .catch((err) => {
              logger.warn(
                {
                  error: err instanceof Error ? err.message : String(err),
                  sessionId,
                  toolName,
                },
                'Failed to store error in error_log (non-blocking)'
              );
            });
        }
      } catch (error) {
        // Non-blocking - don't let error storage failure affect hook execution
        logger.debug(
          {
            error: error instanceof Error ? error.message : String(error),
            sessionId,
            toolName,
          },
          'Error storing tool failure in error_log (non-blocking)'
        );
      }
    }
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
      const toolOutput =
        typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);

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

  await captureAssistantToolUse(sessionId, toolName, toolInput, toolResponse);

  return { exitCode: 0, stdout, stderr };
}

async function triggerPeriodicAnalysis(
  sessionId: string,
  toolOutcomesRepo: ReturnType<typeof getContext>['repos']['toolOutcomes'] | undefined
): Promise<void> {
  if (!isContextRegistered() || !toolOutcomesRepo) return;

  const ctx = getContext();
  const config = ctx.config;

  if (!config.periodicAnalysis.enabled) return;

  // Step 1: SNAPSHOT - Read atomically
  const snapshot = await toolOutcomesRepo.getCounterSnapshot(sessionId);
  if (!snapshot) return;

  // Step 2: CHECK - Threshold not met?
  const countSinceAnalysis = snapshot.toolCount - snapshot.lastAnalysisCount;
  if (countSinceAnalysis < config.periodicAnalysis.toolCountThreshold) return;

  // Step 3: CAS - Try to claim analysis rights
  const claimed = await toolOutcomesRepo.tryClaimAnalysis(
    sessionId,
    snapshot.lastAnalysisCount,
    snapshot.toolCount
  );

  if (!claimed) {
    // Another process claimed it - exit silently
    return;
  }

  // Step 4: QUERY - Get outcomes to analyze (by count, not timestamp)
  const recentOutcomes = await toolOutcomesRepo.getRecentOutcomes(sessionId, countSinceAnalysis);

  // Step 5: Check minimum success count
  const successCount = recentOutcomes.filter((o) => o.outcome === 'success').length;
  if (successCount < config.periodicAnalysis.minSuccessCount) {
    // Not enough successes - exit
    return;
  }

  // Step 6: Trigger analysis (FIRE-AND-FORGET - see lines 2132-2199 in plan)
  const outcomeAnalyzer = getOutcomeAnalyzerService();
  const hookLearning = getHookLearningService();

  outcomeAnalyzer
    .analyzeOutcomes(recentOutcomes)
    .then(async (analysis) => {
      // Store patterns via HookLearningService
      for (const pattern of analysis.patterns) {
        if (pattern.confidence >= 0.7) {
          await hookLearning.storePatternKnowledge(pattern, sessionId);
        }
      }
    })
    .catch((err: unknown) => {
      logger.warn(
        {
          error: err instanceof Error ? err.message : String(err),
          sessionId,
        },
        'Periodic analysis failed'
      );
    });
}

async function captureAssistantToolUse(
  sessionId: string | null,
  toolName: string | undefined,
  toolInput: unknown,
  toolResponse: unknown
): Promise<void> {
  if (!sessionId) return;

  try {
    if (!isContextRegistered()) return;

    const ctx = getContext();
    if (!ctx.repos.conversations) return;

    const conversations = await ctx.repos.conversations.list(
      { sessionId, status: 'active' },
      { limit: 1 }
    );

    if (conversations.length === 0) return;

    const conversation = conversations[0];
    if (!conversation) return;

    const content = JSON.stringify({
      tool: toolName,
      input: toolInput,
      output: toolResponse,
    });

    await ctx.repos.conversations.addMessage({
      conversationId: conversation.id,
      role: 'agent',
      content,
      toolsUsed: toolName ? [toolName] : undefined,
    });

    logger.debug({ sessionId, conversationId: conversation.id, toolName }, 'Captured tool use');
  } catch (error) {
    logger.debug(
      { sessionId, error: error instanceof Error ? error.message : String(error) },
      'Failed to capture tool use (non-fatal)'
    );
  }
}
