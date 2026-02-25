/**
 * V2 Remember Handler
 *
 * Natural language interface for storing memories.
 * Classifies text into guideline/knowledge/tool using regex patterns,
 * infers category, and stores via v2 write plane.
 *
 * Simplified from v1: no LLM classification, no experience triggers,
 * no audit logging, no notification service. Pure pattern-based.
 */

import type { AppContext } from '../../core/context.js';
import type { EntryType, ScopeRef } from '../contracts/index.js';
import { getRuntime } from './handlers.js';
import { detectProjectFromCwd, ensureProjectScope } from './context-detection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RememberParams {
  text: string;
  forceType?: 'guideline' | 'knowledge' | 'tool';
  priority?: number;
  tags?: string[];
  projectId?: string;
  agentId?: string;
}

export interface RememberResult {
  success: boolean;
  stored?: {
    type: EntryType;
    id: string;
    title: string;
    category: string;
    projectId: string | null;
  };
  classification?: {
    type: EntryType;
    confidence: number;
    wasForced: boolean;
  };
  error?: string;
  message?: string;
  _display?: string;
}

// ---------------------------------------------------------------------------
// Pure classification functions
// ---------------------------------------------------------------------------

/**
 * Extract the core content from natural language, stripping common prefixes.
 */
export function extractContent(text: string): { title: string; content: string } {
  const normalized = text.trim();

  const prefixes = [
    /^(remember|store|save|note) (that )?/i,
    /^(this is a |here's a )?(rule|guideline|fact|note)[\s:]+/i,
    /^(the fact (is|that) )/i,
  ];

  let content = normalized;
  for (const prefix of prefixes) {
    content = content.replace(prefix, '');
  }

  const firstLine = content.split(/[\r\n]+/)[0]?.trim() ?? content.trim();
  const firstSentence = (firstLine.split(/[.!?]/)[0] ?? firstLine).trim();

  let title = firstSentence || firstLine || content.trim() || 'Untitled';

  if (title.length > 80) {
    const cutPoint = title.lastIndexOf(' ', 77);
    title = cutPoint > 40 ? title.slice(0, cutPoint) + '...' : title.slice(0, 77) + '...';
  }

  return { title, content: content.trim() };
}

/**
 * Detect entry type from text using keyword patterns.
 */
export function detectEntryType(text: string): 'guideline' | 'knowledge' | 'tool' | undefined {
  const scores: Record<string, number> = { guideline: 0, knowledge: 0, tool: 0 };

  const patterns: Record<string, RegExp[]> = {
    guideline: [
      /\b(guidelines?|rules?|standards?|conventions?|policies?|must|should|always|never)\b/i,
      /\b(best\s+practices?|coding\s+style|code\s+style)\b/i,
    ],
    knowledge: [
      /\b(knowledge|facts?|decisions?|contexts?|references?|chose|decided|uses|architecture)\b/i,
      /\b(we\s+use|the\s+system|project\s+uses)\b/i,
    ],
    tool: [
      /\b(tools?|commands?|scripts?|cli|functions?|apis?|mcp)\b/i,
      /\b(npm|npx|yarn|pnpm|docker|git)\b/i,
    ],
  };

  for (const [type, typePatterns] of Object.entries(patterns)) {
    for (const pattern of typePatterns) {
      if (pattern.test(text)) {
        scores[type] = (scores[type] ?? 0) + 1;
      }
    }
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return undefined;

  const winner = Object.entries(scores).find(([, score]) => score === maxScore)?.[0];
  return winner as 'guideline' | 'knowledge' | 'tool' | undefined;
}

/**
 * Infer category from content based on entry type.
 */
export function inferCategory(
  entryType: 'guideline' | 'knowledge' | 'tool',
  content: string
): string {
  const lower = content.toLowerCase();

  if (entryType === 'guideline') {
    if (/security|auth|password|token|secret/i.test(lower)) return 'security';
    if (/style|format|naming|convention/i.test(lower)) return 'code_style';
    if (/test|spec|coverage/i.test(lower)) return 'testing';
    if (/performance|optimize|fast/i.test(lower)) return 'performance';
    return 'workflow';
  }

  if (entryType === 'knowledge') {
    if (/decided|chose|because|reason/i.test(lower)) return 'decision';
    if (/architecture|design|pattern/i.test(lower)) return 'architecture';
    return 'fact';
  }

  if (entryType === 'tool') {
    if (/npm|yarn|pnpm/i.test(lower)) return 'cli';
    if (/api|endpoint|http/i.test(lower)) return 'api';
    return 'cli';
  }

  return 'general';
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function requireSqlite(context: AppContext) {
  if (!context.sqlite) {
    throw new Error('memory_v2_requires_sqlite_backend');
  }
  return context.sqlite;
}

/**
 * Handle a "remember" request: classify and store text as a v2 entry.
 */
export async function handleRemember(
  context: AppContext,
  params: RememberParams
): Promise<RememberResult> {
  const { text, forceType, priority = 50, tags = [] } = params;

  if (!text?.trim()) {
    return { success: false, error: 'text_required', message: 'Please provide text to remember' };
  }

  const { title, content } = extractContent(text);
  if (content.length < 3) {
    return {
      success: false,
      error: 'content_too_short',
      message: `Content must be at least 3 characters after removing prefixes. Got: "${content}"`,
    };
  }

  // Validate priority
  if (priority < 0 || priority > 100) {
    return {
      success: false,
      error: 'invalid_priority',
      message: 'Priority must be between 0 and 100',
    };
  }

  // Classify
  const detectedType = forceType ?? detectEntryType(text) ?? 'knowledge';
  const confidence = forceType ? 1.0 : detectEntryType(text) ? 0.7 : 0.5;
  const category = inferCategory(detectedType, content);

  // Resolve project scope
  const sqlite = requireSqlite(context);
  let projectExternalId = params.projectId ?? null;

  if (!projectExternalId) {
    const detected = detectProjectFromCwd(sqlite, process.cwd());
    projectExternalId = detected.projectExternalId;
  }

  if (!projectExternalId) {
    return {
      success: false,
      error: 'no_project',
      message: 'Could not detect project from working directory. Please specify projectId.',
    };
  }

  // Ensure the project scope exists
  ensureProjectScope(sqlite, projectExternalId);

  // Build scope ref
  const scope: ScopeRef = { type: 'project', id: projectExternalId };
  const agentId = params.agentId ?? 'claude-code';

  // Build name slug for guideline/tool types
  const nameSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 50);

  // Store via v2 write plane
  const runtime = getRuntime(context);

  const entry = await runtime.memory.write.upsertEntry({
    actorId: agentId,
    data: {
      type: detectedType,
      title,
      content,
      source: 'remember',
      scope,
      category,
      tags: tags.length > 0 ? tags.map((t) => t.trim().toLowerCase()) : undefined,
      metadata: { nameSlug },
      ...(detectedType === 'guideline' ? { priority } : {}),
    },
  });

  const typeIcon = detectedType === 'guideline' ? '📋' : detectedType === 'knowledge' ? '💡' : '🔧';
  const truncatedTitle = title.length > 50 ? title.slice(0, 47) + '...' : title;
  const confidenceStr = confidence < 0.7 ? ` (${Math.round(confidence * 100)}% confidence)` : '';

  return {
    success: true,
    stored: {
      type: detectedType,
      id: entry.ref.id,
      title,
      category,
      projectId: projectExternalId,
    },
    classification: {
      type: detectedType,
      confidence,
      wasForced: !!forceType,
    },
    _display: `${typeIcon} Stored ${detectedType} (${category})${confidenceStr}\n📝 ${truncatedTitle}`,
  };
}

// ---------------------------------------------------------------------------
// MCP handler
// ---------------------------------------------------------------------------

export async function handleV2MemoryRemember(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  return handleRemember(context, {
    text: params.text as string,
    forceType: params.forceType as RememberParams['forceType'],
    priority: params.priority as number | undefined,
    tags: params.tags as string[] | undefined,
    projectId: params.projectId as string | undefined,
    agentId: params.agentId as string | undefined,
  });
}
