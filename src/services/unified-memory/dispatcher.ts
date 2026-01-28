/**
 * Unified Memory Dispatcher
 *
 * Routes intent detection results to appropriate handlers.
 * Translates high-level intents into specific tool calls.
 */

import type { AppContext } from '../../core/context.js';
import type { IntentDetectionResult } from '../intent-detection/index.js';
import { executeQueryPipeline } from '../query/index.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('unified-memory-dispatcher');

// =============================================================================
// TYPES
// =============================================================================

export interface DispatchResult {
  action:
    | 'store'
    | 'retrieve'
    | 'session_start'
    | 'session_end'
    | 'forget'
    | 'list'
    | 'list_episodes'
    | 'list_sessions'
    | 'status'
    | 'update'
    | 'episode_begin'
    | 'episode_log'
    | 'episode_complete'
    | 'episode_query'
    | 'learn_experience'
    | 'error';
  status: 'success' | 'duplicate_detected' | 'not_found' | 'error' | 'low_confidence';
  message?: string;
  entry?: {
    id: string;
    type: string;
    title?: string;
    name?: string;
    category?: string;
  };
  results?: Array<{
    type: string;
    id: string;
    title?: string;
    name?: string;
    snippet?: string;
    score?: number;
  }>;
  session?: {
    id: string;
    name?: string;
    status: string;
  };
  episode?: {
    id: string;
    name?: string;
    status: string;
  };
  event?: {
    id: string;
    message: string;
  };
  _context?: {
    projectId?: string;
    sessionId?: string;
    agentId?: string;
  };
  /** Human-readable summary of retrieved results */
  _highlights?: string;
}

export interface DispatcherDeps {
  context: AppContext;
  projectId?: string;
  sessionId?: string;
  agentId: string;
}

// =============================================================================
// DISPATCHER
// =============================================================================

/**
 * Dispatch intent result to appropriate handler
 */
export async function dispatch(
  intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { projectId, sessionId, agentId } = deps;

  logger.debug({ intent: intent.intent, confidence: intent.confidence }, 'Dispatching intent');

  // Low confidence check
  if (intent.confidence < 0.5 && intent.intent !== 'unknown') {
    return {
      action: intent.intent as DispatchResult['action'],
      status: 'low_confidence',
      message: `Intent "${intent.intent}" detected with low confidence (${(intent.confidence * 100).toFixed(0)}%). Please be more specific.`,
      _context: { projectId, sessionId, agentId },
    };
  }

  try {
    switch (intent.intent) {
      case 'store':
        return await handleStore(intent, deps);
      case 'retrieve':
        return await handleRetrieve(intent, deps);
      case 'session_start':
        return await handleSessionStart(intent, deps);
      case 'session_end':
        return await handleSessionEnd(intent, deps);
      case 'list':
        return await handleList(intent, deps);
      case 'list_episodes':
        return await handleListEpisodes(deps);
      case 'list_sessions':
        return await handleListSessions(deps);
      case 'status':
        return await handleStatus(deps);
      case 'forget':
        return handleForget(intent, deps);
      case 'update':
        return handleUpdate();
      case 'episode_begin':
        return await handleEpisodeBegin(intent, deps);
      case 'episode_log':
        return await handleEpisodeLog(intent, deps);
      case 'episode_complete':
        return await handleEpisodeComplete(intent, deps);
      case 'episode_query':
        return await handleEpisodeQuery(intent, deps);
      case 'learn_experience':
        return await handleLearnExperience(intent, deps);
      case 'unknown':
      default:
        return {
          action: 'error',
          status: 'error',
          message:
            'Could not understand the request. Try: "Remember that...", "What do we know about...", "List all guidelines", etc.',
          _context: { projectId, sessionId, agentId },
        };
    }
  } catch (error) {
    logger.error({ error, intent: intent.intent }, 'Dispatch error');
    return {
      action: 'error',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      _context: { projectId, sessionId, agentId },
    };
  }
}

