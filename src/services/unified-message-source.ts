import type {
  IIDETranscriptRepository,
  IConversationRepository,
  TranscriptMessage,
} from '../core/interfaces/repositories.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('unified-message-source');

export type MessageSource = 'transcript' | 'conversation';

export interface UnifiedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'agent';
  content: string;
  timestamp: string;
  toolsUsed: string[] | null;
  metadata: Record<string, unknown> | null;
  episodeId: string | null;
  relevanceScore: number | null;
  relevanceCategory: 'high' | 'medium' | 'low' | null;
  source: MessageSource;
}

export interface GetMessagesOptions {
  limit?: number;
  offset?: number;
  after?: string;
  before?: string;
}

export interface GetMessagesForEpisodeOptions {
  limit?: number;
  offset?: number;
  /** Fallback: session ID for time-range query when episode_id not linked */
  sessionId?: string;
  /** Fallback: episode start time (ISO string) */
  startedAt?: string;
  /** Fallback: episode end time (ISO string), defaults to now if not provided */
  endedAt?: string | null;
}

export interface LinkMessagesToEpisodeParams {
  episodeId: string;
  sessionId: string;
  startTime: string;
  endTime: string;
}

export interface IUnifiedMessageSource {
  getMessagesForSession(
    sessionId: string,
    options?: GetMessagesOptions
  ): Promise<{ messages: UnifiedMessage[]; source: MessageSource }>;

  getMessagesForEpisode(
    episodeId: string,
    options?: GetMessagesForEpisodeOptions
  ): Promise<{ messages: UnifiedMessage[]; source: MessageSource }>;

  getMessagesInTimeRange(
    sessionId: string,
    startTime: string,
    endTime: string
  ): Promise<{ messages: UnifiedMessage[]; source: MessageSource }>;

  linkMessagesToEpisode(params: LinkMessagesToEpisodeParams): Promise<{
    linked: number;
    source: MessageSource;
  }>;

  hasTranscriptForSession(sessionId: string): Promise<boolean>;
}

export interface UnifiedMessageSourceDeps {
  transcriptRepo?: IIDETranscriptRepository;
  conversationRepo?: IConversationRepository;
}

function normalizeRole(role: string): 'user' | 'assistant' | 'system' | 'agent' {
  if (role === 'agent') return 'agent';
  if (role === 'user') return 'user';
  if (role === 'system') return 'system';
  return 'assistant';
}

function transcriptToUnified(msg: TranscriptMessage): UnifiedMessage {
  return {
    id: msg.id,
    role: normalizeRole(msg.role),
    content: msg.content,
    timestamp: msg.timestamp,
    toolsUsed: msg.toolsUsed,
    metadata: msg.metadata,
    episodeId: (msg as TranscriptMessage & { episodeId?: string | null }).episodeId ?? null,
    relevanceScore:
      (msg as TranscriptMessage & { relevanceScore?: number | null }).relevanceScore ?? null,
    relevanceCategory:
      (msg as TranscriptMessage & { relevanceCategory?: 'high' | 'medium' | 'low' | null })
        .relevanceCategory ?? null,
    source: 'transcript',
  };
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  createdAt: string;
  toolsUsed: string[] | null;
  metadata: Record<string, unknown> | null;
  episodeId?: string | null;
  relevanceScore?: number | null;
  relevanceCategory?: 'high' | 'medium' | 'low' | null;
}

function conversationToUnified(msg: ConversationMessage): UnifiedMessage {
  return {
    id: msg.id,
    role: normalizeRole(msg.role),
    content: msg.content,
    timestamp: msg.createdAt,
    toolsUsed: msg.toolsUsed,
    metadata: msg.metadata,
    episodeId: msg.episodeId ?? null,
    relevanceScore: msg.relevanceScore ?? null,
    relevanceCategory: msg.relevanceCategory ?? null,
    source: 'conversation',
  };
}

