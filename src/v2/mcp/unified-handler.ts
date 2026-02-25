/**
 * V2 Unified Memory Handler
 *
 * Single natural language interface to all memory operations.
 * Detects intent via regex patterns and routes to the appropriate v2 handler.
 *
 * Simplified from v1: no LLM intent detection, no episode/experience routing,
 * no dispatcher service. Pure pattern-based routing to v2 handlers.
 */

import type { AppContext } from '../../core/context.js';
import { handleRemember } from './remember-handler.js';
import { handleV2MemoryQuery } from './handlers.js';
import { handleSessionStart, handleSessionEnd, handleSessionList } from './session-handler.js';
import { handleTopicCreate, handleTopicList } from './topic-handler.js';
import { detectProjectFromCwd } from './context-detection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Intent =
  | 'store'
  | 'retrieve'
  | 'session_start'
  | 'session_end'
  | 'list'
  | 'list_sessions'
  | 'topic_create'
  | 'topic_list'
  | 'forget'
  | 'unknown';

export interface IntentMatch {
  intent: Intent;
  confidence: number;
  extractedParams: Record<string, string>;
}

export interface UnifiedParams {
  text: string;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  analyzeOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Intent detection patterns (ported from v1 patterns.ts, simplified)
// ---------------------------------------------------------------------------

const INTENT_PATTERNS: Record<Exclude<Intent, 'unknown'>, RegExp[]> = {
  session_start: [
    /^(start|begin)\s+(a\s+)?(new\s+)?(session|work(ing)?)\s+(on|for)\s+/i,
    /^(let'?s?\s+)?(start|begin)\s+(working\s+on|a\s+session)/i,
    /^working\s+on\s+/i,
    /^new\s+session\s+(for|on)?\s*/i,
  ],
  session_end: [
    /^(end|finish|done|complete|close)\s+(the\s+)?(current\s+)?session/i,
    /^(i'?m\s+)?done\s+(with\s+)?(this|the\s+session|working)/i,
    /^(finish|end)\s+working/i,
    /^session\s+(done|complete|finished|ended)/i,
  ],
  list_sessions: [
    /^(list|show)\s+(all\s+)?(my\s+)?(recent\s+)?sessions?/i,
    /^(my\s+)?sessions?\s*(list)?$/i,
    /^recent\s+sessions?/i,
  ],
  topic_create: [/^(create|start|new)\s+(a\s+)?topic\s+(for|on|about|called)\s+/i, /^topic:\s*/i],
  topic_list: [/^(list|show)\s+(all\s+)?(my\s+)?topics?/i, /^(my\s+)?topics?\s*$/i],
  store: [
    /^remember\s+(that\s+)?/i,
    /^store\s+(this|the|a)?\s*/i,
    /^(add|save)\s+(a\s+)?(new\s+)?(guideline|knowledge|tool|rule|fact)/i,
    /^rule:\s*/i,
    /^guideline:\s*/i,
    /^fact:\s*/i,
    /^(we\s+)?(always|never|should|must)\s+/i,
    /^(our\s+)?(standard|convention|rule|policy)\s+is\s+/i,
    /^(we\s+)?(decided|chose|agreed)\s+(to|that)\s+/i,
  ],
  retrieve: [
    /\?\s*$/i,
    /^(what|how|where|when|why|which)\s+/i,
    /^(what|anything)\s+about\s+/i,
    /^(find|search|look\s+up|get)\s+/i,
    /^(show|tell)\s+(me\s+)?(about\s+)?/i,
    /^(recall|retrieve)\s+/i,
  ],
  forget: [/^(forget|remove|delete)\s+(the\s+)?(old\s+)?/i, /^(clear|erase|purge)\s+/i],
  list: [
    /^(show|list|display)\s+everything\s*$/i,
    /^list\s+(all\s+)?(my\s+)?(the\s+)?/i,
    /^show\s+(all\s+)?(my\s+)?(the\s+)?(guidelines?|knowledge|tools?|rules?)/i,
    /^(get|fetch)\s+(all\s+)?/i,
  ],
};

/**
 * Detect intent from natural language input.
 */
export function detectIntent(text: string): IntentMatch {
  const normalized = text.trim();

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS) as [
    Exclude<Intent, 'unknown'>,
    RegExp[],
  ][]) {
    const matched: string[] = [];
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        matched.push(pattern.source);
      }
    }

    if (matched.length > 0) {
      return {
        intent,
        confidence: Math.min(1, 0.6 + matched.length * 0.15),
        extractedParams: extractParams(normalized, intent),
      };
    }
  }

  // Fallback: questions → retrieve
  if (
    /\?\s*$/.test(normalized) ||
    /^(what|how|where|when|why|which|is|are|do|does|can|could|would|should)\b/i.test(normalized)
  ) {
    return {
      intent: 'retrieve',
      confidence: 0.5,
      extractedParams: { query: normalized },
    };
  }

  return { intent: 'unknown', confidence: 0, extractedParams: {} };
}

/**
 * Extract parameters based on detected intent.
 */
