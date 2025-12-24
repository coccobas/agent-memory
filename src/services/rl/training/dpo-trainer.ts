/**
 * DPO Trainer
 *
 * Direct Preference Optimization training pipeline.
 * DPO trains policies by learning from paired preferences (chosen vs rejected).
 *
 * Note: This is a placeholder that exports datasets for external training.
 * Actual model training would use external tools (e.g., Hugging Face transformers).
 */

import type { Dataset } from './dataset-builder.js';
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

// =============================================================================
// TYPES
// =============================================================================

export interface TrainingConfig {
  modelName: string;
  outputPath: string;
  epochs?: number;
  batchSize?: number;
  learningRate?: number;
  beta?: number; // KL penalty coefficient for DPO
}

export interface TrainingResult {
  success: boolean;
  modelPath?: string;
  metrics?: {
    trainLoss: number;
    evalLoss: number;
    accuracy: number;
  };
  error?: string;
}

export interface DPOPair {
  prompt: string;
  chosen: string;
  rejected: string;
}

// =============================================================================
// EXTRACTION POLICY TRAINING
// =============================================================================

/**
 * Format extraction examples for DPO training
 *
 * DPO requires pairs of (chosen, rejected) responses for the same prompt.
 * We construct pairs by grouping examples with similar state and comparing rewards.
 */
export function formatExtractionForDPO(
  examples: ExtractionTrainingExample[]
): DPOPair[] {
  const pairs: DPOPair[] = [];

  // Group by similar state (using context hash as proxy)
  const byContext = new Map<string, ExtractionTrainingExample[]>();

  for (const ex of examples) {
    // Create a simple hash of the state for grouping
    const key = hashExtractionState(ex.state);
    const group = byContext.get(key) ?? [];
    group.push(ex);
    byContext.set(key, group);
  }

  // Create pairs from groups with different rewards
  for (const group of byContext.values()) {
    if (group.length < 2) continue;

    // Sort by reward (descending)
    group.sort((a, b) => b.reward - a.reward);

    // Create pairs: best vs worst
    const best = group[0];
    const worst = group[group.length - 1];

    if (!best || !worst) continue;

    // Only create pair if there's a meaningful difference
    if (best.reward > worst.reward + 0.1) {
      pairs.push({
        prompt: formatExtractionStateAsPrompt(best.state),
        chosen: formatExtractionActionAsResponse(best.action),
        rejected: formatExtractionActionAsResponse(worst.action),
      });
    }

    // Also create pairs for middle examples if many samples
    if (group.length >= 4) {
      for (let i = 0; i < Math.min(group.length - 2, 3); i++) {
        const better = group[i];
        const worse = group[group.length - 1 - i];

        if (!better || !worse) continue;

        if (better.reward > worse.reward + 0.1) {
          pairs.push({
            prompt: formatExtractionStateAsPrompt(better.state),
            chosen: formatExtractionActionAsResponse(better.action),
            rejected: formatExtractionActionAsResponse(worse.action),
          });
        }
      }
    }
  }

  return pairs;
}

/**
 * Hash extraction state for grouping similar contexts
 */
function hashExtractionState(state: ExtractionState): string {
  // Simple hash: combine key features
  const features = [
    state.contextFeatures.turnNumber,
    state.contextFeatures.hasError ? '1' : '0',
    state.memoryState.similarEntryExists ? '1' : '0',
    state.contentFeatures.hasDecision ? '1' : '0',
    state.contentFeatures.hasRule ? '1' : '0',
    state.contentFeatures.hasFact ? '1' : '0',
    state.contentFeatures.hasCommand ? '1' : '0',
  ];
  return features.join('|');
}

/**
 * Format extraction state as a prompt
 */
function formatExtractionStateAsPrompt(state: ExtractionState): string {
  return `Context:
- Turn: ${state.contextFeatures.turnNumber}
- Tokens: ${state.contextFeatures.tokenCount}
- Tool calls: ${state.contextFeatures.toolCallCount}
- Has error: ${state.contextFeatures.hasError}

Memory State:
- Total entries: ${state.memoryState.totalEntries}
- Recent extractions: ${state.memoryState.recentExtractions}
- Similar entry exists: ${state.memoryState.similarEntryExists}

Content Features:
- Has decision: ${state.contentFeatures.hasDecision}
- Has rule: ${state.contentFeatures.hasRule}
- Has fact: ${state.contentFeatures.hasFact}
- Has command: ${state.contentFeatures.hasCommand}
- Novelty: ${state.contentFeatures.noveltyScore.toFixed(2)}
- Complexity: ${state.contentFeatures.complexity.toFixed(2)}

What action should be taken?`;
}

/**
 * Format extraction action as a response
 */
