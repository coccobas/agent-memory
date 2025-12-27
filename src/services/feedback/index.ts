/**
 * Feedback Service
 *
 * Main coordinator for RL training data collection.
 * Tracks retrievals, outcomes, and decisions to generate training datasets
 * for extraction, retrieval, and consolidation policies.
 */

import type { DatabaseDeps } from '../../core/types.js';
import { createComponentLogger } from '../../utils/logger.js';
import { now } from '../../db/repositories/base.js';

// Repositories
import {
  RetrievalRepository,
  createRetrievalRepository,
} from './repositories/retrieval.repository.js';
import {
  OutcomeRepository,
  createOutcomeRepository,
} from './repositories/outcome.repository.js';
import {
  DecisionRepository,
  createDecisionRepository,
} from './repositories/decision.repository.js';

// Feedback score cache
import { getFeedbackScoreCache } from '../query/feedback-cache.js';

// Collectors
import {
  RetrievalCollector,
  createRetrievalCollector,
} from './collectors/retrieval.collector.js';
import { OutcomeCollector, createOutcomeCollector } from './collectors/outcome.collector.js';
import {
  ExtractionCollector,
  createExtractionCollector,
} from './collectors/extraction.collector.js';

// Evaluators
import {
  computeLinearAttribution,
  computeLastTouchAttribution,
  computeAttentionAttribution,
} from './evaluators/attribution.js';
import {
  computeConsolidationRewardFromOutcome,
  type ConsolidationMetrics,
} from './evaluators/consolidation-reward.js';

// Types
import type {
  FeedbackConfig,
  RecordRetrievalParams,
  RecordOutcomeParams,
  RecordExtractionDecisionParams,
  RecordConsolidationDecisionParams,
  ExtractionOutcomeResult,
  ConsolidationOutcomeResult,
  TrainingDataset,
  ExportParams,
  RetrievalTrainingSample,
  ExtractionTrainingSample,
  ConsolidationTrainingSample,
  ContributionScore,
} from './types.js';
import { DEFAULT_FEEDBACK_CONFIG } from './types.js';
import type {
  MemoryRetrieval,
  AttributionMethod,
} from '../../db/schema/feedback.js';

const logger = createComponentLogger('feedback');

// =============================================================================
// FEEDBACK SERVICE
// =============================================================================

export class FeedbackService {
  private config: FeedbackConfig;

  // Repositories
  private retrievalRepo: RetrievalRepository;
  private outcomeRepo: OutcomeRepository;
  private decisionRepo: DecisionRepository;

  // Collectors
  private retrievalCollector: RetrievalCollector;
  private outcomeCollector: OutcomeCollector;
  private extractionCollector: ExtractionCollector;

  constructor(deps: DatabaseDeps, config: Partial<FeedbackConfig> = {}) {
    this.config = { ...DEFAULT_FEEDBACK_CONFIG, ...config };

    // Initialize repositories
    this.retrievalRepo = createRetrievalRepository(deps.db);
    this.outcomeRepo = createOutcomeRepository(deps.db);
    this.decisionRepo = createDecisionRepository(deps.db);

    // Initialize collectors
    this.retrievalCollector = createRetrievalCollector(this.retrievalRepo);
    this.outcomeCollector = createOutcomeCollector(this.outcomeRepo);
    this.extractionCollector = createExtractionCollector(
      this.decisionRepo,
      this.retrievalRepo,
      this.outcomeRepo
    );
  }

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  /**
   * Get current configuration
   */
  getConfig(): FeedbackConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FeedbackConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===========================================================================
  // RETRIEVAL TRACKING
  // ===========================================================================

  /**
   * Record a single retrieval event
   */
  async recordRetrieval(params: RecordRetrievalParams): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    // Fire-and-forget if configured
    if (
      this.config.async.enabled &&
      this.config.async.asyncOperations.includes('retrieval')
    ) {
      this.retrievalCollector.recordRetrieval(params).catch((error) => {
        logger.error(
          { err: error, sessionId: params.sessionId, entryId: params.entryId },
          'Async retrieval recording failed'
        );
      });
      return 'async';
    }

