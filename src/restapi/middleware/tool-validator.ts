import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  allDescriptors,
  isActionBasedDescriptor,
  type AnyToolDescriptor,
} from '../../mcp/descriptors/index.js';
import { isObject } from '../../utils/type-guards.js';

/**
 * Build a lookup map of tool name -> descriptor
 */
const descriptorMap = new Map<string, AnyToolDescriptor>(allDescriptors.map((d) => [d.name, d]));

/**
 * Validation middleware for tool execution requests
 *
 * Validates:
 * - Tool existence (deferred to controller for 404 handling)
 * - Action parameter presence for action-based tools
 * - Action value validity against allowed actions
 *
 * Returns 400 with helpful error messages for validation failures
 */
export async function validateToolRequest(
  request: FastifyRequest<{ Params: { tool: string } }>,
  reply: FastifyReply
): Promise<void> {
  const toolName = request.params.tool;
  const descriptor = descriptorMap.get(toolName);

  // If tool not found, let controller handle 404
  if (!descriptor) {
    return;
  }

  // For action-based tools, validate action parameter
  if (isActionBasedDescriptor(descriptor)) {
    const body = request.body;

    // Validate body is an object
    if (!isObject(body)) {
      await reply.status(400).send({
        success: false,
        error: {
          message: 'Request body must be an object',
          code: 'INVALID_REQUEST_BODY',
        },
      });
      return;
    }

    const action = body.action;

    // Validate action is provided
    if (action === undefined || action === null) {
      const validActions = Object.keys(descriptor.actions);
      await reply.status(400).send({
        success: false,
        error: {
          message: `Missing required parameter 'action' for tool '${toolName}'`,
          code: 'MISSING_ACTION',
          details: {
            validActions,
          },
        },
      });
      return;
    }

    // Validate action is a string
    if (typeof action !== 'string') {
      await reply.status(400).send({
        success: false,
        error: {
          message: `Parameter 'action' must be a string`,
          code: 'INVALID_ACTION_TYPE',
        },
      });
      return;
    }

    // Validate action is valid for this tool
    if (!descriptor.actions[action]) {
      const validActions = Object.keys(descriptor.actions);
      await reply.status(400).send({
        success: false,
        error: {
          message: `Invalid action '${action}' for tool '${toolName}'`,
          code: 'INVALID_ACTION',
          details: {
            providedAction: action,
            validActions,
          },
        },
      });
      return;
    }
  }

  // Validation passed, continue to handler
}
