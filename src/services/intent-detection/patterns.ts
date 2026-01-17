/**
 * Intent Detection Patterns
 *
 * Regex-based patterns for detecting user intent from natural language.
 * No LLM needed for basic operations - pattern matching is fast and deterministic.
 */

// =============================================================================
// INTENT TYPES
// =============================================================================

export type Intent =
  | 'store'
  | 'retrieve'
  | 'session_start'
  | 'session_end'
  | 'forget'
  | 'list'
  | 'update'
  | 'episode_begin'
  | 'episode_log'
  | 'episode_complete'
  | 'episode_query'
  | 'unknown';

export interface IntentMatch {
  intent: Intent;
  confidence: number;
  patterns: string[];
  extractedParams: Record<string, string>;
}

// =============================================================================
// PATTERN DEFINITIONS
// =============================================================================

/**
 * Intent patterns - ordered by specificity (most specific first)
 */
const INTENT_PATTERNS: Record<Intent, RegExp[]> = {
  // Session management
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

  // Episode management
  episode_begin: [
    /^(starting|start|begin|beginning)\s+(work\s+on\s+|fixing\s+|implementing\s+|task:?\s+)/i,
    /^(new\s+)?episode:?\s+/i,
    /^task:?\s+/i,
    /^working\s+on:?\s+/i,
  ],
  episode_log: [
    /^(log|note|checkpoint):?\s+/i,
    /^(logged|noted):?\s+/i,
    /^progress:?\s+/i, // Note: "update" without colon handled by update intent
    /^(found|discovered|realized)\s+(that\s+)?/i,
    /^(decided|choosing|picked)\s+(to\s+)?/i,
  ],
  episode_complete: [
    /^(finished|completed|done\s+with)\s+(the\s+)?(episode|task)/i,
    /^(episode|task)\s+(finished|completed|done)/i,
    /^(success|failure|failed):?\s+/i,
    /^(outcome):?\s+/i,
  ],
  episode_query: [
    /^what\s+happened\s+(during|in)\s+/i,
    /^(show|tell\s+me)\s+what\s+happened/i,
    /^(trace|follow)\s+(the\s+)?(causes?|chain)/i,
    /^(timeline|history)\s+(of|for)\s+/i,
  ],

  // Storage operations
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

  // Retrieval operations
  retrieve: [
    /\?\s*$/i, // Questions ending with ? are retrieval
    /^(what|how|where|when|why|which)\s+/i, // Question words at start (relaxed - no verb requirement)
    /^(what|how|where|when|why)\s+(do|does|did|is|are|was|were|should|can|could|would)\s+/i,
    /^(what|anything)\s+about\s+/i,
    /^(find|search|look\s+up|get)\s+/i,
    /^(show|tell)\s+(me\s+)?(about\s+)?/i,
    /^(do\s+we\s+have|is\s+there)\s+(any\s+)?(info|information|knowledge|guidelines?)\s+/i,
    /^(what'?s?\s+)?(the|our)\s+/i,
    /^(recall|retrieve)\s+/i,
  ],

  // Deletion/forgetting
  forget: [
    /^(forget|remove|delete)\s+(the\s+)?(old\s+)?/i,
    /^(don'?t\s+)?remember\s+/i,
    /^(clear|erase|purge)\s+/i,
    /^(obsolete|outdated):\s*/i,
  ],

  // Listing
  list: [
    /^list\s+(all\s+)?(my\s+)?(the\s+)?/i,
    /^show\s+(all\s+)?(my\s+)?(the\s+)?(guidelines?|knowledge|tools?|rules?)/i,
    /^(what|which)\s+(guidelines?|knowledge|tools?|rules?)\s+(do\s+we\s+have|are\s+there)/i,
    /^(get|fetch)\s+(all\s+)?/i,
  ],

  // Update operations
  update: [/^update\s+(the\s+)?/i, /^(change|modify|edit)\s+(the\s+)?/i, /^(revise|correct)\s+/i],

  // Unknown - no patterns, fallback
  unknown: [],
};

/**
 * Entry type detection patterns
 */
const ENTRY_TYPE_PATTERNS: Record<'guideline' | 'knowledge' | 'tool', RegExp[]> = {
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

/**
 * Category detection patterns
 */
const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  security: [/\b(security|auth|password|token|encrypt|secret|permission)\b/i],
  code_style: [/\b(style|format|naming|indent|lint|prettier|eslint)\b/i],
  testing: [/\b(test|spec|coverage|mock|jest|vitest|pytest)\b/i],
  performance: [/\b(performance|optimize|fast|slow|memory|cache)\b/i],
  workflow: [/\b(workflow|process|deploy|ci\/cd|pipeline)\b/i],
  decision: [/\b(decided|chose|selected|picked|went\s+with)\b/i],
  fact: [/\b(uses|runs\s+on|is\s+a|architecture|structure)\b/i],
};

/**
 * Episode trigger patterns - detect work-intent from session names
 * Used to auto-create episodes when session name indicates substantive work
 */
export type EpisodeTriggerType = 'bug_fix' | 'feature' | 'refactor' | 'investigation' | 'implementation';

const EPISODE_TRIGGER_PATTERNS: Record<EpisodeTriggerType, RegExp[]> = {
  bug_fix: [
    /\b(fix|debug|investigate|troubleshoot|resolve|diagnose)\b.*\b(bug|issue|error|problem|crash|failure)\b/i,
    /\b(bug|issue|error|problem)\b.*\b(fix|resolve|solve|repair)\b/i,
    /\bfixing\b/i,
    /\bdebugging\b/i,
  ],
  feature: [
    /\b(add|create|build|implement|develop)\b.*\b(feature|functionality|capability|support)\b/i,
    /\b(new)\b.*\b(feature|endpoint|component|api|page|view)\b/i,
    /\badding\b.*\b(support|handling)\b/i,
  ],
  refactor: [
    /\b(refactor|restructure|reorganize|clean\s*up|simplify|modernize)\b/i,
    /\b(improve|optimize)\b.*\b(code|structure|architecture)\b/i,
    /\brefactoring\b/i,
  ],
  investigation: [
    /\b(investigate|research|explore|understand|analyze|study)\b/i,
    /\b(figure\s+out|look\s+into|dig\s+into)\b/i,
    /\b(why|how)\b.*\b(work|happen|fail)\b/i,
  ],
  implementation: [
    /\b(implement|wire\s*up|connect|integrate|set\s*up)\b/i,
    /\b(implementing|setting\s+up|wiring)\b/i,
    /\b(add|create)\b.*\b(handler|service|endpoint|component)\b/i,
  ],
};

/**
 * Patterns that indicate trivial/non-episode-worthy sessions
 */
const EPISODE_EXCLUDE_PATTERNS: RegExp[] = [
  /^(test|check|look|see|view|show|list|get)\b/i,
  /^(quick|simple|small|minor)\b/i,
  /\b(question|ask|help)\b/i,
];

export interface EpisodeTriggerMatch {
  shouldCreate: boolean;
  triggerType: EpisodeTriggerType | null;
  confidence: number;
  matchedPatterns: string[];
}

/**
 * Detect if a session name should trigger episode auto-creation
 */
export function detectEpisodeTrigger(sessionName: string): EpisodeTriggerMatch {
  const text = sessionName.trim();

  // Check exclusion patterns first
  for (const pattern of EPISODE_EXCLUDE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        shouldCreate: false,
        triggerType: null,
        confidence: 0,
        matchedPatterns: [],
      };
    }
  }

  // Check trigger patterns
  for (const [triggerType, patterns] of Object.entries(EPISODE_TRIGGER_PATTERNS) as [
    EpisodeTriggerType,
    RegExp[],
  ][]) {
    const matchedPatterns: string[] = [];
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        matchedPatterns.push(pattern.source);
      }
    }

    if (matchedPatterns.length > 0) {
      // Confidence: base 0.7 + 0.1 per additional match, max 0.95
      const confidence = Math.min(0.95, 0.7 + (matchedPatterns.length - 1) * 0.1);
      return {
        shouldCreate: true,
        triggerType,
        confidence,
        matchedPatterns,
      };
    }
  }

  // No match - but if it's a reasonably descriptive name (3+ words), still suggest
  const wordCount = text.split(/\s+/).length;
  if (wordCount >= 3) {
    return {
      shouldCreate: true,
      triggerType: null,
      confidence: 0.5,
      matchedPatterns: ['descriptive_name_heuristic'],
    };
  }

  return {
    shouldCreate: false,
    triggerType: null,
    confidence: 0,
    matchedPatterns: [],
  };
}

