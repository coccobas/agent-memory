/**
 * Session Timeout Service
 *
 * Tracks session activity and automatically ends inactive sessions.
 * Uses hybrid in-memory + DB-based tracking for resilience across restarts.
 *
 * Features:
 * - Records activity on any session operation (in-memory + persisted to metadata)
 * - Periodic check for stale sessions using DB fallback
 * - Configurable inactivity timeout
 * - Graceful shutdown support
 * - **Triggers capture pipeline before ending sessions**
 * - **DB-based staleness check catches orphaned sessions after server restart**
 */

import type { Config } from '../config/index.js';
import type { ISessionRepository } from '../core/interfaces/repositories.js';
import { createComponentLogger } from '../utils/logger.js';
import type { CaptureService } from './capture/index.js';

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

  /**
   * Set the capture service for triggering capture on session timeout.
   * Call this after construction if CaptureService wasn't available initially.
   */
  setCaptureService(captureService: CaptureService): void;
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
  // Bug #283/#217 fix: Cap the number of tracked sessions to prevent unbounded memory growth
  private static readonly MAX_TRACKED_SESSIONS = 10000;
  private captureService?: CaptureService;

  constructor(
    config: Config,
    private readonly sessionRepo: ISessionRepository
  ) {
    this.enabled = config.autoContext.sessionTimeoutEnabled ?? true;
    this.inactivityMs = config.autoContext.sessionInactivityMs ?? 30 * 60 * 1000; // 30 min default
    this.checkIntervalMs = config.autoContext.sessionTimeoutCheckMs ?? 5 * 60 * 1000; // 5 min default
  }

  /**
   * Set the capture service for triggering capture on session timeout.
   */
  setCaptureService(captureService: CaptureService): void {
    this.captureService = captureService;
    logger.debug('Capture service set for session timeout');
  }

  recordActivity(sessionId: string): void {
    if (!this.enabled) return;

    // Bug #283/#217 fix: Enforce max tracked sessions to prevent unbounded growth
    // If at capacity and this is a new session, evict the oldest entry first
    if (
      !this.activityMap.has(sessionId) &&
      this.activityMap.size >= SessionTimeoutService.MAX_TRACKED_SESSIONS
    ) {
      // Find and remove the oldest entry (first inserted due to Map ordering)
      const oldestKey = this.activityMap.keys().next().value;
      if (oldestKey) {
        this.activityMap.delete(oldestKey);
        logger.debug({ evictedSessionId: oldestKey }, 'Evicted oldest session from activity map');
      }
    }

    const now = Date.now();
    this.activityMap.set(sessionId, now);

    // Persist to DB metadata for resilience across restarts (debounced)
    this.persistActivityToDb(sessionId, now);

    logger.debug({ sessionId }, 'Recorded session activity');
  }

  private persistActivityDebounce = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly PERSIST_DEBOUNCE_MS = 30000; // Persist at most every 30s per session

  private persistActivityToDb(sessionId: string, timestamp: number): void {
    // Debounce DB writes to avoid excessive updates
    const existing = this.persistActivityDebounce.get(sessionId);
    if (existing) return;

    const timeout = setTimeout(() => {
      this.persistActivityDebounce.delete(sessionId);
      this.sessionRepo
        .update(sessionId, {
          metadata: { lastActivityAt: new Date(timestamp).toISOString() },
        })
        .then(() => {
          logger.debug({ sessionId }, 'Persisted activity timestamp to DB');
        })
        .catch((error: unknown) => {
          logger.debug(
            { sessionId, error: error instanceof Error ? error.message : String(error) },
            'Failed to persist activity to DB (non-fatal)'
          );
        });
    }, SessionTimeoutService.PERSIST_DEBOUNCE_MS);

    // Don't block process exit
    if (timeout.unref) timeout.unref();
    this.persistActivityDebounce.set(sessionId, timeout);
  }

  private async findOrphanedStaleSessions(staleThreshold: number): Promise<string[]> {
    const orphanedStale: string[] = [];

    try {
      const activeSessions = await this.sessionRepo.list({ status: 'active' }, { limit: 100 });

      for (const session of activeSessions) {
        if (this.activityMap.has(session.id)) continue;

        const lastActivityAt = this.getLastActivityFromSession(session);
        if (lastActivityAt < staleThreshold) {
          orphanedStale.push(session.id);
          logger.debug(
            { sessionId: session.id, lastActivityAt: new Date(lastActivityAt).toISOString() },
            'Found orphaned stale session via DB fallback'
          );
        }
      }
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to query DB for orphaned sessions (non-fatal)'
      );
    }

    return orphanedStale;
  }

  private getLastActivityFromSession(session: {
    startedAt: string;
    metadata?: Record<string, unknown> | null;
  }): number {
    const metadataActivity = session.metadata?.lastActivityAt;
    if (typeof metadataActivity === 'string') {
      const parsed = new Date(metadataActivity).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    return new Date(session.startedAt).getTime();
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

    const dbStaleSessions = await this.findOrphanedStaleSessions(staleThreshold);
    for (const sessionId of dbStaleSessions) {
      if (!staleSessions.includes(sessionId)) {
        staleSessions.push(sessionId);
      }
    }

    // End stale sessions
    for (const sessionId of staleSessions) {
      try {
        // Verify session is still active before ending
        const session = await this.sessionRepo.getById(sessionId);
        if (session && session.status === 'active') {
          // Trigger capture before ending (non-blocking, but we await it for orderly shutdown)
          if (this.captureService) {
            try {
              const captureResult = await this.captureService.onSessionEnd(sessionId, {
                projectId: session.projectId ?? undefined,
                scopeType: session.projectId ? 'project' : 'session',
                scopeId: session.projectId ?? sessionId,
                autoStore: true,
                skipDuplicates: true,
              });

              const hasCaptures =
                captureResult.experiences.experiences.length > 0 ||
                captureResult.knowledge.knowledge.length > 0;

              if (hasCaptures) {
                logger.info(
                  {
                    sessionId,
                    experiences: captureResult.experiences.experiences.length,
                    knowledge: captureResult.knowledge.knowledge.length,
                    guidelines: captureResult.knowledge.guidelines.length,
                  },
                  'Captured experiences before timeout session end'
                );
              }
            } catch (captureError) {
              // Non-fatal: log and continue with session end
              logger.warn(
                {
                  sessionId,
                  error:
                    captureError instanceof Error ? captureError.message : String(captureError),
                },
                'Capture failed before timeout session end (non-fatal)'
              );
            }
          }

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
      logger.info(
        { endedCount, totalTracked: this.activityMap.size },
        'Session timeout check complete'
      );
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
    }

    for (const timeout of this.persistActivityDebounce.values()) {
      clearTimeout(timeout);
    }
    this.persistActivityDebounce.clear();

    logger.info('Session timeout checker stopped');
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
