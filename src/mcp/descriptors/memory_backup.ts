/**
 * memory_backup tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { backupHandlers } from '../handlers/backup.handler.js';

export const memoryBackupDescriptor: ToolDescriptor = {
  name: 'memory_backup',
  description:
    'Manage database backups. Actions: create (create backup), list (list all backups), cleanup (remove old backups), restore (restore from backup)',
  commonParams: {
    admin_key: { type: 'string', description: 'Admin key (required)' },
    name: {
      type: 'string',
      description: 'Custom backup name (create, optional)',
    },
    keepCount: {
      type: 'number',
      description: 'Number of backups to keep (cleanup, default: 5)',
    },
    filename: {
      type: 'string',
      description: 'Backup filename to restore (restore)',
    },
  },
  actions: {
    create: { handler: backupHandlers.create },
    list: { handler: backupHandlers.list },
    cleanup: { handler: backupHandlers.cleanup },
    restore: { handler: backupHandlers.restore },
  },
};