function formatExtractionActionAsResponse(action: ExtractionAction): string {
  return JSON.stringify(action, null, 2);
}

/**
 * Train extraction policy using DPO
 *
 * Note: This exports the dataset for external training.
 * Actual training would be done with external tools.
 */
export async function trainExtractionPolicy(
  dataset: Dataset<ExtractionTrainingExample>,
  config: TrainingConfig
): Promise<TrainingResult> {
  // Format training data as DPO pairs
  const trainPairs = formatExtractionForDPO(dataset.train);
  const evalPairs = formatExtractionForDPO(dataset.eval);

  // Validate sufficient training data
  if (trainPairs.length < 100) {
    return {
      success: false,
      error: `Insufficient training pairs: ${trainPairs.length} (minimum 100 required)`,
    };
  }

  // Export dataset for external training
  const fs = await import('fs/promises');
  const outputDir = config.outputPath;

  try {
    await fs.mkdir(outputDir, { recursive: true });

    // Write training data in JSONL format
    await fs.writeFile(
      `${outputDir}/extraction_dpo_train.jsonl`,
      trainPairs.map((p) => JSON.stringify(p)).join('\n')
    );

    await fs.writeFile(
      `${outputDir}/extraction_dpo_eval.jsonl`,
      evalPairs.map((p) => JSON.stringify(p)).join('\n')
    );

    // Write metadata
    await fs.writeFile(
      `${outputDir}/extraction_metadata.json`,
      JSON.stringify(
        {
          config,
          dataset: dataset.stats,
          trainPairs: trainPairs.length,
          evalPairs: evalPairs.length,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return {
      success: true,
      modelPath: outputDir,
      metrics: {
        trainLoss: 0, // Placeholder
        evalLoss: 0, // Placeholder
        accuracy: 0, // Placeholder
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// RETRIEVAL POLICY TRAINING
// =============================================================================

/**
 * Format retrieval examples for DPO training
 */
export function formatRetrievalForDPO(examples: RetrievalTrainingExample[]): DPOPair[] {
  const pairs: DPOPair[] = [];

  // Group by similar state
  const byQuery = new Map<string, RetrievalTrainingExample[]>();

  for (const ex of examples) {
    const key = hashRetrievalState(ex.state);
    const group = byQuery.get(key) ?? [];
    group.push(ex);
    byQuery.set(key, group);
  }

  // Create pairs
  for (const group of byQuery.values()) {
    if (group.length < 2) continue;

    group.sort((a, b) => b.reward - a.reward);

    const best = group[0];
    const worst = group[group.length - 1];

    if (!best || !worst) continue;

    if (best.reward > worst.reward + 0.1) {
      pairs.push({
        prompt: formatRetrievalStateAsPrompt(best.state),
        chosen: formatRetrievalActionAsResponse(best.action),
        rejected: formatRetrievalActionAsResponse(worst.action),
      });
    }
  }

  return pairs;
}

function hashRetrievalState(state: RetrievalState): string {
  const features = [
    Math.floor(state.queryFeatures.queryLength / 10),
    state.queryFeatures.hasKeywords ? '1' : '0',
    state.queryFeatures.semanticCategory,
  ];
  return features.join('|');
}

function formatRetrievalStateAsPrompt(state: RetrievalState): string {
  return `Query Features:
- Length: ${state.queryFeatures.queryLength}
- Has keywords: ${state.queryFeatures.hasKeywords}
- Complexity: ${state.queryFeatures.queryComplexity.toFixed(2)}
- Category: ${state.queryFeatures.semanticCategory}

Context:
- Turn: ${state.contextFeatures.turnNumber}
- Depth: ${state.contextFeatures.conversationDepth}
- Recent tool calls: ${state.contextFeatures.recentToolCalls}
- Has errors: ${state.contextFeatures.hasErrors}

Memory Stats:
- Total entries: ${state.memoryStats.totalEntries}
- Recent retrievals: ${state.memoryStats.recentRetrievals}
- Avg success: ${state.memoryStats.avgRetrievalSuccess.toFixed(2)}

Should retrieve from memory?`;
}

function formatRetrievalActionAsResponse(action: RetrievalAction): string {
  return JSON.stringify(action, null, 2);
}

/**
 * Train retrieval policy using DPO
 */
export async function trainRetrievalPolicy(
  dataset: Dataset<RetrievalTrainingExample>,
  config: TrainingConfig
): Promise<TrainingResult> {
  const trainPairs = formatRetrievalForDPO(dataset.train);
  const evalPairs = formatRetrievalForDPO(dataset.eval);

  if (trainPairs.length < 100) {
    return {
      success: false,
      error: `Insufficient training pairs: ${trainPairs.length} (minimum 100 required)`,
    };
  }

  const fs = await import('fs/promises');
  const outputDir = config.outputPath;

  try {
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(
      `${outputDir}/retrieval_dpo_train.jsonl`,
      trainPairs.map((p) => JSON.stringify(p)).join('\n')
    );

    await fs.writeFile(
      `${outputDir}/retrieval_dpo_eval.jsonl`,
      evalPairs.map((p) => JSON.stringify(p)).join('\n')
    );

    await fs.writeFile(
      `${outputDir}/retrieval_metadata.json`,
      JSON.stringify(
        {
          config,
          dataset: dataset.stats,
          trainPairs: trainPairs.length,
          evalPairs: evalPairs.length,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return {
      success: true,
      modelPath: outputDir,
      metrics: { trainLoss: 0, evalLoss: 0, accuracy: 0 },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// CONSOLIDATION POLICY TRAINING
// =============================================================================

/**
 * Format consolidation examples for DPO training
 */
export function formatConsolidationForDPO(
  examples: ConsolidationTrainingExample[]
): DPOPair[] {
  const pairs: DPOPair[] = [];

  // Group by similar state
  const byGroup = new Map<string, ConsolidationTrainingExample[]>();

  for (const ex of examples) {
    const key = hashConsolidationState(ex.state);
    const group = byGroup.get(key) ?? [];
    group.push(ex);
    byGroup.set(key, group);
  }

  // Create pairs
  for (const group of byGroup.values()) {
    if (group.length < 2) continue;

    group.sort((a, b) => b.reward - a.reward);

    const best = group[0];
    const worst = group[group.length - 1];

    if (!best || !worst) continue;

    if (best.reward > worst.reward + 0.1) {
      pairs.push({
        prompt: formatConsolidationStateAsPrompt(best.state),
        chosen: formatConsolidationActionAsResponse(best.action),
        rejected: formatConsolidationActionAsResponse(worst.action),
      });
    }
  }

  return pairs;
}

function hashConsolidationState(state: ConsolidationState): string {
  const features = [
    state.groupFeatures.groupSize,
    Math.floor(state.groupFeatures.avgSimilarity * 10),
    state.scopeStats.scopeType,
  ];
  return features.join('|');
}

function formatConsolidationStateAsPrompt(state: ConsolidationState): string {
  return `Group Features:
- Size: ${state.groupFeatures.groupSize}
- Avg similarity: ${state.groupFeatures.avgSimilarity.toFixed(2)}
- Min similarity: ${state.groupFeatures.minSimilarity.toFixed(2)}
- Max similarity: ${state.groupFeatures.maxSimilarity.toFixed(2)}
- Entry types: ${state.groupFeatures.entryTypes.join(', ')}

Usage Stats:
- Total retrievals: ${state.usageStats.totalRetrievals}
- Avg rank: ${state.usageStats.avgRetrievalRank.toFixed(2)}
- Success rate: ${state.usageStats.successRate.toFixed(2)}
- Days since access: ${state.usageStats.lastAccessedDaysAgo}

Scope Stats:
- Type: ${state.scopeStats.scopeType}
- Total entries: ${state.scopeStats.totalEntriesInScope}
- Duplicate ratio: ${state.scopeStats.duplicateRatio.toFixed(2)}

What consolidation action should be taken?`;
}

function formatConsolidationActionAsResponse(action: ConsolidationAction): string {
  return JSON.stringify(action, null, 2);
}

/**
 * Train consolidation policy using DPO
 */
export async function trainConsolidationPolicy(
  dataset: Dataset<ConsolidationTrainingExample>,
  config: TrainingConfig
): Promise<TrainingResult> {
  const trainPairs = formatConsolidationForDPO(dataset.train);
  const evalPairs = formatConsolidationForDPO(dataset.eval);

  if (trainPairs.length < 100) {
    return {
      success: false,
      error: `Insufficient training pairs: ${trainPairs.length} (minimum 100 required)`,
    };
  }

  const fs = await import('fs/promises');
  const outputDir = config.outputPath;

  try {
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(
      `${outputDir}/consolidation_dpo_train.jsonl`,
      trainPairs.map((p) => JSON.stringify(p)).join('\n')
    );

    await fs.writeFile(
      `${outputDir}/consolidation_dpo_eval.jsonl`,
      evalPairs.map((p) => JSON.stringify(p)).join('\n')
    );

    await fs.writeFile(
      `${outputDir}/consolidation_metadata.json`,
      JSON.stringify(
        {
          config,
          dataset: dataset.stats,
          trainPairs: trainPairs.length,
          evalPairs: evalPairs.length,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return {
      success: true,
      modelPath: outputDir,
      metrics: { trainLoss: 0, evalLoss: 0, accuracy: 0 },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
