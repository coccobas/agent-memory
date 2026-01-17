import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rlHandlers } from '../../src/mcp/handlers/rl.handler.js';
import * as training from '../../src/services/rl/training/index.js';
import type { AppContext } from '../../src/core/context.js';
import type { IFileSystemAdapter, FileStat } from '../../src/core/adapters/filesystem.adapter.js';

vi.mock('../../src/services/rl/training/index.js', () => ({
  buildExtractionDataset: vi.fn(),
  buildRetrievalDataset: vi.fn(),
  buildConsolidationDataset: vi.fn(),
  trainExtractionPolicy: vi.fn(),
  trainRetrievalPolicy: vi.fn(),
  trainConsolidationPolicy: vi.fn(),
  evaluatePolicy: vi.fn(),
  comparePolicies: vi.fn(),
  formatExtractionForDPO: vi.fn(),
  formatRetrievalForDPO: vi.fn(),
  formatConsolidationForDPO: vi.fn(),
}));
vi.mock('../../src/config/index.js', () => ({
  config: { paths: { dataDir: '/tmp/test' } },
}));

/**
 * Create a mock filesystem adapter for testing.
 * This provides in-memory implementations of all IFileSystemAdapter methods.
 */
function createMockFileSystemAdapter(overrides: Partial<IFileSystemAdapter> = {}): IFileSystemAdapter {
  const files = new Map<string, string>();
  const directories = new Set<string>(['/tmp/test', '/tmp/output']);

  return {
    exists: vi.fn().mockImplementation(async (path: string) => {
      return files.has(path) || directories.has(path);
    }),
    readFile: vi.fn().mockImplementation(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return content;
    }),
    readDir: vi.fn().mockImplementation(async () => []),
    stat: vi.fn().mockImplementation(async (): Promise<FileStat> => ({
      isDirectory: () => false,
      mtime: new Date(),
      size: 0,
    })),
    writeFile: vi.fn().mockImplementation(async (path: string, content: string) => {
      files.set(path, content);
    }),
    mkdir: vi.fn().mockImplementation(async (path: string) => {
      directories.add(path);
    }),
    resolve: (...paths: string[]) => paths.join('/').replace(/\/+/g, '/'),
    join: (...paths: string[]) => paths.join('/').replace(/\/+/g, '/'),
    basename: (path: string) => path.split('/').pop() ?? '',
    dirname: (path: string) => path.split('/').slice(0, -1).join('/') || '/',
    ...overrides,
  };
}

