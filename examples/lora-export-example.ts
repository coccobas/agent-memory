/**
 * Example: Export Guidelines to LoRA Training Data
 *
 * This example demonstrates how to export guidelines from Agent Memory
 * to LoRA (Low-Rank Adaptation) training formats for fine-tuning LLMs.
 */

import { getDbConnection } from '../src/db/connection.js';
import { GuidelineToLoRAConverter } from '../src/services/export/lora/guideline-to-lora.js';
import type { GuidelineExportConfig } from '../src/services/export/lora/types.js';

async function main() {
  console.log('LoRA Export Example\n');

  // Get database connection
  const db = getDbConnection();

  // Create converter
  const converter = new GuidelineToLoRAConverter(db);

  // Example 1: Export all guidelines in Alpaca format
  console.log('Example 1: Export all guidelines in Alpaca format');
  const config1: GuidelineExportConfig = {
    format: 'alpaca',
    outputPath: './lora-export-alpaca',
    examplesPerGuideline: 3,
    includeNegative: false,
    generateScript: true,
    targetModel: 'meta-llama/Llama-2-7b-hf',
  };

  const result1 = await converter.export(config1);
  if (result1.success) {
    console.log('✓ Export successful!');
    console.log(`  Training examples: ${result1.stats.trainExamples}`);
    console.log(`  Eval examples: ${result1.stats.evalExamples}`);
    console.log(`  Output: ${result1.files.train}`);
  } else {
    console.error('✗ Export failed:', result1.error);
  }

  // Example 2: Export high-priority guidelines only in OpenAI format
  console.log('\nExample 2: Export high-priority guidelines (≥70) in OpenAI format');
  const config2: GuidelineExportConfig = {
    format: 'openai-messages',
    outputPath: './lora-export-openai',
    filter: {
      priority: {
        min: 70,
      },
      activeOnly: true,
    },
    examplesPerGuideline: 5,
    includeNegative: true, // Include contrastive examples
    seed: 42, // For reproducibility
  };

  const result2 = await converter.export(config2);
  if (result2.success) {
    console.log('✓ Export successful!');
    console.log(`  Guidelines processed: ${result2.stats.totalExamples / 5}`); // 5 examples per guideline
    console.log(`  Training examples: ${result2.stats.trainExamples}`);
    console.log(`  Eval examples: ${result2.stats.evalExamples}`);
  } else {
    console.error('✗ Export failed:', result2.error);
  }

  // Example 3: Export guidelines by category in ShareGPT format
  console.log('\nExample 3: Export code_style guidelines in ShareGPT format');
  const config3: GuidelineExportConfig = {
    format: 'sharegpt',
    outputPath: './lora-export-sharegpt',
    filter: {
      category: 'code_style',
      scopeType: 'project',
    },
    examplesPerGuideline: 4,
    includeNegative: false,
    generateScript: true,
  };

  const result3 = await converter.export(config3);
  if (result3.success) {
    console.log('✓ Export successful!');
    console.log(`  Total examples: ${result3.stats.totalExamples}`);
    console.log(`  Files created:`);
    console.log(`    - ${result3.files.train}`);
    console.log(`    - ${result3.files.eval}`);
    console.log(`    - ${result3.files.metadata}`);
    console.log(`    - ${result3.files.readme}`);
    if (result3.files.trainingScript) {
      console.log(`    - ${result3.files.trainingScript}`);
    }
  } else {
    console.error('✗ Export failed:', result3.error);
  }

  console.log('\nExamples complete!');
  console.log('\nNext steps:');
  console.log('1. Review the generated datasets in the output directories');
  console.log('2. Customize the training scripts if generated');
  console.log('3. Install dependencies: pip install -r requirements.txt');
  console.log('4. Run fine-tuning with your preferred framework');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
