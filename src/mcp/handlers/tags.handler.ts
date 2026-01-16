/**
 * Tag handlers
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { CreateTagInput } from '../../db/repositories/tags.js';
import type { AppContext } from '../../core/context.js';
import { logAction } from '../../services/audit.service.js';
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
    const agentId = getRequiredParam(params, 'agentId', isString);
    const name = getRequiredParam(params, 'name', isString);
    const category = getOptionalParam(params, 'category', isTagCategory);
    const description = getOptionalParam(params, 'description', isString);

    // Validate tag name is non-empty
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw createValidationError('name', 'cannot be empty', 'Provide a non-empty tag name');
    }

    // Check if tag already exists
    const existing = await context.repos.tags.getByName(trimmedName);
    if (existing) {
      return { success: true, tag: existing, existed: true };
    }

    const input: CreateTagInput = {
      name: trimmedName,
      category,
      description,
    };

    const tag = await context.repos.tags.create(input);

    // Log audit
    logAction(
      {
        agentId,
        action: 'create',
        entryType: 'tag' as const,
        entryId: tag.id,
        scopeType: 'global',
        scopeId: null,
      },
      context.db
    );

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

    // Log audit
    logAction(
      {
        agentId,
        action: 'update',
        entryType,
        entryId,
        scopeType,
        scopeId,
      },
      context.db
    );

    return { success: true, entryTag };
  },

  async detach(context: AppContext, params: TagDetachParams) {
    const agentId = getRequiredParam(params, 'agentId', isString);
    const entryType = getRequiredParam(params, 'entryType', isEntryType);
    const entryId = getRequiredParam(params, 'entryId', isString);

    // Accept either tagId or tagName (consistent with attach)
    let tagId = getOptionalParam(params, 'tagId', isString);
    const tagName = getOptionalParam(params, 'tagName', isString);

    if (!tagId && !tagName) {
      throw createValidationError(
        'tagId or tagName',
        'is required',
        'Provide either tagId or tagName to detach'
      );
    }

    // If tagName provided, look up the tagId
    if (!tagId && tagName) {
      const tag = await context.repos.tags.getByName(tagName);
      if (!tag) {
        throw createValidationError(
          'tagName',
          `tag "${tagName}" not found`,
          'Check the tag name exists'
        );
      }
      tagId = tag.id;
    }

    const { scopeType, scopeId } = await requireEntryPermissionWithScope(context, {
      agentId,
      action: 'write',
      entryType,
      entryId,
    });

    const success = await context.repos.entryTags.detach(entryType, entryId, tagId!);

    if (success) {
      context.unifiedAdapters?.event.emit({
        entryType,
        entryId,
        scopeType,
        scopeId,
        action: 'update',
      });

      // Log audit
      logAction(
        {
          agentId,
          action: 'update',
          entryType,
          entryId,
          scopeType,
          scopeId,
        },
        context.db
      );
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
