/**
 * Tag handlers
 */

import type { CreateTagInput } from '../../db/repositories/tags.js';
import type { AppContext } from '../../core/context.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isEntryType,
  isBoolean,
  isNumber,
  isTagCategory,
} from '../../utils/type-guards.js';
import { requireEntryPermissionWithScope } from '../../utils/entry-access.js';
import { createValidationError } from '../../core/errors.js';
import type {
  TagCreateParams,
  TagListParams,
  TagAttachParams,
  TagDetachParams,
  TagsForEntryParams,
} from '../types.js';

export const tagHandlers = {
  async create(context: AppContext, params: TagCreateParams) {
    // Require caller identity for auditing consistency (even though tags aren't permissioned directly)
    getRequiredParam(params, 'agentId', isString);
    const name = getRequiredParam(params, 'name', isString);
    const category = getOptionalParam(params, 'category', isTagCategory);
    const description = getOptionalParam(params, 'description', isString);

    // Check if tag already exists
    const existing = await context.repos.tags.getByName(name);
    if (existing) {
      return { success: true, tag: existing, existed: true };
    }

    const input: CreateTagInput = {
      name,
      category,
      description,
    };

    const tag = await context.repos.tags.create(input);
    return { success: true, tag, existed: false };
  },

  async list(context: AppContext, params: TagListParams) {
    getRequiredParam(params, 'agentId', isString);
    const category = getOptionalParam(params, 'category', isTagCategory);
    const isPredefined = getOptionalParam(params, 'isPredefined', isBoolean);
    const limit = getOptionalParam(params, 'limit', isNumber);
    const offset = getOptionalParam(params, 'offset', isNumber);

    const tags = await context.repos.tags.list({ category, isPredefined }, { limit, offset });
    return {
      tags,
      meta: {
        returnedCount: tags.length,
      },
    };
  },

  async attach(context: AppContext, params: TagAttachParams) {
    const agentId = getRequiredParam(params, 'agentId', isString);
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);

    const { scopeType, scopeId } = await requireEntryPermissionWithScope(context, {
      agentId,
      action: 'write',
      entryType,
      entryId,
    });

    const tagId = getOptionalParam(params, 'tagId', isString);
    const tagName = getOptionalParam(params, 'tagName', isString);

    if (!tagId && !tagName) {
      throw createValidationError(
        'tagId or tagName',
        'is required',
        'Provide either tagId or tagName to attach'
      );
    }

    const entryTag = await context.repos.entryTags.attach({
      entryType,
      entryId,
      tagId,
      tagName,
    });

    // Tag changes affect tag-filtered queries; emit update for cache invalidation.
    context.unifiedAdapters?.event.emit({
      entryType,
      entryId,
      scopeType,
      scopeId,
      action: 'update',
    });

    return { success: true, entryTag };
  },

  async detach(context: AppContext, params: TagDetachParams) {
    const agentId = getRequiredParam(params, 'agentId', isString);
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);
    const tagId = getRequiredParam(params, 'tagId', isString);

    const { scopeType, scopeId } = await requireEntryPermissionWithScope(context, {
      agentId,
      action: 'write',
      entryType,
      entryId,
    });

    const success = await context.repos.entryTags.detach(entryType, entryId, tagId);

    if (success) {
      context.unifiedAdapters?.event.emit({
        entryType,
        entryId,
        scopeType,
        scopeId,
        action: 'update',
      });
    }
    return { success };
  },

  async forEntry(context: AppContext, params: TagsForEntryParams) {
    const agentId = getRequiredParam(params, 'agentId', isString);
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);

    await requireEntryPermissionWithScope(context, { agentId, action: 'read', entryType, entryId });

    const tags = await context.repos.entryTags.getTagsForEntry(entryType, entryId);
    return { tags };
  },
};
