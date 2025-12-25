import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loraHandlers } from '../../src/mcp/handlers/lora.handler.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/utils/admin.js', () => ({
  requireAdminKey: vi.fn(),
}));
vi.mock('../../src/config/index.js', () => ({
  config: { paths: { dataDir: '/tmp/test' } },
}));
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  readFileSync: vi.fn(),
}));
vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path');
  return actual;
});

describe('LoRA Handler', () => {
  let mockContext: AppContext;
  let mockGuidelinesRepo: {
    list: ReturnType<typeof vi.fn>;
  };
  let mockPermissionService: {
    check: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGuidelinesRepo = {
      list: vi.fn().mockResolvedValue([]),
    };
    mockPermissionService = {
      check: vi.fn().mockReturnValue(true),
    };
    mockContext = {
      db: {} as any,
      repos: {
        guidelines: mockGuidelinesRepo,
      } as any,
      services: {
        permission: mockPermissionService,
      } as any,
    };
  });

  describe('export', () => {
    it('should export guidelines as training data', async () => {
      mockGuidelinesRepo.list.mockResolvedValue([
        {
          id: 'g-1',
          name: 'Test Guideline',
          category: 'testing',
          priority: 80,
          currentVersion: {
            content: 'Always write tests',
          },
        },
      ]);

      const result = await loraHandlers.export(mockContext, {
        targetModel: 'meta-llama/Llama-2-7b',
        outputPath: '/tmp/lora-output',
        agentId: 'agent-1',
        admin_key: 'key',
      });

      expect(result.success).toBe(true);
      expect(result.targetModel).toBe('meta-llama/Llama-2-7b');
      expect(result.stats.totalExamples).toBeGreaterThan(0);
    });

    it('should support huggingface format by default', async () => {
      mockGuidelinesRepo.list.mockResolvedValue([
        {
          id: 'g-1',
          name: 'Test',
          currentVersion: { content: 'Content' },
        },
      ]);

      const result = await loraHandlers.export(mockContext, {
        targetModel: 'model',
        outputPath: '/tmp/output',
        agentId: 'agent-1',
        admin_key: 'key',
      });

      expect(result.format).toBe('huggingface');
    });

    it('should support openai format', async () => {
      mockGuidelinesRepo.list.mockResolvedValue([
        {
          id: 'g-1',
          name: 'Test',
          currentVersion: { content: 'Content' },
        },
      ]);

      const result = await loraHandlers.export(mockContext, {
        targetModel: 'gpt-3.5-turbo',
        format: 'openai',
        outputPath: '/tmp/output',
        agentId: 'agent-1',
        admin_key: 'key',
      });

      expect(result.format).toBe('openai');
    });

    it('should support anthropic format', async () => {
      mockGuidelinesRepo.list.mockResolvedValue([
        {
          id: 'g-1',
          name: 'Test',
          currentVersion: { content: 'Content' },
        },
      ]);

      const result = await loraHandlers.export(mockContext, {
        targetModel: 'claude-3-sonnet',
        format: 'anthropic',
        outputPath: '/tmp/output',
        agentId: 'agent-1',
        admin_key: 'key',
      });

      expect(result.format).toBe('anthropic');
    });

    it('should support alpaca format', async () => {
      mockGuidelinesRepo.list.mockResolvedValue([
        {
          id: 'g-1',
          name: 'Test',
          currentVersion: { content: 'Content' },
        },
      ]);

      const result = await loraHandlers.export(mockContext, {
        targetModel: 'alpaca',
        format: 'alpaca',
        outputPath: '/tmp/output',
        agentId: 'agent-1',
        admin_key: 'key',
      });

      expect(result.format).toBe('alpaca');
    });

    it('should throw on invalid format', async () => {
      await expect(
        loraHandlers.export(mockContext, {
          targetModel: 'model',
          format: 'invalid',
          outputPath: '/tmp/output',
          agentId: 'agent-1',
          admin_key: 'key',
        })
      ).rejects.toThrow('format');
    });

    it('should throw when no guidelines found', async () => {
      mockGuidelinesRepo.list.mockResolvedValue([]);

      await expect(
        loraHandlers.export(mockContext, {
          targetModel: 'model',
          outputPath: '/tmp/output',
          agentId: 'agent-1',
          admin_key: 'key',
        })
      ).rejects.toThrow('No guidelines');
    });

    it('should throw on permission denied', async () => {
      mockPermissionService.check.mockReturnValue(false);

      await expect(
        loraHandlers.export(mockContext, {
          targetModel: 'model',
          outputPath: '/tmp/output',
          agentId: 'agent-1',
          admin_key: 'key',
        })
      ).rejects.toThrow();
    });

    it('should validate trainEvalSplit range', async () => {
      await expect(
        loraHandlers.export(mockContext, {
          targetModel: 'model',
          outputPath: '/tmp/output',
          trainEvalSplit: 1.5,
          agentId: 'agent-1',
          admin_key: 'key',
        })
      ).rejects.toThrow('trainEvalSplit');
    });

    it('should include examples from guidelines', async () => {
      mockGuidelinesRepo.list.mockResolvedValue([
        {
          id: 'g-1',
          name: 'Code Style',
          currentVersion: {
            content: 'Use TypeScript',
            examples: {
              good: ['const x: number = 1'],
              bad: ['var x = 1'],
            },
          },
        },
      ]);

      const result = await loraHandlers.export(mockContext, {
        targetModel: 'model',
        outputPath: '/tmp/output',
        includeExamples: true,
        agentId: 'agent-1',
        admin_key: 'key',
      });

      // Should have more examples due to good/bad examples
      expect(result.stats.totalExamples).toBeGreaterThan(3);
    });

    it('should respect examplesPerGuideline limit', async () => {
      mockGuidelinesRepo.list.mockResolvedValue([
        {
          id: 'g-1',
          name: 'Test',
          currentVersion: {
            content: 'Content',
            examples: {
              good: ['a', 'b', 'c', 'd', 'e'],
            },
          },
        },
      ]);

      const result = await loraHandlers.export(mockContext, {
        targetModel: 'model',
        outputPath: '/tmp/output',
        examplesPerGuideline: 2,
        agentId: 'agent-1',
        admin_key: 'key',
      });

      // 3 base examples + 2 from good examples
      expect(result.stats.totalExamples).toBe(5);
    });

    it('should filter guidelines by category', async () => {
      mockGuidelinesRepo.list.mockResolvedValue([
        {
          id: 'g-1',
          name: 'Security',
          category: 'security',
          currentVersion: { content: 'Content' },
        },
      ]);

      await loraHandlers.export(mockContext, {
        targetModel: 'model',
        outputPath: '/tmp/output',
        guidelineFilter: { category: 'security' },
        agentId: 'agent-1',
        admin_key: 'key',
      });

      expect(mockGuidelinesRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'security' })
      );
    });
  });

  describe('list_adapters', () => {
    it('should return empty list when no adapters exist', async () => {
      const result = await loraHandlers.list_adapters(mockContext, {});

      expect(result.success).toBe(true);
      expect(result.adapters).toEqual([]);
    });
  });

  describe('generate_script', () => {
    it('should generate huggingface training script', async () => {
      const result = await loraHandlers.generate_script(mockContext, {
        targetModel: 'meta-llama/Llama-2-7b',
        datasetPath: '/tmp/dataset',
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe('huggingface');
      expect(result.script).toContain('from transformers import');
      expect(result.script).toContain('LoraConfig');
    });

    it('should generate openai training script', async () => {
      const result = await loraHandlers.generate_script(mockContext, {
        targetModel: 'gpt-3.5-turbo',
        format: 'openai',
        datasetPath: '/tmp/dataset',
      });

      expect(result.format).toBe('openai');
      expect(result.script).toContain('import openai');
      expect(result.script).toContain('FineTuningJob.create');
    });

    it('should generate anthropic training script', async () => {
      const result = await loraHandlers.generate_script(mockContext, {
        targetModel: 'claude-3',
        format: 'anthropic',
        datasetPath: '/tmp/dataset',
      });

      expect(result.format).toBe('anthropic');
      expect(result.script).toContain('import anthropic');
    });

    it('should generate alpaca training script', async () => {
      const result = await loraHandlers.generate_script(mockContext, {
        targetModel: 'alpaca',
        format: 'alpaca',
        datasetPath: '/tmp/dataset',
      });

      expect(result.format).toBe('alpaca');
      expect(result.script).toContain('SFTTrainer');
      expect(result.script).toContain('format_alpaca');
    });

    it('should throw on invalid format', async () => {
      await expect(
        loraHandlers.generate_script(mockContext, {
          targetModel: 'model',
          format: 'invalid',
          datasetPath: '/tmp/dataset',
        })
      ).rejects.toThrow('format');
    });
  });
});
