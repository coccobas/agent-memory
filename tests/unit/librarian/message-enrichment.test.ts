import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IExtractionService } from '../../../src/core/context.js';
import type { AppDb } from '../../../src/core/types.js';
import type { Repositories } from '../../../src/core/interfaces/repositories.js';

function createMockExtractionService(response?: string): IExtractionService {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    getProvider: vi.fn().mockReturnValue('ollama'),
    extract: vi.fn().mockResolvedValue({
      entries: [],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'ollama',
      processingTimeMs: 100,
    }),
    extractForClassification: vi.fn().mockResolvedValue({
      entries: [],
      entities: [],
      relationships: [],
      model: 'test-model',
      provider: 'ollama',
      processingTimeMs: 100,
    }),
    generate: vi.fn().mockResolvedValue({
      texts: [response ?? ''],
      model: 'test-model',
      provider: 'ollama',
      processingTimeMs: 100,
    }),
  };
}

describe('Message Relevance Scoring', () => {
  describe('runMessageRelevanceScoring', () => {
    it('should skip when extraction service is not available', async () => {
      const { runMessageRelevanceScoring } =
        await import('../../../src/services/librarian/maintenance/message-relevance-scoring.js');

      const result = await runMessageRelevanceScoring(
        { db: {} as AppDb, extractionService: undefined },
        { scopeType: 'project', scopeId: 'test-project' },
        { enabled: true, maxMessagesPerRun: 100, thresholds: { high: 0.8, medium: 0.5, low: 0 } }
      );

      expect(result.executed).toBe(false);
      expect(result.messagesScored).toBe(0);
    });

    it('should return correct result structure', async () => {
      const { runMessageRelevanceScoring } =
        await import('../../../src/services/librarian/maintenance/message-relevance-scoring.js');

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      } as unknown as AppDb;

      const result = await runMessageRelevanceScoring(
        { db: mockDb, extractionService: createMockExtractionService() },
        { scopeType: 'project', scopeId: 'test-project' },
        { enabled: true, maxMessagesPerRun: 100, thresholds: { high: 0.8, medium: 0.5, low: 0 } }
      );

      expect(result).toHaveProperty('executed');
      expect(result).toHaveProperty('messagesScored');
      expect(result).toHaveProperty('byCategory');
      expect(result).toHaveProperty('durationMs');
      expect(result.byCategory).toHaveProperty('high');
      expect(result.byCategory).toHaveProperty('medium');
      expect(result.byCategory).toHaveProperty('low');
    });
  });
});

describe('Experience Title Improvement', () => {
  describe('runExperienceTitleImprovement', () => {
    it('should skip when extraction service is not available', async () => {
      const { runExperienceTitleImprovement } =
        await import('../../../src/services/librarian/maintenance/experience-title-improvement.js');

      const result = await runExperienceTitleImprovement(
        { db: {} as AppDb, extractionService: undefined },
        { scopeType: 'project', scopeId: 'test-project' },
        {
          enabled: true,
          maxEntriesPerRun: 100,
          onlyGenericTitles: true,
          genericTitlePattern: '^Episode:\\s',
        }
      );

      expect(result.executed).toBe(false);
      expect(result.experiencesScanned).toBe(0);
      expect(result.titlesImproved).toBe(0);
    });

    it('should return correct result structure', async () => {
      const { runExperienceTitleImprovement } =
        await import('../../../src/services/librarian/maintenance/experience-title-improvement.js');

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      } as unknown as AppDb;

      const result = await runExperienceTitleImprovement(
        { db: mockDb, extractionService: createMockExtractionService() },
        { scopeType: 'project', scopeId: 'test-project' },
        {
          enabled: true,
          maxEntriesPerRun: 100,
          onlyGenericTitles: true,
          genericTitlePattern: '^Episode:\\s',
        }
      );

      expect(result).toHaveProperty('executed');
      expect(result).toHaveProperty('experiencesScanned');
      expect(result).toHaveProperty('titlesImproved');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('durationMs');
    });

    it('should parse valid LLM title response', async () => {
      const { runExperienceTitleImprovement } =
        await import('../../../src/services/librarian/maintenance/experience-title-improvement.js');

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'exp-1',
                    title: 'Episode: Fix auth bug',
                    category: 'debugging',
                    currentVersionId: 'ver-1',
                    scenario: 'Auth was failing',
                    outcome: 'Fixed token refresh',
                    content: 'Increased token expiry time',
                  },
                ]),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      } as unknown as AppDb;

      const extractionService = createMockExtractionService(
        JSON.stringify({ title: 'Fixed authentication token refresh bug', confidence: 0.9 })
      );

      const result = await runExperienceTitleImprovement(
        { db: mockDb, extractionService },
        { scopeType: 'project', scopeId: 'test-project' },
        {
          enabled: true,
          maxEntriesPerRun: 100,
          onlyGenericTitles: true,
          genericTitlePattern: '^Episode:\\s',
        }
      );

      expect(result.executed).toBe(true);
      expect(result.experiencesScanned).toBe(1);
      expect(result.titlesImproved).toBe(1);
    });
  });
});

