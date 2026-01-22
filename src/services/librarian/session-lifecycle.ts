/**
 * Session Lifecycle Handlers for Librarian Service
 *
 * Handles unified session start and session end processing including:
 * - Experience capture from conversation data
 * - Pattern analysis
 * - Maintenance operations (consolidation, forgetting, graph backfill)
 * - Latent memory cache warming
 */

import { createComponentLogger } from '../../utils/logger.js';
import { notify } from '../../utils/notification.service.js';
import type { CaptureService, TurnData } from '../capture/index.js';
import type { LatentMemoryService } from '../latent-memory/latent-memory.service.js';
import type { MaintenanceOrchestrator } from './maintenance/orchestrator.js';
import type { MissedExtractionDetector, MissedEntry } from './missed-extraction/index.js';
import type {
  IRecommendationStore,
  CreateRecommendationInput,
} from './recommendations/recommendation-store.js';
import type {
  LibrarianConfig,
  SessionEndRequest,
  SessionEndResult,
  SessionStartRequest,
  SessionStartResult,
  AnalysisRequest,
  AnalysisResult,
  MaintenanceRequest,
  MaintenanceResult,
  ProactiveRecommendation,
} from './types.js';
import type { RecommendationType } from '../../db/schema.js';
import { detectComplexitySignals } from '../../utils/transcript-analysis.js';

const logger = createComponentLogger('librarian:session-lifecycle');

/**
 * Dependencies required for session lifecycle operations
 */
export interface SessionLifecycleDeps {
  captureService?: CaptureService;
  latentMemoryService?: LatentMemoryService;
  maintenanceOrchestrator?: MaintenanceOrchestrator;
  missedExtractionDetector?: MissedExtractionDetector;
  recommendationStore?: IRecommendationStore;
  config: LibrarianConfig;
  analyze: (request: AnalysisRequest) => Promise<AnalysisResult>;
  runMaintenance: (request: MaintenanceRequest) => Promise<MaintenanceResult>;
}

/**
 * Session Lifecycle Handler
 *
 * Encapsulates session start and session end processing logic
 */
export class SessionLifecycleHandler {
  private captureService?: CaptureService;
  private latentMemoryService?: LatentMemoryService;
  private maintenanceOrchestrator?: MaintenanceOrchestrator;
  private missedExtractionDetector?: MissedExtractionDetector;
  private recommendationStore?: IRecommendationStore;
  private config: LibrarianConfig;
  private analyze: (request: AnalysisRequest) => Promise<AnalysisResult>;
  private runMaintenance: (request: MaintenanceRequest) => Promise<MaintenanceResult>;

  private lastSessionEnd?: SessionEndResult;
  private lastSessionStart?: SessionStartResult;

  constructor(deps: SessionLifecycleDeps) {
    this.captureService = deps.captureService;
    this.latentMemoryService = deps.latentMemoryService;
    this.maintenanceOrchestrator = deps.maintenanceOrchestrator;
    this.missedExtractionDetector = deps.missedExtractionDetector;
    this.recommendationStore = deps.recommendationStore;
    this.config = deps.config;
    this.analyze = deps.analyze;
    this.runMaintenance = deps.runMaintenance;
  }

  /**
   * Update dependencies after construction
   */
  setCaptureService(captureService: CaptureService): void {
    this.captureService = captureService;
    logger.debug('Capture service set for session lifecycle handler');
  }

  setLatentMemoryService(latentMemoryService: LatentMemoryService): void {
    this.latentMemoryService = latentMemoryService;
    logger.debug('Latent memory service set for session lifecycle handler');
  }

  setMaintenanceOrchestrator(orchestrator: MaintenanceOrchestrator): void {
    this.maintenanceOrchestrator = orchestrator;
    logger.debug('Maintenance orchestrator set for session lifecycle handler');
  }

  setMissedExtractionDetector(detector: MissedExtractionDetector): void {
    this.missedExtractionDetector = detector;
    logger.debug('Missed extraction detector set for session lifecycle handler');
  }

  setRecommendationStore(store: IRecommendationStore): void {
    this.recommendationStore = store;
    logger.debug('Recommendation store set for session lifecycle handler');
  }

  updateConfig(config: LibrarianConfig): void {
    this.config = config;
  }

  private mapEntryTypeToRecommendationType(
    entryType: 'knowledge' | 'guideline' | 'tool'
  ): RecommendationType {
    switch (entryType) {
      case 'guideline':
        return 'missed_guideline';
      case 'knowledge':
        return 'missed_knowledge';
      case 'tool':
        return 'missed_tool';
    }
  }

