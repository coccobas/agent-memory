/**
 * memory_session tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { scopeHandlers } from '../handlers/scopes.handler.js';
import type { SessionStartParams, SessionEndParams, SessionListParams } from '../types.js';

export const memorySessionDescriptor: ToolDescriptor = {
  name: 'memory_session',
  visibility: 'core',
  description: 'Manage working sessions. Actions: start, end, list',
  commonParams: {
    projectId: { type: 'string' },
    name: { type: 'string' },
    purpose: { type: 'string' },
    agentId: { type: 'string' },
    metadata: { type: 'object' },
    id: { type: 'string' },
    status: { type: 'string', enum: ['completed', 'discarded', 'active', 'paused'] },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    start: {
      contextHandler: (ctx, p) =>
        scopeHandlers.sessionStart(ctx, p as unknown as SessionStartParams),
    },
    end: {
      contextHandler: (ctx, p) => scopeHandlers.sessionEnd(ctx, p as unknown as SessionEndParams),
    },
    list: {
      contextHandler: (ctx, p) => scopeHandlers.sessionList(ctx, p as unknown as SessionListParams),
    },
  },
};
