import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { formatOutput } from '../utils/compact-formatter.js';
import { logger } from '../utils/logger.js';
import { GENERATED_HANDLERS } from './descriptors/index.js';
import type { AppContext } from '../core/context.js';
import { mapError } from '../utils/error-mapper.js';
import { createInvalidActionError, formatError } from './errors.js';
import { TOOL_LABELS } from './constants.js';
import type { DetectedContext } from '../services/context-detection.service.js';
import { getGitBranch, formatBranchForSession } from '../utils/git.js';
import type { ExtractionSuggestion } from '../services/extraction-hook.service.js';
import type { PendingSuggestion } from '../services/extraction/hybrid-extractor.js';
import { logAction } from '../utils/action-logger.js';
import { getWorkingDirectory } from '../utils/working-directory.js';

/**
 * Build a compact badge string from detected context
 * Format: "[Project: name | Session: status]"
 */
function buildContextBadge(ctx: DetectedContext): string {
  const parts: string[] = [];

  if (ctx.project) {
    // Truncate project name to 20 chars
    const name =
      ctx.project.name.length > 20 ? ctx.project.name.slice(0, 17) + '...' : ctx.project.name;
    parts.push(`Project: ${name}`);
  }

  if (ctx.session) {
    const status = ctx.session.status === 'active' ? '● active' : '○ ' + ctx.session.status;
    parts.push(`Session: ${status}`);
  }

  if (parts.length === 0) {
    return '[Memory: not configured]';
  }

  return `[${parts.join(' | ')}]`;
}

/**
 * Write actions that should trigger auto-session creation
 */
const WRITE_ACTIONS = new Set([
  'add',
  'update',
  'bulk_add',
  'bulk_update',
  'create', // for memory_org/project
  'start', // for memory_session (but we skip this one)
]);

/**
 * Simple tools (no action param) that should trigger auto-session creation
 * These are write operations that don't use the action-based pattern
 */
const SIMPLE_WRITE_TOOLS = new Set([
  'memory_remember', // Natural language storage
]);

/**
 * Tools that should include _context metadata in their response
 * Most tools don't need this - it adds ~500+ tokens of overhead
 */
const CONTEXT_METADATA_TOOLS = new Set(['memory_quickstart', 'memory_status', 'memory_session']);

/**
 * Tools that should be scanned for extraction suggestions
 * These are write operations that may contain storable patterns
 */
const EXTRACTION_SCAN_TOOLS = new Set([
  'memory_remember',
  'memory_guideline',
  'memory_knowledge',
  'memory_tool',
]);

/**
 * Infer a project name from the working directory
 * Uses the last component of the path or the full path for root directories
 */
function inferProjectName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  // Use last component, or 'project' for root
  return parts[parts.length - 1] ?? 'project';
}

/**
 * Simple word-based similarity for duplicate detection
 * Uses Jaccard similarity: |intersection| / |union|
 * Filters out words with 2 or fewer characters to avoid noise
 */
function calculateWordSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

/**
 * Execute a tool by name with arguments
 * Handles rate limiting, database availability, and error formatting
 */
