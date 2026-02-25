import type { SimpleToolDescriptor } from '../types.js';
import { handleV2MemoryOpenWebUIIngest } from '../../../v2/mcp/openwebui-ingest-handler.js';

export const memoryOpenWebUIIngestDescriptor: SimpleToolDescriptor = {
  name: 'memory_openwebui_ingest',
  visibility: 'standard',
  description:
    'Import Open WebUI documents as memory entries. Accepts content fetched via pipelines. Supports chat histories, knowledge docs, and pipeline outputs with dedup.',
  params: {
    documents: {
      type: 'array',
      description: 'Array of Open WebUI documents to import',
      items: {
        type: 'object',
        properties: {
          docId: { type: 'string', description: 'Document or chat UUID (used for dedup)' },
          title: { type: 'string', description: 'Document title or chat summary' },
          content: { type: 'string', description: 'Document content or chat messages' },
          url: { type: 'string', description: 'Open WebUI URL (optional)' },
          pipelineName: {
            type: 'string',
            description: 'Source pipeline name (optional, stored in metadata)',
          },
          modelId: {
            type: 'string',
            description: 'Model used in conversation (optional, stored in metadata)',
          },
          entryType: {
            type: 'string',
            enum: ['guideline', 'knowledge', 'tool'],
            description: 'Override auto-detection of entry type',
          },
          category: { type: 'string', description: 'Override auto-categorization' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Additional tags' },
        },
        required: ['docId', 'title', 'content'],
      },
    },
    projectId: {
      type: 'string',
      description: 'Target project (auto-detected from cwd if omitted)',
    },
  },
  required: ['documents'],
  contextHandler: (context, params) => handleV2MemoryOpenWebUIIngest(context, params),
};
