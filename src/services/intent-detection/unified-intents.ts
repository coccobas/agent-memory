/**
 * Unified Intent Types
 *
 * Merges Intent (action routing) and QueryIntent (search optimization) into
 * a single taxonomy. See ADR-001 for design rationale.
 */

// =============================================================================
// UNIFIED INTENT TYPE
// =============================================================================

/**
 * Unified intent type combining action intents and query intents.
 *
 * Action intents (from Intent):
 * - store, retrieve, session_start, session_end, forget, list, list_episodes,
 *   list_sessions, status, update, episode_begin, episode_log, episode_complete,
 *   episode_query, learn_experience
 *
 * Query intents (from QueryIntent):
 * - lookup, how_to, debug, explore, compare, configure
 */
export type UnifiedIntent =
  // Action intents
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
  // Query intents
  | 'lookup'
  | 'how_to'
  | 'debug'
  | 'explore'
  | 'compare'
  | 'configure'
  // Fallback
  | 'unknown';

/**
 * Action intents - used for routing to handlers
 */
export type ActionIntent =
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
  | 'unknown';

/**
 * Query intents - used for search optimization
 */
export type QueryIntentType = 'lookup' | 'how_to' | 'debug' | 'explore' | 'compare' | 'configure';

// =============================================================================
// INTENT CLASSIFICATION
// =============================================================================

export function isActionIntent(intent: UnifiedIntent): intent is ActionIntent {
  return [
    'store',
    'retrieve',
    'session_start',
    'session_end',
    'forget',
    'list',
    'list_episodes',
    'list_sessions',
    'status',
    'update',
    'episode_begin',
    'episode_log',
    'episode_complete',
    'episode_query',
    'learn_experience',
    'unknown',
  ].includes(intent);
}

export function isQueryIntent(intent: UnifiedIntent): intent is QueryIntentType {
  return ['lookup', 'how_to', 'debug', 'explore', 'compare', 'configure'].includes(intent);
}

// =============================================================================
// SEARCH CONTEXT (preserves QueryIntent behavior)
// =============================================================================

export type MemoryType = 'guideline' | 'knowledge' | 'tool' | 'experience';

export interface SearchContext {
  types: MemoryType[];
  weights: Map<string, number>;
}

/**
 * Map action intents to query intents for search context.
 * This preserves the QueryIntent behavior when using unified intents.
 */
function mapToQueryIntent(intent: UnifiedIntent): QueryIntentType {
  switch (intent) {
    case 'retrieve':
    case 'list':
    case 'list_episodes':
    case 'list_sessions':
      return 'lookup';
    case 'store':
    case 'update':
      return 'configure';
    case 'episode_query':
    case 'status':
      return 'explore';
    case 'learn_experience':
      return 'debug';
    case 'session_start':
    case 'session_end':
    case 'forget':
    case 'episode_begin':
    case 'episode_log':
    case 'episode_complete':
    case 'unknown':
      return 'explore';
    default:
      if (isQueryIntent(intent)) {
        return intent;
      }
      return 'explore';
  }
}

/**
 * Get memory types in priority order for a query intent.
 * Preserves the exact behavior of QueryIntentClassifier.getMemoryTypesForIntent()
 */
function getMemoryTypesForQueryIntent(intent: QueryIntentType): MemoryType[] {
  switch (intent) {
    case 'how_to':
      return ['guideline', 'experience', 'tool', 'knowledge'];
    case 'debug':
      return ['experience', 'knowledge', 'guideline', 'tool'];
    case 'lookup':
      return ['knowledge', 'guideline', 'tool', 'experience'];
    case 'compare':
      return ['knowledge', 'experience', 'guideline', 'tool'];
    case 'configure':
      return ['guideline', 'tool', 'knowledge', 'experience'];
    case 'explore':
    default:
      return ['knowledge', 'guideline', 'experience', 'tool'];
  }
}

/**
 * Get memory type weights for a query intent.
 * Preserves the exact behavior of QueryIntentClassifier.getMemoryTypeWeights()
 */
function getMemoryTypeWeightsForQueryIntent(intent: QueryIntentType): Map<string, number> {
  const weights = new Map<string, number>();

  switch (intent) {
    case 'how_to':
      weights.set('guideline', 1.0);
      weights.set('experience', 0.8);
      weights.set('tool', 0.6);
      weights.set('knowledge', 0.4);
      break;
    case 'debug':
      weights.set('experience', 1.0);
      weights.set('knowledge', 0.8);
      weights.set('guideline', 0.5);
      weights.set('tool', 0.4);
      break;
    case 'lookup':
      weights.set('knowledge', 1.0);
      weights.set('guideline', 0.7);
      weights.set('tool', 0.5);
      weights.set('experience', 0.3);
      break;
    case 'compare':
      weights.set('knowledge', 1.0);
      weights.set('experience', 0.8);
      weights.set('guideline', 0.5);
      weights.set('tool', 0.3);
      break;
    case 'configure':
      weights.set('guideline', 1.0);
      weights.set('tool', 0.9);
      weights.set('knowledge', 0.6);
      weights.set('experience', 0.4);
      break;
    case 'explore':
    default:
      weights.set('knowledge', 0.8);
      weights.set('guideline', 0.7);
      weights.set('experience', 0.6);
      weights.set('tool', 0.5);
      break;
  }

  return weights;
}

/**
 * Get search context for any unified intent.
 * This is the main entry point for search optimization.
 *
 * @param intent - Any unified intent (action or query)
 * @returns Search context with memory types in priority order and weights
 */
export function getSearchContextForIntent(intent: UnifiedIntent): SearchContext {
  const queryIntent = mapToQueryIntent(intent);
  return {
    types: getMemoryTypesForQueryIntent(queryIntent),
    weights: getMemoryTypeWeightsForQueryIntent(queryIntent),
  };
}

// =============================================================================
// BACKWARD COMPATIBILITY
// =============================================================================

/**
 * @deprecated Use UnifiedIntent instead. Will be removed in next major version.
 */
export type Intent = ActionIntent;

/**
 * @deprecated Use QueryIntentType or UnifiedIntent instead. Will be removed in next major version.
 */
export type QueryIntent = QueryIntentType;
