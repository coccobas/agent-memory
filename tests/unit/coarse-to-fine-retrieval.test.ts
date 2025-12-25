/**
 * Unit tests for Coarse-to-Fine Retrieval
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { CoarseToFineRetriever } from '../../src/services/summarization/retrieval/coarse-to-fine.js';
import type { EmbeddingService } from '../../src/services/embedding.service.js';
import {
  setupTestDb,
  cleanupTestDb,
  schema,
} from '../fixtures/test-helpers.js';
import type {
  CoarseToFineOptions,
} from '../../src/services/summarization/retrieval/types.js';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-coarse-to-fine.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
    getSqlite: () => sqlite,
  };
});

describe('CoarseToFineRetriever', () => {
  let retriever: CoarseToFineRetriever;
  let mockEmbeddingService: EmbeddingService;

  const mockEmbedding = new Array(384).fill(0).map(() => Math.random());

  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;

    // Mock EmbeddingService
    mockEmbeddingService = {
      isAvailable: vi.fn().mockReturnValue(true),
      embed: vi.fn().mockResolvedValue({
        embedding: mockEmbedding,
        model: 'all-MiniLM-L6-v2',
      }),
      getEmbeddingDimension: vi.fn().mockReturnValue(384),
      getProvider: vi.fn().mockReturnValue('local'),
      cleanup: vi.fn(),
    } as unknown as EmbeddingService;

    retriever = new CoarseToFineRetriever(db, mockEmbeddingService);
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('constructor', () => {
    it('should initialize with database and embedding service', () => {
      expect(retriever).toBeDefined();
    });
  });

  describe('retrieve', () => {
    it('should return empty results when embedding service is not available', async () => {
      vi.mocked(mockEmbeddingService.isAvailable).mockReturnValueOnce(false);

      const options: CoarseToFineOptions = {
        query: 'test query',
        scopeType: 'project',
        scopeId: 'proj-123',
      };

      const result = await retriever.retrieve(options);

      expect(result.entries).toEqual([]);
      expect(result.steps).toEqual([]);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should use provided query embedding when available', async () => {
      const customEmbedding = new Array(384).fill(0.5);

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding: customEmbedding,
        scopeType: 'project',
        scopeId: 'proj-123',
      };

      const result = await retriever.retrieve(options);

      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
      expect(result.queryEmbedding).toEqual(customEmbedding);
    });

    it('should generate embedding when not provided', async () => {
      const options: CoarseToFineOptions = {
        query: 'test query',
        scopeType: 'project',
        scopeId: 'proj-123',
      };

      await retriever.retrieve(options);

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('test query');
    });

    it('should return empty results when no summaries found at top level', async () => {
      const options: CoarseToFineOptions = {
        query: 'test query',
        scopeType: 'project',
        scopeId: 'non-existent-project',
      };

      const result = await retriever.retrieve(options);

      expect(result.entries).toEqual([]);
      expect(result.steps).toEqual([]);
    });

    it('should retrieve entries from level-0 summaries', async () => {
      // Create test data
      const projectId = 'test-proj-' + nanoid(8);
      const summaryId = 'sum-' + nanoid(8);
      const knowledgeId = 'know-' + nanoid(8);

      // Create project
      db.insert(schema.projects).values({
        id: projectId,
        name: 'Test Project',
      }).run();

      // Create knowledge entry
      db.insert(schema.knowledge).values({
        id: knowledgeId,
        scopeType: 'project',
        scopeId: projectId,
        title: 'Test Knowledge',
        content: 'This is test knowledge content',
      }).run();

      // Create level-0 summary with embedding
      db.insert(schema.summaries).values({
        id: summaryId,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 0,
        title: 'Test Summary',
        content: 'Summary of test knowledge',
        embedding: mockEmbedding as any, // Drizzle will handle JSON serialization
        embeddingDimension: 384,
        memberCount: 1,
      }).run();

      // Link knowledge to summary
      db.insert(schema.summaryMembers).values({
        id: 'mem-' + nanoid(8),
        summaryId,
        memberType: 'knowledge',
        memberId: knowledgeId,
        contributionScore: 0.9,
      }).run();

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding: mockEmbedding,
        scopeType: 'project',
        scopeId: projectId,
        startLevel: 0,
      };

      const result = await retriever.retrieve(options);

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries[0]?.type).toBe('knowledge');
      expect(result.steps.length).toBe(1);
      expect(result.steps[0]?.level).toBe(0);
    });

    it('should navigate down hierarchy from level 2 to level 0', async () => {
      // Create test data with hierarchy
      const projectId = 'test-proj-hierarchy-' + nanoid(8);
      const level2SummaryId = 'sum-l2-' + nanoid(8);
      const level1SummaryId = 'sum-l1-' + nanoid(8);
      const level0SummaryId = 'sum-l0-' + nanoid(8);
      const knowledgeId = 'know-' + nanoid(8);

      // Create project
      db.insert(schema.projects).values({
        id: projectId,
        name: 'Test Hierarchy Project',
      }).run();

      // Create knowledge entry
      db.insert(schema.knowledge).values({
        id: knowledgeId,
        scopeType: 'project',
        scopeId: projectId,
        title: 'Hierarchical Knowledge',
        content: 'Knowledge in hierarchy',
      }).run();

      // Create level-2 summary (domain)
      db.insert(schema.summaries).values({
        id: level2SummaryId,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 2,
        title: 'Domain Summary',
        content: 'High-level domain summary',
        embedding: mockEmbedding as any,
        embeddingDimension: 384,
        memberCount: 1,
      }).run();

      // Create level-1 summary (topic)
      db.insert(schema.summaries).values({
        id: level1SummaryId,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 1,
        parentSummaryId: level2SummaryId,
        title: 'Topic Summary',
        content: 'Mid-level topic summary',
        embedding: mockEmbedding as any,
        embeddingDimension: 384,
        memberCount: 1,
      }).run();

      // Create level-0 summary (chunk)
      db.insert(schema.summaries).values({
        id: level0SummaryId,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 0,
        parentSummaryId: level1SummaryId,
        title: 'Chunk Summary',
        content: 'Low-level chunk summary',
        embedding: mockEmbedding as any,
        embeddingDimension: 384,
        memberCount: 1,
      }).run();

      // Link summaries in hierarchy
      db.insert(schema.summaryMembers).values({
        id: 'mem-l2-l1-' + nanoid(8),
        summaryId: level2SummaryId,
        memberType: 'summary',
        memberId: level1SummaryId,
        contributionScore: 0.9,
      }).run();

      db.insert(schema.summaryMembers).values({
        id: 'mem-l1-l0-' + nanoid(8),
        summaryId: level1SummaryId,
        memberType: 'summary',
        memberId: level0SummaryId,
        contributionScore: 0.85,
      }).run();

      // Link knowledge to level-0 summary
      db.insert(schema.summaryMembers).values({
        id: 'mem-l0-know-' + nanoid(8),
        summaryId: level0SummaryId,
        memberType: 'knowledge',
        memberId: knowledgeId,
        contributionScore: 0.8,
      }).run();

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding: mockEmbedding,
        scopeType: 'project',
        scopeId: projectId,
      };

      const result = await retriever.retrieve(options);

      // Should have steps for levels 2, 1, and 0
      expect(result.steps.length).toBe(3);
      expect(result.steps[0]?.level).toBe(2);
      expect(result.steps[1]?.level).toBe(1);
      expect(result.steps[2]?.level).toBe(0);
      expect(result.entries.length).toBeGreaterThan(0);
    });

    it('should filter by entry types when specified', async () => {
      const projectId = 'test-proj-filter-' + nanoid(8);
      const summaryId = 'sum-filter-' + nanoid(8);
      const knowledgeId = 'know-' + nanoid(8);
      const toolId = 'tool-' + nanoid(8);

      // Create project
      db.insert(schema.projects).values({
        id: projectId,
        name: 'Filter Test Project',
      }).run();

      // Create entries
      db.insert(schema.knowledge).values({
        id: knowledgeId,
        scopeType: 'project',
        scopeId: projectId,
        title: 'Test Knowledge',
        content: 'Knowledge content',
      }).run();

      db.insert(schema.tools).values({
        id: toolId,
        scopeType: 'project',
        scopeId: projectId,
        name: 'test-tool',
        description: 'Tool description',
      }).run();

      // Create summary
      db.insert(schema.summaries).values({
        id: summaryId,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 0,
        title: 'Mixed Summary',
        content: 'Summary with multiple types',
        embedding: mockEmbedding as any,
        embeddingDimension: 384,
        memberCount: 2,
      }).run();

      // Link both entries
      db.insert(schema.summaryMembers).values([
        {
          id: 'mem-know-' + nanoid(8),
          summaryId,
          memberType: 'knowledge',
          memberId: knowledgeId,
          contributionScore: 0.9,
        },
        {
          id: 'mem-tool-' + nanoid(8),
          summaryId,
          memberType: 'tool',
          memberId: toolId,
          contributionScore: 0.8,
        },
      ]).run();

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding: mockEmbedding,
        scopeType: 'project',
        scopeId: projectId,
        entryTypes: ['knowledge'], // Only knowledge
        startLevel: 0,
      };

      const result = await retriever.retrieve(options);

      expect(result.entries.every(e => e.type === 'knowledge')).toBe(true);
    });

    it('should respect maxResults limit', async () => {
      const projectId = 'test-proj-limit-' + nanoid(8);
      const summaryId = 'sum-limit-' + nanoid(8);

      // Create project
      db.insert(schema.projects).values({
        id: projectId,
        name: 'Limit Test Project',
      }).run();

      // Create multiple knowledge entries
      const knowledgeIds = Array.from({ length: 10 }, (_, i) => {
        const id = `know-${i}-` + nanoid(8);
        db.insert(schema.knowledge).values({
          id,
          scopeType: 'project',
          scopeId: projectId,
          title: `Knowledge ${i}`,
          content: `Content ${i}`,
        }).run();
        return id;
      });

      // Create summary
      db.insert(schema.summaries).values({
        id: summaryId,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 0,
        title: 'Large Summary',
        content: 'Summary with many members',
        embedding: mockEmbedding as any,
        embeddingDimension: 384,
        memberCount: 10,
      }).run();

      // Link all entries
      knowledgeIds.forEach((knowId, i) => {
        db.insert(schema.summaryMembers).values({
          id: `mem-${i}-` + nanoid(8),
          summaryId,
          memberType: 'knowledge',
          memberId: knowId,
          contributionScore: 0.9 - (i * 0.05), // Descending scores
        }).run();
      });

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding: mockEmbedding,
        scopeType: 'project',
        scopeId: projectId,
        maxResults: 3,
        startLevel: 0,
      };

      const result = await retriever.retrieve(options);

      expect(result.entries.length).toBeLessThanOrEqual(3);
    });

    it('should track performance metrics', async () => {
      const projectId = 'test-proj-perf-' + nanoid(8);
      const summaryId = 'sum-perf-' + nanoid(8);
      const knowledgeId = 'know-perf-' + nanoid(8);

      // Create project
      db.insert(schema.projects).values({
        id: projectId,
        name: 'Performance Test Project',
      }).run();

      // Create knowledge entry
      db.insert(schema.knowledge).values({
        id: knowledgeId,
        scopeType: 'project',
        scopeId: projectId,
        title: 'Performance Knowledge',
        content: 'Performance test content',
      }).run();

      // Create summary
      db.insert(schema.summaries).values({
        id: summaryId,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 0,
        title: 'Performance Summary',
        content: 'Performance test summary',
        embedding: mockEmbedding as any,
        embeddingDimension: 384,
        memberCount: 1,
      }).run();

      // Link knowledge
      db.insert(schema.summaryMembers).values({
        id: 'mem-perf-' + nanoid(8),
        summaryId,
        memberType: 'knowledge',
        memberId: knowledgeId,
        contributionScore: 0.9,
      }).run();

      const options: CoarseToFineOptions = {
        query: 'test query',
        queryEmbedding: mockEmbedding,
        scopeType: 'project',
        scopeId: projectId,
        startLevel: 0,
      };

      const result = await retriever.retrieve(options);

      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.steps[0]?.timeMs).toBeGreaterThanOrEqual(0);
      expect(result.steps[0]?.summariesSearched).toBeGreaterThan(0);
    });
  });

  describe('getTopLevel', () => {
    it('should return top-level summaries', async () => {
      const projectId = 'test-proj-top-' + nanoid(8);
      const summary1Id = 'sum-top-1-' + nanoid(8);
      const summary2Id = 'sum-top-2-' + nanoid(8);

      // Create project
      db.insert(schema.projects).values({
        id: projectId,
        name: 'Top Level Test Project',
      }).run();

      // Create level-2 summaries
      db.insert(schema.summaries).values([
        {
          id: summary1Id,
          scopeType: 'project',
          scopeId: projectId,
          hierarchyLevel: 2,
          title: 'Top Summary 1',
          content: 'First top-level summary',
          embedding: mockEmbedding as any,
          embeddingDimension: 384,
          memberCount: 0,
          accessCount: 10,
        },
        {
          id: summary2Id,
          scopeType: 'project',
          scopeId: projectId,
          hierarchyLevel: 2,
          title: 'Top Summary 2',
          content: 'Second top-level summary',
          embedding: mockEmbedding as any,
          embeddingDimension: 384,
          memberCount: 0,
          accessCount: 5,
        },
      ]).run();

      const result = await retriever.getTopLevel('project', projectId);

      expect(result.length).toBe(2);
      expect(result[0]?.hierarchyLevel).toBe(2);
      // Should be ordered by access count (descending)
      expect(result[0]?.accessCount).toBeGreaterThanOrEqual(result[1]?.accessCount ?? 0);
    });
  });

  describe('drillDown', () => {
    it('should throw error when summary not found', async () => {
      await expect(retriever.drillDown('non-existent')).rejects.toThrow(
        'Summary not found: non-existent'
      );
    });

    it('should return summary with children and members', async () => {
      const projectId = 'test-proj-drill-' + nanoid(8);
      const parentSummaryId = 'sum-parent-' + nanoid(8);
      const childSummaryId = 'sum-child-' + nanoid(8);
      const knowledgeId = 'know-drill-' + nanoid(8);

      // Create project
      db.insert(schema.projects).values({
        id: projectId,
        name: 'Drill Down Test Project',
      }).run();

      // Create knowledge entry
      db.insert(schema.knowledge).values({
        id: knowledgeId,
        scopeType: 'project',
        scopeId: projectId,
        title: 'Drill Knowledge',
        content: 'Drill down knowledge',
      }).run();

      // Create parent summary (level 1)
      db.insert(schema.summaries).values({
        id: parentSummaryId,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 1,
        title: 'Parent Summary',
        content: 'Parent summary content',
        embedding: mockEmbedding as any,
        embeddingDimension: 384,
        memberCount: 2,
        accessCount: 0,
      }).run();

      // Create child summary (level 0)
      db.insert(schema.summaries).values({
        id: childSummaryId,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 0,
        parentSummaryId: parentSummaryId,
        title: 'Child Summary',
        content: 'Child summary content',
        embedding: mockEmbedding as any,
        embeddingDimension: 384,
        memberCount: 0,
      }).run();

      // Link child summary and knowledge to parent
      db.insert(schema.summaryMembers).values([
        {
          id: 'mem-child-' + nanoid(8),
          summaryId: parentSummaryId,
          memberType: 'summary',
          memberId: childSummaryId,
          contributionScore: 0.9,
        },
        {
          id: 'mem-know-' + nanoid(8),
          summaryId: parentSummaryId,
          memberType: 'knowledge',
          memberId: knowledgeId,
          contributionScore: 0.85,
        },
      ]).run();

      const result = await retriever.drillDown(parentSummaryId);

      expect(result.summary.id).toBe(parentSummaryId);
      expect(result.children.length).toBe(1);
      expect(result.children[0]?.id).toBe(childSummaryId);
      expect(result.members.length).toBe(1);
      expect(result.members[0]?.id).toBe(knowledgeId);
      expect(result.members[0]?.type).toBe('knowledge');
    });

    it('should update access tracking', async () => {
      const projectId = 'test-proj-access-' + nanoid(8);
      const summaryId = 'sum-access-' + nanoid(8);

      // Create project
      db.insert(schema.projects).values({
        id: projectId,
        name: 'Access Test Project',
      }).run();

      // Create summary
      db.insert(schema.summaries).values({
        id: summaryId,
        scopeType: 'project',
        scopeId: projectId,
        hierarchyLevel: 0,
        title: 'Access Summary',
        content: 'Access test summary',
        embedding: mockEmbedding as any,
        embeddingDimension: 384,
        memberCount: 0,
        accessCount: 0,
      }).run();

      const beforeAccess = db
        .select()
        .from(schema.summaries)
        .where(eq(schema.summaries.id, summaryId))
        .get();

      await retriever.drillDown(summaryId);

      const afterAccess = db
        .select()
        .from(schema.summaries)
        .where(eq(schema.summaries.id, summaryId))
        .get();

      expect(afterAccess?.accessCount).toBe((beforeAccess?.accessCount ?? 0) + 1);
      expect(afterAccess?.lastAccessedAt).not.toBeNull();
    });
  });
});
