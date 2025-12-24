# Quick Start Guide - Dataset Export

Get started with exporting RL training datasets in 5 minutes.

## Installation

No additional dependencies needed - the export functionality uses only Node.js built-ins.

## Basic Usage

### Step 1: Build a Dataset

```typescript
import { buildExtractionDataset } from '@/services/rl/training';

const dataset = await buildExtractionDataset({
  maxExamples: 1000,
  evalSplit: 0.2,
  minConfidence: 0.5,
});
```

### Step 2: Export the Dataset

```typescript
import { exportDataset } from '@/services/rl/training/export';

const result = await exportDataset(dataset, {
  format: 'huggingface',
  outputPath: './datasets/extraction',
  policy: 'extraction',
});

if (result.success) {
  console.log('Success! Files:', result.files);
} else {
  console.error('Error:', result.error);
}
```

That's it! Your dataset is now ready to use.

## Common Patterns

### Export for OpenAI Fine-Tuning

```typescript
import { buildRetrievalDataset, exportDataset } from '@/services/rl/training';

const dataset = await buildRetrievalDataset();

await exportDataset(dataset, {
  format: 'openai',
  outputPath: './datasets/retrieval-openai',
  policy: 'retrieval',
});

// Then upload to OpenAI:
// openai api files.create -f train.jsonl -p fine-tune
```

### Export for Data Analysis

```typescript
await exportDataset(dataset, {
  format: 'csv',
  outputPath: './datasets/analysis',
  policy: 'extraction',
});

// Then analyze in Python:
// import pandas as pd
// df = pd.read_csv('combined.csv')
```

### Export All Formats

```typescript
const formats = ['huggingface', 'openai', 'anthropic', 'csv', 'jsonl'];

for (const format of formats) {
  await exportDataset(dataset, {
    format,
    outputPath: `./datasets/${format}`,
    policy: 'extraction',
  });
}
```

## Configuration Options

```typescript
{
  // Required
  format: 'huggingface' | 'openai' | 'anthropic' | 'csv' | 'jsonl',
  outputPath: './path/to/output',
  policy: 'extraction' | 'retrieval' | 'consolidation',

  // Optional
  includeMetadata: true,     // Include metadata fields
  splitRatio: 0.2,           // 80/20 train/eval split
  shuffle: true,             // Shuffle before splitting
  seed: 42,                  // Random seed for reproducibility
  maxExamples: 1000,         // Limit number of examples
}
```

## Output Structure

### HuggingFace

```
datasets/extraction/
├── train.json              # Training examples
├── test.json               # Evaluation examples
├── dataset_dict.json       # Split metadata
├── dataset_info.json       # Schema and features
└── README.md               # Usage instructions
```

### OpenAI

```
datasets/retrieval-openai/
├── train.jsonl             # Training messages
├── eval.jsonl              # Evaluation messages
├── metadata.json           # File metadata
└── USAGE.md                # API instructions
```

### CSV

```
datasets/analysis/
├── train.csv               # Training data
├── eval.csv                # Evaluation data
├── combined.csv            # All data with split column
├── data_dictionary.md      # Column descriptions
└── analysis_template.py    # Analysis script
```

## What's in the Data?

Each example contains:

```typescript
{
  state: {
    // Environment state when decision was made
    contextFeatures: {...},
    memoryState: {...},
    contentFeatures: {...}
  },
  action: {
    // Action taken by the policy
    decision: 'store',
    entryType: 'knowledge',
    priority: 50
  },
  reward: 0.85,  // Outcome score (0-1)
  metadata: {
    // Additional context
    sessionId: '...',
    turnNumber: 5
  }
}
```

## Error Handling

```typescript
const result = await exportDataset(dataset, options);

if (!result.success) {
  console.error('Export failed:', result.error);
  // Common errors:
  // - Invalid output path
  // - Empty dataset
  // - Invalid format
}

if (result.warnings && result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings);
  // Some examples may be filtered (e.g., token limits)
}
```

## Next Steps

1. Review the exported files in your output directory
2. Check the auto-generated documentation (README/USAGE/GUIDE)
3. Use the data with your preferred ML framework
4. See `README.md` for advanced features
5. Check `example.ts` for more usage patterns

## Need Help?

- Full documentation: `README.md`
- Type definitions: `types.ts`
- Usage examples: `example.ts`
- API reference: `index.ts`

## Common Tasks

### Create a Sample Dataset

```typescript
await exportDataset(dataset, {
  format: 'jsonl',
  outputPath: './datasets/sample',
  policy: 'extraction',
  maxExamples: 100,  // Small sample for testing
});
```

### Reproducible Export

```typescript
await exportDataset(dataset, {
  format: 'huggingface',
  outputPath: './datasets/reproducible',
  policy: 'extraction',
  shuffle: true,
  seed: 42,  // Same seed = same split
});
```

### Custom Split Ratio

```typescript
await exportDataset(dataset, {
  format: 'openai',
  outputPath: './datasets/custom-split',
  policy: 'retrieval',
  splitRatio: 0.1,  // 90% train, 10% eval
});
```

### Metadata-Free Export

```typescript
await exportDataset(dataset, {
  format: 'anthropic',
  outputPath: './datasets/clean',
  policy: 'extraction',
  includeMetadata: false,  // Cleaner format
});
```

## Tips

1. Start with a small dataset (`maxExamples: 100`) to verify the format
2. Use CSV format for initial data exploration
3. Enable shuffle with a seed for reproducible experiments
4. Check warnings for filtered examples (especially OpenAI format)
5. Review auto-generated documentation in each export directory
6. Use the Python analysis template for CSV exports

Happy exporting!
