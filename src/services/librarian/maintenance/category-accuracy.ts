import { createComponentLogger } from '../../../utils/logger.js';
import type { Repositories } from '../../../core/interfaces/repositories.js';
import type { ScopeType } from '../../../db/schema.js';
import type { CategoryAccuracyConfig, CategoryAccuracyResult } from './types.js';
import type { DrizzleDb } from '../../../db/repositories/base.js';
import { RetrievalRepository } from '../../feedback/repositories/retrieval.repository.js';

const logger = createComponentLogger('category-accuracy');

export interface CategoryAccuracyDeps {
  db: DrizzleDb;
  repos: Repositories;
}

interface CategoryUsagePattern {
  entryId: string;
  entryType: 'tool' | 'guideline' | 'knowledge';
  declaredCategory: string;
  retrievalContexts: string[];
  retrievalCount: number;
  potentialMiscategorization: boolean;
  suggestedCategory: string | null;
}

function inferCategoryFromContexts(contexts: string[]): string | null {
  if (contexts.length === 0) return null;

  const categorySignals: Record<string, number> = {
    decision: 0,
    fact: 0,
    context: 0,
    reference: 0,
    bug: 0,
  };

  const patterns: Record<string, RegExp[]> = {
    decision: [/decid/i, /chose/i, /decision/i, /why did/i, /approach/i],
    fact: [/what is/i, /how does/i, /explain/i, /describe/i, /definition/i],
    context: [/background/i, /context/i, /history/i, /previously/i],
    reference: [/document/i, /link/i, /reference/i, /source/i],
    bug: [/bug/i, /error/i, /fix/i, /issue/i, /problem/i],
  };

  for (const ctx of contexts) {
    for (const [category, regexes] of Object.entries(patterns)) {
      for (const regex of regexes) {
        if (regex.test(ctx)) {
          categorySignals[category] = (categorySignals[category] ?? 0) + 1;
        }
      }
    }
  }

  let maxCategory: string | null = null;
  let maxCount = 0;
  for (const [cat, count] of Object.entries(categorySignals)) {
    if (count > maxCount) {
      maxCount = count;
      maxCategory = cat;
    }
  }

  return maxCount >= 2 ? maxCategory : null;
}

export async function runCategoryAccuracy(
  deps: CategoryAccuracyDeps,
  request: {
    scopeType: ScopeType;
    scopeId?: string;
    dryRun?: boolean;
    initiatedBy?: string;
  },
  config: CategoryAccuracyConfig
): Promise<CategoryAccuracyResult> {
  const startTime = Date.now();
  const result: CategoryAccuracyResult = {
    executed: true,
    entriesAnalyzed: 0,
    miscategorizationsFound: 0,
    recategorizationsApplied: 0,
    patternsStored: 0,
    durationMs: 0,
  };

  try {
    const scopeType = request.scopeType as 'global' | 'org' | 'project' | 'session';
    const scopeId = request.scopeId;
    const retrievalRepo = new RetrievalRepository(deps.db);

    const patterns: CategoryUsagePattern[] = [];

    const knowledge = await deps.repos.knowledge.list({ scopeType, scopeId });
    for (const k of knowledge.slice(0, config.maxEntriesPerRun)) {
      const retrievals = await retrievalRepo.getByEntry('knowledge', k.id);
      if (retrievals.length < config.minRetrievalsForAnalysis) continue;

      const contexts = retrievals.map((r) => r.queryText ?? '').filter((t) => t.length > 0);
      const inferredCategory = inferCategoryFromContexts(contexts);

      const declaredCategory = k.category ?? 'fact';
      const isMiscategorized =
        inferredCategory !== null &&
        inferredCategory !== declaredCategory &&
        config.trackedCategories.includes(inferredCategory);

      patterns.push({
        entryId: k.id,
        entryType: 'knowledge',
        declaredCategory,
        retrievalContexts: contexts.slice(0, 5),
        retrievalCount: retrievals.length,
        potentialMiscategorization: isMiscategorized,
        suggestedCategory: isMiscategorized ? inferredCategory : null,
      });
    }

    result.entriesAnalyzed = patterns.length;
    result.miscategorizationsFound = patterns.filter((p) => p.potentialMiscategorization).length;

    const miscategorizations = patterns.filter((p) => p.potentialMiscategorization);

    if (!request.dryRun && config.storeMiscategorizationPatterns && miscategorizations.length > 0) {
      const categoryMismatches: Record<string, Record<string, number>> = {};

      for (const m of miscategorizations) {
        const from = m.declaredCategory;
        const to = m.suggestedCategory ?? 'unknown';
        if (!categoryMismatches[from]) categoryMismatches[from] = {};
        categoryMismatches[from][to] = (categoryMismatches[from][to] ?? 0) + 1;
      }

      try {
        await deps.repos.knowledge.create({
          scopeType,
          scopeId,
          title: 'Category accuracy analysis',
          category: 'context',
          content: JSON.stringify({
            analysisDate: new Date().toISOString(),
            entriesAnalyzed: result.entriesAnalyzed,
            miscategorizationsFound: result.miscategorizationsFound,
            categoryMismatches,
            topMiscategorizations: miscategorizations.slice(0, 10).map((m) => ({
              entryId: m.entryId,
              from: m.declaredCategory,
              to: m.suggestedCategory,
              confidence: Math.min(m.retrievalCount / 10, 0.9),
            })),
          }),
          confidence: Math.min(result.entriesAnalyzed / 50, 0.9),
          source: 'category-accuracy',
          createdBy: request.initiatedBy ?? 'librarian',
        });
        result.patternsStored = 1;
      } catch (err) {
        logger.debug({ error: err }, 'Failed to store category accuracy pattern');
      }
    }

    result.durationMs = Date.now() - startTime;
    logger.info(
      {
        entriesAnalyzed: result.entriesAnalyzed,
        miscategorizationsFound: result.miscategorizationsFound,
        recategorizationsApplied: result.recategorizationsApplied,
        patternsStored: result.patternsStored,
        durationMs: result.durationMs,
      },
      'Category accuracy tracking completed'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Category accuracy tracking failed');
    result.errors = [error instanceof Error ? error.message : String(error)];
    result.durationMs = Date.now() - startTime;
    return result;
  }
}
