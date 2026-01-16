/**
 * LoRA Training Export Types
 *
 * Type definitions for exporting training data in LoRA-compatible formats.
 * Supports both RL policy training and guideline-based fine-tuning.
 */

import type { ScopeType } from '../../../db/schema.js';

// =============================================================================
// LORA EXPORT CONFIGURATION
// =============================================================================

/**
 * Supported LoRA export formats
 */
export type LoRAFormat = 'alpaca' | 'sharegpt' | 'openai-messages' | 'anthropic-prompts';

/**
 * LoRA export configuration (for RL policy exports)
 */
export interface LoRAExportConfig {
  /** Output format */
  format: LoRAFormat;

  /** Output directory path */
  outputPath: string;

  /** Policy type to export (optional) */
  policy?: 'extraction' | 'retrieval' | 'consolidation';

  /** Train/eval split ratio (default: 0.1 for 90/10) */
  splitRatio?: number;

  /** Include system prompt with guideline context */
  includeGuidelines?: boolean;

  /** Maximum examples to export */
  maxExamples?: number;

  /** Target model for adapter config */
  targetModel?: string;

  /** Generate training script stub */
  generateScript?: boolean;

  /** Additional metadata - flexible key-value pairs */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

// =============================================================================
// LORA EXPORT RESULT
// =============================================================================

/**
 * Result of LoRA export operation
 */
export interface LoRAExportResult {
  /** Whether export was successful */
  success: boolean;

  /** Export format used */
  format: LoRAFormat;

  /** Paths to exported files */
  files: {
    train: string;
    eval: string;
    metadata: string;
    readme: string;
    adapterConfig?: string;
    trainingScript?: string;
    datasetInfo?: string;
  };

  /** Statistics about exported data */
  stats: LoRAExportStats;

  /** Error message if export failed */
  error?: string;

  /** Warnings during export */
  warnings?: string[];
}

/**
 * Statistics about exported LoRA dataset
 */
export interface LoRAExportStats {
  /** Total number of examples */
  totalExamples: number;

  /** Number of training examples */
  trainExamples: number;

  /** Number of evaluation examples */
  evalExamples: number;

  /** File sizes in bytes */
  fileSizes: Record<string, number>;

  /** Export timestamp */
  exportedAt: string;

  /** Policy type */
  policyType: 'extraction' | 'retrieval' | 'consolidation';

  /** Estimated tokens (if calculated) */
  estimatedTokens?: number;
}

// =============================================================================
// LORA ADAPTER CONFIGURATION
// =============================================================================

/**
 * LoRA adapter configuration for PEFT library
 */
export interface LoRAAdapterConfig {
  /** LoRA rank (default: 8) */
  r: number;

  /** LoRA alpha (default: 16) */
  lora_alpha: number;

  /** Dropout probability (default: 0.05) */
  lora_dropout: number;

  /** Target modules to apply LoRA to */
  target_modules: string[];

  /** Bias type */
  bias: 'none' | 'all' | 'lora_only';

  /** Task type */
  task_type: 'CAUSAL_LM' | 'SEQ_2_SEQ_LM';

  /** Inference mode */
  inference_mode: boolean;
}

// =============================================================================
// FORMAT-SPECIFIC TYPES
// =============================================================================

/**
 * Alpaca format example
 */
export interface AlpacaExample {
  instruction: string;
  input: string;
  output: string;
}

/**
 * ShareGPT format example
 */
export interface ShareGPTExample {
  conversations: Array<{
    from: 'human' | 'gpt' | 'system';
    value: string;
  }>;
}

/**
 * OpenAI messages format example
 */
export interface OpenAIMessagesExample {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Anthropic prompts format example
 */
export interface AnthropicPromptsExample {
  prompt: string;
  completion: string;
}

// =============================================================================
// TRAINING EXAMPLE
// =============================================================================

/**
 * Generic training example that can be converted to any format
 */
export interface TrainingExample {
  /** System context/guidelines */
  system: string;

