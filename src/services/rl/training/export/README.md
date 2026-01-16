# RL Training Dataset Export

Export RL training datasets in multiple formats for use with various machine learning frameworks and fine-tuning platforms.

## Supported Formats

### HuggingFace Datasets

- **Format**: JSON with dataset_dict.json
- **Use Case**: Loading with `datasets.load_dataset()`
- **Features**: Full schema definition, README generation
- **Output**: `train.json`, `test.json`, `dataset_dict.json`, `dataset_info.json`, `README.md`

### OpenAI Fine-Tuning

- **Format**: JSONL with message structure
- **Use Case**: OpenAI API fine-tuning
- **Features**: Token validation, system/user/assistant messages
- **Output**: `train.jsonl`, `eval.jsonl`, `metadata.json`, `USAGE.md`

### Anthropic/Claude

- **Format**: JSONL with prompt/completion pairs
- **Use Case**: Claude fine-tuning (when available)
- **Features**: Human/Assistant format, reward interpretation
- **Output**: `train.jsonl`, `eval.jsonl`, `dataset_info.json`, `GUIDE.md`

### CSV

- **Format**: Comma-separated values
- **Use Case**: Data analysis, visualization, Excel
- **Features**: Flattened structure, analysis template
- **Output**: `train.csv`, `eval.csv`, `combined.csv`, `data_dictionary.md`, `analysis_template.py`

### JSONL (Simple)

- **Format**: One JSON object per line
- **Use Case**: Custom processing pipelines
- **Features**: Minimal structure, easy to parse
- **Output**: `train.jsonl`, `eval.jsonl`, `README.md`

## Quick Start

### Basic Usage

```typescript
import { buildExtractionDataset, exportDataset } from '@/services/rl/training';

// Build dataset
const dataset = await buildExtractionDataset({
  maxExamples: 1000,
  evalSplit: 0.2,
});

// Export to HuggingFace format
const result = await exportDataset(dataset, {
  format: 'huggingface',
  outputPath: './datasets/extraction',
  policy: 'extraction',
});

if (result.success) {
  console.log('Exported files:', result.files);
  console.log('Statistics:', result.stats);
}
```

### Export Options

```typescript
interface ExportOptions {
  format: 'huggingface' | 'openai' | 'anthropic' | 'csv' | 'jsonl';
  outputPath: string;
  policy: 'extraction' | 'retrieval' | 'consolidation';
  includeMetadata?: boolean; // Default: true
  splitRatio?: number; // Default: 0.2 (80/20 split)
  shuffle?: boolean; // Default: true
  seed?: number; // For reproducible shuffling
  maxExamples?: number; // Limit for testing
  compress?: boolean; // Compress output (future)
}
```

## Examples

### Export for OpenAI Fine-Tuning

```typescript
const dataset = await buildRetrievalDataset();

const result = await exportDataset(dataset, {
  format: 'openai',
  outputPath: './datasets/retrieval-openai',
  policy: 'retrieval',
});

// Upload to OpenAI
// openai api files.create -f train.jsonl -p fine-tune
```

### Export for Analysis

```typescript
const dataset = await buildExtractionDataset();

const result = await exportDataset(dataset, {
  format: 'csv',
  outputPath: './datasets/analysis',
  policy: 'extraction',
  includeMetadata: true,
});

// Load in Python
// import pandas as pd
// df = pd.read_csv('combined.csv')
```

### Custom Split Ratio

```typescript
const result = await exportDataset(dataset, {
  format: 'huggingface',
  outputPath: './datasets/custom',
  policy: 'extraction',
  splitRatio: 0.1, // 90/10 split
  shuffle: true,
  seed: 42, // Reproducible
});
```

### Export All Formats

```typescript
const formats = ['huggingface', 'openai', 'anthropic', 'csv', 'jsonl'];

for (const format of formats) {
  await exportDataset(dataset, {
    format,
    outputPath: `./datasets/extraction-${format}`,
    policy: 'extraction',
  });
}
```

### Auto-Detect Format

```typescript
import { createExportOptions } from '@/services/rl/training/export';

// Format detected from extension
const options = createExportOptions('./datasets/data.csv', 'extraction');
// options.format === 'csv'

const result = await exportDataset(dataset, options);
```

## File Structure

### HuggingFace Export

```
extraction-hf/
├── train.json              # Training examples
├── test.json               # Evaluation examples
├── dataset_dict.json       # Dataset splits metadata
├── dataset_info.json       # Schema and features
└── README.md               # Usage instructions
```

### OpenAI Export

```
retrieval-openai/
├── train.jsonl             # Training examples with messages
├── eval.jsonl              # Evaluation examples
├── metadata.json           # File metadata
└── USAGE.md                # OpenAI API instructions
```

### CSV Export

```
extraction-csv/
├── train.csv               # Training data (flattened)
├── eval.csv                # Evaluation data (flattened)
├── combined.csv            # All data with split column
├── data_dictionary.md      # Column descriptions
└── analysis_template.py    # Python analysis script
```

## Data Format

### Training Example Structure

All formats contain the same core data:

