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

  constructor(deps: DatabaseDeps, config: Partial<LibrarianConfig> = {}) {
    this.config = { ...DEFAULT_LIBRARIAN_CONFIG, ...config };

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

      // Stage 3: Quality Evaluation
      logger.debug({ runId, stage: 'quality_evaluation' }, 'Evaluating pattern quality');
      const qualityEvaluations = patternDetection.patterns.map(pattern => ({
        pattern,
        result: this.qualityGate.evaluate(pattern),
      }));

      // Stage 4: Recommendation Generation
      logger.debug({ runId, stage: 'recommendation_generation' }, 'Generating recommendations');
      const evaluationMap = new Map(qualityEvaluations.map(e => [e.pattern, e.result]));

      this.recommender.setOptions({
        analysisRunId: runId,
        createdBy: request.initiatedBy ?? 'librarian-agent',
      });

      const recommendations = this.recommender.generateRecommendations(
        patternDetection.patterns,
        evaluationMap,
        { scopeType: request.scopeType, scopeId: request.scopeId }
      );

      // Stage 5: Storage (if not dry run)
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
 */
export function getLibrarianService(
  deps?: DatabaseDeps,
  config?: Partial<LibrarianConfig>
): LibrarianService | null {
  if (serviceInstance) return serviceInstance;
  if (!deps) return null;
  serviceInstance = new LibrarianService(deps, config);
  return serviceInstance;
}

/**
 * Initialize the librarian service with dependencies
 */
export function initializeLibrarianService(
  deps: DatabaseDeps,
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
