/**
 * Chunking System Types
 *
 * Types for text chunking with relation and dependency tracking
 */

/**
 * Chunk relation types
 */
export type ChunkRelationType =
  | 'parent_of' // This chunk contains the target chunk
  | 'child_of' // This chunk is contained within target
  | 'follows' // This chunk comes after target (sequential)
  | 'precedes' // This chunk comes before target (sequential)
  | 'references' // This chunk references content in target
  | 'depends_on' // This chunk depends on target (e.g., imports, definitions)
  | 'related_to'; // General semantic relationship

/**
 * A relation between two chunks
 */
export interface ChunkRelation {
  /** Source chunk ID */
  sourceId: string;
  /** Target chunk ID */
  targetId: string;
  /** Type of relation */
  type: ChunkRelationType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Optional metadata about the relation */
  metadata?: Record<string, unknown>;
}

/**
 * Content type hints for chunking strategy
 */
export type ContentType =
  | 'text' // Plain text / prose
  | 'markdown' // Markdown document
  | 'code' // Source code
  | 'conversation' // Chat/conversation transcript
  | 'structured'; // JSON, YAML, etc.

/**
 * A single chunk of content
 */
export interface Chunk {
  /** Unique chunk identifier */
  id: string;
  /** The chunk content */
  content: string;
  /** Start position in original document (characters) */
  startOffset: number;
  /** End position in original document (characters) */
  endOffset: number;
  /** Chunk index in sequence */
  index: number;
  /** Total chunks in the document */
  totalChunks: number;
  /** Parent document/source identifier */
  sourceId: string;
  /** Hierarchy level (0 = top-level, higher = nested) */
  level: number;
  /** Token count estimate */
  tokenEstimate: number;
  /** Content type */
  contentType: ContentType;
  /** Overlap with previous chunk (characters) */
  overlapPrevious: number;
  /** Overlap with next chunk (characters) */
  overlapNext: number;
  /** Extracted metadata */
  metadata: ChunkMetadata;
}

/**
 * Metadata extracted from chunk content
 */
export interface ChunkMetadata {
  /** Detected language (for code) */
  language?: string;
  /** Section/heading title */
  title?: string;
  /** Extracted keywords */
  keywords?: string[];
  /** Detected entities (names, identifiers) */
  entities?: string[];
  /** Code imports/requires */
  imports?: string[];
  /** Code exports/definitions */
  exports?: string[];
  /** Function/class definitions */
  definitions?: string[];
  /** References to other chunks/sections */
  references?: string[];
  /** Custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * Result of chunking a document
 */
export interface ChunkingResult {
  /** All chunks */
  chunks: Chunk[];
  /** Relations between chunks */
  relations: ChunkRelation[];
  /** Source document ID */
  sourceId: string;
  /** Original document length */
  originalLength: number;
  /** Content type detected/used */
  contentType: ContentType;
  /** Chunking strategy used */
  strategy: ChunkingStrategy;
  /** Processing statistics */
  stats: ChunkingStats;
}

/**
 * Chunking statistics
 */
export interface ChunkingStats {
  /** Total chunks created */
  totalChunks: number;
  /** Average chunk size (characters) */
  avgChunkSize: number;
  /** Min chunk size */
  minChunkSize: number;
  /** Max chunk size */
  maxChunkSize: number;
  /** Total relations detected */
  totalRelations: number;
  /** Processing time (ms) */
  processingTimeMs: number;
}

/**
 * Chunking strategy
 */
export type ChunkingStrategy =
  | 'fixed' // Fixed size chunks
  | 'sentence' // Sentence boundaries
  | 'paragraph' // Paragraph boundaries
  | 'semantic' // Semantic boundaries (sections, topics)
  | 'code' // Code-aware (functions, classes)
  | 'hybrid'; // Combination of strategies

/**
 * Configuration for chunking
 */
export interface ChunkingConfig {
  /** Target chunk size (characters) */
  targetSize: number;
  /** Maximum chunk size (hard limit) */
  maxSize: number;
  /** Minimum chunk size */
  minSize: number;
  /** Overlap size between chunks */
  overlap: number;
  /** Chunking strategy */
  strategy: ChunkingStrategy;
  /** Content type (auto-detect if not specified) */
  contentType?: ContentType;
  /** Extract relations between chunks */
  extractRelations: boolean;
  /** Detect dependencies (imports, definitions) */
  detectDependencies: boolean;
  /** Preserve sentence boundaries */
  preserveSentences: boolean;
  /** Preserve paragraph boundaries */
  preserveParagraphs: boolean;
  /** Custom section delimiters */
  sectionDelimiters?: RegExp[];
}

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  targetSize: 1000,
  maxSize: 2000,
  minSize: 100,
  overlap: 100,
  strategy: 'semantic',
  extractRelations: true,
  detectDependencies: true,
  preserveSentences: true,
  preserveParagraphs: true,
};

/**
 * Tokens per character estimate (rough average)
 */
export const CHARS_PER_TOKEN = 4;
