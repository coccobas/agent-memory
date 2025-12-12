/**
 * Tag handlers
 */

import { tagRepo, entryTagRepo, type CreateTagInput } from '../../db/repositories/tags.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isEntryType,
  isBoolean,
  isNumber,
  isTagCategory,
} from '../../utils/type-guards.js';

export const tagHandlers = {
  create(params: Record<string, unknown>) {
    const name = getRequiredParam(params, 'name', isString);
    const category = getOptionalParam(params, 'category', isTagCategory);
    const description = getOptionalParam(params, 'description', isString);

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
    const category = getOptionalParam(params, 'category', isTagCategory);
    const isPredefined = getOptionalParam(params, 'isPredefined', isBoolean);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const tags = tagRepo.list({ category, isPredefined }, { limit, offset });
    return {
      tags,
      meta: {
        returnedCount: tags.length,
      },
    };
  },

  attach(params: Record<string, unknown>) {
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);

    const tagId = getOptionalParam(params, 'tagId', isString);
    const tagName = getOptionalParam(params, 'tagName', isString);

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
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);
    const tagId = getRequiredParam(params, 'tagId', isString);

    const success = entryTagRepo.detach(entryType, entryId, tagId);
    return { success };
  },

  forEntry(params: Record<string, unknown>) {
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);

    const tags = entryTagRepo.getTagsForEntry(entryType, entryId);
    return { tags };
  },
};
