/**
 * Missed Extraction Integration Tests
 *
 * Tests the integration of the MissedExtractionDetector with the librarian
 * session-end flow and other services.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MissedExtractionDetector } from '../../src/services/librarian/missed-extraction/detector.js';
import type {
  ConversationMessage,
  MissedExtractionConfig,
} from '../../src/services/librarian/missed-extraction/types.js';
import { DEFAULT_MISSED_EXTRACTION_CONFIG } from '../../src/services/librarian/missed-extraction/types.js';

describe('MissedExtraction Integration', () => {
  // =============================================================================
  // Integration with Session-End Pipeline
  // =============================================================================

  describe('session-end pipeline integration', () => {
    it('should integrate with session-end flow via detect method', async () => {
      // Simulate what the session-lifecycle handler would do
      const sessionId = 'integration-test-session';
      const projectId = 'integration-test-project';

      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'The database connection timeout is set to 30 seconds.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        {
          role: 'assistant',
          content: 'I will keep that configuration in mind for database operations.',
          createdAt: '2026-01-20T10:00:10Z',
        },
        {
          role: 'user',
          content: 'Also, we use connection pooling with max 20 connections.',
          createdAt: '2026-01-20T10:00:20Z',
        },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: createMockExtractionService([
          {
            type: 'knowledge',
            name: 'DB Connection Timeout',
            content: 'Database connection timeout is 30 seconds',
            confidence: 0.9,
            category: 'configuration',
          },
          {
            type: 'knowledge',
            name: 'Connection Pooling',
            content: 'Connection pooling uses max 20 connections',
            confidence: 0.85,
            category: 'configuration',
          },
        ]),
        knowledgeRepo: createMockRepo([]),
        guidelineRepo: createMockRepo([]),
        toolRepo: createMockRepo([]),
      });

      const result = await detector.detect({
        sessionId,
        projectId,
        messages,
        scopeType: 'project',
        scopeId: projectId,
        agentId: 'claude-code',
      });

      // Verify integration result
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(sessionId);
      expect(result.missedEntries.length).toBe(2);
      expect(result.totalExtracted).toBe(2);
      expect(result.duplicatesFiltered).toBe(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle partial extraction when some entries already exist', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'We use ESLint for linting and Prettier for formatting.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        {
          role: 'assistant',
          content: 'Good tooling choices.',
          createdAt: '2026-01-20T10:00:10Z',
        },
        { role: 'user', content: 'Yes.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      // ESLint guideline already exists
      const existingGuidelines = ['Use ESLint for code linting'];

      const detector = new MissedExtractionDetector({
        extractionService: createMockExtractionService([
          {
            type: 'guideline',
            name: 'ESLint',
            content: 'Use ESLint for linting',
            confidence: 0.85,
            category: 'tooling',
          },
          {
            type: 'guideline',
            name: 'Prettier',
            content: 'Use Prettier for code formatting',
            confidence: 0.85,
            category: 'tooling',
          },
        ]),
        knowledgeRepo: createMockRepo([]),
        guidelineRepo: createMockRepo(existingGuidelines),
        toolRepo: createMockRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Only Prettier should be in missed entries (ESLint filtered as duplicate)
      expect(result.totalExtracted).toBe(2);
      expect(result.duplicatesFiltered).toBe(1);
      expect(result.missedEntries.length).toBe(1);
      expect(result.missedEntries[0].content).toContain('Prettier');
    });

    it('should respect configuration overrides', async () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Some discussion', createdAt: '2026-01-20T10:00:00Z' },
        { role: 'assistant', content: 'Response', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'More discussion', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const customConfig: Partial<MissedExtractionConfig> = {
        confidenceThreshold: 0.95, // Very high threshold
        minMessages: 2, // Lower than default
        maxEntries: 5,
      };

      const detector = new MissedExtractionDetector({
        extractionService: createMockExtractionService([
          {
            type: 'knowledge',
            name: 'Low Confidence Entry',
            content: 'Some fact with low confidence',
            confidence: 0.8, // Below 0.95 threshold
            category: 'fact',
          },
        ]),
        knowledgeRepo: createMockRepo([]),
        guidelineRepo: createMockRepo([]),
        toolRepo: createMockRepo([]),
        config: customConfig,
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Should filter due to high confidence threshold
      expect(result.belowThresholdCount).toBe(1);
      expect(result.missedEntries.length).toBe(0);
    });
  });

  // =============================================================================
  // Mixed Entry Type Extraction
  // =============================================================================

  describe('mixed entry type handling', () => {
    it('should correctly categorize mixed entry types from conversation', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: `Here are our standards:
          1. We use PostgreSQL for the database (fact)
          2. Always validate inputs with Zod (guideline)
          3. Run npm run test:integration for integration tests (tool)`,
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'Understood.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Thanks.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: createMockExtractionService([
          {
            type: 'knowledge',
            name: 'Database Choice',
            content: 'PostgreSQL is used as the primary database',
            confidence: 0.9,
            category: 'decision',
          },
          {
            type: 'guideline',
            name: 'Input Validation',
            content: 'Always validate inputs with Zod schemas',
            confidence: 0.88,
            category: 'validation',
          },
          {
            type: 'tool',
            name: 'Integration Tests',
            content: 'npm run test:integration - runs integration test suite',
            confidence: 0.85,
            category: 'cli',
          },
        ]),
        knowledgeRepo: createMockRepo([]),
        guidelineRepo: createMockRepo([]),
        toolRepo: createMockRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      // Verify all three types are captured
      expect(result.missedEntries.length).toBe(3);
      expect(result.missedEntries.filter((e) => e.type === 'knowledge').length).toBe(1);
      expect(result.missedEntries.filter((e) => e.type === 'guideline').length).toBe(1);
      expect(result.missedEntries.filter((e) => e.type === 'tool').length).toBe(1);
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('edge cases', () => {
    it('should handle very long conversations', async () => {
      // Generate a long conversation
      const messages: ConversationMessage[] = [];
      for (let i = 0; i < 100; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i} with some content about the project.`,
          createdAt: new Date(Date.now() + i * 1000).toISOString(),
        });
      }

      const detector = new MissedExtractionDetector({
        extractionService: createMockExtractionService([
          {
            type: 'knowledge',
            name: 'Long Conversation Fact',
            content: 'Fact extracted from long conversation',
            confidence: 0.85,
            category: 'fact',
          },
        ]),
        knowledgeRepo: createMockRepo([]),
        guidelineRepo: createMockRepo([]),
        toolRepo: createMockRepo([]),
        config: { maxEntries: 10 }, // Limit entries
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.success).toBe(true);
      expect(result.missedEntries.length).toBeLessThanOrEqual(10);
    });

    it('should handle conversation with system messages', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'system',
          content: 'You are a helpful coding assistant.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        {
          role: 'user',
          content: 'The API uses OAuth 2.0 for authentication.',
          createdAt: '2026-01-20T10:00:10Z',
        },
        {
          role: 'assistant',
          content: 'OAuth 2.0 is a secure choice.',
          createdAt: '2026-01-20T10:00:20Z',
        },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: createMockExtractionService([
          {
            type: 'knowledge',
            name: 'Authentication',
            content: 'API uses OAuth 2.0 for authentication',
            confidence: 0.9,
            category: 'security',
          },
        ]),
        knowledgeRepo: createMockRepo([]),
        guidelineRepo: createMockRepo([]),
        toolRepo: createMockRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.success).toBe(true);
      expect(result.missedEntries.length).toBe(1);
    });

    it('should handle extraction when service returns many low-confidence entries', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Lots of maybes and uncertainties.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'I see.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'More uncertain things.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      // Many low-confidence entries
      const lowConfidenceEntries = Array.from({ length: 10 }, (_, i) => ({
        type: 'knowledge' as const,
        name: `Low Confidence ${i}`,
        content: `Maybe something ${i}`,
        confidence: 0.4 + i * 0.02, // 0.4 to 0.58 - all below 0.7
        category: 'suggestion',
      }));

      const detector = new MissedExtractionDetector({
        extractionService: createMockExtractionService(lowConfidenceEntries),
        knowledgeRepo: createMockRepo([]),
        guidelineRepo: createMockRepo([]),
        toolRepo: createMockRepo([]),
        config: { confidenceThreshold: 0.7 },
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        projectId: 'test-project',
        messages,
        scopeType: 'project',
        scopeId: 'test-project',
      });

      expect(result.totalExtracted).toBe(10);
      expect(result.belowThresholdCount).toBe(10);
      expect(result.missedEntries.length).toBe(0);
    });
  });

  // =============================================================================
  // Scope Handling
  // =============================================================================

  describe('scope handling', () => {
    it('should work with global scope', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Global standard: Use ISO 8601 for dates.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'Good standard.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Yes.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: createMockExtractionService([
          {
            type: 'guideline',
            name: 'Date Format',
            content: 'Use ISO 8601 format for all dates',
            confidence: 0.9,
            category: 'formatting',
          },
        ]),
        knowledgeRepo: createMockRepo([]),
        guidelineRepo: createMockRepo([]),
        toolRepo: createMockRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        messages,
        scopeType: 'global',
        // No scopeId for global scope
      });

      expect(result.success).toBe(true);
      expect(result.missedEntries.length).toBe(1);
    });

    it('should work with session scope', async () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'For this session only: Use debug mode.',
          createdAt: '2026-01-20T10:00:00Z',
        },
        { role: 'assistant', content: 'Debug mode enabled.', createdAt: '2026-01-20T10:00:10Z' },
        { role: 'user', content: 'Thanks.', createdAt: '2026-01-20T10:00:20Z' },
      ];

      const detector = new MissedExtractionDetector({
        extractionService: createMockExtractionService([
          {
            type: 'knowledge',
            name: 'Debug Mode',
            content: 'Debug mode is enabled for this session',
            confidence: 0.8,
            category: 'configuration',
          },
        ]),
        knowledgeRepo: createMockRepo([]),
        guidelineRepo: createMockRepo([]),
        toolRepo: createMockRepo([]),
      });

      const result = await detector.detect({
        sessionId: 'test-session',
        messages,
        scopeType: 'session',
        scopeId: 'test-session',
      });

      expect(result.success).toBe(true);
      expect(result.missedEntries.length).toBe(1);
    });
  });
});

// =============================================================================
// HELPER FACTORIES
// =============================================================================

function createMockExtractionService(
  entries: Array<{
    type: 'knowledge' | 'guideline' | 'tool';
    name: string;
    content: string;
    confidence: number;
    category: string;
  }>
) {
  return {
    isAvailable: () => true,
    extract: vi.fn().mockResolvedValue({
      entries,
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'test',
      processingTimeMs: 100,
    }),
    getProvider: () => 'test',
  };
}

function createMockRepo(existingContent: string[]) {
  return {
    findByScope: vi.fn().mockResolvedValue(
      existingContent.map((content, i) => ({
        id: `entry-${i}`,
        content,
        name: content.substring(0, 50),
        title: content.substring(0, 50),
        description: content,
      }))
    ),
    findByScopeWithEmbeddings: vi.fn().mockResolvedValue(
      existingContent.map((content, i) => ({
        id: `entry-${i}`,
        content,
        name: content.substring(0, 50),
        title: content.substring(0, 50),
        description: content,
        embedding: new Array(1536).fill(0.1),
      }))
    ),
  };
}