  private async storeRecommendationsFromMissedEntries(
    entries: MissedEntry[],
    request: SessionEndRequest
  ): Promise<number> {
    if (!this.recommendationStore || entries.length === 0) {
      return 0;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (this.config.recommendations?.expirationDays ?? 30));

    let storedCount = 0;
    for (const entry of entries) {
      try {
        const input: CreateRecommendationInput = {
          scopeType: request.projectId ? 'project' : 'session',
          scopeId: request.projectId ?? request.sessionId,
          type: this.mapEntryTypeToRecommendationType(entry.type),
          title: entry.name,
          pattern: entry.content,
          rationale:
            entry.rationale ??
            `Extracted from session conversation (confidence: ${(entry.confidence * 100).toFixed(0)}%)`,
          confidence: entry.confidence,
          patternCount: 1,
          sourceExperienceIds: [],
          extractedEntry: {
            content: entry.content,
            category: entry.category,
            tags: entry.suggestedTags,
            priority: entry.priority,
          },
          analysisRunId: request.sessionId,
          analysisVersion: 'missed-extraction-v1',
          expiresAt: expiresAt.toISOString(),
          createdBy: request.agentId ?? 'session-end',
        };

        await this.recommendationStore.create(input);
        storedCount++;
      } catch (error) {
        logger.warn(
          { entry: entry.name, error: error instanceof Error ? error.message : String(error) },
          'Failed to store missed extraction recommendation'
        );
      }
    }

    return storedCount;
  }

