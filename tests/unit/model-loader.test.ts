import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import {
  ModelLoader,
  createModelLoader,
  getDefaultModelsDir,
  formatModelInfo,
  type ModelLoaderConfig,
  type LoadedModel,
  type ModelMetadata,
  type PolicyType,
  type ModelFormat,
} from '../../src/services/rl/training/model-loader.js';

// Mock fs module with memfs
vi.mock('fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

describe('Model Loader', () => {
  let loader: ModelLoader;
  const testModelsDir = '/models';

  beforeEach(() => {
    vol.reset();
    vol.mkdirSync(testModelsDir, { recursive: true });

    const config: ModelLoaderConfig = {
      modelsDir: testModelsDir,
      preferredFormat: 'onnx',
      autoLoadWeights: false,
    };

    loader = new ModelLoader(config);
  });

  afterEach(() => {
    vol.reset();
    loader.clearCache();
  });

  describe('ModelLoader initialization', () => {
    it('should initialize with config', () => {
      const config: ModelLoaderConfig = {
        modelsDir: '/test-models',
        preferredFormat: 'safetensors',
        autoLoadWeights: true,
      };

      const testLoader = new ModelLoader(config);
      expect(testLoader).toBeDefined();
    });

    it('should use default values for optional config', () => {
      const config: ModelLoaderConfig = {
        modelsDir: '/test-models',
      };

      const testLoader = new ModelLoader(config);
      expect(testLoader).toBeDefined();
    });
  });

  describe('listModels', () => {
    it('should return empty array if models directory does not exist', async () => {
      vol.reset(); // Remove all files including models directory
      const models = await loader.listModels();
      expect(models).toEqual([]);
    });

    it('should list available models', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');
      createMockModel(testModelsDir, 'retrieval-v1.0.0.onnx', 'retrieval', 'onnx', 'v1.0.0');

      const models = await loader.listModels();

      expect(models.length).toBe(2);
      expect(models.some((m) => m.policyType === 'extraction')).toBe(true);
      expect(models.some((m) => m.policyType === 'retrieval')).toBe(true);
    });

    it('should skip files without metadata', async () => {
      vol.writeFileSync(`${testModelsDir}/model-no-metadata.onnx`, Buffer.from('model data'));

      const models = await loader.listModels();

      expect(models.length).toBe(0);
    });

    it('should skip directories', async () => {
      vol.mkdirSync(`${testModelsDir}/subdirectory`);

      const models = await loader.listModels();

      expect(models.length).toBe(0);
    });

    it('should detect model format from file extension', async () => {
      createMockModel(testModelsDir, 'model.onnx', 'extraction', 'onnx', 'v1.0.0');
      createMockModel(testModelsDir, 'model.safetensors', 'retrieval', 'safetensors', 'v1.0.0');
      createMockModel(testModelsDir, 'model.json', 'consolidation', 'json', 'v1.0.0');
      createMockModel(testModelsDir, 'model.pt', 'extraction', 'checkpoint', 'v1.0.0');

      const models = await loader.listModels();

      expect(models.find((m) => m.modelFormat === 'onnx')).toBeDefined();
      expect(models.find((m) => m.modelFormat === 'safetensors')).toBeDefined();
      expect(models.find((m) => m.modelFormat === 'json')).toBeDefined();
      expect(models.find((m) => m.modelFormat === 'checkpoint')).toBeDefined();
    });

    it('should sort models by policy type and version', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');
      createMockModel(testModelsDir, 'extraction-v2.0.0.onnx', 'extraction', 'onnx', 'v2.0.0');
      createMockModel(testModelsDir, 'retrieval-v1.0.0.onnx', 'retrieval', 'onnx', 'v1.0.0');

      const models = await loader.listModels();

      expect(models[0]?.policyType).toBe('extraction');
      expect(models[0]?.version).toBe('2.0.0'); // Newer version first (v prefix stripped)
      expect(models[1]?.version).toBe('1.0.0');
      expect(models[2]?.policyType).toBe('retrieval');
    });

    it('should extract version from filename', async () => {
      createMockModel(testModelsDir, 'model-v1.2.3.onnx', 'extraction', 'onnx', 'v1.2.3');
      createMockModel(
        testModelsDir,
        'model-20240101-120000.onnx',
        'retrieval',
        'onnx',
        '20240101-120000'
      );

      const models = await loader.listModels();

      expect(models.some((m) => m.version === '1.2.3')).toBe(true); // v prefix stripped
      expect(models.some((m) => m.version === '20240101-120000')).toBe(true);
    });

    it('should support alternative file extensions', async () => {
      createMockModel(testModelsDir, 'model.st', 'extraction', 'safetensors', 'v1.0.0');
      createMockModel(testModelsDir, 'model.pth', 'retrieval', 'checkpoint', 'v1.0.0');
      createMockModel(testModelsDir, 'model.ckpt', 'consolidation', 'checkpoint', 'v1.0.0');

      const models = await loader.listModels();

      expect(models.length).toBe(3);
    });
  });

  describe('loadModel', () => {
    it('should load model by policy type', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');

      const model = await loader.loadModel('extraction');

      expect(model.policyType).toBe('extraction');
      expect(model.version).toBe('1.0.0'); // v prefix stripped
    });

    it('should load latest version by default', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');
      createMockModel(testModelsDir, 'extraction-v2.0.0.onnx', 'extraction', 'onnx', 'v2.0.0');

      const model = await loader.loadModel('extraction');

      expect(model.version).toBe('2.0.0'); // v prefix stripped
    });

    it('should load specific version when provided', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');
      createMockModel(testModelsDir, 'extraction-v2.0.0.onnx', 'extraction', 'onnx', 'v2.0.0');

      const model = await loader.loadModel('extraction', '1.0.0'); // v prefix stripped

      expect(model.version).toBe('1.0.0');
    });

    it('should throw error if no models found for policy type', async () => {
      await expect(loader.loadModel('extraction')).rejects.toThrow('model not found: extraction');
    });

    it('should throw error if specific version not found', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');

      await expect(loader.loadModel('extraction', 'v2.0.0')).rejects.toThrow(
        'model not found: extraction@v2.0.0'
      );
    });

    it('should validate model before loading', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');

      // Should not throw validation error
      await expect(loader.loadModel('extraction')).resolves.toBeDefined();
    });

    it('should throw error if validation fails', async () => {
      // Create model with invalid metadata (empty file size)
      const modelPath = `${testModelsDir}/invalid-model.onnx`;
      vol.writeFileSync(modelPath, Buffer.from('')); // Empty file

      createMockMetadata(modelPath, 'extraction', 'onnx', 'v1.0.0');

      // Should fail because file is empty
      await expect(loader.loadModel('extraction')).rejects.toThrow('Validation error: model - ');
    });

    it('should cache loaded models', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');

      const model1 = await loader.loadModel('extraction');
      const model2 = await loader.loadModel('extraction');

      expect(model1).toBe(model2); // Same object reference due to caching
    });

    it('should use different cache keys for different versions', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');
      createMockModel(testModelsDir, 'extraction-v2.0.0.onnx', 'extraction', 'onnx', 'v2.0.0');

      const model1 = await loader.loadModel('extraction', '1.0.0'); // v prefix stripped
      const model2 = await loader.loadModel('extraction', '2.0.0');

      expect(model1).not.toBe(model2);
      expect(model1.version).toBe('1.0.0');
      expect(model2.version).toBe('2.0.0');
    });

    it('should load weights if autoLoadWeights is enabled', async () => {
      const configWithWeights: ModelLoaderConfig = {
        modelsDir: testModelsDir,
        autoLoadWeights: true,
      };
      const loaderWithWeights = new ModelLoader(configWithWeights);

      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');

      const model = await loaderWithWeights.loadModel('extraction');

      // Weights loading is placeholder for now, so weights will be undefined
      expect(model.weights).toBeUndefined();
    });
  });

  describe('getLatestModel', () => {
    it('should return latest model for policy type', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');
      createMockModel(testModelsDir, 'extraction-v2.0.0.onnx', 'extraction', 'onnx', 'v2.0.0');

      const model = await loader.getLatestModel('extraction');

      expect(model?.version).toBe('2.0.0'); // v prefix stripped
    });

    it('should return null if no models found', async () => {
      const model = await loader.getLatestModel('extraction');

      expect(model).toBeNull();
    });
  });

  describe('validateModel', () => {
    it('should validate model successfully', async () => {
      const modelPath = createMockModel(
        testModelsDir,
        'extraction-v1.0.0.onnx',
        'extraction',
        'onnx',
        'v1.0.0'
      );

      const result = await loader.validateModel(modelPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should fail if file does not exist', async () => {
      const result = await loader.validateModel('/nonexistent/model.onnx');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Model file does not exist');
    });

    it('should fail if file is empty', async () => {
      const modelPath = `${testModelsDir}/empty-model.onnx`;
      vol.writeFileSync(modelPath, Buffer.from(''));

      createMockMetadata(modelPath, 'extraction', 'onnx', 'v1.0.0');

      const result = await loader.validateModel(modelPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Model file is empty');
    });

    it('should warn if file is very large', async () => {
      const modelPath = `${testModelsDir}/large-model.onnx`;
      // Create a file larger than 1GB
      const largeBuffer = Buffer.alloc(1024 * 1024 * 1024 + 1);
      vol.writeFileSync(modelPath, largeBuffer);

      createMockMetadata(modelPath, 'extraction', 'onnx', 'v1.0.0');

      const result = await loader.validateModel(modelPath);

      expect(result.warnings).toContain('Model file is very large (> 1GB)');
    });

    it('should fail if no metadata found', async () => {
      const modelPath = `${testModelsDir}/no-metadata.onnx`;
      vol.writeFileSync(modelPath, Buffer.from('model data'));

      const result = await loader.validateModel(modelPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No metadata found for model');
    });

    it('should fail if metadata is missing required fields', async () => {
      const modelPath = `${testModelsDir}/invalid-metadata.onnx`;
      vol.writeFileSync(modelPath, Buffer.from('model data'));

      const invalidMetadata: Partial<ModelMetadata> = {
        trainedAt: new Date().toISOString(),
        datasetStats: {
          trainExamples: 100,
          evalExamples: 20,
          dateRange: { start: '2024-01-01', end: '2024-12-31' },
        },
        config: {
          // Missing policyType and modelFormat
          version: 'v1.0.0',
        } as any,
      };

      vol.writeFileSync(
        modelPath.replace('.onnx', '.metadata.json'),
        JSON.stringify(invalidMetadata)
      );

      const result = await loader.validateModel(modelPath);

      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('policyType'))).toBe(true);
      expect(result.errors?.some((e) => e.includes('modelFormat'))).toBe(true);
    });

    it('should warn if format mismatch between file and metadata', async () => {
      const modelPath = `${testModelsDir}/format-mismatch.onnx`;
      vol.writeFileSync(modelPath, Buffer.from('model data'));

      // Metadata says safetensors but file is .onnx
      createMockMetadata(modelPath, 'extraction', 'safetensors', 'v1.0.0');

      const result = await loader.validateModel(modelPath);

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes('format mismatch'))).toBe(true);
    });

    it('should warn if dataset statistics are missing', async () => {
      const modelPath = `${testModelsDir}/no-stats.onnx`;
      vol.writeFileSync(modelPath, Buffer.from('model data'));

      const metadata: ModelMetadata = {
        trainedAt: new Date().toISOString(),
        datasetStats: undefined as any, // Missing stats
        config: {
          policyType: 'extraction',
          modelFormat: 'onnx',
          version: 'v1.0.0',
        },
      };

      vol.writeFileSync(modelPath.replace('.onnx', '.metadata.json'), JSON.stringify(metadata));

      const result = await loader.validateModel(modelPath);

      expect(result.warnings).toContain('Missing dataset statistics in metadata');
    });
  });

  describe('clearCache', () => {
    it('should clear model cache', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');

      await loader.loadModel('extraction');
      expect(loader.getCacheStats().size).toBe(1);

      loader.clearCache();
      expect(loader.getCacheStats().size).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');
      createMockModel(testModelsDir, 'retrieval-v1.0.0.onnx', 'retrieval', 'onnx', 'v1.0.0');

      await loader.loadModel('extraction');
      await loader.loadModel('retrieval');

      const stats = loader.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.keys).toContain('extraction:latest');
      expect(stats.keys).toContain('retrieval:latest');
    });

    it('should include version-specific cache keys', async () => {
      createMockModel(testModelsDir, 'extraction-v1.0.0.onnx', 'extraction', 'onnx', 'v1.0.0');

      await loader.loadModel('extraction', '1.0.0'); // v prefix stripped

      const stats = loader.getCacheStats();

      expect(stats.keys).toContain('extraction:1.0.0');
    });
  });

  describe('metadata loading', () => {
    it('should load metadata from companion file', async () => {
      const modelPath = createMockModel(
        testModelsDir,
        'model.onnx',
        'extraction',
        'onnx',
        'v1.0.0'
      );

      const models = await loader.listModels();
      const model = models[0];

      expect(model?.metadata).toBeDefined();
      expect(model?.metadata.config.policyType).toBe('extraction');
    });

    it('should load embedded metadata from JSON models', async () => {
      const modelPath = `${testModelsDir}/model.json`;

      const metadata: ModelMetadata = {
        trainedAt: new Date().toISOString(),
        datasetStats: {
          trainExamples: 100,
          evalExamples: 20,
          dateRange: { start: '2024-01-01', end: '2024-12-31' },
        },
        config: {
          policyType: 'extraction',
          modelFormat: 'json',
          version: 'v1.0.0',
        },
      };

      const modelContent = {
        metadata,
        weights: {},
      };

      vol.writeFileSync(modelPath, JSON.stringify(modelContent));

      const models = await loader.listModels();
      const model = models[0];

      expect(model?.metadata).toBeDefined();
      expect(model?.metadata.config.policyType).toBe('extraction');
    });
  });
});

