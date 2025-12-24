# LoRA Export for Agent Memory

Export guidelines as training data for fine-tuning language models using LoRA (Low-Rank Adaptation).

## Overview

The LoRA export feature converts Agent Memory guidelines into structured training datasets that can be used to fine-tune language models. This enables models to internalize project-specific coding standards, best practices, and guidelines.

### Key Features

- **Multiple Format Support**: Alpaca, ShareGPT, OpenAI Messages, Anthropic Prompts
- **Automatic Example Generation**: Creates diverse training examples from guidelines
- **Contrastive Learning**: Optional negative examples for better model alignment
- **Complete Training Setup**: Generates adapter configs, training scripts, and documentation
- **Flexible Filtering**: Select guidelines by scope, category, priority, or tags

## Supported Formats

### 1. Alpaca Format
```json
{
  "instruction": "Follow this code_style guideline: Use TypeScript strict mode",
  "input": "When configuring TypeScript...",
  "output": "Always enable strict mode in tsconfig.json..."
}
```

### 2. ShareGPT Format
```json
{
  "conversations": [
    {"from": "system", "value": "You are an AI assistant..."},
    {"from": "human", "value": "How should you handle TypeScript configuration?"},
    {"from": "gpt", "value": "Always enable strict mode..."}
  ]
}
```

### 3. OpenAI Messages Format
```json
{
  "messages": [
    {"role": "system", "content": "You are an AI assistant..."},
    {"role": "user", "content": "How should you handle TypeScript configuration?"},
    {"role": "assistant", "content": "Always enable strict mode..."}
  ]
}
```

### 4. Anthropic Prompts Format
```json
{
  "prompt": "You are an AI assistant...\n\nHow should you handle TypeScript configuration?",
  "completion": "Always enable strict mode..."
}
```

## Usage

### Basic Export

```typescript
import { exportGuidelinesAsLoRA } from './services/export/lora/index.js';

const result = await exportGuidelinesAsLoRA(db, {
  format: 'alpaca',
  outputPath: './my-lora-dataset',
  examplesPerGuideline: 3,
  includeNegative: false,
});

console.log(`Exported ${result.stats.totalExamples} examples to ${result.files.train}`);
```

### Advanced Filtering

```typescript
const result = await exportGuidelinesAsLoRA(db, {
  format: 'sharegpt',
  outputPath: './lora-export',

  // Filter guidelines
  filter: {
    scopeType: 'project',
    scopeId: 'my-project-id',
    category: 'code_style',
    priority: { min: 70 },
    tags: ['typescript', 'critical'],
    activeOnly: true,
  },

  // Generation options
  examplesPerGuideline: 5,
  includeNegative: true,
  splitRatio: 0.15,  // 85% train, 15% eval

  // Model configuration
  targetModel: 'llama',
  generateScript: true,
});
```

### Configuration via Environment

```bash
# Enable LoRA exports
export AGENT_MEMORY_LORA_ENABLED=true

# Set defaults
export AGENT_MEMORY_LORA_DEFAULT_FORMAT=alpaca
export AGENT_MEMORY_LORA_EXAMPLES_PER_GUIDELINE=3
export AGENT_MEMORY_LORA_INCLUDE_NEGATIVE=false
export AGENT_MEMORY_LORA_OUTPUT_PATH=./lora-export

# LoRA hyperparameters
export AGENT_MEMORY_LORA_RANK=16
export AGENT_MEMORY_LORA_ALPHA=32
export AGENT_MEMORY_LORA_DROPOUT=0.05
export AGENT_MEMORY_LORA_TARGET_MODEL=llama

# Filtering
export AGENT_MEMORY_LORA_MIN_PRIORITY=70
```

## Training Workflow

### 1. Export Guidelines

```bash
# Via MCP tool (when available)
{
  "tool": "export_lora",
  "format": "alpaca",
  "output_path": "./training-data",
  "examples_per_guideline": 5
}
```

### 2. Review Generated Files

```
lora-export/
├── train.json              # Training dataset
├── eval.json               # Evaluation dataset
├── adapter_config.json     # LoRA adapter configuration
├── train.py               # Training script stub
├── requirements.txt       # Python dependencies
├── dataset_info.yaml      # Dataset metadata
├── metadata.json          # Export metadata
└── README.md              # Usage instructions
```

### 3. Install Dependencies

```bash
cd lora-export
pip install -r requirements.txt
```

### 4. Customize Training Script

Edit `train.py` to match your model and requirements:

```python
MODEL_NAME = "meta-llama/Llama-2-7b-hf"  # Your base model
DATASET_PATH = "./train.json"
OUTPUT_DIR = "./lora-output"

# Adjust training arguments
TRAINING_ARGS = TrainingArguments(
    num_train_epochs=3,
    per_device_train_batch_size=4,
    learning_rate=2e-4,
    # ... customize as needed
)
```

### 5. Run Training

```bash
python train.py
```

### 6. Use Fine-tuned Model

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

# Load base model
base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")

# Load LoRA adapter
model = PeftModel.from_pretrained(base_model, "./lora-output")

