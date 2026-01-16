/**
 * LLM-Powered Chunking Service
 *
 * Uses a local LLM (via LM Studio) to intelligently chunk text
 * with semantic understanding of boundaries, relations, and dependencies.
 *
 * NOTE: Non-null assertions used for array indexing after validation
 * in chunk processing operations.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { v4 as uuid } from 'uuid';
import type { LMStudioClient } from '../lm-studio/client.js';
import { createLMStudioClient } from '../lm-studio/client.js';
import type { LMStudioConfig } from '../lm-studio/types.js';
import { createComponentLogger } from '../../utils/logger.js';
import {
  CHARS_PER_TOKEN,
  type Chunk,
  type ChunkingResult,
  type ChunkingStats,
  type ChunkRelation,
  type ChunkRelationType,
  type ContentType,
} from './types.js';

const logger = createComponentLogger('llm-chunker');

/**
 * Configuration for LLM-powered chunking
 */
export interface LLMChunkingConfig {
  /** LM Studio configuration */
  lmStudioConfig?: Partial<LMStudioConfig>;
  /** Target chunk size in tokens */
  targetTokens: number;
  /** Maximum chunk size in tokens */
  maxTokens: number;
  /** Whether to extract relations between chunks */
  extractRelations: boolean;
  /** Whether to detect dependencies */
  detectDependencies: boolean;
  /** Temperature for LLM calls */
  temperature: number;
}

/**
 * Default LLM chunking configuration
 */
export const DEFAULT_LLM_CHUNKING_CONFIG: LLMChunkingConfig = {
  targetTokens: 500,
  maxTokens: 1000,
  extractRelations: true,
  detectDependencies: true,
  temperature: 0.3,
};

/**
 * LLM response for chunk boundaries
 */
interface ChunkBoundaryResponse {
  chunks: Array<{
    start_line: number;
    end_line: number;
    title: string;
    summary: string;
    content_type: string;
  }>;
}

/**
 * LLM response for relations
 */
interface ChunkRelationResponse {
  relations: Array<{
    source_index: number;
    target_index: number;
    type: string;
    reason: string;
    confidence: number;
  }>;
}

/**
 * LLM response for metadata extraction
 */
interface ChunkMetadataResponse {
  language?: string;
  keywords: string[];
  entities: string[];
  imports?: string[];
  exports?: string[];
  definitions?: string[];
  references?: string[];
}

/**
 * LLM-powered chunking service
 */
export class LLMChunkingService {
  private client: LMStudioClient;
  private config: LLMChunkingConfig;

  constructor(config: Partial<LLMChunkingConfig> = {}) {
    this.config = { ...DEFAULT_LLM_CHUNKING_CONFIG, ...config };
    this.client = createLMStudioClient(this.config.lmStudioConfig);
  }

  /**
   * Get the LM Studio client
   */
  getLMStudioClient(): LMStudioClient {
    return this.client;
  }

  /**
   * Chunk a document using LLM
   */
  async chunk(text: string, sourceId?: string): Promise<ChunkingResult> {
    const startTime = Date.now();
    const docSourceId = sourceId ?? uuid();
    const lines = text.split('\n');

    // Step 1: Detect content type
    const contentType = await this.detectContentType(text);

    // Step 2: Find chunk boundaries using LLM
    const boundaryResponse = await this.findChunkBoundaries(text, lines, contentType);

    // Step 3: Create chunks from boundaries
    const chunks = this.createChunksFromBoundaries(
      boundaryResponse,
      lines,
      text,
      docSourceId,
      contentType
    );

    // Step 4: Extract metadata for each chunk
    await this.enrichChunkMetadata(chunks);

    // Step 5: Extract relations if enabled
    let relations: ChunkRelation[] = [];
    if (this.config.extractRelations || this.config.detectDependencies) {
      relations = await this.extractRelations(chunks);
    }

    // Calculate stats
    const stats = this.calculateStats(chunks, relations, startTime);

    return {
      chunks,
      relations,
      sourceId: docSourceId,
      originalLength: text.length,
      contentType,
      strategy: 'semantic',
      stats,
    };
  }

