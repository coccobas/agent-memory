/**
 * Topic handlers
 *
 * Implements all topic MCP actions.
 * Uses TopicService for business logic.
 */

import type { AppContext } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';
import type { TopicStatus } from '../../db/schema.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isScopeType,
} from '../../utils/type-guards.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { logAction } from '../../services/audit.service.js';
import { createTopicService } from '../../services/topic/index.js';

// Type guard for TopicStatus
function isTopicStatus(v: unknown): v is TopicStatus {
  return v === 'active' || v === 'inactive';
}

// Helper to get topic service
function getTopicService(context: AppContext) {
  if (!context.repos.topics) {
    throw createValidationError('topics', 'repository not available');
  }
  return createTopicService({ topicRepo: context.repos.topics });
}

// Handler implementations
const list: ContextAwareHandler = async (context: AppContext, params: Record<string, unknown>) => {
  const topicService = getTopicService(context);

  const scopeType = getOptionalParam(params, 'scopeType', isScopeType) ?? 'project';
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const projectId = getOptionalParam(params, 'projectId', isString);
  const status = getOptionalParam(params, 'status', isTopicStatus);
  const includeInactive = getOptionalParam(params, 'includeInactive', isBoolean) ?? false;
  const limit = getOptionalParam(params, 'limit', isNumber);
  const offset = getOptionalParam(params, 'offset', isNumber);

  const topics = await topicService.list(
    { scopeType, scopeId: scopeId ?? projectId, status, includeInactive },
    { limit, offset }
  );

  logAction(
    {
      agentId: 'system',
      action: 'query',
      entryType: 'topic',
      scopeType,
      scopeId: scopeId ?? projectId ?? null,
      resultCount: topics.length,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    topics,
    count: topics.length,
  });
};

const get: ContextAwareHandler = async (context: AppContext, params: Record<string, unknown>) => {
  const topicService = getTopicService(context);
  const id = getRequiredParam(params, 'id', isString);

  const topic = await topicService.getById(id);
  if (!topic) {
    throw createNotFoundError('topic', id);
  }

  logAction(
    {
      agentId: 'system',
      action: 'read',
      entryType: 'topic',
      entryId: id,
      scopeType: topic.scopeType,
      scopeId: topic.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    topic,
  });
};

const create: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const topicService = getTopicService(context);

  const scopeType = getOptionalParam(params, 'scopeType', isScopeType) ?? 'project';
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const projectId = getOptionalParam(params, 'projectId', isString);
  const name = getRequiredParam(params, 'name', isString);
  const description = getOptionalParam(params, 'description', isString);
  const status = getOptionalParam(params, 'status', isTopicStatus) ?? 'active';
  const metadata = getOptionalParam(params, 'metadata', isObject);
  const createdBy =
    getOptionalParam(params, 'createdBy', isString) ??
    getOptionalParam(params, 'agentId', isString);

  const topic = await topicService.create({
    scopeType,
    scopeId: scopeId ?? projectId,
    name,
    description,
    status,
    metadata,
    createdBy,
  });

  logAction(
    {
      agentId: createdBy ?? 'system',
      action: 'create',
      entryType: 'topic',
      entryId: topic.id,
      scopeType: topic.scopeType,
      scopeId: topic.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    topic,
  });
};

const update: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const topicService = getTopicService(context);
  const id = getRequiredParam(params, 'id', isString);

  const name = getOptionalParam(params, 'name', isString);
  const description = getOptionalParam(params, 'description', isString);
  const status = getOptionalParam(params, 'status', isTopicStatus);
  const metadata = getOptionalParam(params, 'metadata', isObject);

  const topic = await topicService.update(id, { name, description, status, metadata });
  if (!topic) {
    throw createNotFoundError('topic', id);
  }

  logAction(
    {
      agentId: 'system',
      action: 'update',
      entryType: 'topic',
      entryId: id,
      scopeType: topic.scopeType,
      scopeId: topic.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    topic,
  });
};

const deactivate: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const topicService = getTopicService(context);
  const id = getRequiredParam(params, 'id', isString);

  const success = await topicService.deactivate(id);
  if (!success) {
    throw createNotFoundError('topic', id);
  }

  logAction(
    {
      agentId: 'system',
      action: 'update',
      entryType: 'topic',
      entryId: id,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
  });
};

const find_similar: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const topicService = getTopicService(context);

  const query = getRequiredParam(params, 'query', isString);
  const threshold = getOptionalParam(params, 'threshold', isNumber) ?? 0.8;

  const topics = await topicService.findSimilar(query, threshold);

  logAction(
    {
      agentId: 'system',
      action: 'query',
      entryType: 'topic',
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    topics,
    count: topics.length,
  });
};

export const topicHandlers = {
  list,
  get,
  create,
  update,
  deactivate,
  find_similar,
};
