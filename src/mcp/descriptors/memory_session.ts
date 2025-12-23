/**
 * memory_session tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { scopeHandlers } from '../handlers/scopes.handler.js';
import type { SessionStartParams, SessionEndParams, SessionListParams } from '../types.js';

export const memorySessionDescriptor: ToolDescriptor = {
  name: 'memory_session',
  description: `Manage working sessions (group related work together).

Actions: start, end, list

Workflow: Start a session at beginning of a task, end when complete. Sessions group related memory entries.
Example: {"action":"start","projectId":"proj-123","name":"Add auth feature","purpose":"Implement user authentication"}`,
  commonParams: {
    projectId: { type: 'string', description: 'Parent project ID (start)' },
    name: { type: 'string', description: 'Session name (start)' },
    purpose: { type: 'string', description: 'Session purpose (start)' },
    agentId: { type: 'string', description: 'Agent/IDE identifier (start)' },
    metadata: { type: 'object', description: 'Session metadata (start)' },
    id: { type: 'string', description: 'Session ID (end)' },
    status: {
      type: 'string',
      enum: ['completed', 'discarded', 'active', 'paused'],
      description: 'End status (end) or filter (list)',
    },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    start: {
      contextHandler: (ctx, p) => scopeHandlers.sessionStart(ctx, p as unknown as SessionStartParams),
    },
    end: {
      contextHandler: (ctx, p) => scopeHandlers.sessionEnd(ctx, p as unknown as SessionEndParams),
    },
    list: {
      contextHandler: (ctx, p) => scopeHandlers.sessionList(ctx, p as unknown as SessionListParams),
    },
  },
};
