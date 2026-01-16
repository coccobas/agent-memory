/**
 * Extraction Policy
 *
 * Decides what content to store from conversations:
 * - store: Extract and persist this content
 * - skip: Ignore this content
 * - defer: Wait for more context before deciding
 *
 * Uses learned policy when available, falls back to threshold-based rules.
 */

import { BasePolicy } from './base.policy.js';
import type { ExtractionState, ExtractionAction, PolicyDecision, PolicyConfig } from '../types.js';

// =============================================================================
// EXTRACTION POLICY
// =============================================================================

export class ExtractionPolicy extends BasePolicy<ExtractionState, ExtractionAction> {
  constructor(config: PolicyConfig) {
    super(config);
  }

  /**
   * Make extraction decision using learned model.
   * Currently uses rule-based fallback until trained models are available.
   *
   * @todo Implement model inference when trained models are available.
   *       Load model via ModelLoader, run inference on state features,
   *       and return learned policy decision instead of fallback rules.
   */
  async decide(state: ExtractionState): Promise<PolicyDecision<ExtractionAction>> {
    return this.getFallback()(state);
  }

  /**
   * Fallback rule-based extraction logic
   *
   * Decision rules:
   * 1. High novelty + decision/rule indicators -> store
   * 2. Low turn count + no strong signals -> defer
   * 3. Duplicate content or low value -> skip
   * 4. Tool errors or important facts -> store
   */
  getFallback(): (state: ExtractionState) => PolicyDecision<ExtractionAction> {
    return (state: ExtractionState): PolicyDecision<ExtractionAction> => {
      const { contextFeatures, memoryState, contentFeatures } = state;

      // Skip if similar entry already exists (avoid duplicates)
      if (memoryState.similarEntryExists) {
        return {
          action: { decision: 'skip' },
          confidence: 0.9,
          metadata: { reason: 'duplicate_content' },
        };
      }

      // Store if error occurred (valuable debugging info)
      if (contextFeatures.hasError) {
        return {
          action: {
            decision: 'store',
            entryType: 'knowledge',
            priority: 75,
          },
          confidence: 0.85,
          metadata: { reason: 'error_occurred' },
        };
      }

      // Store if strong content signals present
      const hasStrongSignal =
        contentFeatures.hasRule ||
        contentFeatures.hasCommand ||
        (contentFeatures.hasDecision && contentFeatures.noveltyScore > 0.7);

      if (hasStrongSignal) {
        // Determine entry type
        let entryType: ExtractionAction['entryType'];
        let priority = 50;

        if (contentFeatures.hasRule) {
          entryType = 'guideline';
          priority = 70;
        } else if (contentFeatures.hasCommand) {
          entryType = 'tool';
          priority = 60;
        } else if (contentFeatures.hasDecision) {
          entryType = 'knowledge';
          priority = 65;
        } else {
          entryType = 'knowledge';
          priority = 50;
        }

        return {
          action: {
            decision: 'store',
            entryType,
            priority,
          },
          confidence: 0.8,
          metadata: { reason: 'strong_content_signal' },
        };
      }

      // Defer if early in conversation (wait for more context)
      if (contextFeatures.turnNumber < 3 && !contentFeatures.hasFact) {
        return {
          action: { decision: 'defer' },
          confidence: 0.7,
          metadata: { reason: 'early_conversation' },
        };
      }

      // Store if high novelty and reasonable complexity
      if (contentFeatures.noveltyScore > 0.6 && contentFeatures.complexity > 0.5) {
        return {
          action: {
            decision: 'store',
            entryType: contentFeatures.hasFact ? 'knowledge' : 'experience',
            priority: Math.floor(contentFeatures.noveltyScore * 100),
          },
          confidence: 0.75,
          metadata: { reason: 'high_novelty' },
        };
      }

      // Skip if too many captures already in this session
      const captureRateHigh = memoryState.sessionCaptureCount > 5;
      if (captureRateHigh && contentFeatures.noveltyScore < 0.5) {
        return {
          action: { decision: 'skip' },
          confidence: 0.8,
          metadata: { reason: 'capture_rate_limit' },
        };
      }

      // Default: skip low-value content
      return {
        action: { decision: 'skip' },
        confidence: 0.6,
        metadata: { reason: 'low_value_content' },
      };
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create extraction policy instance
 */
export function createExtractionPolicy(config: PolicyConfig): ExtractionPolicy {
  return new ExtractionPolicy(config);
}
