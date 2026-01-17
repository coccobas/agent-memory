/**
 * Librarian Service
 *
 * Main orchestrator for the Librarian Agent.
 * Coordinates pattern detection, quality evaluation, and recommendation generation.
 */

import type { DatabaseDeps, AppDb } from '../../core/types.js';
import type { Repositories } from '../../core/interfaces/repositories.js';
import type { IEmbeddingService, IVectorService } from '../../core/context.js';
import type { GraphBackfillService } from '../graph/backfill.service.js';
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
import type { CaptureService, TurnData } from '../capture/index.js';
import { MaintenanceOrchestrator } from './maintenance/orchestrator.js';
import type { ScopeType } from '../../db/schema/types.js';
import type { RLService } from '../rl/index.js';
import { buildConsolidationState } from '../rl/state/consolidation.state.js';
import type { FeedbackService } from '../feedback/index.js';
import type { LatentMemoryService } from '../latent-memory/latent-memory.service.js';

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
  private lastSessionEnd?: SessionEndResult;
  private lastSessionStart?: SessionStartResult;
  private rlService?: RLService | null;
  private feedbackService?: FeedbackService | null;
  private maintenanceOrchestrator?: MaintenanceOrchestrator;
  private captureService?: CaptureService;
  private latentMemoryService?: LatentMemoryService;

  constructor(deps: LibrarianServiceDeps, config: Partial<LibrarianConfig> = {}) {
    this.config = { ...DEFAULT_LIBRARIAN_CONFIG, ...config };
    this.rlService = deps.rlService;
    this.feedbackService = deps.feedbackService;
    this.captureService = deps.captureService;
    this.latentMemoryService = deps.latentMemoryService;

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
  }): void {
    this.maintenanceOrchestrator = new MaintenanceOrchestrator(deps, this.config.maintenance);
    logger.debug('Maintenance orchestrator initialized');
  }

  /**
   * Set the capture service after construction.
   * Call this if CaptureService wasn't available at construction time.
   */
  setCaptureService(captureService: CaptureService): void {
    this.captureService = captureService;
    logger.debug('Capture service set for librarian');
  }

  /**
   * Set the latent memory service after construction.
   * Call this if LatentMemoryService wasn't available at construction time.
   */
  setLatentMemoryService(latentMemoryService: LatentMemoryService): void {
    this.latentMemoryService = latentMemoryService;
    logger.debug('Latent memory service set for librarian');
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
      logger.info(
        { runId, stats: result.stats, durationMs: result.timing.durationMs },
        'Analysis complete'
      );

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

  // ===========================================================================
  // MAINTENANCE OPERATIONS
  // ===========================================================================

  /**
   * Run maintenance tasks (consolidation, forgetting, graph backfill)
   */
  async runMaintenance(request: MaintenanceRequest): Promise<MaintenanceResult> {
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

    const result = await this.maintenanceOrchestrator.runMaintenance(request);
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
  // UNIFIED SESSION END PROCESSING
  // ===========================================================================

  /**
   * Unified session end handler - orchestrates the complete learning pipeline.
   *
   * Pipeline stages:
   * 1. Experience Capture: Extract experiences, knowledge, guidelines from conversation
   * 2. Pattern Analysis: Detect patterns in accumulated experiences
   * 3. Maintenance: Run consolidation, forgetting, and graph backfill
   *
   * @param request - Session end request with conversation data
   * @returns Combined results from all stages
   */
  async onSessionEnd(request: SessionEndRequest): Promise<SessionEndResult> {
    const startedAt = new Date().toISOString();
    const errors: string[] = [];

    logger.info(
      {
        sessionId: request.sessionId,
        projectId: request.projectId,
        skipCapture: request.skipCapture,
        skipAnalysis: request.skipAnalysis,
        skipMaintenance: request.skipMaintenance,
        dryRun: request.dryRun,
      },
      'Starting unified session end processing'
    );

    const result: SessionEndResult = {
      sessionId: request.sessionId,
      timing: {
        startedAt,
        completedAt: '', // Will be set at the end
        durationMs: 0,
      },
    };

    // Stage 1: Experience Capture
    if (!request.skipCapture && this.captureService && request.messages && request.messages.length >= 3) {
      try {
        const captureStart = Date.now();
        logger.debug({ sessionId: request.sessionId }, 'Running experience capture');

        // Initialize capture session with project context
        this.captureService.initSession(request.sessionId, request.projectId);

        // Convert messages to turn data and track them
        for (const msg of request.messages) {
          const turnData: TurnData = {
            role: msg.role,
            content: msg.content,
            timestamp: msg.createdAt ?? new Date().toISOString(),
            tokenCount: Math.ceil(msg.content.length / 4), // Rough estimate
            toolCalls: msg.toolsUsed
              ? msg.toolsUsed.map((tool: string) => ({
                  name: tool,
                  input: {}, // Input not available from stored messages
                  success: true,
                }))
              : undefined,
          };

          // Track turn metrics without triggering mid-session capture
          await this.captureService.onTurnComplete(request.sessionId, turnData, {
            autoStore: false,
          });
        }

        // Trigger session-end capture for experiences
        const captureResult = await this.captureService.onSessionEnd(request.sessionId, {
          projectId: request.projectId,
          scopeType: request.projectId ? 'project' : 'session',
          scopeId: request.projectId ?? request.sessionId,
          autoStore: !request.dryRun,
          skipDuplicates: true,
        });

        result.capture = {
          experiencesExtracted: captureResult.experiences.experiences.length,
          knowledgeExtracted: captureResult.knowledge.knowledge.length,
          guidelinesExtracted: captureResult.knowledge.guidelines.length,
          toolsExtracted: captureResult.knowledge.tools.length,
          skippedDuplicates: captureResult.experiences.skippedDuplicates ?? 0,
          processingTimeMs: Date.now() - captureStart,
        };

        logger.debug(
          {
            sessionId: request.sessionId,
            experiencesExtracted: result.capture.experiencesExtracted,
            knowledgeExtracted: result.capture.knowledgeExtracted,
            processingTimeMs: result.capture.processingTimeMs,
          },
          'Experience capture completed'
        );
      } catch (error) {
        const errorMsg = `Experience capture failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.warn({ sessionId: request.sessionId, error: errorMsg }, 'Experience capture failed (non-fatal)');
      }
    }

    // Stage 2: Pattern Analysis
    if (!request.skipAnalysis && request.projectId) {
      try {
        const analysisStart = Date.now();
        logger.debug({ sessionId: request.sessionId, projectId: request.projectId }, 'Running pattern analysis');

        const analysisResult = await this.analyze({
          scopeType: 'project',
          scopeId: request.projectId,
          lookbackDays: 7, // Shorter lookback for session-end analysis
          initiatedBy: request.agentId ?? 'session-end',
          dryRun: request.dryRun,
        });

        result.analysis = {
          patternsDetected: analysisResult.stats.patternsDetected,
          queuedForReview: analysisResult.stats.queuedForReview,
          autoPromoted: analysisResult.stats.autoPromoted,
          processingTimeMs: Date.now() - analysisStart,
        };

        logger.debug(
          {
            sessionId: request.sessionId,
            patternsDetected: result.analysis.patternsDetected,
            queuedForReview: result.analysis.queuedForReview,
            processingTimeMs: result.analysis.processingTimeMs,
          },
          'Pattern analysis completed'
        );
      } catch (error) {
        const errorMsg = `Pattern analysis failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.warn({ sessionId: request.sessionId, error: errorMsg }, 'Pattern analysis failed (non-fatal)');
      }
    }

    // Stage 3: Maintenance
    if (
      !request.skipMaintenance &&
      request.projectId &&
      this.maintenanceOrchestrator &&
      this.config.maintenance?.runOnSessionEnd
    ) {
      try {
        const maintenanceStart = Date.now();
        logger.debug({ sessionId: request.sessionId, projectId: request.projectId }, 'Running maintenance');

        const maintenanceResult = await this.runMaintenance({
          scopeType: 'project',
          scopeId: request.projectId,
          initiatedBy: request.agentId ?? 'session-end',
          dryRun: request.dryRun,
        });

        result.maintenance = {
          consolidationDeduped: maintenanceResult.consolidation?.entriesDeduped ?? 0,
          forgettingArchived: maintenanceResult.forgetting?.entriesForgotten ?? 0,
          graphNodesCreated: maintenanceResult.graphBackfill?.nodesCreated ?? 0,
          graphEdgesCreated: maintenanceResult.graphBackfill?.edgesCreated ?? 0,
          processingTimeMs: Date.now() - maintenanceStart,
        };

        logger.debug(
          {
            sessionId: request.sessionId,
            consolidationDeduped: result.maintenance.consolidationDeduped,
            forgettingArchived: result.maintenance.forgettingArchived,
            processingTimeMs: result.maintenance.processingTimeMs,
          },
          'Maintenance completed'
        );
      } catch (error) {
        const errorMsg = `Maintenance failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.warn({ sessionId: request.sessionId, error: errorMsg }, 'Maintenance failed (non-fatal)');
      }
    }

    // Finalize timing
    const completedAt = new Date().toISOString();
    result.timing = {
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };

    if (errors.length > 0) {
      result.errors = errors;
    }

    this.lastSessionEnd = result;

    logger.info(
      {
        sessionId: request.sessionId,
        durationMs: result.timing.durationMs,
        capture: result.capture
          ? {
              experiences: result.capture.experiencesExtracted,
              knowledge: result.capture.knowledgeExtracted,
            }
          : undefined,
        analysis: result.analysis
          ? {
              patterns: result.analysis.patternsDetected,
              queued: result.analysis.queuedForReview,
            }
          : undefined,
        maintenance: result.maintenance
          ? {
              deduped: result.maintenance.consolidationDeduped,
              archived: result.maintenance.forgettingArchived,
            }
          : undefined,
        errors: errors.length > 0 ? errors.length : undefined,
      },
      'Unified session end processing completed'
    );

    return result;
  }

  /**
   * Get last session end result
   */
  getLastSessionEnd(): SessionEndResult | undefined {
    return this.lastSessionEnd;
  }

  // ===========================================================================
  // UNIFIED SESSION START PROCESSING
  // ===========================================================================

  /**
   * Unified session start handler - warms the latent memory cache.
   *
   * Pipeline stages:
   * 1. Latent Memory Warming: Pre-warm cache with relevant entries for faster retrieval
   *
   * @param request - Session start request
   * @returns Cache warming results
   */
  async onSessionStart(request: SessionStartRequest): Promise<SessionStartResult> {
    const startedAt = new Date().toISOString();
    const errors: string[] = [];

    logger.info(
      {
        sessionId: request.sessionId,
        projectId: request.projectId,
        skipWarmup: request.skipWarmup,
      },
      'Starting unified session start processing'
    );

    const result: SessionStartResult = {
      sessionId: request.sessionId,
      timing: {
        startedAt,
        completedAt: '', // Will be set at the end
        durationMs: 0,
      },
    };

    // Stage 1: Latent Memory Warming
    const latentConfig = this.config.modules.latentMemory;
    if (
      !request.skipWarmup &&
      latentConfig.enabled &&
      this.latentMemoryService &&
      this.latentMemoryService.isAvailable()
    ) {
      try {
        const warmupStart = Date.now();
        logger.debug(
          {
            sessionId: request.sessionId,
            projectId: request.projectId,
            maxEntries: request.maxWarmEntries ?? latentConfig.maxWarmEntries,
          },
          'Running latent memory warmup'
        );

        // Build search query for relevant entries
        // For session start, we want to pre-warm with entries that might be useful
        const searchQuery = request.projectId
          ? `project context session preparation`
          : `general context session preparation`;

        // Search for similar entries to pre-warm
        const maxEntries = request.maxWarmEntries ?? latentConfig.maxWarmEntries ?? 100;
        const similarEntries = await this.latentMemoryService.findSimilar(searchQuery, {
          limit: maxEntries,
          minScore: latentConfig.minImportanceScore ?? 0.3,
          sourceTypes: ['guideline', 'knowledge', 'tool'],
          sessionId: request.sessionId,
        });

        // Track access to warm entries (this updates importance and caches them)
        let warmedCount = 0;
        for (const entry of similarEntries) {
          try {
            await this.latentMemoryService.trackAccess(entry.id);
            warmedCount++;
          } catch (error) {
            // Non-fatal: just log and continue
            logger.debug(
              { entryId: entry.id, error: error instanceof Error ? error.message : String(error) },
              'Failed to track access during warmup'
            );
          }
        }

        result.warmup = {
          entriesWarmed: warmedCount,
          cacheHitRate: similarEntries.length > 0 ? warmedCount / similarEntries.length : 0,
          processingTimeMs: Date.now() - warmupStart,
        };

        logger.debug(
          {
            sessionId: request.sessionId,
            entriesWarmed: result.warmup.entriesWarmed,
            cacheHitRate: result.warmup.cacheHitRate,
            processingTimeMs: result.warmup.processingTimeMs,
          },
          'Latent memory warmup completed'
        );
      } catch (error) {
        const errorMsg = `Latent memory warmup failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.warn({ sessionId: request.sessionId, error: errorMsg }, 'Latent memory warmup failed (non-fatal)');
      }
    } else if (!request.skipWarmup && latentConfig.enabled && !this.latentMemoryService) {
      logger.debug({ sessionId: request.sessionId }, 'Latent memory service not available, skipping warmup');
    } else if (!request.skipWarmup && latentConfig.enabled && this.latentMemoryService && !this.latentMemoryService.isAvailable()) {
      logger.debug({ sessionId: request.sessionId }, 'Latent memory service unavailable (embeddings disabled), skipping warmup');
    }

    // Finalize timing
    const completedAt = new Date().toISOString();
    result.timing = {
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };

    if (errors.length > 0) {
      result.errors = errors;
    }

    this.lastSessionStart = result;

    logger.info(
      {
        sessionId: request.sessionId,
        durationMs: result.timing.durationMs,
        warmup: result.warmup
          ? {
              entriesWarmed: result.warmup.entriesWarmed,
              cacheHitRate: result.warmup.cacheHitRate,
            }
          : undefined,
        errors: errors.length > 0 ? errors.length : undefined,
      },
      'Unified session start processing completed'
    );

    return result;
  }

  /**
   * Get last session start result
   */
  getLastSessionStart(): SessionStartResult | undefined {
    return this.lastSessionStart;
  }
}

// Re-export types
export * from './types.js';
export * from './maintenance/index.js';
export {
  createRecommendationStore,
  getRecommendationStore,
} from './recommendations/recommendation-store.js';