    return this.retrievalCollector.recordRetrieval(params);
  }

  /**
   * Record multiple retrieval events in batch
   */
  async recordRetrievalBatch(params: RecordRetrievalParams[]): Promise<string[]> {
    if (!this.config.enabled) {
      return [];
    }

    // Fire-and-forget if configured
    if (
      this.config.async.enabled &&
      this.config.async.asyncOperations.includes('retrieval')
    ) {
      this.retrievalCollector.recordRetrievalBatch(params).catch((error) => {
        logger.error(
          { err: error, batchSize: params.length },
          'Async batch retrieval recording failed'
        );
      });
      return ['async'];
    }

    return this.retrievalCollector.recordRetrievalBatch(params);
  }

  /**
   * Get all retrievals for a session
   */
  async getSessionRetrievals(sessionId: string): Promise<MemoryRetrieval[]> {
    return this.retrievalCollector.getSessionRetrievals(sessionId);
  }

  /**
   * Get unlinked retrievals for a session
   */
  async getUnlinkedRetrievals(sessionId: string): Promise<MemoryRetrieval[]> {
    return this.retrievalCollector.getUnlinkedRetrievals(sessionId);
  }

  // ===========================================================================
  // OUTCOME TRACKING
  // ===========================================================================

  /**
   * Record a task outcome
   */
  async recordOutcome(params: RecordOutcomeParams): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    // Fire-and-forget if configured
    if (
      this.config.async.enabled &&
      this.config.async.asyncOperations.includes('outcome')
    ) {
      this.outcomeCollector.recordOutcome(params).catch((error) => {
        logger.error(
          { err: error, sessionId: params.sessionId, outcomeType: params.outcomeType },
          'Async outcome recording failed'
        );
      });
      return 'async';
    }

    return this.outcomeCollector.recordOutcome(params);
  }

  /**
   * Link retrievals to an outcome with attribution
   */
  async linkRetrievalsToOutcome(
    outcomeId: string,
    retrievalIds: string[],
    attributionMethod?: AttributionMethod
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Get the outcome and retrievals
    const outcome = await this.outcomeRepo.getOutcomeById(outcomeId);
    if (!outcome) {
      logger.warn({ outcomeId }, 'Outcome not found for attribution');
      return;
    }

    const retrievals = await Promise.all(
      retrievalIds.map((id) => this.retrievalRepo.getById(id))
    );
    const validRetrievals = retrievals.filter((r): r is MemoryRetrieval => r !== undefined);

    if (validRetrievals.length === 0) {
      logger.warn({ outcomeId }, 'No valid retrievals for attribution');
      return;
    }

    // Compute attribution scores
    const method = attributionMethod ?? this.config.attribution.defaultMethod;
    let scores: ContributionScore[];

    switch (method) {
      case 'linear':
        scores = computeLinearAttribution(validRetrievals, outcome);
        break;
      case 'last_touch':
        scores = computeLastTouchAttribution(validRetrievals, outcome);
        break;
      case 'attention':
        scores = computeAttentionAttribution(validRetrievals, outcome);
        break;
      default:
        scores = computeLinearAttribution(validRetrievals, outcome);
    }

    // Fire-and-forget if configured
    if (
      this.config.async.enabled &&
      this.config.async.asyncOperations.includes('attribution')
    ) {
      this.outcomeCollector
        .linkRetrievalsToOutcome(outcomeId, retrievalIds, scores, method)
        .catch((error) => {
          logger.error(
            { err: error, outcomeId, retrievalCount: retrievalIds.length, method },
            'Async attribution linking failed'
          );
        });
      return;
    }

    await this.outcomeCollector.linkRetrievalsToOutcome(outcomeId, retrievalIds, scores, method);

    // Invalidate feedback score cache for affected entries
    // This ensures the next query will fetch fresh feedback scores
    this.invalidateFeedbackCacheForRetrievals(validRetrievals);
  }

  /**
   * Invalidate feedback score cache for entries affected by new outcomes
   */
  private invalidateFeedbackCacheForRetrievals(retrievals: MemoryRetrieval[]): void {
    try {
      const cache = getFeedbackScoreCache();
      for (const retrieval of retrievals) {
        cache.invalidate(
          retrieval.entryType as 'tool' | 'guideline' | 'knowledge' | 'experience',
          retrieval.entryId
        );
      }
      logger.debug(
        { invalidatedCount: retrievals.length },
        'Feedback cache invalidated for new outcome'
      );
    } catch (error) {
      // Non-fatal - cache will refresh on next access
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to invalidate feedback cache'
      );
    }
  }

  // ===========================================================================
  // EXTRACTION DECISION TRACKING
  // ===========================================================================

  /**
   * Record an extraction decision
   */
  async recordExtractionDecision(params: RecordExtractionDecisionParams): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    return this.extractionCollector.recordExtractionDecision(params);
  }

  /**
   * Evaluate the outcome of an extraction decision
   */
  async evaluateExtractionOutcome(
    decisionId: string
  ): Promise<ExtractionOutcomeResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    return this.extractionCollector.evaluateExtractionOutcome(decisionId);
  }

  // ===========================================================================
  // CONSOLIDATION DECISION TRACKING
  // ===========================================================================

  /**
   * Record a consolidation decision
   */
  async recordConsolidationDecision(
    params: RecordConsolidationDecisionParams
  ): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    return this.decisionRepo.createConsolidationDecision(params);
  }

  /**
   * Evaluate the outcome of a consolidation decision.
   *
   * @todo Compute actual retrieval rates from database instead of placeholder values.
   *       Requires tracking retrieval events and querying statistics over the
   *       evaluation window to measure real pre/post consolidation impact.
   */
  async evaluateConsolidationOutcome(
    decisionId: string,
    windowDays?: number
  ): Promise<ConsolidationOutcomeResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    const decision = await this.decisionRepo.getConsolidationDecisionById(decisionId);
    if (!decision) {
      logger.warn({ decisionId }, 'Consolidation decision not found');
      return null;
    }

    const evaluationWindowDays =
      windowDays ?? this.config.consolidation.evaluationWindowDays;

    // Placeholder metrics - see method @todo for real implementation
    const preMetrics: ConsolidationMetrics = {
      retrievalRate: 0.5,
      successRate: 0.6,
      storageCount: JSON.parse(decision.sourceEntryIds).length,
    };

    const postMetrics: ConsolidationMetrics = {
      retrievalRate: 0.6,
      successRate: 0.7,
      storageCount: decision.targetEntryId ? 1 : 0,
    };

    // Compute outcome score
    const outcomeScore = computeConsolidationRewardFromOutcome(
      decision,
      {
        id: '',
        decisionId,
        preRetrievalRate: preMetrics.retrievalRate,
        postRetrievalRate: postMetrics.retrievalRate,
        preSuccessRate: preMetrics.successRate,
        postSuccessRate: postMetrics.successRate,
        evaluationWindowDays,
        outcomeScore: 0,
        evaluatedAt: now(),
      },
      preMetrics.storageCount
    );

    // Store the outcome
    await this.decisionRepo.upsertConsolidationOutcome(
      decisionId,
      preMetrics.retrievalRate,
      postMetrics.retrievalRate,
      preMetrics.successRate,
      postMetrics.successRate,
      evaluationWindowDays,
      outcomeScore
    );

    return {
      decisionId,
      preRetrievalRate: preMetrics.retrievalRate,
      postRetrievalRate: postMetrics.retrievalRate,
      preSuccessRate: preMetrics.successRate,
      postSuccessRate: postMetrics.successRate,
      evaluationWindowDays,
      outcomeScore,
      evaluatedAt: now(),
    };
  }

  // ===========================================================================
  // TRAINING DATA EXPORT
  // ===========================================================================

  /**
   * Export training data for RL policies
   */
  async exportTrainingData(params: ExportParams = {}): Promise<TrainingDataset> {
    const startDate = params.startDate ?? new Date(0).toISOString();
    const endDate = params.endDate ?? now();

    // Fetch retrievals
    const allRetrievals = await this.retrievalRepo.getByDateRange(startDate, endDate);
    const retrievalSamples: RetrievalTrainingSample[] = [];

    for (const retrieval of allRetrievals) {
      const contributions = await this.outcomeRepo.getRetrievalContributions(retrieval.id);
      const contribution = contributions[0]; // Take first if multiple

      if (contribution) {
        const outcome = await this.outcomeRepo.getOutcomeById(contribution.outcomeId);

        retrievalSamples.push({
          retrievalId: retrieval.id,
          sessionId: retrieval.sessionId,
          queryText: retrieval.queryText ?? undefined,
          queryEmbedding: retrieval.queryEmbedding ?? undefined,
          entryType: retrieval.entryType,
          entryId: retrieval.entryId,
          retrievalRank: retrieval.retrievalRank ?? undefined,
          retrievalScore: retrieval.retrievalScore ?? undefined,
          retrievedAt: retrieval.retrievedAt,
          outcomeType: outcome?.outcomeType,
          contributionScore: contribution.contributionScore ?? undefined,
          attributionMethod: contribution.attributionMethod ?? undefined,
        });
      }
    }

    // Fetch extraction decisions
    const allExtractionDecisions = await this.decisionRepo.getExtractionDecisionsByDateRange(
      startDate,
      endDate
    );
    const extractionSamples: ExtractionTrainingSample[] = [];

    for (const decision of allExtractionDecisions) {
      const outcome = await this.decisionRepo.getExtractionOutcome(decision.id);

      extractionSamples.push({
        decisionId: decision.id,
        sessionId: decision.sessionId,
        turnNumber: decision.turnNumber ?? undefined,
        decision: decision.decision,
        entryType: decision.entryType ?? undefined,
        entryId: decision.entryId ?? undefined,
        contextHash: decision.contextHash ?? undefined,
        confidence: decision.confidence ?? undefined,
        decidedAt: decision.decidedAt,
        retrievalCount: outcome?.retrievalCount,
        successCount: outcome?.successCount,
        outcomeScore: outcome?.outcomeScore ?? undefined,
      });
    }

    // Fetch consolidation decisions
    const allConsolidationDecisions =
      await this.decisionRepo.getConsolidationDecisionsByDateRange(startDate, endDate);
    const consolidationSamples: ConsolidationTrainingSample[] = [];

    for (const decision of allConsolidationDecisions) {
      const outcome = await this.decisionRepo.getConsolidationOutcome(decision.id);

      consolidationSamples.push({
        decisionId: decision.id,
        scopeType: decision.scopeType,
        scopeId: decision.scopeId ?? undefined,
        action: decision.action,
        sourceEntryIds: JSON.parse(decision.sourceEntryIds),
        targetEntryId: decision.targetEntryId ?? undefined,
        similarityScore: decision.similarityScore ?? undefined,
        decidedAt: decision.decidedAt,
        decidedBy: decision.decidedBy ?? undefined,
        preRetrievalRate: outcome?.preRetrievalRate ?? undefined,
        postRetrievalRate: outcome?.postRetrievalRate ?? undefined,
        preSuccessRate: outcome?.preSuccessRate ?? undefined,
        postSuccessRate: outcome?.postSuccessRate ?? undefined,
        outcomeScore: outcome?.outcomeScore ?? undefined,
      });
    }

    // Apply filters
    let filteredRetrievalSamples = retrievalSamples;
    let filteredExtractionSamples = extractionSamples;
    let filteredConsolidationSamples = consolidationSamples;

    if (params.outcomeTypes) {
      filteredRetrievalSamples = retrievalSamples.filter(
        (s) => s.outcomeType && params.outcomeTypes!.includes(s.outcomeType)
      );
    }

    if (params.entryTypes) {
      filteredRetrievalSamples = filteredRetrievalSamples.filter(
        (s) => s.entryType && params.entryTypes!.includes(s.entryType)
      );
      filteredExtractionSamples = filteredExtractionSamples.filter(
        (s) => s.entryType && params.entryTypes!.includes(s.entryType)
      );
    }

    if (params.onlyWithOutcomes) {
      filteredRetrievalSamples = filteredRetrievalSamples.filter((s) => s.outcomeType);
      filteredExtractionSamples = filteredExtractionSamples.filter((s) => s.outcomeScore);
      filteredConsolidationSamples = filteredConsolidationSamples.filter((s) => s.outcomeScore);
    }

    // Apply limit
    if (params.limit) {
      filteredRetrievalSamples = filteredRetrievalSamples.slice(0, params.limit);
      filteredExtractionSamples = filteredExtractionSamples.slice(0, params.limit);
      filteredConsolidationSamples = filteredConsolidationSamples.slice(0, params.limit);
    }

    // Compute stats
    const successCount = filteredRetrievalSamples.filter(
      (s) => s.outcomeType === 'success'
    ).length;
    const totalWithOutcome = filteredRetrievalSamples.filter((s) => s.outcomeType).length;
    const successRate = totalWithOutcome > 0 ? successCount / totalWithOutcome : 0;

    const contributionScores = filteredRetrievalSamples
      .map((s) => s.contributionScore)
      .filter((s): s is number => s !== undefined);
    const avgContribution =
      contributionScores.length > 0
        ? contributionScores.reduce((a, b) => a + b, 0) / contributionScores.length
        : 0;

    return {
      metadata: {
        exportedAt: now(),
        startDate: params.startDate,
        endDate: params.endDate,
        filters: params,
      },
      retrieval: {
        samples: filteredRetrievalSamples,
        count: filteredRetrievalSamples.length,
      },
      extraction: {
        samples: filteredExtractionSamples,
        count: filteredExtractionSamples.length,
      },
      consolidation: {
        samples: filteredConsolidationSamples,
        count: filteredConsolidationSamples.length,
      },
      stats: {
        totalRetrievals: filteredRetrievalSamples.length,
        totalExtractions: filteredExtractionSamples.length,
        totalConsolidations: filteredConsolidationSamples.length,
        successRate,
        averageContributionScore: avgContribution,
      },
    };
  }
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let serviceInstance: FeedbackService | null = null;