describe('Message Insight Extraction', () => {
  describe('runMessageInsightExtraction', () => {
    it('should skip when extraction service is not available', async () => {
      const { runMessageInsightExtraction } =
        await import('../../../src/services/librarian/maintenance/message-insight-extraction.js');

      const mockRepos = {
        episodes: {
          list: vi.fn().mockResolvedValue([]),
        },
        conversations: {
          getMessagesByEpisode: vi.fn().mockResolvedValue([]),
        },
        knowledge: {
          create: vi.fn(),
        },
        entryRelations: {
          create: vi.fn(),
        },
      } as unknown as Repositories;

      const result = await runMessageInsightExtraction(
        { repos: mockRepos, extractionService: undefined },
        { scopeType: 'project', scopeId: 'test-project' },
        {
          enabled: true,
          minMessages: 3,
          confidenceThreshold: 0.7,
          maxEntriesPerRun: 50,
          focusAreas: ['decisions', 'facts'],
        }
      );

      expect(result.executed).toBe(false);
      expect(result.episodesProcessed).toBe(0);
    });

    it('should skip when episodes repository is not available', async () => {
      const { runMessageInsightExtraction } =
        await import('../../../src/services/librarian/maintenance/message-insight-extraction.js');

      const mockRepos = {
        episodes: undefined,
        conversations: {
          getMessagesByEpisode: vi.fn().mockResolvedValue([]),
        },
        knowledge: {
          create: vi.fn(),
        },
        entryRelations: {
          create: vi.fn(),
        },
      } as unknown as Repositories;

      const result = await runMessageInsightExtraction(
        { repos: mockRepos, extractionService: createMockExtractionService() },
        { scopeType: 'project', scopeId: 'test-project' },
        {
          enabled: true,
          minMessages: 3,
          confidenceThreshold: 0.7,
          maxEntriesPerRun: 50,
          focusAreas: ['decisions', 'facts'],
        }
      );

      expect(result.executed).toBe(false);
    });

    it('should return correct result structure', async () => {
      const { runMessageInsightExtraction } =
        await import('../../../src/services/librarian/maintenance/message-insight-extraction.js');

      const mockRepos = {
        episodes: {
          list: vi.fn().mockResolvedValue([]),
        },
        conversations: {
          getMessagesByEpisode: vi.fn().mockResolvedValue([]),
        },
        knowledge: {
          create: vi.fn(),
        },
        entryRelations: {
          create: vi.fn(),
        },
      } as unknown as Repositories;

      const result = await runMessageInsightExtraction(
        { repos: mockRepos, extractionService: createMockExtractionService() },
        { scopeType: 'project', scopeId: 'test-project' },
        {
          enabled: true,
          minMessages: 3,
          confidenceThreshold: 0.7,
          maxEntriesPerRun: 50,
          focusAreas: ['decisions', 'facts'],
        }
      );

      expect(result).toHaveProperty('executed');
      expect(result).toHaveProperty('episodesProcessed');
      expect(result).toHaveProperty('messagesAnalyzed');
      expect(result).toHaveProperty('insightsExtracted');
      expect(result).toHaveProperty('knowledgeEntriesCreated');
      expect(result).toHaveProperty('relationsCreated');
      expect(result).toHaveProperty('durationMs');
    });

    it('should skip episodes with too few messages', async () => {
      const { runMessageInsightExtraction } =
        await import('../../../src/services/librarian/maintenance/message-insight-extraction.js');

      const mockRepos = {
        episodes: {
          list: vi
            .fn()
            .mockResolvedValue([{ id: 'ep-1', name: 'Test Episode', outcome: 'success' }]),
        },
        conversations: {
          getMessagesByEpisode: vi.fn().mockResolvedValue([{ role: 'user', content: 'Hello' }]),
        },
        knowledge: {
          create: vi.fn(),
        },
        entryRelations: {
          create: vi.fn(),
        },
      } as unknown as Repositories;

      const result = await runMessageInsightExtraction(
        { repos: mockRepos, extractionService: createMockExtractionService() },
        { scopeType: 'project', scopeId: 'test-project' },
        {
          enabled: true,
          minMessages: 3,
          confidenceThreshold: 0.7,
          maxEntriesPerRun: 50,
          focusAreas: ['decisions', 'facts'],
        }
      );

      expect(result.executed).toBe(true);
      expect(result.episodesProcessed).toBe(0);
      expect(result.messagesAnalyzed).toBe(0);
    });

    it('should extract insights from episodes with sufficient messages', async () => {
      const { runMessageInsightExtraction } =
        await import('../../../src/services/librarian/maintenance/message-insight-extraction.js');

      const mockKnowledgeEntry = { id: 'know-1' };
      const mockRepos = {
        episodes: {
          list: vi
            .fn()
            .mockResolvedValue([
              { id: 'ep-1', name: 'Fix auth bug', outcome: 'Fixed token refresh issue' },
            ]),
        },
        conversations: {
          getMessagesByEpisode: vi.fn().mockResolvedValue([
            { role: 'user', content: 'The auth is broken' },
            { role: 'assistant', content: 'Let me check the token refresh' },
            { role: 'user', content: 'Found it - token expires too early' },
            { role: 'assistant', content: 'I will increase the expiry time' },
          ]),
        },
        knowledge: {
          create: vi.fn().mockResolvedValue(mockKnowledgeEntry),
        },
        entryRelations: {
          create: vi.fn().mockResolvedValue({}),
        },
      } as unknown as Repositories;

      const llmResponse = JSON.stringify({
        decisions: [{ text: 'Decided to increase token expiry time', confidence: 0.9 }],
        problems: [{ text: 'Token was expiring too early', confidence: 0.85 }],
        solutions: [{ text: 'Increased token expiry from 1h to 24h', confidence: 0.9 }],
        learnings: [],
      });

      const result = await runMessageInsightExtraction(
        { repos: mockRepos, extractionService: createMockExtractionService(llmResponse) },
        { scopeType: 'project', scopeId: 'test-project' },
        {
          enabled: true,
          minMessages: 3,
          confidenceThreshold: 0.7,
          maxEntriesPerRun: 50,
          focusAreas: ['decisions', 'facts'],
        }
      );

      expect(result.executed).toBe(true);
      expect(result.episodesProcessed).toBe(1);
      expect(result.messagesAnalyzed).toBe(4);
      expect(result.insightsExtracted).toBe(3);
      expect(result.knowledgeEntriesCreated).toBe(3);
    });
  });
});