  /** User input/instruction */
  instruction: string;

  /** Additional input context (optional) */
  input?: string;

  /** Expected output/completion */
  output: string;

  /** Guideline ID (if from guideline) */
  guidelineId?: string;

  /** Whether this is a negative/contrastive example */
  isNegative?: boolean;

  /** Metadata */
  metadata?: {
    policy?: 'extraction' | 'retrieval' | 'consolidation';
    reward?: number;
    timestamp?: string;
    guidelineName?: string;
    category?: string | null;
    priority?: number;
    tags?: string[];
    // Index signature for flexible training data properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
}

// =============================================================================
// GUIDELINE-BASED TRAINING DATA
// =============================================================================

/**
 * Simplified guideline data for training generation
 */
export interface GuidelineData {
  /** Guideline ID */
  id: string;

  /** Guideline name */
  name: string;

  /** Category */
  category: string | null;

  /** Priority (0-100) */
  priority: number;

  /** Guideline content (optional, falls back to name) */
  content?: string;

  /** Rationale */
  rationale?: string | null;

  /** Examples (good/bad) */
  examples?: {
    good?: string[];
    bad?: string[];
  } | null;

  /** Tags */
  tags?: string[];

  /** Scope information */
  scopeType?: ScopeType;
  scopeId?: string | null;
}

/**
 * Filter for selecting guidelines to export
 */
export interface GuidelineFilter {
  /** Filter by category */
  category?: string;

  /** Filter by priority range */
  priority?: {
    min?: number;
    max?: number;
  };

  /** Filter by tags (any match) */
  tags?: string[];

  /** Filter by scope type */
  scopeType?: ScopeType;

  /** Filter by scope ID */
  scopeId?: string;

  /** Include only active guidelines (default: true) */
  activeOnly?: boolean;
}

/**
 * Configuration specific to guideline-based export
 */
export interface GuidelineExportConfig {
  /** Output format */
  format: LoRAFormat;

  /** Output directory path */
  outputPath: string;

  /** Filter for selecting guidelines */
  filter?: GuidelineFilter;

  /** Number of examples to generate per guideline (default: 3) */
  examplesPerGuideline?: number;

  /** Include contrastive (negative) examples (default: false) */
  includeNegative?: boolean;

  /** Train/eval split ratio (default: 0.1 for 90/10) */
  splitRatio?: number;

  /** Target model for adapter config */
  targetModel?: string;

  /** Generate training script stub */
  generateScript?: boolean;

  /** Include guideline metadata in examples */
  includeMetadata?: boolean;

  /** Random seed for reproducibility */
  seed?: number;
}

// =============================================================================
// DATASET INFO & MANIFEST
// =============================================================================

/**
 * Dataset split information
 */
export interface DatasetSplit {
  /** Number of examples in this split */
  num_examples: number;
}

/**
 * Dataset information file structure
 */
export interface DatasetInfo {
  /** Dataset name */
  dataset_name?: string;

  /** Format type */
  format?: string;

  /** Dataset description */
  description?: string;

  /** Dataset version */
  version: string;

  /** Feature definitions */
  features?: Record<string, unknown>;

  /** Split information (train/eval/test) */
  splits: {
    train: DatasetSplit;
    eval: DatasetSplit;
    test?: DatasetSplit;
  };

  /** Whether guidelines are included in examples */
  includeGuidelines?: boolean;

  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * OpenAI manifest file structure
 */
export interface OpenAIManifest extends DatasetInfo {
  /** OpenAI-specific purpose field */
  purpose?: string;

  /** Total number of examples */
  totalExamples?: number;

  /** Number of training examples */
  trainExamples?: number;

  /** Number of evaluation examples */
  evalExamples?: number;

  /** Estimated total tokens */
  estimatedTokens?: number;

  /** Creation timestamp */
  createdAt?: string;
}
