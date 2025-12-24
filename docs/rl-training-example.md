# RL Training Infrastructure Usage

## Overview

The training infrastructure builds datasets from feedback data and provides a DPO training pipeline for RL policies.

## Building Datasets

```typescript
import { buildExtractionDataset, buildRetrievalDataset, buildConsolidationDataset } from './services/rl/training';

// Build extraction training dataset
const extractionDataset = await buildExtractionDataset({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  minConfidence: 0.7,
  maxExamples: 10000,
  evalSplit: 0.2,
});

console.log(`Training examples: ${extractionDataset.stats.trainExamples}`);
console.log(`Eval examples: ${extractionDataset.stats.evalExamples}`);
```

## Training Policies

```typescript
import { trainExtractionPolicy } from './services/rl/training';

// Train extraction policy using DPO
const result = await trainExtractionPolicy(extractionDataset, {
  modelName: 'extraction-policy-v1',
  outputPath: './models/extraction',
  epochs: 10,
  batchSize: 32,
  learningRate: 1e-5,
  beta: 0.1, // KL penalty coefficient
});

if (result.success) {
  console.log(`Model saved to: ${result.modelPath}`);
  console.log(`Train loss: ${result.metrics?.trainLoss}`);
} else {
  console.error(`Training failed: ${result.error}`);
}
```

## Evaluating Policies

```typescript
import { evaluatePolicy, comparePolicies, formatEvaluationReport } from './services/rl/training';

// Evaluate a single policy
const testData = extractionDataset.eval.map(ex => ({
  state: ex.state,
  expectedAction: ex.action,
  reward: ex.reward,
}));

const evaluation = await evaluatePolicy(policy, testData);
console.log(formatEvaluationReport(evaluation));

// Compare two policies
const comparison = await comparePolicies(policyA, policyB, testData);
console.log(`Winner: ${comparison.winner}`);
console.log(`Accuracy improvement: ${comparison.improvements.accuracy}`);
```

## DPO Training Format

The DPO trainer exports datasets in JSONL format with preference pairs:

```json
{
  "prompt": "Context:\n- Turn: 5\n- Tokens: 250\n...\n\nWhat action should be taken?",
  "chosen": "{ \"decision\": \"store\", \"entryType\": \"knowledge\", \"priority\": 80 }",
  "rejected": "{ \"decision\": \"skip\" }"
}
```

## Training Files

After training, the following files are created:

- `extraction_dpo_train.jsonl` - Training pairs
- `extraction_dpo_eval.jsonl` - Evaluation pairs
- `extraction_metadata.json` - Dataset metadata and config

## External Training

The exported datasets can be used with external tools like Hugging Face:

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import DPOTrainer

# Load exported dataset
train_dataset = load_dataset('json', data_files='extraction_dpo_train.jsonl')
eval_dataset = load_dataset('json', data_files='extraction_dpo_eval.jsonl')

# Train with DPO
trainer = DPOTrainer(
    model=model,
    ref_model=ref_model,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
    beta=0.1,
)

trainer.train()
```

## Evaluation Metrics

The evaluation system provides:

- **Accuracy**: How often the policy agrees with ground truth
- **Precision/Recall/F1**: Per-class performance metrics
- **Average Reward**: Mean reward achieved on test set
- **Reward Std Dev**: Variance in rewards
- **Confusion Matrix**: Where the policy makes mistakes
- **Per-Class Metrics**: Detailed breakdown for each action type

## Confidence Intervals

Use bootstrap resampling to estimate confidence intervals:

```typescript
import { computeConfidenceInterval } from './services/rl/training';

const rewards = testData.map(d => d.reward);
const ci = computeConfidenceInterval(rewards, 0.95);

console.log(`Mean reward: ${ci.mean.toFixed(4)}`);
console.log(`95% CI: [${ci.lower.toFixed(4)}, ${ci.upper.toFixed(4)}]`);
```
