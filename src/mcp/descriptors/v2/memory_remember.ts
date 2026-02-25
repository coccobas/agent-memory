import type { SimpleToolDescriptor } from '../types.js';
import { handleV2MemoryRemember } from '../../../v2/mcp/remember-handler.js';

export const memoryRememberDescriptor: SimpleToolDescriptor = {
  name: 'memory_remember',
  visibility: 'core',
  description:
    'Store memories using natural language. Auto-detects type (guideline, knowledge, tool) and category.',
  params: {
    text: { type: 'string', description: 'What to remember' },
    forceType: { type: 'string', enum: ['guideline', 'knowledge', 'tool'] },
    priority: { type: 'number', description: 'Priority 0-100 (default: 50)' },
    tags: { type: 'array', items: { type: 'string' } },
    projectId: { type: 'string' },
    agentId: { type: 'string' },
  },
  required: ['text'],
  contextHandler: (context, params) => handleV2MemoryRemember(context, params),
};
