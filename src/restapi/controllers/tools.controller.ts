import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../core/context.js';
import { allDescriptors } from '../../mcp/descriptors/index.js';
import { isActionBasedDescriptor } from '../../mcp/descriptors/types.js';
import { executeRestTool } from '../adapters/mcp-rest-adapter.js';
import { isObject, isString } from '../../utils/type-guards.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('tools-controller');

/**
 * Tool metadata for listing endpoint
 */
interface ToolMetadata {
  name: string;
  description: string;
  actions?: string[];
  hasActions: boolean;
}

/**
 * Request body for tool execution
 */
interface ExecuteToolBody {
  action?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Controller for MCP tools REST API
 *
 * Provides endpoints to:
 * - List all available MCP tools
 * - Execute any MCP tool via HTTP
 */
export class ToolsController {
  private static readonly validToolNames = new Set(allDescriptors.map((d) => d.name));

  constructor(private context: AppContext) {
    logger.debug({ toolCount: ToolsController.validToolNames.size }, 'ToolsController initialized');
  }

  /**
   * GET /api/tools
   *
   * Lists all available MCP tools with their metadata
   */
  async listTools(_request: FastifyRequest, reply: FastifyReply) {
    logger.debug('Listing all tools');

    const tools: ToolMetadata[] = allDescriptors.map((descriptor) => {
      const metadata: ToolMetadata = {
        name: descriptor.name,
        description: descriptor.description,
        hasActions: isActionBasedDescriptor(descriptor),
      };

      // Add actions list for action-based tools
      if (isActionBasedDescriptor(descriptor)) {
        metadata.actions = Object.keys(descriptor.actions);
      }

      return metadata;
    });

    return reply.send({
      tools,
      count: tools.length,
    });
  }

  /**
   * POST /api/tools/:tool
   *
   * Executes an MCP tool via REST
   *
   * Body parameters:
   * - action?: string - Action to perform (for action-based tools)
   * - params?: object - Tool parameters
   * - ...rest - Additional params merged into params object
   *
   * Headers:
   * - x-agent-id: Agent ID for write operations (optional, extracted from request)
   */
  async executeTool(request: FastifyRequest<{ Params: { tool: string } }>, reply: FastifyReply) {
    // Sanitize and validate tool name
    const toolName = request.params.tool?.trim() ?? '';

    // Validate tool name format (only letters and underscores)
    if (!toolName || !/^[a-z_]+$/i.test(toolName)) {
      logger.warn({ toolName }, 'Invalid tool name format');
      return reply.status(400).send({
        success: false,
        error: {
          message: 'Invalid tool name format. Tool names may only contain letters and underscores.',
          code: 'INVALID_PARAMETER',
        },
      });
    }

    logger.debug({ toolName }, 'Executing tool');

    // Validate tool name exists
    if (!ToolsController.validToolNames.has(toolName)) {
      logger.warn({ toolName }, 'Tool not found');
      return reply.status(404).send({
        success: false,
        error: {
          message: `Tool "${toolName}" not found`,
          code: 'NOT_FOUND',
        },
      });
    }

    // Validate request body
    const body = request.body;
    if (!isObject(body)) {
      return reply.status(400).send({
        success: false,
        error: {
          message: 'Request body must be an object',
          code: 'INVALID_PARAMETER',
        },
      });
    }

    // Extract action and params from body
    const executeBody = body as ExecuteToolBody;
    const action = executeBody.action && isString(executeBody.action) ? executeBody.action : undefined;

    // Build params object from body
    // If params is provided, use it; otherwise use the entire body (excluding action)
    let params: Record<string, unknown>;
    if (executeBody.params && isObject(executeBody.params)) {
      params = executeBody.params;
    } else {
      // Merge all body fields except 'action' into params
      const { action: _, params: __, ...rest } = executeBody;
      params = rest;
    }

    // Get agent ID from request (set by authentication middleware or security hook)
    const agentId = request.agentId;

    // Execute tool via adapter
    const response = await executeRestTool(this.context, {
      toolName,
      action,
      params,
      agentId,
    });

    // Send response with appropriate status code
    return reply.status(response.status).send(response.body);
  }
}
