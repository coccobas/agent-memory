import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrainingExample, LoRAExportConfig } from '../../src/services/export/lora/types.js';
import {
  exportAlpacaFormat,
  exportShareGPTFormat,
} from '../../src/services/export/lora/formats/huggingface.js';
import { exportOpenAIMessagesFormat } from '../../src/services/export/lora/formats/openai.js';
import { exportAnthropicPromptsFormat } from '../../src/services/export/lora/formats/anthropic.js';

const TEST_OUTPUT_PATH = resolve(process.cwd(), 'data/test-lora-export');

// Sample training examples for testing
function createTestExamples(count: number): TrainingExample[] {
  const examples: TrainingExample[] = [];
  for (let i = 0; i < count; i++) {
    examples.push({
      system: `System context for example ${i}`,
      instruction: `Instruction for task ${i}`,
      input: i % 2 === 0 ? `Additional input ${i}` : undefined,
      output: `Expected output ${i}`,
      guidelineId: `guideline-${i}`,
      metadata: {
        policy: 'extraction',
        reward: 0.8 + i * 0.01,
      },
    });
  }
  return examples;
}

describe('LoRA Format Exporters', () => {
  beforeEach(() => {
    // Clean up test output directory
    if (existsSync(TEST_OUTPUT_PATH)) {
      rmSync(TEST_OUTPUT_PATH, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test output directory
    if (existsSync(TEST_OUTPUT_PATH)) {
      rmSync(TEST_OUTPUT_PATH, { recursive: true, force: true });
    }
  });

  describe('exportAlpacaFormat', () => {
    it('should export examples in Alpaca format', async () => {
      const examples = createTestExamples(10);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'extraction',
        splitRatio: 0.2,
      };

      const result = await exportAlpacaFormat(examples, config);

      expect(result.success).toBe(true);
      expect(result.format).toBe('alpaca');
      expect(result.stats.totalExamples).toBe(10);
      expect(result.stats.trainExamples).toBe(8);
      expect(result.stats.evalExamples).toBe(2);
      expect(existsSync(result.files.train)).toBe(true);
      expect(existsSync(result.files.eval)).toBe(true);
      expect(existsSync(result.files.metadata)).toBe(true);
    });

    it('should create valid JSONL files', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'extraction',
      };

      const result = await exportAlpacaFormat(examples, config);
      expect(result.success).toBe(true);

      // Read and parse train.jsonl
      const trainContent = readFileSync(result.files.train, 'utf-8');
      const trainLines = trainContent.trim().split('\n');

      for (const line of trainLines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('instruction');
        expect(parsed).toHaveProperty('input');
        expect(parsed).toHaveProperty('output');
      }
    });

    it('should use default split ratio of 0.1', async () => {
      const examples = createTestExamples(20);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportAlpacaFormat(examples, config);

      expect(result.stats.trainExamples).toBe(18);
      expect(result.stats.evalExamples).toBe(2);
    });

    it('should create dataset_info.json', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'extraction',
      };

      const result = await exportAlpacaFormat(examples, config);
      expect(result.files.datasetInfo).toBeDefined();
      expect(existsSync(result.files.datasetInfo!)).toBe(true);

      const datasetInfo = JSON.parse(readFileSync(result.files.datasetInfo!, 'utf-8'));
      expect(datasetInfo.format).toBe('alpaca');
      expect(datasetInfo.dataset_name).toContain('extraction');
    });

    it('should create README.md', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'retrieval',
      };

      const result = await exportAlpacaFormat(examples, config);
      expect(existsSync(result.files.readme)).toBe(true);

      const readme = readFileSync(result.files.readme, 'utf-8');
      expect(readme).toContain('Alpaca');
      expect(readme).toContain('retrieval');
    });

    it('should handle empty input field in examples', async () => {
      // Need multiple examples so train file has content (split puts first 90% in train)
      const examples: TrainingExample[] = [];
      for (let i = 0; i < 10; i++) {
        examples.push({
          system: 'System',
          instruction: `Do something ${i}`,
          output: `Done ${i}`,
        });
      }
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportAlpacaFormat(examples, config);
      expect(result.success).toBe(true);

      const trainContent = readFileSync(result.files.train, 'utf-8');
      const lines = trainContent.trim().split('\n');
      const parsed = JSON.parse(lines[0]);
      expect(parsed.input).toBe('');
    });

    it('should include metadata in export', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'extraction',
        metadata: { customField: 'customValue' },
      };

      const result = await exportAlpacaFormat(examples, config);

      const metadataContent = readFileSync(result.files.metadata, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      expect(metadata.customField).toBe('customValue');
    });

    it('should handle error gracefully', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: '/nonexistent/invalid/path/that/should/fail',
      };

      const result = await exportAlpacaFormat(examples, config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.files.train).toBe('');
    });
  });

  describe('exportShareGPTFormat', () => {
    it('should export examples in ShareGPT format', async () => {
      const examples = createTestExamples(10);
      const config: LoRAExportConfig = {
        format: 'sharegpt',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'consolidation',
        includeGuidelines: true,
      };

      const result = await exportShareGPTFormat(examples, config);

      expect(result.success).toBe(true);
      expect(result.format).toBe('sharegpt');
      expect(result.stats.totalExamples).toBe(10);
      expect(existsSync(result.files.train)).toBe(true);
    });

    it('should create conversation format with system message', async () => {
      // Use 10 examples so train has content
      const examples: TrainingExample[] = [];
      for (let i = 0; i < 10; i++) {
        examples.push({
          system: 'You are a helpful assistant',
          instruction: `What is ${i}+${i}?`,
          output: `${i * 2}`,
        });
      }
      const config: LoRAExportConfig = {
        format: 'sharegpt',
        outputPath: TEST_OUTPUT_PATH,
        includeGuidelines: true,
      };

      const result = await exportShareGPTFormat(examples, config);
      expect(result.success).toBe(true);

      const trainContent = readFileSync(result.files.train, 'utf-8');
      const parsed = JSON.parse(trainContent);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].conversations).toBeDefined();
      expect(parsed[0].conversations.length).toBe(3); // system, human, gpt

      const systemMsg = parsed[0].conversations.find((c: any) => c.from === 'system');
      expect(systemMsg?.value).toBe('You are a helpful assistant');
    });

    it('should exclude system message when includeGuidelines is false', async () => {
      // Use 10 examples so train has content
      const examples: TrainingExample[] = [];
      for (let i = 0; i < 10; i++) {
        examples.push({
          system: 'You are a helpful assistant',
          instruction: `What is ${i}+${i}?`,
          output: `${i * 2}`,
        });
      }
      const config: LoRAExportConfig = {
        format: 'sharegpt',
        outputPath: TEST_OUTPUT_PATH,
        includeGuidelines: false,
      };

      const result = await exportShareGPTFormat(examples, config);
      expect(result.success).toBe(true);

      const trainContent = readFileSync(result.files.train, 'utf-8');
      const parsed = JSON.parse(trainContent);

      // Should only have human and gpt
      expect(parsed[0].conversations.length).toBe(2);
      expect(parsed[0].conversations[0].from).toBe('human');
      expect(parsed[0].conversations[1].from).toBe('gpt');
    });

    it('should combine instruction and input for human message', async () => {
      // Use 10 examples with specific content
      const examples: TrainingExample[] = [];
      for (let i = 0; i < 10; i++) {
        examples.push({
          system: 'System',
          instruction: 'Summarize this text',
          input: 'The quick brown fox jumps over the lazy dog',
          output: 'Fox jumps over dog',
        });
      }
      const config: LoRAExportConfig = {
        format: 'sharegpt',
        outputPath: TEST_OUTPUT_PATH,
        includeGuidelines: false,
      };

      const result = await exportShareGPTFormat(examples, config);

      const trainContent = readFileSync(result.files.train, 'utf-8');
      const parsed = JSON.parse(trainContent);

      const humanMsg = parsed[0].conversations.find((c: any) => c.from === 'human');
      expect(humanMsg?.value).toContain('Summarize this text');
      expect(humanMsg?.value).toContain('The quick brown fox');
    });

    it('should handle error gracefully', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'sharegpt',
        outputPath: '/nonexistent/invalid/path',
      };

      const result = await exportShareGPTFormat(examples, config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('exportOpenAIMessagesFormat', () => {
    it('should export examples in OpenAI messages format', async () => {
      const examples = createTestExamples(10);
      const config: LoRAExportConfig = {
        format: 'openai-messages',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'extraction',
      };

      const result = await exportOpenAIMessagesFormat(examples, config);

      expect(result.success).toBe(true);
      expect(result.format).toBe('openai-messages');
      expect(result.stats.totalExamples).toBe(10);
      expect(existsSync(result.files.train)).toBe(true);
    });

    it('should create valid JSONL with messages array', async () => {
      // Use 10 examples so train has content
      const examples: TrainingExample[] = [];
      for (let i = 0; i < 10; i++) {
        examples.push({
          system: 'You are helpful',
          instruction: 'Hello',
          output: 'Hi there!',
        });
      }
      const config: LoRAExportConfig = {
        format: 'openai-messages',
        outputPath: TEST_OUTPUT_PATH,
        includeGuidelines: true,
      };

      const result = await exportOpenAIMessagesFormat(examples, config);
      expect(result.success).toBe(true);

      const trainContent = readFileSync(result.files.train, 'utf-8');
      const lines = trainContent.trim().split('\n');
      const parsed = JSON.parse(lines[0]);

      expect(parsed.messages).toBeDefined();
      expect(Array.isArray(parsed.messages)).toBe(true);

      const systemMsg = parsed.messages.find((m: any) => m.role === 'system');
      const userMsg = parsed.messages.find((m: any) => m.role === 'user');
      const assistantMsg = parsed.messages.find((m: any) => m.role === 'assistant');

      expect(systemMsg?.content).toBe('You are helpful');
      expect(userMsg?.content).toBe('Hello');
      expect(assistantMsg?.content).toBe('Hi there!');
    });

    it('should estimate token counts', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'openai-messages',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportOpenAIMessagesFormat(examples, config);

      expect(result.stats.estimatedTokens).toBeDefined();
      expect(result.stats.estimatedTokens!).toBeGreaterThan(0);
    });

    it('should filter examples exceeding token limits', async () => {
      // Create example with very long content
      const examples: TrainingExample[] = [
        {
          system: 'Short system',
          instruction: 'Short instruction',
          output: 'Short output',
        },
        {
          system: 'A'.repeat(100000), // Very long system prompt
          instruction: 'Instruction',
          output: 'Output',
        },
      ];
      const config: LoRAExportConfig = {
        format: 'openai-messages',
        outputPath: TEST_OUTPUT_PATH,
        includeGuidelines: true,
      };

      const result = await exportOpenAIMessagesFormat(examples, config);

      // The long example should be filtered out with a warning
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });

    it('should create manifest.json', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'openai-messages',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'retrieval',
      };

      const result = await exportOpenAIMessagesFormat(examples, config);

      // Check manifest exists (stored in config output path)
      const manifestPath = `${TEST_OUTPUT_PATH}/manifest.json`;
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      expect(manifest.purpose).toBe('fine-tune');
      expect(manifest.policy).toBe('retrieval');
    });

    it('should create USAGE.md guide', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'openai-messages',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportOpenAIMessagesFormat(examples, config);

      expect(existsSync(result.files.readme)).toBe(true);
      const usage = readFileSync(result.files.readme, 'utf-8');
      expect(usage).toContain('OpenAI');
      expect(usage).toContain('Fine-Tuning');
    });

    it('should handle error gracefully', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'openai-messages',
        outputPath: '/nonexistent/path',
      };

      const result = await exportOpenAIMessagesFormat(examples, config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('exportAnthropicPromptsFormat', () => {
    it('should export examples in Anthropic prompts format', async () => {
      const examples = createTestExamples(10);
      const config: LoRAExportConfig = {
        format: 'anthropic-prompts',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'extraction',
      };

      const result = await exportAnthropicPromptsFormat(examples, config);

      expect(result.success).toBe(true);
      expect(result.format).toBe('anthropic-prompts');
      expect(result.stats.totalExamples).toBe(10);
      expect(existsSync(result.files.train)).toBe(true);
    });

    it('should create Human/Assistant format', async () => {
      // Use 10 examples so train has content
      const examples: TrainingExample[] = [];
      for (let i = 0; i < 10; i++) {
        examples.push({
          system: '',
          instruction: 'What is the capital of France?',
          output: 'Paris',
        });
      }
      const config: LoRAExportConfig = {
        format: 'anthropic-prompts',
        outputPath: TEST_OUTPUT_PATH,
        includeGuidelines: false,
      };

      const result = await exportAnthropicPromptsFormat(examples, config);
      expect(result.success).toBe(true);

      const trainContent = readFileSync(result.files.train, 'utf-8');
      const lines = trainContent.trim().split('\n');
      const parsed = JSON.parse(lines[0]);

      expect(parsed.prompt).toContain('Human:');
      expect(parsed.prompt).toContain('What is the capital of France?');
      expect(parsed.prompt).toContain('Assistant:');
      expect(parsed.completion).toContain('Paris');
    });

    it('should include system context when includeGuidelines is true', async () => {
      // Use 10 examples so train has content
      const examples: TrainingExample[] = [];
      for (let i = 0; i < 10; i++) {
        examples.push({
          system: 'You are a geography expert',
          instruction: 'Name a European country',
          output: 'France',
        });
      }
      const config: LoRAExportConfig = {
        format: 'anthropic-prompts',
        outputPath: TEST_OUTPUT_PATH,
        includeGuidelines: true,
      };

      const result = await exportAnthropicPromptsFormat(examples, config);

      const trainContent = readFileSync(result.files.train, 'utf-8');
      const lines = trainContent.trim().split('\n');
      const parsed = JSON.parse(lines[0]);

      expect(parsed.prompt).toContain('You are a geography expert');
    });

    it('should have completion starting with space', async () => {
      // Use 10 examples so train has content
      const examples: TrainingExample[] = [];
      for (let i = 0; i < 10; i++) {
        examples.push({
          system: '',
          instruction: 'Say hello',
          output: 'Hello!',
        });
      }
      const config: LoRAExportConfig = {
        format: 'anthropic-prompts',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportAnthropicPromptsFormat(examples, config);

      const trainContent = readFileSync(result.files.train, 'utf-8');
      const lines = trainContent.trim().split('\n');
      const parsed = JSON.parse(lines[0]);

      expect(parsed.completion.startsWith(' ')).toBe(true);
    });

    it('should combine instruction and input', async () => {
      // Use 10 examples so train has content
      const examples: TrainingExample[] = [];
      for (let i = 0; i < 10; i++) {
        examples.push({
          system: '',
          instruction: 'Translate to French',
          input: 'Hello world',
          output: 'Bonjour le monde',
        });
      }
      const config: LoRAExportConfig = {
        format: 'anthropic-prompts',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportAnthropicPromptsFormat(examples, config);

      const trainContent = readFileSync(result.files.train, 'utf-8');
      const lines = trainContent.trim().split('\n');
      const parsed = JSON.parse(lines[0]);

      expect(parsed.prompt).toContain('Translate to French');
      expect(parsed.prompt).toContain('Hello world');
    });

    it('should create GUIDE.md', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'anthropic-prompts',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'consolidation',
      };

      const result = await exportAnthropicPromptsFormat(examples, config);

      expect(existsSync(result.files.readme)).toBe(true);
      const guide = readFileSync(result.files.readme, 'utf-8');
      expect(guide).toContain('Anthropic');
      expect(guide).toContain('consolidation');
    });

    it('should create dataset_info.json', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'anthropic-prompts',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportAnthropicPromptsFormat(examples, config);

      expect(result.files.datasetInfo).toBeDefined();
      expect(existsSync(result.files.datasetInfo!)).toBe(true);
    });

    it('should handle error gracefully', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'anthropic-prompts',
        outputPath: '/nonexistent/path',
      };

      const result = await exportAnthropicPromptsFormat(examples, config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Train/Eval Split', () => {
    it('should correctly split with custom ratio', async () => {
      const examples = createTestExamples(100);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
        splitRatio: 0.3, // 30% eval
      };

      const result = await exportAlpacaFormat(examples, config);

      expect(result.stats.trainExamples).toBe(70);
      expect(result.stats.evalExamples).toBe(30);
    });

    it('should handle small datasets', async () => {
      const examples = createTestExamples(3);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
        splitRatio: 0.1,
      };

      const result = await exportAlpacaFormat(examples, config);

      expect(result.success).toBe(true);
      expect(result.stats.trainExamples + result.stats.evalExamples).toBe(3);
    });

    it('should handle single example', async () => {
      const examples = createTestExamples(1);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportAlpacaFormat(examples, config);

      expect(result.success).toBe(true);
      expect(result.stats.totalExamples).toBe(1);
    });
  });

  describe('File Sizes', () => {
    it('should track file sizes', async () => {
      const examples = createTestExamples(10);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportAlpacaFormat(examples, config);

      expect(Object.keys(result.stats.fileSizes).length).toBeGreaterThan(0);
      for (const size of Object.values(result.stats.fileSizes)) {
        expect(size).toBeGreaterThan(0);
      }
    });
  });

  describe('Export Timestamp', () => {
    it('should include export timestamp', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportAlpacaFormat(examples, config);

      expect(result.stats.exportedAt).toBeDefined();
      expect(new Date(result.stats.exportedAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe('Policy Type', () => {
    it('should default to extraction policy', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
      };

      const result = await exportAlpacaFormat(examples, config);

      expect(result.stats.policyType).toBe('extraction');
    });

    it('should use specified policy', async () => {
      const examples = createTestExamples(5);
      const config: LoRAExportConfig = {
        format: 'alpaca',
        outputPath: TEST_OUTPUT_PATH,
        policy: 'retrieval',
      };

      const result = await exportAlpacaFormat(examples, config);

      expect(result.stats.policyType).toBe('retrieval');
    });
  });
});
