/**
 * Missed Extraction Module Types
 *
 * Type definitions for the missed extraction detector that analyzes
 * conversation transcripts to find facts, bugs, decisions that weren't
 * captured during the session.
 */

import type { ScopeType } from '../../../db/schema.js';

/**
 * Conversation message format for extraction analysis
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  toolsUsed?: string[];
}

/**
 * Configuration for the missed extraction detector
 */
export interface MissedExtractionConfig {
  /** Enable missed extraction detection */
  enabled: boolean;
  /** Minimum confidence threshold for extracted entries (default: 0.7) */
  confidenceThreshold: number;
  /** Minimum similarity threshold to consider as duplicate (default: 0.85) */
  duplicateSimilarityThreshold: number;
  /** Minimum messages required to run extraction (default: 3) */
  minMessages: number;
  /** Maximum entries to extract per session (default: 20) */
  maxEntries: number;
  /** Focus areas for extraction */
  focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools' | 'bugs')[];
}

/**
 * Default configuration for missed extraction
 */
export const DEFAULT_MISSED_EXTRACTION_CONFIG: MissedExtractionConfig = {
  enabled: true,
  confidenceThreshold: 0.7,
  duplicateSimilarityThreshold: 0.85,
  minMessages: 3,
  maxEntries: 20,
  focusAreas: ['decisions', 'facts', 'rules', 'bugs'],
};

/**
 * Request to detect missed extractions
 */
export interface MissedExtractionRequest {
  /** Session ID being analyzed */
  sessionId: string;
  /** Project ID for scoping */
  projectId?: string;
  /** Conversation messages to analyze */
  messages: ConversationMessage[];
  /** Scope type for duplicate checking */
  scopeType: ScopeType;
  /** Scope ID for duplicate checking */
  scopeId?: string;
  /** Agent ID for attribution */
  agentId?: string;
}

/**
 * A missed entry that should be stored
 */
export interface MissedEntry {
  /** Entry type */
  type: 'knowledge' | 'guideline' | 'tool';
  /** Entry name/title */
  name: string;
  /** Entry content */
  content: string;
  /** Category (e.g., 'decision', 'fact', 'bug', 'code_style') */
  category: string;
  /** Confidence score from extraction */
  confidence: number;
  /** Priority (for guidelines) */
  priority?: number;
  /** Rationale for extraction */
  rationale?: string;
  /** Suggested tags */
  suggestedTags?: string[];
  /** Source message indices that contributed to this entry */
  sourceMessageIndices?: number[];
}

/**
 * Result from missed extraction detection
 */
export interface MissedExtractionResult {
  /** Whether detection completed successfully */
  success: boolean;
  /** Session ID analyzed */
  sessionId: string;
  /** Entries that should be stored (not duplicates, above threshold) */
  missedEntries: MissedEntry[];
  /** Total entries extracted by LLM */
  totalExtracted: number;
  /** Entries filtered as duplicates */
  duplicatesFiltered: number;
  /** Entries below confidence threshold */
  belowThresholdCount: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Reason for skipping (if applicable) */
  skippedReason?: 'no_messages' | 'below_min_messages' | 'extraction_disabled';
  /** Error message if failed */
  error?: string;
}

/**
 * Extracted entry from LLM (matches IExtractionService.extract response)
 */
export interface ExtractedEntry {
  type: 'knowledge' | 'guideline' | 'tool';
  name?: string;
  title?: string;
  content: string;
  confidence: number;
  // Extended fields (may or may not be present depending on provider)
  category?: string;
  priority?: number;
  rationale?: string;
  suggestedTags?: string[];
}

/**
 * Extraction service interface (matches IExtractionService from context.ts)
 */
export interface ExtractionServiceDeps {
  isAvailable(): boolean;
  getProvider(): string;
  extract(input: {
    context: string;
    contextType?: 'conversation' | 'code' | 'mixed';
    focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools')[];
  }): Promise<{
    entries: ExtractedEntry[];
    entities?: unknown[];
    relationships?: unknown[];
    model: string;
    provider: string;
    tokensUsed?: number;
    processingTimeMs: number;
  }>;
}

/**
 * Repository list filter (common pattern across repos)
 */
export interface ListFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  includeInactive?: boolean;
  inherit?: boolean;
}

/**
 * Knowledge repository interface (minimal subset for duplicate checking)
 */
export interface KnowledgeRepoDeps {
  list(
    filter?: ListFilter,
    options?: { limit?: number; offset?: number }
  ): Promise<Array<{ id: string; content?: string; title?: string }>>;
}

/**
 * Guideline repository interface (minimal subset for duplicate checking)
 */
export interface GuidelineRepoDeps {
  list(
    filter?: ListFilter,
    options?: { limit?: number; offset?: number }
  ): Promise<Array<{ id: string; content?: string; name?: string }>>;
}

/**
 * Tool repository interface (minimal subset for duplicate checking)
 */
export interface ToolRepoDeps {
  list(
    filter?: ListFilter,
    options?: { limit?: number; offset?: number }
  ): Promise<Array<{ id: string; description?: string; name?: string }>>;
}

/**
 * Embedding service interface (matches IEmbeddingService from context.ts)
 */
export interface EmbeddingServiceDeps {
  isAvailable(): boolean;
  embed(text: string): Promise<{ embedding: number[]; model: string; provider: string }>;
}

/**
 * Dependencies for the MissedExtractionDetector
 *
 * Uses minimal interfaces that match the actual service implementations
 * from context.ts and memory-entries.ts repositories.
 */
export interface MissedExtractionDetectorDeps {
  /** Extraction service for LLM-based extraction */
  extractionService: ExtractionServiceDeps;
  /** Knowledge repository for duplicate checking */
  knowledgeRepo: KnowledgeRepoDeps;
  /** Guideline repository for duplicate checking */
  guidelineRepo: GuidelineRepoDeps;
  /** Tool repository for duplicate checking */
  toolRepo: ToolRepoDeps;
  /** Optional embedding service for semantic duplicate detection */
  embeddingService?: EmbeddingServiceDeps;
  /** Configuration overrides */
  config?: Partial<MissedExtractionConfig>;
}
