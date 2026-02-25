import type { SimpleToolDescriptor } from '../types.js';
import { handleV2MemoryObserve } from '../../../v2/mcp/observe-handler.js';

export const memoryObserveDescriptor: SimpleToolDescriptor = {
  name: 'memory_observe',
  visibility: 'core',
  description:
    'Ingest conversation messages for automatic knowledge extraction. ' +
    'Send messages during or at end of session. Set isFinal=true to trigger extraction.',
  params: {
    sessionId: {
      type: 'string',
      description: 'Claude session ID (required)',
    },
    messages: {
      type: 'array',
      description: 'Messages to ingest',
      items: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            enum: ['user', 'assistant', 'system', 'tool_use', 'tool_result'],
            description: 'Message role',
          },
          content: { type: 'string', description: 'Message content' },
          toolName: { type: 'string', description: 'Tool name (for tool_use/tool_result)' },
        },
        required: ['role', 'content'],
      },
    },
    isFinal: {
      type: 'boolean',
      description: 'If true, triggers extraction pipeline after storing messages',
    },
    projectId: {
      type: 'string',
      description: 'Override auto-detected project',
    },
    agentId: {
      type: 'string',
      description: 'Agent identifier (default: claude-code)',
    },
  },
  required: ['sessionId'],
  contextHandler: (context, params) => handleV2MemoryObserve(context, params),
};
