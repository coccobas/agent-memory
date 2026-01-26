import type { IDEConversationReader, IDEMessage } from './types.js';
import type {
  IIDETranscriptRepository,
  Transcript,
  TranscriptMessage,
  AddTranscriptMessageInput,
} from '../../core/interfaces/repositories.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('transcript-service');

export interface TranscriptImportResult {
  transcript: Transcript;
  imported: number;
  skipped: number;
  isNew: boolean;
}

export interface TranscriptService {
  getCurrentIDESessionId(projectPath?: string): Promise<string | null>;

  ensureTranscript(params: {
    ideSessionId: string;
    projectId?: string;
    projectPath?: string;
    agentMemorySessionId?: string;
    title?: string;
  }): Promise<TranscriptImportResult>;

  appendNewMessages(transcriptId: string): Promise<{ appended: number; skipped: number }>;

  seal(transcriptId: string): Promise<Transcript>;

  getMessages(
    transcriptId: string,
    options?: { after?: string; before?: string; limit?: number }
  ): Promise<TranscriptMessage[]>;

  getMessagesByTimeRange(
    transcriptId: string,
    startTime: string,
    endTime: string
  ): Promise<TranscriptMessage[]>;

  getTranscriptByIDESession(ideSessionId: string): Promise<Transcript | undefined>;
}

export function createTranscriptService(
  reader: IDEConversationReader,
  transcriptRepo: IIDETranscriptRepository
): TranscriptService {
  const ideName = reader.ideName;

  function ideMessageToInput(msg: IDEMessage, transcriptId: string): AddTranscriptMessageInput {
    return {
      transcriptId,
      ideMessageId: msg.id,
      role: msg.role,
      content: msg.content,
      toolsUsed: msg.toolsUsed,
      timestamp: msg.timestamp.toISOString(),
      metadata: msg.metadata,
    };
  }

  return {
    async getCurrentIDESessionId(projectPath?: string): Promise<string | null> {
      const sessions = await reader.listSessions(projectPath);
      return sessions.length > 0 && sessions[0] ? sessions[0].id : null;
    },

    async ensureTranscript(params): Promise<TranscriptImportResult> {
      const { ideSessionId, projectId, projectPath, agentMemorySessionId, title } = params;

      const existing = await transcriptRepo.getByIDESession(ideName, ideSessionId);

      if (existing) {
        logger.debug({ transcriptId: existing.id, ideSessionId }, 'Transcript already exists');
        return {
          transcript: existing,
          imported: 0,
          skipped: existing.messageCount ?? 0,
          isNew: false,
        };
      }

      logger.debug({ ideSessionId }, 'Creating new transcript');

      const ideSession = await reader.findSessionByExternalId(ideSessionId);
      const transcriptTitle = title ?? ideSession?.title ?? `${ideName} session`;

      const transcript = await transcriptRepo.create({
        ideName,
        ideSessionId,
        projectId,
        projectPath: projectPath ?? ideSession?.projectPath,
        agentMemorySessionId,
        title: transcriptTitle,
      });

      const messages = await reader.getMessages(ideSessionId);

      if (messages.length === 0) {
        logger.debug({ transcriptId: transcript.id }, 'No messages to import');
        return { transcript, imported: 0, skipped: 0, isNew: true };
      }

      const inputs = messages.map((msg) => ideMessageToInput(msg, transcript.id));
      const { added, skipped } = await transcriptRepo.addMessages(inputs);

      logger.info(
        { transcriptId: transcript.id, imported: added, skipped, total: messages.length },
        'Imported transcript'
      );

      const updated = await transcriptRepo.getById(transcript.id);
      return {
        transcript: updated ?? transcript,
        imported: added,
        skipped,
        isNew: true,
      };
    },

    async appendNewMessages(transcriptId: string): Promise<{ appended: number; skipped: number }> {
      const transcript = await transcriptRepo.getById(transcriptId);
      if (!transcript) {
        logger.warn({ transcriptId }, 'Transcript not found for append');
        return { appended: 0, skipped: 0 };
      }

      if (transcript.isSealed) {
        logger.debug({ transcriptId }, 'Transcript is sealed, skipping append');
        return { appended: 0, skipped: 0 };
      }

      const afterTimestamp = transcript.lastMessageTimestamp
        ? new Date(transcript.lastMessageTimestamp)
        : undefined;

      const messages = await reader.getMessages(transcript.ideSessionId, {
        after: afterTimestamp,
      });

      if (messages.length === 0) {
        logger.debug({ transcriptId }, 'No new messages to append');
        return { appended: 0, skipped: 0 };
      }

      const inputs = messages.map((msg) => ideMessageToInput(msg, transcriptId));
      const { added, skipped } = await transcriptRepo.addMessages(inputs);

      logger.info({ transcriptId, appended: added, skipped }, 'Appended messages to transcript');

      return { appended: added, skipped };
    },

    async seal(transcriptId: string): Promise<Transcript> {
      await this.appendNewMessages(transcriptId);
      const sealed = await transcriptRepo.seal(transcriptId);
      logger.info({ transcriptId, messageCount: sealed.messageCount }, 'Sealed transcript');
      return sealed;
    },

    async getMessages(
      transcriptId: string,
      options?: { after?: string; before?: string; limit?: number }
    ): Promise<TranscriptMessage[]> {
      return transcriptRepo.getMessages(transcriptId, options);
    },

    async getMessagesByTimeRange(
      transcriptId: string,
      startTime: string,
      endTime: string
    ): Promise<TranscriptMessage[]> {
      return transcriptRepo.getMessagesByTimeRange(transcriptId, startTime, endTime);
    },

    async getTranscriptByIDESession(ideSessionId: string): Promise<Transcript | undefined> {
      return transcriptRepo.getByIDESession(ideName, ideSessionId);
    },
  };
}
