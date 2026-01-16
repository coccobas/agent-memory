/**
 * Common types for extraction providers
 */

export type ExtractionProvider = 'openai' | 'anthropic' | 'ollama' | 'disabled';

export interface ExtractedEntry {
  type: 'guideline' | 'knowledge' | 'tool';
  name?: string; // For tools/guidelines
  title?: string; // For knowledge
  content: string;
  category?: string;
  priority?: number; // For guidelines (0-100)
  confidence: number; // 0-1
  rationale?: string; // Why this was extracted
  suggestedTags?: string[];
}

export type EntityType = 'person' | 'technology' | 'component' | 'concept' | 'organization';

export interface ExtractedEntity {
  name: string;
  entityType: EntityType;
  description?: string;
  confidence: number; // 0-1
}

export type ExtractedRelationType = 'depends_on' | 'related_to' | 'applies_to' | 'conflicts_with';

export interface ExtractedRelationship {
  sourceRef: string; // Name reference to extracted entry/entity
  sourceType: 'guideline' | 'knowledge' | 'tool' | 'entity';
  targetRef: string;
  targetType: 'guideline' | 'knowledge' | 'tool' | 'entity';
  relationType: ExtractedRelationType;
  confidence: number; // 0-1
}

export interface ExtractionResult {
  entries: ExtractedEntry[];
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  model: string;
  provider: ExtractionProvider;
  tokensUsed?: number;
  processingTimeMs: number;
  /** Indicates if result is partial due to error during extraction */
  partial?: boolean;
  /** Error message if partial result */
  partialError?: string;
}

export interface ExtractionInput {
  context: string; // Raw conversation/code context
  contextType?: 'conversation' | 'code' | 'mixed';
  /** Enable partial retry with reduced context on failure */
  enablePartialRetry?: boolean;
  focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools')[];
  existingSummary?: string; // Previous context for continuity
  scopeHint?: {
    // Scope context for better extraction
    projectName?: string;
    language?: string;
    domain?: string;
  };
}

/**
 * Input for text generation (distinct from structured extraction)
 * Used by HyDE and other services that need raw text generation
 */
export interface GenerationInput {
  systemPrompt: string;
  userPrompt: string;
  count?: number; // 1-5 variations (default: 1)
  temperature?: number; // 0-2 (default: 0.7)
  maxTokens?: number; // Max tokens per generation (default: 512)
}

/**
 * Result from text generation
 */
export interface GenerationResult {
  texts: string[];
  model: string;
  provider: ExtractionProvider;
  tokensUsed?: number;
  processingTimeMs: number;
}

/**
 * Interface for extraction providers
 */
export interface IExtractionProvider {
  /**
   * Extract structured memory entries from context
   */
  extract(input: ExtractionInput): Promise<ExtractionResult>;

  /**
   * Generate raw text (for HyDE, etc.)
   */
  generate(input: GenerationInput): Promise<GenerationResult>;

  /**
   * Get provider name
   */
  getProvider(): ExtractionProvider;

  /**
   * Get model name
   */
  getModel(): string;
}
