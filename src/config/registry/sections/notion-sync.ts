/**
 * Notion Sync Configuration Section
 *
 * Scheduled Notion database sync settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';
import { parseBoolean } from '../parsers.js';

export const notionSyncSection: ConfigSectionMeta = {
  name: 'notionSync',
  description: 'Notion database sync scheduler configuration.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_NOTION_SYNC_ENABLED',
      defaultValue: false,
      description: 'Enable scheduled Notion sync.',
      schema: z.boolean(),
      parse: (envValue, _defaultValue) => {
        if (envValue !== undefined && envValue !== '') {
          return parseBoolean(envValue, false);
        }
        // Fall back to true if schedule is set
        return !!process.env.AGENT_MEMORY_NOTION_SYNC_SCHEDULE;
      },
    },
    schedule: {
      envKey: 'AGENT_MEMORY_NOTION_SYNC_SCHEDULE',
      defaultValue: '0 5 * * *', // 5 AM daily
      description: 'Cron expression for sync schedule. E.g., "0 5 * * *" for daily at 5 AM.',
      schema: z.string(),
    },
    configPath: {
      envKey: 'AGENT_MEMORY_NOTION_SYNC_CONFIG_PATH',
      defaultValue: './notion-sync.config.json',
      description: 'Path to Notion sync config file.',
      schema: z.string(),
    },
  },
};
