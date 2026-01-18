/**
 * Behavior Observer Service
 *
 * Observes tool use events and detects behavior patterns for automatic
 * experience capture. Part of Trigger 5: Hook-Based Behavior Observation.
 *
 * Stages:
 * A. Pre-ToolUse Hook - Captures tool use events with metadata (real-time)
 * B. Session-End Hook - Analyzes sequences and detects patterns (retrospective)
 *
 * Key Patterns Detected:
 * 1. Stale Code Pattern: Test → fails → discover code not deployed → rebuild → works
 * 2. Config Discovery: Operation fails → investigate → find config issue → fix → works
 * 3. Dependency Chain: Action A fails → discover needs B first → do B → A works
 * 4. Retry Variants: Approach A fails → try approach B → works
 */

import { createComponentLogger } from '../../utils/logger.js';
import type {
  ToolUseEvent,
  BehaviorPatternType,
  DetectedBehaviorPattern,
  BehaviorAnalysisResult,
  BehaviorObservationConfig,
} from './types.js';

const logger = createComponentLogger('behavior-observer');

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: BehaviorObservationConfig = {
  enabled: true,
  minToolSequenceLength: 3,
  behaviorConfidence: 0.75,
  maxEventsPerSession: 100,
  eventExpiryMs: 3600000, // 1 hour
};

// =============================================================================
// PATTERN DETECTORS
// =============================================================================

/**
 * Pattern detector function signature
 */
type PatternDetector = (events: ToolUseEvent[]) => DetectedBehaviorPattern | null;

/**
 * Detect "stale code" pattern:
 * Test/verify → fails unexpectedly → discover code not deployed → rebuild/restart → works
 *
 * Signals:
 * - Test or verification command (npm test, jest, curl, etc.)
 * - Followed by error or unexpected result
 * - Then build/rebuild command (npm run build, tsc, make)
 * - Then same test/verify → success
 */
function detectStaleCodePattern(events: ToolUseEvent[]): DetectedBehaviorPattern | null {
  if (events.length < 4) return null;

  const testCommands = [
    'npm test',
    'npm run test',
    'jest',
    'vitest',
    'mocha',
    'pytest',
    'go test',
    'cargo test',
    'curl',
    'http',
    'fetch',
  ];

  const buildCommands = [
    'npm run build',
    'npm build',
    'tsc',
    'make',
    'cargo build',
    'go build',
    'webpack',
    'vite build',
    'esbuild',
    'rollup',
  ];

  const restartCommands = ['npm start', 'npm run dev', 'restart', 'reload', 'kill', 'pm2'];

  // Look for: test → (something) → build/restart → test
  for (let i = 0; i < events.length - 3; i++) {
    const e1 = events[i]!;
    if (e1.toolName !== 'Bash') continue;

    const cmd1 = extractBashCommand(e1.toolInput);
    const isTest1 = testCommands.some((tc) => cmd1.includes(tc));
    if (!isTest1) continue;

    // Look for build/restart after this
    for (let j = i + 1; j < events.length - 1; j++) {
      const eBuild = events[j]!;
      if (eBuild.toolName !== 'Bash') continue;

      const cmdBuild = extractBashCommand(eBuild.toolInput);
      const isBuild = buildCommands.some((bc) => cmdBuild.includes(bc));
      const isRestart = restartCommands.some((rc) => cmdBuild.includes(rc));
      if (!isBuild && !isRestart) continue;

      // Look for test after build/restart
      for (let k = j + 1; k < events.length; k++) {
        const e2 = events[k]!;
        if (e2.toolName !== 'Bash') continue;

        const cmd2 = extractBashCommand(e2.toolInput);
        const isTest2 = testCommands.some((tc) => cmd2.includes(tc));
        if (!isTest2) continue;

        // Check if second test succeeded (if we have that info)
        // For now, assume pattern if we see the sequence
        return {
          type: 'stale_code',
          confidence: 0.85,
          title: 'Rebuild services after code changes',
          scenario: `Tested/verified feature, then rebuilt/restarted after discovering stale code`,
          outcome: 'Always rebuild and restart services after code changes before testing',
          eventIndices: [i, j, k],
          applicability: 'When testing features after making code changes',
          contraindications: 'Not needed for pure configuration changes',
        };
      }
    }
  }

  return null;
}

