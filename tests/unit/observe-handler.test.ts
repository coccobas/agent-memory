import { describe, it, expect, vi, beforeEach } from 'vitest';
import { observeHandlers } from '../../src/mcp/handlers/observe/index.js';
import * as duplicateService from '../../src/services/duplicate.service.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/duplicate.service.js', () => ({
  checkForDuplicates: vi.fn().mockReturnValue({
    isDuplicate: false,
    similarEntries: [],
  }),
}));
vi.mock('../../src/services/audit.service.js', () => ({
  logAction: vi.fn(),
}));
vi.mock('../../src/config/index.js', () => ({
  config: {
    extraction: {
      confidenceThresholds: {
        guideline: 0.7,
        knowledge: 0.7,
        tool: 0.7,
        entity: 0.7,
        relationship: 0.8,
      },
    },
    validation: {
      nameMaxLength: 500,
      titleMaxLength: 1000,
      descriptionMaxLength: 5000,
      contentMaxLength: 100000,
      rationaleMaxLength: 5000,
      examplesMaxBytes: 50000,
      tagsMaxCount: 50,
    },
  },
}));

describe('Observe Handler', () => {
  let mockContext: AppContext;
  let mockExtractionService: {
    isAvailable: ReturnType<typeof vi.fn>;
    getProvider: ReturnType<typeof vi.fn>;
    extract: ReturnType<typeof vi.fn>;
  };
  let mockGuidelinesRepo: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockKnowledgeRepo: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockToolsRepo: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockSessionsRepo: {
    get: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockEntryTagsRepo: {
    attach: ReturnType<typeof vi.fn>;
  };
  let mockRelationsRepo: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockObserveCommitService: {
    commit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractionService = {
      isAvailable: vi.fn().mockReturnValue(true),
      getProvider: vi.fn().mockReturnValue('openai'),
      extract: vi.fn().mockResolvedValue({
        entries: [],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 100,
        tokensUsed: 500,
      }),
    };
    mockGuidelinesRepo = {
      create: vi.fn().mockResolvedValue({ id: 'g-1', name: 'Test' }),
    };
    mockKnowledgeRepo = {
      create: vi.fn().mockResolvedValue({ id: 'k-1', title: 'Test' }),
    };
    mockToolsRepo = {
      create: vi.fn().mockResolvedValue({ id: 't-1', name: 'Test' }),
    };
    mockSessionsRepo = {
      get: vi.fn().mockResolvedValue({ id: 'sess-1', metadata: {} }),
      getById: vi.fn().mockResolvedValue({ id: 'sess-1', metadata: {} }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
    };
    mockEntryTagsRepo = {
      attach: vi.fn().mockResolvedValue({}),
    };
    mockRelationsRepo = {
      create: vi.fn().mockResolvedValue({ id: 'rel-1' }),
    };
    mockObserveCommitService = {
      commit: vi.fn().mockResolvedValue({
        stored: {
          entries: [{ id: 'g-1', type: 'guideline', name: 'Test Rule', scopeType: 'session' }],
          entities: [],
          relationsCreated: 0,
        },
        skippedDuplicates: [],
        meta: {
          sessionId: 'sess-1',
          projectId: null,
          autoPromote: true,
          autoPromoteThreshold: 0.85,
          totalReceived: 1,
          entitiesReceived: 0,
          relationshipsReceived: 0,
          storedCount: 1,
          entitiesStoredCount: 0,
          relationsCreated: 0,
          relationsSkipped: 0,
          storedToProject: 0,
          storedToSession: 1,
        },
      }),
    };
    mockContext = {
      db: {} as any,
      repos: {
        guidelines: mockGuidelinesRepo,
        knowledge: mockKnowledgeRepo,
        tools: mockToolsRepo,
        sessions: mockSessionsRepo,
        entryTags: mockEntryTagsRepo,
        relations: mockRelationsRepo,
      } as any,
      services: {
        extraction: mockExtractionService,
        observeCommit: mockObserveCommitService,
      } as any,
    };
  });

  describe('status', () => {
    it('should return available status when service is configured', () => {
      const result = observeHandlers.status(mockContext);

      expect(result.available).toBe(true);
      expect(result.provider).toBe('openai');
      expect(result.configured).toBe(true);
    });

    it('should return unavailable when service not initialized', () => {
      mockContext.services = {} as any;

      const result = observeHandlers.status(mockContext);

      expect(result.available).toBe(false);
      expect(result.provider).toBe('disabled');
      expect(result.configured).toBe(false);
    });

    it('should return unavailable when extraction not available', () => {
      mockExtractionService.isAvailable.mockReturnValue(false);

      const result = observeHandlers.status(mockContext);

      expect(result.available).toBe(false);
    });
  });

  describe('extract', () => {
    it('should extract entries from context', async () => {
      mockExtractionService.extract.mockResolvedValue({
        entries: [
          {
            type: 'guideline',
            name: 'Test Rule',
            content: 'Always test',
            confidence: 0.9,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 150,
        tokensUsed: 600,
      });

      const result = await observeHandlers.extract(mockContext, {
        context: 'We should always write tests for new features',
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.success).toBe(true);
      expect(result.extraction.entries).toHaveLength(1);
      expect(result.meta.totalExtracted).toBe(1);
    });

    it('should throw when context is missing', async () => {
      await expect(
        observeHandlers.extract(mockContext, {
          scopeType: 'project',
          scopeId: 'proj-1',
        })
      ).rejects.toThrow('context');
    });

    it('should throw when scopeId missing for non-global scope with autoStore', async () => {
      await expect(
        observeHandlers.extract(mockContext, {
          context: 'Test context',
          scopeType: 'project',
          autoStore: true,
        })
      ).rejects.toThrow('scopeId');
    });

    it('should throw when extraction service unavailable', async () => {
      mockContext.services = {} as any;

      await expect(
        observeHandlers.extract(mockContext, {
          context: 'Test context',
          scopeType: 'global',
        })
      ).rejects.toThrow();
    });

    it('should throw when extraction service not available', async () => {
      mockExtractionService.isAvailable.mockReturnValue(false);

      await expect(
        observeHandlers.extract(mockContext, {
          context: 'Test context',
          scopeType: 'global',
        })
      ).rejects.toThrow();
    });

    it('should check for duplicates', async () => {
      mockExtractionService.extract.mockResolvedValue({
        entries: [
          {
            type: 'guideline',
            name: 'Existing Rule',
            content: 'Already exists',
            confidence: 0.9,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 100,
        tokensUsed: 500,
      });

      vi.mocked(duplicateService.checkForDuplicates).mockReturnValue({
        isDuplicate: true,
        similarEntries: [{ id: 'g-existing', name: 'Existing Rule', similarity: 0.95 }],
      });

      const result = await observeHandlers.extract(mockContext, {
        context: 'Test context',
        scopeType: 'global',
      });

      expect(result.extraction.entries[0].isDuplicate).toBe(true);
      expect(result.extraction.entries[0].shouldStore).toBe(false);
      expect(result.meta.duplicatesFound).toBe(1);
    });

    it('should auto-store entries when enabled', async () => {
      mockExtractionService.extract.mockResolvedValue({
        entries: [
          {
            type: 'guideline',
            name: 'Auto Store Rule',
            content: 'Should be stored',
            confidence: 0.9,
          },
        ],
        entities: [],
        relationships: [],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 100,
        tokensUsed: 500,
      });

      vi.mocked(duplicateService.checkForDuplicates).mockReturnValue({
        isDuplicate: false,
        similarEntries: [],
      });

      const result = await observeHandlers.extract(mockContext, {
        context: 'Test context',
        scopeType: 'global',
        autoStore: true,
        agentId: 'agent-1',
      });

      expect(result.stored).toBeDefined();
      expect(result.stored.entries).toHaveLength(1);
      expect(mockGuidelinesRepo.create).toHaveBeenCalled();
    });

    it('should support focus areas', async () => {
      await observeHandlers.extract(mockContext, {
        context: 'Test context',
        scopeType: 'global',
        focusAreas: ['decisions', 'facts'],
      });

      expect(mockExtractionService.extract).toHaveBeenCalledWith(
        expect.objectContaining({
          focusAreas: ['decisions', 'facts'],
        })
      );
    });

    it('should extract entities and relationships', async () => {
      mockExtractionService.extract.mockResolvedValue({
        entries: [],
        entities: [
          {
            name: 'PostgreSQL',
            entityType: 'technology',
            description: 'Database',
            confidence: 0.9,
          },
        ],
        relationships: [
          {
            sourceRef: 'UserService',
            sourceType: 'entity',
            targetRef: 'PostgreSQL',
            targetType: 'entity',
            relationType: 'depends_on',
            confidence: 0.85,
          },
        ],
        model: 'gpt-4',
        provider: 'openai',
        processingTimeMs: 100,
        tokensUsed: 500,
      });

      const result = await observeHandlers.extract(mockContext, {
        context: 'UserService depends on PostgreSQL',
        scopeType: 'global',
      });

      expect(result.extraction.entities).toHaveLength(1);
      expect(result.extraction.relationships).toHaveLength(1);
      expect(result.meta.entitiesExtracted).toBe(1);
      expect(result.meta.relationshipsExtracted).toBe(1);
    });
  });

  describe('draft', () => {
    it('should return schema and instructions', () => {
      const result = observeHandlers.draft({
        sessionId: 'sess-1',
      });

      expect(result.success).toBe(true);
      expect(result.draft.schema).toBeDefined();
      expect(result.draft.instructions).toBeDefined();
      expect(result.draft.defaults.sessionId).toBe('sess-1');
    });

    it('should throw when sessionId is missing', () => {
      expect(() => observeHandlers.draft({})).toThrow('sessionId');
    });

    it('should include projectId in defaults when provided', () => {
      const result = observeHandlers.draft({
        sessionId: 'sess-1',
        projectId: 'proj-1',
      });

      expect(result.draft.defaults.projectId).toBe('proj-1');
    });

    it('should support custom autoPromote settings', () => {
      const result = observeHandlers.draft({
        sessionId: 'sess-1',
        autoPromote: false,
        autoPromoteThreshold: 0.9,
      });

      expect(result.draft.defaults.autoPromote).toBe(false);
      expect(result.draft.defaults.autoPromoteThreshold).toBe(0.9);
    });

    it('should include focus areas in instructions', () => {
      const result = observeHandlers.draft({
        sessionId: 'sess-1',
        focusAreas: ['decisions', 'rules'],
      });

      expect(result.draft.instructions).toContain('decisions');
      expect(result.draft.instructions).toContain('rules');
    });

    it('should include commit tool call example', () => {
      const result = observeHandlers.draft({
        sessionId: 'sess-1',
      });

      expect(result.draft.commitToolCallExample).toBeDefined();
      expect(result.draft.commitToolCallExample.name).toBe('memory_observe');
      expect(result.draft.commitToolCallExample.arguments.action).toBe('commit');
    });
  });

  describe('commit', () => {
    it('should store client-extracted entries', async () => {
      const result = await observeHandlers.commit(mockContext, {
        sessionId: 'sess-1',
        entries: [
          {
            type: 'guideline',
            name: 'Test Rule',
            content: 'Test content',
            confidence: 0.9,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.stored.entries).toHaveLength(1);
      expect(result.meta.storedCount).toBe(1);
    });

    it('should throw when sessionId is missing', async () => {
      await expect(
        observeHandlers.commit(mockContext, {
          entries: [],
        })
      ).rejects.toThrow('sessionId');
    });

    it('should throw when entries is missing', async () => {
      await expect(
        observeHandlers.commit(mockContext, {
          sessionId: 'sess-1',
        })
      ).rejects.toThrow('entries');
    });

    it('should validate entry type', async () => {
      await expect(
        observeHandlers.commit(mockContext, {
          sessionId: 'sess-1',
          entries: [
            {
              type: 'invalid',
              content: 'Test',
              confidence: 0.9,
            },
          ],
        })
      ).rejects.toThrow('type');
    });

    it('should validate confidence range', async () => {
      await expect(
        observeHandlers.commit(mockContext, {
          sessionId: 'sess-1',
          entries: [
            {
              type: 'guideline',
              name: 'Test',
              content: 'Test',
              confidence: 1.5,
            },
          ],
        })
      ).rejects.toThrow('confidence');
    });

    it('should require name for guidelines', async () => {
      await expect(
        observeHandlers.commit(mockContext, {
          sessionId: 'sess-1',
          entries: [
            {
              type: 'guideline',
              content: 'Test',
              confidence: 0.9,
            },
          ],
        })
      ).rejects.toThrow('name');
    });

    it('should require title for knowledge', async () => {
      await expect(
        observeHandlers.commit(mockContext, {
          sessionId: 'sess-1',
          entries: [
            {
              type: 'knowledge',
              content: 'Test',
              confidence: 0.9,
            },
          ],
        })
      ).rejects.toThrow('title');
    });

    it('should require name for tools', async () => {
      await expect(
        observeHandlers.commit(mockContext, {
          sessionId: 'sess-1',
          entries: [
            {
              type: 'tool',
              content: 'Test',
              confidence: 0.9,
            },
          ],
        })
      ).rejects.toThrow('name');
    });

    it('should skip duplicates', async () => {
      // Mock service to return skipped duplicate result
      mockObserveCommitService.commit.mockResolvedValueOnce({
        stored: { entries: [], entities: [], relationsCreated: 0 },
        skippedDuplicates: [{ type: 'guideline', name: 'Existing Rule', scopeType: 'session' }],
        meta: {
          sessionId: 'sess-1',
          projectId: null,
          autoPromote: true,
          autoPromoteThreshold: 0.85,
          totalReceived: 1,
          entitiesReceived: 0,
          relationshipsReceived: 0,
          storedCount: 0,
          entitiesStoredCount: 0,
          relationsCreated: 0,
          relationsSkipped: 0,
          storedToProject: 0,
          storedToSession: 0,
        },
      });

      const result = await observeHandlers.commit(mockContext, {
        sessionId: 'sess-1',
        entries: [
          {
            type: 'guideline',
            name: 'Existing Rule',
            content: 'Already exists',
            confidence: 0.9,
          },
        ],
      });

      expect(result.skippedDuplicates).toHaveLength(1);
      expect(result.stored.entries).toHaveLength(0);
    });

    it('should auto-promote high-confidence entries to project', async () => {
      // Mock service to return promoted to project result
      mockObserveCommitService.commit.mockResolvedValueOnce({
        stored: {
          entries: [{ id: 'g-1', type: 'guideline', name: 'High Confidence Rule', scopeType: 'project' }],
          entities: [],
          relationsCreated: 0,
        },
        skippedDuplicates: [],
        meta: {
          sessionId: 'sess-1',
          projectId: 'proj-1',
          autoPromote: true,
          autoPromoteThreshold: 0.85,
          totalReceived: 1,
          entitiesReceived: 0,
          relationshipsReceived: 0,
          storedCount: 1,
          entitiesStoredCount: 0,
          relationsCreated: 0,
          relationsSkipped: 0,
          storedToProject: 1,
          storedToSession: 0,
        },
      });

      const result = await observeHandlers.commit(mockContext, {
        sessionId: 'sess-1',
        projectId: 'proj-1',
        autoPromote: true,
        autoPromoteThreshold: 0.85,
        entries: [
          {
            type: 'guideline',
            name: 'High Confidence Rule',
            content: 'Should go to project',
            confidence: 0.95,
          },
        ],
      });

      expect(result.meta.storedToProject).toBe(1);
      expect(result.meta.storedToSession).toBe(0);
    });

    it('should store low-confidence entries to session', async () => {
      // Mock service to return stored to session result with needsReview
      mockObserveCommitService.commit.mockResolvedValueOnce({
        stored: {
          entries: [{ id: 'g-1', type: 'guideline', name: 'Low Confidence Rule', scopeType: 'session' }],
          entities: [],
          relationsCreated: 0,
        },
        skippedDuplicates: [],
        meta: {
          sessionId: 'sess-1',
          projectId: 'proj-1',
          autoPromote: true,
          autoPromoteThreshold: 0.85,
          totalReceived: 1,
          entitiesReceived: 0,
          relationshipsReceived: 0,
          storedCount: 1,
          entitiesStoredCount: 0,
          relationsCreated: 0,
          relationsSkipped: 0,
          storedToProject: 0,
          storedToSession: 1,
          needsReviewCount: 1,
        },
      });

      const result = await observeHandlers.commit(mockContext, {
        sessionId: 'sess-1',
        projectId: 'proj-1',
        autoPromote: true,
        autoPromoteThreshold: 0.85,
        entries: [
          {
            type: 'guideline',
            name: 'Low Confidence Rule',
            content: 'Should stay in session',
            confidence: 0.7,
          },
        ],
      });

      expect(result.meta.storedToProject).toBe(0);
      expect(result.meta.storedToSession).toBe(1);
      expect(result.meta.needsReviewCount).toBe(1);
    });

    it('should attach candidate tags to session entries', async () => {
      // The handler now delegates to service. We verify service is called with entries
      // that would get candidate tags. Tag attachment is handled by the service.
      await observeHandlers.commit(mockContext, {
        sessionId: 'sess-1',
        entries: [
          {
            type: 'guideline',
            name: 'Test Rule',
            content: 'Test content',
            confidence: 0.7,
          },
        ],
      });

      // Verify the service was called with the entry
      expect(mockObserveCommitService.commit).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-1',
          entries: expect.arrayContaining([
            expect.objectContaining({ name: 'Test Rule', confidence: 0.7 }),
          ]),
        })
      );
    });

    it('should attach suggested tags', async () => {
      // The handler passes suggestedTags to the service which handles attachment
      await observeHandlers.commit(mockContext, {
        sessionId: 'sess-1',
        entries: [
          {
            type: 'guideline',
            name: 'Test Rule',
            content: 'Test content',
            confidence: 0.7,
            suggestedTags: ['testing', 'best-practice'],
          },
        ],
      });

      // Verify the service was called with the entry including suggestedTags
      expect(mockObserveCommitService.commit).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({
              suggestedTags: ['testing', 'best-practice'],
            }),
          ]),
        })
      );
    });

    it('should store entities', async () => {
      // Mock service to return entities stored result
      mockObserveCommitService.commit.mockResolvedValueOnce({
        stored: {
          entries: [],
          entities: [{ id: 'e-1', type: 'entity', name: 'PostgreSQL', scopeType: 'session' }],
          relationsCreated: 0,
        },
        skippedDuplicates: [],
        meta: {
          sessionId: 'sess-1',
          projectId: null,
          autoPromote: true,
          autoPromoteThreshold: 0.85,
          totalReceived: 0,
          entitiesReceived: 1,
          relationshipsReceived: 0,
          storedCount: 0,
          entitiesStoredCount: 1,
          relationsCreated: 0,
          relationsSkipped: 0,
          storedToProject: 0,
          storedToSession: 0,
        },
      });

      const result = await observeHandlers.commit(mockContext, {
        sessionId: 'sess-1',
        entries: [],
        entities: [
          {
            name: 'PostgreSQL',
            entityType: 'technology',
            description: 'Database',
            confidence: 0.9,
          },
        ],
      });

      expect(result.meta.entitiesStoredCount).toBe(1);
    });

    it('should validate entity type', async () => {
      await expect(
        observeHandlers.commit(mockContext, {
          sessionId: 'sess-1',
          entries: [],
          entities: [
            {
              name: 'Test',
              entityType: 'invalid',
              confidence: 0.9,
            },
          ],
        })
      ).rejects.toThrow('entityType');
    });

    it('should validate relationship type', async () => {
      await expect(
        observeHandlers.commit(mockContext, {
          sessionId: 'sess-1',
          entries: [],
          relationships: [
            {
              sourceRef: 'A',
              sourceType: 'entity',
              targetRef: 'B',
              targetType: 'entity',
              relationType: 'invalid',
              confidence: 0.9,
            },
          ],
        })
      ).rejects.toThrow('relationType');
    });

    it('should update session metadata', async () => {
      // The handler delegates to service which handles session metadata updates
      // We verify the service is called with the correct sessionId
      await observeHandlers.commit(mockContext, {
        sessionId: 'sess-1',
        entries: [
          {
            type: 'guideline',
            name: 'Test Rule',
            content: 'Test content',
            confidence: 0.9,
          },
        ],
      });

      // Verify service was called with sessionId
      expect(mockObserveCommitService.commit).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-1',
        })
      );
    });
  });
});
