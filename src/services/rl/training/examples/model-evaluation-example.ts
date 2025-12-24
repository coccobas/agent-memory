/**
 * Model Evaluation Example
 *
 * Demonstrates how to use the model loader and evaluator infrastructure.
 * This is an example/documentation file showing the intended usage.
 */

import { createModelLoader, getDefaultModelsDir } from '../model-loader.js';
import { PolicyEvaluator } from '../evaluation.js';
import type { ExtractionState, ExtractionAction } from '../../types.js';

/**
 * Example: Load and evaluate a trained extraction model
 */
export async function exampleLoadAndEvaluate(): Promise<void> {
  // 1. Create model loader
  const loader = createModelLoader({
    modelsDir: getDefaultModelsDir(),
    preferredFormat: 'onnx',
    autoLoadWeights: false,
  });

  // 2. List available models
  const models = await loader.listModels();
  console.log('Available models:');
  models.forEach((model) => {
    console.log(`  - ${model.policyType} v${model.version} (${model.modelFormat})`);
  });

  // 3. Load latest extraction model
  const extractionModel = await loader.getLatestModel('extraction');
  if (!extractionModel) {
    console.log('No extraction model found');
    return;
  }

  console.log('\nLoaded model:', extractionModel.policyType);
  console.log('Version:', extractionModel.version);
  console.log('Trained:', new Date(extractionModel.metadata.trainedAt).toLocaleString());

  // 4. Validate model integrity
  const validation = await loader.validateModel(extractionModel.modelPath);
  if (!validation.valid) {
    console.error('Model validation failed:', validation.errors);
    return;
  }

  console.log('Model validation: OK');
  if (validation.warnings?.length) {
    console.warn('Warnings:', validation.warnings);
  }

  // 5. Prepare evaluation data (example)
  const evalData: Array<{
    state: ExtractionState;
    action: ExtractionAction;
    reward: number;
  }> = [
    {
      state: {
        contextFeatures: {
          turnNumber: 5,
          tokenCount: 200,
          toolCallCount: 2,
          hasError: false,
          userTurnCount: 3,
          assistantTurnCount: 2,
        },
        memoryState: {
          totalEntries: 100,
          recentExtractions: 3,
          similarEntryExists: false,
          sessionCaptureCount: 2,
        },
        contentFeatures: {
          hasDecision: true,
          hasRule: false,
          hasFact: true,
          hasCommand: false,
          noveltyScore: 0.8,
          complexity: 0.6,
        },
      },
      action: {
        decision: 'store',
        entryType: 'knowledge',
        priority: 70,
      },
      reward: 0.85,
    },
    // More examples would be loaded from a dataset...
  ];

  // 6. Evaluate model (when inference is implemented)
  try {
    const evaluator = new PolicyEvaluator();
    const result = await evaluator.evaluate(extractionModel, evalData);

    console.log('\nEvaluation Results:');
    console.log('Accuracy:', (result.metrics.accuracy * 100).toFixed(2), '%');
    console.log('Avg Reward:', result.metrics.avgReward.toFixed(4));
    console.log('F1 Score:', (result.metrics.f1Score * 100).toFixed(2), '%');

    if (result.baseline) {
      console.log('\nBaseline Comparison:');
      console.log('Baseline Accuracy:', (result.baseline.accuracy * 100).toFixed(2), '%');
      console.log('Baseline Reward:', result.baseline.avgReward.toFixed(4));

      if (result.improvement) {
        console.log('\nImprovement:');
        console.log('Accuracy Delta:', result.improvement.accuracyDelta.toFixed(4));
        console.log('Reward Delta:', result.improvement.rewardDelta.toFixed(4));
        console.log(
          'Percent Improvement:',
          (result.improvement.percentImprovement * 100).toFixed(2),
          '%'
        );
      }
    }
  } catch (error) {
    console.log('\nModel inference not yet implemented');
    console.log('This will work once model weights can be loaded and executed');
  }
}

/**
 * Example: Compare two models (A/B test)
 */
