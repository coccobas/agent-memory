/**
 * LoRA Export Module
 *
 * Export guidelines as LoRA training data for fine-tuning language models.
 * Supports multiple formats (Alpaca, ShareGPT, OpenAI, Anthropic) and generates
 * adapter configurations and training scripts.
 *
 * NOTE: Handles dynamic guideline examples and properties for training data generation.
 * ESLint unsafe warnings are suppressed for guideline data access.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */

import type { DbClient } from '../../../db/connection.js';
import type {
  GuidelineExportConfig,
  LoRAExportResult,
  TrainingExample,
  GuidelineData,
} from './types.js';
import { createNotFoundError } from '../../../core/errors.js';
import { TrainingDataGenerator } from './training-data-generator.js';
import { exportToFormat } from './formats/index.js';
import {
  generateAdapterConfig,
  generateAdapterConfigJSON,
  generateTrainingScript,
  generateRequirementsTxt,
  generateDatasetInfo,
} from './adapter-config.js';
import { guidelines, guidelineVersions } from '../../../db/schema.js';
import { eq, and, gte, isNull } from 'drizzle-orm';
import { promises as fs } from 'fs';
import * as path from 'path';

// Export all types
export * from './types.js';

// Export generator
export { TrainingDataGenerator } from './training-data-generator.js';

// Export format utilities
export { exportToFormat } from './formats/index.js';

// Export adapter config utilities
export {
  generateAdapterConfig,
  generateAdapterConfigJSON,
  generateTrainingScript,
  generateRequirementsTxt,
  generateDatasetInfo,
} from './adapter-config.js';

/**
 * Main convenience function to export guidelines as LoRA training data
 */