describe('RL Handler', () => {
  let mockContext: AppContext;
  let mockRLService: {
    getStatus: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
    updateConfig: ReturnType<typeof vi.fn>;
    getExtractionPolicy: ReturnType<typeof vi.fn>;
    getRetrievalPolicy: ReturnType<typeof vi.fn>;
    getConsolidationPolicy: ReturnType<typeof vi.fn>;
  };
  let mockFs: IFileSystemAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRLService = {
      getStatus: vi.fn().mockReturnValue({
        extraction: { enabled: true },
        retrieval: { enabled: false },
        consolidation: { enabled: false },
      }),
      getConfig: vi.fn().mockReturnValue({}),
      updateConfig: vi.fn(),
      getExtractionPolicy: vi.fn().mockReturnValue({
        isEnabled: vi.fn().mockReturnValue(true),
      }),
      getRetrievalPolicy: vi.fn().mockReturnValue({
        isEnabled: vi.fn().mockReturnValue(false),
      }),
      getConsolidationPolicy: vi.fn().mockReturnValue({
        isEnabled: vi.fn().mockReturnValue(false),
      }),
    };

    // Create fresh mock filesystem adapter for each test
    mockFs = createMockFileSystemAdapter();

    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {
        rl: mockRLService,
      } as any,
      unifiedAdapters: {
        fs: mockFs,
      } as any,
    };
  });

  describe('status', () => {
    it('should return RL service status', async () => {
      const result = await rlHandlers.status(mockContext, {});

      expect(result).toBeDefined();
      expect(mockRLService.getStatus).toHaveBeenCalled();
    });

    it('should throw when RL service not available', async () => {
      const noRlContext = {
        ...mockContext,
        services: {} as any,
      };

      await expect(rlHandlers.status(noRlContext, {})).rejects.toThrow(/RL service not available/i);
    });
  });

  describe('enable', () => {
    it('should enable a policy', async () => {
      const result = await rlHandlers.enable(mockContext, {
        policy: 'extraction',
        enabled: true,
      });

      expect(result).toEqual({
        success: true,
        policy: 'extraction',
        enabled: true,
      });
      expect(mockRLService.updateConfig).toHaveBeenCalledWith({
        extraction: { enabled: true },
      });
    });

    it('should disable a policy', async () => {
      const result = await rlHandlers.enable(mockContext, {
        policy: 'retrieval',
        enabled: false,
      });

      expect(result).toEqual({
        success: true,
        policy: 'retrieval',
        enabled: false,
      });
    });

    it('should throw on invalid policy', async () => {
      await expect(
        rlHandlers.enable(mockContext, {
          policy: 'invalid',
          enabled: true,
        })
      ).rejects.toThrow('policy');
    });
  });

  describe('config', () => {
    it('should update policy config', async () => {
      mockRLService.getConfig.mockReturnValue({
        extraction: { enabled: true, modelPath: '/test' },
      });

      const result = await rlHandlers.config(mockContext, {
        policy: 'extraction',
        modelPath: '/models/extraction',
        enabled: true,
      });

      expect(result.success).toBe(true);
      expect(mockRLService.updateConfig).toHaveBeenCalled();
    });

    it('should update global config without policy', async () => {
      mockRLService.getConfig.mockReturnValue({});

      const result = await rlHandlers.config(mockContext, {
        config: { someGlobalSetting: true },
      });

      expect(result.success).toBe(true);
    });

    it('should throw on invalid policy name', async () => {
      await expect(
        rlHandlers.config(mockContext, {
          policy: 'invalid',
          config: {},
        })
      ).rejects.toThrow('policy');
    });
  });

  describe('train', () => {
    it('should train extraction policy', async () => {
      vi.mocked(training.buildExtractionDataset).mockResolvedValue({
        train: [],
        eval: [],
        stats: {},
      } as any);
      vi.mocked(training.trainExtractionPolicy).mockResolvedValue({
        success: true,
        modelPath: '/models/extraction/v1',
        metrics: { accuracy: 0.85 },
      } as any);

      const result = await rlHandlers.train(mockContext, {
        policy: 'extraction',
      });

      expect(result.policy).toBe('extraction');
      expect(result.success).toBe(true);
    });

    it('should train retrieval policy', async () => {
      vi.mocked(training.buildRetrievalDataset).mockResolvedValue({
        train: [],
        eval: [],
        stats: {},
      } as any);
      vi.mocked(training.trainRetrievalPolicy).mockResolvedValue({
        success: true,
      } as any);

      const result = await rlHandlers.train(mockContext, {
        policy: 'retrieval',
      });

      expect(result.policy).toBe('retrieval');
    });

    it('should train consolidation policy', async () => {
      vi.mocked(training.buildConsolidationDataset).mockResolvedValue({
        train: [],
        eval: [],
        stats: {},
      } as any);
      vi.mocked(training.trainConsolidationPolicy).mockResolvedValue({
        success: true,
      } as any);

      const result = await rlHandlers.train(mockContext, {
        policy: 'consolidation',
      });

      expect(result.policy).toBe('consolidation');
    });

    it('should throw on invalid policy', async () => {
      await expect(rlHandlers.train(mockContext, { policy: 'invalid' })).rejects.toThrow('policy');
    });
  });

  describe('export_dataset', () => {
    it('should throw on invalid policy', async () => {
      await expect(
        rlHandlers.export_dataset(mockContext, {
          policy: 'invalid',
          outputPath: '/tmp/output',
        })
      ).rejects.toThrow('policy');
    });

    it('should throw on invalid format', async () => {
      await expect(
        rlHandlers.export_dataset(mockContext, {
          policy: 'extraction',
          format: 'invalid',
          outputPath: '/tmp/output',
        })
      ).rejects.toThrow('format');
    });
  });

  describe('list_models', () => {
    it('should return empty models list', async () => {
      const result = await rlHandlers.list_models(mockContext, {});

      expect(result.success).toBe(true);
      expect(result.models).toBeDefined();
      expect(result.models.extraction).toEqual([]);
    });
  });

  describe('load_model', () => {
    it('should throw when no models found', async () => {
      await expect(
        rlHandlers.load_model(mockContext, {
          policy: 'extraction',
        })
      ).rejects.toThrow('No trained models');
    });

    it('should throw on invalid policy', async () => {
      await expect(
        rlHandlers.load_model(mockContext, {
          policy: 'invalid',
        })
      ).rejects.toThrow('policy');
    });
  });

  describe('evaluate', () => {
    it('should throw when RL service not initialized', async () => {
      const noRlContext = {
        ...mockContext,
        services: {} as any,
      };

      await expect(rlHandlers.evaluate(noRlContext, { policy: 'extraction' })).rejects.toThrow(
        /RL service not available/i
      );
    });

    it('should throw on invalid policy', async () => {
      await expect(rlHandlers.evaluate(mockContext, { policy: 'invalid' })).rejects.toThrow(
        'policy'
      );
    });
  });

  describe('compare', () => {
    it('should throw on invalid policyA', async () => {
      await expect(
        rlHandlers.compare(mockContext, {
          policyA: 'invalid',
          policyB: 'extraction',
        })
      ).rejects.toThrow('policyA');
    });

    it('should throw on invalid policyB', async () => {
      await expect(
        rlHandlers.compare(mockContext, {
          policyA: 'extraction',
          policyB: 'invalid',
        })
      ).rejects.toThrow('policyB');
    });

    it('should allow comparing different policy types with a note', async () => {
      vi.mocked(training.buildExtractionDataset).mockResolvedValue({
        train: [],
        eval: [],
        stats: { totalExamples: 0 },
      } as any);

      const result = await rlHandlers.compare(mockContext, {
        policyA: 'extraction',
        policyB: 'retrieval',
      });

      expect(result.success).toBe(true);
      expect(result.note).toContain('Cross-policy comparison');
    });

    it('should throw when RL service not initialized', async () => {
      const noRlContext = {
        ...mockContext,
        services: {} as any,
      };

      await expect(
        rlHandlers.compare(noRlContext, {
          policyA: 'extraction',
          policyB: 'extraction',
        })
      ).rejects.toThrow(/RL service not available/i);
    });

    it('should compare extraction policies', async () => {
      vi.mocked(training.buildExtractionDataset).mockResolvedValue({
        train: [],
        eval: [{ state: {}, action: {}, reward: 1 }],
        stats: { totalExamples: 1 },
      } as any);
      vi.mocked(training.comparePolicies).mockResolvedValue({
        policyA: { accuracy: 0.8 },
        policyB: { accuracy: 0.75 },
      } as any);

      const result = await rlHandlers.compare(mockContext, {
        policyA: 'extraction',
        policyB: 'extraction',
      });

      expect(result.success).toBe(true);
      expect(result.comparison).toBeDefined();
    });

    it('should compare retrieval policies', async () => {
      vi.mocked(training.buildRetrievalDataset).mockResolvedValue({
        train: [],
        eval: [{ state: {}, action: {}, reward: 1 }],
        stats: { totalExamples: 1 },
      } as any);
      vi.mocked(training.comparePolicies).mockResolvedValue({} as any);

      const result = await rlHandlers.compare(mockContext, {
        policyA: 'retrieval',
        policyB: 'retrieval',
      });

      expect(result.success).toBe(true);
    });

    it('should compare consolidation policies', async () => {
      vi.mocked(training.buildConsolidationDataset).mockResolvedValue({
        train: [],
        eval: [{ state: {}, action: {}, reward: 1 }],
        stats: { totalExamples: 1 },
      } as any);
      vi.mocked(training.comparePolicies).mockResolvedValue({} as any);

      const result = await rlHandlers.compare(mockContext, {
        policyA: 'consolidation',
        policyB: 'consolidation',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('export_dataset formats', () => {
    beforeEach(() => {
      vi.mocked(training.buildExtractionDataset).mockResolvedValue({
        train: [{ state: {}, action: {}, reward: 1 }],
        eval: [],
        stats: { totalExamples: 1 },
      } as any);
      vi.mocked(training.formatExtractionForDPO).mockReturnValue([
        { prompt: 'test', chosen: 'good', rejected: 'bad' },
      ]);
    });

    it('should export in huggingface format', async () => {
      const result = await rlHandlers.export_dataset(mockContext, {
        policy: 'extraction',
        format: 'huggingface',
        outputPath: '/tmp/output',
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe('huggingface');
    });

    it('should export in openai format', async () => {
      const result = await rlHandlers.export_dataset(mockContext, {
        policy: 'extraction',
        format: 'openai',
        outputPath: '/tmp/output',
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe('openai');
    });

    it('should export in csv format', async () => {
      const result = await rlHandlers.export_dataset(mockContext, {
        policy: 'extraction',
        format: 'csv',
        outputPath: '/tmp/output',
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe('csv');
    });

    it('should export in jsonl format', async () => {
      const result = await rlHandlers.export_dataset(mockContext, {
        policy: 'extraction',
        format: 'jsonl',
        outputPath: '/tmp/output',
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe('jsonl');
    });

    it('should export retrieval dataset', async () => {
      vi.mocked(training.buildRetrievalDataset).mockResolvedValue({
        train: [{ state: {}, action: {}, reward: 1 }],
        eval: [],
        stats: { totalExamples: 1 },
      } as any);
      vi.mocked(training.formatRetrievalForDPO).mockReturnValue([
        { prompt: 'test', chosen: 'good', rejected: 'bad' },
      ]);

      const result = await rlHandlers.export_dataset(mockContext, {
        policy: 'retrieval',
        format: 'huggingface',
        outputPath: '/tmp/output',
      });

      expect(result.success).toBe(true);
    });

    it('should export consolidation dataset', async () => {
      vi.mocked(training.buildConsolidationDataset).mockResolvedValue({
        train: [{ state: {}, action: {}, reward: 1 }],
        eval: [],
        stats: { totalExamples: 1 },
      } as any);
      vi.mocked(training.formatConsolidationForDPO).mockReturnValue([
        { prompt: 'test', chosen: 'good', rejected: 'bad' },
      ]);

      const result = await rlHandlers.export_dataset(mockContext, {
        policy: 'consolidation',
        format: 'huggingface',
        outputPath: '/tmp/output',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('evaluate with dataset', () => {
    it('should evaluate extraction policy with built dataset', async () => {
      vi.mocked(training.buildExtractionDataset).mockResolvedValue({
        train: [],
        eval: [{ state: {}, action: {}, reward: 1 }],
        stats: { totalExamples: 1 },
      } as any);
      vi.mocked(training.evaluatePolicy).mockResolvedValue({
        accuracy: 0.85,
        avgReward: 0.9,
      } as any);

      const result = await rlHandlers.evaluate(mockContext, {
        policy: 'extraction',
      });

      expect(result.success).toBe(true);
      expect(result.evaluation).toBeDefined();
    });

    it('should evaluate retrieval policy', async () => {
      vi.mocked(training.buildRetrievalDataset).mockResolvedValue({
        train: [],
        eval: [{ state: {}, action: {}, reward: 1 }],
        stats: { totalExamples: 1 },
      } as any);
      vi.mocked(training.evaluatePolicy).mockResolvedValue({} as any);

      const result = await rlHandlers.evaluate(mockContext, {
        policy: 'retrieval',
      });

      expect(result.success).toBe(true);
    });

    it('should evaluate consolidation policy', async () => {
      vi.mocked(training.buildConsolidationDataset).mockResolvedValue({
        train: [],
        eval: [{ state: {}, action: {}, reward: 1 }],
        stats: { totalExamples: 1 },
      } as any);
      vi.mocked(training.evaluatePolicy).mockResolvedValue({} as any);

      const result = await rlHandlers.evaluate(mockContext, {
        policy: 'consolidation',
      });

      expect(result.success).toBe(true);
    });

    it('should evaluate using dataset from file', async () => {
      // Set up mock filesystem to return the dataset content
      vi.mocked(mockFs.readFile).mockResolvedValue('{"state":{},"action":{},"reward":1}');
      vi.mocked(training.evaluatePolicy).mockResolvedValue({} as any);

      const result = await rlHandlers.evaluate(mockContext, {
        policy: 'extraction',
        datasetPath: '/tmp/dataset.jsonl',
      });

      expect(result.success).toBe(true);
      expect(mockFs.readFile).toHaveBeenCalledWith('/tmp/dataset.jsonl', 'utf-8');
    });
  });

  describe('load_model with models', () => {
    it('should load latest model when version not specified', async () => {
      // Set up mock filesystem to show models exist
      vi.mocked(mockFs.exists).mockResolvedValue(true);
      vi.mocked(mockFs.readDir).mockResolvedValue(['v1', 'v2']);
      vi.mocked(mockFs.stat).mockResolvedValue({
        isDirectory: () => true,
        mtime: new Date(),
        size: 0,
      });

      const result = await rlHandlers.load_model(mockContext, {
        policy: 'extraction',
      });

      expect(result.success).toBe(true);
      expect(result.version).toBe('v2');
    });

    it('should load specific version', async () => {
      vi.mocked(mockFs.exists).mockResolvedValue(true);

      const result = await rlHandlers.load_model(mockContext, {
        policy: 'extraction',
        version: 'v1',
      });

      expect(result.success).toBe(true);
      expect(result.version).toBe('v1');
    });

    it('should throw when no directories in models folder', async () => {
      vi.mocked(mockFs.exists).mockResolvedValue(true);
      vi.mocked(mockFs.readDir).mockResolvedValue(['file.txt']);
      vi.mocked(mockFs.stat).mockResolvedValue({
        isDirectory: () => false,
        mtime: new Date(),
        size: 0,
      });

      await expect(rlHandlers.load_model(mockContext, { policy: 'extraction' })).rejects.toThrow(
        'No trained models'
      );
    });

    it('should throw when RL service not available', async () => {
      vi.mocked(mockFs.exists).mockResolvedValue(true);
      vi.mocked(mockFs.readDir).mockResolvedValue(['v1']);
      vi.mocked(mockFs.stat).mockResolvedValue({
        isDirectory: () => true,
        mtime: new Date(),
        size: 0,
      });

      const noRlContext = {
        ...mockContext,
        services: {} as any,
      };

      await expect(rlHandlers.load_model(noRlContext, { policy: 'extraction' })).rejects.toThrow(
        /RL service not available/i
      );
    });
  });

  describe('list_models with existing models', () => {
    it('should list models with metadata', async () => {
      // Set up mock filesystem to show models and metadata exist
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        if (path.includes('metadata.json')) return true;
        return path.includes('extraction');
      });
      vi.mocked(mockFs.readDir).mockResolvedValue(['v1', 'v2']);
      vi.mocked(mockFs.stat).mockResolvedValue({
        isDirectory: () => true,
        mtime: new Date(),
        size: 0,
      });
      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify({
          createdAt: '2024-01-01T00:00:00Z',
          trainPairs: 100,
          evalPairs: 20,
        })
      );

      const result = await rlHandlers.list_models(mockContext, {});

      expect(result.success).toBe(true);
      expect(result.models.extraction.length).toBeGreaterThan(0);
    });

    it('should handle metadata read errors', async () => {
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        // Models directory exists, but metadata read will fail
        return path.includes('extraction') && !path.includes('metadata');
      });
      vi.mocked(mockFs.readDir).mockResolvedValue(['v1']);
      vi.mocked(mockFs.stat).mockResolvedValue({
        isDirectory: () => true,
        mtime: new Date(),
        size: 0,
      });
      vi.mocked(mockFs.readFile).mockRejectedValue(new Error('Read error'));

      const result = await rlHandlers.list_models(mockContext, {});

      expect(result.success).toBe(true);
      expect(result.models.extraction.length).toBe(1);
    });
  });
});
