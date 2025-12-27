/**
 * Guideline to LoRA Converter
 *
 * Converts guidelines from the database into LoRA training datasets.
 * Handles filtering, example generation, and format conversion.
 */

import type { DbClient } from '../../../db/connection.js';
import {
  guidelines,
  guidelineVersions,
  entryTags,
  tags,
  type Guideline,
  type GuidelineVersion,
} from '../../../db/schema.js';
import { createValidationError } from '../../../core/errors.js';
import { eq, and, gte, lte, inArray, isNull } from 'drizzle-orm';
import type {
  GuidelineData,
  GuidelineFilter,
  GuidelineExportConfig,
  TrainingExample,
  LoRAExportResult,
  LoRAFormat,
} from './types.js';
import { TrainingDataGenerator } from './training-data-generator.js';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Convert guidelines to LoRA training format
 */
export class GuidelineToLoRAConverter {
  private db: DbClient;
  private generator: TrainingDataGenerator;

  constructor(db: DbClient) {
    this.db = db;
    this.generator = new TrainingDataGenerator();
  }

  /**
   * Export guidelines to LoRA training format
   */
  async export(config: GuidelineExportConfig): Promise<LoRAExportResult> {
    try {
      // Fetch guidelines from database
      const guidelineData = await this.fetchGuidelines(config.filter);

      if (guidelineData.length === 0) {
        return {
          success: false,
          format: config.format,
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
            policyType: 'extraction', // Not applicable for guideline export
          },
          error: 'No guidelines found matching the filter criteria',
        };
      }

      // Generate training examples
      const examplesPerGuideline = config.examplesPerGuideline ?? 3;
      const includeNegative = config.includeNegative ?? false;

      const allExamples = this.generator.batchGenerate(
        guidelineData,
        examplesPerGuideline,
        includeNegative
      );

      // Shuffle if seed provided
      if (config.seed !== undefined) {
        this.shuffleWithSeed(allExamples, config.seed);
      }

      // Split into train/eval
      const splitRatio = config.splitRatio ?? 0.1; // 90/10 by default
      const evalCount = Math.floor(allExamples.length * splitRatio);
      const trainExamples = allExamples.slice(0, allExamples.length - evalCount);
      const evalExamples = allExamples.slice(allExamples.length - evalCount);

      // Ensure output directory exists
      await fs.mkdir(config.outputPath, { recursive: true });

      // Convert to format-specific structure
      const trainData = this.convertToFormat(trainExamples, config.format);
      const evalData = this.convertToFormat(evalExamples, config.format);

      // Write files
      const files = await this.writeFiles(
        config.outputPath,
        config.format,
        trainData,
        evalData,
        {
          guidelinesProcessed: guidelineData.length,
          examplesGenerated: allExamples.length,
          trainExamples: trainExamples.length,
          evalExamples: evalExamples.length,
          config,
        }
      );

      // Generate optional files
      if (config.generateScript) {
        const scriptPath = await this.generateTrainingScript(
          config.outputPath,
          config.format,
          config.targetModel
        );
        files.trainingScript = scriptPath;
      }

      // Calculate file sizes
      const fileSizes: Record<string, number> = {};
      for (const [key, path] of Object.entries(files)) {
        if (path) {
          try {
            const stats = await fs.stat(path);
            fileSizes[key] = stats.size;
          } catch {
            // Ignore if file doesn't exist
          }
        }
      }

      return {
        success: true,
        format: config.format,
        files: {
          train: files.train || '',
          eval: files.eval || '',
          metadata: files.metadata || '',
          readme: files.readme || '',
          trainingScript: files.trainingScript,
        },
        stats: {
          totalExamples: allExamples.length,
          trainExamples: trainExamples.length,
          evalExamples: evalExamples.length,
          fileSizes,
          exportedAt: new Date().toISOString(),
          policyType: 'extraction', // Not applicable for guideline export
        },
      };
    } catch (error) {
      return {
        success: false,
        format: config.format,
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
          policyType: 'extraction',
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Fetch guidelines from database with filtering
   */
  private async fetchGuidelines(filter?: GuidelineFilter): Promise<GuidelineData[]> {
    const conditions = [];

    // Active only (default: true)
    if (filter?.activeOnly !== false) {
      conditions.push(eq(guidelines.isActive, true));
    }

    // Scope filter
    if (filter?.scopeType) {
      if (filter.scopeId === null || filter.scopeId === undefined) {
        conditions.push(and(eq(guidelines.scopeType, filter.scopeType), isNull(guidelines.scopeId)));
      } else {
        conditions.push(
          and(eq(guidelines.scopeType, filter.scopeType), eq(guidelines.scopeId, filter.scopeId))
        );
      }
    }

    // Category filter
    if (filter?.category) {
      conditions.push(eq(guidelines.category, filter.category));
    }

    // Priority range filter
    if (filter?.priority?.min !== undefined) {
      conditions.push(gte(guidelines.priority, filter.priority.min));
    }
    if (filter?.priority?.max !== undefined) {
      conditions.push(lte(guidelines.priority, filter.priority.max));
    }

    // Build query
    let query = this.db.select().from(guidelines);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const guidelineList = query.all();

    // Fetch current versions
    const guidelineIds = guidelineList.map((g: Guideline) => g.id);
    const versionsList =
      guidelineIds.length > 0
        ? this.db
            .select()
            .from(guidelineVersions)
            .where(inArray(guidelineVersions.guidelineId, guidelineIds))
            .all()
        : [];

    const versionsMap = new Map<string, GuidelineVersion>();
    for (const v of versionsList) {
      versionsMap.set(v.id, v);
    }

    // Fetch tags if filter specified
    let taggedGuidelineIds: Set<string> | undefined;
    if (filter?.tags && filter.tags.length > 0) {
      const tagRecords = this.db
        .select({ tagName: tags.name })
        .from(tags)
        .where(inArray(tags.name, filter.tags))
        .all();

      const tagIds = tagRecords.map((t) => t.tagName);

      if (tagIds.length > 0) {
        const entryTagRecords = this.db
          .select({ entryId: entryTags.entryId })
          .from(entryTags)
          .innerJoin(tags, eq(entryTags.tagId, tags.id))
          .where(and(eq(entryTags.entryType, 'guideline'), inArray(tags.name, tagIds)))
          .all();

        taggedGuidelineIds = new Set(entryTagRecords.map((et) => et.entryId));
      } else {
        // No matching tags found
        return [];
      }
    }

    // Fetch all tags for guidelines
    const allTagsForGuidelines =
      guidelineIds.length > 0
        ? this.db
            .select({
              entryId: entryTags.entryId,
              tagName: tags.name,
            })
            .from(entryTags)
            .innerJoin(tags, eq(entryTags.tagId, tags.id))
            .where(and(eq(entryTags.entryType, 'guideline'), inArray(entryTags.entryId, guidelineIds)))
            .all()
        : [];

    const tagsPerGuideline = new Map<string, string[]>();
    for (const record of allTagsForGuidelines) {
      const existing = tagsPerGuideline.get(record.entryId) ?? [];
      existing.push(record.tagName);
      tagsPerGuideline.set(record.entryId, existing);
    }

    // Convert to GuidelineData
    const result: GuidelineData[] = [];
    for (const guideline of guidelineList) {
      // Apply tag filter if specified
      if (taggedGuidelineIds && !taggedGuidelineIds.has(guideline.id)) {
        continue;
      }

      const version = guideline.currentVersionId
        ? versionsMap.get(guideline.currentVersionId)
        : undefined;

      if (!version) continue; // Skip guidelines without current version

      result.push({
        id: guideline.id,
        name: guideline.name,
        category: guideline.category,
        priority: guideline.priority,
        content: version.content,
        rationale: version.rationale,
        examples: version.examples,
        tags: tagsPerGuideline.get(guideline.id) ?? [],
        scopeType: guideline.scopeType,
        scopeId: guideline.scopeId,
      });
    }

    return result;
  }

  /**
   * Convert training examples to format-specific structure
   */
  private convertToFormat(examples: TrainingExample[], format: LoRAFormat): unknown[] {
    switch (format) {
      case 'alpaca':
        return examples.map((ex) => ({
          instruction: ex.instruction,
          input: ex.input || '',
          output: ex.output,
        }));

      case 'openai-messages':
        return examples.map((ex) => ({
          messages: [
            { role: 'system', content: ex.system },
            { role: 'user', content: ex.input ? `${ex.instruction}\n\n${ex.input}` : ex.instruction },
            { role: 'assistant', content: ex.output },
          ],
        }));

      case 'sharegpt':
        return examples.map((ex) => ({
          conversations: [
            { from: 'system', value: ex.system },
            { from: 'human', value: ex.input ? `${ex.instruction}\n\n${ex.input}` : ex.instruction },
            { from: 'gpt', value: ex.output },
          ],
        }));

      case 'anthropic-prompts':
        return examples.map((ex) => ({
          prompt: `${ex.system}\n\nHuman: ${ex.input ? `${ex.instruction}\n\n${ex.input}` : ex.instruction}\n\nAssistant:`,
          completion: ex.output,
        }));

      default:
        throw createValidationError('format', `unsupported format: ${format}`, 'Use alpaca, openai-messages, sharegpt, or anthropic-prompts');
    }
  }

  /**
   * Write training data files
   */
  private async writeFiles(
    outputPath: string,
    format: LoRAFormat,
    trainData: unknown[],
    evalData: unknown[],
    metadata: {
      guidelinesProcessed: number;
      examplesGenerated: number;
      trainExamples: number;
      evalExamples: number;
      config: GuidelineExportConfig;
    }
  ): Promise<{
    train?: string;
    eval?: string;
    metadata?: string;
    readme?: string;
    trainingScript?: string;
  }> {
    const files: Record<string, string> = {};

    // Write training data
    const trainPath = join(outputPath, 'train.jsonl');
    await this.writeJsonLines(trainPath, trainData);
    files.train = trainPath;

    // Write evaluation data
    const evalPath = join(outputPath, 'eval.jsonl');
    await this.writeJsonLines(evalPath, evalData);
    files.eval = evalPath;

    // Write metadata
    const metadataPath = join(outputPath, 'metadata.json');
    await fs.writeFile(
      metadataPath,
      JSON.stringify(
        {
          format,
          exportedAt: new Date().toISOString(),
          ...metadata,
        },
        null,
        2
      )
    );
    files.metadata = metadataPath;

    // Write README
    const readmePath = join(outputPath, 'README.md');
    await fs.writeFile(readmePath, this.generateReadme(format, metadata));
    files.readme = readmePath;

    return files;
  }

  /**
   * Write data in JSONL format (one JSON object per line)
   */
  private async writeJsonLines(path: string, data: unknown[]): Promise<void> {
    const lines = data.map((item) => JSON.stringify(item)).join('\n');
    await fs.writeFile(path, lines + '\n');
  }

  /**
   * Generate README for the dataset
   */
  private generateReadme(
    format: LoRAFormat,
    metadata: {
      guidelinesProcessed: number;
      examplesGenerated: number;
      trainExamples: number;
      evalExamples: number;
    }
  ): string {
    return `# LoRA Training Dataset

Generated from Agent Memory guidelines for fine-tuning language models.

## Dataset Information

- **Format**: ${format}
- **Guidelines Processed**: ${metadata.guidelinesProcessed}
- **Total Examples**: ${metadata.examplesGenerated}
- **Training Examples**: ${metadata.trainExamples}
- **Evaluation Examples**: ${metadata.evalExamples}

## Files

- \`train.jsonl\`: Training dataset
- \`eval.jsonl\`: Evaluation dataset
- \`metadata.json\`: Export metadata and configuration

## Usage

This dataset can be used with LoRA (Low-Rank Adaptation) to fine-tune models like:
- LLaMA, Mistral, Phi (via HuggingFace PEFT)
- GPT-3.5/4 (via OpenAI fine-tuning API)
- Claude (via Anthropic fine-tuning)

### Example with PEFT

\`\`\`python
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM

model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")

lora_config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

model = get_peft_model(model, lora_config)
\`\`\`

## Format Details

${this.getFormatDescription(format)}
`;
  }

  /**
   * Get description for format
   */
  private getFormatDescription(format: LoRAFormat): string {
    switch (format) {
      case 'alpaca':
        return 'Stanford Alpaca format with instruction, input, and output fields.';
      case 'openai-messages':
        return 'OpenAI chat format with system, user, and assistant messages.';
      case 'sharegpt':
        return 'ShareGPT format with conversations array.';
      case 'anthropic-prompts':
        return 'Anthropic format with prompt and completion fields.';
      default:
        return 'Custom format.';
    }
  }

  /**
   * Generate training script stub
   */
  private async generateTrainingScript(
    outputPath: string,
    _format: LoRAFormat,
    targetModel?: string
  ): Promise<string> {
    const scriptPath = join(outputPath, 'train.py');
    const script = `#!/usr/bin/env python3
"""
LoRA Training Script
Generated by Agent Memory Export

Train a model on the exported guidelines dataset.
"""

from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from datasets import load_dataset
import torch

# Configuration
MODEL_NAME = "${targetModel || 'meta-llama/Llama-2-7b-hf'}"
DATASET_PATH = "."
OUTPUT_DIR = "./lora-output"

# Load model and tokenizer
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16,
    device_map="auto"
)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

# LoRA configuration
lora_config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

# Prepare model for training
model = prepare_model_for_kbit_training(model)
model = get_peft_model(model, lora_config)

# Load dataset
dataset = load_dataset("json", data_files={
    "train": "train.jsonl",
    "eval": "eval.jsonl"
})

# Training arguments
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=3,
    per_device_train_batch_size=4,
    per_device_eval_batch_size=4,
    gradient_accumulation_steps=4,
    evaluation_strategy="steps",
    eval_steps=100,
    save_steps=100,
    logging_steps=10,
    learning_rate=2e-4,
    warmup_steps=100,
    fp16=True,
    save_total_limit=3,
)

# TODO: Add trainer and training loop
print("Training script template generated. Complete the implementation.")
`;

    await fs.writeFile(scriptPath, script);
    await fs.chmod(scriptPath, 0o755);
    return scriptPath;
  }

  /**
   * Shuffle array with seed for reproducibility
   */
  private shuffleWithSeed<T>(array: T[], seed: number): void {
    let currentIndex = array.length;
    let temporaryValue: T;
    let randomIndex: number;

    // Seeded random number generator (simple LCG)
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    while (currentIndex !== 0) {
      randomIndex = Math.floor(random() * currentIndex);
      currentIndex -= 1;

      temporaryValue = array[currentIndex]!;
      array[currentIndex] = array[randomIndex]!;
      array[randomIndex] = temporaryValue;
    }
  }
}
