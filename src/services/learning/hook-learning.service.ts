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
import type { IExperienceRepository, IKnowledgeRepository } from '../../core/interfaces/repositories.js';
import type { LibrarianService } from '../librarian/index.js';
import type { ScopeType } from '../../db/schema.js';

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
}

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
export class HookLearningService {
  private config: HookLearningConfig;
  private experienceRepo: IExperienceRepository | null = null;
  private knowledgeRepo: IKnowledgeRepository | null = null;
  private librarianService: LibrarianService | null = null;

  // Session-scoped trackers
  private toolFailures = new Map<string, Map<string, ToolFailureTracker>>(); // sessionId -> toolName -> tracker
  private errorTrackers = new Map<string, ErrorTracker>(); // sessionId -> tracker
  private experienceCount = new Map<string, number>(); // sessionId -> count
  private knowledgeCount = new Map<string, number>(); // sessionId -> count
  private createdKnowledgeTitles = new Map<string, Set<string>>(); // sessionId -> set of titles (dedup)

  constructor(config?: Partial<HookLearningConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set dependencies (for late binding)
   */
  setDependencies(deps: {
    experienceRepo?: IExperienceRepository;
    knowledgeRepo?: IKnowledgeRepository;
    librarianService?: LibrarianService;
  }): void {
    if (deps.experienceRepo) {
      this.experienceRepo = deps.experienceRepo;
    }
    if (deps.knowledgeRepo) {
      this.knowledgeRepo = deps.knowledgeRepo;
    }
    if (deps.librarianService) {
      this.librarianService = deps.librarianService;
    }
  }

  /**
   * Check if knowledge extraction is available
   */
  isKnowledgeAvailable(): boolean {
    return this.config.enabled && this.config.enableKnowledgeExtraction && this.knowledgeRepo !== null;
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
      confidence: event.success ? this.config.defaultConfidence : this.config.defaultConfidence - 0.1,
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
      logger.info({ sessionId, toolName, count: knowledgeIds.length }, 'Created knowledge from tool output');
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

    const extracted = this.extractKnowledgeFromOutput(`Subagent:${event.subagentType}`, event.findings);
    const knowledgeIds: string[] = [];

    for (const knowledge of extracted) {
      if (knowledge.confidence >= this.config.knowledgeConfidenceThreshold) {
        const created = await this.createKnowledgeEntry(
          { sessionId: event.sessionId, projectId: event.projectId, toolName: `Subagent:${event.subagentType}`, toolOutput: event.findings, timestamp: event.timestamp },
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
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Failed to create knowledge');
      return null;
    }
  }

  /**
   * Get knowledge statistics for a session
   */
  getKnowledgeStats(sessionId: string): { knowledgeCount: number } {
    return { knowledgeCount: this.knowledgeCount.get(sessionId) ?? 0 };
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
