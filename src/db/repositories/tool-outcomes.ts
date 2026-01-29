import { eq, and, desc, sql } from 'drizzle-orm';
import { toolOutcomes, type NewToolOutcome, type ToolOutcome } from '../schema/tool-outcomes.js';
import { sessionToolCounter, type SessionToolCounter } from '../schema/session-tool-counter.js';
import { generateId } from './base.js';
import type { DatabaseDeps } from '../../core/types.js';

export interface RecordToolOutcomeInput {
  sessionId: string;
  projectId?: string;
  toolName: string;
  outcome: 'success' | 'failure' | 'partial';
  outcomeType?: string;
  message?: string;
  toolInputHash?: string;
  inputSummary?: string;
  outputSummary?: string;
  durationMs?: number;
  precedingToolId?: string;
}

export function createToolOutcomesRepository(deps: DatabaseDeps) {
  const { db } = deps;

  async function record(input: RecordToolOutcomeInput): Promise<string> {
    const id = `out_${generateId()}`;
    const createdAt = new Date().toISOString();

    const truncatedInputSummary = input.inputSummary ? input.inputSummary.substring(0, 200) : null;
    const truncatedOutputSummary = input.outputSummary
      ? input.outputSummary.substring(0, 500)
      : null;

    const newEntry: NewToolOutcome = {
      id,
      sessionId: input.sessionId,
      projectId: input.projectId || null,
      toolName: input.toolName,
      outcome: input.outcome,
      outcomeType: input.outcomeType || null,
      message: input.message || null,
      toolInputHash: input.toolInputHash || null,
      inputSummary: truncatedInputSummary,
      outputSummary: truncatedOutputSummary,
      durationMs: input.durationMs || null,
      precedingToolId: input.precedingToolId || null,
      analyzed: 0,
      createdAt,
    };

    db.insert(toolOutcomes).values(newEntry).run();

    return id;
  }

  async function getBySession(sessionId: string): Promise<ToolOutcome[]> {
    return db
      .select()
      .from(toolOutcomes)
      .where(eq(toolOutcomes.sessionId, sessionId))
      .orderBy(desc(toolOutcomes.createdAt), desc(toolOutcomes.id))
      .all();
  }

  async function getRecentOutcomes(sessionId: string, count: number): Promise<ToolOutcome[]> {
    return db
      .select()
      .from(toolOutcomes)
      .where(eq(toolOutcomes.sessionId, sessionId))
      .orderBy(desc(toolOutcomes.createdAt), desc(toolOutcomes.id))
      .limit(count)
      .all();
  }

  async function getLastOutcomeForSession(sessionId: string): Promise<ToolOutcome | undefined> {
    return db
      .select()
      .from(toolOutcomes)
      .where(eq(toolOutcomes.sessionId, sessionId))
      .orderBy(desc(toolOutcomes.createdAt), desc(toolOutcomes.id))
      .limit(1)
      .get();
  }

  async function getUnanalyzed(limit?: number): Promise<ToolOutcome[]> {
    const query = db
      .select()
      .from(toolOutcomes)
      .where(eq(toolOutcomes.analyzed, 0))
      .orderBy(desc(toolOutcomes.createdAt), desc(toolOutcomes.id));

    if (limit !== undefined) {
      return query.limit(limit).all();
    }

    return query.all();
  }

  async function markAnalyzed(outcomeId: string): Promise<void> {
    db.update(toolOutcomes).set({ analyzed: 1 }).where(eq(toolOutcomes.id, outcomeId)).run();
  }

  async function incrementAndGetToolCount(sessionId: string): Promise<number> {
    const existing = db
      .select()
      .from(sessionToolCounter)
      .where(eq(sessionToolCounter.sessionId, sessionId))
      .get();

    if (existing) {
      const updated = db
        .update(sessionToolCounter)
        .set({
          toolCount: sql`${sessionToolCounter.toolCount} + 1`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sessionToolCounter.sessionId, sessionId))
        .returning()
        .get();

      return updated?.toolCount ?? 0;
    }

    db.insert(sessionToolCounter)
      .values({
        sessionId,
        toolCount: 1,
        lastAnalysisCount: 0,
        updatedAt: new Date().toISOString(),
      })
      .run();

    return 1;
  }

  async function getToolCountSinceLastAnalysis(sessionId: string): Promise<number> {
    const counter = db
      .select()
      .from(sessionToolCounter)
      .where(eq(sessionToolCounter.sessionId, sessionId))
      .get();

    if (!counter) {
      return 0;
    }

    return counter.toolCount - counter.lastAnalysisCount;
  }

  async function markAnalysisComplete(sessionId: string): Promise<void> {
    const counter = db
      .select()
      .from(sessionToolCounter)
      .where(eq(sessionToolCounter.sessionId, sessionId))
      .get();

    if (counter) {
      db.update(sessionToolCounter)
        .set({
          lastAnalysisCount: counter.toolCount,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sessionToolCounter.sessionId, sessionId))
        .run();
    }
  }

  async function deleteCounter(sessionId: string): Promise<void> {
    db.delete(sessionToolCounter).where(eq(sessionToolCounter.sessionId, sessionId)).run();
  }

  async function getCounterSnapshot(sessionId: string): Promise<SessionToolCounter | undefined> {
    return db
      .select()
      .from(sessionToolCounter)
      .where(eq(sessionToolCounter.sessionId, sessionId))
      .get();
  }

  async function tryClaimAnalysis(
    sessionId: string,
    expectedLast: number,
    newLast: number
  ): Promise<boolean> {
    const result = db
      .update(sessionToolCounter)
      .set({
        lastAnalysisCount: newLast,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(sessionToolCounter.sessionId, sessionId),
          eq(sessionToolCounter.lastAnalysisCount, expectedLast)
        )
      )
      .run();

    return result.changes > 0;
  }

  return {
    record,
    getBySession,
    getRecentOutcomes,
    getLastOutcomeForSession,
    getUnanalyzed,
    markAnalyzed,
    incrementAndGetToolCount,
    getToolCountSinceLastAnalysis,
    markAnalysisComplete,
    deleteCounter,
    getCounterSnapshot,
    tryClaimAnalysis,
  };
}

export type ToolOutcomesRepository = ReturnType<typeof createToolOutcomesRepository>;
