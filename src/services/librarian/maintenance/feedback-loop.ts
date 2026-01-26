import { createComponentLogger } from '../../../utils/logger.js';
import type { Repositories } from '../../../core/interfaces/repositories.js';
import type { ScopeType } from '../../../db/schema.js';
import type {
  FeedbackLoopConfig,
  FeedbackLoopResult,
  ExtractionQualityResult,
  DuplicateRefinementResult,
  CategoryAccuracyResult,
  RelevanceCalibrationResult,
} from './types.js';

const logger = createComponentLogger('feedback-loop');

export interface FeedbackLoopDeps {
  repos: Repositories;
}

export interface AccuracySignals {
  extractionQuality?: ExtractionQualityResult;
  duplicateRefinement?: DuplicateRefinementResult;
  categoryAccuracy?: CategoryAccuracyResult;
  relevanceCalibration?: RelevanceCalibrationResult;
}

interface ImprovementDecision {
  type: 'policy_weight' | 'threshold' | 'category_mapping';
  target: string;
  currentValue: number | string;
  suggestedValue: number | string;
  confidence: number;
  rationale: string;
}

function aggregateSignals(signals: AccuracySignals): ImprovementDecision[] {
  const decisions: ImprovementDecision[] = [];

  if (signals.extractionQuality?.executed) {
    const eq = signals.extractionQuality;
    if (eq.lowValuePatternsFound > eq.highValuePatternsFound * 2) {
      decisions.push({
        type: 'policy_weight',
        target: 'extraction_threshold',
        currentValue: 0.5,
        suggestedValue: 0.6,
        confidence: Math.min(eq.lowValuePatternsFound / 20, 0.8),
        rationale: `High ratio of low-value patterns (${eq.lowValuePatternsFound}) vs high-value (${eq.highValuePatternsFound})`,
      });
    }
  }

  if (signals.duplicateRefinement?.executed) {
    const dr = signals.duplicateRefinement;
    if (dr.thresholdAdjustments > 0) {
      decisions.push({
        type: 'threshold',
        target: 'duplicate_similarity_threshold',
        currentValue: 0.85,
        suggestedValue: 0.88,
        confidence: 0.7,
        rationale: `Threshold adjustment recommended based on ${dr.candidatesAnalyzed} analyzed pairs`,
      });
    }
  }

  if (signals.categoryAccuracy?.executed) {
    const ca = signals.categoryAccuracy;
    const miscatRate = ca.entriesAnalyzed > 0 ? ca.miscategorizationsFound / ca.entriesAnalyzed : 0;
    if (miscatRate > 0.2) {
      decisions.push({
        type: 'category_mapping',
        target: 'auto_categorization',
        currentValue: 'enabled',
        suggestedValue: 'review_needed',
        confidence: Math.min(miscatRate, 0.9),
        rationale: `${(miscatRate * 100).toFixed(1)}% miscategorization rate detected`,
      });
    }
  }

  if (signals.relevanceCalibration?.executed) {
    const rc = signals.relevanceCalibration;
    if (rc.averageAdjustment > 0.15) {
      decisions.push({
        type: 'policy_weight',
        target: 'confidence_weight',
        currentValue: 1.0,
        suggestedValue: 1.0 - rc.averageAdjustment,
        confidence: Math.min(rc.bucketsComputed / 5, 0.8),
        rationale: `Average calibration adjustment of ${(rc.averageAdjustment * 100).toFixed(1)}%`,
      });
    }
  }

  return decisions;
}

export async function runFeedbackLoop(
  deps: FeedbackLoopDeps,
  request: {
    scopeType: ScopeType;
    scopeId?: string;
    dryRun?: boolean;
    initiatedBy?: string;
  },
  config: FeedbackLoopConfig,
  signals: AccuracySignals
): Promise<FeedbackLoopResult> {
  const startTime = Date.now();
  const result: FeedbackLoopResult = {
    executed: true,
    signalsProcessed: 0,
    improvementsApplied: 0,
    policyUpdates: 0,
    thresholdUpdates: 0,
    decisionsStored: 0,
    durationMs: 0,
  };

  try {
    const scopeType = request.scopeType as 'global' | 'org' | 'project' | 'session';
    const scopeId = request.scopeId;

    let signalCount = 0;
    if (signals.extractionQuality?.executed) signalCount++;
    if (signals.duplicateRefinement?.executed) signalCount++;
    if (signals.categoryAccuracy?.executed) signalCount++;
    if (signals.relevanceCalibration?.executed) signalCount++;

    result.signalsProcessed = signalCount;

    if (signalCount === 0) {
      logger.debug('No signals to process in feedback loop');
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const decisions = aggregateSignals(signals);
    const applicableDecisions = decisions
      .filter((d) => d.confidence >= config.minConfidenceForApplication)
      .slice(0, config.maxImprovementsPerRun);

    for (const decision of applicableDecisions) {
      if (request.dryRun) {
        result.improvementsApplied++;
        if (decision.type === 'policy_weight') result.policyUpdates++;
        if (decision.type === 'threshold') result.thresholdUpdates++;
        continue;
      }

      if (decision.type === 'policy_weight' && config.updatePolicyWeights) {
        result.policyUpdates++;
        result.improvementsApplied++;
        logger.info(
          { target: decision.target, from: decision.currentValue, to: decision.suggestedValue },
          'Policy weight update suggested'
        );
      }

      if (decision.type === 'threshold' && config.updateThresholds) {
        result.thresholdUpdates++;
        result.improvementsApplied++;
        logger.info(
          { target: decision.target, from: decision.currentValue, to: decision.suggestedValue },
          'Threshold update suggested'
        );
      }

      if (decision.type === 'category_mapping') {
        result.improvementsApplied++;
        logger.info(
          { target: decision.target, rationale: decision.rationale },
          'Category mapping review suggested'
        );
      }
    }

    if (!request.dryRun && config.storeImprovementDecisions && applicableDecisions.length > 0) {
      try {
        await deps.repos.knowledge.create({
          scopeType,
          scopeId,
          title: 'Feedback loop improvement decisions',
          category: 'decision',
          content: JSON.stringify({
            executedAt: new Date().toISOString(),
            signalsProcessed: result.signalsProcessed,
            decisions: applicableDecisions.map((d) => ({
              type: d.type,
              target: d.target,
              current: d.currentValue,
              suggested: d.suggestedValue,
              confidence: d.confidence,
              rationale: d.rationale,
            })),
            summary: {
              policyUpdates: result.policyUpdates,
              thresholdUpdates: result.thresholdUpdates,
              totalImprovements: result.improvementsApplied,
            },
          }),
          confidence:
            applicableDecisions.reduce((sum, d) => sum + d.confidence, 0) /
            applicableDecisions.length,
          source: 'feedback-loop',
          createdBy: request.initiatedBy ?? 'librarian',
        });
        result.decisionsStored = 1;
      } catch (err) {
        logger.debug({ error: err }, 'Failed to store improvement decisions');
      }
    }

    result.durationMs = Date.now() - startTime;
    logger.info(
      {
        signalsProcessed: result.signalsProcessed,
        improvementsApplied: result.improvementsApplied,
        policyUpdates: result.policyUpdates,
        thresholdUpdates: result.thresholdUpdates,
        decisionsStored: result.decisionsStored,
        durationMs: result.durationMs,
      },
      'Feedback loop completed'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Feedback loop failed');
    result.errors = [error instanceof Error ? error.message : String(error)];
    result.durationMs = Date.now() - startTime;
    return result;
  }
}
