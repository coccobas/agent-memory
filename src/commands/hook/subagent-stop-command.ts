/**
 * SubagentStop Hook Command
 *
 * Handles the SubagentStop Claude Code hook event.
 * Called when a subagent (spawned via Task tool) finishes execution.
 *
 * Responsibilities:
 * 1. Capture subagent experiences for learning from delegated work
 * 2. Track delegation patterns
 * 3. Link subagent results to parent episode
 * 4. Record analytics metrics
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { getHookAnalyticsService } from '../../services/analytics/index.js';
import { getHookLearningService } from '../../services/learning/index.js';
import { getDb, getSqlite } from '../../db/connection.js';
import { createEpisodeRepository } from '../../db/repositories/episodes.js';

const logger = createComponentLogger('subagent-stop');

/**
 * Configuration for SubagentStop hook
 */
export interface SubagentStopConfig {
  /** Enable capturing subagent experiences (default: true) */
  captureExperiences: boolean;
  /** Enable linking to parent episode (default: true) */
  linkEpisodes: boolean;
  /** Enable recording analytics metrics (default: true) */
  recordAnalytics: boolean;
  /** Enable learning from subagent completions (default: true) */
  enableLearning: boolean;
  /** Enable knowledge extraction from subagent findings (default: true) */
  enableKnowledgeExtraction: boolean;
}

/**
 * Get configuration from environment variables
 */
function getConfig(overrides?: Partial<SubagentStopConfig>): SubagentStopConfig {
  const envCaptureExperiences = process.env.AGENT_MEMORY_SUBAGENT_CAPTURE_ENABLED;
  const envLinkEpisodes = process.env.AGENT_MEMORY_SUBAGENT_LINK_EPISODES;
  const envRecordAnalytics = process.env.AGENT_MEMORY_SUBAGENT_RECORD_ANALYTICS;
  const envEnableLearning = process.env.AGENT_MEMORY_SUBAGENT_ENABLE_LEARNING;
  const envEnableKnowledge = process.env.AGENT_MEMORY_SUBAGENT_ENABLE_KNOWLEDGE;

  return {
    captureExperiences:
      overrides?.captureExperiences ??
      (envCaptureExperiences !== 'false' && envCaptureExperiences !== '0'),
    linkEpisodes: overrides?.linkEpisodes ?? (envLinkEpisodes !== 'false' && envLinkEpisodes !== '0'),
    recordAnalytics:
      overrides?.recordAnalytics ?? (envRecordAnalytics !== 'false' && envRecordAnalytics !== '0'),
    enableLearning:
      overrides?.enableLearning ?? (envEnableLearning !== 'false' && envEnableLearning !== '0'),
    enableKnowledgeExtraction:
      overrides?.enableKnowledgeExtraction ?? (envEnableKnowledge !== 'false' && envEnableKnowledge !== '0'),
  };
}

/**
 * Parse subagent result to determine success/failure
 */
function parseSubagentResult(result: unknown): {
  success: boolean;
  resultSummary?: string;
  resultSize?: number;
} {
  // Handle null/undefined result
  if (result === null || result === undefined) {
    return { success: true, resultSummary: '', resultSize: 0 };
  }

  // Convert to string for analysis
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
  const resultSize = resultStr.length;

  // Check for explicit error indicators
  const errorPatterns = [
    /error:/i,
    /failed/i,
    /exception/i,
    /aborted/i,
    /timed out/i,
    /could not/i,
    /unable to/i,
  ];

  const hasError = errorPatterns.some((pattern) => pattern.test(resultStr));

  // Check for explicit success/error object
  if (typeof result === 'object' && result !== null) {
    const resp = result as Record<string, unknown>;
    if ('error' in resp && resp.error) {
      return {
        success: false,
        resultSummary: resultStr.slice(0, 500),
        resultSize,
      };
    }
    if ('success' in resp) {
      return {
        success: Boolean(resp.success),
        resultSummary: resultStr.slice(0, 500),
        resultSize,
      };
    }
  }

  return {
    success: !hasError,
    resultSummary: resultStr.slice(0, 500),
    resultSize,
  };
}

/**
 * Map subagent type to a category for analytics
 */
function categorizeSubagentType(subagentType: string | undefined): string {
  if (!subagentType) return 'unknown';

  const typeLower = subagentType.toLowerCase();

  // Known Claude Code subagent types
  const categories: Record<string, string[]> = {
    explore: ['explore', 'search', 'find'],
    plan: ['plan', 'architect', 'design'],
    implement: ['implement', 'code', 'write'],
    test: ['test', 'verify', 'validate'],
    review: ['review', 'analyze', 'check'],
    general: ['general', 'general-purpose', 'task'],
    bash: ['bash', 'shell', 'command'],
  };

  for (const [category, patterns] of Object.entries(categories)) {
    if (patterns.some((p) => typeLower.includes(p))) {
      return category;
    }
  }

  return 'custom';
}

/**
 * Calculate delegation depth from parent session chain
 */
function calculateDelegationDepth(
  parentSessionId: string | undefined,
  sessionId: string | undefined
): number {
  // Simple heuristic: count session separators or return 1 for any delegation
  if (!parentSessionId || !sessionId) return 1;

  // In the future, could track nested delegations via session metadata
  return 1;
}

/**
 * Run the SubagentStop hook command
 */