export async function runTool(
  context: AppContext,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
  const startTime = Date.now();
  const action = typeof args?.action === 'string' ? args.action : undefined;

  // 1. Security Check (Rate Limiting + optional Auth)
  const securityResult = await context.security.validateRequest({
    args,
    // For now, MCP tools are often used without explicit auth headers in local context
    // The security service handles this by checking args.agentId if present
  });

  if (!securityResult.authorized) {
    logger.warn({ tool: name, reason: securityResult.error }, 'Security check failed');
    const code =
      securityResult.statusCode === 429
        ? 'RATE_LIMIT_EXCEEDED'
        : securityResult.statusCode === 503
          ? 'SERVICE_UNAVAILABLE'
          : 'UNAUTHORIZED';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: securityResult.error,
              retryAfterMs: securityResult.retryAfterMs,
              code,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  logger.debug({ tool: name, args }, 'Tool call');

  const handler = GENERATED_HANDLERS[name];
  if (!handler) {
    logger.error(
      { tool: name, availableTools: Object.keys(GENERATED_HANDLERS) },
      'Handler not found for tool'
    );
    const errorResponse = formatError(
      createInvalidActionError('MCP', name, Object.keys(GENERATED_HANDLERS))
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse, null, 2),
        },
      ],
      isError: true,
    };
  }

  let detectedContext: DetectedContext | undefined;

  try {
    let enrichedArgs = args ?? {};

    if (context.services.contextDetection && context.config.autoContext.enabled) {
      const enrichment = await context.services.contextDetection.enrichParams(enrichedArgs);
      enrichedArgs = enrichment.enriched;
      detectedContext = enrichment.detected;
      logger.debug(
        {
          tool: name,
          detected: {
            project: detectedContext.project?.id,
            session: detectedContext.session?.id,
            agentId: detectedContext.agentId.value,
          },
        },
        'Auto-context enrichment applied'
      );
    }

    // Auto-project creation for write operations (when no project exists)
    const autoProjectCreated = await maybeAutoCreateProject(
      context,
      name,
      enrichedArgs,
      detectedContext
    );
    if (autoProjectCreated) {
      // Re-enrich params to pick up the new project
      if (context.services.contextDetection && context.config.autoContext.enabled) {
        context.services.contextDetection.clearCache();
        const reEnrichment = await context.services.contextDetection.enrichParams(args ?? {});
        enrichedArgs = reEnrichment.enriched;
        detectedContext = reEnrichment.detected;
      }
    }

    // Auto-session creation for write operations
    const autoSessionCreated = await maybeAutoCreateSession(
      context,
      name,
      enrichedArgs,
      detectedContext
    );
    if (autoSessionCreated) {
      // Re-enrich params to pick up the new session
      if (context.services.contextDetection && context.config.autoContext.enabled) {
        context.services.contextDetection.clearCache();
        const reEnrichment = await context.services.contextDetection.enrichParams(args ?? {});
        enrichedArgs = reEnrichment.enriched;
        detectedContext = reEnrichment.detected;
      }
    }

    const result = await handler(context, enrichedArgs);
    logger.debug({ tool: name }, 'Tool call successful');

    // Record session activity for timeout tracking
    if (context.services.sessionTimeout && detectedContext?.session?.id) {
      context.services.sessionTimeout.recordActivity(detectedContext.session.id);
    }

    // Auto-log tool execution as episode event (if enabled)
    // Fire-and-forget to avoid adding latency to tool response
    if (context.services.episodeAutoLogger?.isEnabled() && detectedContext?.session?.id) {
      // Extract context from the result for richer event logging
      const eventContext = extractEventContext(name, enrichedArgs, result);
      void context.services.episodeAutoLogger.logToolExecution({
        toolName: name,
        action,
        success: true,
        sessionId: detectedContext.session.id,
        context: eventContext,
      });
    }

    // Add _context and _badge to response only for whitelisted tools
    // Most tools don't need this overhead - only status/quickstart/session tools benefit
    const shouldIncludeContext =
      detectedContext !== undefined &&
      typeof result === 'object' &&
      result !== null &&
      CONTEXT_METADATA_TOOLS.has(name);

    // Scan for extraction suggestions on write operations using hybrid extractor
    // Regex fast path (~1ms) + LLM classifier fallback (async, ~100-300ms)
    let suggestions: ExtractionSuggestion[] = [];
    let pendingSuggestions: PendingSuggestion[] = [];
    if (
      context.config.extractionHook.enabled &&
      context.services.hybridExtractor &&
      EXTRACTION_SCAN_TOOLS.has(name) &&
      context.services.extractionHook &&
      !context.services.extractionHook.isCooldownActive()
    ) {
      const contentToScan = extractContentForScanning(args);
      if (contentToScan) {
        try {
          const hybridResult = await context.services.hybridExtractor.extract(contentToScan, {
            sessionId: detectedContext?.session?.id ?? 'unknown',
            projectId: detectedContext?.project?.id,
          });

          if (hybridResult.regexMatches.length > 0) {
            suggestions = hybridResult.regexMatches;
            context.services.extractionHook.recordScan();
            logger.debug(
              {
                tool: name,
                regexMatches: hybridResult.regexMatches.length,
                queuedForLlm: hybridResult.queuedForLlm,
                autoStoreCount: hybridResult.autoStoreCount,
              },
              'Hybrid extraction completed'
            );
          }

          pendingSuggestions = context.services.hybridExtractor.getPendingSuggestions();
        } catch (scanError) {
          logger.debug(
            { error: scanError instanceof Error ? scanError.message : String(scanError) },
            'Hybrid extraction failed (non-fatal)'
          );
        }
      }
    }

    // Build final result with optional metadata
    let finalResult: unknown = result;
    if (typeof result === 'object' && result !== null) {
      finalResult = { ...result };

      // Add context metadata for whitelisted tools
      if (shouldIncludeContext && detectedContext) {
        (finalResult as Record<string, unknown>)._context = {
          ...detectedContext,
          _badge: buildContextBadge(detectedContext),
        };
      }

      // Filter suggestions that are too similar to just-stored content (Issue #5)
      // This prevents suggesting to store what was just stored
      const storedResult = result as { stored?: { title?: string; content?: string } } | null;
      const storedTitle = storedResult?.stored?.title?.toLowerCase() ?? '';
      const storedContent = (
        storedResult?.stored?.content ??
        storedResult?.stored?.title ??
        ''
      ).toLowerCase();

      const filteredSuggestions = suggestions.filter((s) => {
        const suggestionText = s.title.toLowerCase();
        // Filter if >80% similar to stored content
        return (
          calculateWordSimilarity(suggestionText, storedContent) < 0.8 &&
          calculateWordSimilarity(suggestionText, storedTitle) < 0.8
        );
      });

      const filteredPending = pendingSuggestions.filter((s) => {
        const suggestionText = s.title.toLowerCase();
        return (
          calculateWordSimilarity(suggestionText, storedContent) < 0.8 &&
          calculateWordSimilarity(suggestionText, storedTitle) < 0.8
        );
      });

      // Add extraction suggestions if any found after filtering
      if (filteredSuggestions.length > 0 || filteredPending.length > 0) {
        const regexItems = filteredSuggestions.map((s) => ({
          type: s.type,
          title: s.title,
          confidence: s.confidence,
          hash: s.hash,
          source: 'regex' as const,
        }));

        const llmItems = filteredPending.map((s) => ({
          type: s.type,
          title: s.title,
          confidence: s.confidence,
          hash: s.id,
          source: 'llm' as const,
        }));

        const allItems = [...regexItems, ...llmItems];
        (finalResult as Record<string, unknown>)._suggestions = {
          hint: `💡 ${allItems.length} storable pattern${allItems.length > 1 ? 's' : ''} detected. Use memory_extraction_approve to store.`,
          items: allItems,
        };
      }
    }

    // Format result based on output mode (compact or JSON)
    let formattedResult: string;
    try {
      formattedResult = formatOutput(finalResult);
    } catch (fmtError) {
      logger.warn({ tool: name, error: fmtError }, 'Output formatting error, using fallback');
      // Fallback to safe JSON serialization
      formattedResult = JSON.stringify(
        {
          error: 'Failed to format result',
          message: fmtError instanceof Error ? fmtError.message : String(fmtError),
          resultType: typeof result,
        },
        null,
        2
      );
    }

    // Log successful action
    logAction({
      tool: name,
      action,
      status: 'ok',
      durationMs: Date.now() - startTime,
      projectId: detectedContext?.project?.id,
      sessionId: detectedContext?.session?.id,
    });

    return {
      content: [
        {
          type: 'text',
          text: formattedResult,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        tool: name,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Tool call error'
    );

    // Log failed action
    logAction({
      tool: name,
      action,
      status: 'error',
      durationMs: Date.now() - startTime,
      error: errorMessage,
    });

    // Auto-log failure as episode error event
    if (context.services.episodeAutoLogger?.isEnabled() && detectedContext?.session?.id) {
      void context.services.episodeAutoLogger.logToolFailure({
        toolName: name,
        action,
        success: false,
        sessionId: detectedContext.session.id,
        errorMessage,
      });
    }

    // Use unified error mapper
    const mapped = mapError(error);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: mapped.message,
              code: mapped.code,
              context: mapped.details,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Infer a meaningful session name from the operation context
 * Priority: git branch > explicit name/title > content > tool-based name
 */
function inferSessionName(
  toolName: string,
  _action: string,
  args: Record<string, unknown>,
  defaultName: string,
  cwd?: string
): string {
  // First priority: git branch name (most reliable indicator of what user is working on)
  const gitBranch = getGitBranch(cwd);
  if (gitBranch && gitBranch !== 'main' && gitBranch !== 'master') {
    return formatBranchForSession(gitBranch);
  }

  // Try to extract a meaningful name from the args
  const name = args.name as string | undefined;
  const title = args.title as string | undefined;
  const content = args.content as string | undefined;
  const description = args.description as string | undefined;

  // Priority: explicit name/title > first line of content > tool-based name > default
  if (name) {
    return `Working on: ${truncate(name, 40)}`;
  }
  if (title) {
    return `Working on: ${truncate(title, 40)}`;
  }
  if (content) {
    // Extract first meaningful line
    const firstLine = content
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim();
    if (firstLine && firstLine.length > 5) {
      return `Working on: ${truncate(firstLine, 40)}`;
    }
  }
  if (description) {
    return `Working on: ${truncate(description, 40)}`;
  }

  // Fall back to tool-based naming
  return TOOL_LABELS[toolName] ?? defaultName;
}

/**
 * Truncate a string to a max length, adding ellipsis if needed
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Extract context from tool execution for episode event logging
 * Looks for entry type, ID, and name from args and result
 */
function extractEventContext(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown
):
  | { entryType?: string; entryId?: string; entryName?: string; metadata?: Record<string, unknown> }
  | undefined {
  const context: {
    entryType?: string;
    entryId?: string;
    entryName?: string;
    metadata?: Record<string, unknown>;
  } = {};

  // Infer entry type from tool name
  if (toolName === 'memory_guideline') {
    context.entryType = 'guideline';
  } else if (toolName === 'memory_knowledge') {
    context.entryType = 'knowledge';
  } else if (toolName === 'memory_tool') {
    context.entryType = 'tool';
  } else if (toolName === 'memory_experience') {
    context.entryType = 'experience';
  } else if (toolName === 'memory_task') {
    context.entryType = 'task';
  } else if (toolName === 'memory_remember') {
    // memory_remember auto-detects type, try to extract from result
    const resultObj = result as Record<string, unknown> | null;
    context.entryType = (resultObj?.type as string) ?? 'entry';
  }

  // Extract name/title from args
  const name = args.name as string | undefined;
  const title = args.title as string | undefined;
  const text = args.text as string | undefined;
  context.entryName = name ?? title ?? (text ? text.slice(0, 50) : undefined);

  // Extract ID from result
  const resultObj = result as Record<string, unknown> | null;
  if (resultObj) {
    const id = resultObj.id as string | undefined;
    const entryId = resultObj.entryId as string | undefined;
    context.entryId = id ?? entryId;

    // For memory_remember, extract the created entry details from 'stored' field
    if (toolName === 'memory_remember' && resultObj.stored) {
      const stored = resultObj.stored as Record<string, unknown>;
      context.entryId = stored.id as string | undefined;
      context.entryType = (stored.type as string) ?? context.entryType;
      context.entryName = (stored.title as string) ?? context.entryName;
    }

    // For memory_experience with 'learn' action, extract from experience field
    if (toolName === 'memory_experience' && resultObj.experience) {
      const experience = resultObj.experience as Record<string, unknown>;
      context.entryId = experience.id as string | undefined;
      context.entryName = (experience.title as string) ?? context.entryName;
    }

    // For memory_guideline/knowledge/tool with add action, extract from entry-specific field
    if (resultObj.guideline) {
      const guideline = resultObj.guideline as Record<string, unknown>;
      context.entryId = context.entryId ?? (guideline.id as string | undefined);
      context.entryName = context.entryName ?? (guideline.name as string);
    }
    if (resultObj.knowledge) {
      const knowledge = resultObj.knowledge as Record<string, unknown>;
      context.entryId = context.entryId ?? (knowledge.id as string | undefined);
      context.entryName = context.entryName ?? (knowledge.title as string);
    }
    if (resultObj.tool) {
      const tool = resultObj.tool as Record<string, unknown>;
      context.entryId = context.entryId ?? (tool.id as string | undefined);
      context.entryName = context.entryName ?? (tool.name as string);
    }
  }

  // Only return if we have some context
  if (context.entryType || context.entryId || context.entryName) {
    return context;
  }

  return undefined;
}

/**
 * Extract content from tool arguments for extraction scanning
 * Looks for common content-carrying fields
 */
function extractContentForScanning(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;

  // Try various content fields in order of preference
  const contentFields = ['content', 'text', 'description', 'rationale', 'applicability'];

  for (const field of contentFields) {
    const value = args[field];
    if (typeof value === 'string' && value.trim().length > 20) {
      return value;
    }
  }

  // For bulk operations, scan the first entry's content
  const entries = args.entries;
  if (Array.isArray(entries) && entries.length > 0) {
    const firstEntry = entries[0] as Record<string, unknown> | undefined;
    if (firstEntry) {
      for (const field of contentFields) {
        const value = firstEntry[field];
        if (typeof value === 'string' && value.trim().length > 20) {
          return value;
        }
      }
    }
  }

  return null;
}

/**
 * Auto-create a project if:
 * 1. Auto-project is enabled
 * 2. This is a write operation
 * 3. No project exists for the current working directory
 * 4. The tool is not memory_project itself
 *
 * @returns The created project ID if one was created, undefined otherwise
 */
async function maybeAutoCreateProject(
  context: AppContext,
  toolName: string,
  args: Record<string, unknown>,
  detectedContext: DetectedContext | undefined
): Promise<string | undefined> {
  // Check if auto-project is enabled
  if (!context.config.autoContext.autoProject) {
    return undefined;
  }

  // Skip if this is the project tool itself
  if (toolName === 'memory_project' || toolName === 'memory_quickstart') {
    return undefined;
  }

  // Check if this is a write operation (same logic as auto-session)
  const isSimpleWriteTool = SIMPLE_WRITE_TOOLS.has(toolName);
  const action = typeof args.action === 'string' ? args.action : undefined;
  const isWriteAction = action && WRITE_ACTIONS.has(action);

  if (!isSimpleWriteTool && !isWriteAction) {
    return undefined;
  }

  // Check if there's already a project detected
  if (detectedContext?.project?.id) {
    return undefined;
  }

  // Create auto-project
  try {
    const cwd = getWorkingDirectory();
    const projectName = inferProjectName(cwd);

    const project = await context.repos.projects.create({
      name: projectName,
      description: `Auto-created project for ${cwd}`,
      rootPath: cwd,
    });

    logger.info(
      { projectId: project.id, projectName, cwd, tool: toolName },
      'Auto-created project for write operation'
    );

    // Grant basic permissions to the agent
    const agentId = detectedContext?.agentId?.value ?? context.config.autoContext.defaultAgentId;
    const entryTypes = ['guideline', 'knowledge', 'tool'] as const;
    for (const entryType of entryTypes) {
      try {
        context.services.permission.grant({
          agentId,
          scopeType: 'project',
          scopeId: project.id,
          entryType,
          permission: 'write',
        });
      } catch {
        // Non-fatal - permission grant may fail in permissive mode
      }
    }

    return project.id;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to auto-create project'
    );
    return undefined;
  }
}

/**
 * Auto-create a session if:
 * 1. Auto-session is enabled
 * 2. This is a write operation (add, update, bulk_add, etc.)
 * 3. We have a detected project
 * 4. There's no active session
 * 5. The tool is not memory_session itself
 *
 * @returns true if a session was created
 */
async function maybeAutoCreateSession(
  context: AppContext,
  toolName: string,
  args: Record<string, unknown>,
  detectedContext: DetectedContext | undefined
): Promise<boolean> {
  // Check if auto-session is enabled
  if (!context.config.autoContext.autoSession) {
    return false;
  }

  // Skip if this is the session tool itself
  if (toolName === 'memory_session') {
    return false;
  }

  // Check if this is a simple write tool (no action param)
  const isSimpleWriteTool = SIMPLE_WRITE_TOOLS.has(toolName);

  // Bug #183 fix: Validate action is a string instead of unsafe type assertion
  const action = typeof args.action === 'string' ? args.action : undefined;
  const isWriteAction = action && WRITE_ACTIONS.has(action);

  // Must be either a simple write tool or an action-based write
  if (!isSimpleWriteTool && !isWriteAction) {
    return false;
  }

  // Need a detected project
  const projectId = detectedContext?.project?.id;
  if (!projectId) {
    return false;
  }

  // Check if there's already an active session
  if (detectedContext?.session?.id) {
    return false;
  }

  // Create auto-session with smart naming
  try {
    const effectiveAction = action ?? 'store'; // Default action for simple write tools
    const cwd = detectedContext?.project?.rootPath ?? getWorkingDirectory();
    const sessionName = inferSessionName(
      toolName,
      effectiveAction,
      args,
      context.config.autoContext.autoSessionName,
      cwd
    );
    const purposeText = action ? `action:${action}` : 'operation';
    const session = await context.repos.sessions.create({
      projectId,
      name: sessionName,
      purpose: `Auto-created for ${toolName} ${purposeText}`,
      agentId: detectedContext?.agentId?.value ?? context.config.autoContext.defaultAgentId,
    });

    logger.info(
      { sessionId: session.id, projectId, tool: toolName, action },
      'Auto-created session for write operation'
    );

    return true;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), projectId },
      'Failed to auto-create session'
    );
    return false;
  }
}
