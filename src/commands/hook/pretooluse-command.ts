import { verifyAction } from '../../services/verification.service.js';
import { getDb } from '../../db/connection.js';
import {
  getMemoryInjectionService,
  formatEntries,
  type InjectionFormat,
} from '../../services/memory-injection.service.js';
import { createComponentLogger } from '../../utils/logger.js';
import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { extractProposedActionFromTool } from './shared.js';
import { getBehaviorObserverService } from '../../services/capture/behavior-observer.js';
import { isContextRegistered, getContext } from '../../core/container.js';
import { createContextManagerService } from '../../services/context/index.js';
import { getCaptureStateManager } from '../../services/capture/state.js';
import { getInjectionTrackerService } from '../../services/injection-tracking/index.js';

const logger = createComponentLogger('pretooluse');

/**
 * Configuration for PreToolUse context injection
 */
export interface PreToolUseConfig {
  injectContext: boolean;
  contextFormat: InjectionFormat;
  contextMaxEntries: number;
  contextToStdout: boolean;
  contextToStderr: boolean;
  includeConversationContext: boolean;
  conversationContextMaxTokens: number;
  conversationContextLastN: number;
  deduplicateInjections: boolean;
  injectionTokenThreshold: number;
}

/**
 * Get configuration from environment variables and overrides
 */
