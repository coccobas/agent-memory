/**
 * Tag handlers
 */

import {
  tagRepo,
  entryTagRepo,
  type CreateTagInput,
} from '../../db/repositories/tags.js';

import type {
  TagCreateParams,
  TagListParams,
  TagAttachParams,
  TagDetachParams,
  TagsForEntryParams,
} from '../types.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export const tagHandlers = {
  create(params: Record<string, unknown>) {
    const { name, category, description } = cast<TagCreateParams>(params);

    if (!name) {
      throw new Error('name is required');
    }

    // Check if tag already exists
    const existing = tagRepo.getByName(name);
    if (existing) {
      return { success: true, tag: existing, existed: true };
    }

    const input: CreateTagInput = {
      name,
      category,
      description,
    };

    const tag = tagRepo.create(input);
    return { success: true, tag, existed: false };
  },

  list(params: Record<string, unknown>) {
    const { category, isPredefined, limit, offset } = cast<TagListParams>(params);

    const tags = tagRepo.list({ category, isPredefined }, { limit, offset });
    return {
      tags,
      meta: {
        returnedCount: tags.length,
      },
    };
  },

  attach(params: Record<string, unknown>) {
    const { entryType, entryId, tagId, tagName } = cast<TagAttachParams>(params);

    if (!entryType) {
      throw new Error('entryType is required');
    }
    if (!entryId) {
      throw new Error('entryId is required');
    }
    if (!tagId && !tagName) {
      throw new Error('Either tagId or tagName is required');
    }

    const entryTag = entryTagRepo.attach({
      entryType,
      entryId,
      tagId,
      tagName,
    });

    return { success: true, entryTag };
  },

  detach(params: Record<string, unknown>) {
    const { entryType, entryId, tagId } = cast<TagDetachParams>(params);

    if (!entryType) {
      throw new Error('entryType is required');
    }
    if (!entryId) {
      throw new Error('entryId is required');
    }
    if (!tagId) {
      throw new Error('tagId is required');
    }

    const success = entryTagRepo.detach(entryType, entryId, tagId);
    return { success };
  },

  forEntry(params: Record<string, unknown>) {
    const { entryType, entryId } = cast<TagsForEntryParams>(params);

    if (!entryType) {
      throw new Error('entryType is required');
    }
    if (!entryId) {
      throw new Error('entryId is required');
    }

    const tags = entryTagRepo.getTagsForEntry(entryType, entryId);
    return { tags };
  },
};
