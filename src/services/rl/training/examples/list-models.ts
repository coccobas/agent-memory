#!/usr/bin/env node
/**
 * List Models CLI
 *
 * Simple CLI tool to list and inspect trained RL models.
 *
 * Usage:
 *   npx tsx src/services/rl/training/examples/list-models.ts [modelsDir]
 */

import { createModelLoader, getDefaultModelsDir } from '../model-loader.js';

async function main(): Promise<void> {
  // Get models directory from args or use default
  const modelsDir = process.argv[2] ?? getDefaultModelsDir();

  console.log('RL Model Inspector');
  console.log('='.repeat(60));
  console.log(`Models directory: ${modelsDir}`);
  console.log('');

  // Create loader
  const loader = createModelLoader({
    modelsDir,
    preferredFormat: 'onnx',
  });

  // List all models
  const models = await loader.listModels();

  if (models.length === 0) {
    console.log('No models found.');
    console.log('');
    console.log('To train models, use the DPO trainer:');
    console.log('  import { DPOTrainer } from "./dpo-trainer.js";');
    console.log('  const trainer = new DPOTrainer({ ... });');
    console.log('  await trainer.train(dataset);');
    return;
  }

  console.log(`Found ${models.length} model(s):\n`);

  // Group by policy type
  const byPolicy: Record<string, typeof models> = {};
  for (const model of models) {
    if (!byPolicy[model.policyType]) {
      byPolicy[model.policyType] = [];
    }
    byPolicy[model.policyType]?.push(model);
  }

  // Display grouped models
  for (const [policyType, policyModels] of Object.entries(byPolicy)) {
    console.log(`${policyType.toUpperCase()} Policy:`);
    console.log('-'.repeat(60));

    for (const model of policyModels) {
      console.log(`\nVersion: ${model.version}`);
      console.log(`Format:  ${model.modelFormat}`);
      console.log(`Path:    ${model.modelPath}`);
      console.log(`Trained: ${new Date(model.metadata.trainedAt).toLocaleString()}`);

      // Dataset stats
      const stats = model.metadata.datasetStats;
      console.log(
        `Dataset: ${stats.trainExamples} train, ${stats.evalExamples} eval (${stats.dateRange.start} to ${stats.dateRange.end})`
      );

      // Performance metrics (if available)
      if (model.metadata.performance) {
        const perf = model.metadata.performance;
        console.log(`Performance:`);
        console.log(`  - Accuracy:   ${(perf.accuracy * 100).toFixed(2)}%`);
        console.log(`  - Avg Reward: ${perf.avgReward.toFixed(4)}`);
        console.log(`  - F1 Score:   ${(perf.f1Score * 100).toFixed(2)}%`);
      }

      // Validate model
      const validation = await loader.validateModel(model.modelPath);
      console.log(`Validation: ${validation.valid ? '✓ OK' : '✗ FAILED'}`);

      if (validation.errors?.length) {
        console.log('  Errors:', validation.errors.join(', '));
      }
      if (validation.warnings?.length) {
        console.log('  Warnings:', validation.warnings.join(', '));
      }
    }

    console.log('');
  }

  // Show cache stats
  const cacheStats = loader.getCacheStats();
  console.log('Cache Statistics:');
  console.log(`  Size: ${cacheStats.size}`);
  if (cacheStats.keys.length > 0) {
    console.log(`  Keys: ${cacheStats.keys.join(', ')}`);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('To get detailed info for a specific model:');
  console.log('  const model = await loader.loadModel("extraction", "v1.0.0");');
  console.log('  console.log(formatModelInfo(model));');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
