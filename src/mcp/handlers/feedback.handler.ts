/**
 * Feedback handlers
 *
 * Handlers for querying and exporting RL feedback data
 */

import type { AppContext } from '../../core/context.js';
import { getFeedbackService } from '../../services/feedback/index.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isBoolean,
  isArrayOfStrings,
} from '../../utils/type-guards.js';
import { createValidationError } from '../../core/errors.js';
import type { ExportParams, EntryType, OutcomeType } from '../../services/feedback/types.js';

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * List retrieval events for a session
 */
async function listRetrievals(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<{ retrievals: unknown[]; count: number }> {
  const sessionId = getRequiredParam(params, 'sessionId', isString);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 100;

  const feedbackService = getFeedbackService();
  if (!feedbackService) {
    throw createValidationError('feedback', 'Feedback service not initialized');
  }

  const retrievals = await feedbackService.getSessionRetrievals(sessionId);
  const limited = retrievals.slice(0, limit);

  return {
    retrievals: limited,
    count: limited.length,
  };
}

/**
 * List task outcomes for a session
 */
async function listOutcomes(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<{ outcomes: unknown[]; count: number }> {
  const sessionId = getRequiredParam(params, 'sessionId', isString);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 100;

  const feedbackService = getFeedbackService();
  if (!feedbackService) {
    throw createValidationError('feedback', 'Feedback service not initialized');
  }

  // Get outcomes via export (using sessionId filter when available)
  const data = await feedbackService.exportTrainingData({
    limit,
  });

  // Filter by sessionId (the export doesn't support it directly yet)
  const outcomes = data.retrieval.samples.filter((s) => s.sessionId === sessionId);

  return {
    outcomes: outcomes.slice(0, limit),
    count: outcomes.length,
  };
}

/**
 * List extraction/consolidation decisions
 */
async function listDecisions(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<{ decisions: unknown[]; count: number }> {
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const policyType = getOptionalParam(params, 'policyType', isString) ?? 'extraction';
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 100;

  const feedbackService = getFeedbackService();
  if (!feedbackService) {
    throw createValidationError('feedback', 'Feedback service not initialized');
  }

  const data = await feedbackService.exportTrainingData({
    limit,
  });

  let decisions: unknown[] = [];

  if (policyType === 'extraction') {
    decisions = data.extraction.samples;
  } else if (policyType === 'consolidation') {
    decisions = data.consolidation.samples;
  }

  // Filter by sessionId if provided
  if (sessionId) {
    decisions = decisions.filter((d: any) => d.sessionId === sessionId);
  }

  return {
    decisions: decisions.slice(0, limit),
    count: decisions.length,
  };
}

/**
 * Export training dataset for a policy type
 */
async function exportTrainingData(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const policyType = getOptionalParam(params, 'policyType', isString);
  const startDate = getOptionalParam(params, 'startDate', isString);
  const endDate = getOptionalParam(params, 'endDate', isString);
  const onlyWithOutcomes = getOptionalParam(params, 'onlyWithOutcomes', isBoolean) ?? false;
  const limit = getOptionalParam(params, 'limit', isNumber);
  const entryTypes = getOptionalParam(params, 'entryTypes', isArrayOfStrings);
  const outcomeTypes = getOptionalParam(params, 'outcomeTypes', isArrayOfStrings);

  const feedbackService = getFeedbackService();
  if (!feedbackService) {
    throw createValidationError('feedback', 'Feedback service not initialized');
  }

  const exportParams: ExportParams = {
    startDate,
    endDate,
    onlyWithOutcomes,
    limit,
    entryTypes: entryTypes as EntryType[] | undefined,
    outcomeTypes: outcomeTypes as OutcomeType[] | undefined,
  };

  const data = await feedbackService.exportTrainingData(exportParams);

  // If specific policy type requested, return only that data
  if (policyType === 'extraction') {
    return {
      metadata: data.metadata,
      samples: data.extraction.samples,
      count: data.extraction.count,
      stats: data.stats,
    };
  } else if (policyType === 'retrieval') {
    return {
      metadata: data.metadata,
      samples: data.retrieval.samples,
      count: data.retrieval.count,
      stats: data.stats,
    };
  } else if (policyType === 'consolidation') {
    return {
      metadata: data.metadata,
      samples: data.consolidation.samples,
      count: data.consolidation.count,
      stats: data.stats,
    };
  }

  // Return full dataset
  return data;
}

/**
 * Get feedback collection statistics
 */
async function stats(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const startDate = getOptionalParam(params, 'startDate', isString);
  const endDate = getOptionalParam(params, 'endDate', isString);

  const feedbackService = getFeedbackService();
  if (!feedbackService) {
    throw createValidationError('feedback', 'Feedback service not initialized');
  }

  // Get stats via export
  const data = await feedbackService.exportTrainingData({
    startDate,
    endDate,
  });

  return {
    config: feedbackService.getConfig(),
    stats: data.stats,
    metadata: data.metadata,
    counts: {
      retrievals: data.retrieval.count,
      extractions: data.extraction.count,
      consolidations: data.consolidation.count,
    },
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export const feedbackHandlers = {
  listRetrievals,
  listOutcomes,
  listDecisions,
  export: exportTrainingData,
  stats,
};
