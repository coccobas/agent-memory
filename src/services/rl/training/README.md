# RL Training Infrastructure

This directory contains the training infrastructure for reinforcement learning policies.

## Components

### 1. Dataset Builder (`dataset-builder.ts`)

Builds training datasets from feedback data collected during production usage.

**Features:**

- Converts feedback samples to structured training examples
- Splits data into train/eval sets
- Supports extraction, retrieval, and consolidation policies
- Filters by date range, confidence, sample count

**Usage:**

```typescript
import { buildExtractionDataset } from './dataset-builder.js';

const dataset = await buildExtractionDataset({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  minConfidence: 0.5,
  maxExamples: 10000,
  evalSplit: 0.2, // 20% for evaluation
});

console.log(`Train: ${dataset.train.length}, Eval: ${dataset.eval.length}`);
```

### 2. DPO Trainer (`dpo-trainer.ts`)

Direct Preference Optimization trainer for policy learning.

**Features:**

- Preference-based learning from human feedback
- Supports all three policy types
- Exports trained models in multiple formats
- Training configuration and hyperparameters

**Usage:**

```typescript
import { DPOTrainer } from './dpo-trainer.js';

const trainer = new DPOTrainer({
  policyType: 'extraction',
  modelFormat: 'onnx',
  outputDir: './models',
});

const result = await trainer.train(dataset);
console.log(`Model saved to: ${result.modelPath}`);
```

### 3. Model Loader (`model-loader.ts`)

Load and manage trained RL models.

**Features:**

- Automatic model discovery in models directory
- Version management (latest, specific version)
- Format preference (ONNX, SafeTensors, JSON, checkpoints)
- Model validation and integrity checks
- Metadata extraction and parsing
- Model caching for performance

**Supported Formats:**

- **ONNX** (`.onnx`) - Open Neural Network Exchange format
- **SafeTensors** (`.safetensors`, `.st`) - Safe tensor serialization
- **JSON** (`.json`) - Lightweight JSON format
- **Checkpoint** (`.pt`, `.pth`, `.ckpt`) - PyTorch checkpoints

**Usage:**

```typescript
import { createModelLoader, getDefaultModelsDir } from './model-loader.js';

// Create loader
const loader = createModelLoader({
  modelsDir: getDefaultModelsDir(), // Uses RL_MODELS_DIR env or ./models
  preferredFormat: 'onnx',
  autoLoadWeights: false, // Load weights on demand
});

// List available models
const models = await loader.listModels();
models.forEach((model) => {
  console.log(`${model.policyType} v${model.version} (${model.modelFormat})`);
});

// Load latest model
const model = await loader.getLatestModel('extraction');
if (model) {
  console.log('Loaded:', model.policyType, 'v' + model.version);
  console.log('Trained:', model.metadata.trainedAt);
  console.log('Performance:', model.metadata.performance);
}

// Load specific version
const specificModel = await loader.loadModel('extraction', 'v1.2.3');

// Validate model
const validation = await loader.validateModel(model.modelPath);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

**Model Metadata:**

Each model requires a companion metadata file (`<model>.metadata.json`):

```json
{
  "trainedAt": "2024-12-24T12:00:00Z",
  "datasetStats": {
    "trainExamples": 8000,
    "evalExamples": 2000,
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    }
  },
  "config": {
    "policyType": "extraction",
    "modelFormat": "onnx",
    "version": "1.2.3",
    "hyperparameters": {
      "learningRate": 0.001,
      "batchSize": 32
    }
  },
  "performance": {
    "accuracy": 0.87,
    "avgReward": 0.75,
    "f1Score": 0.85
  }
}
```

### 4. Enhanced Evaluation (`evaluation.ts`)

Comprehensive policy evaluation with advanced metrics.

**Features:**

- Baseline comparison (rule-based vs learned)
- A/B testing with statistical significance
- Reward distribution analysis
- Temporal tracking (improvement over time)
- Confusion matrix for action predictions
- Per-class metrics (precision, recall, F1)

**Core Functions:**

#### `evaluatePolicy(policy, testData)`

Evaluate a policy on test data:

```typescript
import { evaluatePolicy } from './evaluation.js';

const result = await evaluatePolicy(policy, testData);
console.log('Accuracy:', result.accuracy);
console.log('Avg Reward:', result.avgReward);
console.log('F1 Score:', result.f1);
```

#### `comparePolicies(policyA, policyB, testData)`

Compare two policies:

```typescript
import { comparePolicies } from './evaluation.js';

const comparison = await comparePolicies(baselinePolicy, learnedPolicy, testData);
console.log('Winner:', comparison.winner);
console.log('Improvement:', comparison.improvements);
```

**PolicyEvaluator Class:**

Advanced evaluation for loaded models:

```typescript
import { PolicyEvaluator } from './evaluation.js';

const evaluator = new PolicyEvaluator();

// Evaluate model
const result = await evaluator.evaluate(model, evalData);
console.log('Metrics:', result.metrics);
console.log('Baseline:', result.baseline);
console.log('Improvement:', result.improvement);

// Compare two models
const comparison = await evaluator.compare(modelA, modelB, testData);
console.log('Winner:', comparison.winner);
console.log('P-value:', comparison.pValue);
console.log('Effect size:', comparison.details.effectSize);

// A/B test with traffic split
const abTest = await evaluator.abTest(modelA, modelB, testData, 0.5);
console.log('Winner:', abTest.winner);
console.log('Confidence:', abTest.confidenceLevel);
console.log('Recommendation:', abTest.details.recommendation);
```

**Utility Functions:**

#### Reward Distribution

```typescript
import { computeRewardDistribution } from './evaluation.js';