export function createUnifiedMessageSource(deps: UnifiedMessageSourceDeps): IUnifiedMessageSource {
  const { transcriptRepo, conversationRepo } = deps;

  async function findTranscriptForSession(
    sessionId: string
  ): Promise<{ id: string; messageCount: number } | null> {
    if (!transcriptRepo) return null;

    const transcripts = await transcriptRepo.list(
      { agentMemorySessionId: sessionId },
      { limit: 1 }
    );
    if (transcripts.length === 0) return null;

    const transcript = transcripts[0]!;
    return {
      id: transcript.id,
      messageCount: transcript.messageCount ?? 0,
    };
  }

  return {
    async hasTranscriptForSession(sessionId: string): Promise<boolean> {
      const transcript = await findTranscriptForSession(sessionId);
      return transcript !== null && transcript.messageCount > 0;
    },

    async getMessagesForSession(
      sessionId: string,
      options?: GetMessagesOptions
    ): Promise<{ messages: UnifiedMessage[]; source: MessageSource }> {
      const transcript = await findTranscriptForSession(sessionId);

      if (transcript && transcript.messageCount > 0) {
        logger.debug({ sessionId, transcriptId: transcript.id }, 'Using transcript for messages');
        const messages = await transcriptRepo!.getMessages(transcript.id, {
          after: options?.after,
          before: options?.before,
          limit: options?.limit,
          offset: options?.offset,
        });
        return {
          messages: messages.map(transcriptToUnified),
          source: 'transcript',
        };
      }

      if (conversationRepo) {
        logger.debug({ sessionId }, 'Falling back to conversation for messages');
        const conversations = await conversationRepo.list({ sessionId }, { limit: 100 });
        const allMessages: UnifiedMessage[] = [];

        for (const conv of conversations) {
          const full = await conversationRepo.getById(conv.id, true, false);
          if (full?.messages) {
            allMessages.push(...full.messages.map(conversationToUnified));
          }
        }

        allMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        let filtered = allMessages;
        if (options?.after) {
          filtered = filtered.filter((m) => m.timestamp >= options.after!);
        }
        if (options?.before) {
          filtered = filtered.filter((m) => m.timestamp <= options.before!);
        }

        const offset = options?.offset ?? 0;
        const limit = options?.limit ?? filtered.length;
        filtered = filtered.slice(offset, offset + limit);

        return { messages: filtered, source: 'conversation' };
      }

      logger.warn({ sessionId }, 'No message source available');
      return { messages: [], source: 'conversation' };
    },

    async getMessagesForEpisode(
      episodeId: string,
      options?: GetMessagesForEpisodeOptions
    ): Promise<{ messages: UnifiedMessage[]; source: MessageSource }> {
      if (transcriptRepo) {
        const messages = await transcriptRepo.getMessagesByEpisode(episodeId, options);
        if (messages.length > 0) {
          logger.debug(
            { episodeId, count: messages.length },
            'Found messages in transcript by episode_id'
          );
          return {
            messages: messages.map(transcriptToUnified),
            source: 'transcript',
          };
        }

        if (options?.sessionId && options?.startedAt) {
          const endTime = options.endedAt ?? new Date().toISOString();
          logger.debug(
            { episodeId, sessionId: options.sessionId, startedAt: options.startedAt, endTime },
            'Falling back to time-range query for transcript messages'
          );
          const timeRangeMessages = await this.getMessagesInTimeRange(
            options.sessionId,
            options.startedAt,
            endTime
          );
          if (timeRangeMessages.messages.length > 0) {
            let filtered = timeRangeMessages.messages;
            if (options.offset) {
              filtered = filtered.slice(options.offset);
            }
            if (options.limit) {
              filtered = filtered.slice(0, options.limit);
            }
            return { messages: filtered, source: timeRangeMessages.source };
          }
        }
      }

      if (conversationRepo) {
        logger.debug({ episodeId }, 'Falling back to conversation for episode messages');
        const messages = await conversationRepo.getMessagesByEpisode(
          episodeId,
          options?.limit,
          options?.offset
        );
        return {
          messages: messages.map(conversationToUnified),
          source: 'conversation',
        };
      }

      return { messages: [], source: 'conversation' };
    },

    async getMessagesInTimeRange(
      sessionId: string,
      startTime: string,
      endTime: string
    ): Promise<{ messages: UnifiedMessage[]; source: MessageSource }> {
      const transcript = await findTranscriptForSession(sessionId);

      if (transcript && transcript.messageCount > 0) {
        logger.debug({ sessionId, transcriptId: transcript.id }, 'Using transcript for time range');
        const messages = await transcriptRepo!.getMessagesByTimeRange(
          transcript.id,
          startTime,
          endTime
        );
        return {
          messages: messages.map(transcriptToUnified),
          source: 'transcript',
        };
      }

      if (conversationRepo) {
        logger.debug({ sessionId }, 'Falling back to conversation for time range');
        const conversations = await conversationRepo.list({ sessionId }, { limit: 100 });
        const allMessages: UnifiedMessage[] = [];

        for (const conv of conversations) {
          const full = await conversationRepo.getById(conv.id, true, false);
          if (full?.messages) {
            allMessages.push(...full.messages.map(conversationToUnified));
          }
        }

        const filtered = allMessages
          .filter((m) => m.timestamp >= startTime && m.timestamp <= endTime)
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        return { messages: filtered, source: 'conversation' };
      }

      return { messages: [], source: 'conversation' };
    },

    async linkMessagesToEpisode(params: LinkMessagesToEpisodeParams): Promise<{
      linked: number;
      source: MessageSource;
    }> {
      const { episodeId, sessionId, startTime, endTime } = params;

      const transcript = await findTranscriptForSession(sessionId);

      if (transcript && transcript.messageCount > 0) {
        logger.debug(
          { sessionId, transcriptId: transcript.id, episodeId },
          'Linking transcript messages to episode'
        );
        const linked = await transcriptRepo!.linkMessagesToEpisode({
          episodeId,
          transcriptId: transcript.id,
          startTime,
          endTime,
        });
        return { linked, source: 'transcript' };
      }

      if (conversationRepo) {
        logger.debug({ sessionId, episodeId }, 'Linking conversation messages to episode');
        const linked = await conversationRepo.linkMessagesToEpisode({
          episodeId,
          sessionId,
          startTime,
          endTime,
        });
        return { linked, source: 'conversation' };
      }

      return { linked: 0, source: 'conversation' };
    },
  };
}