// =============================================================================
// INTENT HANDLERS
// =============================================================================

async function handleStore(
  intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { context, projectId, agentId } = deps;

  if (!intent.content) {
    return {
      action: 'store',
      status: 'error',
      message: 'No content provided to store',
    };
  }

  if (!projectId) {
    return {
      action: 'store',
      status: 'error',
      message: 'No project context. Create or select a project first.',
    };
  }

  const entryType = intent.entryType ?? 'knowledge';
  const category = intent.category ?? (entryType === 'knowledge' ? 'fact' : 'code_style');
  const title = intent.title ?? intent.content.substring(0, 50);

  // Store based on entry type
  if (entryType === 'guideline') {
    const result = await context.repos.guidelines.create({
      scopeType: 'project',
      scopeId: projectId,
      name: title,
      content: intent.content,
      category,
      createdBy: agentId,
    });

    return {
      action: 'store',
      status: 'success',
      message: `Stored guideline: "${title}"`,
      entry: {
        id: result.id,
        type: 'guideline',
        name: result.name,
        category,
      },
    };
  } else if (entryType === 'tool') {
    const result = await context.repos.tools.create({
      scopeType: 'project',
      scopeId: projectId,
      name: title,
      description: intent.content,
      category: 'cli',
      createdBy: agentId,
    });

    return {
      action: 'store',
      status: 'success',
      message: `Stored tool: "${title}"`,
      entry: {
        id: result.id,
        type: 'tool',
        name: result.name,
        category: 'cli',
      },
    };
  } else {
    // Default to knowledge
    const result = await context.repos.knowledge.create({
      scopeType: 'project',
      scopeId: projectId,
      title,
      content: intent.content,
      category: category as 'decision' | 'fact' | 'context' | 'reference',
      createdBy: agentId,
    });

    return {
      action: 'store',
      status: 'success',
      message: `Stored knowledge: "${title}"`,
      entry: {
        id: result.id,
        type: 'knowledge',
        title: result.title,
        category,
      },
    };
  }
}