# Use the model
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-hf")
inputs = tokenizer("How should I configure TypeScript?", return_tensors="pt")
outputs = model.generate(**inputs)
```

## Model Compatibility

### Supported Architectures

The export automatically configures adapter settings for popular architectures:

- **LLaMA/LLaMA-2**: Meta's open-source models
- **Mistral**: Mistral AI models
- **GPT-2**: OpenAI's GPT-2
- **BLOOM**: BigScience BLOOM models
- **T5**: Google's T5 models

### Adapter Configuration

Default configurations by model size:

| Size   | Rank | Alpha | Dropout | Use Case                    |
|--------|------|-------|---------|----------------------------|
| Small  | 8    | 16    | 0.05    | Quick experiments, <3B params |
| Medium | 16   | 32    | 0.05    | General use, 3-13B params    |
| Large  | 32   | 64    | 0.10    | Large models, 13B+ params    |

### Target Modules

Different architectures require different target modules:

```typescript
// LLaMA/Mistral
target_modules: ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj']

// GPT-2
target_modules: ['c_attn', 'c_proj', 'c_fc']

// T5
target_modules: ['q', 'v', 'k', 'o', 'wi', 'wo']
```

## Advanced Features

### Contrastive Examples

Enable negative examples for better model alignment:

```typescript
{
  includeNegative: true,  // Generates anti-pattern examples
  examplesPerGuideline: 5  // 70% positive, 30% negative
}
```

This helps the model learn what NOT to do, improving adherence to guidelines.

### Custom System Prompts

Examples include context-aware system prompts:

```
You are an AI assistant that strictly follows coding guidelines and best practices.
This is a critical priority code_style guideline that must be followed carefully.
```

### Priority-Based Filtering

Focus on high-priority guidelines:

```typescript
filter: {
  priority: { min: 90 }  // Only critical guidelines
}
```

### Metadata Preservation

Each example includes traceability metadata:

```json
{
  "metadata": {
    "guidelineName": "Use TypeScript strict mode",
    "category": "code_style",
    "priority": 95,
    "tags": ["typescript", "critical"]
  }
}
```

## Best Practices

### Dataset Quality

1. **Start Small**: Begin with 3-5 examples per guideline
2. **Use High-Priority Guidelines**: Filter by `priority >= 70`
3. **Include Contrastive Examples**: Set `includeNegative: true` for better alignment
4. **Review Examples**: Check generated examples before training

### Training Configuration

1. **Match Model Size**: Use appropriate LoRA rank
   - Small models (<3B): rank=8
   - Medium models (3-13B): rank=16
   - Large models (13B+): rank=32

2. **Adjust Learning Rate**: Start with `2e-4` and decrease if unstable

3. **Monitor Validation Loss**: Use the eval dataset to prevent overfitting

4. **Gradual Deployment**: Test fine-tuned model thoroughly before production

### Integration with Agent Memory

The fine-tuned model can be used with Agent Memory's RL system:

```typescript
// Use custom model for extraction
config.rl.extractionModelPath = './lora-output'
```

## Troubleshooting

### Common Issues

**No guidelines found**
- Check filter criteria
- Verify scope and tags
- Ensure guidelines are active

**Low-quality examples**
- Increase `examplesPerGuideline`
- Add more detailed guideline content
- Include rationale in guidelines

**Training fails**
- Reduce batch size
- Lower learning rate
- Check GPU memory

**Model doesn't follow guidelines**
- Include contrastive examples
- Increase training epochs
- Use higher priority guidelines
- Add more examples per guideline

## API Reference

### `exportGuidelinesAsLoRA(db, config)`

Main export function.

**Parameters:**
- `db: DbClient` - Database client
- `config: GuidelineExportConfig` - Export configuration

**Returns:** `Promise<LoRAExportResult>`

### `GuidelineExportConfig`

```typescript
interface GuidelineExportConfig {
  format: LoRAFormat;
  outputPath: string;
  filter?: GuidelineFilter;
  examplesPerGuideline?: number;
  includeNegative?: boolean;
  splitRatio?: number;
  targetModel?: string;
  generateScript?: boolean;
  includeMetadata?: boolean;
  seed?: number;
}
```

### `LoRAExportResult`

```typescript
interface LoRAExportResult {
  success: boolean;
  format: LoRAFormat;
  files: {
    train: string;
    eval: string;
    metadata: string;
    readme: string;
    adapterConfig?: string;
    trainingScript?: string;
    datasetInfo?: string;
  };
  stats: LoRAExportStats;
  error?: string;
  warnings?: string[];
}
```

## Resources

### Documentation
- [PEFT Library](https://github.com/huggingface/peft)
- [LoRA Paper](https://arxiv.org/abs/2106.09685)
- [Hugging Face Datasets](https://huggingface.co/docs/datasets/)

### Model Hubs
- [Hugging Face Models](https://huggingface.co/models)
- [Meta LLaMA](https://ai.meta.com/llama/)
- [Mistral AI](https://mistral.ai/)

### Training Guides
- [Fine-tuning LLMs with LoRA](https://huggingface.co/docs/peft/task_guides/lora)
- [Efficient Fine-tuning](https://github.com/huggingface/peft#-usage)

## Contributing

To add support for new formats or models:

1. Add format to `LoRAFormat` type in `types.ts`
2. Implement converter in `formats/index.ts`
3. Add model configuration in `adapter-config.ts`
4. Update documentation

## License

Part of Agent Memory - see project LICENSE file.