// =============================================================================
// PATTERN MATCHING
// =============================================================================

/**
 * Detect intent from natural language input
 */
export function detectIntent(text: string): IntentMatch {
  const normalizedText = text.trim();

  // Try each intent pattern in order of specificity
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS) as [Intent, RegExp[]][]) {
    if (intent === 'unknown') continue;

    const matchedPatterns: string[] = [];
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        matchedPatterns.push(pattern.source);
      }
    }

    if (matchedPatterns.length > 0) {
      return {
        intent,
        confidence: Math.min(1, 0.6 + matchedPatterns.length * 0.15),
        patterns: matchedPatterns,
        extractedParams: extractParams(normalizedText, intent),
      };
    }
  }

  // Check for question indicators BEFORE falling back to store
  // Questions ending with ? or starting with question words should be retrieve
  if (
    /\?\s*$/.test(normalizedText) ||
    /^(what|how|where|when|why|which|is|are|do|does|can|could|would|should)\b/i.test(normalizedText)
  ) {
    return {
      intent: 'retrieve',
      confidence: 0.5,
      patterns: ['question_indicator_fallback'],
      extractedParams: { query: normalizedText },
    };
  }

  // Try to infer from entry type mentions (only for non-questions)
  const entryType = detectEntryType(normalizedText);
  if (entryType) {
    // Likely a store operation if entry type is mentioned and not a question
    return {
      intent: 'store',
      confidence: 0.5,
      patterns: [],
      extractedParams: { entryType, content: normalizedText },
    };
  }

  return {
    intent: 'unknown',
    confidence: 0,
    patterns: [],
    extractedParams: {},
  };
}

