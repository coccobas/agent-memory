/**
 * RL Service
 *
 * Coordinates reinforcement learning policies for memory operations:
 * - Extraction Policy: what to store from conversations
 * - Retrieval Policy: when to query memory
 * - Consolidation Policy: how to merge/forget entries
 *
 * Each policy uses learned models when available, with automatic
 * fallback to rule-based decisions.
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { ExtractionPolicy } from './policies/extraction.policy.js';
import { createExtractionPolicy } from './policies/extraction.policy.js';
import type { RetrievalPolicy } from './policies/retrieval.policy.js';
import { createRetrievalPolicy } from './policies/retrieval.policy.js';
import type { ConsolidationPolicy } from './policies/consolidation.policy.js';
import { createConsolidationPolicy } from './policies/consolidation.policy.js';
import type { RLServiceConfig } from './types.js';

const logger = createComponentLogger('rl-service');

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: RLServiceConfig = {
  enabled: true,
  extraction: {
    enabled: true,
    modelPath: undefined, // No model by default - uses fallback
  },
  retrieval: {
    enabled: true,
    modelPath: undefined, // No model by default - uses fallback
  },
  consolidation: {
    enabled: true,
    modelPath: undefined, // No model by default - uses fallback
  },
};

// =============================================================================
// RL SERVICE
// =============================================================================

/**
 * RL Service
 *
 * Singleton service that manages all RL policies
 */
export class RLService {
  private config: RLServiceConfig;
  private extractionPolicy: ExtractionPolicy;
  private retrievalPolicy: RetrievalPolicy;
  private consolidationPolicy: ConsolidationPolicy;

  constructor(config: Partial<RLServiceConfig> = {}) {
    this.config = this.mergeConfig(config);

    // Initialize policies
    this.extractionPolicy = createExtractionPolicy(this.config.extraction);
    this.retrievalPolicy = createRetrievalPolicy(this.config.retrieval);
    this.consolidationPolicy = createConsolidationPolicy(this.config.consolidation);

    logger.info(
      {
        enabled: this.config.enabled,
        extractionEnabled: this.config.extraction.enabled,
        retrievalEnabled: this.config.retrieval.enabled,
        consolidationEnabled: this.config.consolidation.enabled,
      },
      'RL Service initialized'
    );
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config: Partial<RLServiceConfig>): RLServiceConfig {
    return {
      enabled: config.enabled ?? DEFAULT_CONFIG.enabled,
      extraction: {
        enabled: config.extraction?.enabled ?? DEFAULT_CONFIG.extraction.enabled,
        modelPath: config.extraction?.modelPath ?? DEFAULT_CONFIG.extraction.modelPath,
      },
      retrieval: {
        enabled: config.retrieval?.enabled ?? DEFAULT_CONFIG.retrieval.enabled,
        modelPath: config.retrieval?.modelPath ?? DEFAULT_CONFIG.retrieval.modelPath,
      },
      consolidation: {
        enabled: config.consolidation?.enabled ?? DEFAULT_CONFIG.consolidation.enabled,
        modelPath: config.consolidation?.modelPath ?? DEFAULT_CONFIG.consolidation.modelPath,
      },
    };
  }

  // ==========================================================================
  // POLICY ACCESSORS
  // ==========================================================================

  /**
   * Get extraction policy
   */
  getExtractionPolicy(): ExtractionPolicy {
    return this.extractionPolicy;
  }

  /**
   * Get retrieval policy
   */
  getRetrievalPolicy(): RetrievalPolicy {
    return this.retrievalPolicy;
  }

  /**
   * Get consolidation policy
   */
  getConsolidationPolicy(): ConsolidationPolicy {
    return this.consolidationPolicy;
  }

  // ==========================================================================
  // SERVICE CONTROL
  // ==========================================================================