export async function runSubagentStopCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
  config?: Partial<SubagentStopConfig>;
}): Promise<HookCommandResult> {
  const { projectId, agentId: _agentId, input, config: configOverrides } = params;
  const config = getConfig(configOverrides);

  const sessionId = input.session_id || null;
  const subagentId = input.subagent_id;
  const subagentType = input.subagent_type;
  const result = input.result;
  const parentSessionId = input.parent_session_id;

  logger.debug(
    {
      sessionId,
      projectId,
      subagentId,
      subagentType,
      hasResult: result !== undefined,
    },
    'SubagentStop hook invoked'
  );

  // Collect output
  const stdout: string[] = [];
  const stderr: string[] = [];

  // Parse subagent result
  const { success, resultSummary, resultSize } = parseSubagentResult(result);

  // Step 1: Capture subagent experience (if enabled and result is meaningful)
  if (config.captureExperiences && result !== undefined) {
    try {
      // Future: Extract experiences from subagent results
      // For now, just log significant results
      if (resultSize && resultSize > 100) {
        logger.debug(
          {
            sessionId,
            subagentType,
            resultSize,
          },
          'Subagent produced significant result (experience capture pending)'
        );
      }
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        'Failed to capture subagent experience (non-blocking)'
      );
    }
  }

  // Step 2: Link to parent episode (if enabled)
  if (config.linkEpisodes && parentSessionId) {
    try {
      const db = getDb();
      const sqlite = getSqlite();
      const episodeRepo = createEpisodeRepository({ db, sqlite });

      // Find active episode(s) for the parent session
      const activeEpisodes = await episodeRepo.list({
        sessionId: parentSessionId,
        status: 'active',
      });

      if (activeEpisodes.length > 0) {
        // Link to the most recent active episode
        const activeEpisode = activeEpisodes[0]!;

        // Add an event to the episode about subagent completion
        await episodeRepo.addEvent({
          episodeId: activeEpisode.id,
          eventType: 'checkpoint',
          name: `Subagent completed: ${subagentType ?? 'unknown'}`,
          description: success
            ? `Subagent (${subagentType}) completed successfully. Result size: ${resultSize ?? 0} chars`
            : `Subagent (${subagentType}) failed. ${resultSummary?.slice(0, 200) ?? ''}`,
          data: {
            subagentId,
            subagentType,
            success,
            resultSize,
            parentSessionId,
          },
        });

        logger.info(
          {
            sessionId,
            parentSessionId,
            episodeId: activeEpisode.id,
            subagentType,
            success,
          },
          'Subagent completion linked to parent episode'
        );
      } else {
        logger.debug(
          {
            sessionId,
            parentSessionId,
            subagentType,
          },
          'No active episode found for parent session'
        );
      }
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        'Failed to link subagent to episode (non-blocking)'
      );
    }
  }

  // Step 3: Record analytics metric
  if (config.recordAnalytics) {
    try {
      const analyticsService = getHookAnalyticsService();
      await analyticsService.recordSubagentCompletion({
        sessionId: sessionId ?? undefined,
        projectId,
        subagentId: subagentId ?? 'unknown',
        subagentType: subagentType ?? 'unknown',
        parentSessionId,
        success,
        resultSize,
        delegationDepth: calculateDelegationDepth(parentSessionId, sessionId ?? undefined),
      });

      logger.debug(
        {
          sessionId,
          subagentType,
          success,
        },
        'Subagent completion metric recorded'
      );
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        'Failed to record subagent completion metric (non-blocking)'
      );
    }
  }

  // Step 4: Learn from significant subagent completions (create experiences for Librarian)
  if (config.enableLearning && sessionId && subagentType) {
    try {
      const learningService = getHookLearningService();
      const learningResult = await learningService.onSubagentCompletion({
        sessionId,
        projectId,
        subagentId: subagentId ?? 'unknown',
        subagentType,
        success,
        resultSummary,
        resultSize,
        timestamp: new Date().toISOString(),
      });

      if (learningResult.experienceCreated) {
        logger.info(
          {
            sessionId,
            subagentType,
            experienceId: learningResult.experienceId,
          },
          'Experience created from subagent completion'
        );
      }
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
          subagentType,
        },
        'Failed to record subagent completion for learning (non-blocking)'
      );
    }
  }

  // Step 5: Extract knowledge from successful subagent findings
  if (config.enableKnowledgeExtraction && success && sessionId && subagentType && resultSummary) {
    try {
      const learningService = getHookLearningService();
      const knowledgeResult = await learningService.onSubagentKnowledge({
        sessionId,
        projectId,
        subagentType,
        findings: resultSummary,
        timestamp: new Date().toISOString(),
      });

      if (knowledgeResult.knowledgeCreated) {
        logger.info(
          {
            sessionId,
            subagentType,
            knowledgeCount: knowledgeResult.knowledgeIds.length,
          },
          'Knowledge extracted from subagent findings'
        );
      }
    } catch (error) {
      // Non-blocking
      logger.debug(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
          subagentType,
        },
        'Failed to extract knowledge from subagent findings (non-blocking)'
      );
    }
  }

  // Log summary for visibility
  logger.info(
    {
      sessionId,
      subagentId,
      subagentType: categorizeSubagentType(subagentType),
      success,
      resultSize,
    },
    'Subagent completed'
  );

  // SubagentStop is always non-blocking (exit code 0)
  return { exitCode: 0, stdout, stderr };
}
