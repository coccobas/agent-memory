import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { formatOutput } from '../utils/compact-formatter.js';
import { logger } from '../utils/logger.js';
import { GENERATED_HANDLERS } from './descriptors/index.js';
import type { AppContext } from '../core/context.js';
import { mapError } from '../utils/error-mapper.js';
import { createInvalidActionError, formatError } from './errors.js';
import { TOOL_LABELS } from './constants.js';
import type { DetectedContext } from '../services/context-detection.service.js';

/**
 * Build a compact badge string from detected context
 * Format: "[Project: name | Session: status]"
 */
function buildContextBadge(ctx: DetectedContext): string {
  const parts: string[] = [];

  if (ctx.project) {
    // Truncate project name to 20 chars
    const name = ctx.project.name.length > 20
      ? ctx.project.name.slice(0, 17) + '...'
      : ctx.project.name;
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
 * Execute a tool by name with arguments
 * Handles rate limiting, database availability, and error formatting
 */
export async function runTool(
  context: AppContext,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
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

  try {
    // Auto-enrich parameters with detected context (project, session, agentId)
    let enrichedArgs = args ?? {};
    let detectedContext: DetectedContext | undefined;

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

    // Add _context and _badge to response if auto-detection was used
    const finalResult =
      detectedContext && typeof result === 'object' && result !== null
        ? { ...result, _context: { ...detectedContext, _badge: buildContextBadge(detectedContext) } }
        : result;

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

    return {
      content: [
        {
          type: 'text',
          text: formattedResult,
        },
      ],
    };
  } catch (error) {
    logger.error(
      {
        tool: name,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Tool call error'
    );

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
 */
function inferSessionName(
  toolName: string,
  _action: string,
  args: Record<string, unknown>,
  defaultName: string
): string {
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
    const firstLine = content.split('\n').find(line => line.trim().length > 0)?.trim();
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

  // Bug #183 fix: Validate action is a string instead of unsafe type assertion
  const action = typeof args.action === 'string' ? args.action : undefined;
  if (!action || !WRITE_ACTIONS.has(action)) {
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
    const sessionName = inferSessionName(toolName, action, args, context.config.autoContext.autoSessionName);
    const session = await context.repos.sessions.create({
      projectId,
      name: sessionName,
      purpose: `Auto-created for ${toolName} action:${action}`,
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
