
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { formatOutput } from '../utils/compact-formatter.js';
import { logger } from '../utils/logger.js';
import { GENERATED_HANDLERS } from './descriptors/index.js';
import type { AppContext } from '../core/context.js';
import { mapError } from '../utils/error-mapper.js';
import { createInvalidActionError, formatError } from './errors.js';

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
  const securityResult = context.security.validateRequest({
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
    const result = await handler(context, args ?? {});
    logger.debug({ tool: name }, 'Tool call successful');

    // Format result based on output mode (compact or JSON)
    let formattedResult: string;
    try {
      formattedResult = formatOutput(result);
    } catch (fmtError) {
      logger.error({ tool: name, error: fmtError }, 'Output formatting error');
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
          text: JSON.stringify({
            error: mapped.message,
            code: mapped.code,
            context: mapped.details
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