async function handleRetrieve(
  intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { context, projectId } = deps;

  const query = intent.query ?? intent.content ?? '';

  // Handle tag-based filtering (e.g., "find entries tagged with security")
  if (intent.tagFilter) {
    const types: Array<'tools' | 'guidelines' | 'knowledge'> = ['tools', 'guidelines', 'knowledge'];
    const queryResult = await executeQueryPipeline(
      {
        types,
        scope: projectId
          ? { type: 'project', id: projectId, inherit: true }
          : { type: 'global', inherit: true },
        limit: 20,
        tags: { include: [intent.tagFilter] },
      },
      context.queryDeps
    );

    const results: DispatchResult['results'] = queryResult.results.map((r) => {
      let name: string | undefined;
      let title: string | undefined;
      if (r.type === 'tool' && 'tool' in r) name = r.tool.name;
      else if (r.type === 'guideline' && 'guideline' in r) name = r.guideline.name;
      else if (r.type === 'knowledge' && 'knowledge' in r) title = r.knowledge.title;
      return {
        type: r.type,
        id: r.id,
        ...(title ? { title } : {}),
        ...(name ? { name } : {}),
        score: r.score,
      };
    });

    if (results.length === 0) {
      return {
        action: 'retrieve',
        status: 'not_found',
        message: `No entries found with tag "${intent.tagFilter}"`,
        results: [],
        _highlights: `No entries tagged with "${intent.tagFilter}"`,
      };
    }

    return {
      action: 'retrieve',
      status: 'success',
      message: `Found ${results.length} entries tagged with "${intent.tagFilter}"`,
      results,
      _highlights: `Found ${results.length} entries with tag "${intent.tagFilter}"`,
    };
  }

  // If entry type is detected and query is generic (e.g., "What are the guidelines?"),
  // use direct listing instead of semantic search
  if (intent.entryType && (!query || query.length < 5 || /^the\s+\w+s?$/i.test(query))) {
    return await handleList(intent, deps);
  }

  if (!query) {
    return {
      action: 'retrieve',
      status: 'error',
      message: 'No search query provided',
    };
  }

  // Determine which types to search based on detected entryType
  let types: Array<'tools' | 'guidelines' | 'knowledge'>;
  if (intent.entryType === 'guideline') {
    types = ['guidelines'];
  } else if (intent.entryType === 'tool') {
    types = ['tools'];
  } else if (intent.entryType === 'knowledge') {
    types = ['knowledge'];
  } else {
    types = ['tools', 'guidelines', 'knowledge'];
  }

  const queryResult = await executeQueryPipeline(
    {
      search: query,
      types,
      scope: projectId
        ? { type: 'project', id: projectId, inherit: true }
        : { type: 'global', inherit: true },
      limit: 20,
      useFts5: true,
    },
    context.queryDeps
  );

  // Map query results to dispatch results format
  const results: DispatchResult['results'] = queryResult.results.map((r) => {
    let name: string | undefined;
    let title: string | undefined;
    let content: string | undefined;

    if (r.type === 'tool' && 'tool' in r) {
      name = r.tool.name;
      // Tool description is stored on the tool object or in versions
      content = (r.tool as { description?: string }).description;
    } else if (r.type === 'guideline' && 'guideline' in r) {
      name = r.guideline.name;
      // Guideline content is stored in the name or via versions (not directly accessible here)
      // Fall back to name as snippet source
      content = r.guideline.name;
    } else if (r.type === 'knowledge' && 'knowledge' in r) {
      title = r.knowledge.title;
      // Knowledge content is fetched via KnowledgeWithContent in the query pipeline
      content = (r.knowledge as { content?: string | null }).content ?? undefined;
    }

    const snippet = content
      ? content.length > 150
        ? content.substring(0, 150) + '...'
        : content
      : undefined;

    return {
      type: r.type,
      id: r.id,
      ...(title ? { title } : {}),
      ...(name ? { name } : {}),
      ...(snippet ? { snippet } : {}),
      score: r.score,
    };
  });

  if (results.length === 0) {
    return {
      action: 'retrieve',
      status: 'not_found',
      message: `No results found for "${query}"`,
      results: [],
      _highlights: `No memories match "${query}"`,
    };
  }

  // Build highlights summary
  const topMatches = results.slice(0, 5);
  const matchNames = topMatches.map((r) => r.name ?? r.title ?? r.id.slice(0, 8)).join(', ');
  const typeBreakdown: Record<string, number> = {};
  for (const r of results) {
    typeBreakdown[r.type] = (typeBreakdown[r.type] ?? 0) + 1;
  }
  const typeSummary = Object.entries(typeBreakdown)
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');

  const _highlights = `Found ${results.length} memories (${typeSummary}): ${matchNames}${results.length > 5 ? '...' : ''}`;

  return {
    action: 'retrieve',
    status: 'success',
    message: `Found ${results.length} result(s) for "${query}"`,
    results,
    _highlights,
  };
}

async function handleSessionStart(
  intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { context, projectId, agentId } = deps;

  if (!projectId) {
    return {
      action: 'session_start',
      status: 'error',
      message: 'No project context. Create or select a project first.',
    };
  }

  const sessionName = intent.sessionName ?? 'Work session';

  const result = await context.repos.sessions.create({
    projectId,
    name: sessionName,
    agentId,
  });

  return {
    action: 'session_start',
    status: 'success',
    message: `Started session: "${sessionName}"`,
    session: {
      id: result.id,
      name: result.name ?? undefined,
      status: 'active',
    },
  };
}

async function handleSessionEnd(
  _intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { context, sessionId } = deps;

  if (!sessionId) {
    return {
      action: 'session_end',
      status: 'error',
      message: 'No active session to end',
    };
  }

  const success = await context.repos.sessions.end(sessionId, 'completed');

  if (!success) {
    return {
      action: 'session_end',
      status: 'error',
      message: 'Failed to end session',
    };
  }

  return {
    action: 'session_end',
    status: 'success',
    message: 'Session ended successfully',
    session: {
      id: sessionId,
      status: 'completed',
    },
  };
}