export async function exportGuidelinesAsLoRA(
  db: DbClient,
  config: GuidelineExportConfig
): Promise<LoRAExportResult> {
  try {
    // Query guidelines based on config
    const guidelineData = await queryGuidelines(db, config);

    if (guidelineData.length === 0) {
      throw createNotFoundError('guidelines', 'matching the specified criteria');
    }

    // Generate training examples
    const generator = new TrainingDataGenerator();
    const examplesPerGuideline = config.examplesPerGuideline || 3;
    const includeNegative = config.includeNegative || false;

    const allExamples = generator.batchGenerate(
      guidelineData,
      examplesPerGuideline,
      includeNegative
    );

    // Convert to target format
    const trainingExamples = convertToTrainingFormat(allExamples);

    // Split into train/eval sets (90/10 by default)
    const splitRatio = 0.1;
    const evalCount = Math.max(1, Math.floor(trainingExamples.length * splitRatio));
    const trainExamples = trainingExamples.slice(0, -evalCount);
    const evalExamples = trainingExamples.slice(-evalCount);

    // Ensure output directory exists
    const outputDir = config.outputPath || './lora-export';
    await fs.mkdir(outputDir, { recursive: true });

    // Generate file contents
    const trainContent = exportToFormat(trainExamples, config.format);
    const evalContent = exportToFormat(evalExamples, config.format);

    // Write training data files
    const trainPath = path.join(outputDir, 'train.json');
    const evalPath = path.join(outputDir, 'eval.json');
    await fs.writeFile(trainPath, trainContent, 'utf-8');
    await fs.writeFile(evalPath, evalContent, 'utf-8');

    // Generate metadata
    const metadata = {
      exportedAt: new Date().toISOString(),
      guidelineCount: guidelineData.length,
      exampleCount: allExamples.length,
      trainExamples: trainExamples.length,
      evalExamples: evalExamples.length,
      format: config.format,
      filter: config.filter,
      config: {
        examplesPerGuideline,
        includeNegativeExamples: includeNegative,
        splitRatio,
        targetModel: config.targetModel,
      },
    };

    const metadataPath = path.join(outputDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // Generate adapter config
    const adapterConfig = generateAdapterConfig({
      modelType: config.targetModel,
    });
    const adapterConfigContent = generateAdapterConfigJSON(adapterConfig);
    const adapterConfigPath = path.join(outputDir, 'adapter_config.json');
    await fs.writeFile(adapterConfigPath, adapterConfigContent, 'utf-8');

    // Generate training script
    const trainingScriptPath = path.join(outputDir, 'train.py');
    const trainingScript = generateTrainingScript({
      datasetPath: './train.json',
      outputDir: './lora-output',
      adapterConfig,
    });
    await fs.writeFile(trainingScriptPath, trainingScript, 'utf-8');

    // Generate requirements.txt
    const requirementsPath = path.join(outputDir, 'requirements.txt');
    await fs.writeFile(requirementsPath, generateRequirementsTxt(), 'utf-8');

    // Generate dataset info
    const datasetInfoPath = path.join(outputDir, 'dataset_info.yaml');
    const datasetInfo = generateDatasetInfo({
      totalExamples: trainingExamples.length,
      trainExamples: trainExamples.length,
      evalExamples: evalExamples.length,
      format: config.format,
    });
    await fs.writeFile(datasetInfoPath, datasetInfo, 'utf-8');

    // Generate README
    const readmePath = path.join(outputDir, 'README.md');
    const readme = generateReadme(metadata);
    await fs.writeFile(readmePath, readme, 'utf-8');

    // Get file sizes
    const fileSizes: Record<string, number> = {};
    for (const [name, filePath] of Object.entries({
      train: trainPath,
      eval: evalPath,
      metadata: metadataPath,
      readme: readmePath,
      trainingScript: trainingScriptPath,
      requirements: requirementsPath,
      datasetInfo: datasetInfoPath,
    })) {
      const stats = await fs.stat(filePath);
      fileSizes[name] = stats.size;
    }

    return {
      success: true,
      format: config.format,
      files: {
        train: trainPath,
        eval: evalPath,
        metadata: metadataPath,
        readme: readmePath,
        adapterConfig: adapterConfigPath,
        trainingScript: trainingScriptPath,
        datasetInfo: datasetInfoPath,
      },
      stats: {
        totalExamples: trainingExamples.length,
        trainExamples: trainExamples.length,
        evalExamples: evalExamples.length,
        fileSizes,
        exportedAt: metadata.exportedAt,
        policyType: 'extraction', // Default, would be configurable
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
 * Query guidelines from database based on export config
 */
async function queryGuidelines(
  db: DbClient,
  config: GuidelineExportConfig
): Promise<GuidelineData[]> {
  const conditions = [];
  const filter = config.filter || {};

  // Filter by scope
  if (filter.scopeType) {
    if (filter.scopeId === null || filter.scopeId === undefined) {
      conditions.push(and(eq(guidelines.scopeType, filter.scopeType), isNull(guidelines.scopeId)));
    } else {
      conditions.push(
        and(eq(guidelines.scopeType, filter.scopeType), eq(guidelines.scopeId, filter.scopeId))
      );
    }
  }

  // Only active guidelines (default: true)
  if (filter.activeOnly !== false) {
    conditions.push(eq(guidelines.isActive, true));
  }

  // Filter by minimum priority
  if (filter.priority?.min !== undefined) {
    conditions.push(gte(guidelines.priority, filter.priority.min));
  }

  // Filter by category
  if (filter.category) {
    conditions.push(eq(guidelines.category, filter.category));
  }

  // Execute query
  let query = db.select().from(guidelines);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const guidelineList = query.all();

  // Fetch current versions for each guideline
  const result: GuidelineData[] = [];
  for (const guideline of guidelineList) {
    if (!guideline.currentVersionId) continue;

    const version = db
      .select()
      .from(guidelineVersions)
      .where(eq(guidelineVersions.id, guideline.currentVersionId))
      .get();

    if (version) {
      result.push({
        id: guideline.id,
        name: guideline.name,
        content: version.content,
        rationale: version.rationale,
        category: guideline.category,
        priority: guideline.priority,
        tags: [], // Would need to fetch tags if needed
        scopeType: guideline.scopeType,
        scopeId: guideline.scopeId,
      });
    }
  }

  return result;
}

/**
 * Convert generated examples to TrainingExample format
 */
function convertToTrainingFormat(examples: any[]): TrainingExample[] {
  // Examples already have the correct format from TrainingDataGenerator
  return examples as TrainingExample[];
}

/**
 * Generate README content
 */
function generateReadme(metadata: any): string {
  return `# LoRA Training Dataset

This dataset was automatically exported from Agent Memory on ${metadata.exportedAt}.

## Dataset Information

- **Guidelines**: ${metadata.guidelineCount}
- **Total Examples**: ${metadata.exampleCount}
- **Training Examples**: ${metadata.trainExamples}
- **Evaluation Examples**: ${metadata.evalExamples}
- **Format**: ${metadata.format}
- **Examples per Guideline**: ${metadata.config.examplesPerGuideline}
- **Negative Examples**: ${metadata.config.includeNegativeExamples ? 'Yes' : 'No'}

## Files

- \`train.json\` - Training dataset
- \`eval.json\` - Evaluation dataset
- \`adapter_config.json\` - LoRA adapter configuration
- \`train.py\` - Training script stub
- \`requirements.txt\` - Python dependencies
- \`dataset_info.yaml\` - Dataset metadata

## Quick Start

1. Install dependencies:
   \`\`\`bash
   pip install -r requirements.txt
   \`\`\`

2. Customize the training script (\`train.py\`) for your model and requirements

3. Run training:
   \`\`\`bash
   python train.py
   \`\`\`

## Using with Hugging Face

\`\`\`python
from datasets import load_dataset

dataset = load_dataset('json', data_files={
    'train': 'train.json',
    'eval': 'eval.json',
})
\`\`\`

## LoRA Configuration

The adapter configuration uses the following hyperparameters:
- Rank (r): Defined in \`adapter_config.json\`
- Alpha: Defined in \`adapter_config.json\`
- Target Modules: Defined in \`adapter_config.json\`

Adjust these values based on your model architecture and available compute resources.

## Citation

Generated by [Agent Memory](https://github.com/cyanheads/agent-memory)
`;
}