export async function exampleABTest(): Promise<void> {
  const loader = createModelLoader({
    modelsDir: getDefaultModelsDir(),
    preferredFormat: 'onnx',
  });

  // Load two versions of the same policy
  const modelV1 = await loader.loadModel('extraction', 'v1.0.0');
  const modelV2 = await loader.loadModel('extraction', 'v1.1.0');

  // Prepare test data
  const testData: Array<{
    state: ExtractionState;
    action: ExtractionAction;
    reward: number;
  }> = [
    // ... test examples
  ];

  // Run A/B test with 50/50 split
  const evaluator = new PolicyEvaluator();
  try {
    const abTestResult = await evaluator.abTest(modelV1, modelV2, testData, 0.5);

    console.log('\nA/B Test Results:');
    console.log('Model A:', abTestResult.modelA.name);
    console.log('Model B:', abTestResult.modelB.name);
    console.log('Winner:', abTestResult.winner);
    console.log('Confidence:', (abTestResult.confidenceLevel * 100).toFixed(2), '%');
    console.log('P-value:', abTestResult.pValue.toFixed(4));
    console.log('\nRecommendation:', abTestResult.details.recommendation);
  } catch (error) {
    console.log('A/B test requires model inference implementation');
  }
}

/**
 * Example: Monitor model performance over time
 */
export async function exampleTemporalTracking(): Promise<void> {
  // This would typically be done with logged production data
  const dataWithTimestamps: Array<{
    state: ExtractionState;
    action: ExtractionAction;
    reward: number;
    timestamp: string;
  }> = [
    // ... timestamped examples spanning weeks/months
  ];

  // Import the temporal metrics function
  const { computeTemporalMetrics } = await import('../evaluation.js');

  // Compute temporal metrics with 7-day windows
  const temporal = computeTemporalMetrics(dataWithTimestamps, 7 * 24 * 60 * 60 * 1000);

  console.log('\nTemporal Analysis:');
  console.log('Time Window:', temporal.timeWindow);
  console.log('Trend:', temporal.trend);

  if (temporal.improvementRate !== undefined) {
    console.log('Improvement Rate:', (temporal.improvementRate * 100).toFixed(2), '% per window');
  }

  console.log('\nWindows:');
  temporal.windows.forEach((window, i) => {
    console.log(`  Window ${i + 1}:`);
    console.log(`    Period: ${window.windowStart} to ${window.windowEnd}`);
    console.log(`    Samples: ${window.sampleCount}`);
    console.log(`    Avg Reward: ${window.avgReward.toFixed(4)}`);
  });
}

/**
 * Example: Analyze reward distribution
 */
export async function exampleRewardDistribution(): Promise<void> {
  // Sample rewards from production or evaluation
  const rewards = [0.1, 0.3, 0.5, 0.7, 0.85, 0.9, 0.4, 0.6, 0.75, 0.8, 0.95, 0.2];

  const { computeRewardDistribution } = await import('../evaluation.js');
  const distribution = computeRewardDistribution(rewards);

  console.log('\nReward Distribution:');
  console.log('Min:', distribution.min.toFixed(2));
  console.log('Max:', distribution.max.toFixed(2));
  console.log('Mean:', distribution.mean.toFixed(2));
  console.log('Median:', distribution.median.toFixed(2));
  console.log('Std Dev:', distribution.stdDev.toFixed(2));

  console.log('\nQuartiles:');
  console.log('Q1:', distribution.quartiles.q1.toFixed(2));
  console.log('Q2:', distribution.quartiles.q2.toFixed(2));
  console.log('Q3:', distribution.quartiles.q3.toFixed(2));

  console.log('\nHistogram:');
  distribution.histogram.forEach((bin) => {
    const bar = '█'.repeat(Math.floor(bin.percentage / 2));
    console.log(`  ${bin.bin}: ${bar} ${bin.percentage.toFixed(1)}%`);
  });
}

// Main example runner
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('='.repeat(60));
  console.log('RL Model Evaluation Examples');
  console.log('='.repeat(60));

  exampleLoadAndEvaluate()
    .then(() => exampleABTest())
    .then(() => exampleTemporalTracking())
    .then(() => exampleRewardDistribution())
    .then(() => {
      console.log('\n' + '='.repeat(60));
      console.log('Examples completed');
    })
    .catch((error) => {
      console.error('Error running examples:', error);
      process.exit(1);
    });
}
