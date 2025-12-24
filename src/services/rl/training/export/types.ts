/**
 * Dataset Export Types
 *
 * Type definitions for exporting RL training datasets in multiple formats.
 */

// =============================================================================
// EXPORT FORMAT TYPES
// =============================================================================

/**
 * Supported export formats
 */
export type ExportFormat = 'huggingface' | 'openai' | 'anthropic' | 'csv' | 'jsonl';

/**
 * Policy types for dataset export
 */
export type PolicyType = 'extraction' | 'retrieval' | 'consolidation';

// =============================================================================
// EXPORT OPTIONS
// =============================================================================

/**
 * Options for exporting datasets
 */
export interface ExportOptions {
  /** Output format */
  format: ExportFormat;

  /** Output directory path */
  outputPath: string;

  /** Policy type to export */
  policy: PolicyType;

  /** Include metadata in export */
  includeMetadata?: boolean;

  /** Train/eval split ratio (0-1, default: 0.2 for 80/20 split) */
  splitRatio?: number;

  /** Include validation split */
  includeValidation?: boolean;

  /** Validation split ratio (default: 0.1) */
  validationRatio?: number;

  /** Shuffle data before splitting */
  shuffle?: boolean;

  /** Random seed for reproducibility */
  seed?: number;

  /** Maximum examples to export (for testing/sampling) */
  maxExamples?: number;

  /** Compress output files */
  compress?: boolean;
}

// =============================================================================
// EXPORT RESULT
// =============================================================================

/**
 * Result of dataset export operation
 */
export interface ExportResult {
  /** Whether export was successful */
  success: boolean;

  /** Export format used */
  format: ExportFormat;

  /** Paths to exported files */
  files: string[];

  /** Statistics about exported data */
  stats: ExportStats;

  /** Error message if export failed */
  error?: string;

  /** Warnings during export */
  warnings?: string[];
}

/**
 * Statistics about exported dataset
 */
export interface ExportStats {
  /** Total number of examples */
  totalExamples: number;

  /** Number of training examples */
  trainExamples: number;

  /** Number of evaluation examples */
  evalExamples: number;

  /** Number of validation examples (if included) */
  validationExamples?: number;

  /** File sizes in bytes */
  fileSizes?: Record<string, number>;

  /** Export timestamp */
  exportedAt: string;

  /** Policy type */
  policyType: PolicyType;
}

// =============================================================================
// FORMAT-SPECIFIC TYPES
// =============================================================================

/**
 * HuggingFace dataset configuration
 */
export interface HuggingFaceDatasetInfo {
  /** Dataset name */
  dataset_name: string;

  /** Dataset description */
  description: string;

  /** Version */
  version: string;

  /** Features schema */
  features: Record<string, any>;

  /** Splits available */
  splits: string[];

  /** Builder name */
  builder_name: string;

  /** Download size */
  download_size?: number;

  /** Dataset size */
  dataset_size?: number;
}

/**
 * OpenAI message format
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI training example
 */
export interface OpenAITrainingExample {
  messages: OpenAIMessage[];
}

/**
 * OpenAI training file metadata
 */
export interface OpenAIFileMetadata {
  purpose: 'fine-tune';
  format: 'jsonl';
  examples: number;
  tokens?: number;
  created_at: string;
}

/**
 * Anthropic training example format
 */
export interface AnthropicTrainingExample {
  /** Prompt text */
  prompt: string;

  /** Completion text */
  completion: string;

  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * CSV row format (flattened structure)
 */
export interface CSVRow {
  [key: string]: string | number | boolean;
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

/**
 * Validation result for exported data
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats?: {
    totalExamples: number;
    validExamples: number;
    invalidExamples: number;
  };
}

/**
 * Token count limits for different providers
 */
export interface TokenLimits {
  maxPromptTokens: number;
  maxCompletionTokens: number;
  maxTotalTokens: number;
}

/**
 * Format-specific validation rules
 */
export interface FormatValidationRules {
  tokenLimits?: TokenLimits;
  requiredFields?: string[];
  maxExampleSize?: number;
  allowedMessageRoles?: string[];
}
