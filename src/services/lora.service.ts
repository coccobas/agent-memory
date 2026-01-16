/**
 * LoRA Service
 *
 * Business logic for exporting guidelines as LoRA training data for model fine-tuning.
 * Generates training datasets in various formats (HuggingFace, OpenAI, Anthropic, Alpaca).
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  IGuidelineRepository,
  ListGuidelinesFilter,
} from '../core/interfaces/repositories.js';
import { createValidationError, createNotFoundError } from '../core/errors.js';

// =============================================================================
// TYPES
// =============================================================================

export type ExportFormat = 'huggingface' | 'openai' | 'anthropic' | 'alpaca';

export interface GuidelineFilter {
  category?: string;
  priority?: number;
  tags?: string[];
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
}

export interface TrainingExample {
  prompt: string;
  completion: string;
  metadata?: Record<string, unknown>;
}

export interface AdapterConfig {
  name: string;
  targetModel: string;
  format: ExportFormat;
  createdAt: string;
  datasetPath?: string;
  exampleCount?: number;
}

export interface ExportOptions {
  targetModel: string;
  format: ExportFormat;
  outputPath: string;
  includeExamples: boolean;
  examplesPerGuideline: number;
  guidelineFilter: GuidelineFilter;
  trainEvalSplit: number;
}

export interface ExportResult {
  success: boolean;
  targetModel: string;
  format: ExportFormat;
  outputPath: string;
  trainFile: string;
  evalFile: string;
  configFile: string;
  stats: {
    totalExamples: number;
    trainExamples: number;
    evalExamples: number;
    trainEvalSplit: number;
  };
}

export interface ScriptResult {
  success: boolean;
  targetModel: string;
  format: ExportFormat;
  script: string;
  scriptPath?: string;
}

export interface ListAdaptersResult {
  success: boolean;
  adapters: AdapterConfig[];
  searchPath: string;
  count: number;
}

// =============================================================================
// LORA SERVICE
// =============================================================================

export class LoraService {
  /**
   * Generate training examples from guidelines
   */
  async generateTrainingExamples(
    guidelineRepo: IGuidelineRepository,
    filter: GuidelineFilter,
    includeExamples: boolean,
    examplesPerGuideline: number
  ): Promise<TrainingExample[]> {
    const examples: TrainingExample[] = [];

    // Build filter for guideline repository
    const repoFilter: ListGuidelinesFilter = {
      category: filter.category,
      scopeType: filter.scopeType,
      scopeId: filter.scopeId,
    };

    // Fetch guidelines from repository
    const guidelines = await guidelineRepo.list(repoFilter);

    for (const guideline of guidelines) {
      const content = guideline.currentVersion?.content || '';
      const name = guideline.name;
      const category = guideline.category || 'general';
      const priority = guideline.priority || 50;

      // Skip empty guidelines
      if (!content.trim()) continue;

      // Filter by priority if specified
      if (filter.priority !== undefined && guideline.priority !== filter.priority) {
        continue;
      }

      // Generate base examples from guideline
      const baseExamples = this.generateBaseExamples(name, content, category, priority);
      examples.push(...baseExamples);

      // Generate additional examples if requested
      if (includeExamples && guideline.currentVersion?.examples) {
        const additionalExamples = this.generateFromExamples(
          name,
          content,
          guideline.currentVersion.examples,
          examplesPerGuideline
        );
        examples.push(...additionalExamples);
      }
    }

    return examples;
  }

  /**
   * Generate base training examples for a guideline
   */
  generateBaseExamples(
    name: string,
    content: string,
    category: string,
    priority: number
  ): TrainingExample[] {
    const examples: TrainingExample[] = [];

    // Example 1: Direct guideline query
    examples.push({
      prompt: `What is the guideline for "${name}"?`,
      completion: content,
      metadata: { type: 'direct_query', category, priority },
    });

    // Example 2: Context-based query
    examples.push({
      prompt: `I need guidance on ${name.toLowerCase()}. What should I know?`,
      completion: `Here's the guideline: ${content}`,
      metadata: { type: 'contextual_query', category, priority },
    });

    // Example 3: Validation query
    examples.push({
      prompt: `How should I handle ${name.toLowerCase()}?`,
      completion: content,
      metadata: { type: 'validation_query', category, priority },
    });

    return examples;
  }

  /**
   * Generate examples from guideline examples field
   */
  generateFromExamples(
    name: string,
    content: string,
    examples: { good?: string[]; bad?: string[] },
    maxExamples: number
  ): TrainingExample[] {
    const trainingExamples: TrainingExample[] = [];

    // Generate from good examples
    if (examples.good) {
      for (let i = 0; i < Math.min(examples.good.length, maxExamples); i++) {
        const goodExample = examples.good[i];
        if (!goodExample) continue;

        trainingExamples.push({
          prompt: `Is this approach correct for ${name}?\n\n${goodExample}`,
          completion: `Yes, this follows the guideline. ${content}`,
          metadata: { type: 'example_validation', exampleType: 'good' },
        });
      }
    }

    // Generate from bad examples
    if (examples.bad) {
      for (let i = 0; i < Math.min(examples.bad.length, maxExamples); i++) {
        const badExample = examples.bad[i];
        if (!badExample) continue;

        trainingExamples.push({
          prompt: `Is this approach correct for ${name}?\n\n${badExample}`,
          completion: `No, this violates the guideline. The correct approach is: ${content}`,
          metadata: { type: 'example_validation', exampleType: 'bad' },
        });
      }
    }

    return trainingExamples;
  }

  /**
   * Format examples based on target format
   */
  formatExamples(examples: TrainingExample[], format: ExportFormat): string {
    switch (format) {
      case 'huggingface':
        return this.formatHuggingFace(examples);
      case 'openai':
        return this.formatOpenAI(examples);
      case 'anthropic':
        return this.formatAnthropic(examples);
      case 'alpaca':
        return this.formatAlpaca(examples);
      default:
        throw createValidationError(
          'format',
          `Unsupported format: ${String(format)}`,
          'Use one of: huggingface, openai, anthropic, alpaca'
        );
    }
  }

  /**
   * Convert examples to HuggingFace format (JSONL with prompt/completion)
   */
  private formatHuggingFace(examples: TrainingExample[]): string {
    return examples
      .map((ex) =>
        JSON.stringify({
          text: `<|user|>${ex.prompt}<|assistant|>${ex.completion}<|end|>`,
          metadata: ex.metadata,
        })
      )
      .join('\n');
  }

  /**
   * Convert examples to OpenAI fine-tuning format (JSONL with messages)
   */
  private formatOpenAI(examples: TrainingExample[]): string {
    return examples
      .map((ex) =>
        JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant that provides guidance based on established guidelines.',
            },
            { role: 'user', content: ex.prompt },
            { role: 'assistant', content: ex.completion },
          ],
        })
      )
      .join('\n');
  }

  /**
   * Convert examples to Anthropic format (JSONL with Claude-style messages)
   */
  private formatAnthropic(examples: TrainingExample[]): string {
    return examples
      .map((ex) =>
        JSON.stringify({
          system:
            'You are a helpful assistant that provides guidance based on established guidelines.',
          messages: [
            { role: 'user', content: ex.prompt },
            { role: 'assistant', content: ex.completion },
          ],
          metadata: ex.metadata,
        })
      )
      .join('\n');
  }

  /**
   * Convert examples to Alpaca format (JSONL with instruction/input/output)
   */
  private formatAlpaca(examples: TrainingExample[]): string {
    return examples
      .map((ex) =>
        JSON.stringify({
          instruction: 'Provide guidance based on established guidelines.',
          input: ex.prompt,
          output: ex.completion,
          metadata: ex.metadata,
        })
      )
      .join('\n');
  }

  /**
   * Export training data to files
   */
  async exportToFiles(
    guidelineRepo: IGuidelineRepository,
    options: ExportOptions
  ): Promise<ExportResult> {
    const {
      targetModel,
      format,
      outputPath,
      includeExamples,
      examplesPerGuideline,
      guidelineFilter,
      trainEvalSplit,
    } = options;

    // Generate training examples
    const allExamples = await this.generateTrainingExamples(
      guidelineRepo,
      guidelineFilter,
      includeExamples,
      examplesPerGuideline
    );

    if (allExamples.length === 0) {
      throw createNotFoundError('guidelines', 'matching the filter criteria');
    }

    // Shuffle examples for random distribution
    const shuffled = [...allExamples].sort(() => Math.random() - 0.5);

    // Split into train/eval sets
    const splitIdx = Math.floor(shuffled.length * trainEvalSplit);
    const trainExamples = shuffled.slice(0, splitIdx);
    const evalExamples = shuffled.slice(splitIdx);

    // Format datasets
    const trainContent = this.formatExamples(trainExamples, format);
    const evalContent = this.formatExamples(evalExamples, format);

    // Resolve and validate output path
    const resolvedPath = resolve(outputPath);

    // Ensure output directory exists
    if (!existsSync(resolvedPath)) {
      mkdirSync(resolvedPath, { recursive: true });
    }

    // Generate filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const modelSlug = targetModel.replace(/[^a-zA-Z0-9]/g, '_');
    const ext = '.jsonl';
    const trainFile = join(resolvedPath, `${modelSlug}_${format}_train_${timestamp}${ext}`);
    const evalFile = join(resolvedPath, `${modelSlug}_${format}_eval_${timestamp}${ext}`);

    // Write files
    writeFileSync(trainFile, trainContent, 'utf-8');
    writeFileSync(evalFile, evalContent, 'utf-8');

    // Save adapter configuration
    const adapterConfig: AdapterConfig = {
      name: `${modelSlug}_${format}_${timestamp}`,
      targetModel,
      format,
      createdAt: new Date().toISOString(),
      datasetPath: resolvedPath,
      exampleCount: allExamples.length,
    };

    const configFile = join(resolvedPath, `${modelSlug}_${format}_config_${timestamp}.json`);
    writeFileSync(configFile, JSON.stringify(adapterConfig, null, 2), 'utf-8');

    return {
      success: true,
      targetModel,
      format,
      outputPath: resolvedPath,
      trainFile,
      evalFile,
      configFile,
      stats: {
        totalExamples: allExamples.length,
        trainExamples: trainExamples.length,
        evalExamples: evalExamples.length,
        trainEvalSplit,
      },
    };
  }

  /**
   * List existing adapter configurations
   */
  listAdapters(searchPath: string): ListAdaptersResult {
    if (!existsSync(searchPath)) {
      return {
        success: true,
        adapters: [],
        searchPath,
        count: 0,
      };
    }

    // Find all config files
    const files = readdirSync(searchPath);
    const configFiles = files.filter((f) => f.endsWith('_config_.json') || f.includes('_config_'));

    const adapters: AdapterConfig[] = [];

    for (const file of configFiles) {
      try {
        const content = readFileSync(join(searchPath, file), 'utf-8');
        const config = JSON.parse(content) as AdapterConfig;
        adapters.push(config);
      } catch {
        // Skip invalid config files
        continue;
      }
    }

    // Sort by creation date (newest first)
    adapters.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      success: true,
      adapters,
      searchPath,
      count: adapters.length,
    };
  }

  /**
   * Generate training script for a target model
   */
  generateScript(
    targetModel: string,
    format: ExportFormat,
    datasetPath: string,
    outputPath?: string
  ): ScriptResult {
    let script = '';

    switch (format) {
      case 'huggingface':
        script = this.generateHuggingFaceScript(targetModel, datasetPath);
        break;
      case 'openai':
        script = this.generateOpenAIScript(targetModel, datasetPath);
        break;
      case 'anthropic':
        script = this.generateAnthropicScript(targetModel, datasetPath);
        break;
      case 'alpaca':
        script = this.generateAlpacaScript(targetModel, datasetPath);
        break;
    }

    // Save script if output path provided
    let scriptPath: string | undefined;
    if (outputPath) {
      const resolvedPath = resolve(outputPath);
      const scriptFile = join(resolvedPath, `train_${format}.py`);

      if (!existsSync(resolvedPath)) {
        mkdirSync(resolvedPath, { recursive: true });
      }

      writeFileSync(scriptFile, script, 'utf-8');
      scriptPath = scriptFile;
    }

    return {
      success: true,
      targetModel,
      format,
      script,
      ...(scriptPath && { scriptPath }),
    };
  }

  // =============================================================================
  // SCRIPT GENERATORS
  // =============================================================================

  private generateHuggingFaceScript(model: string, datasetPath: string): string {
    return `#!/usr/bin/env python3
"""
LoRA Fine-tuning Script for HuggingFace Transformers
Target Model: ${model}
Dataset: ${datasetPath}
"""

from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
)
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_dataset
import torch

# Configuration
MODEL_NAME = "${model}"
TRAIN_FILE = "${datasetPath}/*_train_*.jsonl"
EVAL_FILE = "${datasetPath}/*_eval_*.jsonl"
OUTPUT_DIR = "./lora_output"

# LoRA Configuration
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=8,  # Rank
    lora_alpha=32,
    lora_dropout=0.1,
    target_modules=["q_proj", "v_proj"],  # Adjust based on model architecture
)

# Load model and tokenizer
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16,
    device_map="auto",
)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

# Apply LoRA
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# Load dataset
dataset = load_dataset("json", data_files={"train": TRAIN_FILE, "validation": EVAL_FILE})

# Training arguments
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=3,
    per_device_train_batch_size=4,
    per_device_eval_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    warmup_steps=100,
    logging_steps=10,
    eval_steps=50,
    save_steps=100,
    evaluation_strategy="steps",
    save_strategy="steps",
    load_best_model_at_end=True,
    fp16=True,
)

# Create trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    eval_dataset=dataset["validation"],
)

# Train
trainer.train()

# Save LoRA adapter
model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

print(f"Training complete! LoRA adapter saved to {OUTPUT_DIR}")
`;
  }

  private generateOpenAIScript(model: string, datasetPath: string): string {
    return `#!/usr/bin/env python3
"""
OpenAI Fine-tuning Script
Target Model: ${model}
Dataset: ${datasetPath}
"""

import openai
import os
from glob import glob

# Configuration
TRAIN_FILE = glob("${datasetPath}/*_train_*.jsonl")[0]
MODEL_NAME = "${model}"

# Upload training file
with open(TRAIN_FILE, "rb") as f:
    training_file = openai.File.create(file=f, purpose="fine-tune")

print(f"Uploaded training file: {training_file.id}")

# Create fine-tuning job
job = openai.FineTuningJob.create(
    training_file=training_file.id,
    model=MODEL_NAME,
    hyperparameters={
        "n_epochs": 3,
        "batch_size": 4,
        "learning_rate_multiplier": 0.1,
    }
)

print(f"Fine-tuning job created: {job.id}")
print("Monitor progress with: openai api fine_tunes.follow -i {job.id}")
`;
  }

  private generateAnthropicScript(model: string, datasetPath: string): string {
    return `#!/usr/bin/env python3
"""
Anthropic Fine-tuning Script (Placeholder)
Target Model: ${model}
Dataset: ${datasetPath}

Note: Anthropic doesn't currently support fine-tuning via API.
This script serves as a template for future use or custom training pipelines.
"""

import anthropic
from glob import glob
import json

# Configuration
TRAIN_FILE = glob("${datasetPath}/*_train_*.jsonl")[0]
MODEL_NAME = "${model}"

# Load training data
with open(TRAIN_FILE, "r") as f:
    training_data = [json.loads(line) for line in f]

print(f"Loaded {len(training_data)} training examples")
print("Anthropic fine-tuning API not yet available.")
print("Consider using HuggingFace format with compatible base models.")
`;
  }

  private generateAlpacaScript(model: string, datasetPath: string): string {
    return `#!/usr/bin/env python3
"""
Alpaca-style LoRA Fine-tuning Script
Target Model: ${model}
Dataset: ${datasetPath}
"""

from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_dataset
from trl import SFTTrainer
import torch

# Configuration
MODEL_NAME = "${model}"
TRAIN_FILE = "${datasetPath}/*_train_*.jsonl"
EVAL_FILE = "${datasetPath}/*_eval_*.jsonl"
OUTPUT_DIR = "./alpaca_lora_output"

# LoRA Configuration
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=8,
    lora_alpha=32,
    lora_dropout=0.1,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
)

# Load model and tokenizer
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16,
    device_map="auto",
)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

# Apply LoRA
model = get_peft_model(model, lora_config)

# Load dataset
dataset = load_dataset("json", data_files={"train": TRAIN_FILE, "validation": EVAL_FILE})

# Format function for Alpaca
def format_alpaca(example):
    if example["input"]:
        return f"### Instruction:\\n{example['instruction']}\\n\\n### Input:\\n{example['input']}\\n\\n### Response:\\n{example['output']}"
    return f"### Instruction:\\n{example['instruction']}\\n\\n### Response:\\n{example['output']}"

# Training arguments
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    warmup_steps=100,
    logging_steps=10,
    save_steps=100,
    fp16=True,
)

# Create trainer
trainer = SFTTrainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    eval_dataset=dataset["validation"],
    formatting_func=format_alpaca,
    max_seq_length=2048,
)

# Train
trainer.train()

# Save
model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

print(f"Training complete! Alpaca LoRA adapter saved to {OUTPUT_DIR}")
`;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new LoRA service instance.
 * Use dependency injection via context.services.lora instead of singletons.
 */
export function createLoraService(): LoraService {
  return new LoraService();
}
