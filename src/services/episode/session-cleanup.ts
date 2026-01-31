import type { IEpisodeRepository } from '../../core/interfaces/repositories.js';
import type { IUnifiedMessageSource } from '../unified-message-source.js';
import type { EpisodeService } from './index.js';
import type { CaptureService } from '../capture/index.js';
import {
  createOutcomeInferenceService,
  type OutcomeInferenceService,
} from '../capture/outcome-inference.js';
import type { TurnData } from '../capture/types.js';
import { config } from '../../config/index.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('episode-session-cleanup');

export interface SessionEpisodeCleanupDeps {
  episodeRepo: IEpisodeRepository;
  episodeService?: EpisodeService;
  captureService?: CaptureService;
  unifiedMessageSource?: IUnifiedMessageSource;
  outcomeInference?: OutcomeInferenceService;
}

export interface SessionEpisodeCleanupResult {
  episodeId: string | null;
  action: 'completed' | 'failed' | 'cancelled' | 'none';
  outcome?: string;
  outcomeType?: 'success' | 'partial' | 'failure' | 'abandoned';
  confidence?: number;
}

/**
 * Creates a session episode cleanup service.
 *
 * This service handles completing active episodes when their session ends,
 * using transcript analysis to infer the outcome.
 */
export function createSessionEpisodeCleanup(deps: SessionEpisodeCleanupDeps) {
  const { episodeRepo, episodeService, captureService, unifiedMessageSource } = deps;

  const outcomeInference =
    deps.outcomeInference ??
    createOutcomeInferenceService({
      provider: config.extraction.provider === 'disabled' ? 'none' : config.extraction.provider,
      confidenceThreshold: 0.6,
    });

  /**
   * Get transcript data for a session.
   */
  async function getSessionTranscript(sessionId: string): Promise<TurnData[]> {
    if (!unifiedMessageSource) {
      return [];
    }

    try {
      const { messages } = await unifiedMessageSource.getMessagesForSession(sessionId, {
        limit: 20,
      });

      return messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
        toolCalls: m.toolsUsed?.map((t) => ({ name: t, input: {}, success: true })),
      }));
    } catch (error) {
      logger.warn(
        { sessionId, error: error instanceof Error ? error.message : String(error) },
        'Failed to retrieve session transcript for outcome inference'
      );
      return [];
    }
  }

  async function triggerEpisodeCapture(
    episode: {
      id: string;
      name: string;
      description?: string | null;
      outcome?: string | null;
      outcomeType?: string | null;
      durationMs?: number | null;
      scopeType?: string;
      scopeId?: string | null;
      sessionId?: string | null;
      startedAt?: string | null;
      endedAt?: string | null;
      events?: Array<{
        eventType: string;
        name: string;
        description?: string | null;
        data?: string | null;
        occurredAt: string;
      }>;
    },
    sessionId: string
  ): Promise<void> {
    if (!captureService || !unifiedMessageSource) {
      return;
    }

    try {
      const { messages } = await unifiedMessageSource.getMessagesForEpisode(episode.id, {
        sessionId,
        startedAt: episode.startedAt ?? undefined,
        endedAt: episode.endedAt ?? undefined,
      });

      const formattedMessages = messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.timestamp,
      }));

      captureService
        .onEpisodeComplete({
          id: episode.id,
          name: episode.name,
          description: episode.description,
          outcome: episode.outcome,
          outcomeType: episode.outcomeType,
          durationMs: episode.durationMs,
          scopeType: episode.scopeType,
          scopeId: episode.scopeId,
          sessionId: episode.sessionId,
          events: episode.events,
          messages: formattedMessages,
        })
        .then((result) => {
          if (result.experiences.length > 0) {
            logger.info(
              { episodeId: episode.id, experienceCount: result.experiences.length },
              'Captured experiences from episode on session end'
            );
          }
        })
        .catch((error) => {
          logger.warn(
            {
              episodeId: episode.id,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to capture experiences from episode (non-fatal)'
          );
        });
    } catch (error) {
      logger.warn(
        { episodeId: episode.id, error: error instanceof Error ? error.message : String(error) },
        'Failed to get messages for episode capture (non-fatal)'
      );
    }
  }

  async function completeSessionEpisode(
    sessionId: string,
    reason: string
  ): Promise<SessionEpisodeCleanupResult> {
    const activeEpisode = await episodeRepo.getActiveEpisode(sessionId);

    if (!activeEpisode) {
      logger.debug({ sessionId }, 'No active episode to complete');
      return { episodeId: null, action: 'none' };
    }

    const transcript = await getSessionTranscript(sessionId);
    const inferred = await outcomeInference.inferOutcome(transcript);

    logger.debug(
      {
        episodeId: activeEpisode.id,
        sessionId,
        inferredOutcome: inferred.outcomeType,
        confidence: inferred.confidence,
        method: inferred.method,
      },
      'Inferred episode outcome from transcript'
    );

    const outcomeMap: Record<string, 'success' | 'partial' | 'failure' | 'abandoned'> = {
      success: 'success',
      partial: 'partial',
      failure: 'failure',
      unknown: 'abandoned',
    };

    if (inferred.confidence >= 0.5 && inferred.outcomeType !== 'unknown') {
      const mappedOutcome = outcomeMap[inferred.outcomeType] ?? 'abandoned';

      if (mappedOutcome === 'success' || mappedOutcome === 'partial') {
        const completedEpisode = episodeService
          ? await episodeService.complete(activeEpisode.id, inferred.reasoning, mappedOutcome)
          : await episodeRepo.complete(activeEpisode.id, inferred.reasoning, mappedOutcome);

        await triggerEpisodeCapture(completedEpisode, sessionId);

        logger.info(
          {
            episodeId: activeEpisode.id,
            outcome: mappedOutcome,
            confidence: inferred.confidence,
            reason,
            usedService: !!episodeService,
          },
          'Completed episode based on inferred outcome'
        );
        return {
          episodeId: activeEpisode.id,
          action: 'completed',
          outcome: inferred.reasoning,
          outcomeType: mappedOutcome,
          confidence: inferred.confidence,
        };
      } else {
        const failedEpisode = episodeService
          ? await episodeService.fail(activeEpisode.id, inferred.reasoning)
          : await episodeRepo.fail(activeEpisode.id, inferred.reasoning);

        await triggerEpisodeCapture(failedEpisode, sessionId);

        logger.info(
          {
            episodeId: activeEpisode.id,
            outcome: 'failure',
            confidence: inferred.confidence,
            reason,
            usedService: !!episodeService,
          },
          'Failed episode based on inferred outcome'
        );
        return {
          episodeId: activeEpisode.id,
          action: 'failed',
          outcome: inferred.reasoning,
          outcomeType: 'failure',
          confidence: inferred.confidence,
        };
      }
    } else {
      if (episodeService) {
        await episodeService.cancel(
          activeEpisode.id,
          `Session ended: ${reason} (outcome uncertain)`
        );
      } else {
        await episodeRepo.cancel(activeEpisode.id, `Session ended: ${reason} (outcome uncertain)`);
      }
      logger.debug(
        { episodeId: activeEpisode.id, sessionId, reason },
        'Cancelled episode (outcome could not be inferred)'
      );
      return {
        episodeId: activeEpisode.id,
        action: 'cancelled',
        outcome: `Session ended: ${reason} (outcome uncertain)`,
        outcomeType: 'abandoned',
      };
    }
  }

  return {
    completeSessionEpisode,
    getSessionTranscript,
  };
}

export type SessionEpisodeCleanupService = ReturnType<typeof createSessionEpisodeCleanup>;
