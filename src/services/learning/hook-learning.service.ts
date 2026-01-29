/**
 * Hook Learning Service
 *
 * Integrates Claude Code hooks with the Librarian for experiential learning.
 * Captures experiences from tool failures, subagent completions, and error patterns.
 *
 * Flow:
 * 1. Hooks fire → HookLearningService captures behavior
 * 2. Creates experiences via ExperienceRepository
 * 3. Tracks patterns (error accumulation, repeated failures)
 * 4. Triggers Librarian analysis when thresholds are met
 */

import { createComponentLogger } from '../../utils/logger.js';
import type {
  IExperienceRepository,
  IKnowledgeRepository,
  IGuidelineRepository,
  IToolRepository,
} from '../../core/interfaces/repositories.js';
import type { ITaskRepository } from '../../db/repositories/tasks.js';
import type { ErrorLogRepository } from '../../db/repositories/error-log.js';
import type { ToolOutcomesRepository } from '../../db/repositories/tool-outcomes.js';
import type { LibrarianService } from '../librarian/index.js';
import type { ScopeType, TaskType } from '../../db/schema.js';
import { getExtractionTriggersService } from '../capture/triggers.js';
import type { DetectedTrigger, TriggerType } from '../capture/triggers.js';
import { getErrorAnalyzerService } from './error-analyzer.service.js';
import type { ErrorPattern } from './error-analyzer.service.js';
import { getOutcomeAnalyzerService } from './outcome-analyzer.service.js';
import {
  redactSensitive,
  summarizeInput,
  summarizeOutput,
  hashInput,
} from '../../commands/hook/outcome-utils.js';

const logger = createComponentLogger('hook-learning');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Tool failure event from PostToolUse hook
 */
export interface ToolFailureEvent {
  sessionId: string;
  projectId?: string;
  toolName: string;
  toolInput?: unknown;
  errorType?: string;
  errorMessage?: string;
  durationMs?: number;
  timestamp?: string;
}

/**
 * Subagent completion event from SubagentStop hook
 */
export interface SubagentCompletionEvent {
  sessionId: string;
  projectId?: string;
  subagentId: string;
  subagentType: string;
  parentSessionId?: string;
  success: boolean;
  resultSummary?: string;
  resultSize?: number;
  durationMs?: number;
  timestamp?: string;
}

/**
 * Error pattern event from accumulated Notification events
 */
export interface ErrorPatternEvent {
  sessionId: string;
  projectId?: string;
  errorType: string;
  errorCount: number;
  sampleMessages: string[];
  timeWindowMs: number;
  timestamp?: string;
}

/**
 * Tool success event from PostToolUse hook (for knowledge extraction)
 */
export interface ToolSuccessEvent {
  sessionId: string;
  projectId?: string;
  toolName: string;
  toolInput?: unknown;
  toolOutput?: string;
  durationMs?: number;
  timestamp?: string;
}

/**
 * Knowledge extraction result from tool output
 */
export interface ExtractedKnowledge {
  category: 'decision' | 'fact' | 'context' | 'reference';
  title: string;
  content: string;
  confidence: number;
  source: string;
}

/**
 * Patterns that indicate knowledge-worthy content in tool output
 */
const KNOWLEDGE_PATTERNS: Array<{
  pattern: RegExp;
  category: 'decision' | 'fact' | 'context' | 'reference';
  titlePrefix: string;
  minLength: number;
}> = [
  // Configuration discoveries
  {
    pattern: /(?:config|configuration|setting)[:\s]+([^\n]+)/i,
    category: 'fact',
    titlePrefix: 'Config:',
    minLength: 10,
  },
  // Version/dependency info
  {
    pattern: /(?:version|@)[:\s]*(\d+\.\d+[\d.]*)/i,
    category: 'fact',
    titlePrefix: 'Version:',
    minLength: 5,
  },
  // File structure discoveries
  {
    pattern: /(?:found|located|exists)[:\s]+([^\n]+(?:\.ts|\.js|\.json|\.md)[^\n]*)/i,
    category: 'context',
    titlePrefix: 'File:',
    minLength: 10,
  },
  // Test results
  {
    pattern: /(\d+)\s+(?:tests?|specs?)\s+(?:passed|failed|skipped)/i,
    category: 'fact',
    titlePrefix: 'Test results:',
    minLength: 10,
  },
  // Architecture/structure info
  {
    pattern: /(?:architecture|structure|pattern)[:\s]+([^\n]+)/i,
    category: 'context',
    titlePrefix: 'Architecture:',
    minLength: 15,
  },
  // API/endpoint discoveries
  {
    pattern: /(?:endpoint|api|route)[:\s]+([^\n]+)/i,
    category: 'reference',
    titlePrefix: 'API:',
    minLength: 10,
  },
  // Database/schema info
  {
    pattern: /(?:table|schema|database|collection)[:\s]+([^\n]+)/i,
    category: 'reference',
    titlePrefix: 'Schema:',
    minLength: 10,
  },
];

/**
 * Configuration for error analysis on session end
 */
export interface ErrorAnalysisConfig {
  /** Enable error analysis on session end (default: true) */
  enabled: boolean;

  /** Minimum unique error types to trigger analysis (default: 2) */
  minUniqueErrorTypes: number;

  /** Timeout for LLM analysis in ms (default: 30000) */
  analysisTimeoutMs: number;

  /** Minimum confidence for storing corrective entries (default: 0.7) */
  confidenceThreshold: number;

  /** Maximum errors to analyze per session (default: 50) */
  maxErrorsToAnalyze: number;
}

/**
 * Configuration for HookLearningService
 */
export interface HookLearningConfig {
  /** Enable learning from hook events (default: true) */
  enabled: boolean;

  /** Minimum consecutive failures to create an experience (default: 2) */
  minFailuresForExperience: number;

  /** Minimum errors in time window to trigger pattern detection (default: 3) */
  errorPatternThreshold: number;

  /** Time window for error pattern detection in ms (default: 5 minutes) */
  errorPatternWindowMs: number;

  /** Auto-trigger librarian analysis after N experiences (default: 5) */
  analysisThreshold: number;

  /** Confidence for auto-captured experiences (default: 0.6) */
  defaultConfidence: number;

  /** Include tool input in experience content (default: false for privacy) */
  includeToolInput: boolean;

  /** Enable knowledge extraction from tool outputs (default: true) */
  enableKnowledgeExtraction: boolean;

  /** Minimum confidence for auto-storing knowledge (default: 0.7) */
  knowledgeConfidenceThreshold: number;

  /** Tools to extract knowledge from (default: ['Read', 'Grep', 'Glob', 'Bash']) */
  knowledgeExtractionTools: string[];

  /** Minimum output length for knowledge extraction (default: 50) */
  minOutputLengthForKnowledge: number;

  /** Enable conversation trigger parsing (default: true) */
  enableTriggerParsing: boolean;

  /** Minimum confidence for auto-storing from triggers (default: 0.8) */
  triggerConfidenceThreshold: number;

  /** Minimum message length for trigger parsing (default: 20) */
  minMessageLengthForTriggers: number;

  /** Enable task tracking at block boundaries (default: true) */
  enableTaskTracking: boolean;
}

const DEFAULT_ERROR_ANALYSIS_CONFIG: ErrorAnalysisConfig = {
  enabled: true,
  minUniqueErrorTypes: 2,
  analysisTimeoutMs: 30000,
  confidenceThreshold: 0.7,
  maxErrorsToAnalyze: 50,
};

