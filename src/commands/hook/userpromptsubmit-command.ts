import type { ClaudeHookInput, HookCommandResult } from './types.js';
import type { TurnData } from '../../services/capture/types.js';
import { getPromptFromHookInput } from './shared.js';
import { ensureSessionIdExists } from './session.js';
import {
  allowed,
  blocked,
  findCommand,
  generateHelp,
  type CommandContext,
} from './command-registry.js';
import { getHookAnalyticsService } from '../../services/analytics/index.js';
import { createComponentLogger } from '../../utils/logger.js';
import { getCaptureStateManager } from '../../services/capture/state.js';
import { detectConflicts, detectProjectMentions } from '../../utils/transcript-analysis.js';
import { isContextRegistered, getContext } from '../../core/container.js';

const logger = createComponentLogger('userpromptsubmit');

/**
 * Configuration for UserPromptSubmit hook
 */
export interface UserPromptSubmitConfig {
  enableNaturalLanguageTriggers: boolean;
  recordAnalytics: boolean;
  useTranscriptContext: boolean;
  detectConflicts: boolean;
  detectScopeMismatch: boolean;
}

/**
 * Memory trigger detection result
 */
interface MemoryTriggerResult {
  detected: boolean;
  type: string;
  pattern?: string;
  excerpt?: string;
}

/**
 * Memory trigger patterns
 *
 * These patterns detect when a user is expressing something that should be
 * captured as memory (guideline, preference, or rule).
 */
const MEMORY_TRIGGER_PATTERNS: Array<{
  pattern: RegExp;
  type: string;
  description: string;
}> = [
  // Explicit remember requests
  {
    pattern: /\bremember\s+(that|this|to)\b/i,
    type: 'explicit_remember',
    description: 'User explicitly asking to remember something',
  },
  // Rules and constraints
  {
    pattern: /\balways\s+(?!ask|check|verify|test|run|make sure|ensure|remember)\w+/i,
    type: 'rule_always',
    description: 'User expressing an "always do X" rule',
  },
  {
    pattern: /\bnever\s+(?!mind|again)\w+/i,
    type: 'rule_never',
    description: 'User expressing a "never do X" rule',
  },
  // Preferences
  {
    pattern: /\bfrom now on\b/i,
    type: 'preference_ongoing',
    description: 'User setting an ongoing preference',
  },
  {
    pattern: /\bi (?:prefer|want|like)\s+(?:to\s+)?(?:use|have|see)\b/i,
    type: 'preference_stated',
    description: 'User stating a preference',
  },
  // Standards and conventions
  {
    pattern: /\bour (?:standard|convention|rule|practice) is\b/i,
    type: 'standard',
    description: 'User defining a team standard',
  },
  {
    pattern: /\bwe (?:always|never|usually|typically)\b/i,
    type: 'team_practice',
    description: 'User describing team practices',
  },
  // Important context
  {
    pattern: /\bimportant(?:ly)?:\s/i,
    type: 'important_context',
    description: 'User flagging something as important',
  },
  {
    pattern: /\bnote(?::\s|\s+that\s)/i,
    type: 'note',
    description: 'User providing a note to remember',
  },
  // Decisions
  {
    pattern: /\bwe (?:decided|chose|agreed)\s+(?:to|that)\b/i,
    type: 'decision',
    description: 'User recording a decision',
  },
  {
    pattern: /\blet's (?:always|make sure to|stick with)\b/i,
    type: 'directive',
    description: 'User giving a directive for future work',
  },
];

/**
 * Get configuration from environment variables
 */
