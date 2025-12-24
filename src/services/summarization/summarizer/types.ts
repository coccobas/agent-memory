/**
 * Summarizer Types
 *
 * Type definitions for hierarchical memory summarization with level-aware prompts.
 */

// =============================================================================
// HIERARCHY LEVELS
// =============================================================================

/**
 * Hierarchy levels for summarization
 *
 * - Level 0 (chunk): Individual memory entries
 * - Level 1 (topic): Related entries grouped by topic/theme
 * - Level 2 (domain): Topics grouped by domain/category
 * - Level 3 (global): Domain summaries combined into executive summary
 */
export type HierarchyLevel = 0 | 1 | 2 | 3;

/**
 * Human-readable level names
 */
export const HIERARCHY_LEVEL_NAMES: Record<HierarchyLevel, string> = {
  0: 'chunk',
  1: 'topic',
  2: 'domain',
  3: 'global',
} as const;

// =============================================================================
// SUMMARIZATION REQUEST
// =============================================================================

/**
 * Item to be summarized
 */
export interface SummarizationItem {
  /** Unique identifier */
  id: string;
  /** Entry type (guideline, knowledge, tool, etc.) */
  type: string;
  /** Item title */
  title: string;
  /** Item content */
  content: string;
  /** Optional metadata for context */
  metadata?: {
    category?: string;
    tags?: string[];
    confidence?: number;
    createdAt?: Date;
    /** Key terms from previous summarization (for hierarchical levels) */
    keyTerms?: string[];
  };
}

/**
 * Request for summarization
 */
export interface SummarizationRequest {
  /** Items to summarize */
  items: SummarizationItem[];
  /** Current hierarchy level */
  hierarchyLevel: HierarchyLevel;
  /** Optional scope context for better summarization */
  scopeContext?: string;
  /** Optional parent summary for context continuity */
  parentSummary?: string;
  /** Optional focus areas */
  focusAreas?: string[];
}

// =============================================================================
// SUMMARIZATION RESULT
// =============================================================================

/**
 * Result of summarization
 */
export interface SummarizationResult {
  /** Generated summary title */
  title: string;
  /** Summary content */
  content: string;
  /** Extracted key terms/concepts */
  keyTerms: string[];
  /** Confidence score (0-1) */
  confidence: number;
  /** Model used for generation */
  model?: string;
  /** Provider used */
  provider?: LLMProvider;
  /** Processing time in milliseconds */
  processingTimeMs?: number;
}

/**
 * Batch summarization result
 */
export interface BatchSummarizationResult {
  /** Individual results */
  results: SummarizationResult[];
  /** Total processing time */
  totalProcessingTimeMs: number;
  /** Provider used */
  provider: LLMProvider;
  /** Model used */
  model: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * LLM provider for summarization
 */
export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'disabled';

/**
 * Summarizer configuration
 */
export interface SummarizerConfig {
  /** LLM provider */
  provider: LLMProvider;
  /** Model override (optional, uses provider default if not set) */
  model?: string;
  /** API key for OpenAI (required if provider is 'openai') */
  openaiApiKey?: string;
  /** API key for Anthropic (required if provider is 'anthropic') */
  anthropicApiKey?: string;
  /** Base URL for Ollama (defaults to http://localhost:11434) */
  ollamaBaseUrl?: string;
  /** Base URL for OpenAI-compatible endpoints */
  openaiBaseUrl?: string;
  /** Maximum tokens per summary */
  maxTokens?: number;
  /** Temperature for generation (0-1, lower is more focused) */
  temperature?: number;
  /** Enable batch processing optimizations */
  enableBatching?: boolean;
}

/**
 * Default summarizer configuration
 */
export const DEFAULT_SUMMARIZER_CONFIG: Required<
  Omit<SummarizerConfig, 'openaiApiKey' | 'anthropicApiKey' | 'openaiBaseUrl'>
> = {
  provider: 'disabled',
  model: undefined as unknown as string, // Will be set based on provider
  ollamaBaseUrl: 'http://localhost:11434',
  maxTokens: 1024,
  temperature: 0.3,
  enableBatching: true,
};

// =============================================================================
// PROMPT TEMPLATES
// =============================================================================

/**
 * Level-specific prompt configuration
 */
export interface LevelPromptConfig {
  /** System prompt for the level */
  systemPrompt: string;
  /** User prompt template */
  userPromptTemplate: string;
  /** Focus instructions */
  focusInstructions: string;
  /** Expected output format */
  outputFormat: string;
}

/**
 * Prompt variables for template interpolation
 */
export interface PromptVariables {
  /** Items being summarized */
  items: SummarizationItem[];
  /** Scope context */
  scopeContext?: string;
  /** Parent summary */
  parentSummary?: string;
  /** Focus areas */
  focusAreas?: string[];
  /** Item count */
  itemCount: number;
  /** Hierarchy level name */
  levelName: string;
}
