/**
 * Unified Capture Service
 *
 * Coordinates experience and knowledge capture across the system:
 * - onTurnComplete() - Check thresholds, trigger knowledge capture
 * - onSessionEnd() - Extract experiences, skip duplicates
 * - recordCase() - Explicit case recording
 */

import { createComponentLogger } from '../../utils/logger.js';
import {
  ExperienceCaptureModule,
  createExperienceCaptureModule,
} from './experience.module.js';
import {
  KnowledgeCaptureModule,
  createKnowledgeCaptureModule,
  type KnowledgeModuleDeps,
} from './knowledge.module.js';
import {
  CaptureStateManager,
} from './state.js';
import type {
  TurnData,
  TurnMetrics,
  CaptureResult,
  CaptureConfig,
  CaptureOptions,
  RecordCaseParams,
  ExperienceCaptureResult,
  KnowledgeCaptureResult,
} from './types.js';
import type { IExperienceRepository } from '../../core/interfaces/repositories.js';
import type { RLService } from '../rl/index.js';
import { buildExtractionState } from '../rl/state/extraction.state.js';
import type { FeedbackService } from '../feedback/index.js';
import { createHash } from 'crypto';

const logger = createComponentLogger('capture');

// =============================================================================
// TYPES
// =============================================================================

export interface CaptureServiceDeps {
  experienceRepo: IExperienceRepository;
  knowledgeModuleDeps: KnowledgeModuleDeps;
  /** Optional: for getting entry counts when RL is enabled */
  getEntryCount?: (projectId?: string) => Promise<number>;
  /** Optional: RL service for extraction policy decisions */
  rlService?: RLService | null;
  /** Optional: feedback service for recording decisions */
  feedbackService?: FeedbackService | null;
  /** Optional: capture state manager (defaults to new instance if not provided) */
  stateManager?: CaptureStateManager;
}

export interface CaptureServiceConfig extends CaptureConfig {}

// =============================================================================
// CAPTURE SERVICE
// =============================================================================

export class CaptureService {
  private experienceModule: ExperienceCaptureModule;
  private knowledgeModule: KnowledgeCaptureModule;
  private stateManager: CaptureStateManager;
  private captureConfig: CaptureConfig;
  private getEntryCountFn?: (projectId?: string) => Promise<number>;
  private rlService?: RLService | null;
  private feedbackService?: FeedbackService | null;

  constructor(deps: CaptureServiceDeps, captureConfig?: CaptureServiceConfig) {
    this.stateManager = deps.stateManager ?? new CaptureStateManager();
    // Pass stateManager to module factories for DI
    this.experienceModule = createExperienceCaptureModule(deps.experienceRepo, this.stateManager);
    this.knowledgeModule = createKnowledgeCaptureModule({
      ...deps.knowledgeModuleDeps,
      stateManager: this.stateManager,
    });
    this.captureConfig = captureConfig ?? this.buildDefaultConfig();
    this.getEntryCountFn = deps.getEntryCount;
    this.rlService = deps.rlService;
    this.feedbackService = deps.feedbackService;
  }

  /**
   * Build default capture configuration from environment
   */
  private buildDefaultConfig(): CaptureConfig {
    // Use config values if available, otherwise use defaults
    return {
      enabled: true,
      sessionEnd: {
        enabled: true,
        minTurns: 3,
        minTokens: 500,
        extractExperiences: true,
        extractKnowledge: true,
      },
      turnBased: {
        enabled: false,
        triggerAfterTurns: 10,
        triggerAfterTokens: 5000,
        triggerOnToolError: true,
        maxCapturesPerSession: 5,
      },
      deduplication: {
        enabled: true,
        similarityThreshold: 0.9,
        hashAlgorithm: 'sha256',
      },
      confidence: {
        experience: 0.7,
        knowledge: 0.7,
        guideline: 0.75,
        tool: 0.65,
      },
    };
  }

  /**
   * Get current capture configuration
   */
  getConfig(): CaptureConfig {
    return this.captureConfig;
  }

  /**
   * Update capture configuration
   */
  updateConfig(config: Partial<CaptureConfig>): void {
    this.captureConfig = {
      ...this.captureConfig,
      ...config,
      sessionEnd: {
        ...this.captureConfig.sessionEnd,
        ...config.sessionEnd,
      },
      turnBased: {
        ...this.captureConfig.turnBased,
        ...config.turnBased,
      },
      deduplication: {
        ...this.captureConfig.deduplication,
        ...config.deduplication,
      },
      confidence: {
        ...this.captureConfig.confidence,
        ...config.confidence,
      },
    };
  }

  /**
   * Get total entry count for a project (for RL state building)
   */
  private async getEntryCount(projectId?: string): Promise<number> {
    if (this.getEntryCountFn) {
      return this.getEntryCountFn(projectId);
    }
    // Default fallback - return 0 if no count function provided
    return 0;
  }