  /**
   * Detect content type using LLM
   */
  private async detectContentType(text: string): Promise<ContentType> {
    const sample = text.slice(0, 1000);

    const prompt = `Analyze this text and determine its type. Respond with ONLY one word from: code, markdown, conversation, structured, text

Text:
\`\`\`
${sample}
\`\`\`

Type:`;

    try {
      const response = await this.client.chat([{ role: 'user', content: prompt }], {
        temperature: 0.1,
        maxTokens: 10,
      });

      const type = response.content.trim().toLowerCase();
      if (['code', 'markdown', 'conversation', 'structured', 'text'].includes(type)) {
        return type as ContentType;
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to detect content type via LLM');
    }

    return 'text';
  }

  /**
   * Find chunk boundaries using LLM
   */
  private async findChunkBoundaries(
    _text: string,
    lines: string[],
    contentType: ContentType
  ): Promise<ChunkBoundaryResponse> {
    // Add line numbers for reference
    const numberedText = lines.map((line, i) => `${i + 1}: ${line}`).join('\n');

    const prompt = `You are a document chunking assistant. Analyze this ${contentType} document and identify logical chunk boundaries.

Target chunk size: ~${this.config.targetTokens} tokens (roughly ${this.config.targetTokens * 4} characters)
Maximum chunk size: ${this.config.maxTokens} tokens

Rules:
1. Each chunk should be a semantically complete unit (function, class, section, topic)
2. Don't split in the middle of code blocks, paragraphs, or logical units
3. Include context headers/imports with their related code when possible
4. For code: keep class/function definitions together with their docstrings
5. For markdown: keep sections with their content
6. Provide a brief title and summary for each chunk

Document (with line numbers):
\`\`\`
${numberedText.slice(0, 8000)}
\`\`\`

Respond with JSON only:
{
  "chunks": [
    {
      "start_line": 1,
      "end_line": 25,
      "title": "Brief title",
      "summary": "What this chunk contains",
      "content_type": "code|text|heading|etc"
    }
  ]
}`;

    try {
      const response = await this.client.chat([{ role: 'user', content: prompt }], {
        temperature: this.config.temperature,
        maxTokens: 2000,
      });

      // Extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ChunkBoundaryResponse;
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to find chunk boundaries via LLM');
    }

    // Fallback: simple line-based chunking
    return this.fallbackChunking(lines);
  }

  /**
   * Fallback chunking when LLM fails
   */
  private fallbackChunking(lines: string[]): ChunkBoundaryResponse {
    const chunks: ChunkBoundaryResponse['chunks'] = [];
    const targetLines = Math.ceil(this.config.targetTokens / 10); // ~10 tokens per line estimate

    for (let i = 0; i < lines.length; i += targetLines) {
      const endLine = Math.min(i + targetLines, lines.length);
      chunks.push({
        start_line: i + 1,
        end_line: endLine,
        title: `Chunk ${chunks.length + 1}`,
        summary: 'Auto-generated chunk',
        content_type: 'text',
      });
    }

    return { chunks };
  }

  /**
   * Create Chunk objects from boundary response
   */
  private createChunksFromBoundaries(
    response: ChunkBoundaryResponse,
    lines: string[],
    _originalText: string,
    sourceId: string,
    contentType: ContentType
  ): Chunk[] {
    const chunks: Chunk[] = [];

    for (let i = 0; i < response.chunks.length; i++) {
      const boundary = response.chunks[i]!;
      const startIdx = Math.max(0, boundary.start_line - 1);
      const endIdx = Math.min(lines.length, boundary.end_line);

      const content = lines.slice(startIdx, endIdx).join('\n');
      const startOffset = lines.slice(0, startIdx).join('\n').length + (startIdx > 0 ? 1 : 0);

      chunks.push({
        id: uuid(),
        content,
        startOffset,
        endOffset: startOffset + content.length,
        index: i,
        totalChunks: response.chunks.length,
        sourceId,
        level: 0,
        tokenEstimate: Math.ceil(content.length / CHARS_PER_TOKEN),
        contentType,
        overlapPrevious: 0,
        overlapNext: 0,
        metadata: {
          title: boundary.title,
          keywords: [],
          custom: {
            summary: boundary.summary,
            chunkContentType: boundary.content_type,
          },
        },
      });
    }

    return chunks;
  }

  /**
   * Enrich chunk metadata using LLM
   */
  private async enrichChunkMetadata(chunks: Chunk[]): Promise<void> {
    // Process chunks in parallel with concurrency limit
    const concurrency = 3;
    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency);
      await Promise.all(batch.map((chunk) => this.extractChunkMetadata(chunk)));
    }
  }

  /**
   * Extract metadata for a single chunk
   */
  private async extractChunkMetadata(chunk: Chunk): Promise<void> {
    const prompt = `Analyze this code/text chunk and extract metadata.

Chunk:
\`\`\`
${chunk.content.slice(0, 2000)}
\`\`\`

Respond with JSON only:
{
  "language": "typescript|python|go|etc or null",
  "keywords": ["key", "terms"],
  "entities": ["names", "identifiers"],
  "imports": ["imported modules/packages"],
  "exports": ["exported names"],
  "definitions": ["function/class/type names defined"],
  "references": ["external references"]
}`;

    try {
      const response = await this.client.chat([{ role: 'user', content: prompt }], {
        temperature: 0.1,
        maxTokens: 500,
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const metadata = JSON.parse(jsonMatch[0]) as ChunkMetadataResponse;
        chunk.metadata = {
          ...chunk.metadata,
          language: metadata.language ?? undefined,
          keywords: metadata.keywords || [],
          entities: metadata.entities || [],
          imports: metadata.imports || [],
          exports: metadata.exports || [],
          definitions: metadata.definitions || [],
          references: metadata.references || [],
        };
      }
    } catch (error) {
      // Keep existing metadata on error
      logger.warn({ error, chunkIndex: chunk.index }, 'Failed to extract metadata for chunk');
    }
  }

  /**
   * Extract relations between chunks using LLM
   */
  private async extractRelations(chunks: Chunk[]): Promise<ChunkRelation[]> {
    if (chunks.length < 2) return [];

    // Build chunk summary for context
    const chunkSummaries = chunks.map((c, i) => ({
      index: i,
      title: c.metadata.title || `Chunk ${i}`,
      definitions: c.metadata.definitions || [],
      imports: c.metadata.imports || [],
      exports: c.metadata.exports || [],
    }));

    const prompt = `Analyze the relationships between these document chunks.

Chunks:
${JSON.stringify(chunkSummaries, null, 2)}

Identify relationships:
- depends_on: chunk A uses/imports something defined in chunk B
- references: chunk A mentions/references content from chunk B
- related_to: chunks share common topics/concepts

Respond with JSON only:
{
  "relations": [
    {
      "source_index": 0,
      "target_index": 1,
      "type": "depends_on|references|related_to",
      "reason": "brief explanation",
      "confidence": 0.8
    }
  ]
}`;

    try {
      const response = await this.client.chat([{ role: 'user', content: prompt }], {
        temperature: 0.2,
        maxTokens: 1000,
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const relResponse = JSON.parse(jsonMatch[0]) as ChunkRelationResponse;
        return this.convertRelations(relResponse, chunks);
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to extract relations via LLM');
    }

    // Fallback: sequential relations only
    return this.extractSequentialRelations(chunks);
  }

  /**
   * Convert LLM relation response to ChunkRelation objects
   */
  private convertRelations(response: ChunkRelationResponse, chunks: Chunk[]): ChunkRelation[] {
    const relations: ChunkRelation[] = [];

    // Add sequential relations
    relations.push(...this.extractSequentialRelations(chunks));

    // Add LLM-detected relations
    for (const rel of response.relations) {
      const source = chunks[rel.source_index];
      const target = chunks[rel.target_index];

      if (!source || !target) continue;

      const type = this.mapRelationType(rel.type);
      if (!type) continue;

      relations.push({
        sourceId: source.id,
        targetId: target.id,
        type,
        confidence: rel.confidence,
        metadata: { reason: rel.reason },
      });
    }

    return relations;
  }

  /**
   * Map string relation type to ChunkRelationType
   */
  private mapRelationType(type: string): ChunkRelationType | null {
    const typeMap: Record<string, ChunkRelationType> = {
      depends_on: 'depends_on',
      references: 'references',
      related_to: 'related_to',
      parent_of: 'parent_of',
      child_of: 'child_of',
    };
    return typeMap[type.toLowerCase()] ?? null;
  }

  /**
   * Extract sequential relations
   */
  private extractSequentialRelations(chunks: Chunk[]): ChunkRelation[] {
    const relations: ChunkRelation[] = [];

    for (let i = 0; i < chunks.length - 1; i++) {
      const current = chunks[i]!;
      const next = chunks[i + 1]!;

      relations.push({
        sourceId: current.id,
        targetId: next.id,
        type: 'precedes',
        confidence: 1.0,
      });

      relations.push({
        sourceId: next.id,
        targetId: current.id,
        type: 'follows',
        confidence: 1.0,
      });
    }

    return relations;
  }

  /**
   * Calculate chunking statistics
   */
  private calculateStats(
    chunks: Chunk[],
    relations: ChunkRelation[],
    startTime: number
  ): ChunkingStats {
    const sizes = chunks.map((c) => c.content.length);

    return {
      totalChunks: chunks.length,
      avgChunkSize:
        sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0,
      minChunkSize: sizes.length > 0 ? Math.min(...sizes) : 0,
      maxChunkSize: sizes.length > 0 ? Math.max(...sizes) : 0,
      totalRelations: relations.length,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get chunks that a given chunk depends on
   */
  getDependencies(result: ChunkingResult, chunkId: string): Chunk[] {
    const depIds = result.relations
      .filter((r) => r.sourceId === chunkId && r.type === 'depends_on')
      .map((r) => r.targetId);

    return result.chunks.filter((c) => depIds.includes(c.id));
  }

  /**
   * Get chunks that depend on a given chunk
   */
  getDependents(result: ChunkingResult, chunkId: string): Chunk[] {
    const depIds = result.relations
      .filter((r) => r.targetId === chunkId && r.type === 'depends_on')
      .map((r) => r.sourceId);

    return result.chunks.filter((c) => depIds.includes(c.id));
  }
}

/**
 * Create an LLM-powered chunking service
 */
export function createLLMChunkingService(config?: Partial<LLMChunkingConfig>): LLMChunkingService {
  return new LLMChunkingService(config);
}
