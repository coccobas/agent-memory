/**
 * Missed Extraction Detector
 *
 * Analyzes conversation transcripts at session-end to find facts, bugs,
 * decisions, and guidelines that weren't captured during the session.
 *
 * This module runs as part of the librarian's session-end pipeline,
 * after the initial capture phase but before pattern analysis.
 */

import { createComponentLogger } from '../../../utils/logger.js';
import type {
  MissedExtractionConfig,
  MissedExtractionRequest,
  MissedExtractionResult,
  MissedEntry,
  MissedExtractionDetectorDeps,
  ConversationMessage,
} from './types.js';
import { DEFAULT_MISSED_EXTRACTION_CONFIG } from './types.js';

const logger = createComponentLogger('librarian:missed-extraction');

/**
 * MissedExtractionDetector
 *
 * Detects facts, bugs, decisions, and guidelines mentioned in conversation
 * that weren't explicitly stored during the session.
 */
export class MissedExtractionDetector {
  private readonly extractionService: MissedExtractionDetectorDeps['extractionService'];
  private readonly knowledgeRepo: MissedExtractionDetectorDeps['knowledgeRepo'];
  private readonly guidelineRepo: MissedExtractionDetectorDeps['guidelineRepo'];
  private readonly toolRepo: MissedExtractionDetectorDeps['toolRepo'];
  private readonly embeddingService?: MissedExtractionDetectorDeps['embeddingService'];
  private readonly config: MissedExtractionConfig;

  constructor(deps: MissedExtractionDetectorDeps) {
    this.extractionService = deps.extractionService;
    this.knowledgeRepo = deps.knowledgeRepo;
    this.guidelineRepo = deps.guidelineRepo;
    this.toolRepo = deps.toolRepo;
    this.embeddingService = deps.embeddingService;
    this.config = { ...DEFAULT_MISSED_EXTRACTION_CONFIG, ...deps.config };
  }

