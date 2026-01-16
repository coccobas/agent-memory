/**
 * HuggingFace Dataset Exporter
 *
 * Export RL training data in HuggingFace datasets format.
 * Supports loading with: datasets.load_dataset('json', data_files='...')
 *
 * NOTE: Converts dynamic policy-specific state to HuggingFace format.
 * ESLint unsafe-member-access warnings are suppressed for type conversions.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */

import type {
  ExtractionTrainingExample,
  RetrievalTrainingExample,
  ConsolidationTrainingExample,
} from '../../types.js';
import type { Dataset } from '../dataset-builder.js';
import type { PolicyType, HuggingFaceDatasetInfo, ExportResult } from './types.js';

// =============================================================================
// HUGGINGFACE EXPORT
// =============================================================================

/**
 * Export dataset in HuggingFace format
 *
 * Creates JSON files compatible with HuggingFace datasets library.
 * Uses JSON instead of Arrow/Parquet to avoid native dependencies.
 *
 * @param dataset - Dataset to export
 * @param policy - Policy type
 * @param outputPath - Output directory
 * @param includeMetadata - Include metadata fields
 */
export async function exportHuggingFace(
  dataset: Dataset<any>,
  policy: PolicyType,
  outputPath: string,
  includeMetadata = true
): Promise<ExportResult> {
  const fs = await import('fs/promises');

  try {
    // Ensure output directory exists
    await fs.mkdir(outputPath, { recursive: true });

    // Convert examples to HuggingFace format
    const trainData = dataset.train.map((ex) =>
      convertToHuggingFaceFormat(ex, policy, includeMetadata)
    );
    const evalData = dataset.eval.map((ex) =>
      convertToHuggingFaceFormat(ex, policy, includeMetadata)
    );

    // Write train split
    const trainPath = `${outputPath}/train.json`;
    await fs.writeFile(trainPath, JSON.stringify(trainData, null, 2));

    // Write eval split
    const evalPath = `${outputPath}/test.json`;
    await fs.writeFile(evalPath, JSON.stringify(evalData, null, 2));

    // Create dataset_dict.json for HuggingFace
    const datasetDict = {
      splits: {
        train: {
          name: 'train',
          num_examples: trainData.length,
          dataset_name: `${policy}_policy`,
        },
        test: {
          name: 'test',
          num_examples: evalData.length,
          dataset_name: `${policy}_policy`,
        },
      },
    };

    const dictPath = `${outputPath}/dataset_dict.json`;
    await fs.writeFile(dictPath, JSON.stringify(datasetDict, null, 2));

    // Create dataset info
    const datasetInfo = createDatasetInfo(policy, dataset);
    const infoPath = `${outputPath}/dataset_info.json`;
    await fs.writeFile(infoPath, JSON.stringify(datasetInfo, null, 2));

    // Create README
    const readmePath = `${outputPath}/README.md`;
    await fs.writeFile(readmePath, generateReadme(policy, dataset, datasetInfo));

    // Get file sizes
    const files = [trainPath, evalPath, dictPath, infoPath, readmePath];
    const fileSizes: Record<string, number> = {};
    for (const file of files) {
      const stat = await fs.stat(file);
      fileSizes[file] = stat.size;
    }

    return {
      success: true,
      format: 'huggingface',
      files,
      stats: {
        totalExamples: dataset.stats.totalExamples,
        trainExamples: dataset.stats.trainExamples,
        evalExamples: dataset.stats.evalExamples,
        fileSizes,
        exportedAt: new Date().toISOString(),
        policyType: policy,
      },
    };
  } catch (error) {
    return {
      success: false,
      format: 'huggingface',
      files: [],
      stats: {
        totalExamples: 0,
        trainExamples: 0,
        evalExamples: 0,
        exportedAt: new Date().toISOString(),
        policyType: policy,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// FORMAT CONVERSION
// =============================================================================

/**
 * Convert training example to HuggingFace format
 */
function convertToHuggingFaceFormat(
  example: ExtractionTrainingExample | RetrievalTrainingExample | ConsolidationTrainingExample,
  _policy: PolicyType,
  includeMetadata: boolean
): Record<string, unknown> {
  return {
    state: example.state,
    action: example.action,
    reward: example.reward,
    ...(example.nextState && { next_state: example.nextState }),
    ...(includeMetadata && example.metadata && { metadata: example.metadata }),
  };
}

// =============================================================================
// DATASET INFO
// =============================================================================

/**
 * Create HuggingFace dataset info
 */
function createDatasetInfo(policy: PolicyType, dataset: Dataset<any>): HuggingFaceDatasetInfo {
  const features = getFeaturesSchema(policy);

  return {
    dataset_name: `agent_memory_${policy}_policy`,
    description: `RL training dataset for ${policy} policy optimization. Contains state-action-reward tuples for reinforcement learning.`,
    version: '1.0.0',
    features,
    splits: ['train', 'test'],
    builder_name: 'json',
    dataset_size: dataset.stats.totalExamples,
  };
}

/**
 * Get features schema for policy type
 */
function getFeaturesSchema(policy: PolicyType): Record<string, any> {
  const baseSchema = {
    reward: { dtype: 'float32', _type: 'Value' },
  };

  switch (policy) {
    case 'extraction':
      return {
        ...baseSchema,
        state: {
          _type: 'Struct',
          contextFeatures: {
            turnNumber: { dtype: 'int32', _type: 'Value' },
            tokenCount: { dtype: 'int32', _type: 'Value' },
            toolCallCount: { dtype: 'int32', _type: 'Value' },
            hasError: { dtype: 'bool', _type: 'Value' },
            userTurnCount: { dtype: 'int32', _type: 'Value' },
            assistantTurnCount: { dtype: 'int32', _type: 'Value' },
          },
          memoryState: {
            totalEntries: { dtype: 'int32', _type: 'Value' },
            recentExtractions: { dtype: 'int32', _type: 'Value' },
            similarEntryExists: { dtype: 'bool', _type: 'Value' },
            sessionCaptureCount: { dtype: 'int32', _type: 'Value' },
          },
          contentFeatures: {
            hasDecision: { dtype: 'bool', _type: 'Value' },
            hasRule: { dtype: 'bool', _type: 'Value' },
            hasFact: { dtype: 'bool', _type: 'Value' },
            hasCommand: { dtype: 'bool', _type: 'Value' },
            noveltyScore: { dtype: 'float32', _type: 'Value' },
            complexity: { dtype: 'float32', _type: 'Value' },
          },
        },
        action: {
          _type: 'Struct',
          decision: { dtype: 'string', _type: 'Value' },
          entryType: { dtype: 'string', _type: 'Value' },
          priority: { dtype: 'int32', _type: 'Value' },
        },
      };

    case 'retrieval':
      return {
        ...baseSchema,
        state: {
          _type: 'Struct',
          queryFeatures: {
            queryLength: { dtype: 'int32', _type: 'Value' },
            hasKeywords: { dtype: 'bool', _type: 'Value' },
            queryComplexity: { dtype: 'float32', _type: 'Value' },
            semanticCategory: { dtype: 'string', _type: 'Value' },
          },
          contextFeatures: {
            turnNumber: { dtype: 'int32', _type: 'Value' },
            conversationDepth: { dtype: 'int32', _type: 'Value' },
            recentToolCalls: { dtype: 'int32', _type: 'Value' },
            hasErrors: { dtype: 'bool', _type: 'Value' },
          },
          memoryStats: {
            totalEntries: { dtype: 'int32', _type: 'Value' },
            recentRetrievals: { dtype: 'int32', _type: 'Value' },
            avgRetrievalSuccess: { dtype: 'float32', _type: 'Value' },
          },
        },
        action: {
          _type: 'Struct',
          shouldRetrieve: { dtype: 'bool', _type: 'Value' },
          scope: { dtype: 'string', _type: 'Value' },
          types: { _type: 'Sequence', feature: { dtype: 'string', _type: 'Value' } },
          maxResults: { dtype: 'int32', _type: 'Value' },
        },
      };

    case 'consolidation':
      return {
        ...baseSchema,
        state: {
          _type: 'Struct',
          groupFeatures: {
            groupSize: { dtype: 'int32', _type: 'Value' },
            avgSimilarity: { dtype: 'float32', _type: 'Value' },
            minSimilarity: { dtype: 'float32', _type: 'Value' },
            maxSimilarity: { dtype: 'float32', _type: 'Value' },
            entryTypes: { _type: 'Sequence', feature: { dtype: 'string', _type: 'Value' } },
          },
          usageStats: {
            totalRetrievals: { dtype: 'int32', _type: 'Value' },
            avgRetrievalRank: { dtype: 'float32', _type: 'Value' },
            successRate: { dtype: 'float32', _type: 'Value' },
            lastAccessedDaysAgo: { dtype: 'int32', _type: 'Value' },
          },
          scopeStats: {
            scopeType: { dtype: 'string', _type: 'Value' },
            totalEntriesInScope: { dtype: 'int32', _type: 'Value' },
            duplicateRatio: { dtype: 'float32', _type: 'Value' },
          },
        },
        action: {
          _type: 'Struct',
          action: { dtype: 'string', _type: 'Value' },
          targetEntries: { _type: 'Sequence', feature: { dtype: 'string', _type: 'Value' } },
          mergeStrategy: { dtype: 'string', _type: 'Value' },
        },
      };

    default:
      return baseSchema;
  }
}

// =============================================================================
// README GENERATION
// =============================================================================

/**
 * Generate README for HuggingFace dataset
 */
function generateReadme(
  policy: PolicyType,
  dataset: Dataset<any>,
  info: HuggingFaceDatasetInfo
): string {
  return `# ${info.dataset_name}

${info.description}

## Dataset Information

- **Policy Type**: ${policy}
- **Total Examples**: ${dataset.stats.totalExamples}
- **Training Examples**: ${dataset.stats.trainExamples}
- **Evaluation Examples**: ${dataset.stats.evalExamples}
- **Date Range**: ${dataset.stats.dateRange.start} to ${dataset.stats.dateRange.end}
- **Version**: ${info.version}

## Loading the Dataset

\`\`\`python
from datasets import load_dataset

# Load from local files
dataset = load_dataset('json', data_files={
    'train': 'train.json',
    'test': 'test.json'
})

# Access examples
print(dataset['train'][0])
\`\`\`

## Dataset Structure

Each example contains:
- **state**: Current state features for the policy
- **action**: Action taken by the policy
- **reward**: Reward signal (outcome score)
- **metadata**: Optional metadata about the example

## Features Schema

\`\`\`python
${JSON.stringify(info.features, null, 2)}
\`\`\`

## Use Cases

This dataset is designed for:
- Reinforcement learning policy training
- Imitation learning from expert demonstrations
- Offline RL experiments
- Policy evaluation and benchmarking

## Citation

If you use this dataset, please cite:

\`\`\`
@dataset{agent_memory_${policy}_policy,
  title={Agent Memory ${policy.charAt(0).toUpperCase() + policy.slice(1)} Policy Dataset},
  year={${new Date().getFullYear()}},
  version={${info.version}}
}
\`\`\`

## License

See project LICENSE file.
`;
}
