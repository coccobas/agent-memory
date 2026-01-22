/**
 * Confidence Booster - Post-extraction confidence adjustment
 *
 * Analyzes input context for high-signal linguistic patterns and boosts
 * extraction confidence accordingly. This compensates for LLM underscoring
 * of clear decision/rule statements.
 *
 * Pattern categories:
 * - Decision patterns: "instead of X, Y", "we decided", "tests suggest"
 * - Rule patterns: "always", "never", "must", "should"
 * - Evidence patterns: "because", "due to", "since", "tests show"
 * - Comparison patterns: "better", "worse", "performs", "faster", "slower"
 *
 * @module extraction/confidence-booster
 */

import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('confidence-booster');

// =============================================================================
// TYPES
// =============================================================================

export interface BoostPattern {
  /** Pattern name for logging */
  name: string;
  /** Regex or string patterns to match */
  patterns: (RegExp | string)[];
  /** Confidence boost to apply (0-1, added to existing confidence) */
  boost: number;
  /** Maximum confidence after boost (prevents over-boosting) */
  maxConfidence?: number;
  /** Entry types this pattern applies to */
  appliesTo?: ('guideline' | 'knowledge' | 'tool')[];
}

export interface BoostResult {
  /** Original confidence score */
  originalConfidence: number;
  /** Boosted confidence score */
  boostedConfidence: number;
  /** Patterns that matched */
  matchedPatterns: string[];
  /** Total boost applied */
  totalBoost: number;
}

export interface ExtractedEntry {
  type: 'guideline' | 'knowledge' | 'tool';
  name?: string;
  title?: string;
  content: string;
  category?: string;
  priority?: number;
  confidence: number;
  rationale?: string;
  suggestedTags?: string[];
}

// =============================================================================
// DEFAULT PATTERNS
// =============================================================================

/**
 * Default boost patterns for confidence adjustment.
 *
 * These patterns indicate high-signal content that LLMs often underscore.
 */
