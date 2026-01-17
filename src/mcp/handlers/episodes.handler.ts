/**
 * Episode handlers
 *
 * Implements all episode MCP actions.
 * Uses EpisodeService for business logic.
 */

import type { AppContext } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';
import type { ScopeType, EpisodeOutcomeType, EpisodeStatus } from '../../db/schema.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isBoolean,
  isArrayOfStrings,
  isObject,
  isScopeType,
} from '../../utils/type-guards.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { logAction } from '../../services/audit.service.js';

// Type guards for episode-specific types
function isEpisodeStatus(v: unknown): v is EpisodeStatus {
  return (
    v === 'planned' || v === 'active' || v === 'completed' || v === 'failed' || v === 'cancelled'
  );
}

function isEpisodeOutcomeType(v: unknown): v is EpisodeOutcomeType {
  return v === 'success' || v === 'partial' || v === 'failure' || v === 'abandoned';
}

function isDirection(v: unknown): v is 'forward' | 'backward' {
  return v === 'forward' || v === 'backward';
}

// Helper to check if episode service is available
function requireEpisodeService(context: AppContext) {
  if (!context.services.episode) {
    throw createValidationError('episode', 'service not available');
  }
  return context.services.episode;
}

// Helper to get episode ID from params (supports both 'id' and 'episodeId' for compatibility)
function getEpisodeId(params: Record<string, unknown>, required: true): string;
function getEpisodeId(params: Record<string, unknown>, required: false): string | undefined;
function getEpisodeId(params: Record<string, unknown>, required: boolean): string | undefined {
  // Prefer 'id' but fall back to 'episodeId' for backward compatibility
  const id = getOptionalParam(params, 'id', isString);
  const episodeId = getOptionalParam(params, 'episodeId', isString);
  const result = id ?? episodeId;

  if (required && !result) {
    throw createValidationError('id', 'required (or episodeId)');
  }
  return result;
}

// =============================================================================
// CRUD HANDLERS
// =============================================================================

const addHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const scopeType = (getOptionalParam(params, 'scopeType', isScopeType) ?? 'project') as ScopeType;
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const name = getRequiredParam(params, 'name', isString);
  const description = getOptionalParam(params, 'description', isString);
  const parentEpisodeId = getOptionalParam(params, 'parentEpisodeId', isString);
  const triggerType = getOptionalParam(params, 'triggerType', isString);
  const triggerRef = getOptionalParam(params, 'triggerRef', isString);
  const tags = getOptionalParam(params, 'tags', isArrayOfStrings);
  const metadata = getOptionalParam(params, 'metadata', isObject);
  const createdBy = getOptionalParam(params, 'createdBy', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const episode = await episodeService.create({
    scopeType,
    scopeId,
    sessionId,
    name,
    description,
    parentEpisodeId,
    triggerType,
    triggerRef,
    tags,
    metadata,
    createdBy: createdBy ?? agentId,
  });

  // Log audit
  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'create',
      entryType: 'episode',
      entryId: episode.id,
      scopeType: episode.scopeType,
      scopeId: episode.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    episode,
  });
};

const getHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const id = getRequiredParam(params, 'id', isString);
  const includeEvents = getOptionalParam(params, 'includeEvents', isBoolean) ?? true;

  const episode = await episodeService.getById(id, includeEvents);
  if (!episode) {
    throw createNotFoundError('episode', id);
  }

  return formatTimestamps({
    success: true,
    episode,
  });
};

const listHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const scopeType = getOptionalParam(params, 'scopeType', isScopeType) as ScopeType | undefined;
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const status = getOptionalParam(params, 'status', isEpisodeStatus);
  const parentEpisodeId = getOptionalParam(params, 'parentEpisodeId', isString);
  const includeInactive = getOptionalParam(params, 'includeInactive', isBoolean);
  const limit = getOptionalParam(params, 'limit', isNumber);
  const offset = getOptionalParam(params, 'offset', isNumber);

  const episodes = await episodeService.list(
    {
      scopeType,
      scopeId,
      sessionId,
      status,
      parentEpisodeId,
      includeInactive,
    },
    { limit, offset }
  );

  return formatTimestamps({
    success: true,
    episodes,
    count: episodes.length,
  });
};

const updateHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const id = getRequiredParam(params, 'id', isString);
  const name = getOptionalParam(params, 'name', isString);
  const description = getOptionalParam(params, 'description', isString);
  const tags = getOptionalParam(params, 'tags', isArrayOfStrings);
  const metadata = getOptionalParam(params, 'metadata', isObject);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const episode = await episodeService.update(id, {
    name,
    description,
    tags,
    metadata,
  });

  if (!episode) {
    throw createNotFoundError('episode', id);
  }

  // Log audit
  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'update',
      entryType: 'episode',
      entryId: id,
      scopeType: episode.scopeType,
      scopeId: episode.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    episode,
  });
};

const deactivateHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const id = getRequiredParam(params, 'id', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const result = await episodeService.deactivate(id);

  // Log audit
  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'delete',
      entryType: 'episode',
      entryId: id,
      scopeType: 'project',
      scopeId: null,
    },
    context.db
  );

  return {
    success: result,
    id,
    deactivated: result,
  };
};

const deleteHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const id = getRequiredParam(params, 'id', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const result = await episodeService.delete(id);

  // Log audit
  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'delete',
      entryType: 'episode',
      entryId: id,
      scopeType: 'project',
      scopeId: null,
    },
    context.db
  );

  return {
    success: result,
    id,
    deleted: result,
  };
};

// =============================================================================
// LIFECYCLE HANDLERS
// =============================================================================

const startHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const id = getRequiredParam(params, 'id', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const episode = await episodeService.start(id);

  // Log audit
  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'update',
      entryType: 'episode',
      entryId: id,
      scopeType: episode.scopeType,
      scopeId: episode.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    episode,
    message: 'Episode started',
  });
};

const completeHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const id = getRequiredParam(params, 'id', isString);
  const outcome = getRequiredParam(params, 'outcome', isString);
  const outcomeType = getRequiredParam(params, 'outcomeType', isEpisodeOutcomeType);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const episode = await episodeService.complete(id, outcome, outcomeType);

  // Log audit
  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'update',
      entryType: 'episode',
      entryId: id,
      scopeType: episode.scopeType,
      scopeId: episode.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    episode,
    message: 'Episode completed',
    metrics: {
      durationMs: episode.durationMs,
      outcomeType: episode.outcomeType,
    },
  });
};

const failHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const id = getRequiredParam(params, 'id', isString);
  const outcome = getRequiredParam(params, 'outcome', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const episode = await episodeService.fail(id, outcome);

  // Log audit
  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'update',
      entryType: 'episode',
      entryId: id,
      scopeType: episode.scopeType,
      scopeId: episode.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    episode,
    message: 'Episode failed',
    metrics: {
      durationMs: episode.durationMs,
      outcomeType: episode.outcomeType,
    },
  });
};

const cancelHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const id = getRequiredParam(params, 'id', isString);
  const reason = getOptionalParam(params, 'reason', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const episode = await episodeService.cancel(id, reason);

  // Log audit
  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'update',
      entryType: 'episode',
      entryId: id,
      scopeType: episode.scopeType,
      scopeId: episode.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    episode,
    message: 'Episode cancelled',
  });
};

// Convenience handler: create + start in one call
const beginHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const scopeType = (getOptionalParam(params, 'scopeType', isScopeType) ?? 'project') as ScopeType;
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const name = getRequiredParam(params, 'name', isString);
  const description = getOptionalParam(params, 'description', isString);
  const parentEpisodeId = getOptionalParam(params, 'parentEpisodeId', isString);
  const triggerType = getOptionalParam(params, 'triggerType', isString);
  const triggerRef = getOptionalParam(params, 'triggerRef', isString);
  const tags = getOptionalParam(params, 'tags', isArrayOfStrings);
  const metadata = getOptionalParam(params, 'metadata', isObject);
  const createdBy = getOptionalParam(params, 'createdBy', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  // Step 1: Create the episode
  const created = await episodeService.create({
    scopeType,
    scopeId,
    sessionId,
    name,
    description,
    parentEpisodeId,
    triggerType,
    triggerRef,
    tags,
    metadata,
    createdBy: createdBy ?? agentId,
  });

  // Step 2: Start it immediately
  const episode = await episodeService.start(created.id);

  // Log audit
  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'create',
      entryType: 'episode',
      entryId: episode.id,
      scopeType: episode.scopeType,
      scopeId: episode.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    episode,
    message: 'Episode created and started',
  });
};

