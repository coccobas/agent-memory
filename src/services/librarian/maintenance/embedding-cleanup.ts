import { eq, and, isNull, or } from 'drizzle-orm';
import { createComponentLogger } from '../../../utils/logger.js';
import type { AppDb } from '../../../core/types.js';
import type { IVectorService } from '../../../core/context.js';
import type { ScopeType } from '../../../db/schema.js';
import { entryEmbeddings, tools, guidelines, knowledge, experiences } from '../../../db/schema.js';
import type { EmbeddingCleanupConfig, EmbeddingCleanupResult } from './types.js';

const logger = createComponentLogger('embedding-cleanup');

export interface EmbeddingCleanupDeps {
  db: AppDb;
  vector?: IVectorService;
}

export interface EmbeddingCleanupRequest {
  scopeType: ScopeType;
  scopeId?: string;
  dryRun?: boolean;
  initiatedBy?: string;
}

export async function runEmbeddingCleanup(
  deps: EmbeddingCleanupDeps,
  request: EmbeddingCleanupRequest,
  config: EmbeddingCleanupConfig
): Promise<EmbeddingCleanupResult> {
  const startTime = Date.now();
  const result: EmbeddingCleanupResult = {
    executed: true,
    orphansFound: 0,
    recordsDeleted: 0,
    vectorsRemoved: 0,
    byType: {},
    durationMs: 0,
  };

  const { db } = deps;

  try {
    for (const entryType of config.entryTypes) {
      const typeStats = { found: 0, deleted: 0 };

      const orphanedRecords = findOrphanedEmbeddings(db, entryType, config.maxEntries);

      typeStats.found = orphanedRecords.length;
      result.orphansFound += orphanedRecords.length;

      if (!request.dryRun && orphanedRecords.length > 0) {
        for (const record of orphanedRecords) {
          db.delete(entryEmbeddings).where(eq(entryEmbeddings.id, record.id)).run();

          typeStats.deleted++;
          result.recordsDeleted++;
        }
      }

      result.byType[entryType] = typeStats;
    }

    logger.info(
      {
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        orphansFound: result.orphansFound,
        recordsDeleted: result.recordsDeleted,
        vectorsRemoved: result.vectorsRemoved,
        dryRun: request.dryRun,
      },
      'Embedding cleanup completed'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errorMsg }, 'Embedding cleanup task failed');
    result.errors = [errorMsg];
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

function findOrphanedEmbeddings(
  db: AppDb,
  entryType: 'tool' | 'guideline' | 'knowledge' | 'experience',
  limit: number
): Array<{ id: string; entryId: string; versionId: string }> {
  switch (entryType) {
    case 'tool':
      return db
        .select({
          id: entryEmbeddings.id,
          entryId: entryEmbeddings.entryId,
          versionId: entryEmbeddings.versionId,
        })
        .from(entryEmbeddings)
        .leftJoin(tools, eq(entryEmbeddings.entryId, tools.id))
        .where(
          and(
            eq(entryEmbeddings.entryType, 'tool'),
            or(isNull(tools.id), eq(tools.isActive, false))
          )
        )
        .limit(limit)
        .all();

    case 'guideline':
      return db
        .select({
          id: entryEmbeddings.id,
          entryId: entryEmbeddings.entryId,
          versionId: entryEmbeddings.versionId,
        })
        .from(entryEmbeddings)
        .leftJoin(guidelines, eq(entryEmbeddings.entryId, guidelines.id))
        .where(
          and(
            eq(entryEmbeddings.entryType, 'guideline'),
            or(isNull(guidelines.id), eq(guidelines.isActive, false))
          )
        )
        .limit(limit)
        .all();

    case 'knowledge':
      return db
        .select({
          id: entryEmbeddings.id,
          entryId: entryEmbeddings.entryId,
          versionId: entryEmbeddings.versionId,
        })
        .from(entryEmbeddings)
        .leftJoin(knowledge, eq(entryEmbeddings.entryId, knowledge.id))
        .where(
          and(
            eq(entryEmbeddings.entryType, 'knowledge'),
            or(isNull(knowledge.id), eq(knowledge.isActive, false))
          )
        )
        .limit(limit)
        .all();

    case 'experience':
      return db
        .select({
          id: entryEmbeddings.id,
          entryId: entryEmbeddings.entryId,
          versionId: entryEmbeddings.versionId,
        })
        .from(entryEmbeddings)
        .leftJoin(experiences, eq(entryEmbeddings.entryId, experiences.id))
        .where(
          and(
            eq(entryEmbeddings.entryType, 'experience'),
            or(isNull(experiences.id), eq(experiences.isActive, false))
          )
        )
        .limit(limit)
        .all();

    default:
      return [];
  }
}