const DEFAULT_CONFIG: HookLearningConfig = {
  enabled: true,
  minFailuresForExperience: 2,
  errorPatternThreshold: 3,
  errorPatternWindowMs: 5 * 60 * 1000, // 5 minutes
  analysisThreshold: 5,
  defaultConfidence: 0.6,
  includeToolInput: false,
  enableKnowledgeExtraction: true,
  knowledgeConfidenceThreshold: 0.7,
  knowledgeExtractionTools: ['Read', 'Grep', 'Glob', 'Bash', 'WebFetch'],
  minOutputLengthForKnowledge: 50,
  enableTriggerParsing: true,
  triggerConfidenceThreshold: 0.8,
  minMessageLengthForTriggers: 20,
  enableTaskTracking: true,
};

/**
 * Tracks tool failures per session for pattern detection
 */
interface ToolFailureTracker {
  toolName: string;
  failures: Array<{
    errorType?: string;
    errorMessage?: string;
    timestamp: string;
  }>;
  lastExperienceCreated?: string;
}

/**
 * Tracks error notifications per session
 */
interface ErrorTracker {
  errors: Array<{
    type: string;
    message: string;
    timestamp: string;
  }>;
  lastPatternDetected?: string;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Hook Learning Service
 *
 * Captures experiences from Claude Code hook events and triggers
 * Librarian analysis for pattern detection and learning.
 */
interface ActiveBlock {
  taskId: string;
  userMessage: string;
  startTime: string;
}

export class HookLearningService {
  private config: HookLearningConfig;
  private errorAnalysisConfig: ErrorAnalysisConfig;
  private experienceRepo: IExperienceRepository | null = null;
  private knowledgeRepo: IKnowledgeRepository | null = null;
  private guidelineRepo: IGuidelineRepository | null = null;
  private toolRepo: IToolRepository | null = null;
  private taskRepo: ITaskRepository | null = null;
  private errorLogRepo: ErrorLogRepository | null = null;
  private toolOutcomesRepo: ToolOutcomesRepository | null = null;
  private librarianService: LibrarianService | null = null;
  private triggersService = getExtractionTriggersService();

  // Session-scoped trackers
  private toolFailures = new Map<string, Map<string, ToolFailureTracker>>();
  private errorTrackers = new Map<string, ErrorTracker>();
  private experienceCount = new Map<string, number>();
  private knowledgeCount = new Map<string, number>();
  private createdKnowledgeTitles = new Map<string, Set<string>>();
  private activeBlocks = new Map<string, ActiveBlock>();

  constructor(config?: Partial<HookLearningConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.errorAnalysisConfig = { ...DEFAULT_ERROR_ANALYSIS_CONFIG };
  }

  /**
   * Set dependencies (for late binding)
   */
  setDependencies(deps: {
    experienceRepo?: IExperienceRepository;
    knowledgeRepo?: IKnowledgeRepository;
    guidelineRepo?: IGuidelineRepository;
    toolRepo?: IToolRepository;
    taskRepo?: ITaskRepository;
    errorLogRepo?: ErrorLogRepository;
    toolOutcomesRepo?: ToolOutcomesRepository;
    librarianService?: LibrarianService;
  }): void {
    if (deps.experienceRepo) {
      this.experienceRepo = deps.experienceRepo;
    }
    if (deps.knowledgeRepo) {
      this.knowledgeRepo = deps.knowledgeRepo;
    }
    if (deps.guidelineRepo) {
      this.guidelineRepo = deps.guidelineRepo;
    }
    if (deps.toolRepo) {
      this.toolRepo = deps.toolRepo;
    }
    if (deps.taskRepo) {
      this.taskRepo = deps.taskRepo;
    }
    if (deps.errorLogRepo) {
      this.errorLogRepo = deps.errorLogRepo;
    }
    if (deps.toolOutcomesRepo) {
      this.toolOutcomesRepo = deps.toolOutcomesRepo;
    }
    if (deps.librarianService) {
      this.librarianService = deps.librarianService;
    }
  }

  /**
   * Check if knowledge extraction is available
   */
  isKnowledgeAvailable(): boolean {
    return (
      this.config.enabled && this.config.enableKnowledgeExtraction && this.knowledgeRepo !== null
    );
  }

  /**
   * Check if the service is properly configured
   */
  isAvailable(): boolean {
    return this.config.enabled && this.experienceRepo !== null;
  }

  /**
   * Get current configuration
   */
  getConfig(): HookLearningConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HookLearningConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===========================================================================
  // TOOL FAILURE LEARNING
  // ===========================================================================

  /**
   * Record a tool failure and potentially create an experience
   *
   * Creates an experience when:
   * - Same tool fails consecutively (minFailuresForExperience times)
   * - Different error types indicate a pattern worth learning
   */
  async onToolFailure(event: ToolFailureEvent): Promise<{
    experienceCreated: boolean;
    experienceId?: string;
  }> {
    if (!this.isAvailable()) {
      logger.debug('Hook learning not available, skipping tool failure');
      return { experienceCreated: false };
    }

    const { sessionId, toolName } = event;
    const timestamp = event.timestamp ?? new Date().toISOString();

    // Get or create session tracker
    if (!this.toolFailures.has(sessionId)) {
      this.toolFailures.set(sessionId, new Map());
    }
    const sessionTrackers = this.toolFailures.get(sessionId)!;

    // Get or create tool tracker
    if (!sessionTrackers.has(toolName)) {
      sessionTrackers.set(toolName, {
        toolName,
        failures: [],
      });
    }
    const tracker = sessionTrackers.get(toolName)!;

    // Add failure
    tracker.failures.push({
      errorType: event.errorType,
      errorMessage: event.errorMessage,
      timestamp,
    });

    logger.debug(
      {
        sessionId,
        toolName,
        failureCount: tracker.failures.length,
        errorType: event.errorType,
      },
      'Tool failure recorded'
    );

    // Check if we should create an experience
    if (tracker.failures.length >= this.config.minFailuresForExperience) {
      // Avoid creating duplicate experiences for the same failure pattern
      const recentFailures = tracker.failures.slice(-this.config.minFailuresForExperience);
      const patternKey = recentFailures.map((f) => f.errorType ?? 'unknown').join(':');

      if (tracker.lastExperienceCreated !== patternKey) {
        const experience = await this.createToolFailureExperience(event, recentFailures);
        if (experience) {
          tracker.lastExperienceCreated = patternKey;
          tracker.failures = []; // Reset after creating experience
          await this.incrementExperienceCount(sessionId, event.projectId);
          return { experienceCreated: true, experienceId: experience.id };
        }
      }
    }

    return { experienceCreated: false };
  }

