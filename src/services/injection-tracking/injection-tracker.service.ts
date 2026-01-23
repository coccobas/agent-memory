import { createComponentLogger } from '../../utils/logger.js';
import type {
  InjectionRecord,
  ShouldInjectOptions,
  InjectionTrackerConfig,
} from './injection-tracker.types.js';

const logger = createComponentLogger('injection-tracker');

export interface SessionStats {
  trackedGuidelines: number;
  totalTokens: number;
}

export class InjectionTrackerService {
  private records: Map<string, Map<string, InjectionRecord>> = new Map();
  private sessionTokens: Map<string, number> = new Map();

  constructor(_config: Partial<InjectionTrackerConfig> = {}) {
    void _config;
  }

  shouldInject(
    sessionId: string,
    guidelineId: string,
    currentEpisodeId: string | null,
    options: ShouldInjectOptions
  ): boolean {
    if (options.forceRefresh) {
      return true;
    }

    const record = this.getRecord(sessionId, guidelineId);
    if (!record) {
      return true;
    }

    if (currentEpisodeId !== record.episodeIdWhenInjected) {
      return true;
    }

    if (record.tokensSinceInjection >= options.tokenThreshold) {
      return true;
    }

    return false;
  }

  recordInjection(sessionId: string, guidelineId: string, episodeId: string | null): void {
    let sessionRecords = this.records.get(sessionId);
    if (!sessionRecords) {
      sessionRecords = new Map();
      this.records.set(sessionId, sessionRecords);
    }

    const record: InjectionRecord = {
      guidelineId,
      lastInjectedAt: new Date().toISOString(),
      tokensSinceInjection: 0,
      episodeIdWhenInjected: episodeId,
    };

    sessionRecords.set(guidelineId, record);

    logger.debug({ sessionId, guidelineId, episodeId }, 'Recorded guideline injection');
  }

  incrementTokens(sessionId: string, tokensUsed: number): void {
    const currentTotal = this.sessionTokens.get(sessionId) ?? 0;
    this.sessionTokens.set(sessionId, currentTotal + tokensUsed);

    const sessionRecords = this.records.get(sessionId);
    if (sessionRecords) {
      for (const record of sessionRecords.values()) {
        record.tokensSinceInjection += tokensUsed;
      }
    }

    logger.debug(
      { sessionId, tokensUsed, newTotal: currentTotal + tokensUsed },
      'Incremented session tokens'
    );
  }

  clearSession(sessionId: string): void {
    this.records.delete(sessionId);
    this.sessionTokens.delete(sessionId);

    logger.debug({ sessionId }, 'Cleared session tracking');
  }

  getSessionStats(sessionId: string): SessionStats {
    const sessionRecords = this.records.get(sessionId);
    return {
      trackedGuidelines: sessionRecords?.size ?? 0,
      totalTokens: this.sessionTokens.get(sessionId) ?? 0,
    };
  }

  filterGuidelinesForInjection<T extends { id: string }>(
    sessionId: string,
    guidelines: T[],
    currentEpisodeId: string | null,
    options: ShouldInjectOptions
  ): T[] {
    return guidelines.filter((g) => this.shouldInject(sessionId, g.id, currentEpisodeId, options));
  }

  private getRecord(sessionId: string, guidelineId: string): InjectionRecord | undefined {
    return this.records.get(sessionId)?.get(guidelineId);
  }
}

let globalTracker: InjectionTrackerService | null = null;

export function createInjectionTrackerService(
  config?: Partial<InjectionTrackerConfig>
): InjectionTrackerService {
  return new InjectionTrackerService(config);
}

export function getInjectionTrackerService(): InjectionTrackerService {
  if (!globalTracker) {
    globalTracker = createInjectionTrackerService();
  }
  return globalTracker;
}

export function resetInjectionTrackerService(): void {
  globalTracker = null;
}
