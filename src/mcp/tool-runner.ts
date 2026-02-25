/**
 * V2 Tool Runner — Minimal Dispatcher
 *
 * Simplified from 877 lines to ~80 lines.
 * V2 handlers manage their own scope resolution, session lifecycle,
 * and context detection internally. The tool runner just dispatches.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { formatOutput } from '../utils/compact-formatter.js';
import { logger } from '../utils/logger.js';
import { GENERATED_HANDLERS } from './descriptors/index.js';
import type { AppContext } from '../core/context.js';
import { mapError } from '../utils/error-mapper.js';
import { createInvalidActionError, formatError } from './errors.js';
import { logAction } from '../utils/action-logger.js';

/**
 * Execute a tool by name with arguments.
 * Looks up handler from descriptors, calls it, formats output.
 */
export async function runTool(
  context: AppContext,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
  const startTime = Date.now();
  const action = typeof args?.action === 'string' ? args.action : undefined;

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
      content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }],
      isError: true,
    };
  }

  try {
    const result = await handler(context, args ?? {});
    logger.debug({ tool: name }, 'Tool call successful');

    let formattedResult: string;
    try {
      formattedResult = formatOutput(result);
    } catch (fmtError) {
      logger.warn({ tool: name, error: fmtError }, 'Output formatting error, using fallback');
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

    logAction({
      tool: name,
      action,
      status: 'ok',
      durationMs: Date.now() - startTime,
    });

    return { content: [{ type: 'text', text: formattedResult }] };
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

    logAction({
      tool: name,
      action,
      status: 'error',
      durationMs: Date.now() - startTime,
      error: errorMessage,
    });

    const mapped = mapError(error);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: mapped.message, code: mapped.code, context: mapped.details },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