export const DEFAULT_BOOST_PATTERNS: BoostPattern[] = [
  // Decision patterns - clear choices made
  {
    name: 'decision-instead',
    patterns: [/\binstead of\b/i, /\brather than\b/i],
    boost: 0.25,
    maxConfidence: 0.9,
    appliesTo: ['knowledge'],
  },
  {
    name: 'decision-explicit',
    patterns: [/\bwe decided\b/i, /\bdecided to\b/i, /\bour decision\b/i],
    boost: 0.3,
    maxConfidence: 0.95,
    appliesTo: ['knowledge'],
  },
  {
    name: 'decision-choice',
    patterns: [/\bchose\b/i, /\bselected\b/i, /\bpicked\b/i, /\bwent with\b/i],
    boost: 0.2,
    maxConfidence: 0.85,
    appliesTo: ['knowledge'],
  },

  // Evidence patterns - backed by data/testing
  {
    name: 'evidence-tests',
    patterns: [
      /\btests suggest\b/i,
      /\btests show\b/i,
      /\btesting revealed\b/i,
      /\bbenchmarks show\b/i,
    ],
    boost: 0.25,
    maxConfidence: 0.9,
    appliesTo: ['knowledge'],
  },
  {
    name: 'evidence-results',
    patterns: [/\bresults show\b/i, /\bdata shows\b/i, /\bwe found that\b/i],
    boost: 0.2,
    maxConfidence: 0.85,
    appliesTo: ['knowledge'],
  },

  // Comparison patterns - performance claims
  {
    name: 'comparison-performance',
    patterns: [
      /\bperforms better\b/i,
      /\bperforms much better\b/i,
      /\bperforms worse\b/i,
      /\bfaster than\b/i,
      /\bslower than\b/i,
      /\bmore efficient\b/i,
      /\bless efficient\b/i,
    ],
    boost: 0.2,
    maxConfidence: 0.85,
    appliesTo: ['knowledge'],
  },
  {
    name: 'comparison-quality',
    patterns: [
      /\bbetter than\b/i,
      /\bworse than\b/i,
      /\bsuperior to\b/i,
      /\binferior to\b/i,
      /\bmore reliable\b/i,
    ],
    boost: 0.15,
    maxConfidence: 0.85,
    appliesTo: ['knowledge'],
  },

  // Rule patterns - explicit guidelines
  {
    name: 'rule-imperative',
    patterns: [/\balways use\b/i, /\bnever use\b/i, /\bmust use\b/i, /\bshould use\b/i],
    boost: 0.3,
    maxConfidence: 0.95,
    appliesTo: ['guideline'],
  },
  {
    name: 'rule-prohibition',
    patterns: [/\bdon't use\b/i, /\bavoid using\b/i, /\bnever\b.*\buse\b/i],
    boost: 0.25,
    maxConfidence: 0.9,
    appliesTo: ['guideline'],
  },
  {
    name: 'rule-standard',
    patterns: [/\bour standard is\b/i, /\bwe always\b/i, /\bwe never\b/i],
    boost: 0.25,
    maxConfidence: 0.9,
    appliesTo: ['guideline'],
  },

  // Preference with evidence
  {
    name: 'preference-with-reason',
    patterns: [
      /\bprefer\b.*\bbecause\b/i,
      /\buse\b.*\bdue to\b/i,
      /\bchose\b.*\bsince\b/i,
      /\bbetter\b.*\bbecause\b/i,
    ],
    boost: 0.2,
    maxConfidence: 0.85,
    appliesTo: ['knowledge', 'guideline'],
  },
];

// =============================================================================
// BOOSTER CLASS
// =============================================================================

export class ConfidenceBooster {
  private patterns: BoostPattern[];

  constructor(patterns: BoostPattern[] = DEFAULT_BOOST_PATTERNS) {
    this.patterns = patterns;
  }

  /**
   * Analyze context and return applicable boost patterns.
   */
  analyzeContext(context: string): { pattern: BoostPattern; match: string }[] {
    const matches: { pattern: BoostPattern; match: string }[] = [];

    for (const pattern of this.patterns) {
      for (const p of pattern.patterns) {
        const regex = typeof p === 'string' ? new RegExp(p, 'i') : p;
        const match = context.match(regex);
        if (match) {
          matches.push({ pattern, match: match[0] });
          break; // Only count each pattern once
        }
      }
    }

    return matches;
  }

  /**
   * Boost confidence for a single entry based on context patterns.
   */
  boostEntry(entry: ExtractedEntry, context: string): BoostResult {
    const matches = this.analyzeContext(context);
    let totalBoost = 0;
    const matchedPatterns: string[] = [];

    for (const { pattern, match } of matches) {
      // Check if pattern applies to this entry type
      if (pattern.appliesTo && !pattern.appliesTo.includes(entry.type)) {
        continue;
      }

      totalBoost += pattern.boost;
      matchedPatterns.push(`${pattern.name}: "${match}"`);

      logger.debug(
        {
          pattern: pattern.name,
          match,
          boost: pattern.boost,
          entryType: entry.type,
        },
        'Pattern matched for confidence boost'
      );
    }

    // Calculate boosted confidence with diminishing returns for multiple matches
    // Formula: original + (totalBoost * diminishingFactor)
    // Diminishing factor prevents stacking from going too high
    const diminishingFactor = Math.min(1, 1 / Math.sqrt(matchedPatterns.length || 1));
    const effectiveBoost = totalBoost * diminishingFactor;

    // Find the lowest maxConfidence from matched patterns
    const maxConfidence = matches.reduce((min, { pattern }) => {
      const patternMax = pattern.maxConfidence ?? 1;
      return Math.min(min, patternMax);
    }, 1);

    const boostedConfidence = Math.min(
      maxConfidence,
      Math.min(1, entry.confidence + effectiveBoost)
    );

    if (matchedPatterns.length > 0) {
      logger.info(
        {
          entryType: entry.type,
          originalConfidence: entry.confidence,
          boostedConfidence,
          matchedPatterns,
          totalBoost,
          effectiveBoost,
        },
        'Confidence boosted based on context patterns'
      );
    }

    return {
      originalConfidence: entry.confidence,
      boostedConfidence,
      matchedPatterns,
      totalBoost: effectiveBoost,
    };
  }

  /**
   * Boost confidence for all entries in an extraction result.
   */
  boostEntries<T extends ExtractedEntry>(entries: T[], context: string): T[] {
    return entries.map((entry) => {
      const result = this.boostEntry(entry, context);
      return {
        ...entry,
        confidence: result.boostedConfidence,
      };
    });
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a confidence booster with optional custom patterns.
 */
export function createConfidenceBooster(
  patterns: BoostPattern[] = DEFAULT_BOOST_PATTERNS
): ConfidenceBooster {
  return new ConfidenceBooster(patterns);
}

/**
 * Singleton instance for default usage.
 */
let defaultBooster: ConfidenceBooster | null = null;

/**
 * Get the default confidence booster instance.
 */
export function getDefaultConfidenceBooster(): ConfidenceBooster {
  if (!defaultBooster) {
    defaultBooster = createConfidenceBooster();
  }
  return defaultBooster;
}

/**
 * Convenience function to boost entries using the default booster.
 */
export function boostExtractionConfidence<T extends ExtractedEntry>(
  entries: T[],
  context: string
): T[] {
  return getDefaultConfidenceBooster().boostEntries(entries, context);
}
