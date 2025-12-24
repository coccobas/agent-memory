/**
 * Dataset Export Main Interface
 *
 * Unified interface for exporting RL training datasets in multiple formats.
 * Automatically detects format from file extension and validates options.
 */

import type { Dataset } from '../dataset-builder.js';
import type {
  ExtractionTrainingExample,
  RetrievalTrainingExample,
  ConsolidationTrainingExample,
} from '../../types.js';
import type { ExportOptions, ExportResult, ExportFormat, PolicyType } from './types.js';
import { exportHuggingFace } from './huggingface.js';
import { exportOpenAI } from './openai.js';
import { exportAnthropic } from './anthropic.js';
import { exportCSV } from './csv.js';

// Re-export types
export * from './types.js';

// =============================================================================
// MAIN EXPORT FUNCTION
// =============================================================================

/**
 * Export dataset in specified format
 *
 * Automatically detects format from file extension if not specified.
 * Validates options and delegates to format-specific exporter.
 *
 * @param dataset - Dataset to export
 * @param options - Export options
 * @returns Export result with file paths and statistics
 *
 * @example
 * ```typescript
 * const dataset = await buildExtractionDataset();
 * const result = await exportDataset(dataset, {
 *   format: 'huggingface',
 *   outputPath: './datasets/extraction',
 *   policy: 'extraction',
 *   splitRatio: 0.2,
 * });
 * ```
 */
