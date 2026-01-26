/**
 * Librarian Service
 *
 * Main orchestrator for the Librarian Agent.
 * Coordinates pattern detection, quality evaluation, and recommendation generation.
 */

import type { DatabaseDeps, AppDb } from '../../core/types.js';
import type { Repositories } from '../../core/interfaces/repositories.js';
import type { IEmbeddingService, IVectorService, IExtractionService } from '../../core/context.js';
import type { GraphBackfillService } from '../graph/backfill.service.js';
import type { SemanticEdgeInferenceService } from '../graph/semantic-edge-inference.service.js';
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
  type MaintenanceRequest,
  type MaintenanceResult,
  type MemoryHealth,
  type SessionEndRequest,
  type SessionEndResult,
  type SessionStartRequest,
  type SessionStartResult,
} from './types.js';
import type { CaptureService } from '../capture/index.js';
import { MaintenanceOrchestrator, type TaskProgressCallback } from './maintenance/orchestrator.js';
import { getMaintenanceJobManager } from './maintenance/job-manager.js';
import type { ScopeType } from '../../db/schema/types.js';
import type { RLService } from '../rl/index.js';
import { buildConsolidationState } from '../rl/state/consolidation.state.js';
import type { FeedbackService } from '../feedback/index.js';
import type { LatentMemoryService } from '../latent-memory/latent-memory.service.js';
import { SessionLifecycleHandler } from './session-lifecycle.js';
import { CheckpointManager } from './checkpoint-manager.js';
import type { MissedExtractionDetector } from './missed-extraction/index.js';

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
  /** Optional full AppDb for maintenance operations */
  appDb?: AppDb;
  /** Optional repositories for maintenance operations */
  repos?: Repositories;
  /** Optional graph backfill service for maintenance */
  graphBackfill?: GraphBackfillService;
  /** Optional embedding service for maintenance */
  embedding?: IEmbeddingService;
  /** Optional vector service for maintenance */
  vector?: IVectorService;
  /** Optional capture service for experience extraction */
  captureService?: CaptureService;
  /** Optional latent memory service for cache warming */
  latentMemoryService?: LatentMemoryService;
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
  private lastMaintenance?: MaintenanceResult;
  private rlService?: RLService | null;
  private feedbackService?: FeedbackService | null;
  private maintenanceOrchestrator?: MaintenanceOrchestrator;

  // Extracted components
  private sessionLifecycle: SessionLifecycleHandler;
  private checkpointManager: CheckpointManager;

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

    // Initialize checkpoint manager
    this.checkpointManager = new CheckpointManager();

    this.sessionLifecycle = new SessionLifecycleHandler({
      captureService: deps.captureService,
      latentMemoryService: deps.latentMemoryService,
      recommendationStore: this.recommendationStore,
      config: this.config,
      analyze: this.analyze.bind(this),
      runMaintenance: this.runMaintenance.bind(this),
      runMaintenanceWithJob: this.runMaintenanceWithJob.bind(this),
    });

    // Initialize maintenance orchestrator if we have the required deps at construction time
    if (deps.appDb && deps.repos) {
      this.initMaintenanceOrchestrator({
        db: deps.appDb,
        repos: deps.repos,
        graphBackfill: deps.graphBackfill,
        embedding: deps.embedding,
        vector: deps.vector,
      });
    }
  }

  /**
   * Initialize or re-initialize the maintenance orchestrator with dependencies.
   * Call this after construction if repos/services weren't available at construction time.
   */
  initMaintenanceOrchestrator(deps: {
    db: AppDb;
    repos: Repositories;
    graphBackfill?: GraphBackfillService;
    embedding?: IEmbeddingService;
    vector?: IVectorService;
    latentMemory?: LatentMemoryService;
    semanticEdgeInference?: SemanticEdgeInferenceService;
  }): void {
    this.maintenanceOrchestrator = new MaintenanceOrchestrator(deps, this.config.maintenance);
    this.sessionLifecycle.setMaintenanceOrchestrator(this.maintenanceOrchestrator);
    logger.debug('Maintenance orchestrator initialized');
  }

  /**
   * Set the capture service after construction.
   * Call this if CaptureService wasn't available at construction time.
   */
  setCaptureService(captureService: CaptureService): void {
    this.sessionLifecycle.setCaptureService(captureService);
    logger.debug('Capture service set for librarian');
  }

  /**
   * Set the latent memory service after construction.
   * Call this if LatentMemoryService wasn't available at construction time.
   */
  setLatentMemoryService(latentMemoryService: LatentMemoryService): void {
    this.sessionLifecycle.setLatentMemoryService(latentMemoryService);
    logger.debug('Latent memory service set for librarian');
  }

  /**
   * Set the missed extraction detector after construction.
   * Call this if MissedExtractionDetector wasn't available at construction time.
   */
  setMissedExtractionDetector(detector: MissedExtractionDetector): void {
    this.sessionLifecycle.setMissedExtractionDetector(detector);
    logger.debug('Missed extraction detector set for librarian');
  }

  setExtractionService(extractionService: IExtractionService): void {
    this.recommender.setExtractionService(extractionService);
    logger.debug('Extraction service set for librarian recommender');
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
   *
   * Supports incremental processing via checkpoint system. When a checkpoint
   * exists for the scope, only experiences created after the checkpoint are
   * analyzed, significantly improving performance for repeated runs.
   */
  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    const runId = request.runId ?? generateId();
    const startedAt = new Date().toISOString();
    const errors: string[] = [];

    logger.info({ runId, request }, 'Starting librarian analysis');

    // Load checkpoint for incremental processing
    const checkpoint = this.checkpointManager.getForScope(request.scopeType, request.scopeId);
    const incrementalFrom = checkpoint?.lastExperienceCreatedAt;

    if (incrementalFrom) {
      logger.debug(
        { runId, incrementalFrom, scopeType: request.scopeType, scopeId: request.scopeId },
        'Using incremental collection from checkpoint'
      );
    }

    // Mark analysis as started
    this.checkpointManager.markStarted(request.scopeType, request.scopeId, runId);

    try {
      // Stage 1: Collection (incremental if checkpoint exists)
      logger.debug(
        { runId, stage: 'collection', isIncremental: !!incrementalFrom },
        'Collecting experiences'
      );
      const collection = await this.collector.collectUnpromotedIncremental(
        {
          scopeType: request.scopeType,
          scopeId: request.scopeId,
          lookbackDays: request.lookbackDays ?? this.config.collection.lookbackDays,
          limit: request.maxExperiences ?? this.config.collection.maxExperiences,
          levelFilter: 'case',
        },
        incrementalFrom
      );

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
          patternDetection: {
            patterns: [],
            unmatched: [],
            processingTimeMs: 0,
            stats: {
              totalExperiences: 0,
              patternsFound: 0,
              experiencesInPatterns: 0,
              averagePatternSize: 0,
              embeddingsUsed: false,
            },
          },
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
      const experiencesWithTrajectory = collection.experiences.map((ce) => ({
        experience: ce.experience,
        trajectory: ce.trajectory,
      }));

      const patternDetection = await this.patternDetector.detectPatterns(experiencesWithTrajectory);

      logger.debug(
        { runId, patternsDetected: patternDetection.patterns.length },
        'Pattern detection complete'
      );

      // Stage 3: RL Consolidation Policy Integration (Optional)
      let filteredPatterns = patternDetection.patterns;
      const rlService = this.rlService;
      const feedbackService = this.feedbackService;

      if (rlService?.isEnabled() && rlService.getConsolidationPolicy().isEnabled()) {
        logger.debug(
          { runId, stage: 'rl_consolidation_policy' },
          'Consulting RL consolidation policy'
        );

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
                // Bug fix: Use .at(-1) which explicitly returns undefined for empty arrays
                lastAccessedAt: pattern.experiences
                  .map((e) => e.experience.lastUsedAt)
                  .filter((d): d is string => d !== null)
                  .sort()
                  .at(-1),
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
      const qualityEvaluations = filteredPatterns.map((pattern) => ({
        pattern,
        result: this.qualityGate.evaluate(pattern),
      }));

      // Stage 5: Recommendation Generation
      logger.debug({ runId, stage: 'recommendation_generation' }, 'Generating recommendations');
      const evaluationMap = new Map(qualityEvaluations.map((e) => [e.pattern, e.result]));

      this.recommender.setOptions({
        analysisRunId: runId,
        createdBy: request.initiatedBy ?? 'librarian-agent',
      });

      const recommendations = await this.recommender.generateRecommendations(
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

      // Update checkpoint for incremental processing
      // Use the latest experience createdAt as the cursor for next run
      if (!request.dryRun) {
        if (collection.latestExperienceCreatedAt) {
          this.checkpointManager.markCompleted(request.scopeType, request.scopeId, {
            runId,
            lastExperienceCreatedAt: collection.latestExperienceCreatedAt,
            experiencesProcessed: collection.experiences.length,
            patternsDetected: patternDetection.patterns.length,
            recommendationsGenerated: recommendations.recommendations.length,
          });
        } else {
          // Mark completed even if no experiences (resets error state)
          this.checkpointManager.updateStatus(
            request.scopeType,
            request.scopeId,
            runId,
            completedAt
          );
        }
      }

      logger.info(
        {
          runId,
          stats: result.stats,
          durationMs: result.timing.durationMs,
          isIncremental: collection.isIncremental,
        },
        'Analysis complete'
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ runId, error: errorMessage }, 'Analysis failed');

      // Mark checkpoint as failed
      this.checkpointManager.markFailed(request.scopeType, request.scopeId, errorMessage);

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

  // ===========================================================================
  // MAINTENANCE OPERATIONS
  // ===========================================================================

  /**
   * Run maintenance tasks (consolidation, forgetting, graph backfill)
   */
  async runMaintenance(
    request: MaintenanceRequest,
    onProgress?: TaskProgressCallback
  ): Promise<MaintenanceResult> {
    if (!this.maintenanceOrchestrator) {
      throw new Error(
        'Maintenance orchestrator not initialized. Provide appDb and repos in constructor.'
      );
    }

    logger.info(
      {
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        tasks: request.tasks,
        dryRun: request.dryRun,
      },
      'Running maintenance via librarian'
    );

    const result = await this.maintenanceOrchestrator.runMaintenance(request, onProgress);
    this.lastMaintenance = result;

    logger.info(
      {
        runId: result.runId,
        durationMs: result.timing.durationMs,
        consolidation: result.consolidation?.executed,
        forgetting: result.forgetting?.executed,
        graphBackfill: result.graphBackfill?.executed,
        healthScore: result.healthAfter?.score,
      },
      'Maintenance completed'
    );

    return result;
  }

  /**
   * Run maintenance tasks with job tracking.
   * Creates a job record that can be queried via list_jobs/get_job_status.
   * Used by session-end processing for visibility into background maintenance.
   */
  async runMaintenanceWithJob(request: MaintenanceRequest): Promise<MaintenanceResult> {
    if (!this.maintenanceOrchestrator) {
      throw new Error(
        'Maintenance orchestrator not initialized. Provide appDb and repos in constructor.'
      );
    }

    const jobManager = getMaintenanceJobManager();

    if (!jobManager.canStartJob()) {
      logger.info(
        { scopeType: request.scopeType, scopeId: request.scopeId },
        'Maintenance job already running, falling back to direct execution'
      );
      return this.runMaintenance(request);
    }

    const job = await jobManager.createJob(request);
    await jobManager.startJob(job.id);

    logger.info(
      {
        jobId: job.id,
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        tasks: request.tasks,
        initiatedBy: request.initiatedBy,
      },
      'Started maintenance job from session-end'
    );

    try {
      const result = await this.maintenanceOrchestrator.runMaintenance(
        request,
        (taskName, status, taskResult) => {
          void jobManager.updateTaskProgress(job.id, taskName, { status, result: taskResult });
        }
      );

      await jobManager.completeJob(job.id, result);
      this.lastMaintenance = result;

      logger.info(
        {
          jobId: job.id,
          runId: result.runId,
          durationMs: result.timing.durationMs,
        },
        'Maintenance job completed'
      );

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await jobManager.failJob(job.id, errorMsg);
      logger.error({ jobId: job.id, error: errorMsg }, 'Maintenance job failed');
      throw error;
    }
  }

  /**
   * Get memory health for a scope
   */
  async getHealth(scopeType: ScopeType, scopeId?: string): Promise<MemoryHealth> {
    if (!this.maintenanceOrchestrator) {
      throw new Error(
        'Maintenance orchestrator not initialized. Provide appDb and repos in constructor.'
      );
    }

    return this.maintenanceOrchestrator.computeHealth(scopeType, scopeId);
  }

  /**
   * Get last maintenance result
   */
  getLastMaintenance(): MaintenanceResult | undefined {
    return this.lastMaintenance;
  }

  /**
   * Check if maintenance orchestrator is available
   */
  hasMaintenanceOrchestrator(): boolean {
    return !!this.maintenanceOrchestrator;
  }

  // ===========================================================================
  // UNIFIED SESSION LIFECYCLE (Delegated to SessionLifecycleHandler)
  // ===========================================================================

  /**
   * Unified session end handler - orchestrates the complete learning pipeline.
   * Delegates to SessionLifecycleHandler for implementation.
   *
   * @param request - Session end request with conversation data
   * @returns Combined results from all stages
   */
  async onSessionEnd(request: SessionEndRequest): Promise<SessionEndResult> {
    return this.sessionLifecycle.onSessionEnd(request);
  }

  /**
   * Get last session end result
   */
  getLastSessionEnd(): SessionEndResult | undefined {
    return this.sessionLifecycle.getLastSessionEnd();
  }

  /**
   * Unified session start handler - warms the latent memory cache.
   * Delegates to SessionLifecycleHandler for implementation.
   *
   * @param request - Session start request
   * @returns Cache warming results
   */
  async onSessionStart(request: SessionStartRequest): Promise<SessionStartResult> {
    return this.sessionLifecycle.onSessionStart(request);
  }

  /**
   * Get last session start result
   */
  getLastSessionStart(): SessionStartResult | undefined {
    return this.sessionLifecycle.getLastSessionStart();
  }
}

// Re-export types
export * from './types.js';
export * from './maintenance/index.js';
export {
  createRecommendationStore,
  getRecommendationStore,
} from './recommendations/recommendation-store.js';
export { SessionLifecycleHandler, type SessionLifecycleDeps } from './session-lifecycle.js';
export { CheckpointManager, createCheckpointManager } from './checkpoint-manager.js';
