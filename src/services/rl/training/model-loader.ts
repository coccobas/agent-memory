/**
 * Model Loader
 *
 * Infrastructure for loading and validating trained RL models.
 * Supports multiple model formats (ONNX, SafeTensors, JSON, checkpoints).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';

// =============================================================================
// TYPES
// =============================================================================

export type ModelFormat = 'onnx' | 'safetensors' | 'json' | 'checkpoint';
export type PolicyType = 'extraction' | 'retrieval' | 'consolidation';

export interface ModelMetadata {
  trainedAt: string;
  datasetStats: {
    trainExamples: number;
    evalExamples: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
  config: {
    policyType: PolicyType;
    modelFormat: ModelFormat;
    version: string;
    hyperparameters?: Record<string, unknown>;
  };
  performance?: {
    accuracy: number;
    avgReward: number;
    f1Score: number;
  };
}

export interface LoadedModel {
  policyType: PolicyType;
  modelPath: string;
  modelFormat: ModelFormat;
  metadata: ModelMetadata;
  version: string;
  weights?: unknown; // Model weights (format-dependent)
}

export interface ModelLoaderConfig {
  modelsDir: string;
  preferredFormat?: ModelFormat;
  autoLoadWeights?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// =============================================================================
// MODEL LOADER
// =============================================================================

/**
 * Load and manage trained RL models
 *
 * Features:
 * - Automatic model discovery in models directory
 * - Version management (latest, specific version)
 * - Format preference (ONNX, SafeTensors, JSON)
 * - Model validation and integrity checks
 * - Metadata extraction and parsing
 */
export class ModelLoader {
  private config: Required<ModelLoaderConfig>;
  private modelCache: Map<string, LoadedModel> = new Map();

  constructor(config: ModelLoaderConfig) {
    this.config = {
      modelsDir: config.modelsDir,
      preferredFormat: config.preferredFormat ?? 'onnx',
      autoLoadWeights: config.autoLoadWeights ?? false,
    };
  }

  /**
   * List all available trained models
   *
   * Scans models directory for:
   * - Model files (*.onnx, *.safetensors, *.json, *.pt)
   * - Metadata files (*.metadata.json)
   * - Groups by policy type and version
   */
  async listModels(): Promise<LoadedModel[]> {
    const models: LoadedModel[] = [];

    // Ensure models directory exists
    if (!existsSync(this.config.modelsDir)) {
      return [];
    }

    // Scan directory for model files
    const files = readdirSync(this.config.modelsDir);

    for (const file of files) {
      const filePath = join(this.config.modelsDir, file);
      const stats = statSync(filePath);

      // Skip directories
      if (stats.isDirectory()) {
        continue;
      }

      // Check if this is a model file
      const format = this.detectModelFormat(file);
      if (!format) {
        continue;
      }

      // Try to load metadata
      const metadata = await this.loadMetadata(filePath);
      if (!metadata) {
        continue;
      }

      // Extract version from filename or metadata
      const version = this.extractVersion(file, metadata);

      models.push({
        policyType: metadata.config.policyType,
        modelPath: filePath,
        modelFormat: format,
        metadata,
        version,
      });
    }

    // Sort by policy type, then version (newest first)
    models.sort((a, b) => {
      if (a.policyType !== b.policyType) {
        return a.policyType.localeCompare(b.policyType);
      }
      return b.version.localeCompare(a.version);
    });

    return models;
  }

  /**
   * Load a specific model by policy type and version
   *
   * @param policyType - Policy type (extraction, retrieval, consolidation)
   * @param version - Model version (optional, defaults to latest)
   * @returns Loaded model with metadata
   */
  async loadModel(policyType: PolicyType, version?: string): Promise<LoadedModel> {
    const cacheKey = `${policyType}:${version ?? 'latest'}`;

    // Check cache first
    const cached = this.modelCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Find matching model
    const models = await this.listModels();
    const candidates = models.filter((m) => m.policyType === policyType);

    if (candidates.length === 0) {
      throw new Error(`No models found for policy type: ${policyType}`);
    }

    let model: LoadedModel;

    if (version) {
      // Find specific version
      const match = candidates.find((m) => m.version === version);
      if (!match) {
        throw new Error(`Model version ${version} not found for policy: ${policyType}`);
      }
      model = match;
    } else {
      // Get latest (first in sorted list)
      model = candidates[0];
    }

    // Validate model integrity
    const validation = await this.validateModel(model.modelPath);
    if (!validation.valid) {
      throw new Error(
        `Model validation failed: ${validation.errors?.join(', ') ?? 'Unknown error'}`
      );
    }

    // Load weights if configured
    if (this.config.autoLoadWeights) {
      model = await this.loadWeights(model);
    }

    // Cache and return
    this.modelCache.set(cacheKey, model);
    return model;
  }

