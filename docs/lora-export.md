# LoRA Training Data Export

Export guidelines as LoRA (Low-Rank Adaptation) training data for model fine-tuning.

## Overview

The `memory_lora` tool enables you to create training datasets from your stored guidelines for fine-tuning language models using LoRA adapters. This allows you to create specialized models that internalize your project's guidelines, coding standards, and best practices.

## Features

- **Multiple Format Support**: Export to HuggingFace, OpenAI, Anthropic, or Alpaca formats
- **Automatic Example Generation**: Generate training examples from guidelines
- **Customizable Filtering**: Filter guidelines by category, priority, tags, or scope
- **Train/Eval Split**: Automatic splitting into training and evaluation datasets
- **Training Script Generation**: Generate ready-to-use training scripts for your target model

## Actions

### export

Export guidelines as training data for LoRA fine-tuning.

**Parameters:**

| Parameter              | Type    | Required | Description                                                             |
| ---------------------- | ------- | -------- | ----------------------------------------------------------------------- |
| `action`               | string  | Yes      | Must be "export"                                                        |
| `targetModel`          | string  | Yes      | Target model name (e.g., "meta-llama/Llama-3-8B")                       |
| `format`               | string  | No       | Export format: "huggingface" (default), "openai", "anthropic", "alpaca" |
| `outputPath`           | string  | Yes      | Output directory path for datasets                                      |
| `agentId`              | string  | Yes      | Agent identifier for access control                                     |
| `admin_key`            | string  | Yes      | Admin key for authorization                                             |
| `includeExamples`      | boolean | No       | Generate examples from guideline examples (default: true)               |
| `examplesPerGuideline` | number  | No       | Number of examples per guideline (default: 3)                           |
| `trainEvalSplit`       | number  | No       | Train/eval split ratio 0-1 (default: 0.9)                               |
| `guidelineFilter`      | object  | No       | Filter criteria for guidelines                                          |

**Guideline Filter Object:**

```typescript
{
  category?: string;        // Filter by category
  priority?: number;        // Filter by exact priority
  tags?: string[];          // Filter by tags
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;         // Scope ID if scopeType specified
}
```

**Example:**

```json
{
  "action": "export",
  "targetModel": "meta-llama/Llama-3-8B",
  "format": "huggingface",
  "outputPath": "./lora_datasets",
  "includeExamples": true,
  "examplesPerGuideline": 3,
  "trainEvalSplit": 0.9,
  "guidelineFilter": {
    "category": "code_style",
    "scopeType": "project",
    "scopeId": "my-project-id"
  },
  "agentId": "my-agent",
  "admin_key": "admin-secret-key"
}
```

**Response:**

```json
{
  "success": true,
  "targetModel": "meta-llama/Llama-3-8B",
  "format": "huggingface",
  "outputPath": "/absolute/path/to/lora_datasets",
  "trainFile": "/absolute/path/to/lora_datasets/meta_llama_Llama_3_8B_huggingface_train_2025-12-24.jsonl",
  "evalFile": "/absolute/path/to/lora_datasets/meta_llama_Llama_3_8B_huggingface_eval_2025-12-24.jsonl",
  "configFile": "/absolute/path/to/lora_datasets/meta_llama_Llama_3_8B_huggingface_config_2025-12-24.json",
  "stats": {
    "totalExamples": 150,
    "trainExamples": 135,
    "evalExamples": 15,
    "trainEvalSplit": 0.9
  }
}
```

### list_adapters

List existing adapter configurations in a directory.

**Parameters:**

| Parameter    | Type   | Required | Description                                 |
| ------------ | ------ | -------- | ------------------------------------------- |
| `action`     | string | Yes      | Must be "list_adapters"                     |
| `outputPath` | string | No       | Directory to search (default: dataDir/lora) |

**Example:**

```json
{
  "action": "list_adapters",
  "outputPath": "./lora_datasets"
}
```

**Response:**

```json
{
  "success": true,
  "adapters": [
    {
      "name": "meta_llama_Llama_3_8B_huggingface_2025-12-24",
      "targetModel": "meta-llama/Llama-3-8B",
      "format": "huggingface",
      "createdAt": "2025-12-24T10:30:00.000Z",
      "datasetPath": "/absolute/path/to/lora_datasets",
      "exampleCount": 150
    }
  ],
  "searchPath": "/absolute/path/to/lora_datasets",
  "count": 1
}
```

### generate_script

Generate a training script for a target model and format.

**Parameters:**

| Parameter     | Type   | Required    | Description                                                      |
| ------------- | ------ | ----------- | ---------------------------------------------------------------- |
| `action`      | string | Yes         | Must be "generate_script"                                        |
| `targetModel` | string | Yes         | Target model name                                                |
| `format`      | string | No          | Format: "huggingface" (default), "openai", "anthropic", "alpaca" |
| `datasetPath` | string | Yes         | Path to dataset directory                                        |
| `outputPath`  | string | No          | Output path for script file                                      |
| `admin_key`   | string | Conditional | Required if outputPath is specified                              |

**Example:**

```json
{
  "action": "generate_script",
  "targetModel": "meta-llama/Llama-3-8B",
  "format": "huggingface",
  "datasetPath": "./lora_datasets",
  "outputPath": "./lora_datasets",
  "admin_key": "admin-secret-key"
}
```

**Response:**

```json
{
  "success": true,
  "targetModel": "meta-llama/Llama-3-8B",
  "format": "huggingface",
  "script": "#!/usr/bin/env python3\n...",
  "scriptPath": "/absolute/path/to/lora_datasets/train_huggingface.py"
}
```

## Export Formats

### HuggingFace

