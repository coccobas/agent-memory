import { describe, it, expect, vi, beforeEach } from 'vitest';
import { episodeHandlers } from '../../src/mcp/handlers/episodes.handler.js';
import * as auditService from '../../src/services/audit.service.js';
import type { AppContext } from '../../src/core/context.js';

vi.mock('../../src/services/audit.service.js');

describe('Episode Scope Detection', () => {
  let mockContext: AppContext;
  let mockEpisodeService: any;
  let mockConversationRepo: any;
  let mockSessionsRepo: any;
  let mockEpisodesRepo: any;

  const mockSession = {
    id: 'sess-123',
    projectId: 'proj-456',
    name: 'Test Session',
  };

  const mockEpisode = (overrides = {}) => ({
    id: 'ep-123',
    scopeType: 'project',
    scopeId: 'proj-456',
    projectId: 'proj-456',
    sessionId: 'sess-123',
    name: 'Test Episode',
    description: 'A test episode',
    status: 'planned',
    isActive: true,
    createdAt: new Date().toISOString(),
    depth: 0,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auditService.logAction).mockReturnValue(undefined);

    mockEpisodeService = {
      create: vi.fn().mockResolvedValue(mockEpisode()),
      list: vi.fn().mockResolvedValue([mockEpisode()]),
    };

    mockConversationRepo = {
      list: vi.fn().mockResolvedValue([]),
    };

    mockSessionsRepo = {
      getById: vi.fn().mockResolvedValue(mockSession),
    };

    mockEpisodesRepo = {
      list: vi.fn().mockResolvedValue([mockEpisode()]),
    };

    mockContext = {
      db: {} as any,
      repos: {
        conversations: mockConversationRepo,
        sessions: mockSessionsRepo,
        episodes: mockEpisodesRepo,
      } as any,
      services: {
        episode: mockEpisodeService,
      } as any,
    } as AppContext;
  });

  describe('scopeId auto-population', () => {
    it('should auto-populate scopeId from projectId when creating episode with sessionId only', async () => {
      const params = {
        sessionId: 'sess-123',
        name: 'Test Episode',
      };

      await episodeHandlers.add(mockContext, params);

      expect(mockEpisodeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'project',
          scopeId: 'proj-456',
          projectId: 'proj-456',
          sessionId: 'sess-123',
        })
      );
    });

    it('should auto-populate scopeId when scopeType is explicitly set to session', async () => {
      const params = {
        scopeType: 'session',
        sessionId: 'sess-123',
        name: 'Test Episode',
      };

      mockEpisodeService.create.mockResolvedValue(
        mockEpisode({
          scopeType: 'session',
          scopeId: 'sess-123',
        })
      );

      await episodeHandlers.add(mockContext, params);

      expect(mockEpisodeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'session',
          scopeId: 'sess-123',
          sessionId: 'sess-123',
        })
      );
    });

    it('should respect explicitly provided scopeId and not override it', async () => {
      const params = {
        scopeType: 'project',
        scopeId: 'proj-explicit-789',
        sessionId: 'sess-123',
        name: 'Test Episode',
      };

      await episodeHandlers.add(mockContext, params);

      expect(mockEpisodeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType: 'project',
          scopeId: 'proj-explicit-789',
          sessionId: 'sess-123',
        })
      );
    });

    it('should list episodes correctly when querying with sessionId after creation', async () => {
      const createParams = {
        sessionId: 'sess-123',
        name: 'Test Episode',
      };

      await episodeHandlers.add(mockContext, createParams);

      await mockEpisodesRepo.list({
        sessionId: 'sess-123',
      });

      expect(mockEpisodesRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-123',
        })
      );

      const result = await mockEpisodesRepo.list({ sessionId: 'sess-123' });
      expect(result).toHaveLength(1);
      expect(result[0].sessionId).toBe('sess-123');
    });
  });
});
