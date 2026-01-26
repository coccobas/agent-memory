import type { PaginationOptions } from '../../../db/repositories/base.js';

export interface CreateTranscriptInput {
  ideName: string;
  ideSessionId: string;
  agentMemorySessionId?: string;
  projectId?: string;
  projectPath?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface AddTranscriptMessageInput {
  transcriptId: string;
  ideMessageId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolsUsed?: string[];
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface TranscriptMessage {
  id: string;
  transcriptId: string;
  ideMessageId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolsUsed: string[] | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

export interface Transcript {
  id: string;
  ideName: string;
  ideSessionId: string;
  agentMemorySessionId: string | null;
  projectId: string | null;
  projectPath: string | null;
  title: string | null;
  importedAt: string;
  lastMessageTimestamp: string | null;
  messageCount: number | null;
  isSealed: boolean | null;
  metadata: Record<string, unknown> | null;
}

export interface ListTranscriptsFilter {
  ideName?: string;
  projectId?: string;
  agentMemorySessionId?: string;
  isSealed?: boolean;
}

export interface IIDETranscriptRepository {
  create(input: CreateTranscriptInput): Promise<Transcript>;

  getById(id: string): Promise<Transcript | undefined>;

  getByIDESession(ideName: string, ideSessionId: string): Promise<Transcript | undefined>;

  list(filter?: ListTranscriptsFilter, options?: PaginationOptions): Promise<Transcript[]>;

  addMessage(input: AddTranscriptMessageInput): Promise<TranscriptMessage>;

  addMessages(inputs: AddTranscriptMessageInput[]): Promise<{ added: number; skipped: number }>;

  getMessages(
    transcriptId: string,
    options?: { after?: string; before?: string; limit?: number; offset?: number }
  ): Promise<TranscriptMessage[]>;

  getMessagesByTimeRange(
    transcriptId: string,
    startTime: string,
    endTime: string
  ): Promise<TranscriptMessage[]>;

  updateLastMessageTimestamp(transcriptId: string, timestamp: string): Promise<void>;

  seal(transcriptId: string): Promise<Transcript>;

  linkToSession(transcriptId: string, agentMemorySessionId: string): Promise<void>;

  linkMessagesToEpisode(params: {
    episodeId: string;
    transcriptId: string;
    startTime: string;
    endTime: string;
  }): Promise<number>;

  getMessagesByEpisode(
    episodeId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<TranscriptMessage[]>;
}
