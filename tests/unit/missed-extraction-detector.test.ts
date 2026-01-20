/**
 * Missed Extraction Detector Tests
 *
 * TDD: These tests define the expected behavior of the missed extraction module.
 * The module analyzes conversation transcripts at session-end to find facts, bugs,
 * decisions, and guidelines that weren't captured during the session.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MissedExtractionDetector } from '../../src/services/librarian/missed-extraction/detector.js';
import type { ConversationMessage } from '../../src/services/librarian/missed-extraction/types.js';

describe('MissedExtractionDetector', () => {
  // =============================================================================
  // USER JOURNEY 1: Basic Detection
  // As a developer, I want the librarian to analyze my session transcript
  // and identify facts/decisions that weren't stored during the session.
  // =============================================================================

  describe('detectMissedExtractions', () => {
    it('should extract facts from conversation that were not stored', async () => {
      // Arrange: Conversation with explicit facts that weren't captured
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'The API rate limit is 100 requests per minute',
          createdAt: '2026-01-20T10:00:00Z',
        },
        {
          role: 'assistant',
          content: 'Got it, I will keep that in mind when making API calls.',
          createdAt: '2026-01-20T10:00:10Z',
        },
        {
          role: 'user',
          content: 'Thanks',
          createdAt: '2026-01-20T10:00:20Z',
        },
      ];

      const existingEntries: string[] = []; // Nothing was stored during session

      // Act
      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionService(),
        knowledgeRepo: mockKnowledgeRepo(existingEntries),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.missedEntries.length).toBeGreaterThan(0);
      expect(result.missedEntries.some((e) => e.content.includes('rate limit'))).toBe(true);
    });

    it('should not flag entries that were already stored during session', async () => {
      // Arrange: Conversation where the fact WAS stored
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Remember that we use TypeScript strict mode',
          createdAt: '2026-01-20T10:00:00Z',
        },
        {
          role: 'assistant',
          content: 'I have stored that guideline.',
          createdAt: '2026-01-20T10:00:10Z',
        },
        {
          role: 'user',
          content: 'Great',
          createdAt: '2026-01-20T10:00:20Z',
        },
      ];

      // This guideline was already stored (similar content)
      const existingGuidelines = ['Use TypeScript strict mode for all projects'];

      // Act
      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceTypescript(),
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo(existingGuidelines),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Assert: Should filter the TypeScript guideline as duplicate
      expect(result.duplicatesFiltered).toBeGreaterThan(0);
      expect(
        result.missedEntries.some((e) => e.content.toLowerCase().includes('typescript strict'))
      ).toBe(false);
    });

    it('should return empty array when conversation has no extractable content', async () => {
      // Arrange: Casual conversation with no facts/decisions
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'Hi! How can I help?', createdAt: '2026-01-20T10:00:05Z' },
        { role: 'user', content: 'Thanks, goodbye', createdAt: '2026-01-20T10:00:10Z' },
      ];

      // Act
      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceEmpty(),
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.missedEntries.length).toBe(0);
    });
  });

  // =============================================================================
  // USER JOURNEY 2: Confidence-based Filtering
  // As a developer, I want only high-confidence extractions to be queued,
  // so that I don't get overwhelmed with low-quality suggestions.
  // =============================================================================

  describe('confidence filtering', () => {
    it('should filter out extractions below confidence threshold', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Maybe we should consider using Redis for caching, but I am not sure yet.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        {
          role: 'assistant',
          content: 'That could be an option.',
          createdAt: '2026-01-20T10:00:10Z',
        },
        { role: 'user', content: 'Let me think about it.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceWithConfidence(0.5), // Low confidence
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
        config: { confidenceThreshold: 0.7 },
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Assert: Low confidence entry should be filtered
      expect(result.belowThresholdCount).toBeGreaterThan(0);
      expect(result.missedEntries.length).toBe(0);
    });

    it('should include extractions at or above confidence threshold', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'We decided to use PostgreSQL as our primary database.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        {
          role: 'assistant',
          content: 'PostgreSQL is a solid choice.',
          createdAt: '2026-01-20T10:00:10Z',
        },
        { role: 'user', content: 'Yes.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceWithConfidence(0.85), // High confidence
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
        config: { confidenceThreshold: 0.7 },
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Assert: High confidence entry should be included
      expect(result.missedEntries.length).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // USER JOURNEY 3: Entry Type Detection
  // As a developer, I want missed extractions to be categorized by type
  // (knowledge, guideline, tool) so they can be stored correctly.
  // =============================================================================

  describe('entry type detection', () => {
    it('should categorize decisions as knowledge entries', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'We chose React over Vue because of better TypeScript support.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'Good choice.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Thanks.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceWithType('knowledge'),
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.missedEntries.some((e) => e.type === 'knowledge')).toBe(true);
    });

    it('should categorize rules/standards as guideline entries', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Always use async/await instead of .then() chains in this codebase.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'Understood.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Thanks.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceWithType('guideline'),
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.missedEntries.some((e) => e.type === 'guideline')).toBe(true);
    });

    it('should categorize CLI commands and scripts as tool entries', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Run npm run build:prod to create a production build.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'Will do.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Thanks.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceWithType('tool'),
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.missedEntries.some((e) => e.type === 'tool')).toBe(true);
    });
  });

  // =============================================================================
  // USER JOURNEY 4: Bug Detection
  // As a developer, I want bugs discussed in conversation to be captured
  // even if they weren't explicitly stored.
  // =============================================================================

  describe('bug detection', () => {
    it('should detect bugs mentioned in conversation', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'There is a bug where the login form does not validate email format.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        {
          role: 'assistant',
          content: 'I see the issue. The regex pattern is missing.',
          createdAt: '2026-01-20T10:00:10Z',
        },
        { role: 'user', content: 'Can you fix it?', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceWithBug(),
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.missedEntries.some((e) => e.category === 'bug' || e.category === 'issue')).toBe(
        true
      );
    });
  });

  // =============================================================================
  // USER JOURNEY 5: Semantic Duplicate Detection
  // As a developer, I want the detector to identify semantically similar entries
  // not just exact matches, to avoid duplicate suggestions.
  // =============================================================================

  describe('semantic duplicate detection', () => {
    it('should detect semantically similar entries as duplicates', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'We should always validate user input before processing.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'Good practice.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Yes.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      // Existing guideline with similar meaning but different wording
      const existingGuidelines = ['All user inputs must be validated prior to handling'];

      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceValidation(),
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo(existingGuidelines),
        toolRepo: mockToolRepo([]),
        embeddingService: mockEmbeddingService(0.92), // High similarity
        config: { duplicateSimilarityThreshold: 0.85 },
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Should be filtered as semantic duplicate
      expect(result.duplicatesFiltered).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // USER JOURNEY 6: Result Statistics
  // As a developer, I want detailed statistics about what was analyzed
  // so I can understand the extraction quality.
  // =============================================================================

  describe('result statistics', () => {
    it('should provide comprehensive statistics in the result', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Fact 1: API timeout is 30 seconds',
          createdAt: '2026-01-20T10:00:00Z',
        },
        {
          role: 'user',
          content: 'Fact 2: Use Redis for caching',
          createdAt: '2026-01-20T10:01:00Z',
        },
        { role: 'user', content: 'Rule: Always log errors', createdAt: '2026-01-20T10:02:00Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceMultiple(),
        knowledgeRepo: mockKnowledgeRepo(['Use Redis for caching']), // One already exists
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Assert statistics
      expect(result).toHaveProperty('totalExtracted');
      expect(result).toHaveProperty('duplicatesFiltered');
      expect(result).toHaveProperty('belowThresholdCount');
      expect(result).toHaveProperty('missedEntries');
      expect(result).toHaveProperty('processingTimeMs');
      expect(result.totalExtracted).toBeGreaterThanOrEqual(result.missedEntries.length);
    });
  });

  // =============================================================================
  // USER JOURNEY 7: Error Handling
  // As a developer, I want the detector to handle errors gracefully
  // so session-end processing doesn't fail completely.
  // =============================================================================

  describe('error handling', () => {
    it('should handle extraction service failures gracefully', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Some content', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'Response', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'More content', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionServiceError(),
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Should return success: false but not throw
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.missedEntries).toEqual([]);
    });

    it('should handle empty messages array', async () => {
      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionService(),
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages: [],
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.success).toBe(true);
      expect(result.missedEntries).toEqual([]);
      expect(result.skippedReason).toBe('no_messages');
    });

    it('should handle messages below minimum threshold', async () => {
      const detector = new MissedExtractionDetector({
        extractionService: mockExtractionService(),
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
        config: { minMessages: 5 },
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages: [{ role: 'user', content: 'Hello', createdAt: '2026-01-20T10:00:00Z' }],
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.success).toBe(true);
      expect(result.missedEntries).toEqual([]);
      expect(result.skippedReason).toBe('below_min_messages');
    });
  });

  // =============================================================================
  // USER JOURNEY 8: Tool Duplicate Detection
  // As a developer, I want tool entries to be checked for duplicates too.
  // =============================================================================

  describe('tool duplicate detection', () => {
    it('should detect duplicate tool entries by description', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Run npm run build to build the project.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'Will do.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Thanks.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      // Existing tool with similar description
      const existingTools = ['npm run build to build the project'];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => true,
          extract: vi.fn().mockResolvedValue({
            entries: [
              {
                type: 'tool',
                name: 'Build Command',
                content: 'npm run build to build the project', // Matches existing
                confidence: 0.85,
                category: 'cli',
              },
            ],
            entities: [],
            relationships: [],
            model: 'test-model',
            provider: 'test',
            processingTimeMs: 100,
          }),
          getProvider: () => 'test',
        },
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo(existingTools),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Should be filtered as duplicate because the tool already exists
      expect(result.duplicatesFiltered).toBeGreaterThan(0);
    });

    it('should detect duplicate tool entries by name', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Use the build-project command.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'Got it.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Thanks.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => true,
          extract: vi.fn().mockResolvedValue({
            entries: [
              {
                type: 'tool',
                name: 'build-project',
                content: 'Different description',
                confidence: 0.85,
                category: 'cli',
              },
            ],
            entities: [],
            relationships: [],
            model: 'test-model',
            provider: 'test',
            processingTimeMs: 100,
          }),
          getProvider: () => 'test',
        },
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: {
          list: vi
            .fn()
            .mockResolvedValue([
              { id: 'tool-1', name: 'build-project', description: 'Builds the project' },
            ]),
        },
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.duplicatesFiltered).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // USER JOURNEY 9: Name-based Duplicate Detection
  // =============================================================================

  describe('name-based duplicate detection', () => {
    it('should detect knowledge duplicates by title match', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Database timeout is 30 seconds.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'Noted.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'OK.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => true,
          extract: vi.fn().mockResolvedValue({
            entries: [
              {
                type: 'knowledge',
                name: 'Database Timeout',
                title: 'Database Timeout',
                content: 'Different content',
                confidence: 0.85,
                category: 'fact',
              },
            ],
            entities: [],
            relationships: [],
            model: 'test-model',
            provider: 'test',
            processingTimeMs: 100,
          }),
          getProvider: () => 'test',
        },
        knowledgeRepo: {
          list: vi
            .fn()
            .mockResolvedValue([
              { id: 'knowledge-1', title: 'database timeout', content: 'Old content' },
            ]),
        },
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.duplicatesFiltered).toBeGreaterThan(0);
    });

    it('should detect guideline duplicates by name match', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Always use strict mode.', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'OK.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Thanks.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => true,
          extract: vi.fn().mockResolvedValue({
            entries: [
              {
                type: 'guideline',
                name: 'Strict Mode',
                content: 'Different content',
                confidence: 0.85,
                category: 'code_style',
              },
            ],
            entities: [],
            relationships: [],
            model: 'test-model',
            provider: 'test',
            processingTimeMs: 100,
          }),
          getProvider: () => 'test',
        },
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: {
          list: vi
            .fn()
            .mockResolvedValue([
              { id: 'guideline-1', name: 'strict mode', content: 'Old content' },
            ]),
        },
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.duplicatesFiltered).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // USER JOURNEY 10: Extraction Service Unavailable
  // =============================================================================

  describe('extraction service unavailable', () => {
    it('should return error when extraction service is not available', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Some content.', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'Response.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'OK.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => false, // Service not available
          extract: vi.fn(),
          getProvider: () => 'test',
        },
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Extraction service not available');
    });
  });

  // =============================================================================
  // USER JOURNEY 11: Category Inference
  // =============================================================================

  describe('category inference', () => {
    it('should infer bug category from content', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'There is a bug in the code.', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'I see.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Fix it.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => true,
          extract: vi.fn().mockResolvedValue({
            entries: [
              {
                type: 'knowledge',
                name: 'Bug Report',
                content: 'There is a bug that needs to be fixed',
                confidence: 0.85,
                // No category provided - should be inferred
              },
            ],
            entities: [],
            relationships: [],
            model: 'test-model',
            provider: 'test',
            processingTimeMs: 100,
          }),
          getProvider: () => 'test',
        },
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.missedEntries.length).toBe(1);
      expect(result.missedEntries[0].category).toBe('bug');
    });

    it('should infer decision category from content', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'We decided to use React.', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'Good choice.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Yes.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => true,
          extract: vi.fn().mockResolvedValue({
            entries: [
              {
                type: 'knowledge',
                name: 'Framework Choice',
                content: 'We decided to use React because it has good ecosystem',
                confidence: 0.85,
                // No category provided
              },
            ],
            entities: [],
            relationships: [],
            model: 'test-model',
            provider: 'test',
            processingTimeMs: 100,
          }),
          getProvider: () => 'test',
        },
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.missedEntries.length).toBe(1);
      expect(result.missedEntries[0].category).toBe('decision');
    });

    it('should infer fact category from content with "is"', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'The API is documented.', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'Good.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Yes.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => true,
          extract: vi.fn().mockResolvedValue({
            entries: [
              {
                type: 'knowledge',
                name: 'API Documentation',
                content: 'The API is fully documented', // Contains "is "
                confidence: 0.85,
                // No category - should infer 'fact'
              },
            ],
            entities: [],
            relationships: [],
            model: 'test-model',
            provider: 'test',
            processingTimeMs: 100,
          }),
          getProvider: () => 'test',
        },
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.missedEntries.length).toBe(1);
      expect(result.missedEntries[0].category).toBe('fact');
    });

    it('should infer default code_style category for guidelines', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Follow this standard.', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'OK.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Thanks.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => true,
          extract: vi.fn().mockResolvedValue({
            entries: [
              {
                type: 'guideline',
                name: 'Coding Standard',
                content: 'Follow standard patterns', // No keyword triggers
                confidence: 0.85,
                // No category - should default to 'code_style' for guidelines
              },
            ],
            entities: [],
            relationships: [],
            model: 'test-model',
            provider: 'test',
            processingTimeMs: 100,
          }),
          getProvider: () => 'test',
        },
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.missedEntries.length).toBe(1);
      expect(result.missedEntries[0].category).toBe('code_style');
    });

    it('should infer default cli category for tools', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Use this command.', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'OK.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Thanks.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => true,
          extract: vi.fn().mockResolvedValue({
            entries: [
              {
                type: 'tool',
                name: 'Some Command',
                content: 'some command to run', // No keyword triggers
                confidence: 0.85,
                // No category - should default to 'cli' for tools
              },
            ],
            entities: [],
            relationships: [],
            model: 'test-model',
            provider: 'test',
            processingTimeMs: 100,
          }),
          getProvider: () => 'test',
        },
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.missedEntries.length).toBe(1);
      expect(result.missedEntries[0].category).toBe('cli');
    });
  });

  // =============================================================================
  // USER JOURNEY 12: Semantic Duplicate Error Handling
  // =============================================================================

  describe('semantic duplicate error handling', () => {
    it('should handle embedding service errors gracefully and fall back to text matching', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Always validate input.', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'Good practice.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Yes.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: {
          isAvailable: () => true,
          extract: vi.fn().mockResolvedValue({
            entries: [
              {
                type: 'guideline',
                name: 'Input Validation',
                content: 'Validate user input always',
                confidence: 0.85,
                category: 'security',
              },
            ],
            entities: [],
            relationships: [],
            model: 'test-model',
            provider: 'test',
            processingTimeMs: 100,
          }),
          getProvider: () => 'test',
        },
        knowledgeRepo: mockKnowledgeRepo([]),
        guidelineRepo: mockGuidelineRepo([]),
        toolRepo: mockToolRepo([]),
        // Embedding service that throws an error
        embeddingService: {
          isAvailable: () => true,
          generateEmbedding: vi.fn().mockRejectedValue(new Error('Embedding service error')),
          cosineSimilarity: vi.fn(),
        },
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Should succeed despite embedding error (falls back to text matching)
      expect(result.success).toBe(true);
      expect(result.missedEntries.length).toBe(1);
    });
  });
});

// =============================================================================
// MOCK HELPERS
// =============================================================================

function mockExtractionService() {
  return {
    isAvailable: () => true,
    extract: vi.fn().mockResolvedValue({
      entries: [
        {
          type: 'knowledge',
          name: 'API Rate Limit',
          content: 'The API rate limit is 100 requests per minute',
          confidence: 0.85,
          category: 'fact',
        },
      ],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'test',
      processingTimeMs: 100,
    }),
    getProvider: () => 'test',
  };
}

function mockExtractionServiceTypescript() {
  return {
    isAvailable: () => true,
    extract: vi.fn().mockResolvedValue({
      entries: [
        {
          type: 'guideline',
          name: 'TypeScript Strict Mode',
          content: 'Use TypeScript strict mode for all projects',
          confidence: 0.85,
          category: 'code_style',
        },
      ],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'test',
      processingTimeMs: 100,
    }),
    getProvider: () => 'test',
  };
}

function mockExtractionServiceValidation() {
  return {
    isAvailable: () => true,
    extract: vi.fn().mockResolvedValue({
      entries: [
        {
          type: 'guideline',
          name: 'Input Validation',
          content: 'Always validate user input before processing',
          confidence: 0.85,
          category: 'security',
        },
      ],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'test',
      processingTimeMs: 100,
    }),
    getProvider: () => 'test',
  };
}

function mockExtractionServiceEmpty() {
  return {
    isAvailable: () => true,
    extract: vi.fn().mockResolvedValue({
      entries: [],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'test',
      processingTimeMs: 50,
    }),
    getProvider: () => 'test',
  };
}

function mockExtractionServiceWithConfidence(confidence: number) {
  return {
    isAvailable: () => true,
    extract: vi.fn().mockResolvedValue({
      entries: [
        {
          type: 'knowledge',
          name: 'Redis Caching',
          content: 'Consider using Redis for caching',
          confidence,
          category: 'suggestion',
        },
      ],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'test',
      processingTimeMs: 100,
    }),
    getProvider: () => 'test',
  };
}

function mockExtractionServiceWithType(type: 'knowledge' | 'guideline' | 'tool') {
  return {
    isAvailable: () => true,
    extract: vi.fn().mockResolvedValue({
      entries: [
        {
          type,
          name: 'Test Entry',
          content: 'Test content for ' + type,
          confidence: 0.85,
          category: type === 'knowledge' ? 'decision' : type === 'guideline' ? 'code_style' : 'cli',
        },
      ],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'test',
      processingTimeMs: 100,
    }),
    getProvider: () => 'test',
  };
}

function mockExtractionServiceWithBug() {
  return {
    isAvailable: () => true,
    extract: vi.fn().mockResolvedValue({
      entries: [
        {
          type: 'knowledge',
          name: 'Login Form Bug',
          content: 'Login form does not validate email format - regex pattern is missing',
          confidence: 0.9,
          category: 'bug',
        },
      ],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'test',
      processingTimeMs: 100,
    }),
    getProvider: () => 'test',
  };
}

function mockExtractionServiceMultiple() {
  return {
    isAvailable: () => true,
    extract: vi.fn().mockResolvedValue({
      entries: [
        {
          type: 'knowledge',
          name: 'API Timeout',
          content: 'API timeout is 30 seconds',
          confidence: 0.85,
          category: 'fact',
        },
        {
          type: 'knowledge',
          name: 'Redis Caching',
          content: 'Use Redis for caching',
          confidence: 0.85,
          category: 'decision',
        },
        {
          type: 'guideline',
          name: 'Error Logging',
          content: 'Always log errors',
          confidence: 0.85,
          category: 'code_style',
        },
      ],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'test',
      processingTimeMs: 150,
    }),
    getProvider: () => 'test',
  };
}

function mockExtractionServiceError() {
  return {
    isAvailable: () => true,
    extract: vi.fn().mockRejectedValue(new Error('LLM service unavailable')),
    getProvider: () => 'test',
  };
}

function mockKnowledgeRepo(existingContent: string[]) {
  return {
    // Using list() with filter instead of findByScope()
    list: vi.fn().mockResolvedValue(
      existingContent.map((content, i) => ({
        id: `knowledge-${i}`,
        content,
        title: content.substring(0, 50),
      }))
    ),
  };
}

function mockGuidelineRepo(existingContent: string[]) {
  return {
    // Using list() with filter instead of findByScope()
    list: vi.fn().mockResolvedValue(
      existingContent.map((content, i) => ({
        id: `guideline-${i}`,
        content,
        name: content.substring(0, 50),
      }))
    ),
  };
}

function mockToolRepo(existingContent: string[]) {
  return {
    // Using list() with filter instead of findByScope()
    list: vi.fn().mockResolvedValue(
      existingContent.map((content, i) => ({
        id: `tool-${i}`,
        description: content,
        name: content.substring(0, 50),
      }))
    ),
  };
}

function mockEmbeddingService(similarity: number) {
  // Note: similarity parameter now controls the embedding values to produce desired similarity
  // The detector now uses its own cosineSimilarity implementation
  // To achieve a specific similarity, we use vectors that produce that similarity
  const baseEmbedding = new Array(1536).fill(0.1);
  return {
    isAvailable: () => true,
    // embed() returns {embedding, model, provider} instead of just embedding
    embed: vi.fn().mockImplementation((text: string) => {
      // For testing, use consistent embeddings that produce known similarity
      // When similarity is high (>0.85), return similar vectors
      // When similarity is low (<0.5), return different vectors
      if (similarity >= 0.85) {
        return Promise.resolve({
          embedding: baseEmbedding,
          model: 'test-model',
          provider: 'test',
        });
      }
      // For lower similarity, return different vectors
      return Promise.resolve({
        embedding: baseEmbedding.map((v, i) => (i % 2 === 0 ? v : -v)),
        model: 'test-model',
        provider: 'test',
      });
    }),
  };
}