/**
 * Get the feedback service singleton
 * @deprecated Use context.services.feedback instead via dependency injection
 */
export function getFeedbackService(): FeedbackService | null {
  return serviceInstance;
}

/**
 * Initialize the feedback service with dependencies
 * @deprecated Use context.services.feedback instead via dependency injection
 */
export function initFeedbackService(
  deps: DatabaseDeps,
  config?: Partial<FeedbackConfig>
): FeedbackService {
  serviceInstance = new FeedbackService(deps, config);
  return serviceInstance;
}

/**
 * Reset the feedback service (for testing)
 */
export function resetFeedbackService(): void {
  serviceInstance = null;
}

// Re-export types and utilities
export * from './types.js';
export type { ExtractionRewardConfig } from './evaluators/extraction-reward.js';
export type { ConsolidationRewardConfig } from './evaluators/consolidation-reward.js';

// Re-export feedback cache utilities for scoring integration
export {
  getFeedbackScoreCache,
  resetFeedbackScoreCache,
  FeedbackScoreCache,
  getFeedbackMultiplier,
  type FeedbackScoringConfig,
} from '../query/feedback-cache.js';
export {
  getEntryFeedback,
  getEntryFeedbackBatch,
  type EntryFeedbackScore,
} from './repositories/retrieval.repository.js';
