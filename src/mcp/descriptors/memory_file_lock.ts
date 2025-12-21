/**
 * memory_file_lock tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { fileLockHandlers } from '../handlers/file_locks.handler.js';
import type {
  FileCheckoutParams,
  FileCheckinParams,
  FileLockStatusParams,
  FileLockListParams,
  FileLockForceUnlockParams,
} from '../types.js';

export const memoryFileLockDescriptor: ToolDescriptor = {
  name: 'memory_file_lock',
  description:
    'Manage file locks for multi-agent coordination. Actions: checkout, checkin, status, list, force_unlock',
  commonParams: {
    file_path: { type: 'string', description: 'Absolute filesystem path to the file' },
    agent_id: { type: 'string', description: 'Agent/IDE identifier' },
    session_id: { type: 'string', description: 'Optional session reference' },
    project_id: { type: 'string', description: 'Optional project reference' },
    expires_in: { type: 'number', description: 'Lock timeout in seconds (default 3600)' },
    metadata: { type: 'object', description: 'Optional metadata' },
    reason: { type: 'string', description: 'Reason for force unlock' },
  },
  actions: {
    checkout: {
      handler: (p) => fileLockHandlers.checkout(p as unknown as FileCheckoutParams),
    },
    checkin: {
      handler: (p) => fileLockHandlers.checkin(p as unknown as FileCheckinParams),
    },
    status: {
      handler: (p) => fileLockHandlers.status(p as unknown as FileLockStatusParams),
    },
    list: {
      handler: (p) => fileLockHandlers.list(p as unknown as FileLockListParams),
    },
    force_unlock: {
      handler: (p) => fileLockHandlers.forceUnlock(p as unknown as FileLockForceUnlockParams),
    },
  },
};