function getConfig(overrides?: Partial<UserPromptSubmitConfig>): UserPromptSubmitConfig {
  const envNaturalLanguage = process.env.AGENT_MEMORY_PROMPT_NATURAL_LANGUAGE;
  const envRecordAnalytics = process.env.AGENT_MEMORY_PROMPT_RECORD_ANALYTICS;
  const envUseTranscriptContext = process.env.AGENT_MEMORY_USE_TRANSCRIPT_CONTEXT;
  const envDetectConflicts = process.env.AGENT_MEMORY_DETECT_CONFLICTS;
  const envDetectScopeMismatch = process.env.AGENT_MEMORY_DETECT_SCOPE_MISMATCH;

  return {
    enableNaturalLanguageTriggers:
      overrides?.enableNaturalLanguageTriggers ??
      (envNaturalLanguage !== 'false' && envNaturalLanguage !== '0'),
    recordAnalytics:
      overrides?.recordAnalytics ?? (envRecordAnalytics !== 'false' && envRecordAnalytics !== '0'),
    // Transcript analysis features - enabled by default for better UX
    useTranscriptContext:
      overrides?.useTranscriptContext ??
      (envUseTranscriptContext !== 'false' && envUseTranscriptContext !== '0'),
    detectConflicts:
      overrides?.detectConflicts ?? (envDetectConflicts !== 'false' && envDetectConflicts !== '0'),
    detectScopeMismatch:
      overrides?.detectScopeMismatch ??
      (envDetectScopeMismatch !== 'false' && envDetectScopeMismatch !== '0'),
  };
}

/**
 * Detect memory triggers in natural language prompts
 *
 * Scans the prompt for patterns that indicate the user wants something
 * remembered or captured as a guideline/preference.
 */
function detectMemoryTriggers(prompt: string): MemoryTriggerResult {
  for (const { pattern, type, description } of MEMORY_TRIGGER_PATTERNS) {
    const match = prompt.match(pattern);
    if (match) {
      // Extract a short excerpt around the match
      const matchIndex = match.index ?? 0;
      const start = Math.max(0, matchIndex - 20);
      const end = Math.min(prompt.length, matchIndex + match[0].length + 50);
      const excerpt =
        (start > 0 ? '...' : '') +
        prompt.slice(start, end).trim() +
        (end < prompt.length ? '...' : '');

      return {
        detected: true,
        type,
        pattern: description,
        excerpt,
      };
    }
  }

  return { detected: false, type: '' };
}

/**
 * Mark a prompt for capture (non-blocking)
 *
 * Records that this prompt contains memory-worthy content
 * so it can be extracted during the Stop or SessionEnd hooks.
 */
async function markForCapture(
  sessionId: string,
  projectId: string | undefined,
  prompt: string,
  trigger: MemoryTriggerResult,
  isBoosted = false
): Promise<void> {
  try {
    const analyticsService = getHookAnalyticsService();

    const category = isBoosted ? 'boosted_natural_language_trigger' : 'natural_language_trigger';
    await analyticsService.recordNotification({
      sessionId,
      projectId,
      type: 'memory_trigger_detected',
      message: `${trigger.type || 'boosted'}: ${trigger.excerpt ?? prompt.slice(0, 100)}`,
      severity: 'info',
      category,
    });

    logger.info(
      {
        sessionId,
        triggerType: trigger.type,
        pattern: trigger.pattern,
      },
      'Memory trigger detected in user prompt'
    );
  } catch (error) {
    // Non-blocking
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      },
      'Failed to mark prompt for capture (non-blocking)'
    );
  }
}

/**
 * Run the UserPromptSubmit hook command
 *
 * This hook:
 * 1. Intercepts user prompts starting with "!am" and routes them
 *    to the appropriate command handler via the command registry.
 * 2. Detects natural language memory triggers and marks them for capture.
 */
