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
  getCaptureStateManager,
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

const logger = createComponentLogger('capture');

// =============================================================================
// TYPES
// =============================================================================

export interface CaptureServiceDeps {
  experienceRepo: IExperienceRepository;
  knowledgeModuleDeps: KnowledgeModuleDeps;
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

  constructor(deps: CaptureServiceDeps, captureConfig?: CaptureServiceConfig) {
    this.experienceModule = createExperienceCaptureModule(deps.experienceRepo);
    this.knowledgeModule = createKnowledgeCaptureModule(deps.knowledgeModuleDeps);
    this.stateManager = getCaptureStateManager();
    this.captureConfig = captureConfig ?? this.buildDefaultConfig();
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

    const shouldCapture = this.stateManager.shouldTriggerTurnCapture(
      metrics,
      this.captureConfig,
      sessionState.captureCount
    );

    if (!shouldCapture) {
      return null;
    }

    logger.info(
      { sessionId, turnCount: metrics.turnCount, captureCount: sessionState.captureCount },
      'Triggering turn-based capture'
    );

    // Trigger knowledge capture
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
 */
export function getCaptureService(): CaptureService | null {
  return captureServiceInstance;
}

/**
 * Initialize the capture service with dependencies
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
export { getCaptureStateManager, resetCaptureStateManager } from './state.js';
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
