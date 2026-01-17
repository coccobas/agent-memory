import { describe, it, expect, vi, beforeEach } from 'vitest';
import { episodeHandlers } from '../../src/mcp/handlers/episodes.handler.js';
import * as auditService from '../../src/services/audit.service.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/audit.service.js');

describe('Episode Handlers', () => {
  let mockContext: AppContext;
  let mockEpisodeService: {
    create: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
    fail: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    addEvent: ReturnType<typeof vi.fn>;
    getEvents: ReturnType<typeof vi.fn>;
    linkEntity: ReturnType<typeof vi.fn>;
    getLinkedEntities: ReturnType<typeof vi.fn>;
    getTimeline: ReturnType<typeof vi.fn>;
    whatHappened: ReturnType<typeof vi.fn>;
    traceCausalChain: ReturnType<typeof vi.fn>;
  };

  const mockEpisode = {
    id: 'ep-123',
    scopeType: 'project',
    scopeId: 'proj-1',
    name: 'Test Episode',
    description: 'A test episode',
    status: 'planned',
    isActive: true,
    createdAt: new Date().toISOString(),
    depth: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auditService.logAction).mockReturnValue(undefined);

    mockEpisodeService = {
      create: vi.fn().mockResolvedValue(mockEpisode),
      getById: vi.fn().mockResolvedValue(mockEpisode),
      list: vi.fn().mockResolvedValue([mockEpisode]),
      update: vi.fn().mockResolvedValue({ ...mockEpisode, name: 'Updated' }),
      deactivate: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
      start: vi.fn().mockResolvedValue({ ...mockEpisode, status: 'active', startedAt: new Date().toISOString() }),
      complete: vi.fn().mockResolvedValue({ ...mockEpisode, status: 'completed', outcome: 'Done', outcomeType: 'success' }),
      fail: vi.fn().mockResolvedValue({ ...mockEpisode, status: 'failed', outcome: 'Error', outcomeType: 'failure' }),
      cancel: vi.fn().mockResolvedValue({ ...mockEpisode, status: 'cancelled', outcome: 'Cancelled', outcomeType: 'abandoned' }),
      addEvent: vi.fn().mockResolvedValue({ id: 'event-1', episodeId: 'ep-123', eventType: 'checkpoint', name: 'Test event' }),
      getEvents: vi.fn().mockResolvedValue([]),
      linkEntity: vi.fn().mockResolvedValue(undefined),
      getLinkedEntities: vi.fn().mockResolvedValue([]),
      getTimeline: vi.fn().mockResolvedValue([]),
      whatHappened: vi.fn().mockResolvedValue({
        episode: mockEpisode,
        timeline: [],
        linkedEntities: [],
        childEpisodes: [],
        metrics: { durationMs: 100, eventCount: 1, linkedEntityCount: 0, childEpisodeCount: 0 },
      }),
      traceCausalChain: vi.fn().mockResolvedValue([]),
    };

    mockContext = {
      db: {} as any,
      repos: {} as any,
      services: {
        episode: mockEpisodeService,
      } as any,
    };
  });

  describe('add', () => {
    it('should create an episode', async () => {
      const result = await episodeHandlers.add(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
        name: 'Test Episode',
      });

      expect(result.success).toBe(true);
      expect(result.episode).toBeDefined();
      expect(mockEpisodeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'project',
          scopeId: 'proj-1',
          name: 'Test Episode',
        })
      );
    });

    it('should require name parameter', async () => {
      await expect(
        episodeHandlers.add(mockContext, {
          scopeType: 'global',
        })
      ).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should get an episode by id', async () => {
      const result = await episodeHandlers.get(mockContext, {
        id: 'ep-123',
      });

      expect(result.success).toBe(true);
      expect(result.episode).toBeDefined();
      expect(mockEpisodeService.getById).toHaveBeenCalledWith('ep-123', true);
    });

    it('should throw when episode not found', async () => {
      mockEpisodeService.getById.mockResolvedValue(undefined);

      await expect(
        episodeHandlers.get(mockContext, { id: 'not-found' })
      ).rejects.toThrow();
    });
  });

  describe('list', () => {
    it('should list episodes', async () => {
      const result = await episodeHandlers.list(mockContext, {
        scopeType: 'project',
        scopeId: 'proj-1',
      });

      expect(result.success).toBe(true);
      expect(result.episodes).toBeDefined();
      expect(result.count).toBe(1);
    });
  });

  describe('lifecycle', () => {
    it('should start an episode', async () => {
      const result = await episodeHandlers.start(mockContext, {
        id: 'ep-123',
      });

      expect(result.success).toBe(true);
      expect(result.episode.status).toBe('active');
      expect(mockEpisodeService.start).toHaveBeenCalledWith('ep-123');
    });

    it('should complete an episode', async () => {
      const result = await episodeHandlers.complete(mockContext, {
        id: 'ep-123',
        outcome: 'Done',
        outcomeType: 'success',
      });

      expect(result.success).toBe(true);
      expect(result.episode.status).toBe('completed');
      expect(mockEpisodeService.complete).toHaveBeenCalledWith('ep-123', 'Done', 'success');
    });

    it('should fail an episode', async () => {
      const result = await episodeHandlers.fail(mockContext, {
        id: 'ep-123',
        outcome: 'Error occurred',
      });

      expect(result.success).toBe(true);
      expect(result.episode.status).toBe('failed');
    });

    it('should cancel an episode', async () => {
      const result = await episodeHandlers.cancel(mockContext, {
        id: 'ep-123',
        reason: 'Not needed',
      });

      expect(result.success).toBe(true);
      expect(result.episode.status).toBe('cancelled');
    });
  });

  describe('events', () => {
    it('should add an event to an episode', async () => {
      const result = await episodeHandlers.add_event(mockContext, {
        episodeId: 'ep-123',
        eventType: 'checkpoint',
        name: 'Test checkpoint',
      });

      expect(result.success).toBe(true);
      expect(result.event).toBeDefined();
      expect(mockEpisodeService.addEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          episodeId: 'ep-123',
          eventType: 'checkpoint',
          name: 'Test checkpoint',
        })
      );
    });

    it('should get events for an episode', async () => {
      const result = await episodeHandlers.get_events(mockContext, {
        episodeId: 'ep-123',
      });

      expect(result.success).toBe(true);
      expect(result.events).toBeDefined();
      expect(mockEpisodeService.getEvents).toHaveBeenCalledWith('ep-123');
    });
  });

  describe('entity linking', () => {
    it('should link an entity to an episode', async () => {
      const result = await episodeHandlers.link_entity(mockContext, {
        episodeId: 'ep-123',
        entryType: 'knowledge',
        entryId: 'know-456',
        role: 'context',
      });

      expect(result.success).toBe(true);
      expect(result.linked).toBeDefined();
      expect(mockEpisodeService.linkEntity).toHaveBeenCalledWith(
        'ep-123',
        'knowledge',
        'know-456',
        'context'
      );
    });

    it('should get linked entities', async () => {
      const result = await episodeHandlers.get_linked(mockContext, {
        episodeId: 'ep-123',
      });

      expect(result.success).toBe(true);
      expect(result.linkedEntities).toBeDefined();
    });
  });

  describe('timeline and queries', () => {
    it('should get timeline for a session', async () => {
      const result = await episodeHandlers.get_timeline(mockContext, {
        sessionId: 'sess-123',
      });

      expect(result.success).toBe(true);
      expect(result.timeline).toBeDefined();
      expect(mockEpisodeService.getTimeline).toHaveBeenCalledWith('sess-123', expect.any(Object));
    });

    it('should get what happened during an episode', async () => {
      const result = await episodeHandlers.what_happened(mockContext, {
        id: 'ep-123',
      });

      expect(result.success).toBe(true);
      expect(result.episode).toBeDefined();
      expect(mockEpisodeService.whatHappened).toHaveBeenCalledWith('ep-123');
    });

    it('should trace causal chain', async () => {
      const result = await episodeHandlers.trace_causal_chain(mockContext, {
        episodeId: 'ep-123',
        direction: 'backward',
        maxDepth: 5,
      });

      expect(result.success).toBe(true);
      expect(result.chain).toBeDefined();
      expect(mockEpisodeService.traceCausalChain).toHaveBeenCalledWith('ep-123', 'backward', 5);
    });
  });
});
