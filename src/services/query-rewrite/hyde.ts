/**
 * HyDE (Hypothetical Document Embeddings) Generator
 *
 * Generates hypothetical documents that would answer the query, then embeds them.
 * This improves retrieval by matching against "ideal answer" embeddings rather than
 * just the query text.
 *
 * Example:
 * Query: "How do I configure TypeScript strict mode?"
 * HyDE Document: "To configure TypeScript strict mode, add 'strict: true' to your
 *                 tsconfig.json. This enables all strict type checking options..."
 *
 * The hypothetical document's embedding often matches real documentation better
 * than the query embedding would.
 */

import type { ExtractionService } from '../extraction.service.js';
import type { EmbeddingService } from '../embedding.service.js';
import type { QueryIntent, HyDEConfig, HyDEResult } from './types.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('hyde');

/**
 * Intent-specific prompts for generating hypothetical documents
 * Each prompt guides the LLM to generate a document that would realistically
 * answer the query in the agent memory system.
 */
const HYDE_PROMPTS: Record<QueryIntent, (query: string) => string> = {
  lookup: (query: string) =>
    `Write a factual knowledge entry that would answer this question: ${query}\n\n` +
    `Format as a clear, concise knowledge entry that directly provides the requested information. ` +
    `Include specific details, names, and context.`,

  how_to: (query: string) =>
    `Write a step-by-step guideline that would help with: ${query}\n\n` +
    `Format as a procedural guideline with numbered steps. Include prerequisites, ` +
    `specific commands or code examples, and expected outcomes.`,

  debug: (query: string) =>
    `Write a solution entry for this error or problem: ${query}\n\n` +
    `Format as a troubleshooting entry that explains the root cause and provides ` +
    `a step-by-step solution. Include diagnostic steps and prevention tips.`,

  explore: (query: string) =>
    `Write related knowledge entries about: ${query}\n\n` +
    `Format as informative entries covering different aspects of this topic. ` +
    `Include background context, related concepts, and practical applications.`,

  compare: (query: string) =>
    `Write a comparison entry for: ${query}\n\n` +
    `Format as a comparative analysis that presents different options, their pros/cons, ` +
    `use cases, and recommendations for when to choose each option.`,

  configure: (query: string) =>
    `Write a configuration guide for: ${query}\n\n` +
    `Format as a setup/configuration entry with specific settings, required parameters, ` +
    `example configurations, and common customization options.`,
};

/**
 * System prompt for HyDE generation
 * Instructs the LLM to generate hypothetical documents in the style of agent memory entries
 */
const HYDE_SYSTEM_PROMPT = `You are a technical documentation generator for an agent memory system.

Your task is to generate hypothetical documents that would exist in the memory system to answer queries.
These documents should be:
- Concrete and specific (not generic)
- Well-structured and clear
- Realistic examples of what would be stored in memory
- Focused on practical, actionable information

Do not write meta-commentary or explanations about the document itself.
Just write the hypothetical document content directly.`;

/**
 * HyDE Generator Service
 *
 * Uses LLM to generate hypothetical documents that would answer the query,
 * then generates embeddings for those documents. This enables semantic search
 * to match against "ideal answers" rather than just the query text.
 */
export class HyDEGenerator {
  private extractionService: ExtractionService;
  private embeddingService: EmbeddingService;
  private config: HyDEConfig;

  /**
   * Create a HyDE generator instance
   *
   * @param extractionService - Service for LLM generation
   * @param embeddingService - Service for embedding generation
   * @param config - HyDE configuration
   */
  constructor(
    extractionService: ExtractionService,
    embeddingService: EmbeddingService,
    config: HyDEConfig
  ) {
    this.extractionService = extractionService;
    this.embeddingService = embeddingService;
    this.config = config;
  }

  /**
   * Check if HyDE is available
   * Returns false if HyDE is disabled or if required services are unavailable
   */
  isAvailable(): boolean {
    return (
      this.config.provider !== 'disabled' &&
      this.extractionService.isAvailable() &&
      this.embeddingService.isAvailable()
    );
  }

