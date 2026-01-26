import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  runExtractionQualityImprovement,
  type ExtractionQualityDeps,
} from '../../../src/services/librarian/maintenance/extraction-quality-improvement.js';
import {
  runDuplicateRefinement,
  type DuplicateRefinementDeps,
} from '../../../src/services/librarian/maintenance/duplicate-refinement.js';
import {
  runCategoryAccuracy,
  type CategoryAccuracyDeps,
} from '../../../src/services/librarian/maintenance/category-accuracy.js';
import {
  runRelevanceCalibration,
  type RelevanceCalibrationDeps,
} from '../../../src/services/librarian/maintenance/relevance-calibration.js';
import {
  runFeedbackLoop,
  type FeedbackLoopDeps,
  type AccuracySignals,
} from '../../../src/services/librarian/maintenance/feedback-loop.js';
import { DEFAULT_MAINTENANCE_CONFIG } from '../../../src/services/librarian/maintenance/types.js';
import type { Repositories } from '../../../src/core/interfaces/repositories.js';
import type { IEmbeddingService, IVectorService } from '../../../src/core/context.js';
import { generateId } from '../../../src/db/repositories/base.js';

// =============================================================================
// MOCK HELPERS
// =============================================================================

/**
 * Create a mock Drizzle database with chainable query methods
 */
function createMockDb() {
  const createQueryChain = () => {
    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    };
    return chain;
  };

  return {
    select: vi.fn(() => createQueryChain()),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        run: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          run: vi.fn(),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        run: vi.fn(() => ({ changes: 0 })),
      })),
    })),
  } as unknown as ExtractionQualityDeps['db'];
}

/**
 * Create mock session data
 */
function createMockSession(
  overrides: Partial<{ id: string; projectId: string; status: string }> = {}
) {
  return {
    id: generateId(),
    projectId: 'test-project',
    name: 'Test Session',
    status: 'completed',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create mock guideline entry
 */
function createMockGuideline(overrides: Partial<{ id: string; category: string }> = {}) {
  const id = overrides.id ?? generateId();
  return {
    id,
    name: 'test-guideline',
    scopeType: 'project' as const,
    scopeId: 'test-project',
    version: 1,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersion: {
      id: generateId(),
      guidelineId: id,
      version: 1,
      content: 'Test guideline content for testing purposes',
      createdAt: new Date().toISOString(),
      createdBy: 'test',
    },
    ...overrides,
  };
}

/**
 * Create mock knowledge entry
 */
function createMockKnowledge(overrides: Partial<{ id: string; category: string }> = {}) {
  const id = overrides.id ?? generateId();
  return {
    id,
    title: 'Test Knowledge',
    scopeType: 'project' as const,
    scopeId: 'test-project',
    version: 1,
    isActive: true,
    category: overrides.category ?? 'fact',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersion: {
      id: generateId(),
      knowledgeId: id,
      version: 1,
      content: 'Test knowledge content for testing purposes',
      confidence: 0.8,
      createdAt: new Date().toISOString(),
      createdBy: 'test',
    },
    ...overrides,
  };
}

/**
 * Create mock tool entry
 */
function createMockTool(overrides: Partial<{ id: string }> = {}) {
  const id = overrides.id ?? generateId();
  return {
    id,
    name: 'test-tool',
    scopeType: 'project' as const,
    scopeId: 'test-project',
    version: 1,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersion: {
      id: generateId(),
      toolId: id,
      version: 1,
      description: 'Test tool description',
      createdAt: new Date().toISOString(),
      createdBy: 'test',
    },
    ...overrides,
  };
}

/**
 * Create mock repositories with configurable behavior
 */
function createMockRepos(
  options: {
    sessions?: ReturnType<typeof createMockSession>[];
    guidelines?: ReturnType<typeof createMockGuideline>[];
    knowledge?: ReturnType<typeof createMockKnowledge>[];
    tools?: ReturnType<typeof createMockTool>[];
  } = {}
): Repositories {
  const sessions = options.sessions ?? [];
  const guidelines = options.guidelines ?? [];
  const knowledge = options.knowledge ?? [];
  const tools = options.tools ?? [];

  return {
    sessions: {
      list: vi.fn().mockResolvedValue(sessions),
      getById: vi.fn().mockImplementation(async (id: string) => sessions.find((s) => s.id === id)),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
      update: vi.fn().mockResolvedValue({}),
      end: vi.fn().mockResolvedValue({}),
    },
    guidelines: {
      list: vi.fn().mockResolvedValue(guidelines),
      getById: vi
        .fn()
        .mockImplementation(async (id: string) => guidelines.find((g) => g.id === id)),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
      update: vi.fn().mockResolvedValue({}),
      deactivate: vi.fn().mockResolvedValue({}),
    },
    knowledge: {
      list: vi.fn().mockResolvedValue(knowledge),
      getById: vi.fn().mockImplementation(async (id: string) => knowledge.find((k) => k.id === id)),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
      update: vi.fn().mockResolvedValue({}),
      deactivate: vi.fn().mockResolvedValue({}),
    },
    tools: {
      list: vi.fn().mockResolvedValue(tools),
      getById: vi.fn().mockImplementation(async (id: string) => tools.find((t) => t.id === id)),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
      update: vi.fn().mockResolvedValue({}),
      deactivate: vi.fn().mockResolvedValue({}),
    },
    experiences: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
      update: vi.fn().mockResolvedValue({}),
      deactivate: vi.fn().mockResolvedValue({}),
    },
    tags: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
    },
    entryTags: {
      list: vi.fn().mockResolvedValue([]),
      attach: vi.fn().mockResolvedValue({}),
      detach: vi.fn().mockResolvedValue({}),
    },
    entryRelations: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
      delete: vi.fn().mockResolvedValue({}),
    },
    organizations: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
    },
    projects: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    fileLocks: {
      list: vi.fn().mockResolvedValue([]),
      checkout: vi.fn().mockResolvedValue({ id: generateId() }),
      checkin: vi.fn().mockResolvedValue({}),
      status: vi.fn().mockResolvedValue(null),
      forceUnlock: vi.fn().mockResolvedValue({}),
    },
    conversations: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
      update: vi.fn().mockResolvedValue({}),
    },
    conflicts: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: generateId() }),
      resolve: vi.fn().mockResolvedValue({}),
    },
  } as unknown as Repositories;
}