Standard format for HuggingFace transformers with PEFT/LoRA.

**Output Format:**

```jsonl
{"text": "<|user|>What is the guideline for \"code formatting\"?<|assistant|>Use Prettier with default settings...<|end|>", "metadata": {...}}
```

**Use Case:** Fine-tuning open-source models like Llama, Mistral, etc.

### OpenAI

Format compatible with OpenAI's fine-tuning API.

**Output Format:**

```jsonl
{
  "messages": [
    {
      "role": "system",
      "content": "..."
    },
    {
      "role": "user",
      "content": "..."
    },
    {
      "role": "assistant",
      "content": "..."
    }
  ]
}
```

**Use Case:** Fine-tuning GPT-3.5 or GPT-4 models.

### Anthropic

Format compatible with Anthropic's Claude format (placeholder for future use).

**Output Format:**

```jsonl
{"system": "...", "messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}], "metadata": {...}}
```

**Use Case:** Preparing for potential Claude fine-tuning support.

### Alpaca

Stanford Alpaca instruction-following format.

**Output Format:**

```jsonl
{"instruction": "Provide guidance based on established guidelines.", "input": "...", "output": "...", "metadata": {...}}
```

**Use Case:** Instruction fine-tuning for open-source models.

## Training Example Generation

The handler automatically generates multiple types of training examples from each guideline:

### Base Examples (3 per guideline)

1. **Direct Query**: "What is the guideline for X?"
2. **Contextual Query**: "I need guidance on X. What should I know?"
3. **Validation Query**: "How should I handle X?"

### From Guideline Examples

If `includeExamples` is true and the guideline has good/bad examples:

- **Good Examples**: "Is this approach correct? [example]" → "Yes, this follows the guideline..."
- **Bad Examples**: "Is this approach correct? [example]" → "No, this violates the guideline..."

Number controlled by `examplesPerGuideline` parameter.

## Workflow Example

### 1. Export Guidelines

```json
{
  "action": "export",
  "targetModel": "meta-llama/Llama-3-8B",
  "format": "huggingface",
  "outputPath": "./my_lora_dataset",
  "guidelineFilter": {
    "scopeType": "project",
    "scopeId": "my-project"
  },
  "agentId": "agent-1",
  "admin_key": "secret"
}
```

### 2. Generate Training Script

```json
{
  "action": "generate_script",
  "targetModel": "meta-llama/Llama-3-8B",
  "format": "huggingface",
  "datasetPath": "./my_lora_dataset",
  "outputPath": "./my_lora_dataset",
  "admin_key": "secret"
}
```

### 3. Run Training

```bash
cd my_lora_dataset
python train_huggingface.py
```

### 4. Use the Fine-tuned Model

The LoRA adapter will be saved to `./lora_output` and can be loaded with:

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM

base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3-8B")
model = PeftModel.from_pretrained(base_model, "./lora_output")
```

## Best Practices

### Data Quality

- Ensure guidelines are clear, concise, and well-documented
- Add good and bad examples to guidelines for better training quality
- Review generated examples before training

### Dataset Size

- Aim for 100+ examples minimum for meaningful fine-tuning
- Use `examplesPerGuideline` to control dataset size
- Monitor train/eval split to ensure adequate evaluation data

### Model Selection

- **Small models (7B-13B)**: Faster training, lower resource requirements
- **Large models (70B+)**: Better quality, higher resource requirements
- Consider using quantized models (4-bit, 8-bit) for efficiency

### LoRA Configuration

Default script settings:

- `r=8`: Rank of LoRA matrices
- `lora_alpha=32`: Scaling factor
- `lora_dropout=0.1`: Dropout for regularization

Adjust based on:

- Dataset size (larger → higher rank)
- Task complexity (complex → higher rank)
- Overfitting (increase dropout)

### Filtering

Use `guidelineFilter` to:

- Focus on specific categories (e.g., only "security" guidelines)
- Train separate adapters for different scopes
- Control dataset composition by priority

## Security Considerations

- **Admin Key Required**: All export operations require admin authentication
- **Read Permissions**: Checks agent read permissions for guideline scope
- **Path Validation**: Output paths are validated to prevent directory traversal
- **No PII**: Review guidelines to ensure no personally identifiable information

## Troubleshooting

### No Guidelines Found

**Error**: "No guidelines found matching the filter criteria"

**Solution:**

- Check `guidelineFilter` parameters
- Verify guidelines exist in the specified scope
- Remove filters to export all guidelines

### Permission Denied

**Error**: "Permission denied"

**Solution:**

- Provide valid `admin_key` parameter
- Check agent has read permission for guideline scope
- Verify `agentId` is correct

### Empty Examples

**Problem**: Generated dataset has few examples

**Solution:**

- Increase `examplesPerGuideline` parameter
- Add good/bad examples to guidelines
- Expand guideline filter to include more guidelines

## File Outputs

### Training Data Files

- `{model}_{format}_train_{date}.jsonl`: Training dataset
- `{model}_{format}_eval_{date}.jsonl`: Evaluation dataset

### Configuration File

- `{model}_{format}_config_{date}.json`: Adapter metadata

### Training Script

- `train_{format}.py`: Python training script

## Related Tools

- `memory_guideline`: Manage guidelines that become training data
- `memory_export`: Export guidelines in other formats
- `memory_query`: Query guidelines to verify content
- `memory_rl`: RL-based policy training (different from LoRA)

## References

- [LoRA Paper](https://arxiv.org/abs/2106.09685)
- [HuggingFace PEFT](https://github.com/huggingface/peft)
- [Alpaca Format](https://github.com/tatsu-lab/stanford_alpaca)
