import type { IDEConversationReader, IDEMessage } from './types.js';
import type {
  IConversationRepository,
  AddMessageInput,
} from '../../core/interfaces/repositories.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('ide-conversation-importer');

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  sessionId: string;
  conversationId: string;
}

export interface IDEConversationImporter {
  importForEpisode(params: {
    ideSessionId: string;
    conversationId: string;
    sessionId: string;
    episodeId: string;
    startTime: Date;
    endTime: Date;
  }): Promise<ImportResult>;

  importSession(params: {
    ideSessionId: string;
    conversationId: string;
    sessionId: string;
  }): Promise<ImportResult>;
}

export function createIDEConversationImporter(
  reader: IDEConversationReader,
  conversationRepo: IConversationRepository
): IDEConversationImporter {
  async function importMessages(
    messages: IDEMessage[],
    conversationId: string,
    episodeId?: string
  ): Promise<{ imported: number; skipped: number; errors: number }> {
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const msg of messages) {
      try {
        const input: AddMessageInput = {
          conversationId,
          role: msg.role === 'user' ? 'user' : 'agent',
          content: msg.content,
          episodeId,
          toolsUsed: msg.toolsUsed,
          metadata: msg.metadata,
        };

        await conversationRepo.addMessage(input);
        imported++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg.includes('UNIQUE constraint') || errorMsg.includes('duplicate')) {
          skipped++;
        } else {
          logger.warn({ messageId: msg.id, error: errorMsg }, 'Failed to import message');
          errors++;
        }
      }
    }

    return { imported, skipped, errors };
  }

  return {
    async importForEpisode(params) {
      const { ideSessionId, conversationId, sessionId, episodeId, startTime, endTime } = params;

      logger.debug(
        {
          ideSessionId,
          episodeId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        },
        'Importing IDE messages for episode'
      );

      const messages = await reader.getMessages(ideSessionId, {
        after: startTime,
        before: endTime,
      });

      if (messages.length === 0) {
        logger.debug({ ideSessionId, episodeId }, 'No messages found in time range');
        return { imported: 0, skipped: 0, errors: 0, sessionId, conversationId };
      }

      const result = await importMessages(messages, conversationId, episodeId);

      logger.info({ ideSessionId, episodeId, ...result }, 'Imported IDE messages for episode');

      return { ...result, sessionId, conversationId };
    },

    async importSession(params) {
      const { ideSessionId, conversationId, sessionId } = params;

      logger.debug({ ideSessionId }, 'Importing all IDE messages for session');

      const messages = await reader.getMessages(ideSessionId);

      if (messages.length === 0) {
        logger.debug({ ideSessionId }, 'No messages found');
        return { imported: 0, skipped: 0, errors: 0, sessionId, conversationId };
      }

      const result = await importMessages(messages, conversationId);

      logger.info({ ideSessionId, ...result }, 'Imported IDE messages for session');

      return { ...result, sessionId, conversationId };
    },
  };
}
