/**
 * Retrieval Policy
 *
 * Decides when to query memory vs. generate directly:
 * - Retrieval is expensive (embeddings, search, ranking)
 * - Not all queries benefit from memory (e.g., simple greetings)
 * - Learned policy optimizes retrieval timing and scope
 *
 * Uses learned policy when available, falls back to always-retrieve.
 */

import { BasePolicy } from './base.policy.js';
import type {
  RetrievalState,
  RetrievalAction,
  PolicyDecision,
  PolicyConfig,
} from '../types.js';

// =============================================================================
// RETRIEVAL POLICY
// =============================================================================

export class RetrievalPolicy extends BasePolicy<RetrievalState, RetrievalAction> {
  constructor(config: PolicyConfig) {
    super(config);
  }

  /**
   * Make retrieval decision using learned model
   * For now, this calls the fallback until models are trained
   */
  async decide(state: RetrievalState): Promise<PolicyDecision<RetrievalAction>> {
    // TODO: Implement model inference when trained models are available
    // For now, use fallback rules
    return this.getFallback()(state);
  }

  /**
   * Fallback rule-based retrieval logic
   *
   * Decision rules:
   * 1. Complex queries with keywords -> always retrieve
   * 2. High error rate -> retrieve for help
   * 3. Simple greetings/chat -> skip retrieval
   * 4. Recent successful retrieval -> retrieve again
   * 5. Deep conversation -> retrieve for context
   */
  getFallback(): (state: RetrievalState) => PolicyDecision<RetrievalAction> {
    return (state: RetrievalState): PolicyDecision<RetrievalAction> => {
      const { queryFeatures, contextFeatures, memoryStats } = state;

      // Always retrieve for complex queries with keywords
      if (queryFeatures.hasKeywords && queryFeatures.queryComplexity > 0.6) {
        return {
          action: {
            shouldRetrieve: true,
            scope: 'project',
            maxResults: 20,
          },
          confidence: 0.95,
          metadata: { reason: 'complex_query_with_keywords' },
        };
      }

      // Retrieve if errors occurred (need help)
      if (contextFeatures.hasErrors) {
        return {
          action: {
            shouldRetrieve: true,
            scope: 'project',
            types: ['knowledge', 'tool'],
            maxResults: 15,
          },
          confidence: 0.9,
          metadata: { reason: 'error_recovery' },
        };
      }

      // Skip retrieval for simple queries (greetings, small talk)
      const isSimpleQuery =
        queryFeatures.queryLength < 20 &&
        queryFeatures.queryComplexity < 0.3 &&
        !queryFeatures.hasKeywords;

      if (isSimpleQuery) {
        return {
          action: { shouldRetrieve: false },
          confidence: 0.85,
          metadata: { reason: 'simple_query' },
        };
      }

      // Retrieve if recent retrievals were successful
      const recentSuccess = memoryStats.avgRetrievalSuccess > 0.7;
      if (recentSuccess && memoryStats.recentRetrievals > 0) {
        return {
          action: {
            shouldRetrieve: true,
            scope: 'project',
            maxResults: 15,
          },
          confidence: 0.8,
          metadata: { reason: 'recent_success' },
        };
      }

      // Retrieve for deep conversations (likely needs context)
      if (contextFeatures.conversationDepth > 10) {
        return {
          action: {
            shouldRetrieve: true,
            scope: 'project',
            maxResults: 10,
          },
          confidence: 0.75,
          metadata: { reason: 'deep_conversation' },
        };
      }

      // Retrieve if tool-heavy conversation (technical context needed)
      if (contextFeatures.recentToolCalls > 3) {
        return {
          action: {
            shouldRetrieve: true,
            scope: 'project',
            types: ['tool', 'guideline'],
            maxResults: 12,
          },
          confidence: 0.8,
          metadata: { reason: 'tool_heavy' },
        };
      }

      // Skip if memory is empty or rarely useful
      const memoryUseless =
        memoryStats.totalEntries === 0 ||
        (memoryStats.avgRetrievalSuccess < 0.3 && memoryStats.recentRetrievals > 5);

      if (memoryUseless) {
        return {
          action: { shouldRetrieve: false },
          confidence: 0.7,
          metadata: { reason: 'low_utility_memory' },
        };
      }

      // Default: retrieve with moderate scope (current behavior)
      return {
        action: {
          shouldRetrieve: true,
          scope: 'project',
          maxResults: 15,
        },
        confidence: 0.6,
        metadata: { reason: 'default_retrieve' },
      };
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create retrieval policy instance
 */
export function createRetrievalPolicy(config: PolicyConfig): RetrievalPolicy {
  return new RetrievalPolicy(config);
}
