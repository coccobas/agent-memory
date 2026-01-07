/**
 * memory_tag tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { tagHandlers } from '../handlers/tags.handler.js';
import type {
  TagCreateParams,
  TagListParams,
  TagAttachParams,
  TagDetachParams,
  TagsForEntryParams,
} from '../types.js';

export const memoryTagDescriptor: ToolDescriptor = {
  name: 'memory_tag',
  visibility: 'core',
  description: 'Manage tags. Actions: create, list, attach, detach, for_entry',
  commonParams: {
    agentId: { type: 'string' },
    name: { type: 'string' },
    category: { type: 'string', enum: ['language', 'domain', 'category', 'meta', 'custom'] },
    description: { type: 'string' },
    entryType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
    entryId: { type: 'string' },
    tagId: { type: 'string' },
    tagName: { type: 'string' },
    isPredefined: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    create: {
      contextHandler: (ctx, p) => tagHandlers.create(ctx, p as unknown as TagCreateParams),
    },
    list: {
      contextHandler: (ctx, p) => tagHandlers.list(ctx, p as unknown as TagListParams),
    },
    attach: {
      contextHandler: (ctx, p) => tagHandlers.attach(ctx, p as unknown as TagAttachParams),
    },
    detach: {
      contextHandler: (ctx, p) => tagHandlers.detach(ctx, p as unknown as TagDetachParams),
    },
    for_entry: {
      contextHandler: (ctx, p) => tagHandlers.forEntry(ctx, p as unknown as TagsForEntryParams),
    },
  },
};
