/**
 * memory_suggest tool descriptor
 *
 * Analyzes conversation content and proactively suggests what to store.
 * Returns suggestions for review before storing.
 */

import type { SimpleToolDescriptor } from './types.js';
import { config as appConfig } from '../../config/index.js';

/**
 * Patterns that indicate storeable content
 */
const STOREABLE_PATTERNS = {
  guideline: {
    patterns: [
      { regex: /we (always|never|must|should|shouldn't|don't) ([^.!?]+)/gi, weight: 0.9 },
      { regex: /(rule|standard|requirement|guideline|policy):\s*([^.!?]+)/gi, weight: 0.95 },
      { regex: /(prefer|avoid|require|use) ([a-z]+) (over|instead of) ([^.!?]+)/gi, weight: 0.85 },
      { regex: /don't (use|do|make|create|add) ([^.!?]+)/gi, weight: 0.8 },
      { regex: /(always|never) ([^.!?]+) (in|for|when) ([^.!?]+)/gi, weight: 0.85 },
    ],
    category: 'guideline' as const,
  },
  decision: {
    patterns: [
      { regex: /we (decided|chose|picked|selected) (to )?([^.!?]+)/gi, weight: 0.9 },
      { regex: /(decision|choice):\s*([^.!?]+)/gi, weight: 0.95 },
      { regex: /after (considering|evaluating|comparing)[^,]*,\s*(we )?([^.!?]+)/gi, weight: 0.85 },
      { regex: /going (with|forward with) ([^.!?]+) (because|since|as)/gi, weight: 0.8 },
    ],
    category: 'knowledge' as const,
  },
  fact: {
    patterns: [
      {
        regex: /our (api|system|service|app|application) (uses?|is|has|supports?) ([^.!?]+)/gi,
        weight: 0.85,
      },
      {
        regex: /(the|our) ([a-z]+) (is|are) (located|stored|found) (in|at) ([^.!?]+)/gi,
        weight: 0.8,
      },
      { regex: /we use ([a-z]+) for ([^.!?]+)/gi, weight: 0.75 },
      { regex: /(database|backend|frontend|api) (is|uses) ([^.!?]+)/gi, weight: 0.8 },
    ],
    category: 'knowledge' as const,
  },
  tool: {
    patterns: [
      { regex: /(run|execute|use) `([^`]+)`/gi, weight: 0.9 },
      { regex: /(command|script|cli):\s*`?([^`\n]+)`?/gi, weight: 0.85 },
      { regex: /npm (run|install|test) ([a-z:-]+)/gi, weight: 0.8 },
      { regex: /to (build|test|deploy|run)[^,]*,\s*(run|use|execute) ([^.!?]+)/gi, weight: 0.75 },
    ],
    category: 'tool' as const,
  },
};

interface Suggestion {
  type: 'guideline' | 'knowledge' | 'tool';
  category: string;
  content: string;
  confidence: number;
  reason: string;
  matchedPattern: string;
}

/**
 * Analyze text and extract suggestions
 */
function analyzeSuggestions(text: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();

  for (const [type, config] of Object.entries(STOREABLE_PATTERNS)) {
    for (const { regex, weight } of config.patterns) {
      // Reset regex state
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const content = match[0].trim();
        const normalized = content.toLowerCase();

        // Skip duplicates
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        // Skip very short matches (Task 61: configurable via appConfig.suggest.minContentLength)
        if (content.length < appConfig.suggest.minContentLength) continue;

        suggestions.push({
          type: config.category,
          category: type === 'decision' ? 'decision' : type === 'fact' ? 'fact' : type,
          content,
          confidence: weight,
          reason: `Detected ${type} pattern`,
          matchedPattern: regex.source.slice(0, 50),
        });
      }
    }
  }

  // Sort by confidence
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

export const memorySuggestDescriptor: SimpleToolDescriptor = {
  name: 'memory_suggest',
  visibility: 'core',
  description: `Analyze text and suggest what to store in memory.

Use this to proactively identify storeable content from conversations.
Returns suggestions for review - call memory_remember or the appropriate tool to store.

Example usage:
1. Call memory_suggest with recent conversation text
2. Review suggestions
3. Store approved suggestions with memory_remember

Detects: guidelines, decisions, facts, tools/commands`,
  params: {
    text: {
      type: 'string',
      description: 'Text to analyze for storeable content',
    },
    minConfidence: {
      type: 'number',
      description:
        'Minimum confidence threshold (0-1). Default from AGENT_MEMORY_SUGGEST_MIN_CONFIDENCE env var (0.7).',
    },
    maxSuggestions: {
      type: 'number',
      description:
        'Maximum number of suggestions to return. Default from AGENT_MEMORY_SUGGEST_MAX_SUGGESTIONS env var (5).',
    },
  },
  required: ['text'],
  contextHandler: async (_ctx, args) => {
    const text = args?.text as string;
    if (!text?.trim()) {
      return { error: 'Text is required', suggestions: [] };
    }

    // Task 61: Use config defaults, allow override via args
    const minConfidence = (args?.minConfidence as number) ?? appConfig.suggest.minConfidence;
    const maxSuggestions = (args?.maxSuggestions as number) ?? appConfig.suggest.maxSuggestions;

    // Analyze text
    const allSuggestions = analyzeSuggestions(text);

    // Filter by confidence and limit
    const filteredSuggestions = allSuggestions
      .filter((s) => s.confidence >= minConfidence)
      .slice(0, maxSuggestions);

    if (filteredSuggestions.length === 0) {
      return {
        suggestions: [],
        message: 'No storeable patterns detected above confidence threshold',
        analyzed: {
          textLength: text.length,
          totalMatches: allSuggestions.length,
          minConfidence,
        },
      };
    }

    // Format suggestions with store commands
    const formattedSuggestions = filteredSuggestions.map((s, i) => ({
      index: i + 1,
      type: s.type,
      category: s.category,
      content: s.content,
      confidence: Math.round(s.confidence * 100) + '%',
      storeCommand: {
        tool: 'memory_remember',
        args: {
          text: s.content,
          forceType: s.type,
        },
      },
    }));

    return {
      suggestions: formattedSuggestions,
      message: `Found ${formattedSuggestions.length} suggestion(s). Use memory_remember to store any you approve.`,
      quickStore: {
        description: 'To store all suggestions, call memory_remember for each',
        example: formattedSuggestions[0]?.storeCommand,
      },
    };
  },
};