  /**
   * Simple content hash for deduplication and decision tracking
   */
  private hashContent(content: string): string {
    return createHash('sha256')
      .update(content.slice(0, 1000))
      .digest('hex')
      .slice(0, 16);
  }

  // =============================================================================
  // TURN HANDLING
  // =============================================================================

  /**
   * Handle a completed turn - track metrics and trigger turn-based capture if needed
   */
  async onTurnComplete(
    sessionId: string,
    turn: TurnData,
    options?: Partial<CaptureOptions>
  ): Promise<KnowledgeCaptureResult | null> {
    if (!this.captureConfig.enabled) {
      return null;
    }

    // Update session state with new turn
    const metrics = this.stateManager.addTurn(sessionId, turn);

    // Check if turn-based capture should be triggered
    const sessionState = this.stateManager.getSession(sessionId);
    if (!sessionState) {
      return null;
    }

    // Try RL policy first if enabled
    const rlService = this.rlService;
    const feedbackService = this.feedbackService;

    if (rlService?.isEnabled() && rlService.getExtractionPolicy().isEnabled()) {
      try {
        // Build extraction state from current context
        const state = buildExtractionState({
          turns: sessionState.transcript,
          metrics,
          memoryContext: {
            totalEntries: await this.getEntryCount(sessionState.projectId),
            recentExtractions: sessionState.captureCount,
            sessionCaptureCount: sessionState.captureCount,
          },
          // Could add similarity check here if we want to query for similar content
        });

        // Get policy decision
        const decision = await rlService.getExtractionPolicy().decideWithFallback(state);

        logger.debug(
          {
            sessionId,
            decision: decision.action.decision,
            confidence: decision.confidence,
            entryType: decision.action.entryType,
          },
          'RL extraction policy decision'
        );

        // Record the decision for training (fire-and-forget)
        if (feedbackService) {
          const turnContent = turn.content ?? '';
          // Only record if entryType is trackable (excludes 'project')
          const entryType = decision.action.entryType;
          if (entryType && entryType !== 'project') {
            feedbackService
              .recordExtractionDecision({
                sessionId,
                turnNumber: metrics.turnCount,
                decision: decision.action.decision,
                entryType,
                confidence: decision.confidence,
                contextHash: this.hashContent(turnContent),
              })
              .catch((error) => {
                logger.warn(
                  { error: error instanceof Error ? error.message : String(error) },
                  'Failed to record extraction decision'
                );
              });
          }
        }

        // Act on decision
        if (decision.action.decision === 'skip') {
          logger.debug({ sessionId }, 'RL policy decided to skip extraction');
          return null;
        }

        if (decision.action.decision === 'defer') {
          logger.debug({ sessionId }, 'RL policy decided to defer extraction');
          return null;
        }

        // 'store' - proceed with extraction
        logger.info(
          {
            sessionId,
            turnCount: metrics.turnCount,
            captureCount: sessionState.captureCount,
            rlDecision: true,
          },
          'Triggering RL-based capture'
        );
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'RL policy decision failed, falling back to threshold-based'
        );
        // Fall through to threshold-based logic
      }
    } else {
      // Fallback to threshold-based logic if RL not enabled
      const shouldCapture = this.stateManager.shouldTriggerTurnCapture(
        metrics,
        this.captureConfig,
        sessionState.captureCount
      );

      if (!shouldCapture) {
        return null;
      }

      logger.info(
        {
          sessionId,
          turnCount: metrics.turnCount,
          captureCount: sessionState.captureCount,
          thresholdBased: true,
        },
        'Triggering threshold-based capture'
      );
    }

    // Execute the extraction
    const captureOptions: CaptureOptions = {
      sessionId,
      scopeType: 'session',
      scopeId: sessionId,
      autoStore: true,
      skipDuplicates: true,
      ...options,
    };

    const result = await this.knowledgeModule.capture(
      sessionState.transcript,
      metrics,
      captureOptions
    );

    // Record the capture
    this.stateManager.recordCapture(sessionId);

