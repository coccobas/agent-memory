/**
 * Pattern Matcher
 *
 * Weighted regex patterns with feedback-based confidence adjustments.
 * Patterns are organized by entry type with base weights that can be
 * boosted or penalized based on classification outcomes.
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { ClassificationRepository } from './classification.repository.js';
import type { ClassificationServiceConfig } from './index.js';

const logger = createComponentLogger('classification:patterns');

// =============================================================================
// TYPES
// =============================================================================

export type EntryType = 'guideline' | 'knowledge' | 'tool';

export interface PatternMatch {
  patternId: string;
  type: EntryType;
  rawScore: number;
  adjustedScore: number;
  matchedText?: string;
}

export interface MatchResult {
  type: EntryType;
  confidence: number;
  patternMatches: PatternMatch[];
  adjustedByFeedback: boolean;
}

interface WeightedPattern {
  id: string;
  regex: RegExp;
  type: EntryType;
  baseWeight: number;
  description: string;
}

// =============================================================================
// PATTERN DEFINITIONS
// =============================================================================

/**
 * Guideline patterns - rules, standards, requirements
 */
const GUIDELINE_PATTERNS: WeightedPattern[] = [
  {
    id: 'guideline_rule_prefix',
    regex: /^(rule|guideline|standard|requirement|policy)[\s:]/i,
    type: 'guideline',
    baseWeight: 0.95,
    description: 'Explicit rule/guideline prefix',
  },
  {
    id: 'guideline_must_always',
    regex: /^(must|always|never|don't|do not)[\s]/i,
    type: 'guideline',
    baseWeight: 0.9,
    description: 'Imperative must/always/never',
  },
  {
    id: 'guideline_we_always',
    regex: /\bwe\s+(always|never|must|should|shouldn't)\b/i,
    type: 'guideline',
    baseWeight: 0.85,
    description: 'Team rule pattern',
  },
  {
    id: 'guideline_we_will_use',
    regex: /\bwe\s+(will|are going to|'re going to)\s+(use|adopt|follow|implement|apply)\b/i,
    type: 'guideline',
    baseWeight: 0.85,
    description: 'Future commitment pattern',
  },
  {
    id: 'guideline_lets_use',
    regex: /^(let's|lets|let us)\s+(use|adopt|follow|implement|apply|go with)\b/i,
    type: 'guideline',
    baseWeight: 0.8,
    description: 'Team decision proposal',
  },
  {
    id: 'guideline_from_now_on',
    regex: /\b(from now on|going forward|henceforth|from this point)\b/i,
    type: 'guideline',
    baseWeight: 0.85,
    description: 'Future rule declaration',
  },
  {
    id: 'guideline_our_standard',
    regex: /^(our|the)\s+(standard|convention|rule|policy)\s+(is|should be)\b/i,
    type: 'guideline',
    baseWeight: 0.85,
    description: 'Team standard declaration',
  },
  {
    id: 'guideline_prefer_avoid',
    regex: /^(use|prefer|avoid|require)\s+/i,
    type: 'guideline',
    baseWeight: 0.8,
    description: 'Preference directive',
  },
  {
    id: 'guideline_over_instead',
    regex: /\b(prefer|use)\s+\w+\s+(over|instead of)\b/i,
    type: 'guideline',
    baseWeight: 0.85,
    description: 'Comparison preference',
  },
  {
    id: 'guideline_dont_make',
    regex: /\bdon't\s+(use|do|make|create|add)\b/i,
    type: 'guideline',
    baseWeight: 0.8,
    description: 'Prohibition pattern',
  },
  {
    id: 'guideline_should_not',
    regex: /\b(should not|shouldn't|shall not|cannot|must not)\b/i,
    type: 'guideline',
    baseWeight: 0.85,
    description: 'Negative obligation',
  },
  {
    id: 'guideline_ensure_make_sure',
    regex: /^(ensure|make sure|verify|check that)\b/i,
    type: 'guideline',
    baseWeight: 0.75,
    description: 'Verification requirement',
  },
];

/**
 * Knowledge patterns - facts, decisions, context
 */
const KNOWLEDGE_PATTERNS: WeightedPattern[] = [
  {
    id: 'knowledge_decision_prefix',
    regex: /^(decision|choice)[\s:]/i,
    type: 'knowledge',
    baseWeight: 0.95,
    description: 'Explicit decision prefix',
  },
  {
    id: 'knowledge_we_decided',
    regex: /\bwe\s+(decided|chose|picked|selected)\s+(to\s+)?/i,
    type: 'knowledge',
    baseWeight: 0.9,
    description: 'Decision statement',
  },
  {
    id: 'knowledge_fact_prefix',
    regex: /^(fact|note|fyi)[\s:]/i,
    type: 'knowledge',
    baseWeight: 0.9,
    description: 'Explicit fact prefix',
  },
  {
    id: 'knowledge_remember_that',
    regex: /^(remember|store|save|note)\s+(that\s+)?/i,
    type: 'knowledge',
    baseWeight: 0.75,
    description: 'Memory instruction',
  },
  {
    id: 'knowledge_our_system',
    regex:
      /\b(our|the)\s+(api|system|service|app|application|backend|frontend|database)\s+(is|are|uses?|has)\b/i,
    type: 'knowledge',
    baseWeight: 0.8,
    description: 'System description',
  },
  {
    id: 'knowledge_located_at',
    regex: /\b(is|are)\s+(located|stored|found)\s+(in|at)\b/i,
    type: 'knowledge',
    baseWeight: 0.75,
    description: 'Location statement',
  },
  {
    id: 'knowledge_we_use_for',
    regex: /\bwe\s+use\s+\w+\s+for\b/i,
    type: 'knowledge',
    baseWeight: 0.75,
    description: 'Technology choice',
  },
  {
    id: 'knowledge_because_since',
    regex: /\b(because|since|as|due to|reason)\b.*\b(we|it|this)\b/i,
    type: 'knowledge',
    baseWeight: 0.7,
    description: 'Reasoning pattern',
  },
  {
    id: 'knowledge_after_considering',
    regex: /\bafter\s+(considering|evaluating|comparing)\b/i,
    type: 'knowledge',
    baseWeight: 0.8,
    description: 'Decision rationale',
  },
];

/**
 * Tool patterns - commands, scripts, CLI
 */
const TOOL_PATTERNS: WeightedPattern[] = [
  {
    id: 'tool_command_prefix',
    regex: /^(command|script|cli|run|execute)[\s:]/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Explicit command prefix',
  },
  {
    id: 'tool_backtick_command',
    regex: /\b(run|execute|use)\s+`[^`]+`/i,
    type: 'tool',
    baseWeight: 0.9,
    description: 'Backtick command',
  },
  {
    id: 'tool_npm_command',
    regex: /\bnpm\s+(run|install|test|start|build)\b/i,
    type: 'tool',
    baseWeight: 0.9,
    description: 'NPM command',
  },
  {
    id: 'tool_yarn_pnpm',
    regex: /\b(yarn|pnpm)\s+\w+/i,
    type: 'tool',
    baseWeight: 0.85,
    description: 'Yarn/PNPM command',
  },
  {
    id: 'tool_to_build_run',
    regex: /\bto\s+(build|test|deploy|run|start)\b[^,]*,?\s*(run|use|execute)\b/i,
    type: 'tool',
    baseWeight: 0.8,
    description: 'Action instruction',
  },
  {
    id: 'tool_docker_command',
    regex: /\bdocker(-compose)?\s+\w+/i,
    type: 'tool',
    baseWeight: 0.85,
    description: 'Docker command',
  },
  {
    id: 'tool_git_command',
    regex: /\bgit\s+(clone|pull|push|commit|checkout|merge|rebase)\b/i,
    type: 'tool',
    baseWeight: 0.85,
    description: 'Git command',
  },
  {
    id: 'tool_make_command',
    // Exclude common non-command phrases: "make sure", "make it", "make the", "make a", "make an", "make this", "make that"
    regex: /\bmake\s+(?!sure|it|the|a|an|this|that|sense|changes?|progress|use|room)\w+/i,
    type: 'tool',
    baseWeight: 0.8,
    description: 'Make command',
  },
  // High-priority CLI patterns - commands at start of text are very likely tools
  {
    id: 'tool_npm_start_text',
    regex: /^npm\s+(run|install|test|start|build|exec|ci|init|publish)\s+/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'NPM command at start of text',
  },
  {
    id: 'tool_yarn_start_text',
    regex: /^(yarn|pnpm|bun)\s+\w+/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Yarn/PNPM/Bun command at start',
  },
  {
    id: 'tool_docker_start_text',
    regex: /^docker(-compose)?\s+\w+/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Docker command at start',
  },
  {
    id: 'tool_git_start_text',
    regex:
      /^git\s+(clone|pull|push|commit|checkout|branch|merge|rebase|log|status|diff|add|reset|stash)\b/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Git command at start',
  },
  {
    id: 'tool_python_start_text',
    regex: /^(python|python3|pip|pip3|pipenv|poetry)\s+/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Python command at start',
  },
  {
    id: 'tool_node_start_text',
    regex: /^(node|npx|tsx|ts-node|deno)\s+/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Node/TS/Deno command at start',
  },
  {
    id: 'tool_shell_start_text',
    regex: /^(bash|sh|zsh|curl|wget|ssh|scp|rsync|chmod|chown|mkdir|rm|cp|mv|cat|grep|sed|awk)\s+/i,
    type: 'tool',
    baseWeight: 0.9,
    description: 'Shell command at start',
  },
];

// All patterns combined
const ALL_PATTERNS: WeightedPattern[] = [
  ...GUIDELINE_PATTERNS,
  ...KNOWLEDGE_PATTERNS,
  ...TOOL_PATTERNS,
];

// =============================================================================
// PATTERN MATCHER
// =============================================================================

export class PatternMatcher {
  private patterns: WeightedPattern[];
  private confidenceCache: Map<string, number> = new Map();
  private repo: ClassificationRepository;
  private config: ClassificationServiceConfig;

  constructor(repo: ClassificationRepository, config: ClassificationServiceConfig) {
    this.patterns = ALL_PATTERNS;
    this.repo = repo;
    this.config = config;
  }

  /**
   * Match text against all patterns and return the best classification
   */
  async match(text: string): Promise<MatchResult> {
    const normalized = text.trim();
    const matches: PatternMatch[] = [];
    let adjustedByFeedback = false;

    // Test all patterns
    for (const pattern of this.patterns) {
      if (pattern.regex.test(normalized)) {
        const feedbackMultiplier = await this.getPatternMultiplier(pattern.id, pattern.type);
        const adjustedScore = pattern.baseWeight * feedbackMultiplier;

        if (feedbackMultiplier !== 1.0) {
          adjustedByFeedback = true;
        }

        // Extract matched text for debugging
        const match = normalized.match(pattern.regex);

        matches.push({
          patternId: pattern.id,
          type: pattern.type,
          rawScore: pattern.baseWeight,
          adjustedScore,
          matchedText: match?.[0],
        });
      }
    }

    // No matches → default to knowledge with low confidence
    if (matches.length === 0) {
      return {
        type: 'knowledge',
        confidence: 0.5,
        patternMatches: [],
        adjustedByFeedback: false,
      };
    }

    // Find the best match (prefer earlier patterns on tie - guidelines before tools)
    const bestMatch = matches.reduce((a, b) => (a.adjustedScore >= b.adjustedScore ? a : b));

    // Calculate confidence based on match quality
    const confidence = this.calculateConfidence(bestMatch, matches);

    logger.debug(
      {
        type: bestMatch.type,
        confidence,
        matchCount: matches.length,
        bestPattern: bestMatch.patternId,
      },
      'Pattern match result'
    );

    return {
      type: bestMatch.type,
      confidence,
      patternMatches: matches,
      adjustedByFeedback,
    };
  }

  /**
   * Get the feedback multiplier for a pattern
   */
  private async getPatternMultiplier(patternId: string, patternType: EntryType): Promise<number> {
    // Check cache first
    const cached = this.confidenceCache.get(patternId);
    if (cached !== undefined) {
      return cached;
    }

    // Get from database
    const patternConf = await this.repo.getOrCreatePatternConfidence(
      patternId,
      patternType,
      this.getBaseWeight(patternId)
    );

    const multiplier = patternConf.feedbackMultiplier;
    this.confidenceCache.set(patternId, multiplier);

    return multiplier;
  }

  /**
   * Update pattern confidence after a match outcome
   */
  async updatePatternConfidence(patternId: string, wasCorrect: boolean): Promise<void> {
    const pattern = this.patterns.find((p) => p.id === patternId);
    if (!pattern) {
      logger.warn({ patternId }, 'Pattern not found for confidence update');
      return;
    }

    // Get current confidence
    const current = await this.repo.getOrCreatePatternConfidence(
      patternId,
      pattern.type,
      pattern.baseWeight
    );

    // Calculate new multiplier using exponential moving average
    const alpha = this.config.learningRate;
    const target = wasCorrect ? 1.0 : 0.5;
    const newMultiplier =
      current.feedbackMultiplier + alpha * (target - current.feedbackMultiplier);

    // Clamp to bounds [1 - maxPenalty, 1 + maxBoost]
    const minMultiplier = 1.0 - this.config.maxPatternPenalty;
    const maxMultiplier = 1.0 + this.config.maxPatternBoost;
    const clampedMultiplier = Math.max(minMultiplier, Math.min(maxMultiplier, newMultiplier));

    // Update in database
    await this.repo.updatePatternConfidence(patternId, wasCorrect, clampedMultiplier);

    // Invalidate cache
    this.confidenceCache.delete(patternId);

    logger.debug(
      {
        patternId,
        wasCorrect,
        oldMultiplier: current.feedbackMultiplier,
        newMultiplier: clampedMultiplier,
      },
      'Pattern confidence updated'
    );
  }

  /**
   * Calculate overall confidence from match results
   */
  private calculateConfidence(bestMatch: PatternMatch, allMatches: PatternMatch[]): number {
    // Base confidence is the adjusted score
    let confidence = bestMatch.adjustedScore;

    // Penalize if there are strong competing matches of different types
    const competingMatches = allMatches.filter(
      (m) => m.type !== bestMatch.type && m.adjustedScore > 0.6
    );

    if (competingMatches.length > 0) {
      // Reduce confidence based on competition
      const strongestCompetitor = Math.max(...competingMatches.map((m) => m.adjustedScore));
      const gap = bestMatch.adjustedScore - strongestCompetitor;

      // If gap is small, reduce confidence
      if (gap < 0.2) {
        confidence *= 0.8 + gap * 2; // Reduce by up to 20%
      }
    }

    // Boost if multiple patterns of same type match
    const sameTypeMatches = allMatches.filter((m) => m.type === bestMatch.type);
    if (sameTypeMatches.length > 1) {
      confidence = Math.min(0.95, confidence + 0.05 * (sameTypeMatches.length - 1));
    }

    return Math.round(confidence * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get base weight for a pattern
   */
  private getBaseWeight(patternId: string): number {
    const pattern = this.patterns.find((p) => p.id === patternId);
    return pattern?.baseWeight ?? 0.7;
  }

  /**
   * Clear the confidence cache (useful for testing)
   */
  clearCache(): void {
    this.confidenceCache.clear();
  }
}