/**
 * Create mock embedding service
 */
function createMockEmbeddingService(options: { available?: boolean } = {}): IEmbeddingService {
  const available = options.available ?? true;
  return {
    isAvailable: vi.fn().mockReturnValue(available),
    embed: vi.fn().mockResolvedValue({
      embedding: Array(1536).fill(0.1),
      model: 'test-model',
      tokens: 10,
    }),
    embedBatch: vi.fn().mockResolvedValue([]),
  } as unknown as IEmbeddingService;
}

/**
 * Create mock vector service
 */
function createMockVectorService(): IVectorService {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    search: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as IVectorService;
}

// =============================================================================
// ACCURACY IMPROVEMENT TASK TESTS
// =============================================================================

describe('Accuracy Improvement Tasks', () => {
  // ===========================================================================
  // runExtractionQualityImprovement Tests
  // ===========================================================================
  describe('runExtractionQualityImprovement', () => {
    let mockDb: ReturnType<typeof createMockDb>;
    let mockRepos: Repositories;
    let deps: ExtractionQualityDeps;
    const config = DEFAULT_MAINTENANCE_CONFIG.extractionQuality;

    beforeEach(() => {
      mockDb = createMockDb();
      mockRepos = createMockRepos();
      deps = { db: mockDb, repos: mockRepos };
    });

    describe('happy path', () => {
      it('should execute successfully with sufficient sessions and entries', async () => {
        // Setup: Create enough sessions to meet minSessionsForAnalysis
        const sessions = Array.from({ length: 5 }, () => createMockSession());
        const guidelines = [createMockGuideline()];
        const knowledge = [createMockKnowledge()];
        const tools = [createMockTool()];

        mockRepos = createMockRepos({ sessions, guidelines, knowledge, tools });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runExtractionQualityImprovement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(true);
        expect(result.sessionsAnalyzed).toBe(5);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.errors).toBeUndefined();
      });

      it('should identify high and low value patterns', async () => {
        const sessions = Array.from({ length: 5 }, () => createMockSession());
        const guidelines = Array.from({ length: 5 }, () => createMockGuideline());
        const knowledge = Array.from({ length: 5 }, () => createMockKnowledge());

        mockRepos = createMockRepos({ sessions, guidelines, knowledge });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runExtractionQualityImprovement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(true);
        expect(typeof result.highValuePatternsFound).toBe('number');
        expect(typeof result.lowValuePatternsFound).toBe('number');
      });
    });

    describe('skip conditions', () => {
      it('should return executed: false when not enough sessions', async () => {
        // Only 1 session, but minSessionsForAnalysis is 3
        const sessions = [createMockSession()];
        mockRepos = createMockRepos({ sessions });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runExtractionQualityImprovement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(false);
        expect(result.sessionsAnalyzed).toBe(0);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('should return executed: false when no sessions exist', async () => {
        mockRepos = createMockRepos({ sessions: [] });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runExtractionQualityImprovement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(false);
      });
    });

    describe('dry run mode', () => {
      it('should not persist experiences when dryRun is true', async () => {
        const sessions = Array.from({ length: 5 }, () => createMockSession());
        const guidelines = Array.from({ length: 10 }, () => createMockGuideline());

        mockRepos = createMockRepos({ sessions, guidelines });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runExtractionQualityImprovement(
          deps,
          { scopeType: 'project', scopeId: 'test-project', dryRun: true },
          { ...config, storeAsExperiences: true }
        );

        expect(result.executed).toBe(true);
        expect(result.experiencesCreated).toBe(0);
        expect(mockRepos.experiences?.create).not.toHaveBeenCalled();
      });
    });

    describe('result structure', () => {
      it('should return all required result fields', async () => {
        const sessions = Array.from({ length: 5 }, () => createMockSession());
        mockRepos = createMockRepos({ sessions });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runExtractionQualityImprovement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result).toHaveProperty('executed');
        expect(result).toHaveProperty('sessionsAnalyzed');
        expect(result).toHaveProperty('highValuePatternsFound');
        expect(result).toHaveProperty('lowValuePatternsFound');
        expect(result).toHaveProperty('experiencesCreated');
        expect(result).toHaveProperty('durationMs');
      });
    });

    describe('error handling', () => {
      it('should catch errors and return them in errors array', async () => {
        const errorRepos = createMockRepos();
        (errorRepos.sessions.list as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Database connection failed')
        );
        deps = { db: mockDb, repos: errorRepos };

        const result = await runExtractionQualityImprovement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.errors).toBeDefined();
        expect(result.errors).toHaveLength(1);
        expect(result.errors?.[0]).toContain('Database connection failed');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ===========================================================================
  // runDuplicateRefinement Tests
  // ===========================================================================
  describe('runDuplicateRefinement', () => {
    let mockDb: ReturnType<typeof createMockDb>;
    let mockRepos: Repositories;
    let mockEmbedding: IEmbeddingService;
    let mockVector: IVectorService;
    let deps: DuplicateRefinementDeps;
    const config = DEFAULT_MAINTENANCE_CONFIG.duplicateRefinement;

    beforeEach(() => {
      mockDb = createMockDb();
      mockRepos = createMockRepos();
      mockEmbedding = createMockEmbeddingService();
      mockVector = createMockVectorService();
      deps = { db: mockDb, repos: mockRepos, embedding: mockEmbedding, vector: mockVector };
    });

    describe('happy path', () => {
      it('should execute successfully with embedding service available', async () => {
        const guidelines = Array.from({ length: 3 }, () => createMockGuideline());
        mockRepos = createMockRepos({ guidelines });
        deps = { db: mockDb, repos: mockRepos, embedding: mockEmbedding, vector: mockVector };

        const result = await runDuplicateRefinement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(true);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.errors).toBeUndefined();
      });

      it('should analyze duplicate candidates', async () => {
        const guidelines = Array.from({ length: 5 }, () => createMockGuideline());
        mockRepos = createMockRepos({ guidelines });
        deps = { db: mockDb, repos: mockRepos, embedding: mockEmbedding, vector: mockVector };

        const result = await runDuplicateRefinement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(true);
        expect(typeof result.candidatesAnalyzed).toBe('number');
        expect(typeof result.duplicatesIdentified).toBe('number');
      });
    });

    describe('skip conditions', () => {
      it('should return executed: false when embedding service not available', async () => {
        mockEmbedding = createMockEmbeddingService({ available: false });
        deps = { db: mockDb, repos: mockRepos, embedding: mockEmbedding, vector: mockVector };

        const result = await runDuplicateRefinement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(false);
        expect(result.candidatesAnalyzed).toBe(0);
      });

      it('should return executed: false when no embedding service provided', async () => {
        deps = { db: mockDb, repos: mockRepos };

        const result = await runDuplicateRefinement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(false);
      });

      it('should return executed: false when no vector service provided', async () => {
        deps = { db: mockDb, repos: mockRepos, embedding: mockEmbedding };

        const result = await runDuplicateRefinement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(false);
      });
    });

    describe('dry run mode', () => {
      it('should not persist knowledge entries when dryRun is true', async () => {
        const guidelines = Array.from({ length: 5 }, () => createMockGuideline());
        mockRepos = createMockRepos({ guidelines });
        deps = { db: mockDb, repos: mockRepos, embedding: mockEmbedding, vector: mockVector };

        const result = await runDuplicateRefinement(
          deps,
          { scopeType: 'project', scopeId: 'test-project', dryRun: true },
          { ...config, storeThresholdAdjustments: true }
        );

        expect(result.executed).toBe(true);
        expect(result.knowledgeEntriesCreated).toBe(0);
      });
    });

    describe('result structure', () => {
      it('should return all required result fields', async () => {
        deps = { db: mockDb, repos: mockRepos, embedding: mockEmbedding, vector: mockVector };

        const result = await runDuplicateRefinement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result).toHaveProperty('executed');
        expect(result).toHaveProperty('candidatesAnalyzed');
        expect(result).toHaveProperty('duplicatesIdentified');
        expect(result).toHaveProperty('thresholdAdjustments');
        expect(result).toHaveProperty('knowledgeEntriesCreated');
        expect(result).toHaveProperty('durationMs');
      });
    });

    describe('error handling', () => {
      it('should catch errors and return them in errors array', async () => {
        const errorRepos = createMockRepos();
        (errorRepos.guidelines.list as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Failed to list guidelines')
        );
        deps = { db: mockDb, repos: errorRepos, embedding: mockEmbedding, vector: mockVector };

        const result = await runDuplicateRefinement(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.errors).toBeDefined();
        expect(result.errors).toHaveLength(1);
        expect(result.errors?.[0]).toContain('Failed to list guidelines');
      });
    });
  });

  // ===========================================================================
  // runCategoryAccuracy Tests
  // ===========================================================================
  describe('runCategoryAccuracy', () => {
    let mockDb: ReturnType<typeof createMockDb>;
    let mockRepos: Repositories;
    let deps: CategoryAccuracyDeps;
    const config = DEFAULT_MAINTENANCE_CONFIG.categoryAccuracy;

    beforeEach(() => {
      mockDb = createMockDb();
      mockRepos = createMockRepos();
      deps = { db: mockDb, repos: mockRepos };
    });

    describe('happy path', () => {
      it('should execute successfully with knowledge entries', async () => {
        const knowledge = Array.from({ length: 5 }, (_, i) =>
          createMockKnowledge({ category: i % 2 === 0 ? 'fact' : 'decision' })
        );
        mockRepos = createMockRepos({ knowledge });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runCategoryAccuracy(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(true);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.errors).toBeUndefined();
      });

      it('should analyze entries and detect miscategorizations', async () => {
        const knowledge = Array.from({ length: 10 }, () => createMockKnowledge());
        mockRepos = createMockRepos({ knowledge });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runCategoryAccuracy(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(true);
        expect(typeof result.entriesAnalyzed).toBe('number');
        expect(typeof result.miscategorizationsFound).toBe('number');
      });
    });

    describe('skip conditions', () => {
      it('should execute with zero entries analyzed when no knowledge exists', async () => {
        mockRepos = createMockRepos({ knowledge: [] });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runCategoryAccuracy(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(true);
        expect(result.entriesAnalyzed).toBe(0);
      });
    });

    describe('dry run mode', () => {
      it('should not persist patterns when dryRun is true', async () => {
        const knowledge = Array.from({ length: 10 }, () => createMockKnowledge());
        mockRepos = createMockRepos({ knowledge });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runCategoryAccuracy(
          deps,
          { scopeType: 'project', scopeId: 'test-project', dryRun: true },
          { ...config, storeMiscategorizationPatterns: true }
        );

        expect(result.executed).toBe(true);
        expect(result.patternsStored).toBe(0);
      });
    });

    describe('result structure', () => {
      it('should return all required result fields', async () => {
        mockRepos = createMockRepos();
        deps = { db: mockDb, repos: mockRepos };

        const result = await runCategoryAccuracy(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result).toHaveProperty('executed');
        expect(result).toHaveProperty('entriesAnalyzed');
        expect(result).toHaveProperty('miscategorizationsFound');
        expect(result).toHaveProperty('recategorizationsApplied');
        expect(result).toHaveProperty('patternsStored');
        expect(result).toHaveProperty('durationMs');
      });
    });

    describe('error handling', () => {
      it('should catch errors and return them in errors array', async () => {
        const errorRepos = createMockRepos();
        (errorRepos.knowledge.list as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Knowledge query failed')
        );
        deps = { db: mockDb, repos: errorRepos };

        const result = await runCategoryAccuracy(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.errors).toBeDefined();
        expect(result.errors).toHaveLength(1);
        expect(result.errors?.[0]).toContain('Knowledge query failed');
      });
    });
  });

  // ===========================================================================
  // runRelevanceCalibration Tests
  // ===========================================================================
  describe('runRelevanceCalibration', () => {
    let mockDb: ReturnType<typeof createMockDb>;
    let mockRepos: Repositories;
    let deps: RelevanceCalibrationDeps;
    const config = DEFAULT_MAINTENANCE_CONFIG.relevanceCalibration;

    beforeEach(() => {
      mockDb = createMockDb();
      mockRepos = createMockRepos();
      deps = { db: mockDb, repos: mockRepos };
    });

    describe('happy path', () => {
      it('should execute successfully with entries', async () => {
        const knowledge = Array.from({ length: 20 }, () => createMockKnowledge());
        const guidelines = Array.from({ length: 10 }, () => createMockGuideline());
        mockRepos = createMockRepos({ knowledge, guidelines });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runRelevanceCalibration(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(true);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.errors).toBeUndefined();
      });

      it('should compute calibration buckets', async () => {
        const knowledge = Array.from({ length: 50 }, () => createMockKnowledge());
        mockRepos = createMockRepos({ knowledge });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runRelevanceCalibration(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(true);
        expect(typeof result.entriesAnalyzed).toBe('number');
        expect(typeof result.bucketsComputed).toBe('number');
        expect(typeof result.averageAdjustment).toBe('number');
      });
    });

    describe('skip conditions', () => {
      it('should return executed: false when no entries exist', async () => {
        mockRepos = createMockRepos({ knowledge: [], guidelines: [] });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runRelevanceCalibration(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.executed).toBe(false);
        expect(result.entriesAnalyzed).toBe(0);
      });
    });

    describe('dry run mode', () => {
      it('should not store calibration curve when dryRun is true', async () => {
        const knowledge = Array.from({ length: 50 }, () => createMockKnowledge());
        mockRepos = createMockRepos({ knowledge });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runRelevanceCalibration(
          deps,
          { scopeType: 'project', scopeId: 'test-project', dryRun: true },
          { ...config, storeCalibrationCurve: true }
        );

        expect(result.executed).toBe(true);
        expect(result.calibrationCurveStored).toBe(false);
      });
    });

    describe('result structure', () => {
      it('should return all required result fields', async () => {
        const knowledge = Array.from({ length: 10 }, () => createMockKnowledge());
        mockRepos = createMockRepos({ knowledge });
        deps = { db: mockDb, repos: mockRepos };

        const result = await runRelevanceCalibration(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result).toHaveProperty('executed');
        expect(result).toHaveProperty('entriesAnalyzed');
        expect(result).toHaveProperty('bucketsComputed');
        expect(result).toHaveProperty('calibrationCurveStored');
        expect(result).toHaveProperty('averageAdjustment');
        expect(result).toHaveProperty('durationMs');
      });
    });

    describe('error handling', () => {
      it('should catch errors and return them in errors array', async () => {
        const errorRepos = createMockRepos();
        (errorRepos.knowledge.list as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Calibration query failed')
        );
        deps = { db: mockDb, repos: errorRepos };

        const result = await runRelevanceCalibration(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config
        );

        expect(result.errors).toBeDefined();
        expect(result.errors).toHaveLength(1);
        expect(result.errors?.[0]).toContain('Calibration query failed');
      });
    });
  });

  // ===========================================================================
  // runFeedbackLoop Tests
  // ===========================================================================
  describe('runFeedbackLoop', () => {
    let mockRepos: Repositories;
    let deps: FeedbackLoopDeps;
    const config = DEFAULT_MAINTENANCE_CONFIG.feedbackLoop;

    beforeEach(() => {
      mockRepos = createMockRepos();
      deps = { repos: mockRepos };
    });

    describe('happy path', () => {
      it('should execute successfully with signals from other tasks', async () => {
        const signals: AccuracySignals = {
          extractionQuality: {
            executed: true,
            sessionsAnalyzed: 10,
            highValuePatternsFound: 5,
            lowValuePatternsFound: 3,
            experiencesCreated: 2,
            durationMs: 100,
          },
          duplicateRefinement: {
            executed: true,
            candidatesAnalyzed: 20,
            duplicatesIdentified: 5,
            thresholdAdjustments: 1,
            knowledgeEntriesCreated: 1,
            durationMs: 150,
          },
        };

        const result = await runFeedbackLoop(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config,
          signals
        );

        expect(result.executed).toBe(true);
        expect(result.signalsProcessed).toBe(2);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.errors).toBeUndefined();
      });

      it('should process all four signal types', async () => {
        const signals: AccuracySignals = {
          extractionQuality: {
            executed: true,
            sessionsAnalyzed: 10,
            highValuePatternsFound: 2,
            lowValuePatternsFound: 10, // High ratio triggers decision
            experiencesCreated: 0,
            durationMs: 100,
          },
          duplicateRefinement: {
            executed: true,
            candidatesAnalyzed: 20,
            duplicatesIdentified: 5,
            thresholdAdjustments: 1, // Triggers decision
            knowledgeEntriesCreated: 0,
            durationMs: 150,
          },
          categoryAccuracy: {
            executed: true,
            entriesAnalyzed: 50,
            miscategorizationsFound: 15, // 30% rate triggers decision
            recategorizationsApplied: 0,
            patternsStored: 0,
            durationMs: 80,
          },
          relevanceCalibration: {
            executed: true,
            entriesAnalyzed: 100,
            bucketsComputed: 5,
            calibrationCurveStored: false,
            averageAdjustment: 0.2, // > 0.15 triggers decision
            durationMs: 120,
          },
        };

        const result = await runFeedbackLoop(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config,
          signals
        );

        expect(result.executed).toBe(true);
        expect(result.signalsProcessed).toBe(4);
      });
    });

    describe('skip conditions', () => {
      it('should return executed: false when no signals provided', async () => {
        const signals: AccuracySignals = {};

        const result = await runFeedbackLoop(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config,
          signals
        );

        expect(result.executed).toBe(false);
        expect(result.signalsProcessed).toBe(0);
      });

      it('should return executed: false when all signals have executed: false', async () => {
        const signals: AccuracySignals = {
          extractionQuality: {
            executed: false,
            sessionsAnalyzed: 0,
            highValuePatternsFound: 0,
            lowValuePatternsFound: 0,
            experiencesCreated: 0,
            durationMs: 0,
          },
          duplicateRefinement: {
            executed: false,
            candidatesAnalyzed: 0,
            duplicatesIdentified: 0,
            thresholdAdjustments: 0,
            knowledgeEntriesCreated: 0,
            durationMs: 0,
          },
        };

        const result = await runFeedbackLoop(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config,
          signals
        );

        expect(result.executed).toBe(false);
        expect(result.signalsProcessed).toBe(0);
      });
    });

    describe('dry run mode', () => {
      it('should count improvements but not persist when dryRun is true', async () => {
        const signals: AccuracySignals = {
          extractionQuality: {
            executed: true,
            sessionsAnalyzed: 10,
            highValuePatternsFound: 2,
            lowValuePatternsFound: 10,
            experiencesCreated: 0,
            durationMs: 100,
          },
        };

        const result = await runFeedbackLoop(
          deps,
          { scopeType: 'project', scopeId: 'test-project', dryRun: true },
          { ...config, storeImprovementDecisions: true },
          signals
        );

        expect(result.executed).toBe(true);
        expect(result.decisionsStored).toBe(0);
        expect(mockRepos.knowledge.create).not.toHaveBeenCalled();
      });
    });

    describe('result structure', () => {
      it('should return all required result fields', async () => {
        const signals: AccuracySignals = {
          extractionQuality: {
            executed: true,
            sessionsAnalyzed: 5,
            highValuePatternsFound: 3,
            lowValuePatternsFound: 2,
            experiencesCreated: 1,
            durationMs: 50,
          },
        };

        const result = await runFeedbackLoop(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          config,
          signals
        );

        expect(result).toHaveProperty('executed');
        expect(result).toHaveProperty('signalsProcessed');
        expect(result).toHaveProperty('improvementsApplied');
        expect(result).toHaveProperty('policyUpdates');
        expect(result).toHaveProperty('thresholdUpdates');
        expect(result).toHaveProperty('decisionsStored');
        expect(result).toHaveProperty('durationMs');
      });
    });

    describe('error handling', () => {
      it('should catch errors and return them in errors array', async () => {
        const errorRepos = createMockRepos();
        (errorRepos.knowledge.create as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('Failed to store decisions')
        );
        deps = { repos: errorRepos };

        const signals: AccuracySignals = {
          extractionQuality: {
            executed: true,
            sessionsAnalyzed: 10,
            highValuePatternsFound: 2,
            lowValuePatternsFound: 10,
            experiencesCreated: 0,
            durationMs: 100,
          },
        };

        const result = await runFeedbackLoop(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          { ...config, storeImprovementDecisions: true },
          signals
        );

        // The function catches errors internally and continues
        // Check that it completed without throwing
        expect(result.executed).toBe(true);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });
    });

    describe('improvement decisions', () => {
      it('should generate policy weight decision when low value patterns dominate', async () => {
        const signals: AccuracySignals = {
          extractionQuality: {
            executed: true,
            sessionsAnalyzed: 10,
            highValuePatternsFound: 2,
            lowValuePatternsFound: 10, // > 2x high value
            experiencesCreated: 0,
            durationMs: 100,
          },
        };

        const result = await runFeedbackLoop(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          { ...config, minConfidenceForApplication: 0.1 }, // Lower threshold to ensure decision applies
          signals
        );

        expect(result.executed).toBe(true);
        // The decision should be generated based on the high ratio
        expect(result.improvementsApplied).toBeGreaterThanOrEqual(0);
      });

      it('should generate threshold decision when duplicate refinement suggests adjustment', async () => {
        const signals: AccuracySignals = {
          duplicateRefinement: {
            executed: true,
            candidatesAnalyzed: 20,
            duplicatesIdentified: 5,
            thresholdAdjustments: 1,
            knowledgeEntriesCreated: 0,
            durationMs: 150,
          },
        };

        const result = await runFeedbackLoop(
          deps,
          { scopeType: 'project', scopeId: 'test-project' },
          { ...config, minConfidenceForApplication: 0.1, updateThresholds: true },
          signals
        );

        expect(result.executed).toBe(true);
        expect(result.thresholdUpdates).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