export async function exportDataset(
  dataset:
    | Dataset<ExtractionTrainingExample>
    | Dataset<RetrievalTrainingExample>
    | Dataset<ConsolidationTrainingExample>,
  options: ExportOptions
): Promise<ExportResult> {
  // Validate options
  const validation = validateExportOptions(options);
  if (!validation.valid) {
    return {
      success: false,
      format: options.format,
      files: [],
      stats: {
        totalExamples: 0,
        trainExamples: 0,
        evalExamples: 0,
        exportedAt: new Date().toISOString(),
        policyType: options.policy,
      },
      error: validation.error,
    };
  }

  // Apply split ratio if specified and different from dataset
  let processedDataset = dataset;
  if (options.splitRatio !== undefined && options.splitRatio !== 0.2) {
    processedDataset = resplitDataset(dataset as Dataset<any>, options.splitRatio, options.shuffle, options.seed);
  }

  // Apply max examples limit if specified
  if (options.maxExamples !== undefined) {
    processedDataset = limitDataset(processedDataset as Dataset<any>, options.maxExamples);
  }

  // Delegate to format-specific exporter
  try {
    let result: ExportResult;

    switch (options.format) {
      case 'huggingface':
        result = await exportHuggingFace(
          processedDataset as Dataset<any>,
          options.policy,
          options.outputPath,
          options.includeMetadata
        );
        break;

      case 'openai':
        result = await exportOpenAI(processedDataset as Dataset<any>, options.policy, options.outputPath);
        break;

      case 'anthropic':
        result = await exportAnthropic(
          processedDataset as Dataset<any>,
          options.policy,
          options.outputPath,
          options.includeMetadata
        );
        break;

      case 'csv':
        result = await exportCSV(
          processedDataset as Dataset<any>,
          options.policy,
          options.outputPath,
          options.includeMetadata
        );
        break;

      case 'jsonl':
        result = await exportJSONL(
          processedDataset as Dataset<any>,
          options.policy,
          options.outputPath,
          options.includeMetadata
        );
        break;

      default:
        return {
          success: false,
          format: options.format,
          files: [],
          stats: {
            totalExamples: 0,
            trainExamples: 0,
            evalExamples: 0,
            exportedAt: new Date().toISOString(),
            policyType: options.policy,
          },
          error: `Unsupported format: ${options.format}`,
        };
    }

    // Compress if requested
    if (options.compress && result.success) {
      result = await compressExport(result);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      format: options.format,
      files: [],
      stats: {
        totalExamples: 0,
        trainExamples: 0,
        evalExamples: 0,
        exportedAt: new Date().toISOString(),
        policyType: options.policy,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// JSONL EXPORT (Simple format)
// =============================================================================

/**
 * Export dataset in simple JSONL format
 *
 * Each line is a complete JSON object with state, action, reward.
 * This is the simplest format, useful for custom processing.
 */
async function exportJSONL(
  dataset: Dataset<any>,
  policy: PolicyType,
  outputPath: string,
  includeMetadata = true
): Promise<ExportResult> {
  const fs = await import('fs/promises');

  try {
    await fs.mkdir(outputPath, { recursive: true });

    // Convert to JSONL (one JSON object per line)
    const trainLines = dataset.train.map((ex) => {
      const obj: any = {
        state: ex.state,
        action: ex.action,
        reward: ex.reward,
      };
      if (includeMetadata && ex.metadata) {
        obj.metadata = ex.metadata;
      }
      return JSON.stringify(obj);
    });

    const evalLines = dataset.eval.map((ex) => {
      const obj: any = {
        state: ex.state,
        action: ex.action,
        reward: ex.reward,
      };
      if (includeMetadata && ex.metadata) {
        obj.metadata = ex.metadata;
      }
      return JSON.stringify(obj);
    });

    // Write files
    const trainPath = `${outputPath}/train.jsonl`;
    await fs.writeFile(trainPath, trainLines.join('\n'));

    const evalPath = `${outputPath}/eval.jsonl`;
    await fs.writeFile(evalPath, evalLines.join('\n'));

    // Create README
    const readmePath = `${outputPath}/README.md`;
    await fs.writeFile(
      readmePath,
      `# JSONL Dataset - ${policy} Policy

Simple JSONL format with one example per line.

## Format

Each line contains:
\`\`\`json
{
  "state": {...},
  "action": {...},
  "reward": 0.85
  ${includeMetadata ? ',\n  "metadata": {...}' : ''}
}
\`\`\`

## Loading

\`\`\`python
import json

with open('train.jsonl') as f:
    examples = [json.loads(line) for line in f]
\`\`\`

## Statistics

- Total: ${dataset.stats.totalExamples}
- Train: ${dataset.stats.trainExamples}
- Eval: ${dataset.stats.evalExamples}
`
    );

    // Get file sizes
    const files = [trainPath, evalPath, readmePath];
    const fileSizes: Record<string, number> = {};
    for (const file of files) {
      const stat = await fs.stat(file);
      fileSizes[file] = stat.size;
    }

    return {
      success: true,
      format: 'jsonl',
      files,
      stats: {
        totalExamples: dataset.stats.totalExamples,
        trainExamples: trainLines.length,
        evalExamples: evalLines.length,
        fileSizes,
        exportedAt: new Date().toISOString(),
        policyType: policy,
      },
    };
  } catch (error) {
    return {
      success: false,
      format: 'jsonl',
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
// UTILITIES
// =============================================================================

/**
 * Validate export options
 */
function validateExportOptions(options: ExportOptions): { valid: boolean; error?: string } {
  // Check required fields
  if (!options.format) {
    return { valid: false, error: 'Format is required' };
  }

  if (!options.outputPath) {
    return { valid: false, error: 'Output path is required' };
  }

  if (!options.policy) {
    return { valid: false, error: 'Policy type is required' };
  }

  // Validate format
  const validFormats: ExportFormat[] = ['huggingface', 'openai', 'anthropic', 'csv', 'jsonl'];
  if (!validFormats.includes(options.format)) {
    return { valid: false, error: `Invalid format: ${options.format}` };
  }

  // Validate split ratio
  if (options.splitRatio !== undefined) {
    if (options.splitRatio < 0 || options.splitRatio > 1) {
      return { valid: false, error: 'Split ratio must be between 0 and 1' };
    }
  }

  // Validate validation ratio
  if (options.validationRatio !== undefined) {
    if (options.validationRatio < 0 || options.validationRatio > 1) {
      return { valid: false, error: 'Validation ratio must be between 0 and 1' };
    }
  }

  // Validate max examples
  if (options.maxExamples !== undefined) {
    if (options.maxExamples < 1) {
      return { valid: false, error: 'Max examples must be at least 1' };
    }
  }

  return { valid: true };
}

/**
 * Resplit dataset with new ratio
 */
function resplitDataset<T>(
  dataset: Dataset<T>,
  splitRatio: number,
  shuffle = true,
  seed?: number
): Dataset<T> {
  // Combine all examples
  const allExamples = [...dataset.train, ...dataset.eval];

  // Shuffle if requested
  let examples = allExamples;
  if (shuffle) {
    examples = shuffleArray([...allExamples], seed);
  }

  // Split at new ratio
  const splitIdx = Math.floor(examples.length * (1 - splitRatio));
  const train = examples.slice(0, splitIdx);
  const eval_ = examples.slice(splitIdx);

  return {
    train,
    eval: eval_,
    stats: {
      totalExamples: examples.length,
      trainExamples: train.length,
      evalExamples: eval_.length,
      dateRange: dataset.stats.dateRange,
    },
  };
}

/**
 * Limit dataset to max examples
 */
function limitDataset<T>(dataset: Dataset<T>, maxExamples: number): Dataset<T> {
  // Calculate proportional limits
  const ratio = dataset.train.length / (dataset.train.length + dataset.eval.length);
  const maxTrain = Math.floor(maxExamples * ratio);
  const maxEval = maxExamples - maxTrain;

  return {
    train: dataset.train.slice(0, maxTrain),
    eval: dataset.eval.slice(0, maxEval),
    stats: {
      totalExamples: Math.min(dataset.stats.totalExamples, maxExamples),
      trainExamples: Math.min(dataset.stats.trainExamples, maxTrain),
      evalExamples: Math.min(dataset.stats.evalExamples, maxEval),
      dateRange: dataset.stats.dateRange,
    },
  };
}

/**
 * Shuffle array with optional seed
 */
function shuffleArray<T>(array: T[], seed?: number): T[] {
  const shuffled = [...array];

  // Use seeded random if provided
  let random = Math.random;
  if (seed !== undefined) {
    // Simple seeded random (not cryptographically secure)
    let s = seed;
    random = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  return shuffled;
}

/**
 * Compress exported files
 */
async function compressExport(result: ExportResult): Promise<ExportResult> {
  // TODO: Implement compression (gzip/zip)
  // For now, return as-is with a warning
  const warnings = result.warnings || [];
  warnings.push('Compression requested but not yet implemented');

  return {
    ...result,
    warnings,
  };
}

// =============================================================================
// FORMAT DETECTION
// =============================================================================

/**
 * Detect format from file extension
 *
 * @param path - Output path
 * @returns Detected format or undefined
 */
export function detectFormat(path: string): ExportFormat | undefined {
  const lower = path.toLowerCase();

  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return 'jsonl';
  if (lower.includes('huggingface') || lower.includes('hf')) return 'huggingface';
  if (lower.includes('openai') || lower.includes('gpt')) return 'openai';
  if (lower.includes('anthropic') || lower.includes('claude')) return 'anthropic';

  return undefined;
}

/**
 * Create export options with auto-detected format
 *
 * @param outputPath - Output path
 * @param policy - Policy type
 * @param overrides - Optional overrides
 * @returns Complete export options
 */
export function createExportOptions(
  outputPath: string,
  policy: PolicyType,
  overrides?: Partial<ExportOptions>
): ExportOptions {
  const detectedFormat = detectFormat(outputPath);
  const format = overrides?.format || detectedFormat || 'jsonl';

  return {
    format,
    outputPath,
    policy,
    includeMetadata: true,
    splitRatio: 0.2,
    shuffle: true,
    ...overrides,
  };
}
