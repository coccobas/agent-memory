import type { SimpleToolDescriptor } from '../types.js';
import { handleV2MemoryNotionIngest } from '../../../v2/mcp/notion-ingest-handler.js';

export const memoryNotionIngestDescriptor: SimpleToolDescriptor = {
  name: 'memory_notion_ingest',
  visibility: 'standard',
  description:
    'Import Notion pages as memory entries. Accepts pre-fetched content from notion-fetch. Supports batch import with dedup.',
  params: {
    pages: {
      type: 'array',
      description: 'Array of Notion pages to import',
      items: {
        type: 'object',
        properties: {
          pageId: { type: 'string', description: 'Notion page UUID (used for dedup)' },
          title: { type: 'string', description: 'Page title' },
          content: { type: 'string', description: 'Page markdown content from notion-fetch' },
          url: { type: 'string', description: 'Notion page URL (optional)' },
          entryType: {
            type: 'string',
            enum: ['guideline', 'knowledge', 'tool'],
            description: 'Override auto-detection of entry type',
          },
          category: { type: 'string', description: 'Override auto-categorization' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Additional tags' },
        },
        required: ['pageId', 'title', 'content'],
      },
    },
    projectId: {
      type: 'string',
      description: 'Target project (auto-detected from cwd if omitted)',
    },
  },
  required: ['pages'],
  contextHandler: (context, params) => handleV2MemoryNotionIngest(context, params),
};