async function handleList(
  intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { context, projectId } = deps;

  const entryType = intent.entryType ?? 'guideline';
  const results: DispatchResult['results'] = [];

  const scopeFilter = {
    scopeType: projectId ? ('project' as const) : ('global' as const),
    scopeId: projectId,
  };

  if (entryType === 'guideline' || !intent.entryType) {
    const guidelines = await context.repos.guidelines.list(scopeFilter, { limit: 20 });
    for (const g of guidelines) {
      results.push({
        type: 'guideline',
        id: g.id,
        name: g.name,
      });
    }
  }

  if (entryType === 'knowledge' || !intent.entryType) {
    const knowledge = await context.repos.knowledge.list(scopeFilter, { limit: 20 });
    for (const k of knowledge) {
      results.push({
        type: 'knowledge',
        id: k.id,
        title: k.title,
      });
    }
  }

  if (entryType === 'tool' || !intent.entryType) {
    const tools = await context.repos.tools.list(scopeFilter, { limit: 20 });
    for (const t of tools) {
      results.push({
        type: 'tool',
        id: t.id,
        name: t.name,
      });
    }
  }

  return {
    action: 'list',
    status: 'success',
    message: `Found ${results.length} entries`,
    results,
  };
}

function handleForget(intent: IntentDetectionResult, deps: DispatcherDeps): DispatchResult {
  const { projectId, sessionId, agentId } = deps;
  // For safety, forget just finds entries to delete - doesn't auto-delete
  const target = intent.target ?? intent.query ?? '';

  if (!target) {
    return {
      action: 'forget',
      status: 'error',
      message: 'Specify what to forget',
      _context: { projectId, sessionId, agentId },
    };
  }

  // Search for matching entries - return guidance
  return {
    action: 'forget',
    status: 'success',
    message: `To forget "${target}", use the specific memory_* tools with the entry ID. Search for the entry first, then deactivate it.`,
    results: [],
    _context: { projectId, sessionId, agentId },
  };
}

function handleUpdate(): DispatchResult {
  // Update requires knowing which entry to update
  // For now, provide guidance
  return {
    action: 'update',
    status: 'error',
    message:
      'To update an entry, first search for it, then use the specific memory_* tool with the entry ID and new values.',
  };
}

// =============================================================================
// EPISODE HANDLERS
// =============================================================================

async function handleEpisodeBegin(
  intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { context, projectId, sessionId, agentId } = deps;

  if (!context.services.episode) {
    return {
      action: 'episode_begin',
      status: 'error',
      message: 'Episode service not available',
    };
  }

  const name = intent.name ?? intent.content ?? 'Untitled episode';

  // Create and immediately start the episode
  const created = await context.services.episode.create({
    scopeType: 'project',
    scopeId: projectId,
    sessionId,
    name,
    createdBy: agentId,
    triggerType: 'user_request',
  });

  const episode = await context.services.episode.start(created.id);

  return {
    action: 'episode_begin',
    status: 'success',
    message: `Started episode: "${name}"`,
    episode: {
      id: episode.id,
      name: episode.name,
      status: episode.status,
    },
    _context: { projectId, sessionId, agentId },
  };
}

async function handleEpisodeLog(
  intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { context, sessionId, agentId, projectId } = deps;

  if (!context.services.episode) {
    return {
      action: 'episode_log',
      status: 'error',
      message: 'Episode service not available',
    };
  }

  // Try to find the active episode for the session
  const activeEpisode = sessionId
    ? await context.services.episode.getActiveEpisode(sessionId)
    : null;

  if (!activeEpisode) {
    return {
      action: 'episode_log',
      status: 'error',
      message: 'No active episode. Use "begin" or "task:" to start one first.',
    };
  }

  const message = intent.message ?? intent.content ?? 'Checkpoint';
  const eventType = intent.eventType ?? 'checkpoint';

  const event = await context.services.episode.addEvent({
    episodeId: activeEpisode.id,
    eventType,
    name: message,
  });

  return {
    action: 'episode_log',
    status: 'success',
    message: `Logged: ${message}`,
    event: {
      id: event.id,
      message,
    },
    episode: {
      id: activeEpisode.id,
      name: activeEpisode.name,
      status: activeEpisode.status,
    },
    _context: { projectId, sessionId, agentId },
  };
}

