/**
 * Anthropic LoRA Format Exporter
 *
 * Export training data in Anthropic/Claude format with prompt/completion pairs.
 * Includes Human/Assistant conversation format with guideline context.
 */

import type {
  TrainingExample,
  AnthropicPromptsExample,
  LoRAExportConfig,
  LoRAExportResult,
} from '../types.js';

// =============================================================================
// ANTHROPIC PROMPTS FORMAT EXPORT
// =============================================================================

/**
 * Export training examples in Anthropic prompts format
 *
 * Format: {"prompt": "Human: ...", "completion": "Assistant: ..."}
 * Compatible with: Claude fine-tuning workflows (when available)
 *
 * @param examples - Training examples to export
 * @param config - Export configuration
 * @returns Export result with file paths and stats
 */
export async function exportAnthropicPromptsFormat(
  examples: TrainingExample[],
  config: LoRAExportConfig
): Promise<LoRAExportResult> {
  const fs = await import('fs/promises');

  try {
    await fs.mkdir(config.outputPath, { recursive: true });

    // Split into train/eval
    const splitRatio = config.splitRatio ?? 0.1;
    const splitIndex = Math.floor(examples.length * (1 - splitRatio));
    const trainExamples = examples.slice(0, splitIndex);
    const evalExamples = examples.slice(splitIndex);

    // Convert to Anthropic format
    const trainData = trainExamples.map((ex) =>
      convertToAnthropicPrompts(ex, config.includeGuidelines)
    );
    const evalData = evalExamples.map((ex) =>
      convertToAnthropicPrompts(ex, config.includeGuidelines)
    );

    // Write train.jsonl
    const trainPath = `${config.outputPath}/train.jsonl`;
    await fs.writeFile(trainPath, trainData.map((ex) => JSON.stringify(ex)).join('\n'));

    // Write eval.jsonl
    const evalPath = `${config.outputPath}/eval.jsonl`;
    await fs.writeFile(evalPath, evalData.map((ex) => JSON.stringify(ex)).join('\n'));

    // Create dataset info
    const datasetInfo = {
      dataset_name: `agent_memory_${config.policy}_anthropic`,
      format: 'anthropic-prompts',
      description: `LoRA training dataset for ${config.policy} policy in Anthropic format`,
      version: '1.0.0',
      features: {
        prompt: { dtype: 'string', _type: 'Value' },
        completion: { dtype: 'string', _type: 'Value' },
      },
      splits: {
        train: { num_examples: trainData.length },
        eval: { num_examples: evalData.length },
      },
      includeGuidelines: config.includeGuidelines,
      ...config.metadata,
    };

    const infoPath = `${config.outputPath}/dataset_info.json`;
    await fs.writeFile(infoPath, JSON.stringify(datasetInfo, null, 2));

    // Create metadata.json
    const metadata = {
      format: 'anthropic-prompts',
      policy: config.policy,
      totalExamples: examples.length,
      trainExamples: trainData.length,
      evalExamples: evalData.length,
      splitRatio,
      exportedAt: new Date().toISOString(),
      ...config.metadata,
    };

    const metadataPath = `${config.outputPath}/metadata.json`;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Create GUIDE.md
    const guidePath = `${config.outputPath}/GUIDE.md`;
    await fs.writeFile(guidePath, generateAnthropicGuide(config, datasetInfo));

    // Get file sizes
    const files = {
      train: trainPath,
      eval: evalPath,
      metadata: metadataPath,
      readme: guidePath,
      datasetInfo: infoPath,
    };

    const fileSizes: Record<string, number> = {};
    for (const [_key, path] of Object.entries(files)) {
      const stat = await fs.stat(path);
      fileSizes[path] = stat.size;
    }

    return {
      success: true,
      format: 'anthropic-prompts',
      files,
      stats: {
        totalExamples: examples.length,
        trainExamples: trainData.length,
        evalExamples: evalData.length,
        fileSizes,
        exportedAt: new Date().toISOString(),
        policyType: config.policy ?? 'extraction',
      },
    };
  } catch (error) {
    return {
      success: false,
      format: 'anthropic-prompts',
      files: {
        train: '',
        eval: '',
        metadata: '',
        readme: '',
      },
      stats: {
        totalExamples: 0,
        trainExamples: 0,
        evalExamples: 0,
        fileSizes: {},
        exportedAt: new Date().toISOString(),
        policyType: config.policy ?? 'extraction',
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// FORMAT CONVERTERS
// =============================================================================

/**
 * Convert training example to Anthropic prompts format
 */
function convertToAnthropicPrompts(
  example: TrainingExample,
  includeGuidelines = true
): AnthropicPromptsExample {
  // Build prompt with Human/Assistant format
  let prompt = '';

  // Add system context as part of the human prompt if requested
  if (includeGuidelines && example.system) {
    prompt += `${example.system}\n\n`;
  }

  // Add human instruction
  const instruction = example.input
    ? `${example.instruction}\n\n${example.input}`
    : example.instruction;

  prompt += `Human: ${instruction}\n\nAssistant:`;

  // Completion is just the output
  const completion = ` ${example.output}`;

  return {
    prompt,
    completion,
  };
}

// =============================================================================
// DOCUMENTATION
// =============================================================================

/**
 * Generate Anthropic usage guide
 */
function generateAnthropicGuide(config: LoRAExportConfig, datasetInfo: any): string {
  return `# Anthropic/Claude Fine-Tuning Dataset

Dataset for training models on ${config.policy} policy decisions in Anthropic's prompt/completion format.

## Dataset Information

- **Format**: Anthropic Prompts (Human/Assistant)
- **Policy Type**: ${config.policy}
- **Total Examples**: ${datasetInfo.splits.train.num_examples + datasetInfo.splits.eval.num_examples}
- **Training Examples**: ${datasetInfo.splits.train.num_examples}
- **Evaluation Examples**: ${datasetInfo.splits.eval.num_examples}
- **Guideline Context**: ${datasetInfo.includeGuidelines ? 'Included in prompts' : 'Not included'}
- **Version**: ${datasetInfo.version}

## File Format

Each line in the JSONL file contains a training example:

\`\`\`json
{
  "prompt": "Human: [Instruction and context]\\n\\nAssistant:",
  "completion": " [Expected response]"
}
\`\`\`

## Format Details

The format follows Anthropic's Human/Assistant conversation pattern:

- **Prompt**: Ends with \`Assistant:\` to signal where completion begins
- **Completion**: Starts with a space, contains the expected response
- **System Context**: Included at the beginning of prompts if \`includeGuidelines\` is enabled

## Loading the Dataset

### Using Python

\`\`\`python
import json

# Load training data
with open('train.jsonl') as f:
    train_examples = [json.loads(line) for line in f]

# Load evaluation data
with open('eval.jsonl') as f:
    eval_examples = [json.loads(line) for line in f]

# Access first example
example = train_examples[0]
print(f"Prompt: {example['prompt']}")
print(f"Completion: {example['completion']}")
\`\`\`

### Using HuggingFace Datasets

\`\`\`python
from datasets import load_dataset

# Load from local files
dataset = load_dataset('json', data_files={
    'train': 'train.jsonl',
    'validation': 'eval.jsonl'
})

# Access examples
print(dataset['train'][0])
\`\`\`

## Using with Claude (Few-Shot Prompting)

While Claude fine-tuning may not be publicly available, you can use these examples for few-shot prompting:

\`\`\`python
import anthropic
import json

# Load examples
with open('train.jsonl') as f:
    examples = [json.loads(line) for line in f]

# Create client
client = anthropic.Anthropic(api_key="your-api-key")

# Use examples in few-shot prompt
few_shot_examples = examples[:3]  # Use first 3 as demonstrations

prompt = ""
for ex in few_shot_examples:
    prompt += f"{ex['prompt']}{ex['completion']}\\n\\n"

# Add your actual query
prompt += "Human: [Your actual question]\\n\\nAssistant:"

# Get response
message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": prompt}
    ]
)

print(message.content[0].text)
\`\`\`

## Training with LoRA on Compatible Models

Since Claude fine-tuning isn't publicly available, you can train LoRA adapters on compatible open models:

### Using PEFT with LLaMA/Mistral

\`\`\`python
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from peft import LoraConfig, get_peft_model
from datasets import load_dataset

# Load model
model_name = "meta-llama/Llama-2-7b-hf"
model = AutoModelForCausalLM.from_pretrained(model_name, load_in_8bit=True)
tokenizer = AutoTokenizer.from_pretrained(model_name)

# Configure LoRA
lora_config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

model = get_peft_model(model, lora_config)

# Load dataset
dataset = load_dataset('json', data_files={
    'train': 'train.jsonl',
    'validation': 'eval.jsonl'
})

# Tokenization function
def tokenize_function(example):
    # Combine prompt and completion
    full_text = example['prompt'] + example['completion']

    # Tokenize
    tokenized = tokenizer(
        full_text,
        truncation=True,
        max_length=2048,
        padding='max_length'
    )

    # Labels are the same as input_ids for causal LM
    tokenized['labels'] = tokenized['input_ids'].copy()

    return tokenized

# Apply tokenization
tokenized_dataset = dataset.map(
    tokenize_function,
    remove_columns=['prompt', 'completion']
)

# Training arguments
training_args = TrainingArguments(
    output_dir="./lora-${config.policy}",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=2,
    learning_rate=2e-4,
    fp16=True,
    save_steps=100,
    eval_steps=50,
    logging_steps=10,
    evaluation_strategy="steps",
    warmup_steps=100,
)

# Create trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset['train'],
    eval_dataset=tokenized_dataset['validation'],
)

# Train
trainer.train()

# Save LoRA adapter
model.save_pretrained("./lora-${config.policy}-final")
\`\`\`

## Advanced: Custom Training Loop

For more control, use a custom training loop:

\`\`\`python
import torch
from torch.utils.data import DataLoader
from transformers import get_linear_schedule_with_warmup

# Prepare dataloader
train_dataloader = DataLoader(
    tokenized_dataset['train'],
    batch_size=4,
    shuffle=True
)

# Setup optimizer
optimizer = torch.optim.AdamW(model.parameters(), lr=2e-4)

# Setup scheduler
num_training_steps = len(train_dataloader) * 3  # 3 epochs
scheduler = get_linear_schedule_with_warmup(
    optimizer,
    num_warmup_steps=100,
    num_training_steps=num_training_steps
)

# Training loop
model.train()
for epoch in range(3):
    for batch in train_dataloader:
        outputs = model(**batch)
        loss = outputs.loss

        loss.backward()
        optimizer.step()
        scheduler.step()
        optimizer.zero_grad()

        print(f"Epoch {epoch}, Loss: {loss.item():.4f}")
\`\`\`

## Inference with Trained Model

\`\`\`python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

# Load base model
base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-hf")

# Load LoRA adapter
model = PeftModel.from_pretrained(base_model, "./lora-${config.policy}-final")

# Prepare prompt
prompt = "Human: What should I extract from this conversation?\\n\\nAssistant:"

# Generate
inputs = tokenizer(prompt, return_tensors="pt")
outputs = model.generate(
    **inputs,
    max_new_tokens=256,
    temperature=0.7,
    do_sample=True
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(response)
\`\`\`

## Converting to Other Formats

The Anthropic format can be easily converted to other formats:

### To Alpaca Format

\`\`\`python
import json

with open('train.jsonl') as f:
    anthropic_data = [json.loads(line) for line in f]

alpaca_data = []
for ex in anthropic_data:
    # Extract instruction from prompt (after "Human: ")
    prompt = ex['prompt']
    instruction = prompt.split("Human: ")[1].split("\\n\\nAssistant:")[0]

    alpaca_data.append({
        "instruction": instruction,
        "input": "",
        "output": ex['completion'].strip()
    })

# Save as Alpaca format
with open('alpaca_train.json', 'w') as f:
    json.dump(alpaca_data, f, indent=2)
\`\`\`

### To OpenAI Messages Format

\`\`\`python
import json

with open('train.jsonl') as f:
    anthropic_data = [json.loads(line) for line in f]

openai_data = []
for ex in anthropic_data:
    prompt = ex['prompt']
    completion = ex['completion']

    # Extract system and user content
    if "Human: " in prompt:
        parts = prompt.split("Human: ")
        system_content = parts[0].strip() if parts[0] else ""
        user_content = parts[1].replace("\\n\\nAssistant:", "").strip()

        messages = []
        if system_content:
            messages.append({"role": "system", "content": system_content})
        messages.append({"role": "user", "content": user_content})
        messages.append({"role": "assistant", "content": completion.strip()})

        openai_data.append({"messages": messages})

# Save as OpenAI format
with open('openai_train.jsonl', 'w') as f:
    for ex in openai_data:
        f.write(json.dumps(ex) + '\\n')
\`\`\`

## Use Cases

This dataset is designed for:
- Training models to make ${config.policy} policy decisions
- Few-shot prompting with Claude
- Fine-tuning open-source models in Claude's conversation style
- Instruction following and policy optimization
- Imitation learning from expert demonstrations

## Future: Claude Fine-Tuning

When Anthropic releases fine-tuning capabilities for Claude, this dataset will be ready to use. Expected workflow:

\`\`\`bash
# Upload dataset (hypothetical)
anthropic datasets create --file train.jsonl --name "${config.policy}-policy"

# Start fine-tuning (hypothetical)
anthropic finetune create \\
  --dataset "${config.policy}-policy" \\
  --model claude-3-sonnet \\
  --suffix "${config.policy}-v1" \\
  --epochs 3 \\
  --learning-rate 0.0001
\`\`\`

## Best Practices

1. **Quality over Quantity**: Ensure examples demonstrate correct policy behavior
2. **Consistent Format**: Maintain the Human/Assistant structure consistently
3. **Context Length**: Keep prompts concise but informative
4. **Evaluation**: Always evaluate on held-out examples
5. **Few-Shot Testing**: Try few-shot prompting before full fine-tuning

## Citation

If you use this dataset, please cite:

\`\`\`bibtex
@dataset{agent_memory_${config.policy ?? 'extraction'}_anthropic,
  title={Agent Memory ${(config.policy ?? 'extraction').charAt(0).toUpperCase() + (config.policy ?? 'extraction').slice(1)} Policy Dataset (Anthropic Format)},
  year={${new Date().getFullYear()}},
  version={${datasetInfo.version}},
  format={anthropic-prompts}
}
\`\`\`

## License

See project LICENSE file.
`;
}
