/**
 * Dynamic Budget Calculator
 *
 * Calculates adaptive token budgets for context injection based on:
 * - Task complexity (simple, moderate, complex)
 * - Query intent
 * - Entry importance distribution
 * - Historical patterns
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { QueryIntent } from '../query-rewrite/types.js';

const logger = createComponentLogger('budget-calculator');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Task complexity levels
 */
export type TaskComplexity = 'simple' | 'moderate' | 'complex';

/**
 * Entry for budget calculation
 */
export interface BudgetEntry {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool' | 'experience';
  contentLength: number;
  priority?: number;
  relevanceScore?: number;
}

/**
 * Budget calculation configuration
 */
export interface BudgetCalculatorConfig {
  /** Enable dynamic budgeting */
  enabled: boolean;
  /** Base token budget for simple tasks */
  baseBudget: number;
  /** Maximum token budget for complex tasks */
  maxBudget: number;
  /** Reserve fraction for compression overhead (0-0.5) */
  compressionReserve: number;
  /** Estimated tokens per character */
  tokensPerChar: number;
}

/**
 * Default budget configuration
 */
export const DEFAULT_BUDGET_CONFIG: BudgetCalculatorConfig = {
  enabled: true,
  baseBudget: 2000,
  maxBudget: 8000,
  compressionReserve: 0.2,
  tokensPerChar: 0.25, // ~4 chars per token average
};

/**
 * Budget calculation result
 */
export interface BudgetResult {
  /** Total token budget */
  totalBudget: number;
  /** Effective budget after compression reserve */
  effectiveBudget: number;
  /** Detected complexity */
  complexity: TaskComplexity;
  /** Complexity multiplier used */
  multiplier: number;
  /** Budget allocation by entry type */
  allocation: {
    guideline: number;
    knowledge: number;
    tool: number;
    experience: number;
  };
  /** Recommended max entries per type */
  maxEntries: {
    guideline: number;
    knowledge: number;
    tool: number;
    experience: number;
  };
}

// =============================================================================
// COMPLEXITY MULTIPLIERS
// =============================================================================

/**
 * Multipliers for different complexity levels
 */
export const COMPLEXITY_MULTIPLIERS: Record<TaskComplexity, number> = {
  simple: 1.0,
  moderate: 2.0,
  complex: 4.0,
};

/**
 * Intent to complexity mapping
 * QueryIntent: 'lookup' | 'how_to' | 'debug' | 'explore' | 'compare' | 'configure'
 */
export const INTENT_COMPLEXITY_MAP: Record<QueryIntent, TaskComplexity> = {
  // High complexity intents
  debug: 'complex',

  // Moderate complexity intents
  how_to: 'moderate',
  compare: 'moderate',
  configure: 'moderate',

  // Simple complexity intents
  lookup: 'simple',
  explore: 'simple',
};

/**
 * Type allocation weights by intent
 * QueryIntent: 'lookup' | 'how_to' | 'debug' | 'explore' | 'compare' | 'configure'
 */
export const INTENT_TYPE_WEIGHTS: Record<
  QueryIntent,
  { guideline: number; knowledge: number; tool: number; experience: number }
> = {
  debug: { guideline: 0.2, knowledge: 0.3, tool: 0.2, experience: 0.3 },
  how_to: { guideline: 0.3, knowledge: 0.25, tool: 0.25, experience: 0.2 },
  compare: { guideline: 0.25, knowledge: 0.35, tool: 0.2, experience: 0.2 },
  configure: { guideline: 0.25, knowledge: 0.25, tool: 0.35, experience: 0.15 },
  lookup: { guideline: 0.2, knowledge: 0.5, tool: 0.15, experience: 0.15 },
  explore: { guideline: 0.25, knowledge: 0.35, tool: 0.2, experience: 0.2 },
};

// =============================================================================
// BUDGET CALCULATOR SERVICE
// =============================================================================

/**
 * DynamicBudgetCalculator computes optimal token budgets for context injection.
 *
 * Factors considered:
 * 1. Task complexity based on query intent
 * 2. Entry importance distribution
 * 3. Historical usage patterns
 */
export class DynamicBudgetCalculator {
  constructor(private readonly config: BudgetCalculatorConfig = DEFAULT_BUDGET_CONFIG) {}

