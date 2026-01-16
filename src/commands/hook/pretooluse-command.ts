import { verifyAction } from '../../services/verification.service.js';
import { getDb } from '../../db/connection.js';
import {
  getMemoryInjectionService,
  type InjectionFormat,
} from '../../services/memory-injection.service.js';
import { createComponentLogger } from '../../utils/logger.js';
import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { extractProposedActionFromTool } from './shared.js';

const logger = createComponentLogger('pretooluse');

/**
 * Configuration for PreToolUse context injection
 */
export interface PreToolUseConfig {
  /** Enable context injection (default: from AGENT_MEMORY_INJECT_CONTEXT env or true) */
  injectContext: boolean;
  /** Format for injected context (default: from AGENT_MEMORY_CONTEXT_FORMAT env or 'markdown') */
  contextFormat: InjectionFormat;
  /** Maximum entries to inject (default: from AGENT_MEMORY_CONTEXT_MAX_ENTRIES env or 5) */
  contextMaxEntries: number;
  /** Output context to stdout for Claude (default: true) */
  contextToStdout: boolean;
  /** Output context summary to stderr for user (default: true) */
  contextToStderr: boolean;
}

/**
 * Get configuration from environment variables and overrides
 */
function getConfig(overrides?: Partial<PreToolUseConfig>): PreToolUseConfig {
  const envInjectContext = process.env.AGENT_MEMORY_INJECT_CONTEXT;
  const envContextFormat = process.env.AGENT_MEMORY_CONTEXT_FORMAT;
  const envContextMaxEntries = process.env.AGENT_MEMORY_CONTEXT_MAX_ENTRIES;

  // Bug #275 fix: Validate format instead of unsafe type assertion
  const validFormats = ['markdown', 'json', 'natural_language'] as const;
  const validatedFormat =
    envContextFormat && validFormats.includes(envContextFormat as InjectionFormat)
      ? (envContextFormat as InjectionFormat)
      : undefined;

  // Bug #274 fix: Validate parseInt result to handle NaN and decimals
  let parsedMaxEntries: number | undefined;
  if (envContextMaxEntries) {
    const parsed = parseInt(envContextMaxEntries, 10);
    parsedMaxEntries = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return {
    injectContext:
      overrides?.injectContext ?? (envInjectContext !== 'false' && envInjectContext !== '0'),
    contextFormat: overrides?.contextFormat ?? validatedFormat ?? 'markdown',
    contextMaxEntries: overrides?.contextMaxEntries ?? parsedMaxEntries ?? 5,
    contextToStdout: overrides?.contextToStdout ?? true,
    contextToStderr: overrides?.contextToStderr ?? true,
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

  // Collect output
  const stdout: string[] = [];
  const stderr: string[] = [];

  // Step 1: Context Injection (if enabled)
  if (config.injectContext) {
    try {
      const injectionService = getMemoryInjectionService(db);
      const injectionResult = await injectionService.getContext({
        toolName,
        toolParams,
        sessionId: sessionId ?? undefined,
        projectId,
        agentId,
        format: config.contextFormat,
        maxEntries: config.contextMaxEntries,
      });

      if (injectionResult.success && injectionResult.injectedContext) {
        logger.debug(
          {
            entriesCount: injectionResult.entries.length,
            processingTimeMs: injectionResult.processingTimeMs,
            intent: injectionResult.detectedIntent,
          },
          'Context injection successful'
        );

        // Output to stdout for Claude to receive
        if (config.contextToStdout && injectionResult.injectedContext) {
          stdout.push(injectionResult.injectedContext);
        }

        // Output summary to stderr for user visibility
        if (config.contextToStderr && injectionResult.entries.length > 0) {
          const types = injectionResult.entries.map((e) => e.type);
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
          stderr.push(`[agent-memory] Injected: ${summary}`);
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

  // Return with any injected context
  return { exitCode: 0, stdout, stderr };
}