describe('Maintenance Config Defaults', () => {
  it('should have LLM tasks disabled by default', async () => {
    const { DEFAULT_MAINTENANCE_CONFIG } =
      await import('../../../src/services/librarian/maintenance/types.js');

    expect(DEFAULT_MAINTENANCE_CONFIG.messageInsightExtraction.enabled).toBe(false);
    expect(DEFAULT_MAINTENANCE_CONFIG.messageRelevanceScoring.enabled).toBe(false);
    expect(DEFAULT_MAINTENANCE_CONFIG.experienceTitleImprovement.enabled).toBe(false);
  });

  it('should have correct config structure for message insight extraction', async () => {
    const { DEFAULT_MAINTENANCE_CONFIG } =
      await import('../../../src/services/librarian/maintenance/types.js');

    const config = DEFAULT_MAINTENANCE_CONFIG.messageInsightExtraction;
    expect(config).toHaveProperty('enabled');
    expect(config).toHaveProperty('minMessages');
    expect(config).toHaveProperty('confidenceThreshold');
    expect(config).toHaveProperty('maxEntriesPerRun');
    expect(config).toHaveProperty('focusAreas');
  });

  it('should have correct config structure for message relevance scoring', async () => {
    const { DEFAULT_MAINTENANCE_CONFIG } =
      await import('../../../src/services/librarian/maintenance/types.js');

    const config = DEFAULT_MAINTENANCE_CONFIG.messageRelevanceScoring;
    expect(config).toHaveProperty('enabled');
    expect(config).toHaveProperty('maxMessagesPerRun');
    expect(config).toHaveProperty('thresholds');
    expect(config.thresholds).toHaveProperty('high');
    expect(config.thresholds).toHaveProperty('medium');
    expect(config.thresholds).toHaveProperty('low');
  });

  it('should have correct config structure for experience title improvement', async () => {
    const { DEFAULT_MAINTENANCE_CONFIG } =
      await import('../../../src/services/librarian/maintenance/types.js');

    const config = DEFAULT_MAINTENANCE_CONFIG.experienceTitleImprovement;
    expect(config).toHaveProperty('enabled');
    expect(config).toHaveProperty('maxEntriesPerRun');
    expect(config).toHaveProperty('onlyGenericTitles');
    expect(config).toHaveProperty('genericTitlePattern');
  });
});
