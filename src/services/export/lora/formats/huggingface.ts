/**
 * HuggingFace LoRA Format Exporters
 *
 * Export training data in HuggingFace-compatible formats:
 * - Alpaca format: instruction/input/output
 * - ShareGPT format: conversation turns
 */

import type {
  TrainingExample,
  AlpacaExample,
  ShareGPTExample,
  LoRAExportConfig,
  LoRAExportResult,
} from '../types.js';

// =============================================================================
// ALPACA FORMAT EXPORT
// =============================================================================

/**
 * Export training examples in Alpaca format
 *
 * Format: {"instruction": "", "input": "", "output": ""}
 * Compatible with: alpaca-lora, Stanford Alpaca
 *
 * @param examples - Training examples to export
 * @param config - Export configuration
 * @returns Export result with file paths and stats
 */
export async function exportAlpacaFormat(
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

    // Convert to Alpaca format
    const trainData = trainExamples.map(convertToAlpaca);
    const evalData = evalExamples.map(convertToAlpaca);

    // Write train.jsonl
    const trainPath = `${config.outputPath}/train.jsonl`;
    await fs.writeFile(trainPath, trainData.map((ex) => JSON.stringify(ex)).join('\n'));

    // Write eval.jsonl
    const evalPath = `${config.outputPath}/eval.jsonl`;
    await fs.writeFile(evalPath, evalData.map((ex) => JSON.stringify(ex)).join('\n'));

    // Create dataset_info.json
    const datasetInfo = {
      dataset_name: `agent_memory_${config.policy}_alpaca`,
      format: 'alpaca',
      description: `LoRA training dataset for ${config.policy} policy in Alpaca format`,
      version: '1.0.0',
      features: {
        instruction: { dtype: 'string', _type: 'Value' },
        input: { dtype: 'string', _type: 'Value' },
        output: { dtype: 'string', _type: 'Value' },
      },
      splits: {
        train: { num_examples: trainData.length },
        eval: { num_examples: evalData.length },
      },
      ...config.metadata,
    };

    const infoPath = `${config.outputPath}/dataset_info.json`;
    await fs.writeFile(infoPath, JSON.stringify(datasetInfo, null, 2));

    // Create metadata.json
    const metadata = {
      format: 'alpaca',
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

    // Create README.md
    const readmePath = `${config.outputPath}/README.md`;
    await fs.writeFile(readmePath, generateAlpacaReadme(config, datasetInfo));

    // Get file sizes
    const files = {
      train: trainPath,
      eval: evalPath,
      metadata: metadataPath,
      readme: readmePath,
      datasetInfo: infoPath,
    };

    const fileSizes: Record<string, number> = {};
    for (const [_key, path] of Object.entries(files)) {
      const stat = await fs.stat(path);
      fileSizes[path] = stat.size;
    }

    return {
      success: true,
      format: 'alpaca',
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
      format: 'alpaca',
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
// SHAREGPT FORMAT EXPORT
// =============================================================================

/**
 * Export training examples in ShareGPT format
 *
 * Format: {"conversations": [{"from": "human", "value": ""}, {"from": "gpt", "value": ""}]}
 * Compatible with: ShareGPT, FastChat, Vicuna
 *
 * @param examples - Training examples to export
 * @param config - Export configuration
 * @returns Export result with file paths and stats
 */
export async function exportShareGPTFormat(
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

    // Convert to ShareGPT format
    const trainData = trainExamples.map((ex) => convertToShareGPT(ex, config.includeGuidelines));
    const evalData = evalExamples.map((ex) => convertToShareGPT(ex, config.includeGuidelines));

    // Write train.json
    const trainPath = `${config.outputPath}/train.json`;
    await fs.writeFile(trainPath, JSON.stringify(trainData, null, 2));

    // Write eval.json
    const evalPath = `${config.outputPath}/eval.json`;
    await fs.writeFile(evalPath, JSON.stringify(evalData, null, 2));

    // Create dataset_info.json
    const datasetInfo = {
      dataset_name: `agent_memory_${config.policy}_sharegpt`,
      format: 'sharegpt',
      description: `LoRA training dataset for ${config.policy} policy in ShareGPT format`,
      version: '1.0.0',
      features: {
        conversations: {
          _type: 'Sequence',
          feature: {
            from: { dtype: 'string', _type: 'Value' },
            value: { dtype: 'string', _type: 'Value' },
          },
        },
      },
      splits: {
        train: { num_examples: trainData.length },
        eval: { num_examples: evalData.length },
      },
      ...config.metadata,
    };

    const infoPath = `${config.outputPath}/dataset_info.json`;
    await fs.writeFile(infoPath, JSON.stringify(datasetInfo, null, 2));

    // Create metadata.json
    const metadata = {
      format: 'sharegpt',
      policy: config.policy,
      totalExamples: examples.length,
      trainExamples: trainData.length,
      evalExamples: evalData.length,
      splitRatio,
      includeGuidelines: config.includeGuidelines,
      exportedAt: new Date().toISOString(),
      ...config.metadata,
    };

    const metadataPath = `${config.outputPath}/metadata.json`;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Create README.md
    const readmePath = `${config.outputPath}/README.md`;
    await fs.writeFile(readmePath, generateShareGPTReadme(config, datasetInfo));

    // Get file sizes
    const files = {
      train: trainPath,
      eval: evalPath,
      metadata: metadataPath,
      readme: readmePath,
      datasetInfo: infoPath,
    };

    const fileSizes: Record<string, number> = {};
    for (const [_key, path] of Object.entries(files)) {
      const stat = await fs.stat(path);
      fileSizes[path] = stat.size;
    }

    return {
      success: true,
      format: 'sharegpt',
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
      format: 'sharegpt',
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
 * Convert training example to Alpaca format
 */
function convertToAlpaca(example: TrainingExample): AlpacaExample {
  return {
    instruction: example.instruction,
    input: example.input || '',
    output: example.output,
  };
}

/**
 * Convert training example to ShareGPT format
 */
function convertToShareGPT(
  example: TrainingExample,
  includeSystem = true
): ShareGPTExample {
  const conversations: ShareGPTExample['conversations'] = [];

  // Add system message if requested
  if (includeSystem && example.system) {
    conversations.push({
      from: 'system',
      value: example.system,
    });
  }

  // Add user message
  const userContent = example.input
    ? `${example.instruction}\n\n${example.input}`
    : example.instruction;

  conversations.push({
    from: 'human',
    value: userContent,
  });

  // Add assistant message
  conversations.push({
    from: 'gpt',
    value: example.output,
  });

  return { conversations };
}

// =============================================================================
// README GENERATION
// =============================================================================

/**
 * Generate README for Alpaca format
 */
function generateAlpacaReadme(config: LoRAExportConfig, datasetInfo: any): string {
  return `# ${datasetInfo.dataset_name}

${datasetInfo.description}

## Dataset Information

- **Format**: Alpaca (instruction/input/output)
- **Policy Type**: ${config.policy}
- **Total Examples**: ${datasetInfo.splits.train.num_examples + datasetInfo.splits.eval.num_examples}
- **Training Examples**: ${datasetInfo.splits.train.num_examples}
- **Evaluation Examples**: ${datasetInfo.splits.eval.num_examples}
- **Version**: ${datasetInfo.version}

## Format Structure

Each example in the JSONL file has this structure:

\`\`\`json
{
  "instruction": "Task description or question",
  "input": "Additional context (optional)",
  "output": "Expected response or completion"
}
\`\`\`

## Loading the Dataset

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

### Using Pandas

\`\`\`python
import pandas as pd

# Load training data
train_df = pd.read_json('train.jsonl', lines=True)
eval_df = pd.read_json('eval.jsonl', lines=True)

print(f"Training examples: {len(train_df)}")
print(f"Evaluation examples: {len(eval_df)}")
\`\`\`

## Training with LoRA

### Using PEFT (Parameter-Efficient Fine-Tuning)

\`\`\`python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from datasets import load_dataset

# Load model and tokenizer
model_name = "meta-llama/Llama-2-7b-hf"  # or your chosen model
model = AutoModelForCausalLM.from_pretrained(model_name, load_in_8bit=True)
tokenizer = AutoTokenizer.from_pretrained(model_name)

# Prepare model for k-bit training
model = prepare_model_for_kbit_training(model)

# Configure LoRA
lora_config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

# Apply LoRA
model = get_peft_model(model, lora_config)

# Load dataset
dataset = load_dataset('json', data_files={
    'train': 'train.jsonl',
    'validation': 'eval.jsonl'
})

# Format function
def format_instruction(example):
    instruction = example['instruction']
    input_text = example['input']
    output = example['output']

    if input_text:
        prompt = f"""Below is an instruction that describes a task, paired with input. Write a response.

### Instruction:
{instruction}

### Input:
{input_text}

### Response:
{output}"""
    else:
        prompt = f"""Below is an instruction that describes a task. Write a response.

### Instruction:
{instruction}

### Response:
{output}"""

    return {"text": prompt}

# Apply formatting
dataset = dataset.map(format_instruction)

# Continue with training...
\`\`\`

### Using Axolotl

Create \`config.yml\`:

\`\`\`yaml
base_model: meta-llama/Llama-2-7b-hf
model_type: LlamaForCausalLM
tokenizer_type: LlamaTokenizer

load_in_8bit: true
adapter: lora
lora_r: 8
lora_alpha: 16
lora_dropout: 0.05
lora_target_modules:
  - q_proj
  - v_proj

datasets:
  - path: .
    type: alpaca

dataset_prepared_path: last_run_prepared
val_set_size: 0.1
output_dir: ./lora-out

sequence_len: 2048
sample_packing: true

micro_batch_size: 4
gradient_accumulation_steps: 2
num_epochs: 3

optimizer: adamw_torch
lr_scheduler: cosine
learning_rate: 0.0002

train_on_inputs: false
group_by_length: false

warmup_steps: 10
eval_steps: 50
save_steps: 50

bf16: true
tf32: true
gradient_checkpointing: true
\`\`\`

Then run:

\`\`\`bash
accelerate launch -m axolotl.cli.train config.yml
\`\`\`

## Use Cases

This dataset is designed for:
- Fine-tuning language models to optimize ${config.policy} policy decisions
- Training LoRA adapters for lightweight model customization
- Imitation learning from expert demonstrations
- Policy evaluation and benchmarking

## Citation

If you use this dataset, please cite:

\`\`\`bibtex
@dataset{agent_memory_${config.policy ?? 'extraction'}_alpaca,
  title={Agent Memory ${(config.policy ?? 'extraction').charAt(0).toUpperCase() + (config.policy ?? 'extraction').slice(1)} Policy Dataset (Alpaca Format)},
  year={${new Date().getFullYear()}},
  version={${datasetInfo.version}},
  format={alpaca}
}
\`\`\`

## License

See project LICENSE file.
`;
}

/**
 * Generate README for ShareGPT format
 */
function generateShareGPTReadme(config: LoRAExportConfig, datasetInfo: any): string {
  return `# ${datasetInfo.dataset_name}

${datasetInfo.description}

## Dataset Information

- **Format**: ShareGPT (conversation turns)
- **Policy Type**: ${config.policy}
- **Total Examples**: ${datasetInfo.splits.train.num_examples + datasetInfo.splits.eval.num_examples}
- **Training Examples**: ${datasetInfo.splits.train.num_examples}
- **Evaluation Examples**: ${datasetInfo.splits.eval.num_examples}
- **System Prompts**: ${config.includeGuidelines ? 'Included' : 'Not included'}
- **Version**: ${datasetInfo.version}

## Format Structure

Each example in the JSON file has this structure:

\`\`\`json
{
  "conversations": [
    {"from": "system", "value": "System prompt with guidelines"},
    {"from": "human", "value": "User question or instruction"},
    {"from": "gpt", "value": "Assistant response"}
  ]
}
\`\`\`

## Loading the Dataset

### Using HuggingFace Datasets

\`\`\`python
from datasets import load_dataset

# Load from local files
dataset = load_dataset('json', data_files={
    'train': 'train.json',
    'validation': 'eval.json'
})

# Access conversations
example = dataset['train'][0]
print(example['conversations'])
\`\`\`

### Processing Conversations

\`\`\`python
import json

# Load training data
with open('train.json') as f:
    train_data = json.load(f)

# Access first conversation
conversation = train_data[0]['conversations']
for turn in conversation:
    print(f"{turn['from']}: {turn['value'][:100]}...")
\`\`\`

## Training with LoRA

### Using FastChat

\`\`\`bash
# Install FastChat
pip install fschat

# Train with FastChat
python -m fastchat.train.train_lora \\
  --model_name_or_path meta-llama/Llama-2-7b-hf \\
  --data_path . \\
  --output_dir ./lora-${config.policy} \\
  --num_train_epochs 3 \\
  --per_device_train_batch_size 4 \\
  --per_device_eval_batch_size 4 \\
  --gradient_accumulation_steps 2 \\
  --evaluation_strategy "steps" \\
  --eval_steps 50 \\
  --save_strategy "steps" \\
  --save_steps 100 \\
  --save_total_limit 3 \\
  --learning_rate 2e-5 \\
  --warmup_steps 100 \\
  --logging_steps 10 \\
  --lr_scheduler_type "cosine" \\
  --model_max_length 2048 \\
  --gradient_checkpointing True \\
  --lazy_preprocess True \\
  --lora_r 8 \\
  --lora_alpha 16 \\
  --lora_dropout 0.05
\`\`\`

### Using Custom Training Script

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
    'train': 'train.json',
    'validation': 'eval.json'
})

# Tokenization function for ShareGPT format
def tokenize_sharegpt(example):
    conversations = example['conversations']

    # Build conversation text
    text = ""
    for turn in conversations:
        role = turn['from']
        content = turn['value']

        if role == 'system':
            text += f"System: {content}\\n\\n"
        elif role == 'human':
            text += f"Human: {content}\\n\\n"
        elif role == 'gpt':
            text += f"Assistant: {content}\\n\\n"

    # Tokenize
    tokenized = tokenizer(text, truncation=True, max_length=2048)
    tokenized['labels'] = tokenized['input_ids'].copy()

    return tokenized

# Apply tokenization
tokenized_dataset = dataset.map(tokenize_sharegpt, remove_columns=['conversations'])

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
)

# Train
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset['train'],
    eval_dataset=tokenized_dataset['validation'],
)

trainer.train()
\`\`\`

## Inference with Trained LoRA

\`\`\`python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

# Load base model
base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-hf")

# Load LoRA adapter
model = PeftModel.from_pretrained(base_model, "./lora-${config.policy}")

# Generate
prompt = "Human: [Your question here]\\n\\nAssistant:"
inputs = tokenizer(prompt, return_tensors="pt")
outputs = model.generate(**inputs, max_new_tokens=256)
response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(response)
\`\`\`

## Use Cases

This dataset is designed for:
- Training conversational models with policy-aware decision making
- Fine-tuning chat models for specialized ${config.policy} tasks
- Multi-turn dialogue training
- Context-aware response generation

## Citation

If you use this dataset, please cite:

\`\`\`bibtex
@dataset{agent_memory_${config.policy ?? 'extraction'}_sharegpt,
  title={Agent Memory ${(config.policy ?? 'extraction').charAt(0).toUpperCase() + (config.policy ?? 'extraction').slice(1)} Policy Dataset (ShareGPT Format)},
  year={${new Date().getFullYear()}},
  version={${datasetInfo.version}},
  format={sharegpt}
}
\`\`\`

## License

See project LICENSE file.
`;
}
