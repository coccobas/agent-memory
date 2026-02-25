import type { ToolDescriptor } from '../types.js';
import { handleV2TranscriptSearch } from '../../../v2/mcp/transcript-search-handler.js';

export const memoryTranscriptSearchDescriptor: ToolDescriptor = {
  name: 'memory_transcript_search',
  visibility: 'standard',
  description:
    'Search conversation transcripts and trace entry provenance. Actions: search, provenance',
  commonParams: {
    scope: {
      type: 'object',
      description: 'Scope filter (project only)',
      properties: {
        type: { type: 'string', enum: ['project'] },
        id: { type: 'string', description: 'Project external ID' },
      },
      required: ['type', 'id'],
    },
  },
  actions: {
    search: {
      params: {
        query: { type: 'string', description: 'Full-text search query' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
        offset: { type: 'number', description: 'Skip first N results' },
        contextWindow: {
          type: 'number',
          description: 'Messages before/after match to include (default: 2, max: 5)',
        },
        transcriptId: {
          type: 'string',
          description: 'Restrict search to a single transcript',
        },
        roles: {
          type: 'array',
          description: 'Only match messages with these roles (default: user + assistant)',
          items: { type: 'string', enum: ['user', 'assistant'] },
        },
      },
      required: ['query'],
      contextHandler: (context, params) =>
        handleV2TranscriptSearch(context, { action: 'search', ...params }),
    },
    provenance: {
      params: {
        entryId: {
          type: 'string',
          description: 'Entry ID to look up provenance for',
        },
      },
      required: ['entryId'],
      contextHandler: (context, params) =>
        handleV2TranscriptSearch(context, { action: 'provenance', ...params }),
    },
  },
};
