import { createComponentLogger } from '../../../utils/logger.js';
import type { Repositories } from '../../../core/interfaces/repositories.js';
import type { ScopeType } from '../../../db/schema.js';
import type { RelevanceCalibrationConfig, RelevanceCalibrationResult } from './types.js';
import type { DrizzleDb } from '../../../db/repositories/base.js';
import {
  RetrievalRepository,
  getEntryFeedbackBatch,
} from '../../feedback/repositories/retrieval.repository.js';

const logger = createComponentLogger('relevance-calibration');

export interface RelevanceCalibrationDeps {
  db: DrizzleDb;
  repos: Repositories;
}

interface CalibrationBucket {
  minConfidence: number;
  maxConfidence: number;
  entries: Array<{
    entryId: string;
    confidence: number;
    retrievalCount: number;
    feedbackScore: number;
  }>;
  avgRetrievals: number;
  avgFeedback: number;
  actualUtility: number;
}

function computeActualUtility(bucket: CalibrationBucket): number {
  if (bucket.entries.length === 0) return 0;

  const retrievalScore = Math.min(bucket.avgRetrievals / 5, 1);
  const feedbackScore = (bucket.avgFeedback + 1) / 2;
  return retrievalScore * 0.6 + feedbackScore * 0.4;
}

export async function runRelevanceCalibration(
  deps: RelevanceCalibrationDeps,
  request: {
    scopeType: ScopeType;
    scopeId?: string;
    dryRun?: boolean;
    initiatedBy?: string;
  },
  config: RelevanceCalibrationConfig
): Promise<RelevanceCalibrationResult> {
  const startTime = Date.now();
  const result: RelevanceCalibrationResult = {
    executed: true,
    entriesAnalyzed: 0,
    bucketsComputed: 0,
    calibrationCurveStored: false,
    averageAdjustment: 0,
    durationMs: 0,
  };

  try {
    const scopeType = request.scopeType as 'global' | 'org' | 'project' | 'session';
    const scopeId = request.scopeId;
    const retrievalRepo = new RetrievalRepository(deps.db);

    const buckets: CalibrationBucket[] = [];
    const bucketSize = 1 / config.confidenceBuckets;

    for (let i = 0; i < config.confidenceBuckets; i++) {
      buckets.push({
        minConfidence: i * bucketSize,
        maxConfidence: (i + 1) * bucketSize,
        entries: [],
        avgRetrievals: 0,
        avgFeedback: 0,
        actualUtility: 0,
      });
    }

    const entryList: Array<{ entryType: 'tool' | 'guideline' | 'knowledge'; entryId: string }> = [];
    const entriesWithConfidence: Array<{
      id: string;
      type: 'tool' | 'guideline' | 'knowledge';
      confidence: number;
    }> = [];

    const knowledge = await deps.repos.knowledge.list({ scopeType, scopeId });
    for (const k of knowledge) {
      const conf = k.currentVersion?.confidence ?? 0.5;
      entriesWithConfidence.push({ id: k.id, type: 'knowledge', confidence: conf });
      entryList.push({ entryType: 'knowledge', entryId: k.id });
    }

    const guidelines = await deps.repos.guidelines.list({ scopeType, scopeId });
    for (const g of guidelines) {
      entriesWithConfidence.push({ id: g.id, type: 'guideline', confidence: 0.7 });
      entryList.push({ entryType: 'guideline', entryId: g.id });
    }

    if (entryList.length === 0) {
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const feedbackScores = await getEntryFeedbackBatch(deps.db, entryList);

    const retrievalCounts = new Map<string, number>();
    for (const entry of entryList) {
      const count = await retrievalRepo.countByEntry(entry.entryType, entry.entryId);
      retrievalCounts.set(entry.entryId, count);
    }

    for (const entry of entriesWithConfidence) {
      const bucketIdx = Math.min(
        Math.floor(entry.confidence * config.confidenceBuckets),
        config.confidenceBuckets - 1
      );
      const bucket = buckets[bucketIdx];
      if (!bucket) continue;

      const retrievalCount = retrievalCounts.get(entry.id) ?? 0;
      const feedback = feedbackScores.get(entry.id);

      bucket.entries.push({
        entryId: entry.id,
        confidence: entry.confidence,
        retrievalCount,
        feedbackScore: feedback?.netScore ?? 0,
      });
    }

    result.entriesAnalyzed = entriesWithConfidence.length;

    let validBuckets = 0;
    let totalAdjustment = 0;

    for (const bucket of buckets) {
      if (bucket.entries.length < config.minEntriesPerBucket) continue;

      validBuckets++;
      bucket.avgRetrievals =
        bucket.entries.reduce((sum, e) => sum + e.retrievalCount, 0) / bucket.entries.length;
      bucket.avgFeedback =
        bucket.entries.reduce((sum, e) => sum + e.feedbackScore, 0) / bucket.entries.length;
      bucket.actualUtility = computeActualUtility(bucket);

      const expectedUtility = (bucket.minConfidence + bucket.maxConfidence) / 2;
      const adjustment = bucket.actualUtility - expectedUtility;
      totalAdjustment += Math.abs(adjustment);
    }

    result.bucketsComputed = validBuckets;
    result.averageAdjustment = validBuckets > 0 ? totalAdjustment / validBuckets : 0;

    if (
      !request.dryRun &&
      config.storeCalibrationCurve &&
      validBuckets >= config.confidenceBuckets / 2
    ) {
      const calibrationCurve = buckets
        .filter((b) => b.entries.length >= config.minEntriesPerBucket)
        .map((b) => ({
          range: `${b.minConfidence.toFixed(2)}-${b.maxConfidence.toFixed(2)}`,
          entryCount: b.entries.length,
          avgRetrievals: b.avgRetrievals,
          avgFeedback: b.avgFeedback,
          actualUtility: b.actualUtility,
          expectedUtility: (b.minConfidence + b.maxConfidence) / 2,
          adjustment: b.actualUtility - (b.minConfidence + b.maxConfidence) / 2,
        }));

      try {
        await deps.repos.knowledge.create({
          scopeType,
          scopeId,
          title: 'Confidence calibration curve',
          category: 'context',
          content: JSON.stringify({
            computedAt: new Date().toISOString(),
            entriesAnalyzed: result.entriesAnalyzed,
            bucketsComputed: result.bucketsComputed,
            averageAdjustment: result.averageAdjustment,
            curve: calibrationCurve,
            recommendation:
              result.averageAdjustment > config.maxAdjustmentFactor
                ? 'Confidence scores are miscalibrated - consider adjusting extraction thresholds'
                : 'Confidence scores are well-calibrated',
          }),
          confidence: Math.min(validBuckets / config.confidenceBuckets, 0.9),
          source: 'relevance-calibration',
          createdBy: request.initiatedBy ?? 'librarian',
        });
        result.calibrationCurveStored = true;
      } catch (err) {
        logger.debug({ error: err }, 'Failed to store calibration curve');
      }
    }

    result.durationMs = Date.now() - startTime;
    logger.info(
      {
        entriesAnalyzed: result.entriesAnalyzed,
        bucketsComputed: result.bucketsComputed,
        calibrationCurveStored: result.calibrationCurveStored,
        averageAdjustment: result.averageAdjustment,
        durationMs: result.durationMs,
      },
      'Relevance calibration completed'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Relevance calibration failed');
    result.errors = [error instanceof Error ? error.message : String(error)];
    result.durationMs = Date.now() - startTime;
    return result;
  }
}
