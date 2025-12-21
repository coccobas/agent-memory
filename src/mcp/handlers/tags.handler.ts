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
import { requireEntryPermission } from '../../utils/entry-access.js';
import type {
  TagCreateParams,
  TagListParams,
  TagAttachParams,
  TagDetachParams,
  TagsForEntryParams,
} from '../types.js';

export const tagHandlers = {
  create(params: TagCreateParams) {
    // Require caller identity for auditing consistency (even though tags aren't permissioned directly)
    getRequiredParam(params, 'agentId', isString);
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

  list(params: TagListParams) {
    getRequiredParam(params, 'agentId', isString);
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

  attach(params: TagAttachParams) {
    const agentId = getRequiredParam(params, 'agentId', isString);
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);

    requireEntryPermission({ agentId, action: 'write', entryType, entryId });

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

  detach(params: TagDetachParams) {
    const agentId = getRequiredParam(params, 'agentId', isString);
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);
    const tagId = getRequiredParam(params, 'tagId', isString);

    requireEntryPermission({ agentId, action: 'write', entryType, entryId });

    const success = entryTagRepo.detach(entryType, entryId, tagId);
    return { success };
  },

  forEntry(params: TagsForEntryParams) {
    const agentId = getRequiredParam(params, 'agentId', isString);
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);

    requireEntryPermission({ agentId, action: 'read', entryType, entryId });

    const tags = entryTagRepo.getTagsForEntry(entryType, entryId);
    return { tags };
  },
};
