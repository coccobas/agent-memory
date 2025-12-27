/**
 * Librarian Service
 *
 * Main orchestrator for the Librarian Agent.
 * Coordinates pattern detection, quality evaluation, and recommendation generation.
 */

import type { DatabaseDeps } from '../../core/types.js';
import { createComponentLogger } from '../../utils/logger.js';
import { generateId } from '../../db/repositories/base.js';
import { createExperienceRepository } from '../../db/repositories/experiences.js';
import { CaseCollector } from './pipeline/collector.js';
import { PatternDetector } from './pipeline/pattern-detector.js';
import { QualityGate } from './pipeline/quality-gate.js';
import { Recommender } from './pipeline/recommender.js';
import {
  initializeRecommendationStore,
  type IRecommendationStore,
} from './recommendations/recommendation-store.js';
import {
  DEFAULT_LIBRARIAN_CONFIG,
  type LibrarianConfig,
  type AnalysisRequest,
  type AnalysisResult,
  type LibrarianStatus,
} from './types.js';
import type { ScopeType } from '../../db/schema/types.js';
import type { RLService } from '../rl/index.js';
import { buildConsolidationState } from '../rl/state/consolidation.state.js';
import type { FeedbackService } from '../feedback/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Dependencies for LibrarianService
 */
export interface LibrarianServiceDeps extends DatabaseDeps {
  /** Optional RL service for consolidation policy decisions */
  rlService?: RLService | null;
  /** Optional feedback service for recording decisions */
  feedbackService?: FeedbackService | null;
}

const logger = createComponentLogger('librarian');

// =============================================================================
// LIBRARIAN SERVICE
// =============================================================================

/**
 * Librarian Service
 *
 * Orchestrates the pattern detection and recommendation pipeline
 */
export class LibrarianService {
  private config: LibrarianConfig;
  private collector: CaseCollector;
  private patternDetector: PatternDetector;
  private qualityGate: QualityGate;
  private recommender: Recommender;
  private recommendationStore: IRecommendationStore;
  private lastAnalysis?: AnalysisResult;
  private rlService?: RLService | null;
  private feedbackService?: FeedbackService | null;

  constructor(deps: LibrarianServiceDeps, config: Partial<LibrarianConfig> = {}) {
    this.config = { ...DEFAULT_LIBRARIAN_CONFIG, ...config };
    this.rlService = deps.rlService;
    this.feedbackService = deps.feedbackService;

    // Initialize pipeline components
    const experienceRepo = createExperienceRepository(deps);
    this.collector = new CaseCollector(experienceRepo);
    this.patternDetector = new PatternDetector({
      embeddingThreshold: this.config.patternDetection.embeddingSimilarityThreshold,
      trajectoryThreshold: this.config.patternDetection.trajectorySimilarityThreshold,
      minExperiences: this.config.patternDetection.minPatternSize,
    });
    this.qualityGate = new QualityGate({
      autoPromoteThreshold: this.config.qualityGate.autoPromoteThreshold,
      reviewThreshold: this.config.qualityGate.reviewThreshold,
      minSuccessRate: this.config.qualityGate.minSuccessRate,
    });
    this.recommender = new Recommender({
      expirationDays: this.config.recommendations.expirationDays,
    });

    // Initialize recommendation store
    this.recommendationStore = initializeRecommendationStore(deps);
  }