  /**
   * Get latest model for a policy type
   *
   * @param policyType - Policy type
   * @returns Latest model or null if none found
   */
  async getLatestModel(policyType: PolicyType): Promise<LoadedModel | null> {
    try {
      return await this.loadModel(policyType);
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate model integrity
   *
   * Checks:
   * - File exists and is readable
   * - Metadata is valid JSON
   * - Required fields are present
   * - Model format matches file extension
   * - File size is reasonable (not empty, not suspiciously large)
   *
   * @param modelPath - Path to model file
   * @returns Validation result with errors/warnings
   */
  async validateModel(modelPath: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file exists
    if (!existsSync(modelPath)) {
      errors.push('Model file does not exist');
      return { valid: false, errors };
    }

    // Check file is readable
    try {
      const stats = statSync(modelPath);

      // Check file size
      if (stats.size === 0) {
        errors.push('Model file is empty');
      } else if (stats.size > 1024 * 1024 * 1024) {
        // > 1GB
        warnings.push('Model file is very large (> 1GB)');
      }
    } catch (error) {
      errors.push(`Cannot read model file: ${(error as Error).message}`);
      return { valid: false, errors };
    }

    // Validate metadata
    const metadata = await this.loadMetadata(modelPath);
    if (!metadata) {
      errors.push('No metadata found for model');
      return { valid: false, errors };
    }

    // Validate required metadata fields
    if (!metadata.trainedAt) {
      errors.push('Missing trainedAt in metadata');
    }
    if (!metadata.config?.policyType) {
      errors.push('Missing policyType in metadata');
    }
    if (!metadata.config?.modelFormat) {
      errors.push('Missing modelFormat in metadata');
    }
    if (!metadata.datasetStats) {
      warnings.push('Missing dataset statistics in metadata');
    }

    // Validate format matches file extension
    const detectedFormat = this.detectModelFormat(modelPath);
    if (detectedFormat !== metadata.config.modelFormat) {
      warnings.push(
        `Model format mismatch: file is ${detectedFormat ?? 'unknown'}, metadata says ${metadata.config.modelFormat}`
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Clear model cache
   */
  clearCache(): void {
    this.modelCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.modelCache.size,
      keys: Array.from(this.modelCache.keys()),
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Detect model format from file extension
   */
  private detectModelFormat(filePath: string): ModelFormat | null {
    const ext = extname(filePath).toLowerCase();

    switch (ext) {
      case '.onnx':
        return 'onnx';
      case '.safetensors':
      case '.st':
        return 'safetensors';
      case '.json':
        return 'json';
      case '.pt':
      case '.pth':
      case '.ckpt':
        return 'checkpoint';
      default:
        return null;
    }
  }

  /**
   * Load metadata from model file or companion metadata file
   *
   * Tries:
   * 1. <model>.metadata.json (companion file)
   * 2. Embedded metadata (for JSON models)
   */
  private async loadMetadata(modelPath: string): Promise<ModelMetadata | null> {
    // Try companion metadata file first
    const metadataPath = modelPath.replace(/\.(onnx|safetensors|st|json|pt|pth|ckpt)$/, '.metadata.json');

    if (existsSync(metadataPath)) {
      try {
        const content = readFileSync(metadataPath, 'utf-8');
        return JSON.parse(content) as ModelMetadata;
      } catch (error) {
        console.warn(`Failed to parse metadata file ${metadataPath}:`, error);
      }
    }

    // For JSON models, try embedded metadata
    if (modelPath.endsWith('.json')) {
      try {
        const content = readFileSync(modelPath, 'utf-8');
        const data = JSON.parse(content) as { metadata?: ModelMetadata };
        if (data.metadata) {
          return data.metadata;
        }
      } catch (error) {
        console.warn(`Failed to parse JSON model ${modelPath}:`, error);
      }
    }

    return null;
  }

  /**
   * Extract version from filename or metadata
   *
   * Formats:
   * - extraction-v1.2.3.onnx
   * - extraction-20240101-120000.onnx
   * - extraction-latest.onnx
   */
  private extractVersion(filename: string, metadata: ModelMetadata): string {
    // Try to extract from filename
    const versionMatch = filename.match(/v?(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      return versionMatch[1];
    }

    const dateMatch = filename.match(/(\d{8}-\d{6})/);
    if (dateMatch) {
      return dateMatch[1];
    }

    // Fall back to metadata version or trained date
    return metadata.config.version ?? metadata.trainedAt;
  }

  /**
   * Load model weights (format-dependent)
   *
   * @param model - Model to load weights for
   * @returns Model with loaded weights
   */
  private async loadWeights(model: LoadedModel): Promise<LoadedModel> {
    // For now, just return the model without weights
    // In the future, this would use format-specific loaders:
    // - ONNX: onnxruntime
    // - SafeTensors: safetensors loader
    // - JSON: parse JSON
    // - Checkpoint: PyTorch loader (via Python bridge)

    return {
      ...model,
      weights: undefined, // Placeholder for future implementation
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a model loader instance
 *
 * @param config - Loader configuration
 * @returns ModelLoader instance
 */
export function createModelLoader(config: ModelLoaderConfig): ModelLoader {
  return new ModelLoader(config);
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get default models directory
 *
 * Uses environment variable or falls back to ./models
 */
export function getDefaultModelsDir(): string {
  return process.env['RL_MODELS_DIR'] ?? join(process.cwd(), 'models');
}

/**
 * Format model info as human-readable string
 */
export function formatModelInfo(model: LoadedModel): string {
  const lines: string[] = [];

  lines.push(`Model: ${model.policyType} (v${model.version})`);
  lines.push(`Format: ${model.modelFormat}`);
  lines.push(`Path: ${model.modelPath}`);
  lines.push('');

  lines.push('Training Info:');
  lines.push(`  Trained: ${new Date(model.metadata.trainedAt).toLocaleString()}`);
  lines.push(`  Examples: ${model.metadata.datasetStats.trainExamples} train, ${model.metadata.datasetStats.evalExamples} eval`);
  lines.push(
    `  Date Range: ${model.metadata.datasetStats.dateRange.start} to ${model.metadata.datasetStats.dateRange.end}`
  );

  if (model.metadata.performance) {
    lines.push('');
    lines.push('Performance:');
    lines.push(`  Accuracy: ${(model.metadata.performance.accuracy * 100).toFixed(2)}%`);
    lines.push(`  Avg Reward: ${model.metadata.performance.avgReward.toFixed(4)}`);
    lines.push(`  F1 Score: ${(model.metadata.performance.f1Score * 100).toFixed(2)}%`);
  }

  return lines.join('\n');
}