export async function runUserPromptSubmitCommand(params: {
  projectId?: string;
  input: ClaudeHookInput;
  config?: Partial<UserPromptSubmitConfig>;
}): Promise<HookCommandResult> {
  const { projectId, input, config: configOverrides } = params;
  const config = getConfig(configOverrides);

  const sessionId = input.session_id;
  if (!sessionId) {
    return allowed();
  }

  const prompt = getPromptFromHookInput(input);
  if (!prompt) {
    return allowed();
  }

  const trimmed = prompt.trim();

  // Step 1: Handle !am commands (blocking)
  if (trimmed.toLowerCase().startsWith('!am')) {
    // Parse command parts: "!am command subcommand arg1 arg2..."
    const parts = trimmed.split(/\s+/).slice(1);
    const command = (parts[0] ?? '').toLowerCase();
    const subcommand = (parts[1] ?? '').toLowerCase();
    const args = parts.slice(2);

    // Ensure session exists in database
    await ensureSessionIdExists(sessionId, projectId);

    // Find the matching command descriptor
    const descriptor = findCommand(command, subcommand);

    if (!descriptor) {
      // Unknown command - show help
      return blocked(generateHelp());
    }

    // Build command context
    const ctx: CommandContext = {
      sessionId,
      projectId,
      command,
      subcommand,
      args,
    };

    // Execute the handler
    return descriptor.handler(ctx);
  }

  // Step 2: Detect natural language memory triggers (non-blocking)
  let transcriptTurns: TurnData[] = [];

  if (config.useTranscriptContext) {
    try {
      const stateManager = getCaptureStateManager();
      transcriptTurns = stateManager.getRecentTranscript(sessionId, { lastN: 5, maxTokens: 500 });
    } catch (transcriptError) {
      logger.debug(
        {
          error:
            transcriptError instanceof Error ? transcriptError.message : String(transcriptError),
        },
        'Transcript retrieval failed (non-blocking)'
      );
    }
  }

  if (config.enableNaturalLanguageTriggers && trimmed.length > 10) {
    const trigger = detectMemoryTriggers(trimmed);
    let isBoosted = false;

    if (config.useTranscriptContext && transcriptTurns.length > 0) {
      const transcriptHasPatterns = transcriptTurns.some((turn) => {
        const content = turn.content.toLowerCase();
        return (
          content.includes('always ') ||
          content.includes('never ') ||
          content.includes('we decided') ||
          content.includes('our standard')
        );
      });

      if (transcriptHasPatterns) {
        isBoosted = true;
      }
    }

    if (trigger.detected || isBoosted) {
      await ensureSessionIdExists(sessionId, projectId);
      await markForCapture(sessionId, projectId, trimmed, trigger, isBoosted);
    }
  }

  if (config.detectConflicts && config.useTranscriptContext && transcriptTurns.length > 0) {
    try {
      const turnsWithCurrentPrompt: TurnData[] = [
        ...transcriptTurns,
        { role: 'user' as const, content: trimmed },
      ];
      const conflicts = detectConflicts(turnsWithCurrentPrompt);
      if (conflicts.length > 0) {
        const analyticsService = getHookAnalyticsService();
        for (const conflict of conflicts) {
          await analyticsService.recordNotification({
            sessionId,
            projectId,
            type: 'conflict_detected',
            message: `Conflict: ${conflict.statements.join(' vs ')}`,
            severity: 'warning',
            category: 'transcript_analysis',
          });
        }
      }
    } catch (conflictError) {
      logger.debug(
        { error: conflictError instanceof Error ? conflictError.message : String(conflictError) },
        'Conflict detection failed (non-blocking)'
      );
    }
  }

  if (config.detectScopeMismatch && config.useTranscriptContext && transcriptTurns.length > 0) {
    try {
      const turnsWithCurrentPrompt: TurnData[] = [
        ...transcriptTurns,
        { role: 'user' as const, content: trimmed },
      ];

      const mentionedProjects = detectProjectMentions(turnsWithCurrentPrompt);

      if (mentionedProjects.length > 0) {
        let currentProjectName: string | undefined;

        if (isContextRegistered()) {
          const ctx = getContext();
          if (ctx.services?.contextDetection) {
            const detected = await ctx.services.contextDetection.detect();
            currentProjectName = detected.project?.name;
          }
        }

        if (currentProjectName) {
          const currentLower = currentProjectName.toLowerCase();
          const mismatchedProjects = mentionedProjects.filter(
            (p) => p.toLowerCase() !== currentLower
          );

          if (mismatchedProjects.length > 0) {
            const analyticsService = getHookAnalyticsService();
            await analyticsService.recordNotification({
              sessionId,
              projectId,
              type: 'scope_mismatch_warning',
              message: `Transcript mentions "${mismatchedProjects.join(', ')}" but current scope is "${currentProjectName}"`,
              severity: 'warning',
              category: 'transcript_analysis',
            });

            logger.info(
              {
                sessionId,
                mentionedProjects: mismatchedProjects,
                currentProject: currentProjectName,
              },
              'Scope mismatch detected in conversation'
            );
          }
        }
      }
    } catch (scopeError) {
      logger.debug(
        { error: scopeError instanceof Error ? scopeError.message : String(scopeError) },
        'Scope mismatch detection failed (non-blocking)'
      );
    }
  }

  return allowed();
}
