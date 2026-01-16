/**
 * OpenAI LoRA Format Exporter
 *
 * Export training data in OpenAI fine-tuning format with messages structure.
 * Includes token validation and system prompt with guideline context.
 */

import type {
  TrainingExample,
  OpenAIMessagesExample,
  LoRAExportConfig,
  LoRAExportResult,
  OpenAIManifest,
} from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** OpenAI token limits for fine-tuning */
const TOKEN_LIMITS = {
  maxPromptTokens: 16000,
  maxCompletionTokens: 4000,
  maxTotalTokens: 20000,
};

/** Approximate tokens per character (rough estimate) */
const CHARS_PER_TOKEN = 4;

// =============================================================================
// OPENAI MESSAGES FORMAT EXPORT
// =============================================================================

/**
 * Export training examples in OpenAI messages format
 *
 * Format: {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}
 * Compatible with: OpenAI fine-tuning API (gpt-3.5-turbo, gpt-4)
 *
 * @param examples - Training examples to export
 * @param config - Export configuration
 * @returns Export result with file paths and stats
 */
export async function exportOpenAIMessagesFormat(
  examples: TrainingExample[],
  config: LoRAExportConfig
): Promise<LoRAExportResult> {
  const fs = await import('fs/promises');

  try {
    await fs.mkdir(config.outputPath, { recursive: true });

    const warnings: string[] = [];
    let totalTokens = 0;

    // Split into train/eval
    const splitRatio = config.splitRatio ?? 0.1;
    const splitIndex = Math.floor(examples.length * (1 - splitRatio));
    const trainExamples = examples.slice(0, splitIndex);
    const evalExamples = examples.slice(splitIndex);

    // Convert to OpenAI format with validation
    const {
      data: trainData,
      warnings: trainWarnings,
      tokens: trainTokens,
    } = convertToOpenAIMessages(trainExamples, config.includeGuidelines);
    const {
      data: evalData,
      warnings: evalWarnings,
      tokens: evalTokens,
    } = convertToOpenAIMessages(evalExamples, config.includeGuidelines);

    warnings.push(...trainWarnings, ...evalWarnings);
    totalTokens = trainTokens + evalTokens;

    // Write train.jsonl
    const trainPath = `${config.outputPath}/train.jsonl`;
    await fs.writeFile(trainPath, trainData.map((ex) => JSON.stringify(ex)).join('\n'));

    // Write eval.jsonl
    const evalPath = `${config.outputPath}/eval.jsonl`;
    await fs.writeFile(evalPath, evalData.map((ex) => JSON.stringify(ex)).join('\n'));

    // Create manifest file
    const manifest: OpenAIManifest = {
      version: '1.0.0',
      splits: {
        train: { num_examples: trainData.length },
        eval: { num_examples: evalData.length },
      },
      purpose: 'fine-tune',
      format: 'openai-messages',
      policy: config.policy,
      totalExamples: trainData.length + evalData.length,
      trainExamples: trainData.length,
      evalExamples: evalData.length,
      estimatedTokens: totalTokens,
      includeGuidelines: config.includeGuidelines,
      tokenLimits: TOKEN_LIMITS,
      createdAt: new Date().toISOString(),
      ...config.metadata,
    };

    const manifestPath = `${config.outputPath}/manifest.json`;
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // Create metadata.json
    const metadata = {
      format: 'openai-messages',
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

    // Create USAGE.md
    const usagePath = `${config.outputPath}/USAGE.md`;
    await fs.writeFile(usagePath, generateOpenAIUsageGuide(config, manifest));

    // Get file sizes
    const files = {
      train: trainPath,
      eval: evalPath,
      metadata: metadataPath,
      readme: usagePath,
    };

    const fileSizes: Record<string, number> = {};
    for (const [_key, path] of Object.entries(files)) {
      const stat = await fs.stat(path);
      fileSizes[path] = stat.size;
    }

    return {
      success: true,
      format: 'openai-messages',
      files: {
        ...files,
      },
      stats: {
        totalExamples: examples.length,
        trainExamples: trainData.length,
        evalExamples: evalData.length,
        fileSizes,
        exportedAt: new Date().toISOString(),
        policyType: config.policy ?? 'extraction',
        estimatedTokens: totalTokens,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      success: false,
      format: 'openai-messages',
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
 * Convert training examples to OpenAI messages format with validation
 */
function convertToOpenAIMessages(
  examples: TrainingExample[],
  includeSystem = true
): { data: OpenAIMessagesExample[]; warnings: string[]; tokens: number } {
  const converted: OpenAIMessagesExample[] = [];
  const warnings: string[] = [];
  let totalTokens = 0;

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    if (!example) continue;

    const messages = createOpenAIMessages(example, includeSystem);

    // Validate token limits
    const validation = validateTokenLimits(messages);
    if (!validation.valid) {
      warnings.push(`Example ${i}: ${validation.reason}`);
      continue;
    }

    converted.push({ messages });
    totalTokens += validation.estimatedTokens || 0;
  }

  return { data: converted, warnings, tokens: totalTokens };
}

/**
 * Create messages array for OpenAI format
 */
function createOpenAIMessages(
  example: TrainingExample,
  includeSystem: boolean
): OpenAIMessagesExample['messages'] {
  const messages: OpenAIMessagesExample['messages'] = [];

  // Add system message if requested
  if (includeSystem && example.system) {
    messages.push({
      role: 'system',
      content: example.system,
    });
  }

  // Add user message
  const userContent = example.input
    ? `${example.instruction}\n\n${example.input}`
    : example.instruction;

  messages.push({
    role: 'user',
    content: userContent,
  });

  // Add assistant message
  messages.push({
    role: 'assistant',
    content: example.output,
  });

  return messages;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate messages against OpenAI token limits
 */
function validateTokenLimits(messages: OpenAIMessagesExample['messages']): {
  valid: boolean;
  reason?: string;
  estimatedTokens?: number;
} {
  // Estimate token counts
  let totalChars = 0;
  let promptChars = 0;
  let completionChars = 0;

  for (const msg of messages) {
    const chars = msg.content.length;
    totalChars += chars;

    if (msg.role === 'assistant') {
      completionChars += chars;
    } else {
      promptChars += chars;
    }
  }

  const estimatedPromptTokens = Math.ceil(promptChars / CHARS_PER_TOKEN);
  const estimatedCompletionTokens = Math.ceil(completionChars / CHARS_PER_TOKEN);
  const estimatedTotalTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);

  // Check limits
  if (estimatedPromptTokens > TOKEN_LIMITS.maxPromptTokens) {
    return {
      valid: false,
      reason: `Prompt exceeds token limit (${estimatedPromptTokens} > ${TOKEN_LIMITS.maxPromptTokens})`,
      estimatedTokens: estimatedTotalTokens,
    };
  }

  if (estimatedCompletionTokens > TOKEN_LIMITS.maxCompletionTokens) {
    return {
      valid: false,
      reason: `Completion exceeds token limit (${estimatedCompletionTokens} > ${TOKEN_LIMITS.maxCompletionTokens})`,
      estimatedTokens: estimatedTotalTokens,
    };
  }

  if (estimatedTotalTokens > TOKEN_LIMITS.maxTotalTokens) {
    return {
      valid: false,
      reason: `Total tokens exceed limit (${estimatedTotalTokens} > ${TOKEN_LIMITS.maxTotalTokens})`,
      estimatedTokens: estimatedTotalTokens,
    };
  }

  return {
    valid: true,
    estimatedTokens: estimatedTotalTokens,
  };
}

// =============================================================================
// DOCUMENTATION
// =============================================================================

/**
 * Generate OpenAI usage guide
 */
function generateOpenAIUsageGuide(config: LoRAExportConfig, manifest: OpenAIManifest): string {
  return `# OpenAI Fine-Tuning Dataset

Dataset for fine-tuning OpenAI models on ${config.policy} policy decisions.

## Dataset Information

- **Format**: OpenAI Messages (JSONL)
- **Policy Type**: ${config.policy}
- **Total Examples**: ${manifest.totalExamples}
- **Training Examples**: ${manifest.trainExamples}
- **Evaluation Examples**: ${manifest.evalExamples}
- **Estimated Tokens**: ${manifest.estimatedTokens?.toLocaleString() ?? 'Unknown'}
- **System Prompts**: ${manifest.includeGuidelines ? 'Included' : 'Not included'}
- **Created**: ${manifest.createdAt}

## File Format

Each line in the JSONL file contains a training example:

\`\`\`json
{
  "messages": [
    {"role": "system", "content": "System prompt with guidelines..."},
    {"role": "user", "content": "User question or instruction..."},
    {"role": "assistant", "content": "Expected response..."}
  ]
}
\`\`\`

## Token Limits

- **Max Prompt Tokens**: ${TOKEN_LIMITS.maxPromptTokens.toLocaleString()}
- **Max Completion Tokens**: ${TOKEN_LIMITS.maxCompletionTokens.toLocaleString()}
- **Max Total Tokens**: ${TOKEN_LIMITS.maxTotalTokens.toLocaleString()}

Examples exceeding these limits are automatically filtered during export.

## Using with OpenAI API

### 1. Upload Training File

\`\`\`bash
# Using OpenAI CLI
openai api files.create -f train.jsonl -p fine-tune

# Or using Python
import openai

with open('train.jsonl', 'rb') as f:
    response = openai.File.create(file=f, purpose='fine-tune')
    training_file_id = response['id']
    print(f"Training file uploaded: {training_file_id}")
\`\`\`

### 2. Upload Validation File (Optional)

\`\`\`bash
openai api files.create -f eval.jsonl -p fine-tune
\`\`\`

### 3. Create Fine-Tuning Job

\`\`\`bash
# Using CLI
openai api fine_tuning.jobs.create \\
  -t file-abc123 \\
  -m gpt-3.5-turbo \\
  --suffix "${config.policy}-policy"

# Using Python
import openai

job = openai.FineTuningJob.create(
    training_file=training_file_id,
    validation_file=validation_file_id,  # optional
    model="gpt-3.5-turbo",
    suffix="${config.policy}-policy",
    hyperparameters={
        "n_epochs": 3,
        "batch_size": "auto",
        "learning_rate_multiplier": "auto"
    }
)

print(f"Fine-tuning job created: {job['id']}")
\`\`\`

### 4. Monitor Training Progress

\`\`\`bash
# Check job status
openai api fine_tuning.jobs.get -i ftjob-abc123

# List all jobs
openai api fine_tuning.jobs.list

# Stream events
openai api fine_tuning.jobs.follow -i ftjob-abc123
\`\`\`

### 5. Use Fine-Tuned Model

\`\`\`python
import openai

response = openai.ChatCompletion.create(
    model="ft:gpt-3.5-turbo:org:${config.policy}-policy:abc123",
    messages=[
        {"role": "system", "content": "Your system prompt..."},
        {"role": "user", "content": "Your question..."}
    ],
    temperature=0.7,
    max_tokens=256
)

print(response.choices[0].message.content)
\`\`\`

## Advanced Training Options

### Hyperparameter Tuning

\`\`\`python
job = openai.FineTuningJob.create(
    training_file=training_file_id,
    model="gpt-3.5-turbo",
    hyperparameters={
        "n_epochs": 3,              # Number of training epochs
        "batch_size": 4,            # Training batch size
        "learning_rate_multiplier": 0.1  # Learning rate multiplier
    }
)
\`\`\`

### Using with LoRA via Local PEFT

If you want to use LoRA locally instead of OpenAI's fine-tuning:

\`\`\`python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model
from datasets import load_dataset

# Load a compatible model (e.g., GPT-2, GPT-J, LLaMA)
model_name = "gpt2-medium"
model = AutoModelForCausalLM.from_pretrained(model_name)
tokenizer = AutoTokenizer.from_pretrained(model_name)

# Configure LoRA
lora_config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["c_attn"],  # GPT-2 attention modules
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

# Continue with training...
\`\`\`

## Cost Estimation

### OpenAI Fine-Tuning Pricing (as of 2024)

For **gpt-3.5-turbo**:
- Training: ~$0.008 per 1K tokens
- Usage: ~$0.012 per 1K tokens (input) + $0.016 per 1K tokens (output)

**Estimated cost for this dataset**:
- Training cost: ~$${(((manifest.estimatedTokens ?? 0) / 1000) * 0.008).toFixed(2)}
- Per-inference cost: Same as base model fine-tuning rates

Check current pricing at: https://openai.com/pricing

## Best Practices

1. **Start Small**: Begin with a subset of your data to test the pipeline
2. **Monitor Validation Loss**: Watch for overfitting if validation loss increases
3. **Adjust Epochs**: Typically 3-5 epochs work well; more may cause overfitting
4. **Use Validation Set**: Always provide a validation file to monitor performance
5. **Test Thoroughly**: Evaluate the fine-tuned model on held-out test examples

## Troubleshooting

### Common Issues

**File upload fails**:
- Ensure JSONL format is correct (one JSON object per line)
- Check file size limits (currently 512 MB for fine-tuning)
- Verify your API key has fine-tuning permissions

**Training fails**:
- Check that all examples have the required message structure
- Ensure token limits are not exceeded
- Verify sufficient training examples (minimum ~10 recommended)

**Poor performance**:
- Increase training examples if possible
- Adjust learning rate multiplier (try 0.1 or 0.05)
- Increase number of epochs (but watch for overfitting)
- Ensure training data quality and diversity

## Documentation

- Fine-tuning guide: https://platform.openai.com/docs/guides/fine-tuning
- API reference: https://platform.openai.com/docs/api-reference/fine-tuning
- Best practices: https://platform.openai.com/docs/guides/fine-tuning/best-practices

## Support

For issues with this dataset format, refer to the project documentation.
For OpenAI API issues, see: https://help.openai.com/
`;
}
