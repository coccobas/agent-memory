/**
 * Intent Classifier
 *
 * Classifies query intent using pattern matching with optional LLM fallback.
 * Fast pattern-based classification covers most common cases.
 */

import type { QueryIntent, ClassificationResult, ClassificationMethod } from './types.js';

/**
 * Pattern definition for intent matching
 */
interface IntentPattern {
  intent: QueryIntent;
  patterns: RegExp[];
  confidence: number;
}

/**
 * Intent Classifier
 *
 * Uses pattern matching for fast classification with high accuracy
 * on common query types. Falls back to 'explore' for ambiguous queries.
 */
export class IntentClassifier {
  private readonly intentPatterns: IntentPattern[];

  constructor() {
    this.intentPatterns = this.buildPatterns();
  }

  /**
   * Classify a query's intent
   */
  classify(query: string): ClassificationResult {
    const normalizedQuery = query.toLowerCase().trim();

    // Try pattern matching first (fast path)
    for (const { intent, patterns, confidence } of this.intentPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedQuery)) {
          return {
            intent,
            confidence,
            method: 'pattern',
          };
        }
      }
    }

    // Default to explore for unknown patterns
    return {
      intent: 'explore',
      confidence: 0.5,
      method: 'default',
    };
  }

  /**
   * Classify with async support (for future LLM integration)
   */
  async classifyAsync(
    query: string,
    _mode: ClassificationMethod = 'pattern'
  ): Promise<ClassificationResult> {
    // For now, just use pattern matching
    // LLM mode will be added when extraction service is integrated
    return this.classify(query);
  }

  /**
   * Build intent patterns
   */
  private buildPatterns(): IntentPattern[] {
    return [
      // How-to / Procedural queries
      {
        intent: 'how_to',
        confidence: 0.9,
        patterns: [
          /^how (do|can|should|to|would)/i,
          /^what('s| is| are) the (best|right|correct|proper|recommended) way to/i,
          /^steps (to|for)/i,
          /^guide (to|for|on)/i,
          /^tutorial (on|for)/i,
          /^walk me through/i,
          /^show me how/i,
          /^explain how to/i,
          /^help me (with|to)/i,
          /^i (want|need) to (know how|learn how|understand how)/i,
        ],
      },

      // Debug / Problem-solving queries
      {
        intent: 'debug',
        confidence: 0.9,
        patterns: [
          /error|exception|fail(ed|ing|ure)?|crash(ed|ing)?/i,
          /bug|issue|problem|broken|doesn't work|not working|won't/i,
          /fix|solve|resolve|debug|troubleshoot/i,
          /why (is|does|isn't|doesn't|won't|can't)/i,
          /what('s| is) (wrong|causing|the issue)/i,
          /can't|cannot|unable to/i,
          /unexpected|strange|weird behavior/i,
          /stack trace|traceback/i,
        ],
      },

      // Lookup / Factual queries
      {
        intent: 'lookup',
        confidence: 0.85,
        patterns: [
          /^what is|^what are|^what's/i,
          /^who is|^who are/i,
          /^when (is|was|did|does|will)/i,
          /^where (is|are|can|do|does)/i,
          /^which (one|is|are)/i,
          /^define|^definition of/i,
          /^meaning of/i,
          /^find (the|a|me)/i,
          /^get (the|a|me)/i,
          /^show (me )?(the|a)/i,
          /^list (all|the|of)/i,
        ],
      },

      // Compare queries
      {
        intent: 'compare',
        confidence: 0.9,
        patterns: [
          /vs\.?|versus/i,
          /compared? to|comparison (of|between)/i,
          /difference(s)? between/i,
          /which (is|one is) (better|worse|faster|more)/i,
          /prefer|choose between|pick between/i,
          /pros and cons/i,
          /advantages? (and|or) disadvantages?/i,
          /trade-?offs?/i,
          /(should i use|when to use) .+ (or|vs)/i,
        ],
      },

      // Configure / Setup queries
      {
        intent: 'configure',
        confidence: 0.9,
        patterns: [
          /^(how to )?(set up|setup|configure|install|initialize)/i,
          /^(how to )?(enable|disable|activate|deactivate)/i,
          /settings?|options?|preferences?|configuration/i,
          /environment( variables?)?/i,
          /\.env|config\.(js|ts|json|yaml|yml)/i,
          /add (a |the )?(new )?(.+) to (the )?config/i,
          /change (the )?(.+) setting/i,
          /update (the )?configuration/i,
        ],
      },
    ];
  }

  /**
   * Get all supported intents
   */
  getSupportedIntents(): QueryIntent[] {
    return ['lookup', 'how_to', 'debug', 'explore', 'compare', 'configure'];
  }

  /**
   * Get patterns for a specific intent (for debugging/testing)
   */
  getPatternsForIntent(intent: QueryIntent): RegExp[] {
    const found = this.intentPatterns.find((p) => p.intent === intent);
    return found?.patterns ?? [];
  }

  /**
   * Get the memory types most relevant for a given intent
   *
   * This mapping enables smart memory type prioritization based on query intent.
   * For example, "how do I..." queries should prioritize guidelines, while
   * "what is..." queries should prioritize knowledge entries.
   *
   * @param intent - The classified intent
   * @returns Array of memory types in priority order
   */
  getMemoryTypesForIntent(
    intent: QueryIntent
  ): Array<'guideline' | 'knowledge' | 'tool' | 'experience'> {
    switch (intent) {
      case 'how_to':
        // Procedural queries → guidelines first, then experiences
        return ['guideline', 'experience', 'tool', 'knowledge'];

      case 'debug':
        // Error/problem solving → experiences first (past solutions), then knowledge
        return ['experience', 'knowledge', 'guideline', 'tool'];

      case 'lookup':
        // Factual queries → knowledge first
        return ['knowledge', 'guideline', 'tool', 'experience'];

      case 'compare':
        // Comparison queries → knowledge (decisions), then experiences
        return ['knowledge', 'experience', 'guideline', 'tool'];

      case 'configure':
        // Configuration → guidelines (standards), tools, then knowledge
        return ['guideline', 'tool', 'knowledge', 'experience'];

      case 'explore':
      default:
        // Open-ended discovery → balanced, but knowledge first
        return ['knowledge', 'guideline', 'experience', 'tool'];
    }
  }

  /**
   * Get score boost weights for memory types based on intent
   *
   * Returns a map of memory type to boost weight (0-1).
   * Higher weight = more relevant for this intent.
   *
   * @param intent - The classified intent
   * @returns Map of memory type to boost weight
   */
  getMemoryTypeWeights(intent: QueryIntent): Map<string, number> {
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
        weights.set('guideline', 0.6);
        weights.set('tool', 0.4);
        weights.set('experience', 0.3);
        break;

      case 'compare':
        weights.set('knowledge', 1.0);
        weights.set('experience', 0.8);
        weights.set('guideline', 0.4);
        weights.set('tool', 0.3);
        break;

      case 'configure':
        weights.set('guideline', 1.0);
        weights.set('tool', 0.9);
        weights.set('knowledge', 0.5);
        weights.set('experience', 0.4);
        break;

      case 'explore':
      default:
        // Balanced weights for exploration
        weights.set('knowledge', 0.8);
        weights.set('guideline', 0.7);
        weights.set('experience', 0.6);
        weights.set('tool', 0.5);
        break;
    }

    return weights;
  }

  /**
   * Get extraction focus areas based on intent
   *
   * Maps intent to the extraction focus areas that should be prioritized
   * when extracting memories from context.
   *
   * @param intent - The classified intent
   * @returns Array of focus areas for extraction
   */
  getExtractionFocusForIntent(
    intent: QueryIntent
  ): Array<'decisions' | 'facts' | 'rules' | 'tools'> {
    switch (intent) {
      case 'how_to':
        return ['rules', 'tools'];

      case 'debug':
        return ['facts', 'decisions'];

      case 'lookup':
        return ['facts'];

      case 'compare':
        return ['decisions', 'facts'];

      case 'configure':
        return ['rules', 'tools', 'facts'];

      case 'explore':
      default:
        return ['facts', 'decisions', 'rules', 'tools'];
    }
  }
}

/**
 * Singleton instance for common use
 */
let defaultClassifier: IntentClassifier | null = null;

/**
 * Get the default classifier instance
 */
export function getIntentClassifier(): IntentClassifier {
  if (!defaultClassifier) {
    defaultClassifier = new IntentClassifier();
  }
  return defaultClassifier;
}