const distribution = computeRewardDistribution(rewards);
console.log('Mean:', distribution.mean);
console.log('Median:', distribution.median);
console.log('Quartiles:', distribution.quartiles);
console.log('Histogram:', distribution.histogram);
```

#### Temporal Metrics

```typescript
import { computeTemporalMetrics } from './evaluation.js';

const temporal = computeTemporalMetrics(dataWithTimestamps, 7 * 24 * 60 * 60 * 1000);
console.log('Trend:', temporal.trend); // 'improving', 'declining', 'stable'
console.log('Improvement rate:', temporal.improvementRate);
console.log('Windows:', temporal.windows);
```

#### Formatting

```typescript
import {
  formatEvaluationReport,
  formatComparisonReport,
  formatABTestReport,
} from './evaluation.js';

// Print detailed reports
console.log(formatEvaluationReport(result));
console.log(formatComparisonReport(comparison, 'Baseline', 'Learned'));
console.log(formatABTestReport(abTestResult));
```

## Workflow

### Training Workflow

1. **Collect Feedback** (automatic during production)
   - Extraction decisions and outcomes
   - Retrieval queries and contributions
   - Consolidation actions and effects

2. **Build Dataset**

   ```typescript
   const dataset = await buildExtractionDataset({
     startDate: '2024-01-01',
     endDate: '2024-12-31',
     minConfidence: 0.5,
     evalSplit: 0.2,
   });
   ```

3. **Train Model**

   ```typescript
   const trainer = new DPOTrainer({
     policyType: 'extraction',
     modelFormat: 'onnx',
     outputDir: './models',
   });

   const result = await trainer.train(dataset);
   ```

4. **Validate and Evaluate**

   ```typescript
   const loader = createModelLoader({ modelsDir: './models' });
   const model = await loader.loadModel('extraction', result.version);

   const validation = await loader.validateModel(model.modelPath);
   if (!validation.valid) {
     throw new Error('Model validation failed');
   }

   const evaluator = new PolicyEvaluator();
   const evalResult = await evaluator.evaluate(model, dataset.eval);
   ```

5. **Compare with Baseline**

   ```typescript
   // Compare learned model with rule-based policy
   const comparison = await comparePolicies(ruleBasedPolicy, learnedPolicy, dataset.eval);

   if (comparison.winner === 'B' && comparison.pValue < 0.05) {
     console.log('Learned model is significantly better!');
     // Deploy to production
   }
   ```

### Evaluation Workflow

1. **Load Model**

   ```typescript
   const loader = createModelLoader({ modelsDir: './models' });
   const model = await loader.getLatestModel('extraction');
   ```

2. **Evaluate Performance**

   ```typescript
   const evaluator = new PolicyEvaluator();
   const result = await evaluator.evaluate(model, evalData);

   console.log(formatEvaluationReport(result));
   ```

3. **A/B Test (Optional)**

   ```typescript
   const modelV1 = await loader.loadModel('extraction', 'v1.0.0');
   const modelV2 = await loader.loadModel('extraction', 'v1.1.0');

   const abTest = await evaluator.abTest(modelV1, modelV2, testData, 0.5);
   console.log(formatABTestReport(abTest));
   ```

4. **Monitor Over Time**

   ```typescript
   const temporal = computeTemporalMetrics(productionData, 7 * 24 * 60 * 60 * 1000);

   if (temporal.trend === 'declining') {
     console.warn('Model performance is declining - consider retraining');
   }
   ```

## Directory Structure

```
training/
├── dataset-builder.ts      # Build datasets from feedback
├── dpo-trainer.ts          # DPO training implementation
├── evaluation.ts           # Comprehensive evaluation suite
├── model-loader.ts         # Model loading and management
├── index.ts                # Module exports
├── examples/               # Usage examples
│   └── model-evaluation-example.ts
└── README.md               # This file

models/ (default location)
├── extraction-v1.0.0.onnx
├── extraction-v1.0.0.metadata.json
├── retrieval-v1.0.0.onnx
├── retrieval-v1.0.0.metadata.json
└── ...
```

## Environment Variables

- `RL_MODELS_DIR` - Directory for trained models (default: `./models`)

## Future Enhancements

### Model Inference

Currently, the PolicyEvaluator methods throw "not yet implemented" errors. To enable full functionality:

1. **ONNX Runtime Integration**

   ```typescript
   import * as ort from 'onnxruntime-node';

   async loadONNXModel(modelPath: string) {
     this.session = await ort.InferenceSession.create(modelPath);
   }
   ```

2. **SafeTensors Support**

   ```typescript
   import { loadSafetensors } from '@huggingface/safetensors';

   async loadSafetensorsModel(modelPath: string) {
     this.weights = await loadSafetensors(modelPath);
   }
   ```

3. **Policy Integration**
   Update BasePolicy to use loaded models:
   ```typescript
   async decide(state: TState): Promise<PolicyDecision<TAction>> {
     if (this.model) {
       return await this.runInference(state);
     }
     return this.getFallback()(state);
   }
   ```

## Statistical Notes

- **T-test**: Used for comparing two models. Current implementation uses Welch's t-test for unequal variances with simplified CDF approximation.
- **Cohen's d**: Effect size metric. Values: 0.2 (small), 0.5 (medium), 0.8 (large).
- **P-value threshold**: 0.05 (95% confidence) for declaring significance.
- **Production Note**: For production use, consider using a proper statistics library (e.g., `jstat`, `simple-statistics`) for more accurate p-value calculations.

## Examples

See `examples/model-evaluation-example.ts` for comprehensive usage examples.

Run examples:

```bash
npx tsx src/services/rl/training/examples/model-evaluation-example.ts
```
