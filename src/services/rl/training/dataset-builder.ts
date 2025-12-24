/**
 * Dataset Builder
 *
 * Builds training datasets from feedback data for RL policy training.
 * Converts feedback samples into structured training examples with state/action/reward.
 */

import { getFeedbackService } from '../../feedback/index.js';
import type {
  ExtractionTrainingExample,
  RetrievalTrainingExample,
  ConsolidationTrainingExample,
  ExtractionState,
  RetrievalState,
  ConsolidationState,
  ExtractionAction,
  RetrievalAction,
  ConsolidationAction,
} from '../types.js';
import type { ExportParams } from '../../feedback/types.js';

// =============================================================================
// TYPES
// =============================================================================

export interface DatasetParams {
  startDate?: string;
  endDate?: string;
  minConfidence?: number;
  maxExamples?: number;
  evalSplit?: number;
}

export interface Dataset<T> {
  train: T[];
  eval: T[];
  stats: {
    totalExamples: number;
    trainExamples: number;
    evalExamples: number;
    dateRange: { start: string; end: string };
  };
}

// =============================================================================
// EXTRACTION DATASET
// =============================================================================

/**
 * Build extraction training dataset from feedback
 *
 * Converts extraction samples into structured training examples with:
 * - State features (context, memory, content)
 * - Action taken (store/skip/defer)
 * - Reward signal (outcome score)
 */
export async function buildExtractionDataset(
  params: DatasetParams = {}
): Promise<Dataset<ExtractionTrainingExample>> {
  const feedbackService = getFeedbackService();
  if (!feedbackService) {
    throw new Error('Feedback service not initialized');
  }

  // Export training data from feedback service
  const exportParams: ExportParams = {
    startDate: params.startDate,
    endDate: params.endDate,
    onlyWithOutcomes: true, // Only include samples with known outcomes
    limit: params.maxExamples,
  };

  const data = await feedbackService.exportTrainingData(exportParams);

  // Convert extraction samples to training examples
  const examples: ExtractionTrainingExample[] = [];

  for (const sample of data.extraction.samples) {
    // Skip if no outcome score or below confidence threshold
    if (sample.outcomeScore === undefined) continue;
    if (params.minConfidence && sample.confidence && sample.confidence < params.minConfidence) {
      continue;
    }

    // Construct state features from sample metadata
    // Note: In a real implementation, these would be extracted from the actual context
    const state: ExtractionState = {
      contextFeatures: {
        turnNumber: sample.turnNumber ?? 0,
        tokenCount: 0, // TODO: Extract from context
        toolCallCount: 0, // TODO: Extract from context
        hasError: false, // TODO: Extract from context
        userTurnCount: 0, // TODO: Extract from context
        assistantTurnCount: 0, // TODO: Extract from context
      },
      memoryState: {
        totalEntries: 0, // TODO: Query from memory stats
        recentExtractions: 0, // TODO: Query from recent decisions
        similarEntryExists: false, // TODO: Check for duplicates
        sessionCaptureCount: 0, // TODO: Count session captures
      },
      contentFeatures: {
        hasDecision: sample.entryType === 'knowledge',
        hasRule: sample.entryType === 'guideline',
        hasFact: sample.entryType === 'knowledge',
        hasCommand: sample.entryType === 'tool',
        noveltyScore: 0.5, // TODO: Compute from similarity
        complexity: 0.5, // TODO: Compute from content
      },
    };

    // Construct action from decision
    const action: ExtractionAction = {
      decision: sample.decision as 'store' | 'skip' | 'defer',
      entryType: sample.entryType,
      priority: 50, // Default priority
    };

    examples.push({
      state,
      action,
      reward: sample.outcomeScore,
      metadata: {
        sessionId: sample.sessionId,
        turnNumber: sample.turnNumber ?? 0,
        outcomeType: 'extraction',
      },
    });
  }

  // Split into train/eval
  return splitDataset(examples, params.evalSplit ?? 0.2, params.startDate, params.endDate);
}

// =============================================================================
// RETRIEVAL DATASET
// =============================================================================

/**
 * Build retrieval training dataset from feedback
 *
 * Converts retrieval samples into training examples with:
 * - State features (query, context, memory stats)
 * - Action taken (shouldRetrieve, scope, types)
 * - Reward signal (contribution score)
 */
