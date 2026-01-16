/**
 * Dataset Export Examples
 *
 * Examples demonstrating how to export RL training datasets in various formats.
 */

/* eslint-disable no-console */

import { buildExtractionDataset, buildRetrievalDataset } from '../dataset-builder.js';
import { exportDataset, createExportOptions } from './index.js';
import type { ExportFormat } from './types.js';

// =============================================================================
// BASIC EXAMPLES
// =============================================================================

/**
 * Example 1: Export extraction dataset in HuggingFace format
 */
export async function exportExtractionHuggingFace() {
  console.log('Building extraction dataset...');
  const dataset = await buildExtractionDataset({
    maxExamples: 1000,
    evalSplit: 0.2,
    minConfidence: 0.5,
  });

  console.log('Exporting to HuggingFace format...');
  const result = await exportDataset(dataset, {
    format: 'huggingface',
    outputPath: './datasets/extraction-hf',
    policy: 'extraction',
    includeMetadata: true,
  });

  if (result.success) {
    console.log('Export successful!');
    console.log('Files:', result.files);
    console.log('Stats:', result.stats);
  } else {
    console.error('Export failed:', result.error);
  }

  return result;
}

/**
 * Example 2: Export retrieval dataset for OpenAI fine-tuning
 */
export async function exportRetrievalOpenAI() {
  console.log('Building retrieval dataset...');
  const dataset = await buildRetrievalDataset({
    maxExamples: 500,
    evalSplit: 0.15,
  });

  console.log('Exporting to OpenAI format...');
  const result = await exportDataset(dataset, {
    format: 'openai',
    outputPath: './datasets/retrieval-openai',
    policy: 'retrieval',
  });

  if (result.success) {
    console.log('Export successful!');
    console.log('Train examples:', result.stats.trainExamples);
    console.log('Eval examples:', result.stats.evalExamples);

    if (result.warnings && result.warnings.length > 0) {
      console.warn('Warnings:', result.warnings);
    }
  } else {
    console.error('Export failed:', result.error);
  }

  return result;
}

/**
 * Example 3: Export to CSV for analysis
 */
export async function exportExtractionCSV() {
  console.log('Building extraction dataset...');
  const dataset = await buildExtractionDataset({
    maxExamples: 2000,
  });

  console.log('Exporting to CSV format...');
  const result = await exportDataset(dataset, {
    format: 'csv',
    outputPath: './datasets/extraction-csv',
    policy: 'extraction',
    includeMetadata: true,
  });

  if (result.success) {
    console.log('Export successful!');
    console.log('Generated files:');
    result.files.forEach((file) => {
      const size = result.stats.fileSizes?.[file];
      console.log(`  - ${file} (${formatBytes(size || 0)})`);
    });
  } else {
    console.error('Export failed:', result.error);
  }

  return result;
}

/**
 * Example 4: Export to Anthropic format
 */
export async function exportExtractionAnthropic() {
  console.log('Building extraction dataset...');
  const dataset = await buildExtractionDataset({
    maxExamples: 1000,
  });

  console.log('Exporting to Anthropic format...');
  const result = await exportDataset(dataset, {
    format: 'anthropic',
    outputPath: './datasets/extraction-anthropic',
    policy: 'extraction',
    includeMetadata: false, // Cleaner format without metadata
  });

  if (result.success) {
    console.log('Export successful!');
    console.log('Total examples:', result.stats.totalExamples);
  } else {
    console.error('Export failed:', result.error);
  }

  return result;
}

// =============================================================================
// ADVANCED EXAMPLES
// =============================================================================

/**
 * Example 5: Export with custom split ratio
 */
export async function exportWithCustomSplit() {
  const dataset = await buildExtractionDataset();

  console.log('Exporting with 90/10 train/eval split...');
  const result = await exportDataset(dataset, {
    format: 'jsonl',
    outputPath: './datasets/extraction-custom-split',
    policy: 'extraction',
    splitRatio: 0.1, // 90% train, 10% eval
    shuffle: true,
    seed: 42, // Reproducible shuffle
  });

  return result;
}

/**
 * Example 6: Export limited dataset for testing
 */
export async function exportSampleDataset() {
  const dataset = await buildExtractionDataset();

  console.log('Exporting sample dataset (100 examples)...');
  const result = await exportDataset(dataset, {
    format: 'huggingface',
    outputPath: './datasets/extraction-sample',
    policy: 'extraction',
    maxExamples: 100, // Limit for quick testing
  });

  return result;
}

/**
 * Example 7: Export all policies in all formats
 */
export async function exportAllFormats() {
  const policies = ['extraction', 'retrieval', 'consolidation'] as const;
  const formats: ExportFormat[] = ['huggingface', 'openai', 'anthropic', 'csv', 'jsonl'];

  const results = [];

  for (const policy of policies) {
    console.log(`\nProcessing ${policy} policy...`);

    // Build dataset based on policy
    let dataset;
    switch (policy) {
      case 'extraction':
        dataset = await buildExtractionDataset({ maxExamples: 500 });
        break;
      case 'retrieval':
        dataset = await buildRetrievalDataset({ maxExamples: 500 });
        break;
      case 'consolidation':
        // Would use buildConsolidationDataset() if available
        console.log(`Skipping ${policy} (not implemented)`);
        continue;
    }

    // Export in each format
    for (const format of formats) {
      console.log(`  Exporting as ${format}...`);

      const result = await exportDataset(dataset, {
        format,
        outputPath: `./datasets/${policy}-${format}`,
        policy,
      });

      results.push({
        policy,
        format,
        success: result.success,
        examples: result.stats.totalExamples,
        error: result.error,
      });

      if (!result.success) {
        console.error(`    Failed: ${result.error}`);
      } else {
        console.log(`    Success: ${result.stats.totalExamples} examples`);
      }
    }
  }

  // Summary
  console.log('\n=== Export Summary ===');
  const successful = results.filter((r) => r.success).length;
  const total = results.length;
  console.log(`Successful: ${successful}/${total}`);

  return results;
}

/**
 * Example 8: Auto-detect format from path
 */
export async function exportWithAutoDetect() {
  const dataset = await buildExtractionDataset({ maxExamples: 200 });

  // Format is auto-detected from path
  const options = createExportOptions('./datasets/extraction.csv', 'extraction');

  console.log('Auto-detected format:', options.format); // Should be 'csv'

  const result = await exportDataset(dataset, options);
  return result;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// =============================================================================
// MAIN (for running examples)
// =============================================================================

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('=== Dataset Export Examples ===\n');

  try {
    // Run basic examples
    console.log('--- Example 1: HuggingFace Export ---');
    await exportExtractionHuggingFace();

    console.log('\n--- Example 2: OpenAI Export ---');
    await exportRetrievalOpenAI();

    console.log('\n--- Example 3: CSV Export ---');
    await exportExtractionCSV();

    console.log('\n--- Example 4: Anthropic Export ---');
    await exportExtractionAnthropic();

    // Run advanced examples
    console.log('\n--- Example 5: Custom Split ---');
    await exportWithCustomSplit();

    console.log('\n--- Example 6: Sample Dataset ---');
    await exportSampleDataset();

    console.log('\n--- Example 7: All Formats ---');
    await exportAllFormats();

    console.log('\n--- Example 8: Auto-detect Format ---');
    await exportWithAutoDetect();

    console.log('\n=== All Examples Complete ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Note: To run examples, import and call runAllExamples() from another module
