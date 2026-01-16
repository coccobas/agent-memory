/**
 * Dataset Builder
 *
 * Builds training datasets from feedback data for RL policy training.
 * Converts feedback samples into structured training examples with state/action/reward.
 */

import { getFeedbackService } from '../../feedback/index.js';
import { createServiceUnavailableError } from '../../../core/errors.js';
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
    throw createServiceUnavailableError('feedback service', 'not initialized');
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
    // Features are derived from available sample data; some use reasonable defaults
    // when context is not stored in training samples
    const turnNumber = sample.turnNumber ?? 0;
    const state: ExtractionState = {
      contextFeatures: {
        turnNumber,
        // Estimate tokens based on turn number (avg ~500 tokens per turn)
        tokenCount: turnNumber * 500,
        // Estimate tool calls based on turn number (avg 2 per turn)
        toolCallCount: Math.floor(turnNumber * 2),
        // Check if outcome suggests an error occurred
        hasError: sample.outcomeScore !== undefined && sample.outcomeScore < 0,
        // Estimate turn distribution (roughly equal user/assistant)
        userTurnCount: Math.ceil(turnNumber / 2),
        assistantTurnCount: Math.floor(turnNumber / 2),
      },
      memoryState: {
        // Estimate based on retrieval/success counts if available
        totalEntries: (sample.retrievalCount ?? 0) * 10,
        recentExtractions: sample.retrievalCount ?? 0,
        // If confidence is low, similar entry may exist
        similarEntryExists: (sample.confidence ?? 1) < 0.5,
        // Estimate session captures from retrieval count
        sessionCaptureCount: Math.max(1, sample.retrievalCount ?? 1),
      },
      contentFeatures: {
        hasDecision: sample.entryType === 'knowledge',
        hasRule: sample.entryType === 'guideline',
        hasFact: sample.entryType === 'knowledge',
        hasCommand: sample.entryType === 'tool',
        // Higher confidence suggests more novel content
        noveltyScore: sample.confidence ?? 0.5,
        // Estimate complexity from entry type (tools more complex)
        complexity: sample.entryType === 'tool' ? 0.7 : 0.5,
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
    throw createServiceUnavailableError('feedback service', 'not initialized');
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
    // Query complexity computed from length and special characters
    const queryLength = sample.queryText?.length ?? 0;
    const hasOperators = sample.queryText ? /[&|"()]/.test(sample.queryText) : false;
    const wordCount = sample.queryText ? sample.queryText.split(/\s+/).length : 0;
    const queryComplexity = Math.min(1, wordCount / 20 + (hasOperators ? 0.3 : 0));

    // Categorize query based on keywords
    const queryLower = sample.queryText?.toLowerCase() ?? '';
    let semanticCategory: string = 'general';
    if (/\b(error|bug|fix|issue)\b/.test(queryLower)) semanticCategory = 'debugging';
    else if (/\b(how|what|why|when)\b/.test(queryLower)) semanticCategory = 'question';
    else if (/\b(create|add|implement|build)\b/.test(queryLower)) semanticCategory = 'creation';
    else if (/\b(find|search|get|list)\b/.test(queryLower)) semanticCategory = 'lookup';

    const state: RetrievalState = {
      queryFeatures: {
        queryLength,
        hasKeywords: !!sample.queryText,
        queryComplexity,
        semanticCategory,
      },
      contextFeatures: {
        // Estimate turn from retrieval rank (higher ranks often from later turns)
        turnNumber: sample.retrievalRank ?? 1,
        conversationDepth: sample.retrievalRank ?? 1,
        // Estimate tool calls based on retrieval context
        recentToolCalls: sample.retrievalRank ? Math.min(5, sample.retrievalRank) : 1,
        // Contribution < 0 suggests errors in context
        hasErrors: (sample.contributionScore ?? 0) < 0,
      },
      memoryStats: {
        // Estimate from retrieval rank (higher rank = more entries)
        totalEntries: (sample.retrievalRank ?? 1) * 10,
        recentRetrievals: sample.retrievalRank ?? 1,
        // Compute from contribution score normalized to 0-1
        avgRetrievalSuccess: Math.max(0, Math.min(1, (sample.contributionScore ?? 0) / 2 + 0.5)),
        // Convert ISO string to timestamp for lastRetrievalTime
        lastRetrievalTime: sample.retrievedAt ? new Date(sample.retrievedAt).getTime() : undefined,
      },
    };

    // Construct action (retrieval was performed, so shouldRetrieve = true)
    const action: RetrievalAction = {
      shouldRetrieve: true,
      // Default to project scope; inherit scope not stored in sample
      scope: 'project',
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
    throw createServiceUnavailableError('feedback service', 'not initialized');
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
    // Estimate entry types from action taken
    // Using type assertion to match EntryType union: 'tool' | 'guideline' | 'knowledge' | 'project' | 'experience'
    const entryTypes: Array<'tool' | 'guideline' | 'knowledge' | 'project' | 'experience'> = [];
    if (sample.action === 'merge' || sample.action === 'dedupe') {
      // Merging typically happens with same-type entries
      entryTypes.push('knowledge');
    } else if (sample.action === 'archive') {
      // Archiving can happen to any type
      entryTypes.push('knowledge', 'tool', 'guideline');
    }

    // Compute days since decision for lastAccessedDaysAgo estimate
    const decisionDate = new Date(sample.decidedAt);
    const now = new Date();
    const daysSinceDecision = Math.floor(
      (now.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const state: ConsolidationState = {
      groupFeatures: {
        groupSize: sample.sourceEntryIds.length,
        avgSimilarity: sample.similarityScore ?? 0.5,
        minSimilarity: (sample.similarityScore ?? 0.5) - 0.1,
        maxSimilarity: Math.min(1, (sample.similarityScore ?? 0.5) + 0.1),
        entryTypes,
      },
      usageStats: {
        // Estimate retrievals from rate and window
        totalRetrievals: Math.round((sample.preRetrievalRate ?? 0) * 30),
        // Estimate avg rank from group size (smaller groups = better ranked)
        avgRetrievalRank: Math.min(10, sample.sourceEntryIds.length * 2),
        successRate: sample.preSuccessRate ?? 0,
        // Days since decision as proxy for last access
        lastAccessedDaysAgo: Math.max(0, daysSinceDecision),
      },
      scopeStats: {
        scopeType: sample.scopeType,
        // Estimate total entries from group size and similarity
        totalEntriesInScope: sample.sourceEntryIds.length * 10,
        // Higher similarity = more duplicates
        duplicateRatio: sample.similarityScore ?? 0.5,
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
