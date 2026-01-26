import { createComponentLogger } from '../../../utils/logger.js';
import type { Repositories } from '../../../core/interfaces/repositories.js';
import type { IEmbeddingService, IVectorService } from '../../../core/context.js';
import type { ScopeType } from '../../../db/schema.js';
import type { DuplicateRefinementConfig, DuplicateRefinementResult } from './types.js';
import type { DrizzleDb } from '../../../db/repositories/base.js';
import { RetrievalRepository } from '../../feedback/repositories/retrieval.repository.js';

const logger = createComponentLogger('duplicate-refinement');

export interface DuplicateRefinementDeps {
  db: DrizzleDb;
  repos: Repositories;
  embedding?: IEmbeddingService;
  vector?: IVectorService;
}

interface DuplicateCandidate {
  entryId1: string;
  entryId2: string;
  entryType: 'tool' | 'guideline' | 'knowledge';
  similarity: number;
  retrievals1: number;
  retrievals2: number;
  isDuplicate: boolean;
  dominantEntryId: string | null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dot += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function runDuplicateRefinement(
  deps: DuplicateRefinementDeps,
  request: {
    scopeType: ScopeType;
    scopeId?: string;
    dryRun?: boolean;
    initiatedBy?: string;
  },
  config: DuplicateRefinementConfig
): Promise<DuplicateRefinementResult> {
  const startTime = Date.now();
  const result: DuplicateRefinementResult = {
    executed: true,
    candidatesAnalyzed: 0,
    duplicatesIdentified: 0,
    thresholdAdjustments: 0,
    knowledgeEntriesCreated: 0,
    durationMs: 0,
  };

  try {
    if (!deps.embedding || !deps.vector || !deps.embedding.isAvailable()) {
      logger.debug('Duplicate refinement skipped: embedding/vector service not available');
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const scopeType = request.scopeType as 'global' | 'org' | 'project' | 'session';
    const scopeId = request.scopeId;
    const retrievalRepo = new RetrievalRepository(deps.db);

    const candidates: DuplicateCandidate[] = [];
    const entryTypes: Array<'guideline' | 'knowledge' | 'tool'> = [
      'guideline',
      'knowledge',
      'tool',
    ];

    for (const entryType of entryTypes) {
      let entries: Array<{ id: string; content: string }> = [];

      if (entryType === 'guideline') {
        const guidelines = await deps.repos.guidelines.list({ scopeType, scopeId });
        entries = guidelines
          .filter((g) => g.currentVersion?.content)
          .map((g) => ({ id: g.id, content: g.currentVersion!.content }));
      } else if (entryType === 'knowledge') {
        const knowledge = await deps.repos.knowledge.list({ scopeType, scopeId });
        entries = knowledge
          .filter((k) => k.currentVersion?.content)
          .map((k) => ({ id: k.id, content: k.currentVersion!.content }));
      } else {
        const tools = await deps.repos.tools.list({ scopeType, scopeId });
        entries = tools
          .filter((t) => t.currentVersion?.description)
          .map((t) => ({ id: t.id, content: t.currentVersion!.description ?? '' }));
      }

      if (entries.length < 2) continue;

      const embeddings = new Map<string, number[]>();
      for (const entry of entries.slice(0, config.maxCandidatesPerRun)) {
        try {
          const { embedding } = await deps.embedding.embed(entry.content);
          embeddings.set(entry.id, embedding);
        } catch {
          continue;
        }
      }

      const entryIds = Array.from(embeddings.keys());
      for (let i = 0; i < entryIds.length; i++) {
        for (let j = i + 1; j < entryIds.length; j++) {
          const id1 = entryIds[i]!;
          const id2 = entryIds[j]!;
          const emb1 = embeddings.get(id1)!;
          const emb2 = embeddings.get(id2)!;
          const sim = cosineSimilarity(emb1, emb2);

          if (sim >= config.baseSimilarityThreshold) {
            const retrievals1 = await retrievalRepo.countByEntry(entryType, id1);
            const retrievals2 = await retrievalRepo.countByEntry(entryType, id2);

            let isDuplicate = false;
            let dominantEntryId: string | null = null;

            const bothActive =
              retrievals1 >= config.minRetrievalsForActive &&
              retrievals2 >= config.minRetrievalsForActive;

            if (bothActive) {
              isDuplicate = false;
            } else if (retrievals1 === 0 && retrievals2 >= config.minRetrievalsForActive) {
              isDuplicate = true;
              dominantEntryId = id2;
            } else if (retrievals2 === 0 && retrievals1 >= config.minRetrievalsForActive) {
              isDuplicate = true;
              dominantEntryId = id1;
            } else if (retrievals1 > 0 && retrievals2 > 0) {
              const ratio = Math.max(retrievals1, retrievals2) / Math.min(retrievals1, retrievals2);
              if (ratio >= config.dominanceRatio) {
                isDuplicate = true;
                dominantEntryId = retrievals1 > retrievals2 ? id1 : id2;
              }
            }

            candidates.push({
              entryId1: id1,
              entryId2: id2,
              entryType,
              similarity: sim,
              retrievals1,
              retrievals2,
              isDuplicate,
              dominantEntryId,
            });

            if (candidates.length >= config.maxCandidatesPerRun) break;
          }
        }
        if (candidates.length >= config.maxCandidatesPerRun) break;
      }
    }

    result.candidatesAnalyzed = candidates.length;
    result.duplicatesIdentified = candidates.filter((c) => c.isDuplicate).length;

    const activePairs = candidates.filter(
      (c) =>
        !c.isDuplicate &&
        c.retrievals1 >= config.minRetrievalsForActive &&
        c.retrievals2 >= config.minRetrievalsForActive
    );

    if (activePairs.length >= 3) {
      const avgSimilarityOfActivePairs =
        activePairs.reduce((sum, p) => sum + p.similarity, 0) / activePairs.length;

      if (avgSimilarityOfActivePairs > config.baseSimilarityThreshold + 0.05) {
        result.thresholdAdjustments = 1;

        if (!request.dryRun && config.storeThresholdAdjustments) {
          try {
            await deps.repos.knowledge.create({
              scopeType,
              scopeId,
              title: 'Duplicate threshold adjustment recommendation',
              category: 'context',
              content: JSON.stringify({
                currentThreshold: config.baseSimilarityThreshold,
                suggestedThreshold: Math.min(avgSimilarityOfActivePairs + 0.02, 0.95),
                basedOnPairs: activePairs.length,
                avgSimilarityOfActivePairs,
                detectedAt: new Date().toISOString(),
              }),
              confidence: Math.min(activePairs.length / 10, 0.9),
              source: 'duplicate-refinement',
              createdBy: request.initiatedBy ?? 'librarian',
            });
            result.knowledgeEntriesCreated = 1;
          } catch (err) {
            logger.debug({ error: err }, 'Failed to store threshold adjustment');
          }
        }
      }
    }

    result.durationMs = Date.now() - startTime;
    logger.info(
      {
        candidatesAnalyzed: result.candidatesAnalyzed,
        duplicatesIdentified: result.duplicatesIdentified,
        thresholdAdjustments: result.thresholdAdjustments,
        knowledgeEntriesCreated: result.knowledgeEntriesCreated,
        durationMs: result.durationMs,
      },
      'Duplicate refinement completed'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Duplicate refinement failed');
    result.errors = [error instanceof Error ? error.message : String(error)];
    result.durationMs = Date.now() - startTime;
    return result;
  }
}