// =============================================================================
// EVENT HANDLERS
// =============================================================================

const addEventHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const episodeId = getEpisodeId(params, true);
  const eventType = getRequiredParam(params, 'eventType', isString);
  const name = getRequiredParam(params, 'name', isString);
  const description = getOptionalParam(params, 'description', isString);
  const entryType = getOptionalParam(params, 'entryType', isString);
  const entryId = getOptionalParam(params, 'entryId', isString);
  const data = getOptionalParam(params, 'data', isObject);

  const event = await episodeService.addEvent({
    episodeId,
    eventType,
    name,
    description,
    entryType,
    entryId,
    data,
  });

  return formatTimestamps({
    success: true,
    event,
  });
};

const getEventsHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const episodeId = getEpisodeId(params, true);

  const events = await episodeService.getEvents(episodeId);

  return formatTimestamps({
    success: true,
    events,
    count: events.length,
  });
};

// Convenience handler: quick event logging with minimal params
const logHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const episodeId = getEpisodeId(params, true);
  const message = getRequiredParam(params, 'message', isString);
  const eventType = getOptionalParam(params, 'eventType', isString) ?? 'checkpoint';
  const data = getOptionalParam(params, 'data', isObject);

  const event = await episodeService.addEvent({
    episodeId,
    eventType,
    name: message,
    description: undefined,
    entryType: undefined,
    entryId: undefined,
    data,
  });

  return formatTimestamps({
    success: true,
    event,
    message: `Logged: ${message}`,
  });
};

// =============================================================================
// ENTITY LINKING HANDLERS
// =============================================================================

const linkEntityHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const episodeId = getEpisodeId(params, true);
  const entryType = getRequiredParam(params, 'entryType', isString);
  const entryId = getRequiredParam(params, 'entryId', isString);
  const role = getOptionalParam(params, 'role', isString);

  await episodeService.linkEntity(episodeId, entryType, entryId, role);

  return {
    success: true,
    episodeId,
    linked: {
      entryType,
      entryId,
      role,
    },
  };
};

const getLinkedHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const episodeId = getEpisodeId(params, true);

  const linkedEntities = await episodeService.getLinkedEntities(episodeId);

  return {
    success: true,
    episodeId,
    linkedEntities,
    count: linkedEntities.length,
  };
};

// =============================================================================
// TIMELINE AND QUERY HANDLERS
// =============================================================================

const getTimelineHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const sessionId = getRequiredParam(params, 'sessionId', isString);
  const start = getOptionalParam(params, 'start', isString);
  const end = getOptionalParam(params, 'end', isString);

  const timeline = await episodeService.getTimeline(sessionId, { start, end });

  return formatTimestamps({
    success: true,
    sessionId,
    timeline,
    count: timeline.length,
  });
};

const whatHappenedHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const id = getRequiredParam(params, 'id', isString);

  const result = await episodeService.whatHappened(id);

  return formatTimestamps({
    success: true,
    ...result,
  });
};

const traceCausalChainHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const episodeId = getEpisodeId(params, true);
  const direction = getRequiredParam(params, 'direction', isDirection);
  const maxDepth = getOptionalParam(params, 'maxDepth', isNumber) ?? 10;

  const chain = await episodeService.traceCausalChain(episodeId, direction, maxDepth);

  return formatTimestamps({
    success: true,
    episodeId,
    direction,
    chain,
    count: chain.length,
  });
};

// =============================================================================
// EXPORT ALL HANDLERS
// =============================================================================

export const episodeHandlers = {
  // CRUD
  add: addHandler,
  get: getHandler,
  list: listHandler,
  update: updateHandler,
  deactivate: deactivateHandler,
  delete: deleteHandler,

  // Lifecycle
  start: startHandler,
  complete: completeHandler,
  fail: failHandler,
  cancel: cancelHandler,
  begin: beginHandler, // Convenience: create + start

  // Events
  add_event: addEventHandler,
  get_events: getEventsHandler,
  log: logHandler, // Convenience: quick event logging

  // Entity linking
  link_entity: linkEntityHandler,
  get_linked: getLinkedHandler,

  // Timeline and queries
  get_timeline: getTimelineHandler,
  what_happened: whatHappenedHandler,
  trace_causal_chain: traceCausalChainHandler,
};
