import { eq, and, desc, gte, lte, asc, sql } from 'drizzle-orm';
import { transactionWithDb } from '../connection.js';
import { ideTranscripts, ideTranscriptMessages } from '../schema.js';
import { generateId, type PaginationOptions, DEFAULT_LIMIT, MAX_LIMIT } from './base.js';
import type { DatabaseDeps } from '../../core/types.js';
import type {
  IIDETranscriptRepository,
  CreateTranscriptInput,
  AddTranscriptMessageInput,
  Transcript,
  TranscriptMessage,
  ListTranscriptsFilter,
} from '../../core/interfaces/repositories.js';

export function createIDETranscriptRepository(deps: DatabaseDeps): IIDETranscriptRepository {
  const { db, sqlite } = deps;

  return {
    async create(input: CreateTranscriptInput): Promise<Transcript> {
      return transactionWithDb(sqlite, () => {
        const id = generateId();
        const now = new Date().toISOString();

        db.insert(ideTranscripts)
          .values({
            id,
            ideName: input.ideName,
            ideSessionId: input.ideSessionId,
            agentMemorySessionId: input.agentMemorySessionId,
            projectId: input.projectId,
            projectPath: input.projectPath,
            title: input.title,
            importedAt: now,
            messageCount: 0,
            isSealed: false,
            metadata: input.metadata,
          })
          .run();

        return db.select().from(ideTranscripts).where(eq(ideTranscripts.id, id)).get()!;
      });
    },

    async getById(id: string): Promise<Transcript | undefined> {
      return db.select().from(ideTranscripts).where(eq(ideTranscripts.id, id)).get();
    },

    async getByIDESession(ideName: string, ideSessionId: string): Promise<Transcript | undefined> {
      return db
        .select()
        .from(ideTranscripts)
        .where(
          and(eq(ideTranscripts.ideName, ideName), eq(ideTranscripts.ideSessionId, ideSessionId))
        )
        .get();
    },

    async list(filter?: ListTranscriptsFilter, options?: PaginationOptions): Promise<Transcript[]> {
      const limit = Math.min(options?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = options?.offset ?? 0;

      const conditions = [];
      if (filter?.ideName) conditions.push(eq(ideTranscripts.ideName, filter.ideName));
      if (filter?.projectId) conditions.push(eq(ideTranscripts.projectId, filter.projectId));
      if (filter?.agentMemorySessionId)
        conditions.push(eq(ideTranscripts.agentMemorySessionId, filter.agentMemorySessionId));
      if (filter?.isSealed !== undefined)
        conditions.push(eq(ideTranscripts.isSealed, filter.isSealed));

      const query = db
        .select()
        .from(ideTranscripts)
        .orderBy(desc(ideTranscripts.importedAt))
        .limit(limit)
        .offset(offset);

      if (conditions.length > 0) {
        return query.where(and(...conditions)).all();
      }
      return query.all();
    },

    async addMessage(input: AddTranscriptMessageInput): Promise<TranscriptMessage> {
      return transactionWithDb(sqlite, () => {
        const id = generateId();

        db.insert(ideTranscriptMessages)
          .values({
            id,
            transcriptId: input.transcriptId,
            ideMessageId: input.ideMessageId,
            role: input.role,
            content: input.content,
            toolsUsed: input.toolsUsed,
            timestamp: input.timestamp,
            metadata: input.metadata,
          })
          .run();

        const currentCount = db
          .select()
          .from(ideTranscriptMessages)
          .where(eq(ideTranscriptMessages.transcriptId, input.transcriptId))
          .all().length;

        db.update(ideTranscripts)
          .set({
            messageCount: currentCount,
            lastMessageTimestamp: input.timestamp,
          })
          .where(eq(ideTranscripts.id, input.transcriptId))
          .run();

        return db
          .select()
          .from(ideTranscriptMessages)
          .where(eq(ideTranscriptMessages.id, id))
          .get()!;
      });
    },

    async addMessages(
      inputs: AddTranscriptMessageInput[]
    ): Promise<{ added: number; skipped: number }> {
      if (inputs.length === 0) return { added: 0, skipped: 0 };

      return transactionWithDb(sqlite, () => {
        let added = 0;
        let skipped = 0;
        let lastTimestamp: string | null = null;
        const transcriptId = inputs[0]!.transcriptId;

        for (const input of inputs) {
          const existing = db
            .select()
            .from(ideTranscriptMessages)
            .where(
              and(
                eq(ideTranscriptMessages.transcriptId, input.transcriptId),
                eq(ideTranscriptMessages.ideMessageId, input.ideMessageId)
              )
            )
            .get();

          if (existing) {
            skipped++;
            continue;
          }

          const id = generateId();
          db.insert(ideTranscriptMessages)
            .values({
              id,
              transcriptId: input.transcriptId,
              ideMessageId: input.ideMessageId,
              role: input.role,
              content: input.content,
              toolsUsed: input.toolsUsed,
              timestamp: input.timestamp,
              metadata: input.metadata,
            })
            .run();

          added++;
          if (!lastTimestamp || input.timestamp > lastTimestamp) {
            lastTimestamp = input.timestamp;
          }
        }

        if (added > 0 && lastTimestamp) {
          const currentCount = db
            .select()
            .from(ideTranscriptMessages)
            .where(eq(ideTranscriptMessages.transcriptId, transcriptId))
            .all().length;

          db.update(ideTranscripts)
            .set({
              messageCount: currentCount,
              lastMessageTimestamp: lastTimestamp,
            })
            .where(eq(ideTranscripts.id, transcriptId))
            .run();
        }

        return { added, skipped };
      });
    },

    async getMessages(
      transcriptId: string,
      options?: { after?: string; before?: string; limit?: number; offset?: number }
    ): Promise<TranscriptMessage[]> {
      const limit = Math.min(options?.limit ?? MAX_LIMIT, MAX_LIMIT);
      const offset = options?.offset ?? 0;

      const conditions = [eq(ideTranscriptMessages.transcriptId, transcriptId)];
      if (options?.after) conditions.push(gte(ideTranscriptMessages.timestamp, options.after));
      if (options?.before) conditions.push(lte(ideTranscriptMessages.timestamp, options.before));

      return db
        .select()
        .from(ideTranscriptMessages)
        .where(and(...conditions))
        .orderBy(ideTranscriptMessages.timestamp)
        .limit(limit)
        .offset(offset)
        .all();
    },

    async getMessagesByTimeRange(
      transcriptId: string,
      startTime: string,
      endTime: string
    ): Promise<TranscriptMessage[]> {
      return db
        .select()
        .from(ideTranscriptMessages)
        .where(
          and(
            eq(ideTranscriptMessages.transcriptId, transcriptId),
            gte(ideTranscriptMessages.timestamp, startTime),
            lte(ideTranscriptMessages.timestamp, endTime)
          )
        )
        .orderBy(ideTranscriptMessages.timestamp)
        .all();
    },

    async updateLastMessageTimestamp(transcriptId: string, timestamp: string): Promise<void> {
      db.update(ideTranscripts)
        .set({ lastMessageTimestamp: timestamp })
        .where(eq(ideTranscripts.id, transcriptId))
        .run();
    },

    async seal(transcriptId: string): Promise<Transcript> {
      return transactionWithDb(sqlite, () => {
        db.update(ideTranscripts)
          .set({ isSealed: true })
          .where(eq(ideTranscripts.id, transcriptId))
          .run();

        return db.select().from(ideTranscripts).where(eq(ideTranscripts.id, transcriptId)).get()!;
      });
    },

    async linkToSession(transcriptId: string, agentMemorySessionId: string): Promise<void> {
      db.update(ideTranscripts)
        .set({ agentMemorySessionId })
        .where(eq(ideTranscripts.id, transcriptId))
        .run();
    },

    async updateIDESessionId(transcriptId: string, ideSessionId: string): Promise<void> {
      db.update(ideTranscripts)
        .set({ ideSessionId })
        .where(eq(ideTranscripts.id, transcriptId))
        .run();
    },

    async linkMessagesToEpisode(params: {
      episodeId: string;
      transcriptId: string;
      startTime: string;
      endTime: string;
    }): Promise<number> {
      const { episodeId, transcriptId, startTime, endTime } = params;

      // Normalize timestamps using proper Date parsing to handle timezone offsets and milliseconds
      // Keep 'T' separator to match stored transcript message format (ISO 8601)
      const normalizeTimestamp = (ts: string): string => {
        const date = new Date(ts);
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid timestamp: ${ts}`);
        }
        // Use ISO format with 'T' to match stored transcript timestamps
        return date.toISOString().slice(0, 19);
      };
      const normalizedStart = normalizeTimestamp(startTime);
      const normalizedEnd = normalizeTimestamp(endTime);

      const result = db
        .update(ideTranscriptMessages)
        .set({ episodeId })
        .where(
          and(
            eq(ideTranscriptMessages.transcriptId, transcriptId),
            sql`${ideTranscriptMessages.episodeId} IS NULL`,
            sql`substr(${ideTranscriptMessages.timestamp}, 1, 19) >= ${normalizedStart}`,
            sql`substr(${ideTranscriptMessages.timestamp}, 1, 19) <= ${normalizedEnd}`
          )
        )
        .run();

      return result.changes;
    },

    async getMessagesByEpisode(
      episodeId: string,
      options?: { limit?: number; offset?: number }
    ): Promise<TranscriptMessage[]> {
      let query = db
        .select()
        .from(ideTranscriptMessages)
        .where(eq(ideTranscriptMessages.episodeId, episodeId))
        .orderBy(asc(ideTranscriptMessages.timestamp));

      if (options?.limit !== undefined) {
        query = query.limit(options.limit) as typeof query;
      }

      if (options?.offset !== undefined) {
        query = query.offset(options.offset) as typeof query;
      }

      return query.all();
    },
  };
}