/**
 * Detect "config discovery" pattern:
 * Operation fails → investigate (read files) → find config issue → fix config → works
 */
function detectConfigDiscoveryPattern(events: ToolUseEvent[]): DetectedBehaviorPattern | null {
  if (events.length < 3) return null;

  const configFiles = [
    '.env',
    'config',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    'settings',
    'tsconfig',
    'package.json',
  ];

  // Look for: Read config file → Edit config file
  for (let i = 0; i < events.length - 1; i++) {
    const readEvent = events[i]!;
    if (readEvent.toolName !== 'Read') continue;

    const readPath = (readEvent.toolInput.file_path as string) ?? '';
    const isConfigRead = configFiles.some((cf) => readPath.toLowerCase().includes(cf));
    if (!isConfigRead) continue;

    // Look for Edit of same or similar file
    for (let j = i + 1; j < events.length; j++) {
      const editEvent = events[j]!;
      if (editEvent.toolName !== 'Edit' && editEvent.toolName !== 'Write') continue;

      const editPath = (editEvent.toolInput.file_path as string) ?? '';
      const isConfigEdit = configFiles.some((cf) => editPath.toLowerCase().includes(cf));
      if (!isConfigEdit) continue;

      // Found pattern: read config → edit config
      const configType = extractConfigType(readPath) || extractConfigType(editPath) || 'config';

      return {
        type: 'config_discovery',
        confidence: 0.8,
        title: `Check ${configType} when issues occur`,
        scenario: `Investigated ${configType} file and found configuration issue`,
        outcome: `Configuration in ${configType} was the root cause`,
        eventIndices: [i, j],
        applicability: `When encountering issues that might be config-related`,
      };
    }
  }

  return null;
}

/**
 * Detect "dependency chain" pattern:
 * Action A fails → investigate → discover needs B first → do B → A works
 */
