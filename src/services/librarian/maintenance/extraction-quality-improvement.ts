import { createComponentLogger } from '../../../utils/logger.js';
import type { Repositories } from '../../../core/interfaces/repositories.js';
import type { ScopeType } from '../../../db/schema.js';
import type { ExtractionQualityConfig, ExtractionQualityResult } from './types.js';
import type { DrizzleDb } from '../../../db/repositories/base.js';
import {
  RetrievalRepository,
  getEntryFeedbackBatch,
} from '../../feedback/repositories/retrieval.repository.js';

const logger = createComponentLogger('extraction-quality-improvement');

export interface ExtractionQualityDeps {
  db: DrizzleDb;
  repos: Repositories;
}

interface EntryRetrievalPattern {
  entryId: string;
  entryType: 'tool' | 'guideline' | 'knowledge';
  retrievalCount: number;
  lastRetrievedAt: string | null;
  feedbackScore: number;
  daysSinceLastRetrieval: number;
}

interface LearnedPattern {
  patternType: 'high_value' | 'low_value';
  entryType: 'tool' | 'guideline' | 'knowledge';
  characteristics: {
    avgRetrievals: number;
    avgFeedbackScore: number;
    commonCategories: string[];
  };
  confidence: number;
}

function categorizeEntry(
  pattern: EntryRetrievalPattern,
  config: ExtractionQualityConfig
): 'high' | 'low' | 'neutral' {
  if (pattern.retrievalCount >= config.highValueRetrievalThreshold && pattern.feedbackScore >= 0) {
    return 'high';
  }
  if (
    pattern.daysSinceLastRetrieval > config.lowValueDaysThreshold &&
    pattern.retrievalCount === 0
  ) {
    return 'low';
  }
  return 'neutral';
}

function aggregatePatterns(
  patterns: EntryRetrievalPattern[],
  valueType: 'high' | 'low'
): LearnedPattern | null {
  const filtered = patterns.filter((p) => {
    if (valueType === 'high') {
      return p.retrievalCount >= 3 && p.feedbackScore >= 0;
    }
    return p.retrievalCount === 0 && p.daysSinceLastRetrieval > 14;
  });

  if (filtered.length < 3) return null;

  const byType = new Map<string, EntryRetrievalPattern[]>();
  for (const p of filtered) {
    const arr = byType.get(p.entryType) ?? [];
    arr.push(p);
    byType.set(p.entryType, arr);
  }

  let dominantType: 'tool' | 'guideline' | 'knowledge' = 'knowledge';
  let maxCount = 0;
  for (const [type, arr] of byType) {
    if (arr.length > maxCount) {
      maxCount = arr.length;
      dominantType = type as 'tool' | 'guideline' | 'knowledge';
    }
  }

  const avgRetrievals = filtered.reduce((sum, p) => sum + p.retrievalCount, 0) / filtered.length;
  const avgFeedback = filtered.reduce((sum, p) => sum + p.feedbackScore, 0) / filtered.length;

  return {
    patternType: valueType === 'high' ? 'high_value' : 'low_value',
    entryType: dominantType,
    characteristics: {
      avgRetrievals,
      avgFeedbackScore: avgFeedback,
      commonCategories: [],
    },
    confidence: Math.min(filtered.length / 10, 1),
  };
}

