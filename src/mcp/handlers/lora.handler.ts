/**
 * LoRA Handler
 *
 * Handles exporting guidelines as LoRA training data for model fine-tuning.
 * Generates training datasets in various formats (HuggingFace, OpenAI, Anthropic, Alpaca).
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from '../../config/index.js';
import { createValidationError, createPermissionError } from '../../core/errors.js';
import { getRequiredParam, getOptionalParam, isString, isNumber, isBoolean, isObject } from '../../utils/type-guards.js';
import { requireAdminKey } from '../../utils/admin.js';
import type { AppContext } from '../../core/context.js';
import type { ListGuidelinesFilter } from '../../core/interfaces/repositories.js';

// =============================================================================
// TYPES
// =============================================================================

type ExportFormat = 'huggingface' | 'openai' | 'anthropic' | 'alpaca';

interface GuidelineFilter {
  category?: string;
  priority?: number;
  tags?: string[];
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
}

// ExportParams interface removed - not used, params are extracted inline

interface TrainingExample {
  prompt: string;
  completion: string;
  metadata?: Record<string, unknown>;
}

interface AdapterConfig {
  name: string;
  targetModel: string;
  format: ExportFormat;
  createdAt: string;
  datasetPath?: string;
  exampleCount?: number;
}

// =============================================================================
// TRAINING DATA GENERATION
// =============================================================================

/**
 * Generate training examples from guidelines
 */