/**
 * Detect entry type from text
 */
export function detectEntryType(text: string): 'guideline' | 'knowledge' | 'tool' | undefined {
  const scores: Record<string, number> = {
    guideline: 0,
    knowledge: 0,
    tool: 0,
  };

  for (const [type, patterns] of Object.entries(ENTRY_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        if (type in scores) {
          scores[type] = (scores[type] ?? 0) + 1;
        }
      }
    }
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return undefined;

  const winner = Object.entries(scores).find(([, score]) => score === maxScore)?.[0];
  return winner as 'guideline' | 'knowledge' | 'tool' | undefined;
}

/**
 * Detect category from text
 */
export function detectCategory(text: string): string | undefined {
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return category;
      }
    }
  }
  return undefined;
}

/**
 * Extract parameters based on intent
 */
function extractParams(text: string, intent: Intent): Record<string, string> {
  const params: Record<string, string> = {};

  switch (intent) {
    case 'session_start': {
      // Extract session name from "start working on X" or similar
      const match = text.match(/(?:on|for)\s+["']?([^"'\n]+)["']?\s*$/i);
      if (match && match[1]) {
        params.sessionName = match[1].trim();
      }
      break;
    }
    case 'store': {
      // Extract content after trigger phrases
      const content = text
        .replace(/^remember\s+(that\s+)?/i, '')
        .replace(/^store\s+(this|the|a)?\s*/i, '')
        .replace(/^(guideline|rule|fact):\s*/i, '')
        .trim();
      params.content = content;
      params.entryType = detectEntryType(text) ?? 'knowledge';
      params.category = detectCategory(text) ?? 'fact';
      break;
    }
    case 'retrieve': {
      // Extract search query - progressively strip common question patterns
      const query = text
        .replace(
          /^(what|how|where|when|why)\s+(do|does|did|is|are|was|were|should|can|could|would)\s+/i,
          ''
        )
        .replace(/^(what|anything)\s+about\s+/i, '')
        .replace(/^(find|search|look\s+up|get|show|tell\s+me\s+about)\s+/i, '')
        // Clean up "we/you/I know about", "we have about", etc.
        .replace(/^(we|you|i|they)\s+(know|have|store|remember)\s+(about\s+)?/i, '')
        // Clean up leftover "I/we" after "How should I/we..." extraction
        .replace(/^(i|we)\s+/i, '')
        // Clean up trailing question words
        .replace(/\?+$/, '')
        .trim();
      params.query = query;
      break;
    }
    case 'forget': {
      // Extract what to forget
      const target = text.replace(/^(forget|remove|delete)\s+(the\s+)?(old\s+)?/i, '').trim();
      params.target = target;
      break;
    }
    case 'list': {
      // Detect what to list
      const entryType = detectEntryType(text);
      if (entryType) {
        params.entryType = entryType;
      }
      break;
    }
    case 'update': {
      // Extract target
      const target = text.replace(/^(update|change|modify|edit)\s+(the\s+)?/i, '').trim();
      params.target = target;
      break;
    }
    case 'episode_begin': {
      // Extract episode name from "starting task: X" or "working on: X"
      const name = text
        .replace(
          /^(starting|start|begin|beginning)\s+(work\s+on\s+|fixing\s+|implementing\s+|task:?\s+)/i,
          ''
        )
        .replace(/^(new\s+)?episode:?\s+/i, '')
        .replace(/^task:?\s+/i, '')
        .replace(/^working\s+on:?\s+/i, '')
        .trim();
      params.name = name;
      break;
    }
    case 'episode_log': {
      // Extract message from "log: X" or "checkpoint: X"
      const message = text
        .replace(/^(log|note|checkpoint|logged|noted|progress|update):?\s+/i, '')
        .replace(/^(found|discovered|realized)\s+(that\s+)?/i, '')
        .replace(/^(decided|choosing|picked)\s+(to\s+)?/i, '')
        .trim();
      params.message = message;
      // Detect event type from trigger words
      if (/^(decided|choosing|picked)/i.test(text)) {
        params.eventType = 'decision';
      } else if (/^(found|discovered|realized)/i.test(text)) {
        params.eventType = 'checkpoint';
      }
      break;
    }
    case 'episode_complete': {
      // Extract outcome from "finished task: X" or "success: X"
      const outcome = text
        .replace(/^(finished|completed|done\s+with)\s+(the\s+)?(episode|task):?\s*/i, '')
        .replace(/^(episode|task)\s+(finished|completed|done):?\s*/i, '')
        .replace(/^(success|failure|failed|outcome):?\s*/i, '')
        .trim();
      params.outcome = outcome;
      // Detect outcome type
      if (/^(success)/i.test(text)) {
        params.outcomeType = 'success';
      } else if (/^(failure|failed)/i.test(text)) {
        params.outcomeType = 'failure';
      }
      break;
    }
    case 'episode_query': {
      // Extract episode reference from "what happened during X"
      const ref = text
        .replace(/^what\s+happened\s+(during|in)\s+/i, '')
        .replace(/^(show|tell\s+me)\s+what\s+happened\s+(during|in)?\s*/i, '')
        .replace(/^(trace|follow)\s+(the\s+)?(causes?|chain)\s+(of|for)?\s*/i, '')
        .replace(/^(timeline|history)\s+(of|for)\s+/i, '')
        .trim();
      params.ref = ref;
      break;
    }
  }

  return params;
}

/**
 * Extract title/name from content for storage
 */
export function extractTitleFromContent(content: string, maxLength: number = 50): string {
  // Try to extract a meaningful title from the content
  const lines = content.split('\n');
  let title = (lines[0] ?? '').trim();

  // Remove common prefixes
  title = title
    .replace(/^(we\s+)?(always|never|should|must)\s+/i, '')
    .replace(/^(our\s+)?(standard|rule)\s+(is\s+)?/i, '')
    .replace(/^(the\s+)?/i, '');

  // Truncate if too long
  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + '...';
  }

  return title || 'Untitled';
}
