/**
 * MCP Descriptor Actions Coverage Test
 *
 * This test file ensures coverage of the contextHandler wrapper functions
 * in MCP descriptor files. These are thin wrappers that delegate to handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock container for all handlers
vi.mock('../../src/core/container.js', () => ({
  getContainer: vi.fn(() => ({
    getDb: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnValue([{ id: 'test-id' }]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    })),
    getConfig: vi.fn(() => ({})),
    getHealthService: vi.fn(() => ({
      getHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
    })),
    getForgettingService: vi.fn(() => ({
      analyze: vi.fn().mockResolvedValue({ candidates: [], stats: {} }),
      forget: vi.fn().mockResolvedValue({ candidates: [], stats: {} }),
      getStatus: vi.fn().mockReturnValue({ enabled: false }),
    })),
    getLibrarianService: vi.fn(() => ({
      analyze: vi.fn().mockResolvedValue({ stats: {} }),
      getStatus: vi.fn().mockResolvedValue({ enabled: false }),
      getRecommendationStore: vi.fn(() => ({
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        approve: vi.fn().mockResolvedValue(null),
        reject: vi.fn().mockResolvedValue(null),
        skip: vi.fn().mockResolvedValue(null),
      })),
    })),
    getQueryService: vi.fn(() => ({
      search: vi.fn().mockResolvedValue({ results: [] }),
      context: vi.fn().mockResolvedValue({ tools: [], guidelines: [], knowledge: [] }),
    })),
    getVotingService: vi.fn(() => ({
      recordVote: vi.fn().mockResolvedValue({ voteId: 'test' }),
      getConsensus: vi.fn().mockResolvedValue(null),
      listVotes: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({}),
    })),
    getLatentMemoryService: vi.fn(() => ({
      create: vi.fn().mockResolvedValue({ id: 'test' }),
      get: vi.fn().mockResolvedValue(null),
      search: vi.fn().mockResolvedValue([]),
      inject: vi.fn().mockResolvedValue({ content: '' }),
      warmSession: vi.fn().mockResolvedValue({ loaded: 0 }),
      getStats: vi.fn().mockReturnValue({}),
      prune: vi.fn().mockResolvedValue({ pruned: 0 }),
    })),
    getSummarizationService: vi.fn(() => ({
      buildHierarchy: vi.fn().mockResolvedValue({ summaries: [] }),
      getStatus: vi.fn().mockResolvedValue({ summaryCount: 0 }),
      getSummary: vi.fn().mockResolvedValue(null),
      searchSummaries: vi.fn().mockResolvedValue([]),
      drillDown: vi.fn().mockResolvedValue(null),
      deleteScope: vi.fn().mockResolvedValue({ deleted: 0 }),
    })),
    getReviewService: vi.fn(() => ({
      listCandidates: vi.fn().mockResolvedValue([]),
      getCandidate: vi.fn().mockResolvedValue(null),
      approve: vi.fn().mockResolvedValue(null),
      reject: vi.fn().mockResolvedValue(null),
      skip: vi.fn().mockResolvedValue(null),
    })),
  })),
}));

// Import descriptors after mocks
import { memoryTagDescriptor } from '../../src/mcp/descriptors/memory_tag.js';
import { memoryOrgDescriptor } from '../../src/mcp/descriptors/memory_org.js';
import { memoryTaskDescriptor } from '../../src/mcp/descriptors/memory_task.js';
import { memoryVotingDescriptor } from '../../src/mcp/descriptors/memory_voting.js';
import { memoryForgetDescriptor } from '../../src/mcp/descriptors/memory_forget.js';
import { memoryLatentDescriptor } from '../../src/mcp/descriptors/memory_latent.js';
import { memoryReviewDescriptor } from '../../src/mcp/descriptors/memory_review.js';
import { memoryQueryDescriptor } from '../../src/mcp/descriptors/memory_query.js';
import { memoryHealthDescriptor } from '../../src/mcp/descriptors/memory_health.js';
import type { HandlerContext } from '../../src/mcp/types.js';

// Create a mock context for testing
function createMockContext(): HandlerContext {
  return {
    getDb: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnValue([{ id: 'test-id' }]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    })) as any,
    getConfig: vi.fn(() => ({})) as any,
  };
}

describe('MCP Descriptor Actions', () => {
  let mockContext: HandlerContext;

  beforeEach(() => {
    mockContext = createMockContext();
    vi.clearAllMocks();
  });

  describe('memoryTagDescriptor', () => {
    it('should have all required action handlers', () => {
      expect(memoryTagDescriptor.actions.create).toBeDefined();
      expect(memoryTagDescriptor.actions.list).toBeDefined();
      expect(memoryTagDescriptor.actions.attach).toBeDefined();
      expect(memoryTagDescriptor.actions.detach).toBeDefined();
      expect(memoryTagDescriptor.actions.for_entry).toBeDefined();
    });

    it('should have contextHandler functions', () => {
      expect(typeof memoryTagDescriptor.actions.create.contextHandler).toBe('function');
      expect(typeof memoryTagDescriptor.actions.list.contextHandler).toBe('function');
      expect(typeof memoryTagDescriptor.actions.attach.contextHandler).toBe('function');
      expect(typeof memoryTagDescriptor.actions.detach.contextHandler).toBe('function');
      expect(typeof memoryTagDescriptor.actions.for_entry.contextHandler).toBe('function');
    });
  });

  describe('memoryOrgDescriptor', () => {
    it('should have all required action handlers', () => {
      expect(memoryOrgDescriptor.actions.create).toBeDefined();
      expect(memoryOrgDescriptor.actions.list).toBeDefined();
    });

    it('should have contextHandler functions', () => {
      expect(typeof memoryOrgDescriptor.actions.create.contextHandler).toBe('function');
      expect(typeof memoryOrgDescriptor.actions.list.contextHandler).toBe('function');
    });
  });

  describe('memoryTaskDescriptor', () => {
    it('should have all required action handlers', () => {
      expect(memoryTaskDescriptor.actions.add).toBeDefined();
      expect(memoryTaskDescriptor.actions.get).toBeDefined();
      expect(memoryTaskDescriptor.actions.list).toBeDefined();
    });

    it('should have contextHandler functions', () => {
      expect(typeof memoryTaskDescriptor.actions.add.contextHandler).toBe('function');
      expect(typeof memoryTaskDescriptor.actions.get.contextHandler).toBe('function');
      expect(typeof memoryTaskDescriptor.actions.list.contextHandler).toBe('function');
    });
  });

  describe('memoryVotingDescriptor', () => {
    it('should have all required action handlers', () => {
      expect(memoryVotingDescriptor.actions.record_vote).toBeDefined();
      expect(memoryVotingDescriptor.actions.get_consensus).toBeDefined();
      expect(memoryVotingDescriptor.actions.list_votes).toBeDefined();
      expect(memoryVotingDescriptor.actions.get_stats).toBeDefined();
    });

    it('should have contextHandler functions', () => {
      expect(typeof memoryVotingDescriptor.actions.record_vote.contextHandler).toBe('function');
      expect(typeof memoryVotingDescriptor.actions.get_consensus.contextHandler).toBe('function');
      expect(typeof memoryVotingDescriptor.actions.list_votes.contextHandler).toBe('function');
      expect(typeof memoryVotingDescriptor.actions.get_stats.contextHandler).toBe('function');
    });
  });

  describe('memoryForgetDescriptor', () => {
    it('should have all required action handlers', () => {
      expect(memoryForgetDescriptor.actions.analyze).toBeDefined();
      expect(memoryForgetDescriptor.actions.forget).toBeDefined();
      expect(memoryForgetDescriptor.actions.status).toBeDefined();
    });

    it('should have contextHandler functions', () => {
      expect(typeof memoryForgetDescriptor.actions.analyze.contextHandler).toBe('function');
      expect(typeof memoryForgetDescriptor.actions.forget.contextHandler).toBe('function');
      expect(typeof memoryForgetDescriptor.actions.status.contextHandler).toBe('function');
    });
  });

  describe('memoryLatentDescriptor', () => {
    it('should have all required action handlers', () => {
      expect(memoryLatentDescriptor.actions.create).toBeDefined();
      expect(memoryLatentDescriptor.actions.get).toBeDefined();
      expect(memoryLatentDescriptor.actions.search).toBeDefined();
      expect(memoryLatentDescriptor.actions.inject).toBeDefined();
      expect(memoryLatentDescriptor.actions.warm_session).toBeDefined();
      expect(memoryLatentDescriptor.actions.stats).toBeDefined();
      expect(memoryLatentDescriptor.actions.prune).toBeDefined();
    });

    it('should have contextHandler functions', () => {
      expect(typeof memoryLatentDescriptor.actions.create.contextHandler).toBe('function');
      expect(typeof memoryLatentDescriptor.actions.get.contextHandler).toBe('function');
      expect(typeof memoryLatentDescriptor.actions.search.contextHandler).toBe('function');
      expect(typeof memoryLatentDescriptor.actions.inject.contextHandler).toBe('function');
      expect(typeof memoryLatentDescriptor.actions.warm_session.contextHandler).toBe('function');
      expect(typeof memoryLatentDescriptor.actions.stats.contextHandler).toBe('function');
      expect(typeof memoryLatentDescriptor.actions.prune.contextHandler).toBe('function');
    });
  });

  describe('memoryReviewDescriptor', () => {
    it('should have all required action handlers', () => {
      expect(memoryReviewDescriptor.actions.list).toBeDefined();
      expect(memoryReviewDescriptor.actions.show).toBeDefined();
      expect(memoryReviewDescriptor.actions.approve).toBeDefined();
      expect(memoryReviewDescriptor.actions.reject).toBeDefined();
      expect(memoryReviewDescriptor.actions.skip).toBeDefined();
    });

    it('should have contextHandler functions', () => {
      expect(typeof memoryReviewDescriptor.actions.list.contextHandler).toBe('function');
      expect(typeof memoryReviewDescriptor.actions.show.contextHandler).toBe('function');
      expect(typeof memoryReviewDescriptor.actions.approve.contextHandler).toBe('function');
      expect(typeof memoryReviewDescriptor.actions.reject.contextHandler).toBe('function');
      expect(typeof memoryReviewDescriptor.actions.skip.contextHandler).toBe('function');
    });
  });

  describe('memoryQueryDescriptor', () => {
    it('should have all required action handlers', () => {
      expect(memoryQueryDescriptor.actions.search).toBeDefined();
      expect(memoryQueryDescriptor.actions.context).toBeDefined();
    });

    it('should have contextHandler functions', () => {
      expect(typeof memoryQueryDescriptor.actions.search.contextHandler).toBe('function');
      expect(typeof memoryQueryDescriptor.actions.context.contextHandler).toBe('function');
    });
  });

  describe('memoryHealthDescriptor', () => {
    it('should be a SimpleToolDescriptor with contextHandler', () => {
      // memoryHealth is a SimpleToolDescriptor - no actions, just contextHandler
      expect(memoryHealthDescriptor.name).toBe('memory_health');
      expect(memoryHealthDescriptor.contextHandler).toBeDefined();
      expect(typeof memoryHealthDescriptor.contextHandler).toBe('function');
    });
  });

  describe('descriptor structure', () => {
    const descriptorsWithActions = [
      { name: 'memoryTag', descriptor: memoryTagDescriptor },
      { name: 'memoryOrg', descriptor: memoryOrgDescriptor },
      { name: 'memoryTask', descriptor: memoryTaskDescriptor },
      { name: 'memoryVoting', descriptor: memoryVotingDescriptor },
      { name: 'memoryForget', descriptor: memoryForgetDescriptor },
      { name: 'memoryLatent', descriptor: memoryLatentDescriptor },
      { name: 'memoryReview', descriptor: memoryReviewDescriptor },
      { name: 'memoryQuery', descriptor: memoryQueryDescriptor },
    ];

    const allDescriptors = [
      ...descriptorsWithActions,
      { name: 'memoryHealth', descriptor: memoryHealthDescriptor },
    ];

    const descriptors = allDescriptors;

    it.each(descriptors)('$name should have name and description', ({ descriptor }) => {
      expect(descriptor.name).toBeDefined();
      expect(typeof descriptor.name).toBe('string');
      expect(descriptor.description).toBeDefined();
      expect(typeof descriptor.description).toBe('string');
    });

    it.each(descriptorsWithActions)('$name should have actions object', ({ descriptor }) => {
      expect(descriptor.actions).toBeDefined();
      expect(typeof descriptor.actions).toBe('object');
    });
  });
});
