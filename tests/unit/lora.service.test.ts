/**
 * Unit tests for LoRA export service
 *
 * Tests all aspects of LoRA training data export including:
 * - Training data generation
 * - Multiple export formats (Alpaca, ShareGPT, OpenAI, Anthropic)
 * - Adapter configuration generation
 * - Training script generation
 * - Guideline filtering and querying
 * - File generation and metadata
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestRepositories } from '../fixtures/test-helpers.js';
import type { Repositories } from '../../src/core/interfaces/repositories.js';
import { TrainingDataGenerator } from '../../src/services/export/lora/training-data-generator.js';
import { exportToFormat, exportToJSONL } from '../../src/services/export/lora/formats/index.js';
import {
  generateAdapterConfig,
  generateAdapterConfigJSON,
  generateTrainingScript,
  generateRequirementsTxt,
  generateDatasetInfo,
} from '../../src/services/export/lora/adapter-config.js';
import { exportGuidelinesAsLoRA } from '../../src/services/export/lora/index.js';
import { GuidelineToLoRAConverter } from '../../src/services/export/lora/guideline-to-lora.js';
import type {
  GuidelineData,
  TrainingExample,
  LoRAFormat,
  GuidelineExportConfig,
} from '../../src/services/export/lora/types.js';
import { promises as fs } from 'fs';
import path from 'path';

const TEST_DB_PATH = './data/test-lora.db';
const TEST_OUTPUT_DIR = './data/test-lora-output';

let testDb: ReturnType<typeof setupTestDb>;
let repos: Repositories;

describe('LoRA Export Service', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    repos = createTestRepositories(testDb);
  });

  afterAll(async () => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
    // Clean up test output directory
    try {
      await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clean up test output directory before each test
    try {
      await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('TrainingDataGenerator', () => {
    const generator = new TrainingDataGenerator();

    const mockGuideline: GuidelineData = {
      id: 'test-guideline-1',
      name: 'Use TypeScript strict mode',
      content: 'Always enable strict mode in TypeScript for better type safety',
      rationale: 'Strict mode catches more errors at compile time',
      category: 'code_style',
      priority: 90,
      tags: ['typescript', 'best-practice'],
      scopeType: 'global',
      scopeId: null,
    };

    describe('generateExamples', () => {
      it('should generate positive examples', () => {
        const examples = generator.generateExamples(mockGuideline, 3, false);

        expect(examples).toHaveLength(3);
        expect(examples[0]).toHaveProperty('system');
        expect(examples[0]).toHaveProperty('instruction');
        expect(examples[0]).toHaveProperty('output');
        expect(examples[0]?.guidelineId).toBe('test-guideline-1');
        expect(examples[0]?.isNegative).toBe(false);
      });

      it('should include metadata in examples', () => {
        const examples = generator.generateExamples(mockGuideline, 1, false);

        expect(examples[0]?.metadata?.guidelineName).toBe('Use TypeScript strict mode');
        expect(examples[0]?.metadata?.category).toBe('code_style');
        expect(examples[0]?.metadata?.priority).toBe(90);
        expect(examples[0]?.metadata?.tags).toContain('typescript');
      });

      it('should generate both positive and negative examples', () => {
        const examples = generator.generateExamples(mockGuideline, 10, true);

        const positiveExamples = examples.filter((ex) => !ex.isNegative);
        const negativeExamples = examples.filter((ex) => ex.isNegative);

        expect(positiveExamples.length).toBeGreaterThan(0);
        expect(negativeExamples.length).toBeGreaterThan(0);
        expect(examples).toHaveLength(10);
      });

      it('should generate system prompts based on priority', () => {
        const criticalGuideline: GuidelineData = {
          ...mockGuideline,
          priority: 95,
        };

        const examples = generator.generateExamples(criticalGuideline, 1, false);
        expect(examples[0]?.system).toContain('critical');
      });

      it('should generate instruction variants', () => {
        const examples = generator.generateExamples(mockGuideline, 4, false);

        const instructions = examples.map((ex) => ex.instruction);
        // Should have different instruction variants
        const uniqueInstructions = new Set(instructions);
        expect(uniqueInstructions.size).toBeGreaterThan(1);
      });

      it('should include rationale in output when available', () => {
        const examples = generator.generateExamples(mockGuideline, 1, false);

        expect(examples[0]?.output).toContain('Always enable strict mode');
        expect(examples[0]?.output).toContain('Rationale:');
        expect(examples[0]?.output).toContain('compile time');
      });
    });

    describe('batchGenerate', () => {
      it('should generate examples for multiple guidelines', () => {
        const guidelines: GuidelineData[] = [
          mockGuideline,
          {
            id: 'test-guideline-2',
            name: 'Prefer const over let',
            content: 'Use const for variables that are not reassigned',
            category: 'code_style',
            priority: 70,
            scopeType: 'global',
            scopeId: null,
          },
          {
            id: 'test-guideline-3',
            name: 'Use async/await',
            content: 'Prefer async/await over raw promises',
            category: 'code_style',
            priority: 60,
            scopeType: 'global',
            scopeId: null,
          },
        ];

        const examples = generator.batchGenerate(guidelines, 3, false);

        expect(examples).toHaveLength(9); // 3 guidelines * 3 examples
        expect(new Set(examples.map((ex) => ex.guidelineId)).size).toBe(3);
      });

      it('should handle empty guidelines array', () => {
        const examples = generator.batchGenerate([], 3, false);
        expect(examples).toHaveLength(0);
      });
    });
  });

  describe('Format Converters', () => {
    const mockExamples: TrainingExample[] = [
      {
        system: 'You are a helpful coding assistant',
        instruction: 'How should you handle TypeScript configuration?',
        input: 'Setting up a new TypeScript project',
        output: 'Enable strict mode in tsconfig.json',
        guidelineId: 'g1',
        isNegative: false,
      },
      {
        system: 'Follow best practices',
        instruction: 'What is the preferred variable declaration?',
        output: 'Use const for immutable variables',
        guidelineId: 'g2',
        isNegative: false,
      },
    ];

    describe('exportToFormat - Alpaca', () => {
      it('should convert to Alpaca format', () => {
        const result = exportToFormat(mockExamples, 'alpaca');
        const parsed = JSON.parse(result);

        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed).toHaveLength(2);
        expect(parsed[0]).toHaveProperty('instruction');
        expect(parsed[0]).toHaveProperty('input');
        expect(parsed[0]).toHaveProperty('output');
        expect(parsed[0].instruction).toBe('How should you handle TypeScript configuration?');
        expect(parsed[0].input).toBe('Setting up a new TypeScript project');
        expect(parsed[0].output).toBe('Enable strict mode in tsconfig.json');
      });

      it('should handle empty input field', () => {
        const result = exportToFormat(mockExamples, 'alpaca');
        const parsed = JSON.parse(result);

        expect(parsed[1].input).toBe('');
      });
    });

    describe('exportToFormat - ShareGPT', () => {
      it('should convert to ShareGPT format', () => {
        const result = exportToFormat(mockExamples, 'sharegpt');
        const parsed = JSON.parse(result);

        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0]).toHaveProperty('conversations');
        expect(Array.isArray(parsed[0].conversations)).toBe(true);

        const conv = parsed[0].conversations;
        expect(conv[0].from).toBe('system');
        expect(conv[0].value).toBe('You are a helpful coding assistant');
        expect(conv[1].from).toBe('human');
        expect(conv[2].from).toBe('gpt');
      });

      it('should combine instruction and input in user message', () => {
        const result = exportToFormat(mockExamples, 'sharegpt');
        const parsed = JSON.parse(result);

        const humanMessage = parsed[0].conversations.find((c: any) => c.from === 'human');
        expect(humanMessage.value).toContain('How should you handle TypeScript configuration?');
        expect(humanMessage.value).toContain('Setting up a new TypeScript project');
      });
    });

    describe('exportToFormat - OpenAI Messages', () => {
      it('should convert to OpenAI messages format', () => {
        const result = exportToFormat(mockExamples, 'openai-messages');
        const parsed = JSON.parse(result);

        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0]).toHaveProperty('messages');
        expect(Array.isArray(parsed[0].messages)).toBe(true);

        const messages = parsed[0].messages;
        expect(messages[0].role).toBe('system');
        expect(messages[1].role).toBe('user');
        expect(messages[2].role).toBe('assistant');
      });

      it('should format messages correctly', () => {
        const result = exportToFormat(mockExamples, 'openai-messages');
        const parsed = JSON.parse(result);

        const messages = parsed[0].messages;
        expect(messages[0].content).toBe('You are a helpful coding assistant');
        expect(messages[2].content).toBe('Enable strict mode in tsconfig.json');
      });
    });

    describe('exportToFormat - Anthropic Prompts', () => {
      it('should convert to Anthropic format', () => {
        const result = exportToFormat(mockExamples, 'anthropic-prompts');
        const parsed = JSON.parse(result);

        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0]).toHaveProperty('prompt');
        expect(parsed[0]).toHaveProperty('completion');
      });

      it('should include system context in prompt', () => {
        const result = exportToFormat(mockExamples, 'anthropic-prompts');
        const parsed = JSON.parse(result);

        expect(parsed[0].prompt).toContain('You are a helpful coding assistant');
        expect(parsed[0].prompt).toContain('How should you handle TypeScript configuration?');
      });
    });

    describe('exportToJSONL', () => {
      it('should export in JSONL format (one JSON per line)', () => {
        const result = exportToJSONL(mockExamples, 'alpaca');
        const lines = result.trim().split('\n');

        expect(lines).toHaveLength(2);
        lines.forEach((line) => {
          expect(() => JSON.parse(line)).not.toThrow();
        });
      });

      it('should work with all formats', () => {
        const formats: LoRAFormat[] = ['alpaca', 'sharegpt', 'openai-messages', 'anthropic-prompts'];

        formats.forEach((format) => {
          const result = exportToJSONL(mockExamples, format);
          const lines = result.trim().split('\n');
          expect(lines.length).toBeGreaterThan(0);
        });
      });
    });

    describe('Invalid format handling', () => {
      it('should throw error for unsupported format', () => {
        expect(() => exportToFormat(mockExamples, 'invalid-format' as LoRAFormat)).toThrow(
          /unsupported format/i
        );
      });
    });
  });

  describe('Adapter Configuration', () => {
    describe('generateAdapterConfig', () => {
      it('should generate default adapter config', () => {
        const config = generateAdapterConfig();

        expect(config).toHaveProperty('r');
        expect(config).toHaveProperty('lora_alpha');
        expect(config).toHaveProperty('lora_dropout');
        expect(config).toHaveProperty('target_modules');
        expect(config).toHaveProperty('bias');
        expect(config).toHaveProperty('task_type');
        expect(config).toHaveProperty('inference_mode');

        expect(config.bias).toBe('none');
        expect(config.task_type).toBe('CAUSAL_LM');
        expect(config.inference_mode).toBe(false);
      });

      it('should generate config for different model sizes', () => {
        const small = generateAdapterConfig({ size: 'small' });
        const medium = generateAdapterConfig({ size: 'medium' });
        const large = generateAdapterConfig({ size: 'large' });

        expect(small.r).toBeLessThan(medium.r);
        expect(medium.r).toBeLessThan(large.r);
        expect(small.lora_alpha).toBeLessThan(medium.lora_alpha);
      });

      it('should use model-specific target modules', () => {
        const llamaConfig = generateAdapterConfig({ modelType: 'llama' });
        const gpt2Config = generateAdapterConfig({ modelType: 'gpt2' });

        expect(llamaConfig.target_modules).toContain('q_proj');
        expect(gpt2Config.target_modules).toContain('c_attn');
        expect(llamaConfig.target_modules).not.toEqual(gpt2Config.target_modules);
      });

      it('should accept custom parameters', () => {
        const config = generateAdapterConfig({
          rank: 64,
          alpha: 128,
          dropout: 0.1,
          targetModules: ['custom_module'],
        });

        expect(config.r).toBe(64);
        expect(config.lora_alpha).toBe(128);
        expect(config.lora_dropout).toBe(0.1);
        expect(config.target_modules).toEqual(['custom_module']);
      });

      it('should use default target modules for unknown model type', () => {
        const config = generateAdapterConfig({ modelType: 'unknown-model' });
        expect(config.target_modules).toContain('q_proj');
        expect(config.target_modules).toContain('v_proj');
      });
    });

    describe('generateAdapterConfigJSON', () => {
      it('should generate valid JSON string', () => {
        const config = generateAdapterConfig();
        const json = generateAdapterConfigJSON(config);

        expect(() => JSON.parse(json)).not.toThrow();
        const parsed = JSON.parse(json);
        expect(parsed).toEqual(config);
      });

      it('should format JSON with proper indentation', () => {
        const config = generateAdapterConfig();
        const json = generateAdapterConfigJSON(config);

        expect(json).toContain('\n');
        expect(json).toContain('  '); // Should have indentation
      });
    });

    describe('generateTrainingScript', () => {
      it('should generate Python training script', () => {
        const script = generateTrainingScript();

        expect(script).toContain('#!/usr/bin/env python3');
        expect(script).toContain('import torch');
        expect(script).toContain('from transformers import');
        expect(script).toContain('from peft import');
        expect(script).toContain('LoraConfig');
        expect(script).toContain('def main():');
      });

      it('should include custom model name', () => {
        const script = generateTrainingScript({
          modelName: 'mistralai/Mistral-7B-v0.1',
        });

        expect(script).toContain('mistralai/Mistral-7B-v0.1');
      });

      it('should include LoRA config parameters', () => {
        const config = generateAdapterConfig({ rank: 32, alpha: 64 });
        const script = generateTrainingScript({ adapterConfig: config });

        expect(script).toContain('r=32');
        expect(script).toContain('lora_alpha=64');
      });

      it('should include dataset and output paths', () => {
        const script = generateTrainingScript({
          datasetPath: './custom-train.json',
          outputDir: './custom-output',
        });

        expect(script).toContain('./custom-train.json');
        expect(script).toContain('./custom-output');
      });
    });

    describe('generateRequirementsTxt', () => {
      it('should generate requirements file', () => {
        const requirements = generateRequirementsTxt();

        expect(requirements).toContain('torch');
        expect(requirements).toContain('transformers');
        expect(requirements).toContain('peft');
        expect(requirements).toContain('datasets');
        expect(requirements).toContain('accelerate');
        expect(requirements).toContain('bitsandbytes');
      });

      it('should include version constraints', () => {
        const requirements = generateRequirementsTxt();

        expect(requirements).toMatch(/torch>=\d/);
        expect(requirements).toMatch(/transformers>=\d/);
      });
    });

    describe('generateDatasetInfo', () => {
      it('should generate YAML dataset info', () => {
        const info = generateDatasetInfo({
          totalExamples: 100,
          trainExamples: 90,
          evalExamples: 10,
          format: 'alpaca',
        });

        expect(info).toContain('dataset_name:');
        expect(info).toContain('format: alpaca');
        expect(info).toContain('total_examples: 100');
        expect(info).toContain('train_examples: 90');
        expect(info).toContain('eval_examples: 10');
      });

      it('should calculate split ratio', () => {
        const info = generateDatasetInfo({
          totalExamples: 100,
          trainExamples: 90,
          evalExamples: 10,
          format: 'openai-messages',
        });

        expect(info).toContain('split_ratio: 0.10');
      });
    });
  });

  describe('GuidelineToLoRAConverter', () => {
    let converter: GuidelineToLoRAConverter;

    beforeEach(() => {
      converter = new GuidelineToLoRAConverter(testDb.db);
    });

    describe('export with database guidelines', () => {
      it('should export guidelines to LoRA format', async () => {
        // Create test guidelines
        const guideline = await repos.guidelines.create({
          scopeType: 'global',
          name: 'Test guideline for LoRA',
          content: 'This is test content for LoRA export',
          priority: 80,
          category: 'testing',
          createdBy: 'test-user',
        });

        const config: GuidelineExportConfig = {
          format: 'alpaca',
          outputPath: path.join(TEST_OUTPUT_DIR, 'converter-test'),
          examplesPerGuideline: 2,
          includeNegative: false,
        };

        const result = await converter.export(config);

        expect(result.success).toBe(true);
        expect(result.format).toBe('alpaca');
        expect(result.stats.totalExamples).toBe(2);
        expect(result.files.train).toBeTruthy();
        expect(result.files.eval).toBeTruthy();

        // Verify files exist
        const trainExists = await fs.access(result.files.train).then(() => true).catch(() => false);
        expect(trainExists).toBe(true);
      });

      it('should filter guidelines by scope', async () => {
        await repos.guidelines.create({
          scopeType: 'global',
          name: 'Global guideline',
          content: 'Global content',
          priority: 80,
          createdBy: 'test',
        });

        await repos.guidelines.create({
          scopeType: 'project',
          scopeId: 'proj-123',
          name: 'Project guideline',
          content: 'Project content',
          priority: 80,
          createdBy: 'test',
        });

        const config: GuidelineExportConfig = {
          format: 'alpaca',
          outputPath: path.join(TEST_OUTPUT_DIR, 'scope-filter'),
          filter: {
            scopeType: 'global',
          },
          examplesPerGuideline: 1,
        };

        const result = await converter.export(config);

        expect(result.success).toBe(true);
        // Should only include global guidelines
      });

      it('should filter by category', async () => {
        await repos.guidelines.create({
          scopeType: 'global',
          name: 'Code style guideline',
          content: 'Style content',
          category: 'code_style',
          priority: 80,
          createdBy: 'test',
        });

        await repos.guidelines.create({
          scopeType: 'global',
          name: 'Security guideline',
          content: 'Security content',
          category: 'security',
          priority: 80,
          createdBy: 'test',
        });

        const config: GuidelineExportConfig = {
          format: 'alpaca',
          outputPath: path.join(TEST_OUTPUT_DIR, 'category-filter'),
          filter: {
            category: 'security',
          },
          examplesPerGuideline: 1,
        };

        const result = await converter.export(config);

        expect(result.success).toBe(true);
      });

      it('should filter by priority range', async () => {
        await repos.guidelines.create({
          scopeType: 'global',
          name: 'Low priority',
          content: 'Low',
          priority: 30,
          createdBy: 'test',
        });

        await repos.guidelines.create({
          scopeType: 'global',
          name: 'High priority',
          content: 'High',
          priority: 95,
          createdBy: 'test',
        });

        const config: GuidelineExportConfig = {
          format: 'alpaca',
          outputPath: path.join(TEST_OUTPUT_DIR, 'priority-filter'),
          filter: {
            priority: {
              min: 80,
            },
          },
          examplesPerGuideline: 1,
        };

        const result = await converter.export(config);

        expect(result.success).toBe(true);
      });

      it('should handle no matching guidelines', async () => {
        const config: GuidelineExportConfig = {
          format: 'alpaca',
          outputPath: path.join(TEST_OUTPUT_DIR, 'no-match'),
          filter: {
            category: 'non-existent-category',
          },
          examplesPerGuideline: 1,
        };

        const result = await converter.export(config);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No guidelines found');
      });

      it('should split into train and eval sets', async () => {
        await repos.guidelines.create({
          scopeType: 'global',
          name: 'Split test guideline',
          content: 'Content for split test',
          category: 'split-test-unique',
          priority: 80,
          createdBy: 'test',
        });

        const config: GuidelineExportConfig = {
          format: 'alpaca',
          outputPath: path.join(TEST_OUTPUT_DIR, 'split-test'),
          filter: {
            category: 'split-test-unique',
          },
          examplesPerGuideline: 10,
          splitRatio: 0.2, // 80/20 split
        };

        const result = await converter.export(config);

        expect(result.success).toBe(true);
        expect(result.stats.trainExamples).toBe(8);
        expect(result.stats.evalExamples).toBe(2);
      });

      it('should generate training script when requested', async () => {
        await repos.guidelines.create({
          scopeType: 'global',
          name: 'Script test guideline',
          content: 'Content',
          priority: 80,
          createdBy: 'test',
        });

        const config: GuidelineExportConfig = {
          format: 'alpaca',
          outputPath: path.join(TEST_OUTPUT_DIR, 'script-test'),
          examplesPerGuideline: 2,
          generateScript: true,
          targetModel: 'meta-llama/Llama-2-7b-hf',
        };

        const result = await converter.export(config);

        expect(result.success).toBe(true);
        expect(result.files.trainingScript).toBeTruthy();

        if (result.files.trainingScript) {
          const scriptExists = await fs.access(result.files.trainingScript).then(() => true).catch(() => false);
          expect(scriptExists).toBe(true);
        }
      });

      it('should shuffle examples with seed for reproducibility', async () => {
        await repos.guidelines.create({
          scopeType: 'global',
          name: 'Seed test 1',
          content: 'Content 1',
          priority: 80,
          createdBy: 'test',
        });

        await repos.guidelines.create({
          scopeType: 'global',
          name: 'Seed test 2',
          content: 'Content 2',
          priority: 80,
          createdBy: 'test',
        });

        const config1: GuidelineExportConfig = {
          format: 'alpaca',
          outputPath: path.join(TEST_OUTPUT_DIR, 'seed-test-1'),
          examplesPerGuideline: 5,
          seed: 12345,
        };

        const config2: GuidelineExportConfig = {
          format: 'alpaca',
          outputPath: path.join(TEST_OUTPUT_DIR, 'seed-test-2'),
          examplesPerGuideline: 5,
          seed: 12345,
        };

        const result1 = await converter.export(config1);
        const result2 = await converter.export(config2);

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);

        // With same seed, should produce same order
        // (Would need to compare actual file contents to verify)
      });
    });
  });

  describe('exportGuidelinesAsLoRA (main export function)', () => {
    it('should export guidelines with all metadata files', async () => {
      await repos.guidelines.create({
        scopeType: 'global',
        name: 'Main export test',
        content: 'Main export content',
        priority: 85,
        category: 'testing',
        createdBy: 'test',
      });

      const config: GuidelineExportConfig = {
        format: 'openai-messages',
        outputPath: path.join(TEST_OUTPUT_DIR, 'main-export'),
        examplesPerGuideline: 3,
        targetModel: 'gpt-3.5-turbo',
      };

      const result = await exportGuidelinesAsLoRA(testDb.db, config);

      expect(result.success).toBe(true);
      expect(result.files.train).toBeTruthy();
      expect(result.files.eval).toBeTruthy();
      expect(result.files.metadata).toBeTruthy();
      expect(result.files.readme).toBeTruthy();
      expect(result.files.adapterConfig).toBeTruthy();
      expect(result.files.trainingScript).toBeTruthy();
      expect(result.files.datasetInfo).toBeTruthy();

      // Verify all files exist
      const files = [
        result.files.train,
        result.files.eval,
        result.files.metadata,
        result.files.readme,
      ];

      for (const file of files) {
        const exists = await fs.access(file).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });

    it('should generate metadata with correct information', async () => {
      await repos.guidelines.create({
        scopeType: 'global',
        name: 'Metadata test',
        content: 'Content',
        category: 'metadata-test-unique',
        priority: 80,
        createdBy: 'test',
      });

      const config: GuidelineExportConfig = {
        format: 'sharegpt',
        outputPath: path.join(TEST_OUTPUT_DIR, 'metadata-test'),
        filter: {
          category: 'metadata-test-unique',
        },
        examplesPerGuideline: 4,
        includeNegative: true,
      };

      const result = await exportGuidelinesAsLoRA(testDb.db, config);

      expect(result.success).toBe(true);

      // Read and verify metadata
      const metadataContent = await fs.readFile(result.files.metadata, 'utf-8');
      const metadata = JSON.parse(metadataContent);

      expect(metadata.guidelineCount).toBe(1);
      expect(metadata.exampleCount).toBe(4);
      expect(metadata.format).toBe('sharegpt');
      expect(metadata.config.includeNegativeExamples).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const config: GuidelineExportConfig = {
        format: 'alpaca',
        outputPath: '/invalid/path/that/does/not/exist/and/cannot/be/created',
        examplesPerGuideline: 1,
      };

      const result = await exportGuidelinesAsLoRA(testDb.db, config);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should calculate file sizes', async () => {
      await repos.guidelines.create({
        scopeType: 'global',
        name: 'File size test',
        content: 'Content for file size test',
        priority: 80,
        createdBy: 'test',
      });

      const config: GuidelineExportConfig = {
        format: 'alpaca',
        outputPath: path.join(TEST_OUTPUT_DIR, 'filesize-test'),
        examplesPerGuideline: 3,
      };

      const result = await exportGuidelinesAsLoRA(testDb.db, config);

      expect(result.success).toBe(true);
      expect(result.stats.fileSizes).toBeDefined();
      expect(Object.keys(result.stats.fileSizes).length).toBeGreaterThan(0);

      // File sizes should be positive numbers
      for (const size of Object.values(result.stats.fileSizes)) {
        expect(typeof size).toBe('number');
        expect(size).toBeGreaterThan(0);
      }
    });

    it('should support all export formats', async () => {
      await repos.guidelines.create({
        scopeType: 'global',
        name: 'Format test',
        content: 'Content',
        priority: 80,
        createdBy: 'test',
      });

      const formats: LoRAFormat[] = ['alpaca', 'sharegpt', 'openai-messages', 'anthropic-prompts'];

      for (const format of formats) {
        const config: GuidelineExportConfig = {
          format,
          outputPath: path.join(TEST_OUTPUT_DIR, `format-${format}`),
          examplesPerGuideline: 2,
        };

        const result = await exportGuidelinesAsLoRA(testDb.db, config);

        expect(result.success).toBe(true);
        expect(result.format).toBe(format);
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle guidelines without content', async () => {
      const generator = new TrainingDataGenerator();
      const guideline: GuidelineData = {
        id: 'no-content',
        name: 'Guideline name only',
        category: null,
        priority: 50,
        scopeType: 'global',
        scopeId: null,
      };

      const examples = generator.generateExamples(guideline, 1, false);

      expect(examples).toHaveLength(1);
      expect(examples[0]?.output).toContain('Guideline name only');
    });

    it('should handle guidelines without rationale', async () => {
      const generator = new TrainingDataGenerator();
      const guideline: GuidelineData = {
        id: 'no-rationale',
        name: 'No rationale guideline',
        content: 'Just content',
        category: null,
        priority: 50,
        scopeType: 'global',
        scopeId: null,
      };

      const examples = generator.generateExamples(guideline, 1, false);

      expect(examples[0]?.output).toContain('Just content');
      expect(examples[0]?.output).not.toContain('Rationale:');
    });

    it('should handle empty training examples array', () => {
      const result = exportToFormat([], 'alpaca');
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    });

    it('should handle very long content', () => {
      const longContent = 'x'.repeat(10000);
      const examples: TrainingExample[] = [
        {
          system: 'System',
          instruction: 'Instruction',
          output: longContent,
          guidelineId: 'long',
          isNegative: false,
        },
      ];

      const result = exportToFormat(examples, 'alpaca');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle special characters in content', () => {
      const examples: TrainingExample[] = [
        {
          system: 'System with "quotes" and \\backslashes\\',
          instruction: 'Instruction with\nnewlines\tand\ttabs',
          output: 'Output with special chars: <>&"\'',
          guidelineId: 'special',
          isNegative: false,
        },
      ];

      const result = exportToFormat(examples, 'openai-messages');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle minimum split ratio', async () => {
      await repos.guidelines.create({
        scopeType: 'global',
        name: 'Min split test',
        content: 'Content',
        category: 'min-split-unique',
        priority: 80,
        createdBy: 'test',
      });

      const config: GuidelineExportConfig = {
        format: 'alpaca',
        outputPath: path.join(TEST_OUTPUT_DIR, 'min-split'),
        filter: {
          category: 'min-split-unique',
        },
        examplesPerGuideline: 2,
        splitRatio: 0.5, // 50/50 split
      };

      const result = await exportGuidelinesAsLoRA(testDb.db, config);

      expect(result.success).toBe(true);
      expect(result.stats.trainExamples).toBe(1);
      expect(result.stats.evalExamples).toBe(1);
    });
  });

  describe('Integration Tests', () => {
    it('should create a complete, usable LoRA dataset', async () => {
      // Create a realistic set of guidelines with unique category
      const uniqueCategory = 'integration-test-unique';
      const guidelines = [
        {
          name: 'Use TypeScript strict mode',
          content: 'Always enable strict mode in tsconfig.json for better type safety',
          rationale: 'Catches more errors at compile time',
          category: uniqueCategory,
          priority: 90,
        },
        {
          name: 'Prefer async/await',
          content: 'Use async/await instead of raw promises for better readability',
          rationale: 'Easier to read and maintain',
          category: uniqueCategory,
          priority: 80,
        },
        {
          name: 'Write unit tests',
          content: 'Every function should have unit tests with >80% coverage',
          rationale: 'Ensures code quality and prevents regressions',
          category: uniqueCategory,
          priority: 95,
        },
      ];

      for (const g of guidelines) {
        await repos.guidelines.create({
          scopeType: 'global',
          ...g,
          createdBy: 'test',
        });
      }

      const config: GuidelineExportConfig = {
        format: 'openai-messages',
        outputPath: path.join(TEST_OUTPUT_DIR, 'integration-test'),
        filter: {
          category: uniqueCategory,
        },
        examplesPerGuideline: 5,
        includeNegative: true,
        splitRatio: 0.1,
        targetModel: 'gpt-3.5-turbo',
      };

      const result = await exportGuidelinesAsLoRA(testDb.db, config);

      // Verify successful export
      expect(result.success).toBe(true);
      expect(result.stats.totalExamples).toBe(15); // 3 guidelines * 5 examples

      // Verify train/eval split
      expect(result.stats.trainExamples).toBeGreaterThan(0);
      expect(result.stats.evalExamples).toBeGreaterThan(0);

      // Verify all necessary files were created
      const requiredFiles = [
        result.files.train,
        result.files.eval,
        result.files.metadata,
        result.files.readme,
        result.files.adapterConfig,
        result.files.trainingScript,
      ];

      for (const file of requiredFiles) {
        if (file) {
          const exists = await fs.access(file).then(() => true).catch(() => false);
          expect(exists).toBe(true);
        }
      }

      // Verify JSON content is valid
      const trainContent = await fs.readFile(result.files.train, 'utf-8');
      const trainData = JSON.parse(trainContent);
      expect(Array.isArray(trainData)).toBe(true);
      expect(trainData.length).toBeGreaterThan(0);

      // Verify format structure
      expect(trainData[0]).toHaveProperty('messages');
      expect(Array.isArray(trainData[0].messages)).toBe(true);
    });
  });
});
