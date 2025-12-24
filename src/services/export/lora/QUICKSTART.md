# LoRA Export Quick Start

Quick guide to exporting training data for LoRA fine-tuning.

## Format Overview

| Format | Best For | File Type |
|--------|----------|-----------|
| **Alpaca** | General instruction following | JSONL |
| **ShareGPT** | Multi-turn conversations | JSON |
| **OpenAI Messages** | OpenAI fine-tuning API | JSONL |
| **Anthropic Prompts** | Claude-style prompts | JSONL |

## Quick Examples

### 1. Export in Alpaca Format

```typescript
import { exportToFormat } from './services/export/lora/formats/index.js';

const examples = [
  {
    system: "You are an AI assistant that follows coding guidelines.",
    instruction: "How should I configure TypeScript?",
    input: "",
    output: "Always enable strict mode in tsconfig.json for maximum type safety.",
  }
];

const result = await exportToFormat(examples, {
  format: 'alpaca',
  outputPath: './datasets/alpaca',
  policy: 'extraction',
  splitRatio: 0.1,
  includeGuidelines: true,
});

console.log(`Exported ${result.stats.trainExamples} training examples`);
```

### 2. Export with Training Script

```typescript
const result = await exportToFormat(examples, {
  format: 'alpaca',
  outputPath: './datasets/my-model',
  policy: 'extraction',
  targetModel: 'meta-llama/Llama-2-7b-hf',
  generateScript: true,  // Generate train.py
});

// Files created:
// - train.jsonl
// - eval.jsonl
// - metadata.json
// - README.md
// - adapter_config.json
// - train.py
// - requirements.txt
// - dataset_info.yaml
```

### 3. Export for OpenAI Fine-Tuning

```typescript
const result = await exportToFormat(examples, {
  format: 'openai-messages',
  outputPath: './datasets/openai',
  policy: 'retrieval',
  includeGuidelines: true,
  splitRatio: 0.1,
});

// Then upload to OpenAI:
// openai api files.create -f train.jsonl -p fine-tune
```

## File Structure

After export, your directory will contain:

```
datasets/my-model/
├── train.jsonl              # Training examples
├── eval.jsonl               # Evaluation examples
├── metadata.json            # Dataset metadata
├── README.md                # Format-specific usage guide
├── adapter_config.json      # LoRA adapter configuration
├── train.py                 # Training script (if generateScript: true)
├── requirements.txt         # Python dependencies (if generateScript: true)
└── dataset_info.yaml        # Dataset statistics (if generateScript: true)
```

## Training with Exported Data

### Using the Generated Script

```bash
cd datasets/my-model

# Install dependencies
pip install -r requirements.txt

# Run training
python train.py
```

### Custom Training with PEFT

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model
from datasets import load_dataset

# Load model
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-hf")

# Load LoRA config from exported file
import json
with open('adapter_config.json') as f:
    lora_config_dict = json.load(f)

lora_config = LoraConfig(**lora_config_dict)
model = get_peft_model(model, lora_config)

# Load dataset
dataset = load_dataset('json', data_files={
    'train': 'train.jsonl',
    'validation': 'eval.jsonl'
})

# Continue with training...
```

## Configuration Options

```typescript
interface LoRAExportConfig {
  // Required
  format: 'alpaca' | 'sharegpt' | 'openai-messages' | 'anthropic-prompts';
  outputPath: string;
  policy: 'extraction' | 'retrieval' | 'consolidation';

  // Optional
  splitRatio?: number;           // Default: 0.1 (90/10 split)
  includeGuidelines?: boolean;   // Default: true
  maxExamples?: number;          // Limit total examples
  targetModel?: string;          // Generate adapter config
  generateScript?: boolean;      // Generate training script
  metadata?: Record<string, any>; // Additional metadata
}
```

## Format-Specific Notes

### Alpaca Format
- ✅ Best for instruction following tasks
- ✅ Simple, widely supported
- ✅ Works with Axolotl, Alpaca-LoRA
- ⚠️ Less suitable for multi-turn conversations

### ShareGPT Format
- ✅ Best for conversational models
- ✅ Supports system prompts
- ✅ Multi-turn conversation support
- ✅ Works with FastChat, Vicuna

### OpenAI Messages Format
- ✅ Native OpenAI fine-tuning format
- ✅ Validates token limits automatically
- ✅ Direct upload to OpenAI API
- ⚠️ Requires OpenAI API access

### Anthropic Prompts Format
- ✅ Claude-style prompts
- ✅ Good for few-shot learning
- ✅ Compatible with prompt/completion training
- ⚠️ Claude fine-tuning not yet publicly available

## Next Steps

1. **Generate Training Data**: Use the export functions to create datasets
2. **Review Quality**: Check a sample of examples for correctness
3. **Train Model**: Use the generated script or custom training loop
4. **Evaluate**: Test the fine-tuned model on held-out examples
5. **Deploy**: Integrate the LoRA adapter into your application

## Common Issues

**Problem**: Export fails with "No training examples"
**Solution**: Ensure your examples array is not empty

**Problem**: Token limit warnings in OpenAI format
**Solution**: Reduce example length or use a different format

**Problem**: Training script fails to run
**Solution**: Install all dependencies from requirements.txt

## Resources

- [LoRA Paper](https://arxiv.org/abs/2106.09685)
- [PEFT Documentation](https://huggingface.co/docs/peft)
- [Alpaca Format](https://github.com/tatsu-lab/stanford_alpaca)
- [ShareGPT Format](https://sharegpt.com/)
- [OpenAI Fine-Tuning](https://platform.openai.com/docs/guides/fine-tuning)
