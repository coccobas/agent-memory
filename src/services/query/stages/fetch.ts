/**
 * Fetch Stage
 *
 * Fetches entries from the database for each type.
 * Applies scope, date filters, and FTS5 ID filtering at the DB level.
 */

import { getDb } from '../../../db/connection.js';
import { tools, guidelines, knowledge } from '../../../db/schema.js';
import type { Tool, Guideline, Knowledge } from '../../../db/schema.js';
import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
import type { PipelineContext } from '../pipeline.js';

/**
 * Fetch stage - fetches entries from DB
 */
export function fetchStage(ctx: PipelineContext): PipelineContext {
  const db = getDb();
  const { types, limit } = ctx;

  const fetchedEntries: PipelineContext['fetchedEntries'] = {
    tools: [],
    guidelines: [],
    knowledge: [],
  };

  const softCap = limit * 2; // Fetch up to 2x limit for filtering headroom

  for (const type of types) {
    if (type === 'tools') {
      fetchToolEntries(db, ctx, fetchedEntries.tools, softCap);
    } else if (type === 'guidelines') {
      fetchGuidelineEntries(db, ctx, fetchedEntries.guidelines, softCap);
    } else if (type === 'knowledge') {
      fetchKnowledgeEntries(db, ctx, fetchedEntries.knowledge, softCap);
    }
  }

  return {
    ...ctx,
    fetchedEntries,
  };
}

function fetchToolEntries(
  db: ReturnType<typeof getDb>,
  ctx: PipelineContext,
  result: Array<{ entry: Tool; scopeIndex: number }>,
  softCap: number
): void {
  const { scopeChain, params, ftsMatchIds, limit } = ctx;

  for (let index = 0; index < scopeChain.length; index++) {
    if (result.length >= softCap) break;

    const scope = scopeChain[index]!;
    const conditions = [
      eq(tools.scopeType, scope.scopeType),
      scope.scopeId === null ? isNull(tools.scopeId) : eq(tools.scopeId, scope.scopeId),
      eq(tools.isActive, true),
    ];

    // Date filters
    if (params.createdAfter) {
      conditions.push(sql`${tools.createdAt} >= ${params.createdAfter}`);
    }
    if (params.createdBefore) {
      conditions.push(sql`${tools.createdAt} <= ${params.createdBefore}`);
    }

    // FTS5 ID filter
    if (ftsMatchIds && ftsMatchIds.tool.size > 0) {
      conditions.push(inArray(tools.id, Array.from(ftsMatchIds.tool)));
    }

    const perScopeLimit = Math.max(softCap - result.length, limit);
    const rows = db
      .select()
      .from(tools)
      .where(and(...conditions))
      .orderBy(sql`${tools.createdAt} DESC`)
      .limit(perScopeLimit)
      .all();

    for (const row of rows) {
      result.push({ entry: row, scopeIndex: index });
    }
  }
}

function fetchGuidelineEntries(
  db: ReturnType<typeof getDb>,
  ctx: PipelineContext,
  result: Array<{ entry: Guideline; scopeIndex: number }>,
  softCap: number
): void {
  const { scopeChain, params, ftsMatchIds, limit } = ctx;

  for (let index = 0; index < scopeChain.length; index++) {
    if (result.length >= softCap) break;

    const scope = scopeChain[index]!;
    const conditions = [
      eq(guidelines.scopeType, scope.scopeType),
      scope.scopeId === null ? isNull(guidelines.scopeId) : eq(guidelines.scopeId, scope.scopeId),
      eq(guidelines.isActive, true),
    ];

    // Date filters
    if (params.createdAfter) {
      conditions.push(sql`${guidelines.createdAt} >= ${params.createdAfter}`);
    }
    if (params.createdBefore) {
      conditions.push(sql`${guidelines.createdAt} <= ${params.createdBefore}`);
    }

    // Priority filters
    if (params.priority) {
      if (params.priority.min !== undefined) {
        conditions.push(sql`${guidelines.priority} >= ${params.priority.min}`);
      }
      if (params.priority.max !== undefined) {
        conditions.push(sql`${guidelines.priority} <= ${params.priority.max}`);
      }
    }

    // FTS5 ID filter
    if (ftsMatchIds && ftsMatchIds.guideline.size > 0) {
      conditions.push(inArray(guidelines.id, Array.from(ftsMatchIds.guideline)));
    }

    const perScopeLimit = Math.max(softCap - result.length, limit);
    const rows = db
      .select()
      .from(guidelines)
      .where(and(...conditions))
      .orderBy(sql`${guidelines.createdAt} DESC`)
      .limit(perScopeLimit)
      .all();

    for (const row of rows) {
      result.push({ entry: row, scopeIndex: index });
    }
  }
}

function fetchKnowledgeEntries(
  db: ReturnType<typeof getDb>,
  ctx: PipelineContext,
  result: Array<{ entry: Knowledge; scopeIndex: number }>,
  softCap: number
): void {
  const { scopeChain, params, ftsMatchIds, limit } = ctx;

  for (let index = 0; index < scopeChain.length; index++) {
    if (result.length >= softCap) break;

    const scope = scopeChain[index]!;
    const conditions = [
      eq(knowledge.scopeType, scope.scopeType),
      scope.scopeId === null ? isNull(knowledge.scopeId) : eq(knowledge.scopeId, scope.scopeId),
      eq(knowledge.isActive, true),
    ];

    // Date filters
    if (params.createdAfter) {
      conditions.push(sql`${knowledge.createdAt} >= ${params.createdAfter}`);
    }
    if (params.createdBefore) {
      conditions.push(sql`${knowledge.createdAt} <= ${params.createdBefore}`);
    }

    // FTS5 ID filter
    if (ftsMatchIds && ftsMatchIds.knowledge.size > 0) {
      conditions.push(inArray(knowledge.id, Array.from(ftsMatchIds.knowledge)));
    }

    const perScopeLimit = Math.max(softCap - result.length, limit);
    const rows = db
      .select()
      .from(knowledge)
      .where(and(...conditions))
      .orderBy(sql`${knowledge.createdAt} DESC`)
      .limit(perScopeLimit)
      .all();

    for (const row of rows) {
      result.push({ entry: row, scopeIndex: index });
    }
  }
}
