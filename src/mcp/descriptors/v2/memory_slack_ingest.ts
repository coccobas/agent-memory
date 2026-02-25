import type { SimpleToolDescriptor } from '../types.js';
import { handleV2MemorySlackIngest } from '../../../v2/mcp/slack-ingest-handler.js';

export const memorySlackIngestDescriptor: SimpleToolDescriptor = {
  name: 'memory_slack_ingest',
  visibility: 'standard',
  description:
    'Import Slack threads as memory entries. Accepts pre-fetched content from Slack MCP tools. Supports batch import with dedup.',
  params: {
    threads: {
      type: 'array',
      description: 'Array of Slack threads to import',
      items: {
        type: 'object',
        properties: {
          threadId: { type: 'string', description: 'Slack thread timestamp ID (used for dedup)' },
          title: { type: 'string', description: 'Thread title or summary' },
          content: { type: 'string', description: 'Thread messages content' },
          url: { type: 'string', description: 'Slack permalink (optional)' },
          channelName: {
            type: 'string',
            description: 'Source channel name (optional, stored in metadata)',
          },
          entryType: {
            type: 'string',
            enum: ['guideline', 'knowledge', 'tool'],
            description: 'Override auto-detection of entry type',
          },
          category: { type: 'string', description: 'Override auto-categorization' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Additional tags' },
        },
        required: ['threadId', 'title', 'content'],
      },
    },
    projectId: {
      type: 'string',
      description: 'Target project (auto-detected from cwd if omitted)',
    },
  },
  required: ['threads'],
  contextHandler: (context, params) => handleV2MemorySlackIngest(context, params),
};