async function handleEpisodeComplete(
  intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { context, sessionId, agentId, projectId } = deps;

  if (!context.services.episode) {
    return {
      action: 'episode_complete',
      status: 'error',
      message: 'Episode service not available',
    };
  }

  // Try to find the active episode for the session
  const activeEpisode = sessionId
    ? await context.services.episode.getActiveEpisode(sessionId)
    : null;

  if (!activeEpisode) {
    return {
      action: 'episode_complete',
      status: 'error',
      message: 'No active episode to complete.',
    };
  }

  const outcome = intent.outcome ?? intent.content ?? 'Completed';
  const outcomeType =
    (intent.outcomeType as 'success' | 'partial' | 'failure' | 'abandoned') ?? 'success';

  const episode = await context.services.episode.complete(activeEpisode.id, outcome, outcomeType);

  return {
    action: 'episode_complete',
    status: 'success',
    message: `Episode completed: ${outcome}`,
    episode: {
      id: episode.id,
      name: episode.name,
      status: episode.status,
    },
    _context: { projectId, sessionId, agentId },
  };
}

async function handleEpisodeQuery(
  intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { context, sessionId, projectId, agentId } = deps;

  if (!context.services.episode) {
    return {
      action: 'episode_query',
      status: 'error',
      message: 'Episode service not available',
    };
  }

  const ref = intent.ref ?? intent.query ?? intent.content;

  // If ref looks like an episode ID, query that specific episode
  if (ref && ref.startsWith('ep_')) {
    const result = await context.services.episode.whatHappened(ref);
    const summary = `Episode "${result.episode.name}": ${result.metrics.eventCount} events, ${result.metrics.linkedEntityCount} linked entities`;
    return {
      action: 'episode_query',
      status: 'success',
      message: summary,
      episode: {
        id: result.episode.id,
        name: result.episode.name,
        status: result.episode.status,
      },
      _context: { projectId, sessionId, agentId },
    };
  }

  // Otherwise, get the timeline for the current session
  if (sessionId) {
    const timeline = await context.services.episode.getTimeline(sessionId, {});
    // Group timeline entries by episode
    const episodeIds = [...new Set(timeline.map((t) => t.episodeId))];
    return {
      action: 'episode_query',
      status: 'success',
      message: `Found ${episodeIds.length} episodes with ${timeline.length} events in this session`,
      results: timeline.map((t) => ({
        type: t.type,
        id: t.eventId ?? t.episodeId,
        name: t.name,
      })),
      _context: { projectId, sessionId, agentId },
    };
  }

  return {
    action: 'episode_query',
    status: 'error',
    message: 'Specify an episode ID or ensure you have an active session.',
    _context: { projectId, sessionId, agentId },
  };
}

// =============================================================================
// EXPERIENCE HANDLERS
// =============================================================================

async function handleLearnExperience(
  intent: IntentDetectionResult,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const { context, projectId, sessionId, agentId } = deps;

  const text = intent.text ?? intent.content;

  if (!text) {
    return {
      action: 'learn_experience',
      status: 'error',
      message: 'No content provided. Use: "learn experience: <what you learned>"',
      _context: { projectId, sessionId, agentId },
    };
  }

  if (!context.repos.experiences) {
    return {
      action: 'learn_experience',
      status: 'error',
      message: 'Experience repository not available',
      _context: { projectId, sessionId, agentId },
    };
  }

  const experience = await context.repos.experiences.create({
    scopeType: projectId ? 'project' : 'global',
    scopeId: projectId ?? undefined,
    title: text.length > 50 ? text.substring(0, 47) + '...' : text,
    content: text,
    level: 'case',
    source: 'user',
    createdBy: agentId,
  });

  return {
    action: 'learn_experience',
    status: 'success',
    message: `Learned: "${experience.title}"`,
    entry: {
      id: experience.id,
      type: 'experience',
      title: experience.title,
    },
    _context: { projectId, sessionId, agentId },
  };
}

