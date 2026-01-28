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
import { getEpisodeNameEnrichmentService } from '../../services/episode-name-enrichment.service.js';

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

// Episode resolution result
interface ResolvedEpisode {
  id: string;
  resolvedVia: 'explicit_id' | 'name_lookup' | 'active_episode';
}

/**
 * Resolve episode ID using fallback chain:
 * 1. Explicit id/episodeId param → use directly
 * 2. name + sessionId → lookup by name
 * 3. sessionId only → get active episode
 *
 * Returns the episode ID and how it was resolved.
 */
async function resolveEpisodeId(
  params: Record<string, unknown>,
  episodeService: ReturnType<typeof requireEpisodeService>,
  required: true
): Promise<ResolvedEpisode>;
async function resolveEpisodeId(
  params: Record<string, unknown>,
  episodeService: ReturnType<typeof requireEpisodeService>,
  required: false
): Promise<ResolvedEpisode | undefined>;
async function resolveEpisodeId(
  params: Record<string, unknown>,
  episodeService: ReturnType<typeof requireEpisodeService>,
  required: boolean
): Promise<ResolvedEpisode | undefined> {
  // 1. Explicit ID (prefer 'id' but fall back to 'episodeId' for backward compatibility)
  const explicitId = getOptionalParam(params, 'id', isString);
  const episodeId = getOptionalParam(params, 'episodeId', isString);
  if (explicitId ?? episodeId) {
    return { id: (explicitId ?? episodeId)!, resolvedVia: 'explicit_id' };
  }

  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const name = getOptionalParam(params, 'name', isString);

  // 2. Name lookup (requires sessionId)
  if (name && sessionId) {
    const episode = await episodeService.getByName(name, sessionId);
    if (episode) {
      return { id: episode.id, resolvedVia: 'name_lookup' };
    }
    if (required) {
      throw createNotFoundError('episode', `name="${name}" in session`);
    }
    return undefined;
  }

  // 3. Active episode (requires sessionId)
  if (sessionId) {
    const activeEpisode = await episodeService.getActiveEpisode(sessionId);
    if (activeEpisode) {
      return { id: activeEpisode.id, resolvedVia: 'active_episode' };
    }
    if (required) {
      throw createValidationError(
        'episode',
        'No active episode. Provide id, name, or start an episode first.'
      );
    }
    return undefined;
  }

  // No resolution possible
  if (required) {
    throw createValidationError(
      'episode',
      'Provide id, or sessionId to resolve by name/active episode'
    );
  }
  return undefined;
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
  let projectId = getOptionalParam(params, 'projectId', isString);
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  let conversationId = getOptionalParam(params, 'conversationId', isString);
  const name = getRequiredParam(params, 'name', isString);

  if (!name.trim()) {
    throw createValidationError('name', 'Episode name cannot be empty');
  }
  const description = getOptionalParam(params, 'description', isString);
  const parentEpisodeId = getOptionalParam(params, 'parentEpisodeId', isString);
  const triggerType = getOptionalParam(params, 'triggerType', isString);
  const triggerRef = getOptionalParam(params, 'triggerRef', isString);
  const tags = getOptionalParam(params, 'tags', isArrayOfStrings);
  const metadata = getOptionalParam(params, 'metadata', isObject);
  const createdBy = getOptionalParam(params, 'createdBy', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  // Auto-link to active conversation if not provided and sessionId is available
  if (!conversationId && sessionId) {
    const activeConversations = await context.repos.conversations.list(
      { sessionId, status: 'active' },
      { limit: 1 }
    );
    const activeConv = activeConversations[0];
    if (activeConv) {
      conversationId = activeConv.id;
    }
  }

  // Auto-populate projectId from session if not provided
  if (!projectId && sessionId) {
    const session = await context.repos.sessions.getById(sessionId);
    if (session?.projectId) {
      projectId = session.projectId;
    }
  }

  // Auto-populate scopeId based on scopeType
  let finalScopeId = scopeId;
  if (!finalScopeId) {
    if (scopeType === 'session' && sessionId) {
      finalScopeId = sessionId;
    } else if (scopeType === 'project' && projectId) {
      finalScopeId = projectId;
    }
  }

  const episode = await episodeService.create({
    scopeType,
    scopeId: finalScopeId,
    projectId,
    sessionId,
    conversationId,
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
  const projectId = getOptionalParam(params, 'projectId', isString);
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
      projectId,
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
  const conversationId = getOptionalParam(params, 'conversationId', isString);
  const tags = getOptionalParam(params, 'tags', isArrayOfStrings);
  const metadata = getOptionalParam(params, 'metadata', isObject);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const episode = await episodeService.update(id, {
    name,
    description,
    conversationId,
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

  const resolved = await resolveEpisodeId(params, episodeService, true);
  const outcome = getRequiredParam(params, 'outcome', isString);
  const outcomeType = getRequiredParam(params, 'outcomeType', isEpisodeOutcomeType);
  const agentId = getOptionalParam(params, 'agentId', isString);

  // Sync transcript before completing episode to ensure all messages are captured
  if (context.services.transcript) {
    try {
      const episodeForSync = await episodeService.getById(resolved.id);
      if (episodeForSync?.sessionId) {
        const transcripts = await context.repos.ideTranscripts?.list(
          { agentMemorySessionId: episodeForSync.sessionId, isSealed: false },
          { limit: 1 }
        );
        if (transcripts?.[0]) {
          await context.services.transcript.appendNewMessages(transcripts[0].id);
        }
      }
    } catch {
      // Non-fatal - transcript sync is optional
    }
  }

  let episode = await episodeService.complete(resolved.id, outcome, outcomeType);

  const enrichmentService = getEpisodeNameEnrichmentService();
  if (enrichmentService.isEnabled()) {
    try {
      const enrichResult = await enrichmentService.enrichName({
        originalName: episode.name,
        outcome: episode.outcome,
        outcomeType: episode.outcomeType,
        description: episode.description,
        durationMs: episode.durationMs,
        eventCount: episode.events?.length,
      });

      if (enrichResult.wasEnriched) {
        const updated = await episodeService.update(episode.id, {
          name: enrichResult.enrichedName,
        });
        if (updated) {
          episode = { ...episode, name: enrichResult.enrichedName };
        }
      }
    } catch {
      // Enrichment failure should not fail the complete operation
    }
  }

  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'update',
      entryType: 'episode',
      entryId: resolved.id,
      scopeType: episode.scopeType,
      scopeId: episode.scopeId ?? null,
    },
    context.db
  );

  const captureService = context.services.capture;
  if (captureService) {
    let messages: Array<{ id: string; role: string; content: string; createdAt: string }> = [];
    const unifiedMessageSource = context.services.unifiedMessageSource;
    if (unifiedMessageSource) {
      const result = await unifiedMessageSource.getMessagesForEpisode(resolved.id, {
        sessionId: episode.sessionId ?? undefined,
        startedAt: episode.startedAt ?? undefined,
        endedAt: episode.endedAt,
      });
      messages = result.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.timestamp,
      }));
    } else {
      const rawMessages = await context.repos.conversations.getMessagesByEpisode(resolved.id);
      messages = rawMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }));
    }

    captureService
      .onEpisodeComplete({
        id: episode.id,
        name: episode.name,
        description: episode.description,
        outcome: episode.outcome,
        outcomeType: episode.outcomeType,
        durationMs: episode.durationMs,
        scopeType: episode.scopeType,
        scopeId: episode.scopeId,
        sessionId: episode.sessionId,
        events: episode.events,
        messages,
      })
      .catch((error) => {
        console.warn(
          `Failed to capture experience from completed episode ${resolved.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }

  return formatTimestamps({
    success: true,
    episode,
    message: 'Episode completed',
    metrics: {
      durationMs: episode.durationMs,
      outcomeType: episode.outcomeType,
    },
    _resolved: { via: resolved.resolvedVia, episodeId: resolved.id },
  });
};

const failHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const resolved = await resolveEpisodeId(params, episodeService, true);
  const outcome = getRequiredParam(params, 'outcome', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  // Sync transcript before failing episode to ensure all messages are captured
  if (context.services.transcript) {
    try {
      const episodeForSync = await episodeService.getById(resolved.id);
      if (episodeForSync?.sessionId) {
        const transcripts = await context.repos.ideTranscripts?.list(
          { agentMemorySessionId: episodeForSync.sessionId, isSealed: false },
          { limit: 1 }
        );
        if (transcripts?.[0]) {
          await context.services.transcript.appendNewMessages(transcripts[0].id);
        }
      }
    } catch {
      // Non-fatal - transcript sync is optional
    }
  }

  let episode = await episodeService.fail(resolved.id, outcome);

  const enrichmentService = getEpisodeNameEnrichmentService();
  if (enrichmentService.isEnabled()) {
    try {
      const enrichResult = await enrichmentService.enrichName({
        originalName: episode.name,
        outcome: episode.outcome,
        outcomeType: episode.outcomeType,
        description: episode.description,
        durationMs: episode.durationMs,
        eventCount: episode.events?.length,
      });

      if (enrichResult.wasEnriched) {
        const updated = await episodeService.update(episode.id, {
          name: enrichResult.enrichedName,
        });
        if (updated) {
          episode = { ...episode, name: enrichResult.enrichedName };
        }
      }
    } catch {
      // Enrichment failure should not fail the fail operation
    }
  }

  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'update',
      entryType: 'episode',
      entryId: resolved.id,
      scopeType: episode.scopeType,
      scopeId: episode.scopeId ?? null,
    },
    context.db
  );

  const captureService = context.services.capture;
  if (captureService) {
    let messages: Array<{ id: string; role: string; content: string; createdAt: string }> = [];
    const unifiedMessageSource = context.services.unifiedMessageSource;
    if (unifiedMessageSource) {
      const result = await unifiedMessageSource.getMessagesForEpisode(resolved.id, {
        sessionId: episode.sessionId ?? undefined,
        startedAt: episode.startedAt ?? undefined,
        endedAt: episode.endedAt,
      });
      messages = result.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.timestamp,
      }));
    } else {
      const rawMessages = await context.repos.conversations.getMessagesByEpisode(resolved.id);
      messages = rawMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }));
    }

    captureService
      .onEpisodeComplete({
        id: episode.id,
        name: episode.name,
        description: episode.description,
        outcome: episode.outcome,
        outcomeType: episode.outcomeType,
        durationMs: episode.durationMs,
        scopeType: episode.scopeType,
        scopeId: episode.scopeId,
        sessionId: episode.sessionId,
        events: episode.events,
        messages,
      })
      .catch((error) => {
        console.warn(
          `Failed to capture experience from failed episode ${resolved.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }

  return formatTimestamps({
    success: true,
    episode,
    message: 'Episode failed',
    metrics: {
      durationMs: episode.durationMs,
      outcomeType: episode.outcomeType,
    },
    _resolved: { via: resolved.resolvedVia, episodeId: resolved.id },
  });
};

const cancelHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const resolved = await resolveEpisodeId(params, episodeService, true);
  const reason = getOptionalParam(params, 'reason', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const episode = await episodeService.cancel(resolved.id, reason);

  logAction(
    {
      agentId: agentId ?? 'system',
      action: 'update',
      entryType: 'episode',
      entryId: resolved.id,
      scopeType: episode.scopeType,
      scopeId: episode.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    episode,
    message: 'Episode cancelled',
    _resolved: { via: resolved.resolvedVia, episodeId: resolved.id },
  });
};

const beginHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const scopeType = (getOptionalParam(params, 'scopeType', isScopeType) ?? 'project') as ScopeType;
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  let projectId = getOptionalParam(params, 'projectId', isString);
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  let conversationId = getOptionalParam(params, 'conversationId', isString);
  const name = getRequiredParam(params, 'name', isString);

  if (!name.trim()) {
    throw createValidationError('name', 'Episode name cannot be empty');
  }
  const description = getOptionalParam(params, 'description', isString);
  const parentEpisodeId = getOptionalParam(params, 'parentEpisodeId', isString);
  const triggerType = getOptionalParam(params, 'triggerType', isString);
  const triggerRef = getOptionalParam(params, 'triggerRef', isString);
  const tags = getOptionalParam(params, 'tags', isArrayOfStrings);
  const metadata = getOptionalParam(params, 'metadata', isObject);
  const createdBy = getOptionalParam(params, 'createdBy', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  // Auto-link to active conversation if not provided and sessionId is available
  if (!conversationId && sessionId) {
    const activeConversations = await context.repos.conversations.list(
      { sessionId, status: 'active' },
      { limit: 1 }
    );
    const activeConv = activeConversations[0];
    if (activeConv) {
      conversationId = activeConv.id;
    }
  }

  // Auto-populate projectId from session if not provided
  if (!projectId && sessionId) {
    const session = await context.repos.sessions.getById(sessionId);
    if (session?.projectId) {
      projectId = session.projectId;
    }
  }

  const created = await episodeService.create({
    scopeType,
    scopeId,
    projectId,
    sessionId,
    conversationId,
    name,
    description,
    parentEpisodeId,
    triggerType,
    triggerRef,
    tags,
    metadata,
    createdBy: createdBy ?? agentId,
  });

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

  const resolved = await resolveEpisodeId(params, episodeService, true);
  const eventType = getRequiredParam(params, 'eventType', isString);
  const eventName = getRequiredParam(params, 'name', isString);
  const description = getOptionalParam(params, 'description', isString);
  const entryType = getOptionalParam(params, 'entryType', isString);
  const entryId = getOptionalParam(params, 'entryId', isString);
  const data = getOptionalParam(params, 'data', isObject);

  const event = await episodeService.addEvent({
    episodeId: resolved.id,
    eventType,
    name: eventName,
    description,
    entryType,
    entryId,
    data,
  });

  return formatTimestamps({
    success: true,
    event,
    _resolved: { via: resolved.resolvedVia, episodeId: resolved.id },
  });
};

const getEventsHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const resolved = await resolveEpisodeId(params, episodeService, true);

  const events = await episodeService.getEvents(resolved.id);

  return formatTimestamps({
    success: true,
    events,
    count: events.length,
    _resolved: { via: resolved.resolvedVia, episodeId: resolved.id },
  });
};

// Convenience handler: quick event logging with minimal params
const logHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const resolved = await resolveEpisodeId(params, episodeService, true);
  const message = getRequiredParam(params, 'message', isString);
  const eventType = getOptionalParam(params, 'eventType', isString) ?? 'checkpoint';
  const data = getOptionalParam(params, 'data', isObject);

  const event = await episodeService.addEvent({
    episodeId: resolved.id,
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
    _resolved: { via: resolved.resolvedVia, episodeId: resolved.id },
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

  const resolved = await resolveEpisodeId(params, episodeService, true);
  const entryType = getRequiredParam(params, 'entryType', isString);
  const entryId = getRequiredParam(params, 'entryId', isString);
  const role = getOptionalParam(params, 'role', isString);

  await episodeService.linkEntity(resolved.id, entryType, entryId, role);

  return {
    success: true,
    episodeId: resolved.id,
    linked: {
      entryType,
      entryId,
      role,
    },
    _resolved: { via: resolved.resolvedVia },
  };
};

const getLinkedHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const resolved = await resolveEpisodeId(params, episodeService, true);

  const linkedEntities = await episodeService.getLinkedEntities(resolved.id);

  return {
    success: true,
    episodeId: resolved.id,
    linkedEntities,
    count: linkedEntities.length,
    _resolved: { via: resolved.resolvedVia },
  };
};

// =============================================================================
// MESSAGE HANDLERS
// =============================================================================

const getMessagesHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);
  const resolved = await resolveEpisodeId(params, episodeService, true);
  const limit = getOptionalParam(params, 'limit', isNumber);
  const offset = getOptionalParam(params, 'offset', isNumber);

  const episode = await episodeService.getById(resolved.id, false);
  if (!episode) {
    return { success: false, error: 'Episode not found' };
  }

  let messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp?: string;
    toolsUsed?: string[] | null;
  }> = [];
  let source: 'transcript' | 'conversation' = 'conversation';

  const unifiedMessageSource = context.services.unifiedMessageSource;
  if (unifiedMessageSource) {
    const result = await unifiedMessageSource.getMessagesForEpisode(resolved.id, {
      limit,
      offset,
      sessionId: episode.sessionId ?? undefined,
      startedAt: episode.startedAt ?? undefined,
      endedAt: episode.endedAt,
    });
    messages = result.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      toolsUsed: m.toolsUsed,
    }));
    source = result.source;
  } else {
    const convMessages = await context.repos.conversations.getMessagesByEpisode(
      resolved.id,
      limit,
      offset
    );
    messages = convMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.createdAt,
      toolsUsed: m.toolsUsed,
    }));
  }

  return formatTimestamps({
    success: true,
    episodeId: resolved.id,
    messages,
    count: messages.length,
    source,
    _resolved: { via: resolved.resolvedVia },
  });
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

  const resolved = await resolveEpisodeId(params, episodeService, true);

  const result = await episodeService.whatHappened(resolved.id);

  return formatTimestamps({
    success: true,
    ...result,
    _resolved: { via: resolved.resolvedVia, episodeId: resolved.id },
  });
};

const traceCausalChainHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const episodeService = requireEpisodeService(context);

  const resolved = await resolveEpisodeId(params, episodeService, true);
  const direction = getRequiredParam(params, 'direction', isDirection);
  const maxDepth = getOptionalParam(params, 'maxDepth', isNumber) ?? 10;

  const chain = await episodeService.traceCausalChain(resolved.id, direction, maxDepth);

  return formatTimestamps({
    success: true,
    episodeId: resolved.id,
    direction,
    chain,
    count: chain.length,
    _resolved: { via: resolved.resolvedVia },
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

  // Messages
  get_messages: getMessagesHandler,

  // Timeline and queries
  get_timeline: getTimelineHandler,
  what_happened: whatHappenedHandler,
  trace_causal_chain: traceCausalChainHandler,
};