function getConfig(overrides?: Partial<PreToolUseConfig>): PreToolUseConfig {
  const envInjectContext = process.env.AGENT_MEMORY_INJECT_CONTEXT;
  const envContextFormat = process.env.AGENT_MEMORY_CONTEXT_FORMAT;
  const envContextMaxEntries = process.env.AGENT_MEMORY_CONTEXT_MAX_ENTRIES;
  const envIncludeConversationContext = process.env.AGENT_MEMORY_INCLUDE_CONVERSATION_CONTEXT;

  const validFormats = ['markdown', 'json', 'natural_language'] as const;
  const validatedFormat =
    envContextFormat && validFormats.includes(envContextFormat as InjectionFormat)
      ? (envContextFormat as InjectionFormat)
      : undefined;

  let parsedMaxEntries: number | undefined;
  if (envContextMaxEntries) {
    const parsed = parseInt(envContextMaxEntries, 10);
    parsedMaxEntries = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  const envDeduplicateInjections = process.env.AGENT_MEMORY_DEDUPLICATE_INJECTIONS;
  const envInjectionTokenThreshold = process.env.AGENT_MEMORY_INJECTION_TOKEN_THRESHOLD;

  let parsedTokenThreshold: number | undefined;
  if (envInjectionTokenThreshold) {
    const parsed = parseInt(envInjectionTokenThreshold, 10);
    parsedTokenThreshold = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return {
    injectContext:
      overrides?.injectContext ?? (envInjectContext !== 'false' && envInjectContext !== '0'),
    contextFormat: overrides?.contextFormat ?? validatedFormat ?? 'markdown',
    contextMaxEntries: overrides?.contextMaxEntries ?? parsedMaxEntries ?? 5,
    contextToStdout: overrides?.contextToStdout ?? true,
    contextToStderr: overrides?.contextToStderr ?? true,
    includeConversationContext:
      overrides?.includeConversationContext ??
      (envIncludeConversationContext !== 'false' && envIncludeConversationContext !== '0'),
    conversationContextMaxTokens: overrides?.conversationContextMaxTokens ?? 500,
    conversationContextLastN: overrides?.conversationContextLastN ?? 5,
    deduplicateInjections:
      overrides?.deduplicateInjections ??
      (envDeduplicateInjections !== 'false' && envDeduplicateInjections !== '0'),
    injectionTokenThreshold: overrides?.injectionTokenThreshold ?? parsedTokenThreshold ?? 100000,
  };
}

/**
 * Map tool name to injectable tool type
 */
function mapToolName(
  toolName?: string
): 'Edit' | 'Write' | 'Bash' | 'Read' | 'Glob' | 'Grep' | 'other' {
  const name = toolName?.toLowerCase() ?? '';
  if (name === 'edit') return 'Edit';
  if (name === 'write') return 'Write';
  if (name === 'bash') return 'Bash';
  if (name === 'read') return 'Read';
  if (name === 'glob') return 'Glob';
  if (name === 'grep') return 'Grep';
  return 'other';
}

export async function runPreToolUseCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
  config?: Partial<PreToolUseConfig>;
}): Promise<HookCommandResult> {
  const { projectId, agentId, input, config: configOverrides } = params;
  const config = getConfig(configOverrides);

  const sessionId = input.session_id || null;
  const toolName = mapToolName(input.tool_name);
  const toolParams = input.tool_input as Record<string, unknown> | undefined;

  logger.debug(
    { sessionId, projectId, toolName, injectContext: config.injectContext },
    'PreToolUse hook invoked'
  );

  // Get database connection
  const db = getDb();

  // Step 0: Behavior Observation (record tool use event for later analysis)
  // This captures every tool use event with metadata for pattern detection at session end
  if (sessionId) {
    try {
      const behaviorObserver = getBehaviorObserverService();
      behaviorObserver.recordEvent(sessionId, input.tool_name ?? 'unknown', toolParams ?? {}, {
        projectId,
        agentId,
      });
      logger.debug(
        { sessionId, toolName: input.tool_name },
        'Tool use event recorded for behavior observation'
      );
    } catch (error) {
      // Behavior observation is non-blocking
      logger.debug(
        { error: error instanceof Error ? error.message : String(error), sessionId },
        'Behavior observation recording failed (non-blocking)'
      );
    }
  }

  // Track injection result for JSON output
  let injectedContext: string | undefined;
  let userFeedback: string | undefined;

  // Step 1: Context Injection (if enabled)
  if (config.injectContext) {
    try {
      let contextManager = isContextRegistered()
        ? getContext().services?.contextManager
        : undefined;

      if (!contextManager) {
        contextManager = createContextManagerService(null, null, {
          enabled: true,
          staleness: { enabled: true, staleAgeDays: 90, notAccessedDays: 60 },
          budget: { enabled: true, baseBudget: 2000, maxBudget: 8000 },
          priority: { enabled: true, minScore: 0.3 },
          compression: { enabled: true, hierarchicalThreshold: 1500 },
        });
      }

      let conversationContext: string | undefined;
      if (config.includeConversationContext && sessionId) {
        try {
          const stateManager = getCaptureStateManager();
          const recentTurns = stateManager.getRecentTranscript(sessionId, {
            lastN: config.conversationContextLastN,
            maxTokens: config.conversationContextMaxTokens,
          });
          if (recentTurns.length > 0) {
            conversationContext = recentTurns.map((t) => `${t.role}: ${t.content}`).join('\n');
          }
        } catch (transcriptError) {
          logger.debug(
            {
              error:
                transcriptError instanceof Error
                  ? transcriptError.message
                  : String(transcriptError),
            },
            'Transcript retrieval failed (non-blocking)'
          );
        }
      }

      const injectionService = getMemoryInjectionService(db, contextManager);
      const injectionResult = await injectionService.getContext({
        toolName,
        toolParams,
        sessionId: sessionId ?? undefined,
        projectId,
        agentId,
        format: config.contextFormat,
        maxEntries: config.contextMaxEntries,
        ...(conversationContext && { conversationContext }),
      });

      if (injectionResult.success && injectionResult.injectedContext) {
        let entriesToInject = injectionResult.entries;
        let skippedCount = 0;

        // Filter out recently-injected guidelines if deduplication is enabled
        if (config.deduplicateInjections && sessionId) {
          const injectionTracker = getInjectionTrackerService();

          // Try to get current episode ID from context
          let currentEpisodeId: string | null = null;
          try {
            if (isContextRegistered()) {
              const ctx = getContext();
              if (ctx.services?.episode) {
                const activeEpisode = await ctx.services.episode.getActiveEpisode(sessionId);
                currentEpisodeId = activeEpisode?.id ?? null;
              }
            }
          } catch {
            // Episode detection is optional
          }

          const originalCount = entriesToInject.length;
          entriesToInject = injectionTracker.filterGuidelinesForInjection(
            sessionId,
            entriesToInject,
            currentEpisodeId,
            { tokenThreshold: config.injectionTokenThreshold }
          );
          skippedCount = originalCount - entriesToInject.length;

          // Record injections for guidelines that will be injected
          for (const entry of entriesToInject) {
            if (entry.type === 'guideline') {
              injectionTracker.recordInjection(sessionId, entry.id, currentEpisodeId);
            }
          }

          // Estimate token usage and increment counter
          if (injectionResult.budgetInfo?.used) {
            injectionTracker.incrementTokens(sessionId, injectionResult.budgetInfo.used);
          }

          if (skippedCount > 0) {
            logger.debug(
              { skippedCount, remainingCount: entriesToInject.length, sessionId },
              'Skipped recently-injected guidelines'
            );
          }
        }

        logger.debug(
          {
            entriesCount: entriesToInject.length,
            processingTimeMs: injectionResult.processingTimeMs,
            intent: injectionResult.detectedIntent,
          },
          'Context injection successful'
        );

        let finalInjectedContext = injectionResult.injectedContext;
        if (skippedCount > 0 && entriesToInject.length > 0) {
          finalInjectedContext = formatEntries(entriesToInject, config.contextFormat);
        } else if (skippedCount > 0 && entriesToInject.length === 0) {
          finalInjectedContext = '';
        }

        // Store context for JSON output
        if (config.contextToStdout && finalInjectedContext) {
          injectedContext = finalInjectedContext;
        }

        // Build user feedback summary
        if (config.contextToStderr && entriesToInject.length > 0) {
          const types = entriesToInject.map((e) => e.type);
          const typeCounts = types.reduce(
            (acc, t) => {
              acc[t] = (acc[t] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          );
          const summary = Object.entries(typeCounts)
            .map(([t, c]) => `${c} ${t}${c > 1 ? 's' : ''}`)
            .join(', ');

          // Build enhanced summary with context management info
          const parts = [`🧠 Injected: ${summary}`];

          // Add skipped count if any
          if (skippedCount > 0) {
            parts.push(`[${skippedCount} deduped]`);
          }

          // Add budget info if available
          if (injectionResult.budgetInfo) {
            const { allocated, used, complexity } = injectionResult.budgetInfo;
            parts.push(`[${used}/${allocated} tokens, ${complexity}]`);
          }

          // Add compression info if applied
          if (injectionResult.compressionApplied && injectionResult.compressionLevel) {
            parts.push(`[compressed: ${injectionResult.compressionLevel}]`);
          }

          // Add staleness warnings if any
          if (injectionResult.stalenessWarnings && injectionResult.stalenessWarnings.length > 0) {
            const warningCount = injectionResult.stalenessWarnings.length;
            parts.push(`[⚠ ${warningCount} stale]`);
          }

          userFeedback = parts.join(' ');
        }
      } else {
        logger.debug({ message: injectionResult.message }, 'No context to inject');
      }
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Context injection failed (non-blocking)'
      );
      // Context injection failure is non-blocking
    }
  }

  // Step 2: Verification against critical guidelines
  const proposed = extractProposedActionFromTool(input.tool_name, input.tool_input);
  const verificationResult = verifyAction(
    sessionId,
    projectId ?? null,
    {
      type: proposed.actionType,
      description: proposed.description,
      filePath: proposed.filePath,
      content: proposed.content,
      metadata: {
        source: 'claude-code-hook',
        agentId: agentId ?? 'claude-code',
        hookEvent: input.hook_event_name,
        toolName: input.tool_name,
        cwd: input.cwd,
      },
    },
    db
  );

  // If blocked by verification, return exit code 2
  if (verificationResult.blocked) {
    const messages = (verificationResult.violations || []).map((v) => v.message).filter(Boolean);
    const blockReason = messages.length > 0 ? messages.join('\n') : 'Blocked by critical guideline';

    logger.info(
      {
        sessionId,
        toolName: input.tool_name,
        reason: blockReason,
      },
      'Tool use blocked by critical guideline'
    );

    return { exitCode: 2, stdout: [], stderr: [blockReason] };
  }

  // Build pure JSON output for Claude Code
  // Per docs: Cannot mix plain text and JSON - must use additionalContext field
  const jsonOutput: {
    systemMessage?: string;
    hookSpecificOutput: {
      hookEventName: string;
      permissionDecision: string;
      additionalContext?: string;
    };
  } = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };

  // Add user-visible feedback via systemMessage
  if (userFeedback) {
    jsonOutput.systemMessage = userFeedback;
  }

  // Add memory context via additionalContext (proper way per Claude Code docs)
  if (injectedContext) {
    jsonOutput.hookSpecificOutput.additionalContext = injectedContext;
  }

  // Only output JSON if we have something to include
  if (injectedContext || userFeedback) {
    return {
      exitCode: 0,
      stdout: [JSON.stringify(jsonOutput)],
      stderr: [],
    };
  }

  // No context to inject, return empty
  return { exitCode: 0, stdout: [], stderr: [] };
}
