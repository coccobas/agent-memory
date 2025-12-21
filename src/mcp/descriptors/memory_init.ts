/**
 * memory_init tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { initHandlers } from '../handlers/init.handler.js';

export const memoryInitDescriptor: ToolDescriptor = {
  name: 'memory_init',
  description:
    'Manage database initialization and migrations. Actions: init (initialize/migrate), status (check migration status), reset (reset database - WARNING: deletes all data)',
  commonParams: {
    admin_key: { type: 'string', description: 'Admin key (required for init/reset)' },
    force: {
      type: 'boolean',
      description: 'Force re-initialization even if already initialized (init)',
    },
    verbose: { type: 'boolean', description: 'Enable verbose output (init, reset)' },
    confirm: {
      type: 'boolean',
      description:
        'Confirm database reset - required for reset action. WARNING: This deletes all data!',
    },
  },
  actions: {
    init: { handler: initHandlers.init },
    status: { handler: initHandlers.status },
    reset: { handler: initHandlers.reset },
  },
};