  /**
   * Unified session end handler - orchestrates the complete learning pipeline.
   *
   * Pipeline stages:
   * 1. Experience Capture: Extract experiences, knowledge, guidelines from conversation
   * 2. Missed Extraction: Re-analyze conversation to find facts/decisions not captured
   * 3. Pattern Analysis: Detect patterns in accumulated experiences
   * 4. Maintenance: Run consolidation, forgetting, and graph backfill
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
        skipMissedExtraction: request.skipMissedExtraction,
        skipAnalysis: request.skipAnalysis,
        skipMaintenance: request.skipMaintenance,
        dryRun: request.dryRun,
      },
      'Starting unified session end processing'
    );

    void notify.notice('🔄 Session end: starting librarian pipeline', 'librarian');

    const result: SessionEndResult = {
      sessionId: request.sessionId,
      timing: {
        startedAt,
        completedAt: '', // Will be set at the end
        durationMs: 0,
      },
    };

    // Stage 1: Experience Capture
    if (
      !request.skipCapture &&
      this.captureService &&
      request.messages &&
      request.messages.length >= 3
    ) {
      void notify.info('🔄 Stage 1/4: Capturing experiences...', 'librarian');
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

        void notify.notice(
          `✓ Stage 1/4: Captured ${result.capture.experiencesExtracted} exp, ${result.capture.knowledgeExtracted} knowledge (${result.capture.processingTimeMs}ms)`,
          'librarian'
        );
      } catch (error) {
        const errorMsg = `Experience capture failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.warn(
          { sessionId: request.sessionId, error: errorMsg },
          'Experience capture failed (non-fatal)'
        );
        void notify.warning('⚠ Stage 1/4: Capture failed (non-fatal)', 'librarian');
      }
    }

    // Stage 2: Missed Extraction Detection
    // Re-analyze conversation to find facts/decisions that weren't captured
    const missedExtractionConfig = this.config.modules.missedExtraction;
    if (
      !request.skipMissedExtraction &&
      missedExtractionConfig?.enabled &&
      this.missedExtractionDetector &&
      request.messages &&
      request.messages.length >= (missedExtractionConfig.minMessages ?? 3)
    ) {
      void notify.info('🔄 Stage 2/4: Detecting missed extractions...', 'librarian');
      try {
        const missedStart = Date.now();
        logger.debug(
          { sessionId: request.sessionId, projectId: request.projectId },
          'Running missed extraction detection'
        );

        const missedResult = await this.missedExtractionDetector.detect({
          sessionId: request.sessionId,
          projectId: request.projectId,
          messages: request.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt,
            toolsUsed: msg.toolsUsed,
          })),
          scopeType: request.projectId ? 'project' : 'session',
          scopeId: request.projectId ?? request.sessionId,
          agentId: request.agentId,
        });

        result.missedExtraction = {
          totalExtracted: missedResult.totalExtracted,
          queuedForReview: missedResult.missedEntries.length,
          duplicatesFiltered: missedResult.duplicatesFiltered,
          belowThreshold: missedResult.belowThresholdCount,
          processingTimeMs: Date.now() - missedStart,
          skippedReason: missedResult.skippedReason,
        };

        logger.debug(
          {
            sessionId: request.sessionId,
            totalExtracted: result.missedExtraction.totalExtracted,
            queuedForReview: result.missedExtraction.queuedForReview,
            duplicatesFiltered: result.missedExtraction.duplicatesFiltered,
            processingTimeMs: result.missedExtraction.processingTimeMs,
          },
          'Missed extraction detection completed'
        );

        // Store missed entries as recommendations for review
        if (missedResult.missedEntries.length > 0 && this.recommendationStore) {
          const storedCount = await this.storeRecommendationsFromMissedEntries(
            missedResult.missedEntries,
            request
          );
          result.missedExtraction.queuedForReview = storedCount;

          logger.debug(
            { sessionId: request.sessionId, storedCount },
            'Stored missed extraction recommendations'
          );
        }

        void notify.notice(
          `✓ Stage 2/4: Extracted ${result.missedExtraction.totalExtracted}, queued ${result.missedExtraction.queuedForReview} (${result.missedExtraction.processingTimeMs}ms)`,
          'librarian'
        );
      } catch (error) {
        const errorMsg = `Missed extraction detection failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.warn(
          { sessionId: request.sessionId, error: errorMsg },
          'Missed extraction detection failed (non-fatal)'
        );
        void notify.warning('⚠ Stage 2/4: Missed extraction failed (non-fatal)', 'librarian');
      }
    }

    // Stage 3: Pattern Analysis
    if (!request.skipAnalysis && request.projectId) {
      void notify.info('🔄 Stage 3/4: Analyzing patterns...', 'librarian');
      try {
        const analysisStart = Date.now();
        logger.debug(
          { sessionId: request.sessionId, projectId: request.projectId },
          'Running pattern analysis'
        );

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

        void notify.notice(
          `✓ Stage 3/4: Detected ${result.analysis.patternsDetected} patterns (${result.analysis.processingTimeMs}ms)`,
          'librarian'
        );
      } catch (error) {
        const errorMsg = `Pattern analysis failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.warn(
          { sessionId: request.sessionId, error: errorMsg },
          'Pattern analysis failed (non-fatal)'
        );
        void notify.warning('⚠ Stage 3/4: Pattern analysis failed (non-fatal)', 'librarian');
      }
    }

    // Stage 4: Maintenance
    if (
      !request.skipMaintenance &&
      request.projectId &&
      this.maintenanceOrchestrator &&
      this.config.maintenance?.runOnSessionEnd
    ) {
      void notify.info('🔄 Stage 4/4: Running maintenance...', 'librarian');
      try {
        const maintenanceStart = Date.now();
        logger.debug(
          { sessionId: request.sessionId, projectId: request.projectId },
          'Running maintenance'
        );

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

        void notify.notice(
          `✓ Stage 4/4: Deduped ${result.maintenance.consolidationDeduped}, archived ${result.maintenance.forgettingArchived} (${result.maintenance.processingTimeMs}ms)`,
          'librarian'
        );
      } catch (error) {
        const errorMsg = `Maintenance failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.warn(
          { sessionId: request.sessionId, error: errorMsg },
          'Maintenance failed (non-fatal)'
        );
        void notify.warning('⚠ Stage 4/4: Maintenance failed (non-fatal)', 'librarian');
      }
    }

    if (request.messages && request.messages.length > 0) {
      const transcriptData: TurnData[] = request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.createdAt,
      }));

      const complexitySignals = detectComplexitySignals(transcriptData);
      const recommendations = this.generateProactiveRecommendations(
        transcriptData,
        complexitySignals
      );

      if (recommendations.length > 0) {
        result.proactiveRecommendations = recommendations;
        result.complexityScore = complexitySignals.score;
        logger.debug(
          {
            sessionId: request.sessionId,
            recommendationCount: recommendations.length,
            complexityScore: complexitySignals.score,
          },
          'Generated proactive recommendations'
        );
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

    void notify.notice(
      `✅ Session end: librarian complete (${result.timing.durationMs}ms)`,
      'librarian'
    );

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
        missedExtraction: result.missedExtraction
          ? {
              extracted: result.missedExtraction.totalExtracted,
              queued: result.missedExtraction.queuedForReview,
              filtered: result.missedExtraction.duplicatesFiltered,
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
   * Unified session start handler - warms the latent memory cache.
   *
   * Pipeline stages:
   * 0. (If source === 'clear') Lightweight capture: Extract experiences and run consolidation
   * 1. Latent Memory Warming: Pre-warm cache with relevant entries for faster retrieval
   *
   * @param request - Session start request
   * @returns Cache warming results
   */
  async onSessionStart(request: SessionStartRequest): Promise<SessionStartResult> {
    const startedAt = new Date().toISOString();
    const errors: string[] = [];
    const source = request.source ?? 'startup';

    logger.info(
      {
        sessionId: request.sessionId,
        projectId: request.projectId,
        skipWarmup: request.skipWarmup,
        source,
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

    // Stage 0: Clear Capture (only when source === 'clear')
    // Lightweight pipeline: capture + consolidation only (no pattern analysis or full maintenance)
    if (source === 'clear' && request.projectId) {
      try {
        const clearStart = Date.now();
        logger.info(
          { sessionId: request.sessionId, projectId: request.projectId },
          'Running lightweight capture pipeline before clear'
        );

        let experiencesExtracted = 0;
        let knowledgeExtracted = 0;
        let consolidationDeduped = 0;

        // Run experience capture if capture service is available
        if (this.captureService) {
          try {
            // Trigger capture from any accumulated turn data
            // Note: We use onSessionEnd-like capture but in a lightweight way
            const captureResult = await this.captureService.onSessionEnd(request.sessionId, {
              projectId: request.projectId,
              scopeType: 'project',
              scopeId: request.projectId,
              autoStore: true,
              skipDuplicates: true,
            });

            experiencesExtracted = captureResult.experiences.experiences.length;
            knowledgeExtracted =
              captureResult.knowledge.knowledge.length +
              captureResult.knowledge.guidelines.length +
              captureResult.knowledge.tools.length;

            logger.debug(
              {
                sessionId: request.sessionId,
                experiencesExtracted,
                knowledgeExtracted,
              },
              'Clear capture: experience extraction completed'
            );
          } catch (captureError) {
            const errorMsg = `Clear capture extraction failed: ${captureError instanceof Error ? captureError.message : String(captureError)}`;
            errors.push(errorMsg);
            logger.warn(
              { sessionId: request.sessionId, error: errorMsg },
              'Clear capture extraction failed (non-fatal)'
            );
          }
        }

        // Run lightweight consolidation only (no forgetting or graph backfill for speed)
        if (this.maintenanceOrchestrator) {
          try {
            const maintenanceResult = await this.runMaintenance({
              scopeType: 'project',
              scopeId: request.projectId,
              tasks: ['consolidation'], // Only consolidation for speed
              initiatedBy: request.agentId ?? 'clear-hook',
              dryRun: false,
            });

            consolidationDeduped = maintenanceResult.consolidation?.entriesDeduped ?? 0;

            logger.debug(
              {
                sessionId: request.sessionId,
                consolidationDeduped,
              },
              'Clear capture: consolidation completed'
            );
          } catch (maintenanceError) {
            const errorMsg = `Clear capture consolidation failed: ${maintenanceError instanceof Error ? maintenanceError.message : String(maintenanceError)}`;
            errors.push(errorMsg);
            logger.warn(
              { sessionId: request.sessionId, error: errorMsg },
              'Clear capture consolidation failed (non-fatal)'
            );
          }
        }

        result.clearCapture = {
          experiencesExtracted,
          knowledgeExtracted,
          consolidationDeduped,
          processingTimeMs: Date.now() - clearStart,
        };

        logger.info(
          {
            sessionId: request.sessionId,
            projectId: request.projectId,
            experiencesExtracted,
            knowledgeExtracted,
            consolidationDeduped,
            processingTimeMs: result.clearCapture.processingTimeMs,
          },
          'Lightweight capture pipeline completed before clear'
        );
      } catch (error) {
        const errorMsg = `Clear capture pipeline failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.warn(
          { sessionId: request.sessionId, error: errorMsg },
          'Clear capture pipeline failed (non-fatal)'
        );
      }
    }

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
        logger.warn(
          { sessionId: request.sessionId, error: errorMsg },
          'Latent memory warmup failed (non-fatal)'
        );
      }
    } else if (!request.skipWarmup && latentConfig.enabled && !this.latentMemoryService) {
      logger.debug(
        { sessionId: request.sessionId },
        'Latent memory service not available, skipping warmup'
      );
    } else if (
      !request.skipWarmup &&
      latentConfig.enabled &&
      this.latentMemoryService &&
      !this.latentMemoryService.isAvailable()
    ) {
      logger.debug(
        { sessionId: request.sessionId },
        'Latent memory service unavailable (embeddings disabled), skipping warmup'
      );
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
        source,
        durationMs: result.timing.durationMs,
        clearCapture: result.clearCapture
          ? {
              experiencesExtracted: result.clearCapture.experiencesExtracted,
              knowledgeExtracted: result.clearCapture.knowledgeExtracted,
              consolidationDeduped: result.clearCapture.consolidationDeduped,
            }
          : undefined,
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
   * Get last session end result
   */
  getLastSessionEnd(): SessionEndResult | undefined {
    return this.lastSessionEnd;
  }

  getLastSessionStart(): SessionStartResult | undefined {
    return this.lastSessionStart;
  }

  private generateProactiveRecommendations(
    transcript: TurnData[],
    complexitySignals: {
      score: number;
      signals: string[];
      hasErrorRecovery: boolean;
      hasDecisions: boolean;
      hasLearning: boolean;
    }
  ): ProactiveRecommendation[] {
    const recommendations: ProactiveRecommendation[] = [];
    const MAX_RECOMMENDATIONS = 5;

    const combinedText = transcript.map((t) => t.content).join(' ');
    const lowerText = combinedText.toLowerCase();

    const alwaysMatches = combinedText.match(/\balways\s+([^.!?]+)/gi) || [];
    for (const match of alwaysMatches) {
      if (recommendations.length >= MAX_RECOMMENDATIONS) break;
      const content = match.replace(/^always\s+/i, '').trim();
      if (content.length > 10) {
        recommendations.push({
          type: 'guideline',
          reason: 'Detected "always" pattern in conversation',
          content: `Always ${content}`,
          action: `memory_guideline action:add name:"${this.slugify(content)}" content:"Always ${content.replace(/"/g, '\\"')}"`,
          confidence: 0.7,
        });
      }
    }

    const neverMatches = combinedText.match(/\bnever\s+([^.!?]+)/gi) || [];
    for (const match of neverMatches) {
      if (recommendations.length >= MAX_RECOMMENDATIONS) break;
      const content = match.replace(/^never\s+/i, '').trim();
      if (content.length > 10) {
        recommendations.push({
          type: 'guideline',
          reason: 'Detected "never" pattern in conversation',
          content: `Never ${content}`,
          action: `memory_guideline action:add name:"${this.slugify(content)}" content:"Never ${content.replace(/"/g, '\\"')}"`,
          confidence: 0.7,
        });
      }
    }

    if (complexitySignals.hasErrorRecovery && recommendations.length < MAX_RECOMMENDATIONS) {
      const fixMatch = lowerText.match(/(?:fixed|solved|resolved|working now)[^.!?]*/i);
      const summary = fixMatch ? fixMatch[0].slice(0, 100) : 'error recovery pattern detected';
      recommendations.push({
        type: 'experience',
        reason: 'Error recovery pattern detected - debug/fix workflow',
        content: summary,
        action: `memory_experience action:learn text:"Fixed issue: ${summary.replace(/"/g, '\\"')}"`,
        confidence: 0.75,
      });
    }

    if (complexitySignals.hasDecisions && recommendations.length < MAX_RECOMMENDATIONS) {
      const decisionMatch = combinedText.match(/(?:decided|chose|instead of|rather than)[^.!?]*/i);
      const summary = decisionMatch ? decisionMatch[0].slice(0, 100) : 'decision made';
      recommendations.push({
        type: 'knowledge',
        reason: 'Detected decision pattern in conversation',
        content: summary,
        action: `memory_knowledge action:add category:decision title:"Decision: ${this.truncate(summary, 50)}" content:"${summary.replace(/"/g, '\\"')}"`,
        confidence: 0.7,
      });
    }

    if (complexitySignals.hasLearning && recommendations.length < MAX_RECOMMENDATIONS) {
      const learnMatch = combinedText.match(/(?:realized|learned|discovered|found out)[^.!?]*/i);
      const summary = learnMatch ? learnMatch[0].slice(0, 100) : 'insight gained';
      recommendations.push({
        type: 'knowledge',
        reason: 'Detected learning/insight pattern - learned something new',
        content: summary,
        action: `memory_knowledge action:add category:fact title:"Learned: ${this.truncate(summary, 50)}" content:"${summary.replace(/"/g, '\\"')}"`,
        confidence: 0.65,
      });
    }

    return recommendations;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + '...';
  }
}