// =============================================================================
// LIST & STATUS HANDLERS
// =============================================================================

async function handleListEpisodes(deps: DispatcherDeps): Promise<DispatchResult> {
  const { context, projectId, sessionId, agentId } = deps;

  if (!context.services.episode || !context.repos.episodes) {
    return {
      action: 'list_episodes',
      status: 'error',
      message: 'Episode service not available',
    };
  }

  const episodes = await context.repos.episodes.list(
    sessionId
      ? { sessionId }
      : projectId
        ? { projectId }
        : { scopeType: 'global' as const, scopeId: undefined },
    { limit: 20 }
  );

  const results: DispatchResult['results'] = episodes.map((ep) => ({
    type: 'episode',
    id: ep.id,
    name: ep.name,
  }));

  const scope = sessionId ? 'session' : projectId ? 'project' : 'global';

  return {
    action: 'list_episodes',
    status: 'success',
    message: `Found ${episodes.length} episodes in ${scope}`,
    results,
    _context: { projectId, sessionId, agentId },
  };
}

async function handleListSessions(deps: DispatcherDeps): Promise<DispatchResult> {
  const { context, projectId, agentId } = deps;

  if (!projectId) {
    return {
      action: 'list_sessions',
      status: 'error',
      message: 'No project context. Create or select a project first.',
    };
  }

  const sessions = await context.repos.sessions.list({ projectId }, { limit: 20 });

  const results: DispatchResult['results'] = sessions.map((s) => ({
    type: 'session',
    id: s.id,
    name: s.name ?? undefined,
  }));

  return {
    action: 'list_sessions',
    status: 'success',
    message: `Found ${sessions.length} sessions`,
    results,
    _context: { projectId, agentId },
  };
}

async function handleStatus(deps: DispatcherDeps): Promise<DispatchResult> {
  const { context, projectId, sessionId, agentId } = deps;

  const scopeFilter = {
    scopeType: projectId ? ('project' as const) : ('global' as const),
    scopeId: projectId,
  };

  const [guidelines, knowledge, tools] = await Promise.all([
    context.repos.guidelines.list(scopeFilter, { limit: 1 }),
    context.repos.knowledge.list(scopeFilter, { limit: 1 }),
    context.repos.tools.list(scopeFilter, { limit: 1 }),
  ]);

  const guidelineCount = guidelines.length > 0 ? '1+' : '0';
  const knowledgeCount = knowledge.length > 0 ? '1+' : '0';
  const toolCount = tools.length > 0 ? '1+' : '0';

  let activeEpisode: { id: string; name: string } | undefined;
  if (sessionId && context.services.episode) {
    const ep = await context.services.episode.getActiveEpisode(sessionId);
    if (ep) {
      activeEpisode = { id: ep.id, name: ep.name };
    }
  }

  const summary = [
    `Project: ${projectId ? 'connected' : 'none'}`,
    `Session: ${sessionId ? 'active' : 'none'}`,
    activeEpisode ? `Episode: ${activeEpisode.name}` : null,
    `Memory: ${guidelineCount} guidelines, ${knowledgeCount} knowledge, ${toolCount} tools`,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    action: 'status',
    status: 'success',
    message: summary,
    _context: { projectId, sessionId, agentId },
    ...(activeEpisode
      ? {
          episode: {
            id: activeEpisode.id,
            name: activeEpisode.name,
            status: 'active',
          },
        }
      : {}),
  };
}