async function generateTrainingExamples(
  context: AppContext,
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
  const guidelines = await context.repos.guidelines.list(repoFilter);

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

    // Filter by tags if specified (requires tag lookup)
    if (filter.tags && filter.tags.length > 0) {
      // TODO: Implement tag filtering once tag lookup is available
      // For now, skip tag filtering
    }

    // Generate base examples from guideline
    const baseExamples = generateBaseExamples(name, content, category, priority);
    examples.push(...baseExamples);

    // Generate additional examples if requested
    if (includeExamples && guideline.currentVersion?.examples) {
      const additionalExamples = generateFromExamples(
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
function generateBaseExamples(
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
function generateFromExamples(
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

// =============================================================================
// FORMAT CONVERTERS
// =============================================================================

/**
 * Convert examples to HuggingFace format (JSONL with prompt/completion)
 */
function formatHuggingFace(examples: TrainingExample[]): string {
  return examples
    .map((ex) => JSON.stringify({
      text: `<|user|>${ex.prompt}<|assistant|>${ex.completion}<|end|>`,
      metadata: ex.metadata,
    }))
    .join('\n');
}

/**
 * Convert examples to OpenAI fine-tuning format (JSONL with messages)
 */
function formatOpenAI(examples: TrainingExample[]): string {
  return examples
    .map((ex) => JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a helpful assistant that provides guidance based on established guidelines.' },
        { role: 'user', content: ex.prompt },
        { role: 'assistant', content: ex.completion },
      ],
    }))
    .join('\n');
}

/**
 * Convert examples to Anthropic format (JSONL with Claude-style messages)
 */
function formatAnthropic(examples: TrainingExample[]): string {
  return examples
    .map((ex) => JSON.stringify({
      system: 'You are a helpful assistant that provides guidance based on established guidelines.',
      messages: [
        { role: 'user', content: ex.prompt },
        { role: 'assistant', content: ex.completion },
      ],
      metadata: ex.metadata,
    }))
    .join('\n');
}

/**
 * Convert examples to Alpaca format (JSONL with instruction/input/output)
 */
function formatAlpaca(examples: TrainingExample[]): string {
  return examples
    .map((ex) => JSON.stringify({
      instruction: 'Provide guidance based on established guidelines.',
      input: ex.prompt,
      output: ex.completion,
      metadata: ex.metadata,
    }))
    .join('\n');
}

/**
 * Format examples based on target format
 */
function formatExamples(examples: TrainingExample[], format: ExportFormat): string {
  switch (format) {
    case 'huggingface':
      return formatHuggingFace(examples);
    case 'openai':
      return formatOpenAI(examples);
    case 'anthropic':
      return formatAnthropic(examples);
    case 'alpaca':
      return formatAlpaca(examples);
    default:
      throw createValidationError('format', 'Unsupported format');
  }
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Export guidelines as LoRA training data
 */
async function exportLoRA(
  context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  // Require admin key for export operations
  requireAdminKey(params);

  // Extract and validate parameters
  const targetModel = getRequiredParam(params, 'targetModel', isString);
  const format = (getOptionalParam(params, 'format', isString) || 'huggingface') as ExportFormat;
  const outputPath = getRequiredParam(params, 'outputPath', isString);
  const includeExamples = getOptionalParam(params, 'includeExamples', isBoolean) ?? true;
  const examplesPerGuideline = getOptionalParam(params, 'examplesPerGuideline', isNumber) ?? 3;
  const guidelineFilter = getOptionalParam(params, 'guidelineFilter', isObject) as GuidelineFilter | undefined;
  const trainEvalSplit = getOptionalParam(params, 'trainEvalSplit', isNumber) ?? 0.9;
  const agentId = getRequiredParam(params, 'agentId', isString);

  // Validate format
  if (!['huggingface', 'openai', 'anthropic', 'alpaca'].includes(format)) {
    throw createValidationError('format', 'must be huggingface, openai, anthropic, or alpaca');
  }

  // Validate split ratio
  if (trainEvalSplit < 0 || trainEvalSplit > 1) {
    throw createValidationError('trainEvalSplit', 'must be between 0 and 1');
  }

  // Check read permission for guidelines
  const scopeType = guidelineFilter?.scopeType ?? 'global';
  const scopeId = guidelineFilter?.scopeId;

  if (!context.services!.permission.check(agentId, 'read', 'guideline', null, scopeType, scopeId ?? null)) {
    throw createPermissionError('read', 'guideline', 'LoRA export');
  }

  // Generate training examples
  const allExamples = await generateTrainingExamples(
    context,
    guidelineFilter || {},
    includeExamples,
    examplesPerGuideline
  );

  if (allExamples.length === 0) {
    throw createValidationError('guidelineFilter', 'No guidelines found matching the filter criteria');
  }

  // Shuffle examples for random distribution
  const shuffled = [...allExamples].sort(() => Math.random() - 0.5);

  // Split into train/eval sets
  const splitIdx = Math.floor(shuffled.length * trainEvalSplit);
  const trainExamples = shuffled.slice(0, splitIdx);
  const evalExamples = shuffled.slice(splitIdx);

  // Format datasets
  const trainContent = formatExamples(trainExamples, format);
  const evalContent = formatExamples(evalExamples, format);

  // Determine file extension
  const ext = '.jsonl';

  // Resolve and validate output path
  const resolvedPath = resolve(outputPath);

  // Ensure output directory exists
  if (!existsSync(resolvedPath)) {
    mkdirSync(resolvedPath, { recursive: true });
  }

  // Generate filenames
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const modelSlug = targetModel.replace(/[^a-zA-Z0-9]/g, '_');
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
async function listAdapters(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const outputPath = getOptionalParam(params, 'outputPath', isString);
  const searchPath = outputPath ? resolve(outputPath) : join(config.paths.dataDir, 'lora');

  if (!existsSync(searchPath)) {
    return {
      success: true,
      adapters: [],
      searchPath,
    };
  }

  // Find all config files
  const files = readdirSync(searchPath);
  const configFiles = files.filter((f) => f.endsWith('_config_.json') || f.includes('_config_'));

  const adapters: AdapterConfig[] = [];

  for (const file of configFiles) {
    try {
      const content = require('node:fs').readFileSync(join(searchPath, file), 'utf-8');
      const config = JSON.parse(content) as AdapterConfig;
      adapters.push(config);
    } catch (error) {
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
async function generateScript(
  _context: AppContext,
  params: Record<string, unknown>
): Promise<unknown> {
  const targetModel = getRequiredParam(params, 'targetModel', isString);
  const format = (getOptionalParam(params, 'format', isString) || 'huggingface') as ExportFormat;
  const datasetPath = getRequiredParam(params, 'datasetPath', isString);
  const outputPath = getOptionalParam(params, 'outputPath', isString);

  // Validate format
  if (!['huggingface', 'openai', 'anthropic', 'alpaca'].includes(format)) {
    throw createValidationError('format', 'must be huggingface, openai, anthropic, or alpaca');
  }

  let script = '';

  switch (format) {
    case 'huggingface':
      script = generateHuggingFaceScript(targetModel, datasetPath);
      break;
    case 'openai':
      script = generateOpenAIScript(targetModel, datasetPath);
      break;
    case 'anthropic':
      script = generateAnthropicScript(targetModel, datasetPath);
      break;
    case 'alpaca':
      script = generateAlpacaScript(targetModel, datasetPath);
      break;
  }

  // Save script if output path provided
  let scriptPath: string | undefined;
  if (outputPath) {
    requireAdminKey(params);
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

function generateHuggingFaceScript(model: string, datasetPath: string): string {
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

function generateOpenAIScript(model: string, datasetPath: string): string {
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

function generateAnthropicScript(model: string, datasetPath: string): string {
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

function generateAlpacaScript(model: string, datasetPath: string): string {
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

// =============================================================================
// EXPORTS
// =============================================================================

export const loraHandlers = {
  export: (context: AppContext, params: Record<string, unknown>) => exportLoRA(context, params),
  list_adapters: (context: AppContext, params: Record<string, unknown>) => listAdapters(context, params),
  generate_script: (context: AppContext, params: Record<string, unknown>) => generateScript(context, params),
};
