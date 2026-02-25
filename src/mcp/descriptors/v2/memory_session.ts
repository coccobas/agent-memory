import type { ToolDescriptor } from '../types.js';
import { handleV2MemorySession } from '../../../v2/mcp/session-handler.js';

export const memorySessionDescriptor: ToolDescriptor = {
  name: 'memory_session',
  visibility: 'core',
  description:
    'Manage sessions as v2 scopes. Actions: start (deprecated), end (deprecated), list. Use memory_topic for new workflows.',
  commonParams: {
    projectId: { type: 'string', description: 'Project external ID' },
    sessionScopeId: { type: 'string', description: 'Session scope ID (for end action)' },
    name: { type: 'string', description: 'Session name (for start action)' },
    purpose: { type: 'string' },
    agentId: { type: 'string' },
    includeArchived: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    start: {
      contextHandler: (context, params) =>
        handleV2MemorySession(context, { action: 'start', ...params }),
    },
    end: {
      contextHandler: (context, params) =>
        handleV2MemorySession(context, { action: 'end', ...params }),
    },
    list: {
      contextHandler: (context, params) =>
        handleV2MemorySession(context, { action: 'list', ...params }),
    },
  },
};
