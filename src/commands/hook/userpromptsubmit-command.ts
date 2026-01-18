import type { ClaudeHookInput, HookCommandResult } from './types.js';
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

const logger = createComponentLogger('userpromptsubmit');

/**
 * Configuration for UserPromptSubmit hook
 */
export interface UserPromptSubmitConfig {
  /** Enable natural language trigger detection (default: true) */
  enableNaturalLanguageTriggers: boolean;
  /** Enable analytics recording (default: true) */
  recordAnalytics: boolean;
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

  return {
    enableNaturalLanguageTriggers:
      overrides?.enableNaturalLanguageTriggers ??
      (envNaturalLanguage !== 'false' && envNaturalLanguage !== '0'),
    recordAnalytics:
      overrides?.recordAnalytics ?? (envRecordAnalytics !== 'false' && envRecordAnalytics !== '0'),
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
      const excerpt = (start > 0 ? '...' : '') + prompt.slice(start, end).trim() + (end < prompt.length ? '...' : '');

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
  trigger: MemoryTriggerResult
): Promise<void> {
  try {
    const analyticsService = getHookAnalyticsService();

    // Record the trigger detection as a notification metric
    await analyticsService.recordNotification({
      sessionId,
      projectId,
      type: 'memory_trigger_detected',
      message: `${trigger.type}: ${trigger.excerpt ?? prompt.slice(0, 100)}`,
      severity: 'info',
      category: 'natural_language_trigger',
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
  if (config.enableNaturalLanguageTriggers && trimmed.length > 10) {
    const trigger = detectMemoryTriggers(trimmed);

    if (trigger.detected) {
      // Ensure session exists before marking for capture
      await ensureSessionIdExists(sessionId, projectId);

      // Mark for capture (non-blocking, doesn't prevent the prompt)
      await markForCapture(sessionId, projectId, trimmed, trigger);
    }
  }

  // Allow the prompt to proceed
  return allowed();
}
