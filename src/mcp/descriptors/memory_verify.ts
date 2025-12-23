/**
 * memory_verify tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { verificationHandlers } from '../handlers/verification.handler.js';

export const memoryVerifyDescriptor: ToolDescriptor = {
  name: 'memory_verify',
  description: `Verify actions against critical guidelines with active intervention.

Actions:
- pre_check: REQUIRED before file modifications or code generation. Returns {blocked: true} if violation detected.
- post_check: Log completed action for compliance tracking
- acknowledge: Acknowledge critical guidelines for session
- status: Get verification status for a session

IMPORTANT: Agents MUST call pre_check before significant actions.
If blocked=true is returned, DO NOT proceed with the action.`,
  commonParams: {
    sessionId: {
      type: 'string',
      description: 'Current session ID',
    },
    projectId: {
      type: 'string',
      description: 'Project ID (optional, derived from session if not provided)',
    },
    proposedAction: {
      type: 'object',
      description: 'Action to verify (pre_check)',
      properties: {
        type: {
          type: 'string',
          enum: ['file_write', 'code_generate', 'api_call', 'command', 'other'],
          description: 'Type of action',
        },
        description: { type: 'string', description: 'Description of action' },
        filePath: { type: 'string', description: 'File path (if applicable)' },
        content: { type: 'string', description: 'Content being created/modified' },
        metadata: { type: 'object', description: 'Additional metadata' },
      },
      required: ['type'],
    },
    completedAction: {
      type: 'object',
      description: 'Completed action to log (post_check)',
    },
    content: {
      type: 'string',
      description: 'Response content to verify (post_check alternative)',
    },
    guidelineIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Guideline IDs to acknowledge (acknowledge)',
    },
    agentId: {
      type: 'string',
      description: 'Agent identifier',
    },
  },
  actions: {
    pre_check: { contextHandler: verificationHandlers.preCheck },
    post_check: { contextHandler: verificationHandlers.postCheck },
    acknowledge: { contextHandler: verificationHandlers.acknowledge },
    status: { contextHandler: verificationHandlers.status },
  },
};
