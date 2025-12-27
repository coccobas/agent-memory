/**
 * Capture Session State Manager
 *
 * Manages state for capture operations including:
 * - Content hashing for deduplication
 * - Metrics tracking (turns, tokens, tool calls)
 * - Duplicate detection via hash set
 */

import { createHash } from 'crypto';
import type {
  CaptureSessionState,
  TurnData,
  TurnMetrics,
  ContentHash,
  CaptureConfig,
} from './types.js';

// =============================================================================
// STATE MANAGER
// =============================================================================

/**
 * Manages capture session state with deduplication support
 */
export class CaptureStateManager {
  private sessions: Map<string, CaptureSessionState> = new Map();
  private globalHashes: Map<string, ContentHash> = new Map();

  /**
   * Initialize or get a capture session
   */
  getOrCreateSession(sessionId: string, projectId?: string): CaptureSessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = this.createSessionState(sessionId, projectId);
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): CaptureSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Create initial session state
   */
  private createSessionState(sessionId: string, projectId?: string): CaptureSessionState {
    return {
      sessionId,
      projectId,
      startTime: Date.now(),
      transcript: [],
      metrics: this.createInitialMetrics(),
      contentHashes: new Set(),
      capturedIds: new Set(),
      captureCount: 0,
    };
  }

  /**
   * Create initial metrics
   */
  private createInitialMetrics(): TurnMetrics {
    return {
      turnCount: 0,
      userTurnCount: 0,
      assistantTurnCount: 0,
      totalTokens: 0,
      toolCallCount: 0,
      uniqueToolsUsed: new Set(),
      errorCount: 0,
      startTime: Date.now(),
      lastTurnTime: Date.now(),
    };
  }

  /**
   * Add a turn to the session transcript
   */
  addTurn(sessionId: string, turn: TurnData): TurnMetrics {
    const state = this.getOrCreateSession(sessionId);

    // Add to transcript
    state.transcript.push(turn);

    // Update metrics
    state.metrics.turnCount++;
    state.metrics.lastTurnTime = Date.now();

    if (turn.role === 'user') {
      state.metrics.userTurnCount++;
    } else if (turn.role === 'assistant') {
      state.metrics.assistantTurnCount++;
    }

    if (turn.tokenCount) {
      state.metrics.totalTokens += turn.tokenCount;
    }

    if (turn.toolCalls) {
      for (const call of turn.toolCalls) {
        state.metrics.toolCallCount++;
        state.metrics.uniqueToolsUsed.add(call.name);
        if (call.success === false) {
          state.metrics.errorCount++;
        }
      }
    }

    return state.metrics;
  }

  /**
   * Clear a session
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  // =============================================================================
  // DEDUPLICATION
  // =============================================================================

  /**
   * Generate a content hash for deduplication
   */
  generateContentHash(
    content: string,
    algorithm: 'sha256' | 'md5' = 'sha256'
  ): string {
    // Normalize content before hashing
    const normalized = this.normalizeContent(content);
    return createHash(algorithm).update(normalized).digest('hex');
  }

  /**
   * Normalize content for consistent hashing
   */
  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s]/g, ''); // Remove punctuation
  }

  /**
   * Check if content is a duplicate within session
   */
  isDuplicateInSession(sessionId: string, contentHash: string): boolean {
    const state = this.sessions.get(sessionId);
    if (!state) return false;
    return state.contentHashes.has(contentHash);
  }

  /**
   * Check if content is a duplicate globally
   */
  isDuplicateGlobally(contentHash: string): boolean {
    return this.globalHashes.has(contentHash);
  }

  /**
   * Check if content is a duplicate (session or global)
   */
  isDuplicate(
    contentHash: string,
    sessionId?: string,
    config?: CaptureConfig
  ): boolean {
    if (!config?.deduplication?.enabled) {
      return false;
    }

    // Check session-level duplicates
    if (sessionId && this.isDuplicateInSession(sessionId, contentHash)) {
      return true;
    }

    // Check global duplicates
    return this.isDuplicateGlobally(contentHash);
  }

  /**
   * Register a captured content hash
   */
  registerHash(
    contentHash: string,
    entryType: 'experience' | 'knowledge' | 'guideline' | 'tool',
    entryId: string,
    sessionId?: string
  ): void {
    // Register in session
    if (sessionId) {
      const state = this.sessions.get(sessionId);
      if (state) {
        state.contentHashes.add(contentHash);
        state.capturedIds.add(entryId);
      }
    }

    // Register globally
    this.globalHashes.set(contentHash, {
      hash: contentHash,
      entryType,
      entryId,
      createdAt: Date.now(),
    });
  }

  /**
   * Get hash info for a content hash
   */
  getHashInfo(contentHash: string): ContentHash | undefined {
    return this.globalHashes.get(contentHash);
  }

  /**
   * Clear old hashes (for memory management)
   */
  clearOldHashes(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;

    for (const [hash, info] of this.globalHashes) {
      if (info.createdAt < cutoff) {
        this.globalHashes.delete(hash);
        cleared++;
      }
    }

    return cleared;
  }

  // =============================================================================
  // THRESHOLD CHECKS
  // =============================================================================

  /**
   * Check if turn-based capture should be triggered
   */
  shouldTriggerTurnCapture(
    metrics: TurnMetrics,
    config: CaptureConfig,
    captureCount: number
  ): boolean {
    if (!config.turnBased.enabled) {
      return false;
    }

    // Check max captures per session
    if (captureCount >= config.turnBased.maxCapturesPerSession) {
      return false;
    }

    // Check turn threshold
    if (metrics.turnCount >= config.turnBased.triggerAfterTurns) {
      return true;
    }

    // Check token threshold
    if (metrics.totalTokens >= config.turnBased.triggerAfterTokens) {
      return true;
    }

    // Check tool error trigger
    if (config.turnBased.triggerOnToolError && metrics.errorCount > 0) {
      return true;
    }

    return false;
  }

  /**
   * Check if session-end capture should be triggered
   */
  shouldTriggerSessionEndCapture(
    metrics: TurnMetrics,
    config: CaptureConfig
  ): boolean {
    if (!config.sessionEnd.enabled) {
      return false;
    }

    // Must meet minimum turn count
    if (metrics.turnCount < config.sessionEnd.minTurns) {
      return false;
    }

    // Must meet minimum token count
    if (metrics.totalTokens < config.sessionEnd.minTokens) {
      return false;
    }

    return true;
  }

  /**
   * Record a capture event
   */
  recordCapture(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.captureCount++;
      state.lastCaptureTime = Date.now();
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let stateManagerInstance: CaptureStateManager | null = null;

/**
 * Get the singleton state manager instance
 * @deprecated Use context.services.captureState instead via dependency injection
 */
export function getCaptureStateManager(): CaptureStateManager {
  if (!stateManagerInstance) {
    stateManagerInstance = new CaptureStateManager();
  }
  return stateManagerInstance;
}

/**
 * Reset the state manager (for testing)
 */
export function resetCaptureStateManager(): void {
  stateManagerInstance = null;
}