export async function buildRetrievalDataset(
  params: DatasetParams = {}
): Promise<Dataset<RetrievalTrainingExample>> {
  const feedbackService = getFeedbackService();
  if (!feedbackService) {
    throw new Error('Feedback service not initialized');
  }

  // Export training data from feedback service
  const exportParams: ExportParams = {
    startDate: params.startDate,
    endDate: params.endDate,
    onlyWithOutcomes: true,
    limit: params.maxExamples,
  };

  const data = await feedbackService.exportTrainingData(exportParams);

  // Convert retrieval samples to training examples
  const examples: RetrievalTrainingExample[] = [];

  for (const sample of data.retrieval.samples) {
    // Skip if no contribution score
    if (sample.contributionScore === undefined) continue;

    // Construct state features
    const state: RetrievalState = {
      queryFeatures: {
        queryLength: sample.queryText?.length ?? 0,
        hasKeywords: !!sample.queryText,
        queryComplexity: 0.5, // TODO: Compute from query
        semanticCategory: 'unknown', // TODO: Classify query
      },
      contextFeatures: {
        turnNumber: 0, // TODO: Extract from session
        conversationDepth: 0, // TODO: Count turns
        recentToolCalls: 0, // TODO: Count recent tool calls
        hasErrors: false, // TODO: Check for errors
      },
      memoryStats: {
        totalEntries: 0, // TODO: Query from memory
        recentRetrievals: 0, // TODO: Count recent retrievals
        avgRetrievalSuccess: 0, // TODO: Compute from history
        lastRetrievalTime: undefined,
      },
    };

    // Construct action (retrieval was performed, so shouldRetrieve = true)
    const action: RetrievalAction = {
      shouldRetrieve: true,
      scope: 'project', // TODO: Extract from retrieval context
      types: [sample.entryType],
      maxResults: 10, // Default
    };

    examples.push({
      state,
      action,
      reward: sample.contributionScore,
      metadata: {
        sessionId: sample.sessionId,
        queryText: sample.queryText,
        outcomeType: 'retrieval',
      },
    });
  }

  // Split into train/eval
  return splitDataset(examples, params.evalSplit ?? 0.2, params.startDate, params.endDate);
}

// =============================================================================
// CONSOLIDATION DATASET
// =============================================================================

/**
 * Build consolidation training dataset from feedback
 *
 * Converts consolidation samples into training examples with:
 * - State features (group similarity, usage stats, scope)
 * - Action taken (merge/dedupe/archive/abstract/keep)
 * - Reward signal (outcome score)
 */
export async function buildConsolidationDataset(
  params: DatasetParams = {}
): Promise<Dataset<ConsolidationTrainingExample>> {
  const feedbackService = getFeedbackService();
  if (!feedbackService) {
    throw new Error('Feedback service not initialized');
  }

  // Export training data from feedback service
  const exportParams: ExportParams = {
    startDate: params.startDate,
    endDate: params.endDate,
    onlyWithOutcomes: true,
    limit: params.maxExamples,
  };

  const data = await feedbackService.exportTrainingData(exportParams);

  // Convert consolidation samples to training examples
  const examples: ConsolidationTrainingExample[] = [];

  for (const sample of data.consolidation.samples) {
    // Skip if no outcome score
    if (sample.outcomeScore === undefined) continue;

    // Construct state features
    const state: ConsolidationState = {
      groupFeatures: {
        groupSize: sample.sourceEntryIds.length,
        avgSimilarity: sample.similarityScore ?? 0.5,
        minSimilarity: sample.similarityScore ?? 0.5,
        maxSimilarity: sample.similarityScore ?? 0.5,
        entryTypes: [], // TODO: Extract from entries
      },
      usageStats: {
        totalRetrievals: 0, // TODO: Query from feedback
        avgRetrievalRank: 0, // TODO: Compute from retrievals
        successRate: sample.preSuccessRate ?? 0,
        lastAccessedDaysAgo: 0, // TODO: Compute from last access
      },
      scopeStats: {
        scopeType: sample.scopeType,
        totalEntriesInScope: 0, // TODO: Query from memory
        duplicateRatio: 0, // TODO: Compute from similarity
      },
    };

    // Construct action
    const action: ConsolidationAction = {
      action: sample.action as 'merge' | 'dedupe' | 'archive' | 'abstract' | 'keep',
      targetEntries: sample.targetEntryId ? [sample.targetEntryId] : undefined,
      mergeStrategy: 'union', // Default
    };

    examples.push({
      state,
      action,
      reward: sample.outcomeScore,
      metadata: {
        decisionId: sample.decisionId,
        entryIds: sample.sourceEntryIds,
      },
    });
  }

  // Split into train/eval
  return splitDataset(examples, params.evalSplit ?? 0.2, params.startDate, params.endDate);
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Split dataset into train and eval sets
 */
function splitDataset<T>(
  examples: T[],
  evalSplit: number,
  startDate?: string,
  endDate?: string
): Dataset<T> {
  // Shuffle before splitting for random distribution
  const shuffled = [...examples].sort(() => Math.random() - 0.5);

  // Split at the specified ratio
  const splitIdx = Math.floor(shuffled.length * (1 - evalSplit));

  const train = shuffled.slice(0, splitIdx);
  const eval_ = shuffled.slice(splitIdx);

  // Determine date range
  const now = new Date().toISOString();
  const dateRange = {
    start: startDate ?? new Date(0).toISOString(),
    end: endDate ?? now,
  };

  return {
    train,
    eval: eval_,
    stats: {
      totalExamples: examples.length,
      trainExamples: train.length,
      evalExamples: eval_.length,
      dateRange,
    },
  };
}
