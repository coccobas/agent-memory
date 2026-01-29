/**
 * Unified Capture Service
 *
 * Coordinates experience and knowledge capture across the system:
 * - onTurnComplete() - Check thresholds, trigger knowledge capture
 * - onSessionEnd() - Extract experiences, skip duplicates
 * - recordCase() - Explicit case recording
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { ExperienceCaptureModule } from './experience.module.js';
import { createExperienceCaptureModule } from './experience.module.js';
import type { KnowledgeCaptureModule } from './knowledge.module.js';
import { createKnowledgeCaptureModule, type KnowledgeModuleDeps } from './knowledge.module.js';
import { CaptureStateManager } from './state.js';
import type {
  TurnData,
  TurnMetrics,
  CaptureResult,
  CaptureConfig,
  CaptureOptions,
  RecordCaseParams,
  ExperienceCaptureResult,
  KnowledgeCaptureResult,
  TrajectoryStep,
  CaptureSessionState,
  ExperienceCaptureConfig,
  LearnPrompt,
  RecordBehaviorObservationParams,
  ToolUseEvent,
  ComplexitySignals,
} from './types.js';
import { detectComplexitySignals } from '../../utils/transcript-analysis.js';
import type { IExperienceRepository } from '../../core/interfaces/repositories.js';
import type { RLService } from '../rl/index.js';
import { buildExtractionState } from '../rl/state/extraction.state.js';
import type { FeedbackService } from '../feedback/index.js';
import { createHash } from 'crypto';
import type { EpisodeService } from '../episode/index.js';
import { getExtractionTriggersService } from './triggers.js';
import type { ExtractionService } from '../extraction.service.js';

const logger = createComponentLogger('capture');

// =============================================================================
// TYPES
// =============================================================================

export interface CaptureServiceDeps {
  experienceRepo: IExperienceRepository;
  knowledgeModuleDeps: KnowledgeModuleDeps;
  getEntryCount?: (projectId?: string) => Promise<number>;
  rlService?: RLService | null;
  feedbackService?: FeedbackService | null;
  stateManager?: CaptureStateManager;
  episodeService?: EpisodeService | null;
  extractionService?: ExtractionService | null;
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
  private episodeService?: EpisodeService | null;

  constructor(deps: CaptureServiceDeps, captureConfig?: CaptureServiceConfig) {
    this.stateManager = deps.stateManager ?? new CaptureStateManager();
    this.experienceModule = createExperienceCaptureModule(deps.experienceRepo, this.stateManager);
    this.knowledgeModule = createKnowledgeCaptureModule({
      ...deps.knowledgeModuleDeps,
      stateManager: this.stateManager,
    });
    this.captureConfig = captureConfig ?? this.buildDefaultConfig();
    this.getEntryCountFn = deps.getEntryCount;
    this.rlService = deps.rlService;
    this.feedbackService = deps.feedbackService;
    this.episodeService = deps.episodeService;
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
        enabled: true,
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
      // Automatic experience capture configuration
      experienceCapture: {
        enabled: true,
        triggers: {
          sessionEnd: true,
          episodeComplete: true,
          turnBased: true,
          promptComplex: true,
          behaviorObservation: true,
        },
        thresholds: {
          turnConfidence: 0.8,
          turnCooldownMs: 60000,
          maxPerSession: 10,
          complexityToolCalls: 10,
          complexityDurationMs: 300000,
          minToolSequenceLength: 3,
          behaviorConfidence: 0.75,
        },
      },
      // Message enrichment (LLM-powered summarization)
      messageEnrichment: {
        summarization: {
          enabled: true,
          maxMessages: 50,
          maxContentChars: 2000,
          fallbackToTruncated: true,
        },
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
    const currentExpConfig = this.captureConfig.experienceCapture;
    const newExpConfig = config.experienceCapture;

    // Build merged experience config with all required fields
    const mergedExperienceCapture: ExperienceCaptureConfig | undefined =
      currentExpConfig || newExpConfig
        ? {
            enabled: newExpConfig?.enabled ?? currentExpConfig?.enabled ?? true,
            triggers: {
              sessionEnd:
                newExpConfig?.triggers?.sessionEnd ??
                currentExpConfig?.triggers?.sessionEnd ??
                true,
              episodeComplete:
                newExpConfig?.triggers?.episodeComplete ??
                currentExpConfig?.triggers?.episodeComplete ??
                true,
              turnBased:
                newExpConfig?.triggers?.turnBased ?? currentExpConfig?.triggers?.turnBased ?? true,
              promptComplex:
                newExpConfig?.triggers?.promptComplex ??
                currentExpConfig?.triggers?.promptComplex ??
                true,
              behaviorObservation:
                newExpConfig?.triggers?.behaviorObservation ??
                currentExpConfig?.triggers?.behaviorObservation ??
                true,
            },
            thresholds: {
              turnConfidence:
                newExpConfig?.thresholds?.turnConfidence ??
                currentExpConfig?.thresholds?.turnConfidence ??
                0.8,
              turnCooldownMs:
                newExpConfig?.thresholds?.turnCooldownMs ??
                currentExpConfig?.thresholds?.turnCooldownMs ??
                60000,
              maxPerSession:
                newExpConfig?.thresholds?.maxPerSession ??
                currentExpConfig?.thresholds?.maxPerSession ??
                10,
              complexityToolCalls:
                newExpConfig?.thresholds?.complexityToolCalls ??
                currentExpConfig?.thresholds?.complexityToolCalls ??
                10,
              complexityDurationMs:
                newExpConfig?.thresholds?.complexityDurationMs ??
                currentExpConfig?.thresholds?.complexityDurationMs ??
                300000,
              minToolSequenceLength:
                newExpConfig?.thresholds?.minToolSequenceLength ??
                currentExpConfig?.thresholds?.minToolSequenceLength ??
                3,
              behaviorConfidence:
                newExpConfig?.thresholds?.behaviorConfidence ??
                currentExpConfig?.thresholds?.behaviorConfidence ??
                0.75,
            },
          }
        : undefined;

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
      experienceCapture: mergedExperienceCapture,
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
    return createHash('sha256').update(content.slice(0, 1000)).digest('hex').slice(0, 16);
  }

  /**
   * Build synthetic TurnMetrics from messages when actual metrics are unavailable.
   * Used for LLM-based episode capture where we don't have full turn tracking.
   *
   * Returns all 9 TurnMetrics fields with synthetic/default values:
   * - turnCount: messages.length
   * - userTurnCount: count of role === 'user'
   * - assistantTurnCount: count of role === 'assistant'
   * - totalTokens: 0 (unknown)
   * - toolCallCount: 0 (not available)
   * - uniqueToolsUsed: empty Set
   * - errorCount: 0 (not available)
   * - startTime: Date.now()
   * - lastTurnTime: Date.now()
   */
  private buildSyntheticMetrics(messages: TurnData[]): TurnMetrics {
    const metrics: TurnMetrics = {
      turnCount: messages.length,
      userTurnCount: messages.filter((m) => m.role === 'user').length,
      assistantTurnCount: messages.filter((m) => m.role === 'assistant').length,
      totalTokens: 0,
      toolCallCount: 0,
      uniqueToolsUsed: new Set<string>(),
      errorCount: 0,
      startTime: Date.now(),
      lastTurnTime: Date.now(),
    };

    return metrics;
  }

  /**
   * Link captured experiences to an episode
   */
  private async linkExperiencesToEpisode(
    experienceIds: string[],
    episodeId: string
  ): Promise<void> {
    if (!this.episodeService || experienceIds.length === 0) {
      return;
    }

    for (const expId of experienceIds) {
      try {
        await this.episodeService.linkEntity(episodeId, 'experience', expId, 'created');
        logger.debug({ episodeId, experienceId: expId }, 'Linked experience to episode');
      } catch (error) {
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            episodeId,
            experienceId: expId,
          },
          'Failed to link experience to episode'
        );
      }
    }
  }

  /**
   * Get active episode for a session (if episode service is available)
   */
  private async getActiveEpisodeId(sessionId: string): Promise<string | undefined> {
    if (!this.episodeService) {
      return undefined;
    }

    try {
      const activeEpisode = await this.episodeService.getActiveEpisode(sessionId);
      return activeEpisode?.id;
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : String(error), sessionId },
        'Could not get active episode'
      );
      return undefined;
    }
  }

  // =============================================================================
  // TURN HANDLING
  // =============================================================================

  /**
   * Track last experience capture time per session for cooldown
   */
  private experienceCaptureTimes = new Map<string, number>();

  /**
   * Handle a completed turn - track metrics and trigger turn-based capture if needed
   *
   * Extended to also check for experience-specific triggers and capture experiences
   * when patterns like error recovery, problem solving, or lessons learned are detected.
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

    // Check for experience triggers (non-blocking)
    this.checkExperienceTriggers(sessionId, turn, sessionState, options).catch((error) => {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), sessionId },
        'Experience trigger check failed (non-fatal)'
      );
    });

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

  /**
   * Check for experience-specific triggers and capture experiences when detected.
   *
   * Triggers:
   * - Error Recovery: Error followed by success
   * - Problem Solved: "fixed", "solved", "working now"
   * - Workaround Found: "workaround", "alternative"
   * - Lesson Learned: "learned that", "note to self"
   *
   * Thresholds:
   * - Min confidence: 0.8 (configurable)
   * - Cooldown: 60s between experience captures (prevent spam)
   * - Max per session: 10 experiences
   */
  private async checkExperienceTriggers(
    sessionId: string,
    turn: TurnData,
    sessionState: CaptureSessionState,
    options?: Partial<CaptureOptions>
  ): Promise<ExperienceCaptureResult | null> {
    // Check configuration (use experienceCapture config if available)
    const experienceConfig = (
      this.captureConfig as CaptureConfig & { experienceCapture?: ExperienceCaptureConfig }
    ).experienceCapture;
    if (!experienceConfig?.enabled || !experienceConfig?.triggers?.turnBased) {
      return null;
    }

    const thresholds = experienceConfig.thresholds;

    // Check cooldown
    const lastCaptureTime = this.experienceCaptureTimes.get(sessionId) ?? 0;
    const cooldownMs = thresholds?.turnCooldownMs ?? 60000;
    if (Date.now() - lastCaptureTime < cooldownMs) {
      logger.debug({ sessionId, cooldownMs }, 'Experience capture on cooldown');
      return null;
    }

    // Check max captures per session
    const maxPerSession = thresholds?.maxPerSession ?? 10;
    // Count experience captures (tracked separately in experienceCaptureTimes)
    const experienceCaptureCount = this.experienceCaptureTimes.has(sessionId) ? 1 : 0;
    if (experienceCaptureCount >= maxPerSession) {
      logger.debug({ sessionId, maxPerSession }, 'Max experience captures reached for session');
      return null;
    }

    // Detect experience triggers
    const triggersService = getExtractionTriggersService();
    const content = turn.content ?? '';
    const triggerResult = triggersService.detectExperienceTriggers(content);

    // Check if triggers meet threshold
    const minConfidence = thresholds?.turnConfidence ?? 0.8;
    const highConfidenceTriggers = triggerResult.triggers.filter(
      (t) => t.confidence >= minConfidence
    );

    if (highConfidenceTriggers.length === 0 && !triggerResult.shouldExtract) {
      return null;
    }

    logger.info(
      {
        sessionId,
        triggerCount: triggerResult.triggers.length,
        highConfidence: highConfidenceTriggers.length,
        triggerTypes: [...new Set(triggerResult.triggers.map((t) => t.type))],
      },
      'Experience triggers detected'
    );

    // Build title based on trigger types
    const dominantTrigger = highConfidenceTriggers[0] ?? triggerResult.triggers[0];
    const titlePrefix = this.getTitlePrefixForTrigger(dominantTrigger?.type);

    // Extract context around the trigger
    const contextStart = Math.max(0, (dominantTrigger?.spanStart ?? 0) - 100);
    const contextEnd = Math.min(content.length, (dominantTrigger?.spanEnd ?? 100) + 200);
    const contextText = content.slice(contextStart, contextEnd).trim();

    // Record the experience
    const result = await this.recordCase({
      projectId: sessionState.projectId,
      sessionId,

      title: `${titlePrefix}${this.summarizeContext(contextText, 50)}`,
      scenario: 'Detected from conversation turn',
      outcome: dominantTrigger?.matchedText ?? 'Trigger detected',
      content: contextText,

      category: `turn-trigger-${dominantTrigger?.type ?? 'unknown'}`,
      confidence: dominantTrigger?.confidence ?? 0.8,
      source: 'observation',

      ...options,
    });

    // Record capture time for cooldown
    if (result.experiences.length > 0) {
      this.experienceCaptureTimes.set(sessionId, Date.now());
      logger.info(
        {
          sessionId,
          experienceId: result.experiences[0]?.experience?.id,
          triggerType: dominantTrigger?.type,
        },
        'Turn-based experience captured'
      );
    }

    return result;
  }

  /**
   * Get title prefix based on trigger type
   */
  private getTitlePrefixForTrigger(triggerType: string | undefined): string {
    switch (triggerType) {
      case 'error_recovery':
        return 'Fixed: ';
      case 'problem_solved':
        return 'Solved: ';
      case 'workaround_found':
        return 'Workaround: ';
      case 'lesson_learned':
        return 'Learned: ';
      case 'recovery':
        return 'Recovered: ';
      default:
        return 'Experience: ';
    }
  }

  /**
   * Summarize context text for title
   */
  private summarizeContext(text: string, maxLength: number): string {
    // Remove newlines and extra spaces
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    return cleaned.slice(0, maxLength - 3) + '...';
  }

  // =============================================================================
  // COMPLEX TASK DETECTION
  // =============================================================================

  /**
   * Check if current session has completed a complex task worth capturing.
   *
   * Complexity signals:
   * - 10+ tool calls in sequence
   * - 5+ minutes elapsed on task
   * - Error → retry → success pattern
   * - Multiple file edits
   *
   * @param sessionId - The session to check
   * @returns LearnPrompt if complex task detected, null otherwise
   */
  detectComplexTask(sessionId: string): LearnPrompt | null {
    const sessionState = this.stateManager.getSession(sessionId);
    if (!sessionState) {
      return null;
    }

    // Check configuration
    const experienceConfig = (
      this.captureConfig as CaptureConfig & { experienceCapture?: ExperienceCaptureConfig }
    ).experienceCapture;
    if (!experienceConfig?.enabled || !experienceConfig?.triggers?.promptComplex) {
      return null;
    }

    const thresholds = experienceConfig.thresholds;
    const metrics = sessionState.metrics;
    const signals: string[] = [];
    let complexity = 0;

    // Signal 1: High tool call count
    const toolCallThreshold = thresholds?.complexityToolCalls ?? 10;
    if (metrics.toolCallCount >= toolCallThreshold) {
      signals.push(`${metrics.toolCallCount} tool calls`);
      complexity += 30;
    }

    // Signal 2: Long duration
    const durationThreshold = thresholds?.complexityDurationMs ?? 300000; // 5 minutes
    const duration = metrics.lastTurnTime - metrics.startTime;
    if (duration >= durationThreshold) {
      signals.push(`${Math.round(duration / 60000)} minutes elapsed`);
      complexity += 25;
    }

    // Signal 3: Error → retry → success pattern
    const hasErrorRecovery = this.detectErrorRecoveryPattern(sessionState.transcript);
    if (hasErrorRecovery) {
      signals.push('error recovery pattern');
      complexity += 35;
    }

    // Signal 4: Multiple file edits
    const fileEdits = this.countFileEdits(sessionState.transcript);
    if (fileEdits >= 3) {
      signals.push(`${fileEdits} file edits`);
      complexity += 20;
    }

    // Need at least 50 complexity to suggest
    if (complexity < 50 || signals.length === 0) {
      return null;
    }

    // Generate suggestion based on context
    const suggestion = this.generateLearnSuggestion(sessionState.transcript, signals);
    const confidence = Math.min(1, complexity / 100);

    logger.debug(
      {
        sessionId,
        complexity,
        signals,
        suggestion: suggestion.slice(0, 50),
      },
      'Complex task detected'
    );

    return {
      suggestion,
      confidence,
      action: `memory_experience action:learn text:"${suggestion.replace(/"/g, '\\"')}"`,
      signals,
    };
  }

  /**
   * Detect error → retry → success pattern in transcript
   */
  private detectErrorRecoveryPattern(transcript: TurnData[]): boolean {
    let sawError = false;

    for (const turn of transcript) {
      const content = turn.content?.toLowerCase() ?? '';

      // Check for error indicators
      if (
        content.includes('error') ||
        content.includes('failed') ||
        content.includes('exception') ||
        content.includes("doesn't work") ||
        content.includes('not working')
      ) {
        sawError = true;
      }

      // Check for success after error
      if (sawError) {
        if (
          content.includes('fixed') ||
          content.includes('solved') ||
          content.includes('working now') ||
          content.includes('success') ||
          content.includes('it works')
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Count file edits in transcript (based on tool calls)
   */
  private countFileEdits(transcript: TurnData[]): number {
    const editedFiles = new Set<string>();

    for (const turn of transcript) {
      if (!turn.toolCalls) continue;

      for (const toolCall of turn.toolCalls) {
        // Look for edit/write tool calls
        if (toolCall.name === 'Edit' || toolCall.name === 'Write') {
          const filePath = toolCall.input?.file_path;
          if (typeof filePath === 'string') {
            editedFiles.add(filePath);
          }
        }
      }
    }

    return editedFiles.size;
  }

  /**
   * Generate a learn suggestion based on transcript context
   */
  private generateLearnSuggestion(transcript: TurnData[], signals: string[]): string {
    // Find the most recent meaningful content
    const recentAssistantTurns = transcript
      .filter((t) => t.role === 'assistant' && t.content)
      .slice(-3);

    // Look for action verbs to understand what was done
    const actionPatterns = [
      /fixed\s+(.{10,50})/i,
      /solved\s+(.{10,50})/i,
      /implemented\s+(.{10,50})/i,
      /added\s+(.{10,50})/i,
      /created\s+(.{10,50})/i,
      /updated\s+(.{10,50})/i,
      /refactored\s+(.{10,50})/i,
      /configured\s+(.{10,50})/i,
    ];

    for (const turn of recentAssistantTurns.reverse()) {
      for (const pattern of actionPatterns) {
        const match = turn.content?.match(pattern);
        if (match) {
          const action = match[0].replace(/\s+/g, ' ').trim();
          return action.charAt(0).toUpperCase() + action.slice(1);
        }
      }
    }

    // Fallback: use signals to describe
    if (signals.includes('error recovery pattern')) {
      return 'Fixed an error by debugging and applying a solution';
    }

    // Generic fallback
    return `Completed complex task with ${signals.join(', ')}`;
  }

  // =============================================================================
  // SESSION END HANDLING
  // =============================================================================

  /**
   * Handle session end - extract experiences and knowledge
   */
  async onSessionEnd(sessionId: string, options?: Partial<CaptureOptions>): Promise<CaptureResult> {
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
    const complexitySignals = detectComplexitySignals(sessionState.transcript);
    result.complexitySignals = complexitySignals;

    // Check if session meets minimum thresholds
    const shouldCaptureSession = this.stateManager.shouldTriggerSessionEndCapture(
      metrics,
      this.captureConfig
    );

    if (!shouldCaptureSession) {
      logger.debug(
        {
          sessionId,
          turnCount: metrics.turnCount,
          tokenCount: metrics.totalTokens,
          complexityScore: complexitySignals.score,
        },
        'Session does not meet capture thresholds'
      );
      this.stateManager.clearSession(sessionId);
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

    // Auto-link experiences to active episode if available
    const episodeId = captureOptions.episodeId ?? (await this.getActiveEpisodeId(sessionId));
    if (episodeId && experienceResult.experiences.length > 0) {
      const experienceIds = experienceResult.experiences
        .map((e) => e.experience?.id)
        .filter((id): id is string => !!id); // Filter out undefined/empty IDs
      await this.linkExperiencesToEpisode(experienceIds, episodeId);
      logger.info({ episodeId, count: experienceIds.length }, 'Auto-linked experiences to episode');
    }

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
  // EPISODE COMPLETION HANDLING
  // =============================================================================

  async onEpisodeComplete(episode: {
    id: string;
    name: string;
    description?: string | null;
    outcome?: string | null;
    outcomeType?: string | null;
    durationMs?: number | null;
    scopeType?: string;
    scopeId?: string | null;
    sessionId?: string | null;
    events?: Array<{
      eventType: string;
      name: string;
      description?: string | null;
      data?: string | null;
      occurredAt: string;
    }>;
    messages?: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
    }>;
  }): Promise<ExperienceCaptureResult> {
    if (!this.captureConfig.enabled) {
      return {
        experiences: [],
        skippedDuplicates: 0,
        processingTimeMs: 0,
      };
    }

    const startTime = Date.now();

    // Build trajectory from episode events
    const trajectory: TrajectoryStep[] = (episode.events ?? []).map((event) => {
      let parsedData: Record<string, unknown> | undefined;
      if (event.data) {
        try {
          parsedData = JSON.parse(event.data) as Record<string, unknown>;
        } catch {
          // Ignore parse errors
        }
      }

      return {
        action: event.name,
        observation: event.description ?? undefined,
        reasoning: parsedData?.reasoning as string | undefined,
        toolUsed: parsedData?.toolUsed as string | undefined,
        success: event.eventType !== 'error',
        timestamp: event.occurredAt,
      };
    });

    const scopeType = (episode.scopeType ?? 'project') as 'global' | 'org' | 'project' | 'session';
    const captureOptions: CaptureOptions = {
      scopeType,
      scopeId: episode.scopeId ?? undefined,
      projectId: scopeType === 'project' ? (episode.scopeId ?? undefined) : undefined,
      sessionId: episode.sessionId ?? undefined,
      agentId: undefined,
      autoStore: true,
      confidenceThreshold: 0.7,
      skipDuplicates: true,
      episodeId: episode.id,
      focusAreas: ['experiences', 'decisions'],
    };

    let result: ExperienceCaptureResult = {
      experiences: [],
      skippedDuplicates: 0,
      processingTimeMs: 0,
    };

    if (episode.messages && episode.messages.length >= 2) {
      const turnData = this.convertMessagesToTurnData(episode.messages);
      const metrics = this.buildSyntheticMetrics(turnData);

      try {
        result = await this.experienceModule.capture(turnData, metrics, captureOptions);

        if (result.experiences.length === 0) {
          logger.info(
            { episodeId: episode.id },
            'LLM extraction returned 0 experiences, falling back to recordCase'
          );
          return await this.recordCase({
            projectId: captureOptions.projectId,
            sessionId: captureOptions.sessionId,
            episodeId: episode.id,
            title: episode.name,
            scenario: episode.description ?? 'Completed episode task',
            outcome: episode.outcome ?? 'Completed successfully',
            content: trajectory.map((t) => `${t.action}: ${t.observation ?? ''}`).join('\n'),
            trajectory,
            category: 'episode-completion',
            confidence: episode.outcomeType === 'success' ? 0.85 : 0.7,
            source: 'observation',
          });
        }

        if (result.experiences.length > 0) {
          const experienceIds = result.experiences
            .map((e) => e.experience?.id)
            .filter((id): id is string => !!id);
          await this.linkExperiencesToEpisode(experienceIds, episode.id);
        }
      } catch (error) {
        logger.warn(
          { episodeId: episode.id, error: error instanceof Error ? error.message : String(error) },
          'LLM extraction failed, falling back to recordCase'
        );
        return await this.recordCase({
          projectId: captureOptions.projectId,
          sessionId: captureOptions.sessionId,
          episodeId: episode.id,
          title: episode.name,
          scenario: episode.description ?? 'Completed episode task',
          outcome: episode.outcome ?? 'Completed successfully',
          content: trajectory.map((t) => `${t.action}: ${t.observation ?? ''}`).join('\n'),
          trajectory,
          category: 'episode-completion',
          confidence: episode.outcomeType === 'success' ? 0.85 : 0.7,
          source: 'observation',
        });
      }
    } else if (episode.messages && episode.messages.length < 2) {
      logger.info(
        { episodeId: episode.id, messageCount: episode.messages.length },
        'Insufficient messages for LLM extraction, falling back to recordCase'
      );
      return await this.recordCase({
        projectId: captureOptions.projectId,
        sessionId: captureOptions.sessionId,
        episodeId: episode.id,
        title: episode.name,
        scenario: episode.description ?? 'Completed episode task',
        outcome: episode.outcome ?? 'Completed successfully',
        content: trajectory.map((t) => `${t.action}: ${t.observation ?? ''}`).join('\n'),
        trajectory,
        category: 'episode-completion',
        confidence: episode.outcomeType === 'success' ? 0.85 : 0.7,
        source: 'observation',
      });
    }

    logger.info(
      {
        episodeId: episode.id,
        episodeName: episode.name,
        outcomeType: episode.outcomeType,
        experiencesCaptured: result.experiences.length,
        trajectorySteps: trajectory.length,
        processingTimeMs: Date.now() - startTime,
      },
      'Episode completion experience captured'
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

    const result = await this.experienceModule.recordCase(params);

    // Auto-link to episode if available
    const episodeId =
      params.episodeId ??
      (params.sessionId ? await this.getActiveEpisodeId(params.sessionId) : undefined);
    if (episodeId && result.experiences.length > 0) {
      const experienceIds = result.experiences
        .map((e) => e.experience?.id)
        .filter((id): id is string => !!id);
      await this.linkExperiencesToEpisode(experienceIds, episodeId);
      logger.debug(
        { episodeId, count: experienceIds.length },
        'Auto-linked recorded case to episode'
      );
    }

    return result;
  }

  // =============================================================================
  // BEHAVIOR OBSERVATION (Trigger 5)
  // =============================================================================

  /**
   * Record a behavior observation as an experience.
   *
   * Converts detected behavior patterns from tool sequences into structured
   * experience entries with trajectories.
   *
   * @param params - The behavior observation parameters
   * @returns Captured experience result
   */
  async recordBehaviorObservation(
    params: RecordBehaviorObservationParams
  ): Promise<ExperienceCaptureResult> {
    if (!this.captureConfig.enabled) {
      return {
        experiences: [],
        skippedDuplicates: 0,
        processingTimeMs: 0,
      };
    }

    // Check if behavior observation trigger is enabled
    const experienceConfig = this.captureConfig.experienceCapture;
    if (!experienceConfig?.enabled || !experienceConfig?.triggers?.behaviorObservation) {
      logger.debug({ sessionId: params.sessionId }, 'Behavior observation trigger is disabled');
      return {
        experiences: [],
        skippedDuplicates: 0,
        processingTimeMs: 0,
      };
    }

    const startTime = Date.now();
    const { sessionId, projectId, agentId, pattern, events, episodeId } = params;

    // Build trajectory from tool events that form this pattern
    const patternEvents: ToolUseEvent[] = [];
    for (const idx of pattern.eventIndices) {
      const event = events[idx];
      if (event) {
        patternEvents.push(event);
      }
    }

    const trajectory: TrajectoryStep[] = patternEvents.map((event) => ({
      action: `${event.toolName}: ${this.summarizeToolInput(event.toolInput)}`,
      observation: event.outputSummary,
      toolUsed: event.toolName,
      success: event.success,
      timestamp: event.timestamp,
      durationMs: event.durationMs,
    }));

    // Record as a case experience with the pattern details
    const result = await this.recordCase({
      projectId,
      sessionId,
      agentId,
      episodeId,

      title: pattern.title,
      scenario: pattern.scenario,
      outcome: pattern.outcome,
      content: this.buildBehaviorPatternContent(pattern, patternEvents),

      trajectory,
      category: `behavior-${pattern.type}`,
      confidence: pattern.confidence,
      source: 'observation',
    });

    logger.info(
      {
        sessionId,
        patternType: pattern.type,
        patternTitle: pattern.title,
        confidence: pattern.confidence,
        trajectorySteps: trajectory.length,
        experiencesCaptured: result.experiences.length,
        processingTimeMs: Date.now() - startTime,
      },
      'Behavior observation recorded as experience'
    );

    return result;
  }

  /**
   * Summarize tool input for trajectory display
   */
  private summarizeToolInput(input: Record<string, unknown>): string {
    // Handle common tool input patterns
    if (input.command) {
      const cmd = String(input.command);
      return cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
    }
    if (input.file_path) {
      return String(input.file_path).split('/').pop() ?? String(input.file_path);
    }
    if (input.pattern) {
      return `pattern: ${String(input.pattern)}`;
    }

    // Fallback: stringify first key-value pair
    const keys = Object.keys(input);
    if (keys.length === 0) return '(no input)';
    const firstKey = keys[0] ?? '';
    if (!firstKey) return '(no input)';
    const value = input[firstKey];
    const firstValue = String(value).slice(0, 40);
    return `${firstKey}: ${firstValue}${String(value).length > 40 ? '...' : ''}`;
  }

  /**
   * Build content string from behavior pattern and events
   */
  private buildBehaviorPatternContent(
    pattern: RecordBehaviorObservationParams['pattern'],
    events: ToolUseEvent[]
  ): string {
    const lines: string[] = [
      `Pattern: ${pattern.type}`,
      `Confidence: ${(pattern.confidence * 100).toFixed(0)}%`,
      '',
      `Scenario: ${pattern.scenario}`,
      `Outcome: ${pattern.outcome}`,
      '',
    ];

    if (pattern.applicability) {
      lines.push(`When to apply: ${pattern.applicability}`);
    }
    if (pattern.contraindications) {
      lines.push(`When NOT to apply: ${pattern.contraindications}`);
    }

    if (events.length > 0) {
      lines.push('', 'Tool sequence:');
      for (const event of events) {
        lines.push(`- ${event.toolName}: ${this.summarizeToolInput(event.toolInput)}`);
      }
    }

    return lines.join('\n');
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

  getTranscriptComplexity(sessionId: string): ComplexitySignals {
    const sessionState = this.stateManager.getSession(sessionId);
    if (!sessionState || sessionState.transcript.length === 0) {
      return {
        score: 0,
        signals: [],
        hasErrorRecovery: false,
        hasDecisions: false,
        hasLearning: false,
      };
    }

    return detectComplexitySignals(sessionState.transcript);
  }

  /**
   * Convert messages to TurnData format
   *
   * Transforms message objects with { id, role, content, createdAt } structure
   * into TurnData objects with { role, content, timestamp } structure.
   *
   * @param messages - Array of messages with id, role, content, createdAt
   * @returns Array of TurnData objects
   */
  private convertMessagesToTurnData(
    messages: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
    }>
  ): TurnData[] {
    return messages.map((message) => ({
      role: message.role as 'user' | 'assistant' | 'system',
      content: message.content,
      timestamp: message.createdAt,
    }));
  }
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
  ExtractionWindow,
  CaptureSessionState,
  ExperienceCaptureConfig,
  LearnPrompt,
  ComplexitySignals,
  // Behavior observation types (Trigger 5)
  ToolUseEvent,
  BehaviorPatternType,
  DetectedBehaviorPattern,
  BehaviorAnalysisResult,
  RecordBehaviorObservationParams,
  BehaviorObservationConfig,
} from './types.js';
export { ExperienceCaptureModule, createExperienceCaptureModule } from './experience.module.js';
export {
  KnowledgeCaptureModule,
  createKnowledgeCaptureModule,
  type KnowledgeModuleDeps,
} from './knowledge.module.js';

// Behavior observer service (Trigger 5)
export {
  BehaviorObserverService,
  getBehaviorObserverService,
  resetBehaviorObserverService,
} from './behavior-observer.js';