  /**
   * Detect missed extractions from conversation messages
   */
  async detect(request: MissedExtractionRequest): Promise<MissedExtractionResult> {
    const startTime = Date.now();

    // Validate: Empty messages
    if (!request.messages || request.messages.length === 0) {
      return {
        success: true,
        sessionId: request.sessionId,
        missedEntries: [],
        totalExtracted: 0,
        duplicatesFiltered: 0,
        belowThresholdCount: 0,
        processingTimeMs: Date.now() - startTime,
        skippedReason: 'no_messages',
      };
    }

    // Validate: Below minimum messages threshold
    if (request.messages.length < this.config.minMessages) {
      return {
        success: true,
        sessionId: request.sessionId,
        missedEntries: [],
        totalExtracted: 0,
        duplicatesFiltered: 0,
        belowThresholdCount: 0,
        processingTimeMs: Date.now() - startTime,
        skippedReason: 'below_min_messages',
      };
    }

    // Check if extraction service is available
    if (!this.extractionService.isAvailable()) {
      return {
        success: false,
        sessionId: request.sessionId,
        missedEntries: [],
        totalExtracted: 0,
        duplicatesFiltered: 0,
        belowThresholdCount: 0,
        processingTimeMs: Date.now() - startTime,
        error: 'Extraction service not available',
      };
    }

    try {
      // Step 1: Build conversation context for extraction
      const conversationContext = this.buildConversationContext(request.messages);

      logger.debug(
        {
          sessionId: request.sessionId,
          messageCount: request.messages.length,
          contextLength: conversationContext.length,
        },
        'Built conversation context for extraction'
      );

      // Step 2: Extract entries using LLM
      // Filter out 'bugs' from focusAreas since IExtractionService doesn't support it
      // Bug detection is handled via content inference in inferCategory()
      const supportedFocusAreas = this.config.focusAreas?.filter(
        (area): area is 'decisions' | 'facts' | 'rules' | 'tools' => area !== 'bugs'
      );
      const extractionResult = await this.extractionService.extract({
        context: conversationContext,
        contextType: 'conversation',
        focusAreas: supportedFocusAreas,
      });

      const totalExtracted = extractionResult.entries.length;

      logger.debug(
        {
          sessionId: request.sessionId,
          entriesExtracted: totalExtracted,
          model: extractionResult.model,
        },
        'LLM extraction completed'
      );

      // Step 3: Load existing entries for duplicate checking
      // Use list() with scope filter instead of findByScope()
      const scopeFilter = { scopeType: request.scopeType, scopeId: request.scopeId };
      const [existingKnowledge, existingGuidelines, existingTools] = await Promise.all([
        this.knowledgeRepo.list(scopeFilter),
        this.guidelineRepo.list(scopeFilter),
        this.toolRepo.list(scopeFilter),
      ]);

      // Step 4: Filter duplicates and below-threshold entries
      let duplicatesFiltered = 0;
      let belowThresholdCount = 0;
      const missedEntries: MissedEntry[] = [];

      for (const entry of extractionResult.entries) {
        // Check confidence threshold
        if (entry.confidence < this.config.confidenceThreshold) {
          belowThresholdCount++;
          continue;
        }

        // Check for duplicates based on entry type
        const isDuplicate = await this.checkDuplicate(
          entry,
          existingKnowledge,
          existingGuidelines,
          existingTools
        );

        if (isDuplicate) {
          duplicatesFiltered++;
          continue;
        }

        // Entry is valid - add to missed entries
        missedEntries.push({
          type: entry.type,
          name: entry.name ?? entry.title ?? 'Unnamed',
          content: entry.content,
          category: entry.category ?? this.inferCategory(entry.type, entry.content),
          confidence: entry.confidence,
          priority: entry.priority,
          rationale: entry.rationale,
          suggestedTags: entry.suggestedTags,
        });

        // Respect max entries limit
        if (missedEntries.length >= this.config.maxEntries) {
          break;
        }
      }

      logger.info(
        {
          sessionId: request.sessionId,
          totalExtracted,
          duplicatesFiltered,
          belowThresholdCount,
          missedCount: missedEntries.length,
          processingTimeMs: Date.now() - startTime,
        },
        'Missed extraction detection completed'
      );

      return {
        success: true,
        sessionId: request.sessionId,
        missedEntries,
        totalExtracted,
        duplicatesFiltered,
        belowThresholdCount,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn(
        {
          sessionId: request.sessionId,
          error: errorMessage,
        },
        'Missed extraction detection failed'
      );

      return {
        success: false,
        sessionId: request.sessionId,
        missedEntries: [],
        totalExtracted: 0,
        duplicatesFiltered: 0,
        belowThresholdCount: 0,
        processingTimeMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Build a conversation context string for LLM extraction
   */
  private buildConversationContext(messages: ConversationMessage[]): string {
    return messages
      .map((msg) => {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');
  }

  /**
   * Check if an extracted entry is a duplicate of existing entries
   */
  private async checkDuplicate(
    entry: { type: string; content: string; name?: string; title?: string },
    existingKnowledge: Array<{ id: string; content?: string; title?: string }>,
    existingGuidelines: Array<{ id: string; content?: string; name?: string }>,
    existingTools: Array<{ id: string; description?: string; name?: string }>
  ): Promise<boolean> {
    const entryText = entry.content.toLowerCase();
    const entryName = (entry.name ?? entry.title ?? '').toLowerCase();

    // Check based on entry type
    if (entry.type === 'knowledge') {
      for (const existing of existingKnowledge) {
        if (existing.content && this.isTextSimilar(entryText, existing.content.toLowerCase())) {
          return true;
        }
        if (
          entryName &&
          existing.title &&
          this.isTextSimilar(entryName, existing.title.toLowerCase())
        ) {
          return true;
        }
      }
    } else if (entry.type === 'guideline') {
      for (const existing of existingGuidelines) {
        if (existing.content && this.isTextSimilar(entryText, existing.content.toLowerCase())) {
          return true;
        }
        if (
          entryName &&
          existing.name &&
          this.isTextSimilar(entryName, existing.name.toLowerCase())
        ) {
          return true;
        }
      }
    } else if (entry.type === 'tool') {
      for (const existing of existingTools) {
        if (
          existing.description &&
          this.isTextSimilar(entryText, existing.description.toLowerCase())
        ) {
          return true;
        }
        if (
          entryName &&
          existing.name &&
          this.isTextSimilar(entryName, existing.name.toLowerCase())
        ) {
          return true;
        }
      }
    }

    // If embedding service is available, do semantic similarity check
    if (this.embeddingService?.isAvailable()) {
      return await this.checkSemanticDuplicate(
        entry,
        existingKnowledge,
        existingGuidelines,
        existingTools
      );
    }

    return false;
  }

  /**
   * Check for semantic duplicates using embeddings
   */
  private async checkSemanticDuplicate(
    entry: { type: string; content: string },
    existingKnowledge: Array<{ id: string; content?: string }>,
    existingGuidelines: Array<{ id: string; content?: string }>,
    existingTools: Array<{ id: string; description?: string }>
  ): Promise<boolean> {
    if (!this.embeddingService) return false;

    try {
      // Use embed() method and extract the embedding array
      const entryResult = await this.embeddingService.embed(entry.content);
      const entryEmbedding = entryResult.embedding;
      const threshold = this.config.duplicateSimilarityThreshold;

      // Check against appropriate existing entries based on type
      let existingContents: string[] = [];
      if (entry.type === 'knowledge') {
        existingContents = existingKnowledge.filter((e) => e.content).map((e) => e.content!);
      } else if (entry.type === 'guideline') {
        existingContents = existingGuidelines.filter((e) => e.content).map((e) => e.content!);
      } else if (entry.type === 'tool') {
        existingContents = existingTools.filter((e) => e.description).map((e) => e.description!);
      }

      for (const existingContent of existingContents) {
        const existingResult = await this.embeddingService.embed(existingContent);
        const similarity = this.cosineSimilarity(entryEmbedding, existingResult.embedding);
        if (similarity >= threshold) {
          return true;
        }
      }
    } catch (error) {
      // Log but don't fail - fall back to text-based detection
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Semantic duplicate check failed, falling back to text-based'
      );
    }

    return false;
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Check if two text strings are similar (basic overlap check)
   */
  private isTextSimilar(text1: string, text2: string): boolean {
    // Exact match
    if (text1 === text2) return true;

    // Substring match (one contains the other)
    if (text1.includes(text2) || text2.includes(text1)) return true;

    // Word overlap check (Jaccard-like)
    const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 3));
    const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 3));

    if (words1.size === 0 || words2.size === 0) return false;

    const intersection = [...words1].filter((w) => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;
    const jaccard = intersection / union;

    // Consider similar if >60% word overlap
    return jaccard > 0.6;
  }

  /**
   * Infer category based on entry type and content
   */
  private inferCategory(type: string, content: string): string {
    const lowerContent = content.toLowerCase();

    // Bug detection
    if (
      lowerContent.includes('bug') ||
      lowerContent.includes('issue') ||
      lowerContent.includes('error') ||
      lowerContent.includes('fix')
    ) {
      return 'bug';
    }

    // Decision detection
    if (
      lowerContent.includes('decided') ||
      lowerContent.includes('chose') ||
      lowerContent.includes('decision') ||
      lowerContent.includes('because')
    ) {
      return 'decision';
    }

    // Fact detection
    if (
      lowerContent.includes('is ') ||
      lowerContent.includes('are ') ||
      lowerContent.includes('uses ') ||
      lowerContent.includes('has ')
    ) {
      return 'fact';
    }

    // Default based on type
    if (type === 'guideline') return 'code_style';
    if (type === 'tool') return 'cli';
    return 'fact';
  }
}