  /**
   * Get total count of experiences in the given scope
   */
  private async getEntryCount(scopeType: ScopeType, scopeId?: string): Promise<number> {
    try {
      const experiences = await this.collector.collect({
        scopeType,
        scopeId,
        inherit: true,
        levelFilter: 'all',
        limit: 10000, // High limit just for counting
      });
      return experiences.totalFound;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to get entry count, using 0'
      );
      return 0;
    }
  }

  /**
   * Run a full analysis pipeline
   */
  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    const runId = request.runId ?? generateId();
    const startedAt = new Date().toISOString();
    const errors: string[] = [];

    logger.info({ runId, request }, 'Starting librarian analysis');

    try {
      // Stage 1: Collection
      logger.debug({ runId, stage: 'collection' }, 'Collecting experiences');
      const collection = await this.collector.collectUnpromoted({
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        lookbackDays: request.lookbackDays ?? this.config.collection.lookbackDays,
        limit: request.maxExperiences ?? this.config.collection.maxExperiences,
        levelFilter: 'case',
      });

      logger.debug(
        { runId, experiencesCollected: collection.experiences.length },
        'Collection complete'
      );

      // Early exit if no experiences
      if (collection.experiences.length === 0) {
        const completedAt = new Date().toISOString();
        const result: AnalysisResult = {
          runId,
          request,
          collection,
          patternDetection: { patterns: [], unmatched: [], processingTimeMs: 0, stats: { totalExperiences: 0, patternsFound: 0, experiencesInPatterns: 0, averagePatternSize: 0, embeddingsUsed: false } },
          qualityEvaluations: [],
          recommendations: {
            recommendations: [],
            autoPromoted: [],
            rejected: [],
            stats: { totalPatterns: 0, reviewQueued: 0, autoPromoted: 0, rejected: 0 },
          },
          generatedRecommendations: [],
          timing: {
            startedAt,
            completedAt,
            durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
          },
          stats: {
            experiencesCollected: 0,
            patternsDetected: 0,
            autoPromoted: 0,
            queuedForReview: 0,
            rejected: 0,
          },
          dryRun: request.dryRun ?? false,
        };
        this.lastAnalysis = result;
        return result;
      }

      // Stage 2: Pattern Detection
      logger.debug({ runId, stage: 'pattern_detection' }, 'Detecting patterns');
      const experiencesWithTrajectory = collection.experiences.map(ce => ({
        experience: ce.experience,
        trajectory: ce.trajectory,
      }));

      const patternDetection = await this.patternDetector.detectPatterns(
        experiencesWithTrajectory
      );

      logger.debug(
        { runId, patternsDetected: patternDetection.patterns.length },
        'Pattern detection complete'
      );

      // Stage 3: RL Consolidation Policy Integration (Optional)
      let filteredPatterns = patternDetection.patterns;
      const rlService = this.rlService;
      const feedbackService = this.feedbackService;

      if (rlService?.isEnabled() && rlService.getConsolidationPolicy().isEnabled()) {
        logger.debug({ runId, stage: 'rl_consolidation_policy' }, 'Consulting RL consolidation policy');

        // Get total entries in scope for context
        const totalEntriesInScope = await this.getEntryCount(request.scopeType, request.scopeId);

        // For each pattern group, get policy decision
        const policyDecisions = await Promise.all(
          patternDetection.patterns.map(async (pattern) => {
            // Build state for consolidation policy
            const state = buildConsolidationState({
              group: {
                entries: pattern.experiences.map((exp) => ({
                  id: exp.experience.id,
                  type: 'experience' as const,
                  similarity: pattern.embeddingSimilarity,
                })),
                avgSimilarity: pattern.embeddingSimilarity,
              },
              usageStats: {
                totalRetrievals: pattern.experiences.reduce(
                  (sum, e) => sum + e.experience.useCount,
                  0
                ),
                avgRetrievalRank: 5, // Default mid-rank, would need actual retrieval data
                successCount: pattern.experiences.reduce(
                  (sum, e) => sum + e.experience.successCount,
                  0
                ),
                failureCount: pattern.experiences.reduce(
                  (sum, e) => sum + (e.experience.useCount - e.experience.successCount),
                  0
                ),
                lastAccessedAt: pattern.experiences
                  .map((e) => e.experience.lastUsedAt)
                  .filter((d): d is string => d !== null)
                  .sort()
                  .pop(),
              },
              scopeContext: {
                scopeType: request.scopeType,
                totalEntriesInScope,
                duplicateCount: patternDetection.patterns.reduce(
                  (sum, p) => sum + p.experiences.length,
                  0
                ),
              },
            });

            // Get policy decision
            const decision = await rlService.getConsolidationPolicy().decideWithFallback(state);

            // Record decision for training if feedback service is available
            if (feedbackService) {
              try {
                await feedbackService.recordConsolidationDecision({
                  scopeType: request.scopeType,
                  scopeId: request.scopeId,
                  action: decision.action.action,
                  sourceEntryIds: pattern.experiences.map((e) => e.experience.id),
                  similarityScore: pattern.embeddingSimilarity,
                  decidedBy: 'librarian',
                });
              } catch (error) {
                logger.warn(
                  { error: error instanceof Error ? error.message : String(error) },
                  'Failed to record consolidation decision for training'
                );
              }
            }

            return { pattern, decision };
          })
        );

        // Filter patterns based on policy decisions
        // 'keep' -> include in recommendations
        // 'merge', 'dedupe', 'archive', 'abstract' -> include with suggested action
        // For now, we filter out 'archive' actions since those shouldn't be promoted
        filteredPatterns = policyDecisions
          .filter(({ decision }) => decision.action.action !== 'archive')
          .map(({ pattern, decision }) => ({
            ...pattern,
            // Add policy metadata to pattern for downstream use
            rlPolicyAction: decision.action.action,
            rlPolicyConfidence: decision.confidence,
            rlPolicyReason: decision.metadata?.reason,
          }));

        logger.debug(
          {
            runId,
            originalPatterns: patternDetection.patterns.length,
            filteredPatterns: filteredPatterns.length,
            filtered: policyDecisions
              .filter(({ decision }) => decision.action.action === 'archive')
              .map(({ pattern, decision }) => ({
                patternId: pattern.id,
                action: decision.action.action,
                reason: decision.metadata?.reason,
              })),
          },
          'RL consolidation policy filtering complete'
        );
      }

      // Stage 4: Quality Evaluation
      logger.debug({ runId, stage: 'quality_evaluation' }, 'Evaluating pattern quality');
      const qualityEvaluations = filteredPatterns.map(pattern => ({
        pattern,
        result: this.qualityGate.evaluate(pattern),
      }));

      // Stage 5: Recommendation Generation
      logger.debug({ runId, stage: 'recommendation_generation' }, 'Generating recommendations');
      const evaluationMap = new Map(qualityEvaluations.map(e => [e.pattern, e.result]));

      this.recommender.setOptions({
        analysisRunId: runId,
        createdBy: request.initiatedBy ?? 'librarian-agent',
      });

      const recommendations = this.recommender.generateRecommendations(
        filteredPatterns,
        evaluationMap,
        { scopeType: request.scopeType, scopeId: request.scopeId }
      );

      // Stage 6: Storage (if not dry run)
      if (!request.dryRun && recommendations.recommendations.length > 0) {
        logger.debug({ runId, stage: 'storage' }, 'Storing recommendations');
        await this.recommender.storeRecommendations(
          recommendations.recommendations,
          this.recommendationStore
        );
      }

      // Build result
      const completedAt = new Date().toISOString();
      const result: AnalysisResult = {
        runId,
        request,
        collection,
        patternDetection,
        qualityEvaluations,
        recommendations,
        generatedRecommendations: recommendations.recommendations,
        timing: {
          startedAt,
          completedAt,
          durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        },
        stats: {
          experiencesCollected: collection.experiences.length,
          patternsDetected: patternDetection.patterns.length,
          autoPromoted: recommendations.stats.autoPromoted,
          queuedForReview: recommendations.stats.reviewQueued,
          rejected: recommendations.stats.rejected,
        },
        dryRun: request.dryRun ?? false,
        errors: errors.length > 0 ? errors : undefined,
      };

      this.lastAnalysis = result;
      logger.info({ runId, stats: result.stats, durationMs: result.timing.durationMs }, 'Analysis complete');

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ runId, error: errorMessage }, 'Analysis failed');
      throw error;
    }
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<LibrarianStatus> {
    const pendingCount = await this.recommendationStore.count({
      status: 'pending',
    });

    return {
      enabled: this.config.enabled,
      schedulerRunning: false, // Will be updated when scheduler is integrated
      schedule: this.config.schedule,
      nextRun: undefined, // Will be set by scheduler
      lastAnalysis: this.lastAnalysis
        ? {
            runId: this.lastAnalysis.runId,
            completedAt: this.lastAnalysis.timing.completedAt,
            stats: this.lastAnalysis.stats,
          }
        : undefined,
      config: this.config,
      pendingRecommendations: pendingCount,
    };
  }

  /**
   * Get the recommendation store
   */
  getRecommendationStore(): IRecommendationStore {
    return this.recommendationStore;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LibrarianConfig>): void {
    this.config = { ...this.config, ...config };

    // Update component configs
    if (config.patternDetection) {
      this.patternDetector = new PatternDetector({
        embeddingThreshold: this.config.patternDetection.embeddingSimilarityThreshold,
        trajectoryThreshold: this.config.patternDetection.trajectorySimilarityThreshold,
        minExperiences: this.config.patternDetection.minPatternSize,
      });
    }
    if (config.qualityGate) {
      this.qualityGate.setThresholds(config.qualityGate);
    }
    if (config.recommendations) {
      this.recommender.setOptions({ expirationDays: config.recommendations.expirationDays });
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): LibrarianConfig {
    return { ...this.config };
  }
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let serviceInstance: LibrarianService | null = null;

/**
 * Get or create the librarian service singleton
 * @deprecated Use context.services.librarian instead via dependency injection
 */
export function getLibrarianService(
  deps?: LibrarianServiceDeps,
  config?: Partial<LibrarianConfig>
): LibrarianService | null {
  if (serviceInstance) return serviceInstance;
  if (!deps) return null;
  serviceInstance = new LibrarianService(deps, config);
  return serviceInstance;
}

/**
 * Initialize the librarian service with dependencies
 * @deprecated Use context.services.librarian instead via dependency injection
 */
export function initializeLibrarianService(
  deps: LibrarianServiceDeps,
  config?: Partial<LibrarianConfig>
): LibrarianService {
  serviceInstance = new LibrarianService(deps, config);
  return serviceInstance;
}

/**
 * Reset the librarian service (for testing)
 */
export function resetLibrarianService(): void {
  serviceInstance = null;
}

// Re-export types
export * from './types.js';
export { createRecommendationStore, getRecommendationStore } from './recommendations/recommendation-store.js';