  /**
   * Calculate budget based on intent and optional complexity override
   *
   * @param intent - Query intent (optional, defaults to explore)
   * @param complexityOverride - Override detected complexity
   * @returns Budget calculation result
   */
  calculate(intent?: QueryIntent, complexityOverride?: TaskComplexity): BudgetResult {
    // Use default if not enabled
    if (!this.config.enabled) {
      return this.createStaticResult();
    }

    // Determine complexity
    const complexity = complexityOverride ?? this.detectComplexity(intent);
    const multiplier = COMPLEXITY_MULTIPLIERS[complexity];

    // Calculate total budget
    const totalBudget = Math.min(this.config.baseBudget * multiplier, this.config.maxBudget);

    // Calculate effective budget after compression reserve
    const effectiveBudget = Math.floor(totalBudget * (1 - this.config.compressionReserve));

    // Calculate allocation by type
    const weights = INTENT_TYPE_WEIGHTS[intent ?? 'explore'];
    const allocation = {
      guideline: Math.floor(effectiveBudget * weights.guideline),
      knowledge: Math.floor(effectiveBudget * weights.knowledge),
      tool: Math.floor(effectiveBudget * weights.tool),
      experience: Math.floor(effectiveBudget * weights.experience),
    };

    // Calculate max entries (assuming ~200 tokens average per entry)
    const avgEntryTokens = 200;
    const maxEntries = {
      guideline: Math.max(1, Math.floor(allocation.guideline / avgEntryTokens)),
      knowledge: Math.max(1, Math.floor(allocation.knowledge / avgEntryTokens)),
      tool: Math.max(1, Math.floor(allocation.tool / avgEntryTokens)),
      experience: Math.max(1, Math.floor(allocation.experience / avgEntryTokens)),
    };

    logger.debug(
      {
        intent,
        complexity,
        multiplier,
        totalBudget,
        effectiveBudget,
      },
      'Budget calculated'
    );

    return {
      totalBudget,
      effectiveBudget,
      complexity,
      multiplier,
      allocation,
      maxEntries,
    };
  }

  /**
   * Calculate budget based on entries and their importance
   *
   * Adjusts budget based on the distribution of high-priority entries.
   *
   * @param entries - Available entries
   * @param intent - Query intent
   * @returns Budget calculation result
   */
  calculateFromEntries(entries: BudgetEntry[], intent?: QueryIntent): BudgetResult {
    // Start with intent-based complexity
    let detectedComplexity = this.detectComplexity(intent);

    // Analyze entry distribution for complexity adjustment
    if (entries.length > 0) {
      const highPriorityCount = entries.filter((e) => (e.priority ?? 0) >= 8).length;
      const avgRelevance =
        entries.reduce((sum, e) => sum + (e.relevanceScore ?? 0.5), 0) / entries.length;

      // Upgrade complexity if many high-priority entries or high relevance
      if (highPriorityCount >= 3 || avgRelevance >= 0.8) {
        if (detectedComplexity === 'simple') {
          detectedComplexity = 'moderate';
        } else if (detectedComplexity === 'moderate') {
          detectedComplexity = 'complex';
        }
      }
    }

    return this.calculate(intent, detectedComplexity);
  }

  /**
   * Estimate token count for content
   *
   * @param content - Text content
   * @returns Estimated token count
   */
  estimateTokens(content: string): number {
    return Math.ceil(content.length * this.config.tokensPerChar);
  }

  /**
   * Check if content fits within budget
   *
   * @param content - Text content
   * @param budget - Token budget
   * @returns Whether content fits
   */
  fitsInBudget(content: string, budget: number): boolean {
    return this.estimateTokens(content) <= budget;
  }

  /**
   * Calculate how much content can fit in remaining budget
   *
   * @param usedBudget - Tokens already used
   * @param totalBudget - Total token budget
   * @returns Remaining character count
   */
  remainingCharacters(usedBudget: number, totalBudget: number): number {
    const remainingTokens = Math.max(0, totalBudget - usedBudget);
    return Math.floor(remainingTokens / this.config.tokensPerChar);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<BudgetCalculatorConfig> {
    return { ...this.config };
  }

  /**
   * Detect complexity from query intent
   */
  private detectComplexity(intent?: QueryIntent): TaskComplexity {
    if (!intent) {
      return 'simple';
    }

    return INTENT_COMPLEXITY_MAP[intent] ?? 'simple';
  }

  /**
   * Create a static (disabled) budget result
   */
  private createStaticResult(): BudgetResult {
    const budget = this.config.baseBudget;
    const effective = Math.floor(budget * (1 - this.config.compressionReserve));
    const quarter = Math.floor(effective / 4);

    return {
      totalBudget: budget,
      effectiveBudget: effective,
      complexity: 'simple',
      multiplier: 1.0,
      allocation: {
        guideline: quarter,
        knowledge: quarter,
        tool: quarter,
        experience: quarter,
      },
      maxEntries: {
        guideline: 2,
        knowledge: 2,
        tool: 2,
        experience: 2,
      },
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a DynamicBudgetCalculator with configuration
 */
export function createBudgetCalculator(
  config?: Partial<BudgetCalculatorConfig>
): DynamicBudgetCalculator {
  const mergedConfig: BudgetCalculatorConfig = {
    ...DEFAULT_BUDGET_CONFIG,
    ...config,
  };

  return new DynamicBudgetCalculator(mergedConfig);
}
