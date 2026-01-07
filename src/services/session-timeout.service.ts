/**
 * Session Timeout Service
 *
 * Tracks session activity and automatically ends inactive sessions.
 * Uses in-memory tracking to avoid schema changes.
 *
 * Features:
 * - Records activity on any session operation
 * - Periodic check for stale sessions
 * - Configurable inactivity timeout
 * - Graceful shutdown support
 */

import type { Config } from '../config/index.js';
import type { ISessionRepository } from '../core/interfaces/repositories.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('session-timeout');

// =============================================================================
// TYPES
// =============================================================================

export interface ISessionTimeoutService {
  /**
   * Record activity for a session
   */
  recordActivity(sessionId: string): void;

  /**
   * Check for and end stale sessions
   * @returns Number of sessions ended
   */
  checkAndEndStaleSessions(): Promise<number>;

  /**
   * Start the periodic timeout checker
   */
  start(): void;

  /**
   * Stop the periodic timeout checker
   */
  stop(): void;

  /**
   * Get the last activity timestamp for a session
   */
  getLastActivity(sessionId: string): number | undefined;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

export class SessionTimeoutService implements ISessionTimeoutService {
  private readonly activityMap = new Map<string, number>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private readonly inactivityMs: number;
  private readonly checkIntervalMs: number;
  private readonly enabled: boolean;

  constructor(
    config: Config,
    private readonly sessionRepo: ISessionRepository
  ) {
    this.enabled = config.autoContext.sessionTimeoutEnabled ?? true;
    this.inactivityMs = config.autoContext.sessionInactivityMs ?? 30 * 60 * 1000; // 30 min default
    this.checkIntervalMs = config.autoContext.sessionTimeoutCheckMs ?? 5 * 60 * 1000; // 5 min default
  }

  recordActivity(sessionId: string): void {
    if (!this.enabled) return;
    this.activityMap.set(sessionId, Date.now());
    logger.debug({ sessionId }, 'Recorded session activity');
  }

  async checkAndEndStaleSessions(): Promise<number> {
    if (!this.enabled) return 0;

    const now = Date.now();
    const staleThreshold = now - this.inactivityMs;
    let endedCount = 0;

    // Find stale sessions from our activity map
    const staleSessions: string[] = [];
    for (const [sessionId, lastActivity] of this.activityMap.entries()) {
      if (lastActivity < staleThreshold) {
        staleSessions.push(sessionId);
      }
    }

    // End stale sessions
    for (const sessionId of staleSessions) {
      try {
        // Verify session is still active before ending
        const session = await this.sessionRepo.getById(sessionId);
        if (session && session.status === 'active') {
          await this.sessionRepo.end(sessionId, 'completed');
          logger.info(
            { sessionId, inactiveForMs: now - (this.activityMap.get(sessionId) ?? now) },
            'Auto-ended inactive session'
          );
          endedCount++;
        }
        // Remove from tracking regardless
        this.activityMap.delete(sessionId);
      } catch (error) {
        logger.warn(
          { sessionId, error: error instanceof Error ? error.message : String(error) },
          'Failed to auto-end session'
        );
        // Remove from tracking to prevent retry spam
        this.activityMap.delete(sessionId);
      }
    }

    if (endedCount > 0) {
      logger.info({ endedCount, totalTracked: this.activityMap.size }, 'Session timeout check complete');
    }

    return endedCount;
  }

  start(): void {
    if (!this.enabled) {
      logger.debug('Session timeout disabled, not starting checker');
      return;
    }

    if (this.checkInterval) {
      logger.warn('Session timeout checker already running');
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkAndEndStaleSessions().catch((error) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Error in session timeout check'
        );
      });
    }, this.checkIntervalMs);

    // Don't block process exit
    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }

    logger.info(
      { checkIntervalMs: this.checkIntervalMs, inactivityMs: this.inactivityMs },
      'Session timeout checker started'
    );
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Session timeout checker stopped');
    }
  }

  getLastActivity(sessionId: string): number | undefined {
    return this.activityMap.get(sessionId);
  }
}

/**
 * Create a session timeout service instance
 */
export function createSessionTimeoutService(
  config: Config,
  sessionRepo: ISessionRepository
): ISessionTimeoutService {
  return new SessionTimeoutService(config, sessionRepo);
}
