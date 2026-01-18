/**
 * Chunking Service
 *
 * Splits text into chunks with relation and dependency tracking
 *
 * NOTE: Non-null assertions used for array indexing in chunk processing
 * after bounds checks and array iteration.
 */

import { v4 as uuid } from 'uuid';
import {
  CHARS_PER_TOKEN,
  DEFAULT_CHUNKING_CONFIG,
  type Chunk,
  type ChunkingConfig,
  type ChunkingResult,
  type ChunkingStats,
  type ChunkMetadata,
  type ChunkRelation,
  type ChunkRelationType,
  type ContentType,
} from './types.js';

/**
 * Service for chunking text with relation and dependency tracking
 */
export class ChunkingService {
  private config: ChunkingConfig;

  constructor(config: Partial<ChunkingConfig> = {}) {
    this.config = { ...DEFAULT_CHUNKING_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ChunkingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ChunkingConfig {
    return { ...this.config };
  }

  /**
   * Chunk a document
   */
  chunk(text: string, sourceId?: string, config?: Partial<ChunkingConfig>): ChunkingResult {
    const startTime = Date.now();
    const effectiveConfig = { ...this.config, ...config };
    const docSourceId = sourceId ?? uuid();

    // Detect content type if not specified
    const contentType = effectiveConfig.contentType ?? this.detectContentType(text);

    // Split into chunks based on strategy
    const chunks = this.splitIntoChunks(text, docSourceId, contentType, effectiveConfig);

    // Extract relations between chunks
    const relations: ChunkRelation[] = [];
    if (effectiveConfig.extractRelations) {
      relations.push(...this.extractSequentialRelations(chunks));
    }
    if (effectiveConfig.detectDependencies) {
      relations.push(...this.extractDependencyRelations(chunks));
    }

    // Calculate stats
    const stats = this.calculateStats(chunks, relations, startTime);

    return {
      chunks,
      relations,
      sourceId: docSourceId,
      originalLength: text.length,
      contentType,
      strategy: effectiveConfig.strategy,
      stats,
    };
  }

  /**
   * Detect content type from text
   */
  private detectContentType(text: string): ContentType {
    // Check for code patterns
    const codePatterns = [
      /^(import|export|const|let|var|function|class|interface|type)\s/m,
      /^(def|class|import|from|async)\s/m,
      /^(package|func|type|struct|import)\s/m,
      /^\s*[{}[\]];?\s*$/m,
    ];
    if (codePatterns.some((p) => p.test(text))) {
      return 'code';
    }

    // Check for markdown
    if (/^#{1,6}\s|^\*\*|^```|^\[.*\]\(.*\)/m.test(text)) {
      return 'markdown';
    }

    // Check for conversation patterns
    if (/^(user|assistant|human|ai|system):/im.test(text) || /^>\s/m.test(text)) {
      return 'conversation';
    }

    // Check for structured data
    if (/^\s*[{[]/.test(text) && /[}\]]\s*$/.test(text)) {
      return 'structured';
    }

    return 'text';
  }

  /**
   * Split text into chunks
   */
  private splitIntoChunks(
    text: string,
    sourceId: string,
    contentType: ContentType,
    config: ChunkingConfig
  ): Chunk[] {
    switch (config.strategy) {
      case 'fixed':
        return this.fixedSizeChunking(text, sourceId, contentType, config);
      case 'sentence':
        return this.sentenceChunking(text, sourceId, contentType, config);
      case 'paragraph':
        return this.paragraphChunking(text, sourceId, contentType, config);
      case 'code':
        return this.codeChunking(text, sourceId, contentType, config);
      case 'semantic':
      case 'hybrid':
      default:
        return this.semanticChunking(text, sourceId, contentType, config);
    }
  }

  /**
   * Fixed size chunking
   */
  private fixedSizeChunking(
    text: string,
    sourceId: string,
    contentType: ContentType,
    config: ChunkingConfig
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let position = 0;
    let index = 0;

    while (position < text.length) {
      const endPos = Math.min(position + config.targetSize, text.length);
      const content = text.slice(position, endPos);

      chunks.push(
        this.createChunk({
          content,
          startOffset: position,
          endOffset: endPos,
          index,
          sourceId,
          contentType,
          level: 0,
        })
      );

      position = endPos - config.overlap;
      if (position >= text.length - config.minSize) break;
      index++;
    }

    // Update total chunks count
    chunks.forEach((c) => (c.totalChunks = chunks.length));
    this.calculateOverlaps(chunks);

    return chunks;
  }

  /**
   * Sentence-boundary chunking
   */
  private sentenceChunking(
    text: string,
    sourceId: string,
    contentType: ContentType,
    config: ChunkingConfig
  ): Chunk[] {
    const sentences = this.splitSentences(text);
    return this.groupUnitsIntoChunks(sentences, text, sourceId, contentType, config);
  }

  /**
   * Paragraph-boundary chunking
   */
  private paragraphChunking(
    text: string,
    sourceId: string,
    contentType: ContentType,
    config: ChunkingConfig
  ): Chunk[] {
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
    return this.groupUnitsIntoChunks(paragraphs, text, sourceId, contentType, config);
  }

  /**
   * Code-aware chunking
   */
  private codeChunking(
    text: string,
    sourceId: string,
    contentType: ContentType,
    config: ChunkingConfig
  ): Chunk[] {
    // Split by function/class definitions
    const codeUnits = this.splitCodeUnits(text);
    return this.groupUnitsIntoChunks(codeUnits, text, sourceId, contentType, config);
  }

  /**
   * Semantic chunking (hybrid approach)
   */
  private semanticChunking(
    text: string,
    sourceId: string,
    contentType: ContentType,
    config: ChunkingConfig
  ): Chunk[] {
    // Detect sections based on content type
    let units: string[];

    if (contentType === 'markdown') {
      units = this.splitMarkdownSections(text);
    } else if (contentType === 'code') {
      units = this.splitCodeUnits(text);
    } else if (contentType === 'conversation') {
      units = this.splitConversationTurns(text);
    } else {
      // Fall back to paragraph-based splitting
      units = text.split(/\n\s*\n/).filter((p) => p.trim());
    }

    return this.groupUnitsIntoChunks(units, text, sourceId, contentType, config);
  }

  /**
   * Split text into sentences
   */
  private splitSentences(text: string): string[] {
    // Split on sentence boundaries while preserving the delimiter
    return text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim())
      .map((s) => s.trim());
  }

  /**
   * Split markdown into sections
   */
  private splitMarkdownSections(text: string): string[] {
    const sections: string[] = [];
    const lines = text.split('\n');
    let currentSection: string[] = [];

    for (const line of lines) {
      // New section on heading
      if (/^#{1,6}\s/.test(line) && currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
        currentSection = [];
      }
      currentSection.push(line);
    }

    if (currentSection.length > 0) {
      sections.push(currentSection.join('\n'));
    }

    return sections;
  }

  /**
   * Split code into logical units
   */
  private splitCodeUnits(text: string): string[] {
    const units: string[] = [];
    const lines = text.split('\n');
    let currentUnit: string[] = [];
    let braceDepth = 0;
    let inFunction = false;

    for (const line of lines) {
      // Detect function/class start
      if (/^(export\s+)?(async\s+)?(function|class|const\s+\w+\s*=|interface|type)\s/.test(line)) {
        if (currentUnit.length > 0 && braceDepth === 0) {
          units.push(currentUnit.join('\n'));
          currentUnit = [];
        }
        inFunction = true;
      }

      currentUnit.push(line);

      // Track brace depth
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      // End of function/class
      if (inFunction && braceDepth === 0 && closeBraces > 0) {
        units.push(currentUnit.join('\n'));
        currentUnit = [];
        inFunction = false;
      }
    }

    if (currentUnit.length > 0) {
      units.push(currentUnit.join('\n'));
    }

    return units.filter((u) => u.trim());
  }

  /**
   * Split conversation into turns
   */
  private splitConversationTurns(text: string): string[] {
    return text.split(/(?=^(?:user|assistant|human|ai|system):)/im).filter((t) => t.trim());
  }

  /**
   * Group text units into chunks respecting size limits
   */
  private groupUnitsIntoChunks(
    units: string[],
    originalText: string,
    sourceId: string,
    contentType: ContentType,
    config: ChunkingConfig
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let currentContent: string[] = [];
    let currentSize = 0;
    let index = 0;

    for (const unit of units) {
      const unitSize = unit.length;

      // If single unit exceeds max, split it further
      if (unitSize > config.maxSize) {
        // Flush current
        if (currentContent.length > 0) {
          chunks.push(
            this.createChunkFromContent(
              currentContent.join('\n\n'),
              originalText,
              index++,
              sourceId,
              contentType
            )
          );
          currentContent = [];
          currentSize = 0;
        }

        // Split large unit with fixed chunking
        const subChunks = this.fixedSizeChunking(unit, sourceId, contentType, config);
        for (const subChunk of subChunks) {
          subChunk.index = index++;
          chunks.push(subChunk);
        }
        continue;
      }

      // Check if adding this unit exceeds target
      if (currentSize + unitSize > config.targetSize && currentContent.length > 0) {
        chunks.push(
          this.createChunkFromContent(
            currentContent.join('\n\n'),
            originalText,
            index++,
            sourceId,
            contentType
          )
        );

        // Start new chunk with overlap
        if (config.overlap > 0 && currentContent.length > 0) {
          const lastUnit = currentContent[currentContent.length - 1];
          if (lastUnit && lastUnit.length <= config.overlap) {
            currentContent = [lastUnit];
            currentSize = lastUnit.length;
          } else {
            currentContent = [];
            currentSize = 0;
          }
        } else {
          currentContent = [];
          currentSize = 0;
        }
      }

      currentContent.push(unit);
      currentSize += unitSize;
    }

    // Flush remaining
    if (currentContent.length > 0) {
      chunks.push(
        this.createChunkFromContent(
          currentContent.join('\n\n'),
          originalText,
          index,
          sourceId,
          contentType
        )
      );
    }

    // Update total chunks count
    chunks.forEach((c) => (c.totalChunks = chunks.length));
    this.calculateOverlaps(chunks);

    return chunks;
  }

  /**
   * Create a chunk from content
   */
  private createChunkFromContent(
    content: string,
    originalText: string,
    index: number,
    sourceId: string,
    contentType: ContentType
  ): Chunk {
    const startOffset = originalText.indexOf(content);
    return this.createChunk({
      content,
      startOffset: startOffset >= 0 ? startOffset : 0,
      endOffset: startOffset >= 0 ? startOffset + content.length : content.length,
      index,
      sourceId,
      contentType,
      level: 0,
    });
  }

  /**
   * Create a chunk with metadata extraction
   */
  private createChunk(params: {
    content: string;
    startOffset: number;
    endOffset: number;
    index: number;
    sourceId: string;
    contentType: ContentType;
    level: number;
  }): Chunk {
    const metadata = this.extractMetadata(params.content, params.contentType);

    return {
      id: uuid(),
      content: params.content,
      startOffset: params.startOffset,
      endOffset: params.endOffset,
      index: params.index,
      totalChunks: 0, // Updated later
      sourceId: params.sourceId,
      level: params.level,
      tokenEstimate: Math.ceil(params.content.length / CHARS_PER_TOKEN),
      contentType: params.contentType,
      overlapPrevious: 0,
      overlapNext: 0,
      metadata,
    };
  }

  /**
   * Extract metadata from chunk content
   */
  private extractMetadata(content: string, contentType: ContentType): ChunkMetadata {
    const metadata: ChunkMetadata = {};

    // Extract title (first heading or first line)
    const headingMatch = content.match(/^#{1,6}\s+(.+)$/m);
    if (headingMatch) {
      metadata.title = headingMatch[1]?.trim();
    }

    // Extract keywords (simple approach - could be enhanced with NLP)
    const words = content.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const wordFreq = new Map<string, number>();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
    metadata.keywords = [...wordFreq.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    // Code-specific extraction
    if (contentType === 'code') {
      // Extract imports
      const imports = content.match(/^(?:import|from|require)\s+.+$/gm);
      if (imports) {
        metadata.imports = imports.map((i) => i.trim());
      }

      // Extract exports
      const exports = content.match(
        /^export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type)\s+(\w+)/gm
      );
      if (exports) {
        metadata.exports = exports.map((e) => {
          const match = e.match(/(?:const|let|var|function|class|interface|type)\s+(\w+)/);
          return match?.[1] ?? e;
        });
      }

      // Extract definitions
      const definitions = content.match(/(?:function|class|interface|type)\s+(\w+)/g);
      if (definitions) {
        metadata.definitions = definitions.map((d) => {
          const match = d.match(/(?:function|class|interface|type)\s+(\w+)/);
          return match?.[1] ?? d;
        });
      }

      // Detect language
      if (/^(?:import|export|const|let|interface|type)\s/m.test(content)) {
        metadata.language = 'typescript';
      } else if (/^(?:def|class|import|from)\s/m.test(content)) {
        metadata.language = 'python';
      } else if (/^(?:func|package|type|struct)\s/m.test(content)) {
        metadata.language = 'go';
      }
    }

    // Extract references (links, mentions)
    const refs = content.match(/\[([^\]]+)\]\([^)]+\)|@\w+|#\w+/g);
    if (refs) {
      metadata.references = refs;
    }

    return metadata;
  }

  /**
   * Calculate overlap between adjacent chunks
   */
  private calculateOverlaps(chunks: Chunk[]): void {
    for (let i = 0; i < chunks.length - 1; i++) {
      const current = chunks[i];
      const next = chunks[i + 1];

      if (!current || !next) continue;

      // Check for content overlap
      const overlapSize = Math.min(current.content.length, next.content.length, 200);
      const currentEnd = current.content.slice(-overlapSize);
      const nextStart = next.content.slice(0, overlapSize);

      // Find actual overlap
      for (let len = overlapSize; len > 0; len--) {
        if (currentEnd.slice(-len) === nextStart.slice(0, len)) {
          current.overlapNext = len;
          next.overlapPrevious = len;
          break;
        }
      }
    }
  }

  /**
   * Extract sequential relations
   */
  private extractSequentialRelations(chunks: Chunk[]): ChunkRelation[] {
    const relations: ChunkRelation[] = [];

    for (let i = 0; i < chunks.length - 1; i++) {
      const current = chunks[i];
      const next = chunks[i + 1];

      if (!current || !next) continue;

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
   * Extract dependency relations from code
   */
  private extractDependencyRelations(chunks: Chunk[]): ChunkRelation[] {
    const relations: ChunkRelation[] = [];

    // Build index of exports/definitions by chunk
    const exportIndex = new Map<string, string>(); // export name -> chunk ID
    for (const chunk of chunks) {
      const exports = chunk.metadata.exports || [];
      const definitions = chunk.metadata.definitions || [];
      for (const name of [...exports, ...definitions]) {
        exportIndex.set(name, chunk.id);
      }
    }

    // Find references/dependencies
    for (const chunk of chunks) {
      // Check if this chunk references exports from other chunks
      const content = chunk.content;
      for (const [name, definingChunkId] of exportIndex) {
        if (definingChunkId === chunk.id) continue;

        // Check for usage of the name
        const usagePattern = new RegExp(`\\b${name}\\b`, 'g');
        if (usagePattern.test(content)) {
          relations.push({
            sourceId: chunk.id,
            targetId: definingChunkId,
            type: 'depends_on',
            confidence: 0.8,
            metadata: { reference: name },
          });

          relations.push({
            sourceId: definingChunkId,
            targetId: chunk.id,
            type: 'references',
            confidence: 0.8,
            metadata: { reference: name },
          });
        }
      }
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

  /**
   * Get related chunks (all relation types)
   */
  getRelated(
    result: ChunkingResult,
    chunkId: string,
    types?: ChunkRelationType[]
  ): Array<{ chunk: Chunk; relation: ChunkRelation }> {
    const related = result.relations
      .filter((r) => {
        if (r.sourceId !== chunkId && r.targetId !== chunkId) return false;
        if (types && !types.includes(r.type)) return false;
        return true;
      })
      .map((r) => {
        const relatedId = r.sourceId === chunkId ? r.targetId : r.sourceId;
        const chunk = result.chunks.find((c) => c.id === relatedId);
        return chunk ? { chunk, relation: r } : null;
      })
      .filter((r): r is { chunk: Chunk; relation: ChunkRelation } => r !== null);

    return related;
  }
}

/**
 * Create a chunking service with default config
 */
export function createChunkingService(config?: Partial<ChunkingConfig>): ChunkingService {
  return new ChunkingService(config);
}
