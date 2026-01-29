import { eq, and, desc, sql } from 'drizzle-orm';
import { errorLog, type NewErrorLog, type ErrorLog } from '../schema/error-log.js';
import { generateId } from './base.js';
import type { DatabaseDeps } from '../../core/types.js';

export interface RecordErrorInput {
  sessionId: string;
  projectId?: string;
  toolName: string;
  errorType: string;
  errorMessage?: string;
  errorSignature: string;
  toolInputHash?: string;
}

export function createErrorLogRepository(deps: DatabaseDeps) {
  const { db } = deps;

  async function record(input: RecordErrorInput): Promise<ErrorLog> {
    const now = new Date().toISOString();
    const truncatedMessage = input.errorMessage ? input.errorMessage.substring(0, 2000) : null;

    const existing = db
      .select()
      .from(errorLog)
      .where(
        and(
          eq(errorLog.errorSignature, input.errorSignature),
          eq(errorLog.sessionId, input.sessionId)
        )
      )
      .get();

    if (existing) {
      const updated = db
        .update(errorLog)
        .set({
          occurrenceCount: existing.occurrenceCount + 1,
          lastOccurrence: now,
        })
        .where(eq(errorLog.id, existing.id))
        .returning()
        .get();

      return updated;
    }

    const id = `err_${generateId()}`;
    const newEntry: NewErrorLog = {
      id,
      sessionId: input.sessionId,
      projectId: input.projectId || null,
      toolName: input.toolName,
      errorType: input.errorType,
      errorMessage: truncatedMessage,
      errorSignature: input.errorSignature,
      occurrenceCount: 1,
      firstOccurrence: now,
      lastOccurrence: now,
      toolInputHash: input.toolInputHash || null,
      analyzed: 0,
      createdAt: now,
    };

    const inserted = db.insert(errorLog).values(newEntry).returning().get();

    return inserted;
  }

  async function getBySession(sessionId: string): Promise<ErrorLog[]> {
    return db
      .select()
      .from(errorLog)
      .where(eq(errorLog.sessionId, sessionId))
      .orderBy(desc(errorLog.lastOccurrence))
      .all();
  }

  async function getByProject(projectId: string, days?: number): Promise<ErrorLog[]> {
    if (days !== undefined) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffIso = cutoffDate.toISOString();

      return db
        .select()
        .from(errorLog)
        .where(
          and(eq(errorLog.projectId, projectId), sql`${errorLog.lastOccurrence} >= ${cutoffIso}`)
        )
        .orderBy(desc(errorLog.lastOccurrence))
        .all();
    }

    return db
      .select()
      .from(errorLog)
      .where(eq(errorLog.projectId, projectId))
      .orderBy(desc(errorLog.lastOccurrence))
      .all();
  }

  async function getUnanalyzed(limit?: number): Promise<ErrorLog[]> {
    const query = db
      .select()
      .from(errorLog)
      .where(eq(errorLog.analyzed, 0))
      .orderBy(desc(errorLog.lastOccurrence));

    if (limit !== undefined) {
      return query.limit(limit).all();
    }

    return query.all();
  }

  async function markAnalyzed(errorId: string): Promise<void> {
    db.update(errorLog).set({ analyzed: 1 }).where(eq(errorLog.id, errorId)).run();
  }

  return {
    record,
    getBySession,
    getByProject,
    getUnanalyzed,
    markAnalyzed,
  };
}

export type ErrorLogRepository = ReturnType<typeof createErrorLogRepository>;