```typescript
{
  state: {
    // Policy-specific state features
    contextFeatures: {...},
    memoryState: {...},
    contentFeatures: {...}
  },
  action: {
    // Policy-specific action
    decision: 'store' | 'skip' | 'defer',
    entryType: 'knowledge' | 'guideline' | 'tool',
    priority: 50
  },
  reward: 0.85,  // Outcome score (0-1)
  metadata: {
    sessionId: 'xxx',
    turnNumber: 5,
    // ... additional context
  }
}
```

### Policy-Specific Schemas

#### Extraction Policy

State features:

- `contextFeatures`: Turn info, token counts, tool calls
- `memoryState`: Total entries, recent extractions, duplicates
- `contentFeatures`: Decision/rule/fact/command flags, novelty, complexity

Actions:

- `decision`: store | skip | defer
- `entryType`: knowledge | guideline | tool
- `priority`: 0-100

#### Retrieval Policy

State features:

- `queryFeatures`: Query length, keywords, complexity, category
- `contextFeatures`: Turn number, depth, tool calls, errors
- `memoryStats`: Total entries, recent retrievals, success rate

Actions:

- `shouldRetrieve`: boolean
- `scope`: global | org | project | session
- `types`: Array of entry types
- `maxResults`: number

#### Consolidation Policy

State features:

- `groupFeatures`: Group size, similarity scores, entry types
- `usageStats`: Retrievals, rank, success rate, last access
- `scopeStats`: Scope type, total entries, duplicate ratio

Actions:

- `action`: merge | dedupe | archive | abstract | keep
- `targetEntries`: Array of entry IDs
- `mergeStrategy`: union | intersection | weighted

## Using Exported Data

### HuggingFace Datasets

```python
from datasets import load_dataset

# Load dataset
dataset = load_dataset('json', data_files={
    'train': 'train.json',
    'test': 'test.json'
})

# Access examples
print(dataset['train'][0])

# Use with transformers
from transformers import Trainer

trainer = Trainer(
    train_dataset=dataset['train'],
    eval_dataset=dataset['test'],
    # ... other config
)
```

### OpenAI Fine-Tuning

```bash
# Upload training file
openai api files.create -f train.jsonl -p fine-tune

# Create fine-tuning job
openai api fine_tuning.jobs.create \
  -t file-abc123 \
  -m gpt-3.5-turbo \
  --suffix "extraction-policy"

# Monitor training
openai api fine_tuning.jobs.get -i ftjob-abc123
```

### CSV Analysis

```python
import pandas as pd
import matplotlib.pyplot as plt

# Load data
df = pd.read_csv('combined.csv')

# Analyze rewards
df['reward'].hist(bins=50)
plt.xlabel('Reward')
plt.ylabel('Frequency')
plt.show()

# Feature importance
correlations = df.corr()['reward'].sort_values(ascending=False)
print(correlations.head(10))
```

## Validation

Export functions automatically validate:

- Token limits (OpenAI format)
- Required fields
- Data types
- File permissions

Validation warnings are returned in `ExportResult.warnings`.

## Performance

Export times by format (approximate):

| Format      | 1K examples | 10K examples | 100K examples |
| ----------- | ----------- | ------------ | ------------- |
| JSONL       | <1s         | ~1s          | ~10s          |
| CSV         | ~1s         | ~5s          | ~30s          |
| HuggingFace | ~1s         | ~5s          | ~30s          |
| OpenAI      | ~2s         | ~10s         | ~60s          |
| Anthropic   | ~1s         | ~5s          | ~30s          |

Note: Times vary based on state/action complexity and metadata size.

## Troubleshooting

### Export Fails

```typescript
const result = await exportDataset(dataset, options);

if (!result.success) {
  console.error('Export error:', result.error);

  // Common issues:
  // - Invalid output path
  // - Insufficient permissions
  // - Invalid format
  // - Empty dataset
}
```

### Token Limit Warnings (OpenAI)

```typescript
if (result.warnings && result.warnings.length > 0) {
  console.warn('Export warnings:', result.warnings);
  // Some examples may be filtered due to token limits
}
```

### Missing Examples

Check the statistics:

```typescript
console.log('Total examples:', result.stats.totalExamples);
console.log('Train examples:', result.stats.trainExamples);
console.log('Eval examples:', result.stats.evalExamples);

// If lower than expected, check:
// - Dataset source (feedback data availability)
// - maxExamples limit
// - Validation filters
```

## API Reference

See individual files for detailed API documentation:

- `types.ts` - TypeScript type definitions
- `index.ts` - Main export function
- `huggingface.ts` - HuggingFace format
- `openai.ts` - OpenAI format
- `anthropic.ts` - Anthropic format
- `csv.ts` - CSV format
- `example.ts` - Usage examples

## Future Enhancements

- [ ] Compression support (gzip/zip)
- [ ] Validation split (train/val/test)
- [ ] Incremental exports
- [ ] Export merging
- [ ] Custom format plugins
- [ ] Arrow/Parquet support (when available)
- [ ] Remote storage (S3, GCS)
- [ ] Export streaming for large datasets

## Contributing

When adding new export formats:

1. Create `<format>.ts` in `export/` directory
2. Implement format-specific conversion
3. Add to switch statement in `index.ts`
4. Update README with format documentation
5. Add examples to `example.ts`

## License

See project LICENSE file.