export async function runExtractionQualityImprovement(
  deps: ExtractionQualityDeps,
  request: {
    scopeType: ScopeType;
    scopeId?: string;
    dryRun?: boolean;
    initiatedBy?: string;
  },
  config: ExtractionQualityConfig
): Promise<ExtractionQualityResult> {
  const startTime = Date.now();
  const result: ExtractionQualityResult = {
    executed: true,
    sessionsAnalyzed: 0,
    highValuePatternsFound: 0,
    lowValuePatternsFound: 0,
    experiencesCreated: 0,
    durationMs: 0,
  };

  try {
    const scopeType = request.scopeType as 'global' | 'org' | 'project' | 'session';
    const scopeId = request.scopeId;

    const sessions = await deps.repos.sessions.list({ projectId: scopeId, status: 'completed' });
    if (sessions.length < config.minSessionsForAnalysis) {
      logger.debug(
        { sessionsFound: sessions.length, required: config.minSessionsForAnalysis },
        'Not enough sessions for analysis'
      );
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    result.sessionsAnalyzed = sessions.length;

    const retrievalRepo = new RetrievalRepository(deps.db);
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - config.lookbackDays);
    const lookbackIso = lookbackDate.toISOString();

    const allRetrievals = await retrievalRepo.getByDateRange(lookbackIso, new Date().toISOString());

    const retrievalsByEntry = new Map<string, { count: number; lastAt: string }>();
    for (const r of allRetrievals) {
      const key = `${r.entryType}:${r.entryId}`;
      const existing = retrievalsByEntry.get(key);
      if (!existing) {
        retrievalsByEntry.set(key, { count: 1, lastAt: r.retrievedAt });
      } else {
        existing.count++;
        if (r.retrievedAt > existing.lastAt) {
          existing.lastAt = r.retrievedAt;
        }
      }
    }

    const entryList: Array<{ entryType: 'tool' | 'guideline' | 'knowledge'; entryId: string }> = [];
    const entries: Array<{ id: string; type: 'tool' | 'guideline' | 'knowledge' }> = [];

    const guidelines = await deps.repos.guidelines.list({ scopeType, scopeId });
    for (const g of guidelines) {
      entries.push({ id: g.id, type: 'guideline' });
      entryList.push({ entryType: 'guideline', entryId: g.id });
    }

    const knowledge = await deps.repos.knowledge.list({ scopeType, scopeId });
    for (const k of knowledge) {
      entries.push({ id: k.id, type: 'knowledge' });
      entryList.push({ entryType: 'knowledge', entryId: k.id });
    }

    const tools = await deps.repos.tools.list({ scopeType, scopeId });
    for (const t of tools) {
      entries.push({ id: t.id, type: 'tool' });
      entryList.push({ entryType: 'tool', entryId: t.id });
    }

    const feedbackScores = await getEntryFeedbackBatch(deps.db, entryList);

    const patterns: EntryRetrievalPattern[] = [];
    const now = Date.now();

    for (const entry of entries) {
      const key = `${entry.type}:${entry.id}`;
      const retrievalData = retrievalsByEntry.get(key);
      const feedback = feedbackScores.get(entry.id);

      const lastRetrievedAt = retrievalData?.lastAt ?? null;
      const daysSinceLastRetrieval = lastRetrievedAt
        ? Math.floor((now - new Date(lastRetrievedAt).getTime()) / (1000 * 60 * 60 * 24))
        : config.lookbackDays;

      patterns.push({
        entryId: entry.id,
        entryType: entry.type,
        retrievalCount: retrievalData?.count ?? 0,
        lastRetrievedAt,
        feedbackScore: feedback?.netScore ?? 0,
        daysSinceLastRetrieval,
      });
    }

    const highValuePatterns: EntryRetrievalPattern[] = [];
    const lowValuePatterns: EntryRetrievalPattern[] = [];

    for (const pattern of patterns) {
      const category = categorizeEntry(pattern, config);
      if (category === 'high') highValuePatterns.push(pattern);
      else if (category === 'low') lowValuePatterns.push(pattern);
    }

    result.highValuePatternsFound = highValuePatterns.length;
    result.lowValuePatternsFound = lowValuePatterns.length;

    if (!request.dryRun && config.storeAsExperiences && deps.repos.experiences) {
      const learnedPatterns: LearnedPattern[] = [];

      const highPattern = aggregatePatterns(patterns, 'high');
      if (highPattern) learnedPatterns.push(highPattern);

      const lowPattern = aggregatePatterns(patterns, 'low');
      if (lowPattern) learnedPatterns.push(lowPattern);

      let storedCount = 0;
      for (const learned of learnedPatterns.slice(0, config.maxPatternsPerRun)) {
        try {
          await deps.repos.experiences.create({
            scopeType,
            scopeId,
            title: `Extraction pattern: ${learned.patternType} ${learned.entryType} entries`,
            content: JSON.stringify({
              patternType: learned.patternType,
              entryType: learned.entryType,
              characteristics: learned.characteristics,
              detectedAt: new Date().toISOString(),
            }),
            level: 'strategy',
            category: 'extraction-quality',
            confidence: learned.confidence,
            source: 'observation',
            createdBy: request.initiatedBy ?? 'librarian',
          });
          storedCount++;
        } catch (err) {
          logger.debug({ error: err, pattern: learned.patternType }, 'Failed to store pattern');
        }
      }

      result.experiencesCreated = storedCount;
    }

    result.durationMs = Date.now() - startTime;
    logger.info(
      {
        sessionsAnalyzed: result.sessionsAnalyzed,
        highValuePatterns: result.highValuePatternsFound,
        lowValuePatterns: result.lowValuePatternsFound,
        experiencesCreated: result.experiencesCreated,
        durationMs: result.durationMs,
      },
      'Extraction quality improvement completed'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Extraction quality improvement failed');
    result.errors = [error instanceof Error ? error.message : String(error)];
    result.durationMs = Date.now() - startTime;
    return result;
  }
}
