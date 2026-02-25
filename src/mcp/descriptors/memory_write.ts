import type { ToolDescriptor } from './types.js';
import { handleV2MemoryWrite } from '../../v2/mcp/index.js';

export const memoryWriteDescriptor: ToolDescriptor = {
  name: 'memory_write',
  visibility: 'core',
  description:
    'Structured memory writes for V2 core loop. Actions: upsert_entry, delete_entry, upsert_relation, delete_relation, create_scope, archive_scope, tag_entry, untag_entry',
  commonParams: {
    actorId: { type: 'string' },
    correlationId: { type: 'string' },
    entryId: { type: 'string' },
    expectedVersion: { type: 'number' },
    entryType: {
      type: 'string',
      enum: ['guideline', 'knowledge', 'tool', 'experience'],
    },
    reason: { type: 'string' },
    relationId: { type: 'string' },
    relationType: {
      type: 'string',
      enum: [
        'applies_to',
        'depends_on',
        'conflicts_with',
        'related_to',
        'parent_task',
        'subtask_of',
        'promoted_to',
      ],
    },
    source: {
      type: 'object',
      properties: {
        entryType: {
          type: 'string',
          enum: ['guideline', 'knowledge', 'tool', 'experience'],
        },
        entryId: { type: 'string' },
      },
    },
    target: {
      type: 'object',
      properties: {
        entryType: {
          type: 'string',
          enum: ['guideline', 'knowledge', 'tool', 'experience'],
        },
        entryId: { type: 'string' },
      },
    },
    metadata: {
      type: 'object',
      properties: {},
    },
    tag: { type: 'string' },
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session', 'topic'],
    },
    scopeId: { type: 'string' },
    parentScopeId: { type: 'string' },
    label: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['guideline', 'knowledge', 'tool', 'experience'],
        },
        title: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string' },
        priority: { type: 'number' },
        confidence: { type: 'number' },
        source: {
          type: 'string',
          enum: ['remember', 'observe_extract', 'observe_commit', 'hook_capture', 'import'],
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
        metadata: {
          type: 'object',
          properties: {},
        },
        scope: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['global', 'org', 'project', 'session', 'topic'] },
            id: { type: 'string' },
          },
          required: ['type'],
        },
      },
      required: ['type', 'title', 'content', 'source', 'scope'],
    },
  },
  actions: {
    upsert_entry: {
      contextHandler: (context, params) =>
        handleV2MemoryWrite(context, { action: 'upsert_entry', ...params }),
    },
    delete_entry: {
      contextHandler: (context, params) =>
        handleV2MemoryWrite(context, { action: 'delete_entry', ...params }),
    },
    upsert_relation: {
      contextHandler: (context, params) =>
        handleV2MemoryWrite(context, { action: 'upsert_relation', ...params }),
    },
    delete_relation: {
      contextHandler: (context, params) =>
        handleV2MemoryWrite(context, { action: 'delete_relation', ...params }),
    },
    create_scope: {
      contextHandler: (context, params) =>
        handleV2MemoryWrite(context, { action: 'create_scope', ...params }),
    },
    archive_scope: {
      contextHandler: (context, params) =>
        handleV2MemoryWrite(context, { action: 'archive_scope', ...params }),
    },
    tag_entry: {
      contextHandler: (context, params) =>
        handleV2MemoryWrite(context, { action: 'tag_entry', ...params }),
    },
    untag_entry: {
      contextHandler: (context, params) =>
        handleV2MemoryWrite(context, { action: 'untag_entry', ...params }),
    },
  },
};