  /**
   * Create an experience from repeated tool failures
   */
  private async createToolFailureExperience(
    event: ToolFailureEvent,
    failures: Array<{ errorType?: string; errorMessage?: string; timestamp: string }>
  ): Promise<{ id: string } | null> {
    try {
      const errorTypes = [...new Set(failures.map((f) => f.errorType ?? 'unknown'))];
      const sampleErrors = failures
        .map((f) => f.errorMessage)
        .filter(Boolean)
        .slice(0, 3);

      // Build experience content
      const content = this.buildToolFailureContent(event, errorTypes, sampleErrors);
      const scenario = `Tool "${event.toolName}" failed ${failures.length} times in quick succession`;
      const outcome = `Failures with error types: ${errorTypes.join(', ')}`;

      // Include error types in title to allow different patterns for same tool
      const errorTypeSuffix = errorTypes.length > 0 ? ` (${errorTypes.join(', ')})` : '';
      const experience = await this.experienceRepo!.create({
        scopeType: event.projectId ? 'project' : 'session',
        scopeId: event.projectId ?? event.sessionId,
        title: `Tool failure pattern: ${event.toolName}${errorTypeSuffix}`,
        level: 'case',
        category: 'tool-failure',
        content,
        scenario,
        outcome,
        confidence: this.config.defaultConfidence,
        source: 'observation',
        createdBy: 'hook-learning',
        steps: failures.map((f) => ({
          action: `Attempted to use ${event.toolName}`,
          observation: f.errorMessage ?? `Failed with ${f.errorType ?? 'unknown error'}`,
          success: false,
          timestamp: f.timestamp,
        })),
      });

      logger.info(
        {
          experienceId: experience.id,
          sessionId: event.sessionId,
          toolName: event.toolName,
          failureCount: failures.length,
        },
        'Created experience from tool failure pattern'
      );

      return { id: experience.id };
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: event.sessionId,
          toolName: event.toolName,
        },
        'Failed to create tool failure experience (non-fatal)'
      );
      return null;
    }
  }

  /**
   * Build content for tool failure experience
   */
  private buildToolFailureContent(
    event: ToolFailureEvent,
    errorTypes: string[],
    sampleErrors: (string | undefined)[]
  ): string {
    const lines: string[] = [
      `The ${event.toolName} tool failed repeatedly during this session.`,
      '',
      `**Error types encountered:** ${errorTypes.join(', ')}`,
    ];

    if (sampleErrors.length > 0) {
      lines.push('', '**Sample error messages:**');
      sampleErrors.forEach((msg, i) => {
        if (msg) lines.push(`${i + 1}. ${msg.slice(0, 200)}`);
      });
    }

    if (this.config.includeToolInput && event.toolInput) {
      const inputStr =
        typeof event.toolInput === 'string'
          ? event.toolInput
          : JSON.stringify(event.toolInput, null, 2);
      lines.push('', '**Tool input pattern:**', '```', inputStr.slice(0, 500), '```');
    }

    lines.push(
      '',
      '**Potential causes:**',
      '- Invalid input parameters',
      '- Missing dependencies or permissions',
      '- External service unavailable',
      '- Configuration mismatch'
    );

    return lines.join('\n');
  }

  // ===========================================================================
  // SUBAGENT LEARNING
  // ===========================================================================

  /**
   * Record a subagent completion and create an experience for significant work
   *
   * Creates an experience when:
   * - Subagent produced meaningful results
   * - Subagent failed (to learn from failures)
   */
  async onSubagentCompletion(event: SubagentCompletionEvent): Promise<{
    experienceCreated: boolean;
    experienceId?: string;
  }> {
    if (!this.isAvailable()) {
      logger.debug('Hook learning not available, skipping subagent completion');
      return { experienceCreated: false };
    }

    // Only create experiences for failures or significant successes
    const shouldCapture =
      !event.success || (event.resultSummary && event.resultSummary.length > 200);

    if (!shouldCapture) {
      logger.debug(
        {
          sessionId: event.sessionId,
          subagentType: event.subagentType,
          success: event.success,
        },
        'Subagent completion not significant enough for experience'
      );
      return { experienceCreated: false };
    }

    try {
      const experience = await this.createSubagentExperience(event);
      if (experience) {
        await this.incrementExperienceCount(event.sessionId, event.projectId);
        return { experienceCreated: true, experienceId: experience.id };
      }
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: event.sessionId,
          subagentType: event.subagentType,
        },
        'Failed to create subagent experience (non-fatal)'
      );
    }

    return { experienceCreated: false };
  }

  /**
   * Create an experience from subagent completion
   */
  private async createSubagentExperience(
    event: SubagentCompletionEvent
  ): Promise<{ id: string } | null> {
    const outcomeType = event.success ? 'success' : 'failure';
    const title = event.success
      ? `Subagent insight: ${event.subagentType}`
      : `Subagent failure: ${event.subagentType}`;

    const content = this.buildSubagentContent(event);
    const scenario = `Delegated work to ${event.subagentType} subagent`;
    const outcome = event.success
      ? `Subagent completed successfully${event.durationMs ? ` in ${event.durationMs}ms` : ''}`
      : `Subagent failed to complete the task`;

    const experience = await this.experienceRepo!.create({
      scopeType: event.projectId ? 'project' : 'session',
      scopeId: event.projectId ?? event.sessionId,
      title,
      level: 'case',
      category: `subagent-${outcomeType}`,
      content,
      scenario,
      outcome,
      confidence: event.success
        ? this.config.defaultConfidence
        : this.config.defaultConfidence - 0.1,
      source: 'observation',
      createdBy: 'hook-learning',
      steps: [
        {
          action: `Delegated to ${event.subagentType} subagent`,
          observation: event.resultSummary?.slice(0, 500) ?? 'No result summary available',
          success: event.success,
          timestamp: event.timestamp ?? new Date().toISOString(),
          durationMs: event.durationMs,
        },
      ],
    });

    logger.info(
      {
        experienceId: experience.id,
        sessionId: event.sessionId,
        subagentType: event.subagentType,
        success: event.success,
      },
      'Created experience from subagent completion'
    );

    return { id: experience.id };
  }

  /**
   * Build content for subagent experience
   */
  private buildSubagentContent(event: SubagentCompletionEvent): string {
    const lines: string[] = [];

    if (event.success) {
      lines.push(
        `The ${event.subagentType} subagent completed its delegated task successfully.`,
        '',
        '**Key insights from the subagent:**'
      );
    } else {
      lines.push(
        `The ${event.subagentType} subagent failed to complete its delegated task.`,
        '',
        '**Failure details:**'
      );
    }

    if (event.resultSummary) {
      lines.push('', event.resultSummary.slice(0, 1000));
    }

    if (event.durationMs) {
      lines.push('', `**Duration:** ${event.durationMs}ms`);
    }

    if (event.parentSessionId) {
      lines.push('', `**Parent session:** ${event.parentSessionId}`);
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // ERROR PATTERN LEARNING
  // ===========================================================================

  /**
   * Record an error notification and detect patterns
   *
   * Creates an experience when:
   * - Error count in time window exceeds threshold
   * - Similar errors keep recurring
   */
  async onErrorNotification(event: {
    sessionId: string;
    projectId?: string;
    errorType: string;
    message: string;
    timestamp?: string;
  }): Promise<{
    patternDetected: boolean;
    experienceCreated: boolean;
    experienceId?: string;
  }> {
    if (!this.isAvailable()) {
      logger.debug('Hook learning not available, skipping error notification');
      return { patternDetected: false, experienceCreated: false };
    }

    const { sessionId, errorType, message } = event;
    const timestamp = event.timestamp ?? new Date().toISOString();

    // Get or create error tracker
    if (!this.errorTrackers.has(sessionId)) {
      this.errorTrackers.set(sessionId, { errors: [] });
    }
    const tracker = this.errorTrackers.get(sessionId)!;

    // Add error
    tracker.errors.push({ type: errorType, message, timestamp });

    // Clean old errors outside time window
    const cutoff = Date.now() - this.config.errorPatternWindowMs;
    tracker.errors = tracker.errors.filter((e) => new Date(e.timestamp).getTime() > cutoff);

    logger.debug(
      {
        sessionId,
        errorType,
        errorCount: tracker.errors.length,
      },
      'Error notification recorded'
    );

    // Check for pattern
    if (tracker.errors.length >= this.config.errorPatternThreshold) {
      const patternKey = this.computeErrorPatternKey(tracker.errors);

      if (tracker.lastPatternDetected !== patternKey) {
        const experience = await this.createErrorPatternExperience({
          sessionId,
          projectId: event.projectId,
          errorType,
          errorCount: tracker.errors.length,
          sampleMessages: tracker.errors.map((e) => e.message).slice(0, 5),
          timeWindowMs: this.config.errorPatternWindowMs,
          timestamp,
        });

        if (experience) {
          tracker.lastPatternDetected = patternKey;
          tracker.errors = []; // Reset after creating experience
          await this.incrementExperienceCount(sessionId, event.projectId);
          return { patternDetected: true, experienceCreated: true, experienceId: experience.id };
        }

        return { patternDetected: true, experienceCreated: false };
      }
    }

    return { patternDetected: false, experienceCreated: false };
  }

  /**
   * Compute a key representing the error pattern
   */
  private computeErrorPatternKey(
    errors: Array<{ type: string; message: string; timestamp: string }>
  ): string {
    const types = [...new Set(errors.map((e) => e.type))].sort();
    return types.join(':');
  }

  /**
   * Create an experience from error pattern
   */
  private async createErrorPatternExperience(
    event: ErrorPatternEvent
  ): Promise<{ id: string } | null> {
    try {
      const content = this.buildErrorPatternContent(event);
      const scenario = `${event.errorCount} errors occurred within ${Math.round(event.timeWindowMs / 1000 / 60)} minutes`;
      const outcome = `Error pattern detected: ${event.errorType}`;

      const experience = await this.experienceRepo!.create({
        scopeType: event.projectId ? 'project' : 'session',
        scopeId: event.projectId ?? event.sessionId,
        title: `Error pattern: ${event.errorType}`,
        level: 'case',
        category: 'error-pattern',
        content,
        scenario,
        outcome,
        confidence: this.config.defaultConfidence,
        source: 'observation',
        createdBy: 'hook-learning',
      });

      logger.info(
        {
          experienceId: experience.id,
          sessionId: event.sessionId,
          errorType: event.errorType,
          errorCount: event.errorCount,
        },
        'Created experience from error pattern'
      );

      return { id: experience.id };
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: event.sessionId,
          errorType: event.errorType,
        },
        'Failed to create error pattern experience (non-fatal)'
      );
      return null;
    }
  }

  /**
   * Build content for error pattern experience
   */
  private buildErrorPatternContent(event: ErrorPatternEvent): string {
    const windowMinutes = Math.round(event.timeWindowMs / 1000 / 60);

    const lines: string[] = [
      `A pattern of ${event.errorCount} errors was detected within ${windowMinutes} minutes.`,
      '',
      `**Error type:** ${event.errorType}`,
      '',
      '**Sample error messages:**',
    ];

    event.sampleMessages.forEach((msg, i) => {
      lines.push(`${i + 1}. ${msg.slice(0, 200)}`);
    });

    lines.push(
      '',
      '**Possible actions:**',
      '- Investigate the root cause',
      '- Check for environmental issues',
      '- Review recent code changes',
      '- Consider adding error handling'
    );

    return lines.join('\n');
  }

  // ===========================================================================
  // KNOWLEDGE EXTRACTION
  // ===========================================================================

  /**
   * Extract and store knowledge from successful tool execution
   */
  async onToolSuccess(event: ToolSuccessEvent): Promise<{
    knowledgeCreated: boolean;
    knowledgeIds: string[];
  }> {
    if (!this.isKnowledgeAvailable()) {
      logger.debug('Knowledge extraction not available, skipping');
      return { knowledgeCreated: false, knowledgeIds: [] };
    }

    const { sessionId, toolName, toolOutput } = event;

    // Check if this tool is in the extraction list
    if (!this.config.knowledgeExtractionTools.includes(toolName)) {
      return { knowledgeCreated: false, knowledgeIds: [] };
    }

    // Check minimum output length
    if (!toolOutput || toolOutput.length < this.config.minOutputLengthForKnowledge) {
      return { knowledgeCreated: false, knowledgeIds: [] };
    }

    // Extract knowledge from output
    const extractedKnowledge = this.extractKnowledgeFromOutput(toolName, toolOutput);

    // Filter by confidence and store
    const knowledgeIds: string[] = [];
    for (const knowledge of extractedKnowledge) {
      if (knowledge.confidence >= this.config.knowledgeConfidenceThreshold) {
        const created = await this.createKnowledgeEntry(event, knowledge);
        if (created) {
          knowledgeIds.push(created.id);
        }
      }
    }

    if (knowledgeIds.length > 0) {
      logger.info(
        { sessionId, toolName, count: knowledgeIds.length },
        'Created knowledge from tool output'
      );
    }

    return { knowledgeCreated: knowledgeIds.length > 0, knowledgeIds };
  }

  /**
   * Extract knowledge from subagent findings
   */
  async onSubagentKnowledge(event: {
    sessionId: string;
    projectId?: string;
    subagentType: string;
    findings: string;
    timestamp?: string;
  }): Promise<{ knowledgeCreated: boolean; knowledgeIds: string[] }> {
    if (!this.isKnowledgeAvailable()) {
      return { knowledgeCreated: false, knowledgeIds: [] };
    }

    const knowledgeSubagents = ['Explore', 'Plan', 'general-purpose'];
    if (!knowledgeSubagents.includes(event.subagentType)) {
      return { knowledgeCreated: false, knowledgeIds: [] };
    }

    const extracted = this.extractKnowledgeFromOutput(
      `Subagent:${event.subagentType}`,
      event.findings
    );
    const knowledgeIds: string[] = [];

    for (const knowledge of extracted) {
      if (knowledge.confidence >= this.config.knowledgeConfidenceThreshold) {
        const created = await this.createKnowledgeEntry(
          {
            sessionId: event.sessionId,
            projectId: event.projectId,
            toolName: `Subagent:${event.subagentType}`,
            toolOutput: event.findings,
            timestamp: event.timestamp,
          },
          knowledge
        );
        if (created) knowledgeIds.push(created.id);
      }
    }

    return { knowledgeCreated: knowledgeIds.length > 0, knowledgeIds };
  }

  /**
   * Extract knowledge patterns from tool output
   */
  private extractKnowledgeFromOutput(toolName: string, output: string): ExtractedKnowledge[] {
    const extracted: ExtractedKnowledge[] = [];

    for (const pattern of KNOWLEDGE_PATTERNS) {
      const matches = output.match(pattern.pattern);
      if (matches && matches[0].length >= pattern.minLength) {
        const matchedContent = matches[1] ?? matches[0];
        const title = `${pattern.titlePrefix} ${matchedContent.slice(0, 50).trim()}`;

        if (!extracted.some((e) => e.title === title)) {
          extracted.push({
            category: pattern.category,
            title,
            content: `Discovered via ${toolName}: ${matchedContent}`,
            confidence: 0.75,
            source: `hook:${toolName}`,
          });
        }
      }
    }

    return extracted;
  }

  /**
   * Create a knowledge entry in the database
   */
  private async createKnowledgeEntry(
    event: ToolSuccessEvent,
    knowledge: ExtractedKnowledge
  ): Promise<{ id: string } | null> {
    const { sessionId, projectId } = event;

    // Check for duplicates within session
    if (!this.createdKnowledgeTitles.has(sessionId)) {
      this.createdKnowledgeTitles.set(sessionId, new Set());
    }
    const sessionTitles = this.createdKnowledgeTitles.get(sessionId)!;
    if (sessionTitles.has(knowledge.title)) {
      return null;
    }

    try {
      const created = await this.knowledgeRepo!.create({
        scopeType: projectId ? 'project' : 'session',
        scopeId: projectId ?? sessionId,
        title: knowledge.title,
        content: knowledge.content,
        category: knowledge.category,
        source: knowledge.source,
        confidence: knowledge.confidence,
        createdBy: 'hook-learning',
      });

      sessionTitles.add(knowledge.title);
      const count = (this.knowledgeCount.get(sessionId) ?? 0) + 1;
      this.knowledgeCount.set(sessionId, count);

      return { id: created.id };
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to create knowledge'
      );
      return null;
    }
  }

  /**
   * Generate corrective knowledge or guideline entry from error pattern
   */
  private generateCorrectiveEntry(pattern: ErrorPattern): {
    type: 'knowledge' | 'guideline';
    title?: string;
    name?: string;
    content: string;
    category: string;
  } {
    const { type, title, content } = pattern.suggestedCorrection;

    if (type === 'guideline') {
      return {
        type: 'guideline',
        name: title || 'Error correction guideline',
        content,
        category: 'error-correction',
      };
    }

    return {
      type: 'knowledge',
      title: title || 'Error correction knowledge',
      content,
      category: 'error-correction',
    };
  }

  // ===========================================================================
  // CONVERSATION TRIGGER PARSING
  // ===========================================================================

  /**
   * Parse conversation message for triggers and auto-create memory entries
   */
  async onConversationMessage(event: {
    sessionId: string;
    projectId?: string;
    role: 'user' | 'assistant';
    message: string;
  }): Promise<{
    entriesCreated: number;
    guidelines: string[];
    knowledge: string[];
    experiences: string[];
    tools: string[];
  }> {
    if (!this.config.enableTriggerParsing) {
      return { entriesCreated: 0, guidelines: [], knowledge: [], experiences: [], tools: [] };
    }

    const { sessionId, message } = event;

    if (!message || message.length < this.config.minMessageLengthForTriggers) {
      return { entriesCreated: 0, guidelines: [], knowledge: [], experiences: [], tools: [] };
    }

    const triggerResult = this.triggersService.detect(message);

    if (!triggerResult.shouldExtract) {
      logger.debug(
        { sessionId, triggerCount: triggerResult.triggers.length },
        'No triggers worth extracting'
      );
      return { entriesCreated: 0, guidelines: [], knowledge: [], experiences: [], tools: [] };
    }

    const created = {
      guidelines: [] as string[],
      knowledge: [] as string[],
      experiences: [] as string[],
      tools: [] as string[],
    };

    for (const trigger of triggerResult.triggers) {
      if (trigger.confidence < this.config.triggerConfidenceThreshold) {
        continue;
      }

      try {
        const entryId = await this.createEntryFromTrigger(event, trigger, message);
        if (entryId) {
          const entryType = this.mapTriggerToEntryType(trigger.type);
          if (entryType === 'guideline') created.guidelines.push(entryId);
          else if (entryType === 'knowledge') created.knowledge.push(entryId);
          else if (entryType === 'experience') created.experiences.push(entryId);
          else if (entryType === 'tool') created.tools.push(entryId);
        }
      } catch (error) {
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            triggerType: trigger.type,
          },
          'Failed to create entry from trigger (non-fatal)'
        );
      }
    }

    const total =
      created.guidelines.length +
      created.knowledge.length +
      created.experiences.length +
      created.tools.length;

    if (total > 0) {
      logger.info(
        {
          sessionId,
          total,
          guidelines: created.guidelines.length,
          knowledge: created.knowledge.length,
          experiences: created.experiences.length,
          tools: created.tools.length,
        },
        'Created entries from conversation triggers'
      );
    }

    return { entriesCreated: total, ...created };
  }

  private mapTriggerToEntryType(
    triggerType: TriggerType
  ): 'guideline' | 'knowledge' | 'experience' | 'tool' {
    switch (triggerType) {
      case 'rule':
      case 'preference':
        return 'guideline';
      case 'decision':
      case 'enthusiasm':
      case 'correction':
        return 'knowledge';
      case 'recovery':
      case 'error_recovery':
      case 'problem_solved':
      case 'workaround_found':
      case 'lesson_learned':
        return 'experience';
      case 'command':
        return 'tool';
      default:
        return 'knowledge';
    }
  }

  private async createEntryFromTrigger(
    event: { sessionId: string; projectId?: string; role: 'user' | 'assistant' },
    trigger: DetectedTrigger,
    fullMessage: string
  ): Promise<string | null> {
    const entryType = this.mapTriggerToEntryType(trigger.type);
    const scopeType = event.projectId ? 'project' : 'session';
    const scopeId = event.projectId ?? event.sessionId;

    const context = this.extractContextAroundTrigger(fullMessage, trigger);

    switch (entryType) {
      case 'guideline': {
        if (!this.guidelineRepo) return null;

        const guideline = await this.guidelineRepo.create({
          scopeType,
          scopeId,
          name: this.generateGuidelineName(context),
          content: context,
          category: trigger.type,
          priority: Math.round(trigger.priorityBoost / 10),
          createdBy: 'hook-learning',
          rationale: `Auto-captured from ${event.role} message via ${trigger.type} trigger`,
        });
        return guideline.id;
      }

      case 'knowledge': {
        if (!this.knowledgeRepo) return null;

        const knowledge = await this.knowledgeRepo.create({
          scopeType,
          scopeId,
          title: this.generateKnowledgeTitle(trigger.type, context),
          content: context,
          category: trigger.type === 'decision' ? 'decision' : 'context',
          source: `conversation:${event.role}`,
          confidence: trigger.confidence,
          createdBy: 'hook-learning',
        });
        return knowledge.id;
      }

      case 'experience': {
        if (!this.experienceRepo) return null;

        const experience = await this.experienceRepo.create({
          scopeType,
          scopeId,
          title: this.generateExperienceTitle(trigger.type, context),
          level: 'case',
          category: trigger.type,
          content: context,
          scenario: `Learned from ${event.role} message`,
          outcome: trigger.matchedText,
          confidence: trigger.confidence,
          source: 'observation',
          createdBy: 'hook-learning',
        });
        return experience.id;
      }

      case 'tool': {
        if (!this.toolRepo) return null;

        const commandMatch = this.extractCommand(context);
        if (!commandMatch) return null;

        const tool = await this.toolRepo.create({
          scopeType,
          scopeId,
          name: this.generateToolName(commandMatch),
          category: 'cli',
          description: `Auto-captured from ${event.role} message`,
          parameters: { command: commandMatch },
          createdBy: 'hook-learning',
        });
        return tool.id;
      }
    }
  }

  private extractContextAroundTrigger(message: string, trigger: DetectedTrigger): string {
    const contextRadius = 200;
    const start = Math.max(0, trigger.spanStart - contextRadius);
    const end = Math.min(message.length, trigger.spanEnd + contextRadius);

    let context = message.slice(start, end).trim();

    if (start > 0) context = '...' + context;
    if (end < message.length) context = context + '...';

    return context;
  }

  private generateGuidelineName(content: string): string {
    const firstSentence = content.split(/[.!?]/)[0] ?? content;
    const words = firstSentence.trim().split(/\s+/).slice(0, 8);
    return words
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
  }

  private generateKnowledgeTitle(triggerType: string, content: string): string {
    const firstLine = content.split('\n')[0] ?? content;
    const preview = firstLine.slice(0, 80).trim();
    return `${triggerType}: ${preview}${firstLine.length > 80 ? '...' : ''}`;
  }

  private generateExperienceTitle(triggerType: string, content: string): string {
    const firstLine = content.split('\n')[0] ?? content;
    const preview = firstLine.slice(0, 60).trim();
    return `${triggerType}: ${preview}${firstLine.length > 60 ? '...' : ''}`;
  }

  private generateToolName(command: string): string {
    const parts = command.trim().split(/\s+/);
    const baseName = parts.slice(0, 3).join('-');
    return baseName.toLowerCase().replace(/[^a-z0-9-]/g, '');
  }

  private extractCommand(context: string): string | null {
    const codeBlockMatch = context.match(/```(?:bash|sh|shell)?\n([^`]+)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1]?.trim() ?? null;
    }

    const inlineMatch = context.match(/`([^`]+)`/);
    if (inlineMatch) {
      const cmd = inlineMatch[1]?.trim();
      if (cmd && (cmd.startsWith('$') || cmd.includes(' '))) {
        return cmd.replace(/^\$\s*/, '');
      }
    }

    const shellMatch = context.match(/\$\s+([^\n]+)/);
    if (shellMatch) {
      return shellMatch[1]?.trim() ?? null;
    }

    return null;
  }

  // ===========================================================================
  // EPISODE EVENT CAPTURE
  // ===========================================================================

  async onEpisodeEvent(event: {
    sessionId: string;
    projectId?: string;
    episodeId: string;
    eventType: 'started' | 'checkpoint' | 'decision' | 'error' | 'completed';
    message: string;
    data?: Record<string, unknown>;
  }): Promise<{
    captured: boolean;
    entryId?: string;
    entryType?: 'experience' | 'knowledge';
  }> {
    const { sessionId, projectId, episodeId, eventType, message, data } = event;

    if (eventType === 'error' || eventType === 'started') {
      return { captured: false };
    }

    const scopeType = projectId ? 'project' : 'session';
    const scopeId = projectId ?? sessionId;

    try {
      if (eventType === 'decision') {
        if (!this.knowledgeRepo) {
          return { captured: false };
        }

        const knowledge = await this.knowledgeRepo.create({
          scopeType,
          scopeId,
          title: `Episode decision: ${message.slice(0, 60)}`,
          content: message,
          category: 'decision',
          source: `episode:${episodeId}`,
          confidence: 0.8,
          createdBy: 'hook-learning',
        });

        logger.info(
          { sessionId, episodeId, knowledgeId: knowledge.id },
          'Captured decision from episode event'
        );
        return { captured: true, entryId: knowledge.id, entryType: 'knowledge' };
      }

      if (eventType === 'checkpoint' || eventType === 'completed') {
        if (!this.experienceRepo) {
          return { captured: false };
        }

        if (message.length < 30) {
          return { captured: false };
        }

        const title =
          eventType === 'completed'
            ? `Episode completed: ${message.slice(0, 50)}`
            : `Episode checkpoint: ${message.slice(0, 50)}`;

        const experience = await this.experienceRepo.create({
          scopeType,
          scopeId,
          title,
          level: 'case',
          category: eventType,
          content: message,
          scenario: `Episode event: ${eventType}`,
          outcome: data?.outcome ? String(data.outcome) : 'Event recorded',
          confidence: eventType === 'completed' ? 0.85 : 0.7,
          source: 'observation',
          createdBy: 'hook-learning',
          steps: [
            {
              action: eventType,
              observation: message,
              success: eventType === 'completed',
              timestamp: new Date().toISOString(),
            },
          ],
        });

        // Increment session experience counter
        const count = (this.experienceCount.get(sessionId) ?? 0) + 1;
        this.experienceCount.set(sessionId, count);

        logger.info(
          { sessionId, episodeId, experienceId: experience.id },
          `Captured ${eventType} from episode event`
        );
        return { captured: true, entryId: experience.id, entryType: 'experience' };
      }

      return { captured: false };
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          episodeId,
          eventType,
        },
        'Failed to capture episode event (non-fatal)'
      );
      return { captured: false };
    }
  }

  // ===========================================================================
  // TASK TRACKING AT BLOCK BOUNDARIES
  // ===========================================================================

  async onBlockStart(event: {
    sessionId: string;
    userMessage: string;
    messageId: string;
  }): Promise<{
    taskCreated: boolean;
    taskId?: string;
  }> {
    if (!this.config.enableTaskTracking || !this.taskRepo) {
      return { taskCreated: false };
    }

    const { sessionId, userMessage, messageId } = event;

    const triggers = this.triggersService.detect(userMessage);

    if (!this.shouldCreateTask(triggers.triggers, userMessage)) {
      return { taskCreated: false };
    }

    try {
      const taskType = this.inferTaskType(triggers.triggers, userMessage);
      const task = await this.taskRepo.create({
        scopeType: 'session',
        scopeId: sessionId,
        title: this.inferTaskTitle(userMessage),
        description: userMessage.slice(0, 500),
        taskType,
        taskDomain: 'agent',
        status: 'in_progress',
        createdBy: 'hook-learning',
        metadata: { messageId, triggerTypes: triggers.triggers.map((t) => t.type) },
      });

      this.activeBlocks.set(messageId, {
        taskId: task.id,
        userMessage,
        startTime: new Date().toISOString(),
      });

      logger.info({ sessionId, taskId: task.id, messageId }, 'Created task at block start');
      return { taskCreated: true, taskId: task.id };
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
          messageId,
        },
        'Failed to create task at block start (non-fatal)'
      );
      return { taskCreated: false };
    }
  }

  async onBlockEnd(event: {
    sessionId: string;
    messageId: string;
    assistantMessage: string;
    success: boolean;
  }): Promise<{
    taskUpdated: boolean;
    taskId?: string;
    entriesCreated: number;
  }> {
    if (!this.config.enableTaskTracking || !this.taskRepo) {
      return { taskUpdated: false, entriesCreated: 0 };
    }

    const block = this.activeBlocks.get(event.messageId);
    if (!block) {
      return { taskUpdated: false, entriesCreated: 0 };
    }

    try {
      await this.taskRepo.update(block.taskId, {
        status: event.success ? 'done' : 'blocked',
        resolution: event.assistantMessage.slice(0, 200),
        resolvedAt: new Date().toISOString(),
      });

      const triggers = this.triggersService.detect(event.assistantMessage);
      let entriesCreated = 0;

      if (triggers.hasHighConfidenceTriggers) {
        const result = await this.onConversationMessage({
          sessionId: event.sessionId,
          role: 'assistant',
          message: event.assistantMessage,
        });
        entriesCreated = result.entriesCreated;
      }

      this.activeBlocks.delete(event.messageId);

      logger.info(
        { sessionId: event.sessionId, taskId: block.taskId, entriesCreated },
        'Updated task at block end'
      );

      return { taskUpdated: true, taskId: block.taskId, entriesCreated };
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          taskId: block.taskId,
        },
        'Failed to update task at block end (non-fatal)'
      );
      this.activeBlocks.delete(event.messageId);
      return { taskUpdated: false, entriesCreated: 0 };
    }
  }

  private shouldCreateTask(triggers: DetectedTrigger[], message: string): boolean {
    const workPatterns = [
      /\b(implement|add|create|build|fix|refactor|update)\s+/i,
      /\b(write|generate|make)\s+(a|the|some)?\s*(test|function|class|component)/i,
      /\b(debug|investigate|find|locate)\s+/i,
      /\bcan you\s+(help|make|create|fix|update)/i,
    ];

    if (workPatterns.some((p) => p.test(message))) {
      return true;
    }

    const workTriggers = ['decision', 'rule', 'command'];
    return triggers.some((t) => workTriggers.includes(t.type));
  }

  private inferTaskType(triggers: DetectedTrigger[], message: string): TaskType {
    if (/\b(bug|fix|error|broken)\b/i.test(message)) return 'bug';
    if (/\b(feature|implement|add)\b/i.test(message)) return 'feature';
    if (/\b(improve|optimize|refactor)\b/i.test(message)) return 'improvement';
    if (/\b(research|investigate|explore)\b/i.test(message)) return 'research';
    if (triggers.some((t) => t.type === 'decision')) return 'feature';
    return 'other';
  }

  private inferTaskTitle(message: string): string {
    const firstLine = message.split('\n')[0] ?? message;
    const cleaned = firstLine.replace(/^(can you|please|could you)\s+/i, '').trim();
    const words = cleaned.split(/\s+/).slice(0, 10);
    return words.join(' ').slice(0, 200);
  }

  // ===========================================================================
  // LIBRARIAN INTEGRATION
  // ===========================================================================

  /**
   * Increment experience count and trigger analysis if threshold reached
   */
  private async incrementExperienceCount(sessionId: string, projectId?: string): Promise<void> {
    const count = (this.experienceCount.get(sessionId) ?? 0) + 1;
    this.experienceCount.set(sessionId, count);

    if (count >= this.config.analysisThreshold && this.librarianService) {
      logger.info(
        {
          sessionId,
          experienceCount: count,
          threshold: this.config.analysisThreshold,
        },
        'Experience threshold reached, triggering Librarian analysis'
      );

      // Reset counter before triggering to avoid repeated triggers
      this.experienceCount.set(sessionId, 0);

      // Trigger analysis asynchronously (non-blocking)
      void this.triggerLibrarianAnalysis(sessionId, projectId);
    }
  }

  /**
   * Trigger Librarian analysis for a session's experiences
   */
  private async triggerLibrarianAnalysis(sessionId: string, projectId?: string): Promise<void> {
    if (!this.librarianService) {
      logger.debug('Librarian service not available, skipping analysis');
      return;
    }

    try {
      const scopeType: ScopeType = projectId ? 'project' : 'session';
      const scopeId = projectId ?? sessionId;

      const result = await this.librarianService.analyze({
        scopeType,
        scopeId,
        lookbackDays: 1, // Focus on recent experiences
        dryRun: false,
        initiatedBy: 'hook-learning',
      });

      logger.info(
        {
          sessionId,
          patternsFound: result.patternDetection.stats.patternsFound,
          recommendationsCreated: result.generatedRecommendations.length,
        },
        'Librarian analysis completed'
      );
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        'Librarian analysis failed (non-fatal)'
      );
    }
  }

  /**
   * Manually trigger Librarian analysis (e.g., on session end)
   */
  async triggerAnalysis(params: {
    sessionId: string;
    projectId?: string;
    dryRun?: boolean;
  }): Promise<{
    triggered: boolean;
    patternsFound?: number;
    recommendationsCreated?: number;
  }> {
    if (!this.librarianService) {
      return { triggered: false };
    }

    try {
      const scopeType: ScopeType = params.projectId ? 'project' : 'session';
      const scopeId = params.projectId ?? params.sessionId;

      const result = await this.librarianService.analyze({
        scopeType,
        scopeId,
        lookbackDays: 7,
        dryRun: params.dryRun ?? false,
        initiatedBy: 'hook-learning-manual',
      });

      return {
        triggered: true,
        patternsFound: result.patternDetection.stats.patternsFound,
        recommendationsCreated: result.generatedRecommendations.length,
      };
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: params.sessionId,
        },
        'Manual Librarian analysis failed'
      );
      return { triggered: false };
    }
  }

  // ===========================================================================
  // SESSION-END ERROR ANALYSIS
  // ===========================================================================

  /**
   * Trigger LLM error analysis when a session ends
   *
   * Fire-and-forget pattern: doesn't block session termination.
   * Analyzes errors in the session and generates corrective knowledge entries.
   *
   * Only analyzes if:
   * - Error analysis is enabled
   * - Session has 2+ unique error types
   * - ErrorLogRepository is available
   *
   * @param sessionId - Session ID to analyze
   * @returns Promise that resolves when analysis completes or times out
   */
  async onSessionEnd(sessionId: string): Promise<void> {
    // Try comprehensive outcome analysis first (all patterns)
    try {
      await this.performComprehensiveOutcomeAnalysis(sessionId);
    } catch (error) {
      logger.debug(
        {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Comprehensive outcome analysis failed, falling back to error analysis'
      );
    }

    // Fall back to error-only analysis if enabled
    if (!this.errorAnalysisConfig.enabled) {
      logger.debug({ sessionId }, 'Error analysis disabled, skipping session-end analysis');
      return;
    }

    if (!this.errorLogRepo) {
      logger.debug({ sessionId }, 'Error log repository not available, skipping analysis');
      return;
    }

    try {
      // Query errors for this session
      const errors = await this.errorLogRepo.getBySession(sessionId);

      if (errors.length === 0) {
        logger.debug({ sessionId }, 'No errors in session, skipping analysis');
        return;
      }

      // Count unique error types
      const uniqueErrorTypes = new Set(errors.map((e) => e.errorType)).size;

      if (uniqueErrorTypes < this.errorAnalysisConfig.minUniqueErrorTypes) {
        logger.debug(
          { sessionId, uniqueErrorTypes, threshold: this.errorAnalysisConfig.minUniqueErrorTypes },
          'Not enough unique error types for analysis'
        );
        return;
      }

      logger.debug(
        { sessionId, errorCount: errors.length, uniqueErrorTypes },
        'Starting session-end error analysis'
      );

      const analysisPromise = this.performErrorAnalysis(sessionId);
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error('Analysis timeout')),
          this.errorAnalysisConfig.analysisTimeoutMs
        )
      );

      await Promise.race([analysisPromise, timeoutPromise]);
    } catch (error) {
      // Log but don't throw - fire-and-forget pattern
      logger.warn(
        {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Session-end error analysis failed (non-blocking)'
      );
    }
  }

  /**
   * Perform comprehensive analysis on all tool outcomes (not just errors)
   */
  private async performComprehensiveOutcomeAnalysis(sessionId: string): Promise<void> {
    if (!this.toolOutcomesRepo) {
      logger.debug(
        { sessionId },
        'Tool outcomes repository not available, skipping comprehensive analysis'
      );
      return;
    }

    const outcomes = await this.toolOutcomesRepo.getBySession(sessionId);

    if (outcomes.length < 5) {
      logger.debug(
        { sessionId, outcomeCount: outcomes.length },
        'Not enough outcomes for comprehensive analysis (minimum 5)'
      );
      return;
    }

    const outcomeAnalyzer = getOutcomeAnalyzerService();
    const analysis = await outcomeAnalyzer.analyzeAllPatterns(outcomes);

    const allPatterns = [
      ...analysis.bestPractices,
      ...analysis.recoveryPatterns,
      ...analysis.toolSequences,
      ...analysis.efficiencyPatterns,
    ];

    if (allPatterns.length === 0) {
      logger.debug({ sessionId }, 'No patterns detected in comprehensive analysis');
      return;
    }

    logger.debug(
      { sessionId, patternCount: allPatterns.length, successRate: analysis.successRate },
      'Comprehensive outcome analysis complete'
    );

    for (const pattern of allPatterns) {
      if (pattern.confidence >= 0.7) {
        await this.storePatternKnowledge(pattern, sessionId);
      }
    }

    await this.toolOutcomesRepo.deleteCounter(sessionId);
  }

  /**
   * Perform LLM analysis on session errors
   */
  private async performErrorAnalysis(sessionId: string): Promise<void> {
    const errorAnalyzer = getErrorAnalyzerService();

    const result = await errorAnalyzer.analyzeSessionErrors(sessionId);

    if (!result.patterns || result.patterns.length === 0) {
      logger.debug({ sessionId }, 'No error patterns detected');
      return;
    }

    await this.storeCorrectiveEntries(result.patterns, sessionId);
  }

  /**
   * Store corrective knowledge/guideline entries from error patterns
   */
  private async storeCorrectiveEntries(patterns: ErrorPattern[], sessionId: string): Promise<void> {
    for (const pattern of patterns) {
      if (pattern.confidence < this.errorAnalysisConfig.confidenceThreshold) {
        logger.debug(
          { pattern: pattern.patternType, confidence: pattern.confidence },
          'Pattern below confidence threshold, skipping'
        );
        continue;
      }

      try {
        const entry = this.generateCorrectiveEntry(pattern);

        if (entry.type === 'knowledge' && this.knowledgeRepo) {
          await this.knowledgeRepo.create({
            scopeType: 'session',
            scopeId: sessionId,
            title: entry.title || 'Error correction knowledge',
            content: entry.content,
            category: 'context',
            source: 'error-analysis',
            confidence: pattern.confidence,
            createdBy: 'error-analyzer',
          });

          logger.debug(
            { sessionId, title: entry.title, patternType: pattern.patternType },
            'Created corrective knowledge entry'
          );
        } else if (entry.type === 'guideline' && this.guidelineRepo) {
          await this.guidelineRepo.create({
            scopeType: 'session',
            scopeId: sessionId,
            name: entry.name || 'Error correction guideline',
            content: entry.content,
            category: 'error-correction',
            priority: Math.round(pattern.confidence * 10),
            createdBy: 'error-analyzer',
          });

          logger.debug(
            { sessionId, name: entry.name, patternType: pattern.patternType },
            'Created corrective guideline entry'
          );
        }
      } catch (error) {
        logger.warn(
          {
            sessionId,
            patternType: pattern.patternType,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to store corrective entry (non-fatal)'
        );
      }
    }
  }

  /**
   * Store detected pattern as knowledge entry
   * Used by periodic analysis to persist high-confidence patterns
   */
  async storePatternKnowledge(
    pattern: {
      patternType: string;
      confidence: number;
      tools: string[];
      suggestedKnowledge: {
        title: string;
        content: string;
      };
    },
    sessionId: string
  ): Promise<void> {
    if (!this.knowledgeRepo) {
      throw new Error('Knowledge repository not available');
    }

    await this.knowledgeRepo.create({
      scopeType: 'session',
      scopeId: sessionId,
      title: pattern.suggestedKnowledge.title,
      category: 'fact',
      content: `${pattern.suggestedKnowledge.content}\n\nTools: ${pattern.tools.join(', ')}`,
      source: `pattern:${pattern.patternType}`,
      confidence: pattern.confidence,
      createdBy: 'outcome-analyzer',
    });
  }

  // ===========================================================================
  // TOOL OUTCOME RECORDING (for MCP clients like OpenCode)
  // ===========================================================================

  /**
   * Record a tool outcome to the tool_outcomes table.
   * Used by MCP clients (OpenCode) that can't execute hook scripts.
   * Performs same field derivation as PostToolUse hook.
   */
  async recordToolOutcome(params: {
    sessionId: string;
    toolName: string;
    outcome: 'success' | 'failure' | 'partial';
    inputSummary?: string;
    outputSummary?: string;
    projectId?: string;
  }): Promise<{ id: string }> {
    if (!this.toolOutcomesRepo) {
      throw new Error('Tool outcomes repository not available');
    }

    const lastOutcome = await this.toolOutcomesRepo.getLastOutcomeForSession(params.sessionId);
    const precedingToolId = lastOutcome?.id ?? undefined;

    let durationMs: number | undefined;
    if (lastOutcome) {
      const lastTime = new Date(lastOutcome.createdAt).getTime();
      const now = Date.now();
      if (now - lastTime < 300000) {
        durationMs = now - lastTime;
      }
    }

    const safeInputSummary = params.inputSummary
      ? redactSensitive(summarizeInput(params.inputSummary, 200))
      : undefined;
    const safeOutputSummary = params.outputSummary
      ? redactSensitive(summarizeOutput(params.outputSummary, 500))
      : undefined;

    const id = await this.toolOutcomesRepo.record({
      sessionId: params.sessionId,
      projectId: params.projectId || undefined,
      toolName: params.toolName,
      outcome: params.outcome,
      inputSummary: safeInputSummary,
      outputSummary: safeOutputSummary,
      toolInputHash: hashInput(params.inputSummary ?? ''),
      precedingToolId,
      durationMs,
    });

    await this.toolOutcomesRepo.incrementAndGetToolCount(params.sessionId);

    logger.debug(
      {
        sessionId: params.sessionId,
        toolName: params.toolName,
        outcome: params.outcome,
        outcomeId: id,
      },
      'Tool outcome recorded via MCP'
    );

    return { id };
  }

  // ===========================================================================
  // SESSION CLEANUP
  // ===========================================================================

  /**
   * Clean up session data when a session ends
   */
  cleanupSession(sessionId: string): void {
    this.toolFailures.delete(sessionId);
    this.errorTrackers.delete(sessionId);
    this.experienceCount.delete(sessionId);
    this.knowledgeCount.delete(sessionId);
    this.createdKnowledgeTitles.delete(sessionId);

    logger.debug({ sessionId }, 'Cleaned up session learning data');
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    toolFailureCount: number;
    errorCount: number;
    experiencesCreated: number;
  } {
    const toolTrackers = this.toolFailures.get(sessionId);
    let toolFailureCount = 0;
    if (toolTrackers) {
      for (const tracker of toolTrackers.values()) {
        toolFailureCount += tracker.failures.length;
      }
    }

    const errorTracker = this.errorTrackers.get(sessionId);
    const errorCount = errorTracker?.errors.length ?? 0;

    const experiencesCreated = this.experienceCount.get(sessionId) ?? 0;

    return { toolFailureCount, errorCount, experiencesCreated };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let instance: HookLearningService | null = null;

/**
 * Get the singleton HookLearningService instance
 */
export function getHookLearningService(): HookLearningService {
  if (!instance) {
    // Read config from environment
    const envEnabled = process.env.AGENT_MEMORY_HOOK_LEARNING_ENABLED;
    const envMinFailures = process.env.AGENT_MEMORY_HOOK_MIN_FAILURES;
    const envErrorThreshold = process.env.AGENT_MEMORY_HOOK_ERROR_THRESHOLD;
    const envAnalysisThreshold = process.env.AGENT_MEMORY_HOOK_ANALYSIS_THRESHOLD;

    const config: Partial<HookLearningConfig> = {};

    if (envEnabled !== undefined) {
      config.enabled = envEnabled !== 'false' && envEnabled !== '0';
    }
    if (envMinFailures) {
      const parsed = parseInt(envMinFailures, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        config.minFailuresForExperience = parsed;
      }
    }
    if (envErrorThreshold) {
      const parsed = parseInt(envErrorThreshold, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        config.errorPatternThreshold = parsed;
      }
    }
    if (envAnalysisThreshold) {
      const parsed = parseInt(envAnalysisThreshold, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        config.analysisThreshold = parsed;
      }
    }

    instance = new HookLearningService(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetHookLearningService(): void {
  instance = null;
}