function extractParams(text: string, intent: Exclude<Intent, 'unknown'>): Record<string, string> {
  const params: Record<string, string> = {};

  switch (intent) {
    case 'session_start': {
      const match = text.match(/(?:on|for)\s+["']?([^"'\n]+)["']?\s*$/i);
      if (match?.[1]) {
        params.sessionName = match[1].trim();
      }
      break;
    }
    case 'store': {
      const content = text
        .replace(/^remember\s+(that\s+)?/i, '')
        .replace(/^store\s+(this|the|a)?\s*/i, '')
        .replace(/^(guideline|rule|fact):\s*/i, '')
        .trim();
      params.content = content;
      break;
    }
    case 'retrieve': {
      const query = text
        .replace(
          /^(what|how|where|when|why)\s+(do|does|did|is|are|was|were|should|can|could|would)\s+/i,
          ''
        )
        .replace(/^(what|anything)\s+about\s+/i, '')
        .replace(/^(find|search|look\s+up|get|show|tell\s+me\s+about)\s+/i, '')
        .replace(/^(we|you|i|they)\s+(know|have|store|remember)\s+(about\s+)?/i, '')
        .replace(/^(the|a|an)\s+/i, '')
        .replace(/\?+$/, '')
        .trim();
      params.query = query;
      break;
    }
    case 'forget': {
      const target = text.replace(/^(forget|remove|delete)\s+(the\s+)?(old\s+)?/i, '').trim();
      params.target = target;
      break;
    }
    case 'topic_create': {
      const match = text.match(/(?:for|on|about|called)\s+["']?([^"'\n]+)["']?\s*$/i);
      if (match?.[1]) {
        params.topicName = match[1].trim();
      }
      break;
    }
    default:
      break;
  }

  return params;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireSqlite(context: AppContext) {
  if (!context.sqlite) {
    throw new Error('memory_v2_requires_sqlite_backend');
  }
  return context.sqlite;
}

function resolveProjectId(context: AppContext, providedId?: string): string | null {
  if (providedId) return providedId;
  const sqlite = requireSqlite(context);
  const detected = detectProjectFromCwd(sqlite, process.cwd());
  return detected.projectExternalId;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Process a natural language memory request.
 * Detects intent and routes to the appropriate v2 handler.
 */
export async function handleUnifiedMemory(
  context: AppContext,
  params: UnifiedParams
): Promise<unknown> {
  const { text, analyzeOnly } = params;

  if (!text?.trim()) {
    return {
      error: 'empty_input',
      message: 'Input cannot be empty. Try "Remember that..." or "What do we know about..."',
    };
  }

  if (text.trim().length < 2) {
    return {
      error: 'input_too_short',
      message: `Input "${text.trim()}" is too short. Please provide at least 2 characters.`,
    };
  }

  const detected = detectIntent(text);

  if (analyzeOnly) {
    return {
      analyzed: true,
      intent: detected.intent,
      confidence: detected.confidence,
      extractedParams: detected.extractedParams,
    };
  }

  const projectId = resolveProjectId(context, params.projectId);
  const agentId = params.agentId ?? 'claude-code';

  switch (detected.intent) {
    case 'store': {
      return handleRemember(context, {
        text,
        projectId: projectId ?? undefined,
        agentId,
      });
    }

    case 'retrieve': {
      const query = detected.extractedParams.query ?? text;
      if (!projectId) {
        return { error: 'no_project', message: 'Could not detect project for query.' };
      }
      return handleV2MemoryQuery(context, {
        action: 'search',
        query,
        scope: { type: 'project', id: projectId },
        limit: 20,
      });
    }

    case 'session_start': {
      const sessionName = detected.extractedParams.sessionName ?? text;
      if (!projectId) {
        return { error: 'no_project', message: 'Could not detect project for session.' };
      }
      return handleSessionStart(context, {
        projectId,
        name: sessionName,
        agentId,
      });
    }

    case 'session_end': {
      if (!params.sessionId) {
        return {
          error: 'no_session',
          message: 'No active session to end. Provide sessionId.',
        };
      }
      return handleSessionEnd(context, { sessionScopeId: params.sessionId });
    }

    case 'list_sessions': {
      return handleSessionList(context, {
        projectId: projectId ?? undefined,
        limit: 20,
      });
    }

    case 'topic_create': {
      const topicName =
        detected.extractedParams.topicName ??
        text.replace(/^(create|start|new)\s+(a\s+)?topic\s+(for|on|about|called)\s+/i, '').trim();
      if (!projectId) {
        return { error: 'no_project', message: 'Could not detect project for topic.' };
      }
      return handleTopicCreate(context, {
        projectId,
        name: topicName,
        agentId,
      });
    }

    case 'topic_list': {
      return handleTopicList(context, {
        projectId: projectId ?? undefined,
        limit: 20,
      });
    }

    case 'list': {
      if (!projectId) {
        return { error: 'no_project', message: 'Could not detect project for listing.' };
      }
      return handleV2MemoryQuery(context, {
        action: 'search',
        scope: { type: 'project', id: projectId },
        limit: 50,
      });
    }

    case 'forget': {
      return {
        intent: 'forget',
        message: 'To delete entries, use memory_write with action "delete_entry" and the entry ID.',
        target: detected.extractedParams.target,
      };
    }

    case 'unknown':
    default: {
      return {
        intent: 'unknown',
        message:
          'Could not determine intent. Try:\n' +
          '- "Remember that..." to store\n' +
          '- "What do we know about..." to search\n' +
          '- "Start session for..." to begin working',
        originalText: text,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// MCP handler
// ---------------------------------------------------------------------------

export async function handleV2Memory(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  return handleUnifiedMemory(context, {
    text: params.text as string,
    projectId: params.projectId as string | undefined,
    sessionId: params.sessionId as string | undefined,
    agentId: params.agentId as string | undefined,
    analyzeOnly: params.analyzeOnly as boolean | undefined,
  });
}
