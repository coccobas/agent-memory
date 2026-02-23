import type { ToolDescriptor } from './types.js';
import { handleV2MemoryProjector } from '../../v2/mcp/index.js';

export const memoryProjectorDescriptor: ToolDescriptor = {
  name: 'memory_projector',
  visibility: 'core',
  description: 'Manage V2 outbox projector. Actions: status, drain_once, replay_range',
  commonParams: {
    limit: { type: 'number' },
    fromSeq: { type: 'number' },
    toSeq: { type: 'number' },
  },
  actions: {
    status: {
      contextHandler: (context, params) =>
        handleV2MemoryProjector(context, { action: 'status', ...params }),
    },
    drain_once: {
      contextHandler: (context, params) =>
        handleV2MemoryProjector(context, { action: 'drain_once', ...params }),
    },
    replay_range: {
      contextHandler: (context, params) =>
        handleV2MemoryProjector(context, { action: 'replay_range', ...params }),
    },
  },
};
