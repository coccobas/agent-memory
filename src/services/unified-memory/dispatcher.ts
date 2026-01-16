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
    | 'update'
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
    score?: number;
  }>;
  session?: {
    id: string;
    name?: string;
    status: string;
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
      case 'forget':
        return handleForget(intent, deps);
      case 'update':
        return handleUpdate();
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

  if (!query) {
    return {
      action: 'retrieve',
      status: 'error',
      message: 'No search query provided',
    };
  }

  // Use proper FTS-based search via query pipeline instead of list+filter
  // This ensures ALL entries are searched, not just the first N
  const queryResult = await executeQueryPipeline(
    {
      search: query,
      types: ['tools', 'guidelines', 'knowledge'],
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
    // Extract name/title from nested entity objects
    let name: string | undefined;
    let title: string | undefined;

    if (r.type === 'tool' && 'tool' in r) {
      name = r.tool.name;
    } else if (r.type === 'guideline' && 'guideline' in r) {
      name = r.guideline.name;
    } else if (r.type === 'knowledge' && 'knowledge' in r) {
      title = r.knowledge.title;
    }

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