    return result;
  }

  // =============================================================================
  // SESSION END HANDLING
  // =============================================================================

  /**
   * Handle session end - extract experiences and knowledge
   */
  async onSessionEnd(
    sessionId: string,
    options?: Partial<CaptureOptions>
  ): Promise<CaptureResult> {
    const startTime = Date.now();
    const result: CaptureResult = {
      experiences: {
        experiences: [],
        skippedDuplicates: 0,
        processingTimeMs: 0,
      },
      knowledge: {
        knowledge: [],
        guidelines: [],
        tools: [],
        skippedDuplicates: 0,
        processingTimeMs: 0,
      },
      totalProcessingTimeMs: 0,
    };

    if (!this.captureConfig.enabled) {
      return result;
    }

    const sessionState = this.stateManager.getSession(sessionId);
    if (!sessionState) {
      logger.debug({ sessionId }, 'No session state found for capture');
      return result;
    }

    const metrics = sessionState.metrics;

    // Check if session meets minimum thresholds
    const shouldCaptureSession = this.stateManager.shouldTriggerSessionEndCapture(
      metrics,
      this.captureConfig
    );

    if (!shouldCaptureSession) {
      logger.debug(
        { sessionId, turnCount: metrics.turnCount, tokenCount: metrics.totalTokens },
        'Session does not meet capture thresholds'
      );
      return result;
    }

    const captureOptions: CaptureOptions = {
      sessionId,
      projectId: sessionState.projectId,
      scopeType: sessionState.projectId ? 'project' : 'session',
      scopeId: sessionState.projectId ?? sessionId,
      autoStore: true,
      skipDuplicates: true,
      ...options,
    };

    logger.info(
      { sessionId, turnCount: metrics.turnCount, toolCalls: metrics.toolCallCount },
      'Capturing session experiences'
    );

    // Run experience and knowledge capture in parallel
    const [experienceResult, knowledgeResult] = await Promise.all([
      this.captureConfig.sessionEnd.extractExperiences
        ? this.experienceModule.capture(sessionState.transcript, metrics, captureOptions)
        : Promise.resolve({
            experiences: [],
            skippedDuplicates: 0,
            processingTimeMs: 0,
          } as ExperienceCaptureResult),
      this.captureConfig.sessionEnd.extractKnowledge
        ? this.knowledgeModule.capture(sessionState.transcript, metrics, captureOptions)
        : Promise.resolve({
            knowledge: [],
            guidelines: [],
            tools: [],
            skippedDuplicates: 0,
            processingTimeMs: 0,
          } as KnowledgeCaptureResult),
    ]);

    result.experiences = experienceResult;
    result.knowledge = knowledgeResult;
    result.totalProcessingTimeMs = Date.now() - startTime;

    // Clean up session state
    this.stateManager.clearSession(sessionId);

    logger.info(
      {
        sessionId,
        experiencesExtracted: result.experiences.experiences.length,
        knowledgeExtracted: result.knowledge.knowledge.length,
        guidelinesExtracted: result.knowledge.guidelines.length,
        toolsExtracted: result.knowledge.tools.length,
        processingTimeMs: result.totalProcessingTimeMs,
      },
      'Session capture completed'
    );

    return result;
  }

  // =============================================================================
  // EXPLICIT RECORDING
  // =============================================================================

  /**
   * Record an explicit case experience
   */
  async recordCase(params: RecordCaseParams): Promise<ExperienceCaptureResult> {
    if (!this.captureConfig.enabled) {
      return {
        experiences: [],
        skippedDuplicates: 0,
        processingTimeMs: 0,
      };
    }

    return this.experienceModule.recordCase(params);
  }

  // =============================================================================
  // SESSION MANAGEMENT
  // =============================================================================

  /**
   * Initialize a capture session
   */
  initSession(sessionId: string, projectId?: string): void {
    this.stateManager.getOrCreateSession(sessionId, projectId);
    logger.debug({ sessionId, projectId }, 'Capture session initialized');
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(sessionId: string): TurnMetrics | undefined {
    const session = this.stateManager.getSession(sessionId);
    return session?.metrics;
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): string[] {
    return this.stateManager.getActiveSessions();
  }

  /**
   * Clear old hashes (for memory management)
   */
  clearOldHashes(maxAgeMs?: number): number {
    return this.stateManager.clearOldHashes(maxAgeMs);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let captureServiceInstance: CaptureService | null = null;

/**
 * Get the singleton capture service instance
 * Note: Must be initialized with deps before first use
 * @deprecated Use context.services.capture instead via dependency injection
 */
export function getCaptureService(): CaptureService | null {
  return captureServiceInstance;
}

/**
 * Initialize the capture service with dependencies
 * @deprecated Use context.services.capture instead via dependency injection
 */
export function initCaptureService(
  deps: CaptureServiceDeps,
  config?: CaptureServiceConfig
): CaptureService {
  captureServiceInstance = new CaptureService(deps, config);
  return captureServiceInstance;
}

/**
 * Reset the capture service (for testing)
 */
export function resetCaptureService(): void {
  captureServiceInstance = null;
}

// Re-export types and utilities
export { CaptureStateManager, getCaptureStateManager, resetCaptureStateManager } from './state.js';
export type {
  TurnData,
  TurnMetrics,
  CaptureResult,
  CaptureConfig,
  CaptureOptions,
  RecordCaseParams,
  ExperienceCaptureResult,
  KnowledgeCaptureResult,
  TrajectoryStep,
} from './types.js';
export { ExperienceCaptureModule, createExperienceCaptureModule } from './experience.module.js';
export { KnowledgeCaptureModule, createKnowledgeCaptureModule, type KnowledgeModuleDeps } from './knowledge.module.js';
