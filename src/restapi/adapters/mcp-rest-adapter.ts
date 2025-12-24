import type { AppContext } from '../../core/context.js';
import { GENERATED_HANDLERS } from '../../mcp/descriptors/index.js';
import { mapError } from '../../utils/error-mapper.js';
import { createComponentLogger } from '../../utils/logger.js';
import { isObject } from '../../utils/type-guards.js';

const logger = createComponentLogger('mcp-rest-adapter');

/**
 * Request interface for REST tool execution
 */
export interface RestToolRequest {
  /** Name of the MCP tool to execute (e.g., 'memory_project', 'memory_query') */
  toolName: string;
  /** Optional action for action-based tools (e.g., 'create', 'list', 'search') */
  action?: string;
  /** Parameters to pass to the tool handler */
  params: Record<string, unknown>;
  /** Optional agent ID for write operations */
  agentId?: string;
}

/**
 * Response interface for REST tool execution
 */
export interface RestToolResponse {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data if successful */
  data?: unknown;
  /** Error details if failed */
  error?: {
    message: string;
    code: string;
    details?: Record<string, unknown>;
  };
}

/**
 * HTTP response with status code and body
 */
export interface RestToolHttpResponse {
  status: number;
  body: RestToolResponse;
}

/**
 * Execute an MCP tool via REST adapter
 *
 * This adapter:
 * 1. Looks up the handler from GENERATED_HANDLERS
 * 2. Merges action and agentId into params if provided
 * 3. Executes the context-aware handler
 * 4. Maps errors to standardized HTTP responses
 *
 * @param context - Application context with dependencies
 * @param request - Tool execution request
 * @returns HTTP response with status code and JSON body
 */
export async function executeRestTool(
  context: AppContext,
  request: RestToolRequest
): Promise<RestToolHttpResponse> {
  const { toolName, action, params, agentId } = request;

  logger.debug({ toolName, action, hasAgentId: !!agentId }, 'Executing REST tool');

  // Look up handler in GENERATED_HANDLERS
  const handler = GENERATED_HANDLERS[toolName];
  if (!handler) {
    logger.warn({ toolName }, 'Tool not found');
    return {
      status: 404,
      body: {
        success: false,
        error: {
          message: `Tool "${toolName}" not found`,
          code: 'NOT_FOUND',
        },
      },
    };
  }

  try {
    // Validate params is an object before processing
    if (!isObject(params)) {
      logger.warn({ toolName, params }, 'Invalid params type');
      return {
        status: 400,
        body: {
          success: false,
          error: {
            message: 'Parameters must be an object',
            code: 'INVALID_PARAMETER',
          },
        },
      };
    }

    // Build complete params object
    const handlerParams: Record<string, unknown> = { ...params };

    // Merge action if provided (for action-based tools)
    if (action) {
      handlerParams.action = action;
    }

    // Add agentId if provided (required for write operations)
    if (agentId) {
      handlerParams.agentId = agentId;
    }

    // Execute handler with context and merged params
    const result = await handler(context, handlerParams);

    logger.debug({ toolName, action }, 'Tool executed successfully');

    return {
      status: 200,
      body: {
        success: true,
        data: result,
      },
    };
  } catch (error) {
    // Map error to standardized format
    const mappedError = mapError(error);

    logger.error(
      {
        toolName,
        action,
        error: mappedError.message,
        code: mappedError.code,
      },
      'Tool execution failed'
    );

    return {
      status: mappedError.statusCode,
      body: {
        success: false,
        error: {
          message: mappedError.message,
          code: mappedError.code,
          details: mappedError.details,
        },
      },
    };
  }
}