function detectDependencyChainPattern(events: ToolUseEvent[]): DetectedBehaviorPattern | null {
  if (events.length < 3) return null;

  // Look for repeated Bash commands with the same base command
  const bashEvents = events.filter((e) => e.toolName === 'Bash');
  if (bashEvents.length < 2) return null;

  // Check for same command appearing twice (possibly with different args)
  for (let i = 0; i < bashEvents.length - 1; i++) {
    const bashEvent1 = bashEvents[i];
    if (!bashEvent1) continue;

    const cmd1 = extractBashCommand(bashEvent1.toolInput);
    const baseCmd1 = cmd1.split(' ')[0] ?? '';

    for (let j = i + 1; j < bashEvents.length; j++) {
      const bashEvent2 = bashEvents[j];
      if (!bashEvent2) continue;

      const cmd2 = extractBashCommand(bashEvent2.toolInput);
      const baseCmd2 = cmd2.split(' ')[0] ?? '';

      // Same base command, different full command or repeated
      if (baseCmd1 === baseCmd2 && cmd1 !== cmd2) {
        // Look for intermediate actions between them
        const intermediateCount = j - i - 1;
        if (intermediateCount >= 1) {
          // Get indices in original array
          const idx1 = events.indexOf(bashEvent1);
          const idx2 = events.indexOf(bashEvent2);

          return {
            type: 'dependency_chain',
            confidence: 0.75,
            title: `Run prerequisites before ${baseCmd1}`,
            scenario: `${baseCmd1} command required prerequisite steps`,
            outcome: `Discovered dependency: need to complete intermediate steps first`,
            eventIndices: [idx1, idx2],
            applicability: `Before running ${baseCmd1} commands`,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Detect "retry variant" pattern:
 * Approach A fails → try approach B → works
 */
function detectRetryVariantPattern(events: ToolUseEvent[]): DetectedBehaviorPattern | null {
  if (events.length < 3) return null;

  // Look for same tool type used multiple times on same target
  const editEvents = events.filter((e) => e.toolName === 'Edit');

  // Multiple edits to same file with different content
  const fileEdits = new Map<string, ToolUseEvent[]>();
  for (const e of editEvents) {
    const path = (e.toolInput.file_path as string) ?? '';
    if (!path) continue;
    const existing = fileEdits.get(path) ?? [];
    existing.push(e);
    fileEdits.set(path, existing);
  }

  for (const [path, edits] of fileEdits) {
    if (edits.length >= 2) {
      const firstEdit = edits[0];
      const lastEdit = edits[edits.length - 1];
      if (!firstEdit || !lastEdit) continue;

      const idx1 = events.indexOf(firstEdit);
      const idx2 = events.indexOf(lastEdit);
      const filename = path.split('/').pop() ?? path;

      return {
        type: 'retry_variant',
        confidence: 0.7,
        title: `Alternative approach for ${filename}`,
        scenario: `Tried multiple approaches to modify ${filename}`,
        outcome: `Iterated on solution until finding the right approach`,
        eventIndices: [idx1, idx2],
        applicability: `When modifying ${filename} or similar files`,
      };
    }
  }

  return null;
}

/**
 * Detect "build then test" pattern:
 * Build command followed by test command
 */
function detectBuildThenTestPattern(events: ToolUseEvent[]): DetectedBehaviorPattern | null {
  if (events.length < 2) return null;

  const buildCommands = ['npm run build', 'tsc', 'make', 'cargo build', 'go build'];
  const testCommands = ['npm test', 'npm run test', 'jest', 'vitest', 'pytest', 'go test'];

  for (let i = 0; i < events.length - 1; i++) {
    const e1 = events[i]!;
    if (e1.toolName !== 'Bash') continue;

    const cmd1 = extractBashCommand(e1.toolInput);
    const isBuild = buildCommands.some((bc) => cmd1.includes(bc));
    if (!isBuild) continue;

    // Look for test in next few events
    for (let j = i + 1; j < Math.min(i + 3, events.length); j++) {
      const e2 = events[j]!;
      if (e2.toolName !== 'Bash') continue;

      const cmd2 = extractBashCommand(e2.toolInput);
      const isTest = testCommands.some((tc) => cmd2.includes(tc));
      if (isTest) {
        return {
          type: 'build_then_test',
          confidence: 0.85,
          title: 'Remember to build before testing',
          scenario: 'Ran build followed by test commands',
          outcome: 'Build step is required before running tests',
          eventIndices: [i, j],
          applicability: 'After making code changes',
        };
      }
    }
  }

  return null;
}

/**
 * Detect "investigation success" pattern:
 * Error → read files/search → find cause → fix
 */
function detectInvestigationSuccessPattern(events: ToolUseEvent[]): DetectedBehaviorPattern | null {
  if (events.length < 3) return null;

  // Look for Read/Grep followed by Edit
  let hasInvestigation = false;
  let investigationIndex = -1;

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.toolName === 'Read' || e.toolName === 'Grep' || e.toolName === 'Glob') {
      hasInvestigation = true;
      investigationIndex = i;
    }

    if (hasInvestigation && (e.toolName === 'Edit' || e.toolName === 'Write')) {
      const editPath = (e.toolInput.file_path as string) ?? '';
      const filename = editPath.split('/').pop() ?? 'file';

      return {
        type: 'investigation_success',
        confidence: 0.75,
        title: `Investigation led to fix in ${filename}`,
        scenario: 'Searched/read code to understand issue, then applied fix',
        outcome: 'Systematic investigation revealed the solution',
        eventIndices: [investigationIndex, i],
        applicability: 'When debugging unknown issues',
      };
    }
  }

  return null;
}

/**
 * Detect "iterative fix" pattern:
 * Multiple Edit attempts on same or related files
 */
function detectIterativeFixPattern(events: ToolUseEvent[]): DetectedBehaviorPattern | null {
  if (events.length < 4) return null;

  const editEvents = events.filter((e) => e.toolName === 'Edit');
  if (editEvents.length < 3) return null;

  // Check if there's a cluster of edits (3+ in sequence)
  let consecutiveEdits = 0;
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.toolName === 'Edit') {
      if (startIdx === -1) startIdx = i;
      consecutiveEdits++;
      endIdx = i;
    } else if (e.toolName !== 'Read') {
      // Allow Read between edits, but reset on other tools
      if (consecutiveEdits >= 3) break;
      consecutiveEdits = 0;
      startIdx = -1;
    }
  }

  if (consecutiveEdits >= 3 && startIdx !== -1 && endIdx !== -1) {
    return {
      type: 'iterative_fix',
      confidence: 0.7,
      title: 'Iterative refinement to solve issue',
      scenario: 'Made multiple edits to arrive at the solution',
      outcome: 'Solution required iterative refinement',
      eventIndices: [startIdx, endIdx],
      applicability: 'Complex issues may require multiple attempts',
    };
  }

  return null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract bash command from tool input
 */
function extractBashCommand(input: Record<string, unknown>): string {
  return ((input.command as string) ?? '').toLowerCase();
}

/**
 * Extract config type from file path
 */
function extractConfigType(path: string): string | null {
  const lowerPath = path.toLowerCase();
  if (lowerPath.includes('.env')) return 'environment';
  if (lowerPath.includes('tsconfig')) return 'TypeScript config';
  if (lowerPath.includes('package.json')) return 'package.json';
  if (lowerPath.includes('.yaml') || lowerPath.includes('.yml')) return 'YAML config';
  if (lowerPath.includes('.json')) return 'JSON config';
  if (lowerPath.includes('.toml')) return 'TOML config';
  return null;
}

// =============================================================================
// BEHAVIOR OBSERVER SERVICE
// =============================================================================

/**
 * Behavior Observer Service
 *
 * Stores tool use events and analyzes them for behavior patterns.
 */
export class BehaviorObserverService {
  private config: BehaviorObservationConfig;
  private eventsBySession: Map<string, ToolUseEvent[]> = new Map();
  private sequenceCounters: Map<string, number> = new Map();
  private patternDetectors: PatternDetector[];

  constructor(config?: Partial<BehaviorObservationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patternDetectors = [
      detectStaleCodePattern,
      detectConfigDiscoveryPattern,
      detectDependencyChainPattern,
      detectRetryVariantPattern,
      detectBuildThenTestPattern,
      detectInvestigationSuccessPattern,
      detectIterativeFixPattern,
    ];
  }

  /**
   * Get current configuration
   */
  getConfig(): BehaviorObservationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BehaviorObservationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Record a tool use event (called from pre-tooluse hook)
   */
  recordEvent(
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    options?: {
      projectId?: string;
      agentId?: string;
    }
  ): ToolUseEvent | null {
    if (!this.config.enabled) {
      return null;
    }

    // Get or create event list for session
    let events = this.eventsBySession.get(sessionId);
    if (!events) {
      events = [];
      this.eventsBySession.set(sessionId, events);
    }

    // Check max events limit
    if (events.length >= this.config.maxEventsPerSession) {
      // Remove oldest event
      events.shift();
    }

    // Get and increment sequence counter
    const seqNum = (this.sequenceCounters.get(sessionId) ?? 0) + 1;
    this.sequenceCounters.set(sessionId, seqNum);

    const event: ToolUseEvent = {
      toolName,
      toolInput,
      timestamp: new Date().toISOString(),
      sessionId,
      projectId: options?.projectId,
      agentId: options?.agentId,
      sequenceNumber: seqNum,
    };

    events.push(event);

    logger.debug(
      {
        sessionId,
        toolName,
        sequenceNumber: seqNum,
        totalEvents: events.length,
      },
      'Tool use event recorded'
    );

    return event;
  }

  /**
   * Get all events for a session
   */
  getSessionEvents(sessionId: string): ToolUseEvent[] {
    return this.eventsBySession.get(sessionId) ?? [];
  }

  /**
   * Analyze tool sequence for behavior patterns (called from session-end hook)
   */
  analyzeSession(sessionId: string): BehaviorAnalysisResult {
    const startTime = Date.now();
    const events = this.eventsBySession.get(sessionId) ?? [];

    if (events.length < this.config.minToolSequenceLength) {
      logger.debug(
        {
          sessionId,
          eventCount: events.length,
          minRequired: this.config.minToolSequenceLength,
        },
        'Insufficient events for behavior analysis'
      );

      return {
        patterns: [],
        eventsAnalyzed: events.length,
        processingTimeMs: Date.now() - startTime,
        sessionId,
      };
    }

    const patterns: DetectedBehaviorPattern[] = [];

    // Run all pattern detectors
    for (const detector of this.patternDetectors) {
      try {
        const pattern = detector(events);
        if (pattern && pattern.confidence >= this.config.behaviorConfidence) {
          patterns.push(pattern);
        }
      } catch (error) {
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          },
          'Pattern detector failed (non-fatal)'
        );
      }
    }

    // Deduplicate patterns by type (keep highest confidence)
    const patternsByType = new Map<BehaviorPatternType, DetectedBehaviorPattern>();
    for (const pattern of patterns) {
      const existing = patternsByType.get(pattern.type);
      if (!existing || pattern.confidence > existing.confidence) {
        patternsByType.set(pattern.type, pattern);
      }
    }

    const uniquePatterns = Array.from(patternsByType.values());

    logger.info(
      {
        sessionId,
        eventsAnalyzed: events.length,
        patternsDetected: uniquePatterns.length,
        patternTypes: uniquePatterns.map((p) => p.type),
        processingTimeMs: Date.now() - startTime,
      },
      'Behavior analysis completed'
    );

    return {
      patterns: uniquePatterns,
      eventsAnalyzed: events.length,
      processingTimeMs: Date.now() - startTime,
      sessionId,
    };
  }

  /**
   * Clear session data (called after processing or on cleanup)
   */
  clearSession(sessionId: string): void {
    this.eventsBySession.delete(sessionId);
    this.sequenceCounters.delete(sessionId);
    logger.debug({ sessionId }, 'Session data cleared from behavior observer');
  }

  /**
   * Clear expired sessions (for memory management)
   */
  clearExpiredSessions(): number {
    const now = Date.now();
    const expiryMs = this.config.eventExpiryMs;
    let cleared = 0;

    for (const [sessionId, events] of this.eventsBySession) {
      if (events.length === 0) {
        this.clearSession(sessionId);
        cleared++;
        continue;
      }

      // Check if latest event is expired
      const latestEvent = events[events.length - 1];
      if (!latestEvent) {
        this.clearSession(sessionId);
        cleared++;
        continue;
      }

      const eventTime = new Date(latestEvent.timestamp).getTime();
      if (now - eventTime > expiryMs) {
        this.clearSession(sessionId);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.debug({ clearedSessions: cleared }, 'Cleared expired behavior observer sessions');
    }

    return cleared;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.eventsBySession.size;
  }

  /**
   * Get total event count across all sessions
   */
  getTotalEventCount(): number {
    let total = 0;
    for (const events of this.eventsBySession.values()) {
      total += events.length;
    }
    return total;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let instance: BehaviorObserverService | null = null;

/**
 * Get the singleton BehaviorObserverService instance
 */
export function getBehaviorObserverService(): BehaviorObserverService {
  if (!instance) {
    // Read config from environment
    const envEnabled = process.env.AGENT_MEMORY_BEHAVIOR_OBSERVATION_ENABLED;
    const envMinSequence = process.env.AGENT_MEMORY_BEHAVIOR_MIN_SEQUENCE;
    const envConfidence = process.env.AGENT_MEMORY_BEHAVIOR_CONFIDENCE;
    const envMaxEvents = process.env.AGENT_MEMORY_BEHAVIOR_MAX_EVENTS;

    const config: Partial<BehaviorObservationConfig> = {};

    if (envEnabled !== undefined) {
      config.enabled = envEnabled !== 'false' && envEnabled !== '0';
    }
    if (envMinSequence) {
      const parsed = parseInt(envMinSequence, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        config.minToolSequenceLength = parsed;
      }
    }
    if (envConfidence) {
      const parsed = parseFloat(envConfidence);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
        config.behaviorConfidence = parsed;
      }
    }
    if (envMaxEvents) {
      const parsed = parseInt(envMaxEvents, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        config.maxEventsPerSession = parsed;
      }
    }

    instance = new BehaviorObserverService(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetBehaviorObserverService(): void {
  instance = null;
}
