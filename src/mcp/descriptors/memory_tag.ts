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
  description: 'Manage tags. Actions: create, list, attach, detach, for_entry',
  commonParams: {
    agentId: { type: 'string', description: 'Agent identifier for access control/auditing' },
    name: { type: 'string', description: 'Tag name (unique)' },
    category: { type: 'string', enum: ['language', 'domain', 'category', 'meta', 'custom'] },
    description: { type: 'string' },
    entryType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
    entryId: { type: 'string' },
    tagId: { type: 'string', description: 'Tag ID' },
    tagName: { type: 'string', description: 'Tag name (creates if not exists)' },
    isPredefined: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    create: {
      handler: (p) => tagHandlers.create(p as unknown as TagCreateParams),
    },
    list: {
      handler: (p) => tagHandlers.list(p as unknown as TagListParams),
    },
    attach: {
      handler: (p) => tagHandlers.attach(p as unknown as TagAttachParams),
    },
    detach: {
      handler: (p) => tagHandlers.detach(p as unknown as TagDetachParams),
    },
    for_entry: {
      handler: (p) => tagHandlers.forEntry(p as unknown as TagsForEntryParams),
    },
  },
};