  /**
   * Generate hypothetical documents for a query
   *
   * @param query - The search query
   * @param intent - Query intent (affects prompt selection)
   * @returns Generated documents with embeddings
   */
  async generate(query: string, intent: QueryIntent): Promise<HyDEResult> {
    const startTime = Date.now();

    // Return empty result if disabled
    if (!this.isAvailable()) {
      logger.debug('HyDE is disabled or unavailable');
      return {
        documents: [],
        embeddings: [],
        model: 'disabled',
        processingTimeMs: 0,
      };
    }

    try {
      // Generate hypothetical documents using LLM
      const documents = await this.generateDocuments(query, intent);

      // Generate embeddings for all documents
      const embeddingResult = await this.embeddingService.embedBatch(documents);

      const processingTimeMs = Date.now() - startTime;

      logger.debug(
        {
          query,
          intent,
          documentCount: documents.length,
          provider: this.config.provider,
          processingTimeMs,
        },
        'HyDE generation completed'
      );

      return {
        documents,
        embeddings: embeddingResult.embeddings,
        model: embeddingResult.model,
        processingTimeMs,
      };
    } catch (error) {
      logger.error(
        {
          query,
          intent,
          error: error instanceof Error ? error.message : String(error),
        },
        'HyDE generation failed'
      );

      // Return empty result on error (graceful degradation)
      return {
        documents: [],
        embeddings: [],
        model: 'error',
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Generate hypothetical documents using the LLM
   *
   * @param query - The search query
   * @param intent - Query intent
   * @returns Array of generated document texts
   */
  private async generateDocuments(query: string, intent: QueryIntent): Promise<string[]> {
    // Build the prompt based on intent
    const userPrompt = HYDE_PROMPTS[intent](query);

    // Build context for extraction service
    const context = `${HYDE_SYSTEM_PROMPT}\n\n${userPrompt}`;

    // For HyDE, we're not extracting structured entries, just generating text
    // We'll use the extraction service's raw generation capability
    // Since ExtractionService doesn't have a raw generate method, we'll construct
    // a prompt that asks for multiple document variations

    const fullPrompt = this.buildMultiDocumentPrompt(query, intent);

    // Use extraction service to generate text
    // We'll extract the "knowledge" entries as our hypothetical documents
    const result = await this.extractionService.extract({
      context: fullPrompt,
      contextType: 'mixed',
      focusAreas: ['facts'],
    });

    // Extract document texts from knowledge entries
    const documents = result.entries
      .filter((entry) => entry.type === 'knowledge')
      .map((entry) => entry.content)
      .slice(0, this.config.documentCount);

    // If we didn't get enough documents, fall back to a single document
    if (documents.length === 0) {
      logger.warn({ query, intent }, 'No documents generated, using fallback');
      documents.push(this.generateFallbackDocument(query, intent));
    }

    return documents;
  }

  /**
   * Build a prompt that requests multiple document variations
   *
   * @param query - The search query
   * @param intent - Query intent
   * @returns Prompt text
   */
  private buildMultiDocumentPrompt(query: string, intent: QueryIntent): string {
    const basePrompt = HYDE_PROMPTS[intent](query);

    return `${basePrompt}

Generate ${this.config.documentCount} different variations of this hypothetical document.
Each variation should approach the topic from a slightly different angle or level of detail.

For each variation, create a knowledge entry with:
- title: A descriptive title for this variation
- content: The full hypothetical document text

Make each variation realistic and useful for answering the query: "${query}"`;
  }

  /**
   * Generate a simple fallback document when LLM generation fails
   *
   * @param query - The search query
   * @param intent - Query intent
   * @returns Fallback document text
   */
  private generateFallbackDocument(query: string, intent: QueryIntent): string {
    // Generate a basic document based on intent
    switch (intent) {
      case 'lookup':
        return `Information about ${query}: This document provides details and context regarding ${query}.`;

      case 'how_to':
        return `Guide for ${query}: Step-by-step instructions:\n1. Understand the requirements for ${query}\n2. Follow the recommended approach\n3. Verify the results`;

      case 'debug':
        return `Troubleshooting ${query}: Common causes and solutions for issues related to ${query}.`;

      case 'explore':
        return `Overview of ${query}: Background information, key concepts, and related topics for ${query}.`;

      case 'compare':
        return `Comparison of ${query}: Analysis of different options, their trade-offs, and use cases for ${query}.`;

      case 'configure':
        return `Configuration for ${query}: Setup instructions, required settings, and configuration options for ${query}.`;

      default:
        return `Documentation about ${query}: Comprehensive information regarding ${query}.`;
    }
  }

  /**
   * Update the HyDE configuration
   *
   * @param config - New configuration (partial update)
   */
  updateConfig(config: Partial<HyDEConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug({ config: this.config }, 'HyDE configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<HyDEConfig> {
    return { ...this.config };
  }
}