  /**
   * Check if RL service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): RLServiceConfig {
    return { ...this.config };
  }

  /**
   * Update service configuration
   */
  updateConfig(config: Partial<RLServiceConfig>): void {
    const oldConfig = this.config;
    this.config = this.mergeConfig({ ...this.config, ...config });

    // Update individual policies if their configs changed
    if (
      config.extraction &&
      (config.extraction.enabled !== oldConfig.extraction.enabled ||
        config.extraction.modelPath !== oldConfig.extraction.modelPath)
    ) {
      this.extractionPolicy.updateConfig(config.extraction);
      logger.info({ config: config.extraction }, 'Extraction policy config updated');
    }

    if (
      config.retrieval &&
      (config.retrieval.enabled !== oldConfig.retrieval.enabled ||
        config.retrieval.modelPath !== oldConfig.retrieval.modelPath)
    ) {
      this.retrievalPolicy.updateConfig(config.retrieval);
      logger.info({ config: config.retrieval }, 'Retrieval policy config updated');
    }

    if (
      config.consolidation &&
      (config.consolidation.enabled !== oldConfig.consolidation.enabled ||
        config.consolidation.modelPath !== oldConfig.consolidation.modelPath)
    ) {
      this.consolidationPolicy.updateConfig(config.consolidation);
      logger.info({ config: config.consolidation }, 'Consolidation policy config updated');
    }

    logger.info({ enabled: this.config.enabled }, 'RL Service config updated');
  }

  /**
   * Get service status
   */
  getStatus(): {
    enabled: boolean;
    extraction: { enabled: boolean; hasModel: boolean };
    retrieval: { enabled: boolean; hasModel: boolean };
    consolidation: { enabled: boolean; hasModel: boolean };
  } {
    return {
      enabled: this.config.enabled,
      extraction: {
        enabled: this.extractionPolicy.isEnabled(),
        hasModel: !!this.config.extraction.modelPath,
      },
      retrieval: {
        enabled: this.retrievalPolicy.isEnabled(),
        hasModel: !!this.config.retrieval.modelPath,
      },
      consolidation: {
        enabled: this.consolidationPolicy.isEnabled(),
        hasModel: !!this.config.consolidation.modelPath,
      },
    };
  }
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Export types
export type {
  RLServiceConfig,
  PolicyConfig,
  PolicyDecision,
  ExtractionState,
  ExtractionAction,
  RetrievalState,
  RetrievalAction,
  ConsolidationState,
  ConsolidationAction,
  ExtractionTrainingExample,
  RetrievalTrainingExample,
  ConsolidationTrainingExample,
} from './types.js';

// Export policies
export { ExtractionPolicy } from './policies/extraction.policy.js';
export { RetrievalPolicy } from './policies/retrieval.policy.js';
export { ConsolidationPolicy } from './policies/consolidation.policy.js';
export type { IPolicy } from './policies/base.policy.js';

// Export state builders
export { buildExtractionState } from './state/extraction.state.js';
export type { ExtractionStateParams } from './state/extraction.state.js';
export { buildRetrievalState } from './state/retrieval.state.js';
export type { RetrievalStateParams } from './state/retrieval.state.js';
export { buildConsolidationState } from './state/consolidation.state.js';
export type { ConsolidationStateParams } from './state/consolidation.state.js';

// Export reward functions
export {
  computeExtractionReward,
  computeExtractionOutcomeScore,
} from './rewards/extraction.reward.js';
export type {
  ExtractionRewardParams,
  ExtractionRewardResult,
} from './rewards/extraction.reward.js';

export {
  computeRetrievalReward,
  computeRetrievalOutcomeScore,
} from './rewards/retrieval.reward.js';
export type { RetrievalRewardParams, RetrievalRewardResult } from './rewards/retrieval.reward.js';

export {
  computeConsolidationReward,
  computeConsolidationOutcomeScore,
} from './rewards/consolidation.reward.js';
export type {
  ConsolidationRewardParams,
  ConsolidationRewardResult,
} from './rewards/consolidation.reward.js';

// Export training infrastructure
export {
  buildExtractionDataset,
  buildRetrievalDataset,
  buildConsolidationDataset,
} from './training/dataset-builder.js';
export type { DatasetParams, Dataset } from './training/dataset-builder.js';

export {
  trainExtractionPolicy,
  trainRetrievalPolicy,
  trainConsolidationPolicy,
  formatExtractionForDPO,
  formatRetrievalForDPO,
  formatConsolidationForDPO,
} from './training/dpo-trainer.js';
export type { TrainingConfig, TrainingResult, DPOPair } from './training/dpo-trainer.js';

export {
  evaluatePolicy,
  evaluatePolicyOnDataset,
  comparePolicies,
  comparePolicyAgainstBaseline,
  computeConfidenceInterval,
  formatEvaluationReport,
  formatComparisonReport,
} from './training/evaluation.js';
export type { EvaluationResult, ComparisonResult } from './training/evaluation.js';
