/**
 * Backup Configuration Section
 *
 * Backup scheduler settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';
import { parseBoolean } from '../parsers.js';

export const backupSection: ConfigSectionMeta = {
  name: 'backup',
  description: 'Backup scheduler configuration.',
  options: {
    schedule: {
      envKey: 'AGENT_MEMORY_BACKUP_SCHEDULE',
      defaultValue: '',
      description:
        'Cron expression for scheduled backups. E.g., "0 0 * * *" for daily at midnight.',
      schema: z.string(),
    },
    retentionCount: {
      envKey: 'AGENT_MEMORY_BACKUP_RETENTION',
      defaultValue: 5,
      description: 'Number of backups to retain.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    enabled: {
      envKey: 'AGENT_MEMORY_BACKUP_ENABLED',
      defaultValue: false,
      description: 'Enable backup scheduler. Defaults to true if schedule is set.',
      schema: z.boolean(),
      // Custom: defaults to true if schedule is set
      parse: (envValue, _defaultValue) => {
        if (envValue !== undefined && envValue !== '') {
          return parseBoolean(envValue, false);
        }
        // Fall back to true if schedule is set
        return !!process.env.AGENT_MEMORY_BACKUP_SCHEDULE;
      },
    },
  },
};