describe('createModelLoader', () => {
  it('should create ModelLoader instance', () => {
    const config: ModelLoaderConfig = {
      modelsDir: '/test-models',
    };

    const loader = createModelLoader(config);

    expect(loader).toBeInstanceOf(ModelLoader);
  });
});

describe('getDefaultModelsDir', () => {
  it('should return environment variable if set', () => {
    const originalValue = process.env['RL_MODELS_DIR'];
    process.env['RL_MODELS_DIR'] = '/custom/models';

    const dir = getDefaultModelsDir();

    expect(dir).toBe('/custom/models');

    // Restore
    if (originalValue) {
      process.env['RL_MODELS_DIR'] = originalValue;
    } else {
      delete process.env['RL_MODELS_DIR'];
    }
  });

  it('should return default path if environment variable not set', () => {
    const originalValue = process.env['RL_MODELS_DIR'];
    delete process.env['RL_MODELS_DIR'];

    const dir = getDefaultModelsDir();

    expect(dir).toContain('models');

    // Restore
    if (originalValue) {
      process.env['RL_MODELS_DIR'] = originalValue;
    }
  });
});

describe('formatModelInfo', () => {
  it('should format model info as human-readable string', () => {
    const model: LoadedModel = {
      policyType: 'extraction',
      modelPath: '/models/extraction-v1.0.0.onnx',
      modelFormat: 'onnx',
      version: 'v1.0.0',
      metadata: {
        trainedAt: '2024-01-01T00:00:00.000Z',
        datasetStats: {
          trainExamples: 1000,
          evalExamples: 200,
          dateRange: {
            start: '2024-01-01',
            end: '2024-12-31',
          },
        },
        config: {
          policyType: 'extraction',
          modelFormat: 'onnx',
          version: 'v1.0.0',
        },
      },
    };

    const info = formatModelInfo(model);

    expect(info).toContain('extraction');
    expect(info).toContain('v1.0.0');
    expect(info).toContain('onnx');
    expect(info).toContain('1000 train');
    expect(info).toContain('200 eval');
  });

  it('should include performance metrics if available', () => {
    const model: LoadedModel = {
      policyType: 'extraction',
      modelPath: '/models/extraction-v1.0.0.onnx',
      modelFormat: 'onnx',
      version: 'v1.0.0',
      metadata: {
        trainedAt: '2024-01-01T00:00:00.000Z',
        datasetStats: {
          trainExamples: 1000,
          evalExamples: 200,
          dateRange: {
            start: '2024-01-01',
            end: '2024-12-31',
          },
        },
        config: {
          policyType: 'extraction',
          modelFormat: 'onnx',
          version: 'v1.0.0',
        },
        performance: {
          accuracy: 0.95,
          avgReward: 0.8,
          f1Score: 0.92,
        },
      },
    };

    const info = formatModelInfo(model);

    expect(info).toContain('Performance');
    expect(info).toContain('95.00%'); // Accuracy
    expect(info).toContain('0.8000'); // Avg Reward
    expect(info).toContain('92.00%'); // F1 Score
  });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockModel(
  modelsDir: string,
  filename: string,
  policyType: PolicyType,
  format: ModelFormat,
  version: string
): string {
  const modelPath = `${modelsDir}/${filename}`;

  // Create model file
  vol.writeFileSync(modelPath, Buffer.from('mock model data'));

  // Create metadata file
  createMockMetadata(modelPath, policyType, format, version);

  return modelPath;
}

function createMockMetadata(
  modelPath: string,
  policyType: PolicyType,
  format: ModelFormat,
  version: string
): void {
  const metadata: ModelMetadata = {
    trainedAt: new Date().toISOString(),
    datasetStats: {
      trainExamples: 1000,
      evalExamples: 200,
      dateRange: {
        start: '2024-01-01',
        end: '2024-12-31',
      },
    },
    config: {
      policyType,
      modelFormat: format,
      version,
      hyperparameters: {
        learningRate: 0.0001,
        batchSize: 16,
        epochs: 3,
      },
    },
    performance: {
      accuracy: 0.9,
      avgReward: 0.75,
      f1Score: 0.85,
    },
  };

  const metadataPath = modelPath.replace(
    /\.(onnx|safetensors|st|json|pt|pth|ckpt)$/,
    '.metadata.json'
  );

  vol.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}
