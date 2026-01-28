/**
 * notion_sync MCP Descriptor
 *
 * Describes the Notion sync tool for manual sync triggering and status checking.
 */

import type { ToolDescriptor } from './types.js';
import { notionSyncHandlers } from '../handlers/notion-sync.handler.js';

// =============================================================================
// DESCRIPTOR
// =============================================================================

export const notionSyncDescriptor: ToolDescriptor = {
  name: 'notion_sync',
  visibility: 'standard',
  description: `Sync Notion databases to Agent Memory tasks. Actions: sync, status, list_databases

Actions:
- sync: Trigger manual sync of Notion databases to Agent Memory tasks
- status: Get scheduler and sync configuration status
- list_databases: List configured Notion databases

Example: {"action":"sync"}
Example: {"action":"sync","databaseId":"abc123-def456-..."}
Example: {"action":"status"}
Example: {"action":"list_databases"}`,
  commonParams: {
    databaseId: {
      type: 'string',
      description: 'Notion database ID to sync (optional, syncs all if not provided)',
    },
    configPath: {
      type: 'string',
      description: 'Path to notion-sync.config.json (optional, uses default location)',
    },
  },
  actions: {
    sync: {
      params: {
        fullSync: {
          type: 'boolean',
          description: 'Force full sync (ignore lastSyncTimestamp)',
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview sync without making changes',
        },
      },
      contextHandler: notionSyncHandlers.sync,
    },
    status: {
      contextHandler: notionSyncHandlers.status,
    },
    list_databases: {
      contextHandler: notionSyncHandlers.list_databases,
    },
  },
};
