/**
 * Unit tests for episode auto-logger service
 *
 * Tests automatic tool execution logging to episodes including:
 * - Filtering significant vs skip tools
 * - Debouncing rapid tool calls
 * - Event type inference
 * - Event name generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createEpisodeAutoLoggerService,
  type EpisodeAutoLoggerConfig,
  type ToolExecutionEvent,
} from '../../src/services/episode-auto-logger.js';
import type {
  IEpisodeRepository,
  EpisodeWithEvents,
} from '../../src/core/interfaces/repositories.js';
import type { EpisodeEvent } from '../../src/db/schema.js';

// Mock episode repository
function createMockEpisodeRepo(overrides?: Partial<IEpisodeRepository>): IEpisodeRepository {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    delete: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    cancel: vi.fn(),
    addEvent: vi.fn().mockResolvedValue({ id: 'event-123' } as EpisodeEvent),
    getEvents: vi.fn().mockResolvedValue([]),
    linkEntity: vi.fn(),
    getLinkedEntities: vi.fn().mockResolvedValue([]),
    getActiveEpisode: vi.fn().mockResolvedValue(null),
    getEpisodesInRange: vi.fn().mockResolvedValue([]),
    getChildren: vi.fn().mockResolvedValue([]),
    getAncestors: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('EpisodeAutoLoggerService', () => {
  let mockRepo: IEpisodeRepository;
  let config: EpisodeAutoLoggerConfig;

  beforeEach(() => {
    mockRepo = createMockEpisodeRepo();
    config = {
      enabled: true,
      debounceMs: 1000,
    };
    vi.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      const service = createEpisodeAutoLoggerService(mockRepo, { ...config, enabled: true });
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const service = createEpisodeAutoLoggerService(mockRepo, { ...config, enabled: false });
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('logToolExecution', () => {
    it('should not log when disabled', async () => {
      const service = createEpisodeAutoLoggerService(mockRepo, { ...config, enabled: false });

      const result = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });

      expect(result).toBe(false);
      expect(mockRepo.addEvent).not.toHaveBeenCalled();
    });

    it('should not log when sessionId is missing', async () => {
      const service = createEpisodeAutoLoggerService(mockRepo, config);

      const result = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
      });

      expect(result).toBe(false);
      expect(mockRepo.addEvent).not.toHaveBeenCalled();
    });

    it('should not log failed tool executions', async () => {
      const service = createEpisodeAutoLoggerService(mockRepo, config);

      const result = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: false,
        sessionId: 'sess-123',
      });

      expect(result).toBe(false);
      expect(mockRepo.addEvent).not.toHaveBeenCalled();
    });

    it('should not log when no active episode exists', async () => {
      const service = createEpisodeAutoLoggerService(mockRepo, config);
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });

      expect(result).toBe(false);
      expect(mockRepo.addEvent).not.toHaveBeenCalled();
    });

    it('should log significant tool executions when active episode exists', async () => {
      const activeEpisode: EpisodeWithEvents = {
        id: 'ep-123',
        name: 'Test Episode',
        scopeType: 'session',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        durationMs: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        outcomeType: null,
        parentEpisodeId: null,
        sessionId: 'sess-123',
        scopeId: 'sess-123',
        description: null,
        triggerType: null,
        triggerRef: null,
        tags: null,
        metadata: null,
        createdBy: null,
      };
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

      const service = createEpisodeAutoLoggerService(mockRepo, config);

      const result = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });

      expect(result).toBe(true);
      expect(mockRepo.addEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          episodeId: 'ep-123',
          eventType: 'decision',
          name: expect.any(String),
        })
      );
    });

    it('should skip tools in the skip list', async () => {
      const activeEpisode: EpisodeWithEvents = {
        id: 'ep-123',
        name: 'Test Episode',
        scopeType: 'session',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        durationMs: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        outcomeType: null,
        parentEpisodeId: null,
        sessionId: 'sess-123',
        scopeId: 'sess-123',
        description: null,
        triggerType: null,
        triggerRef: null,
        tags: null,
        metadata: null,
        createdBy: null,
      };
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

      const service = createEpisodeAutoLoggerService(mockRepo, config);

      // Skip tools should not be logged
      const skipTools = [
        'memory_query',
        'memory_quickstart',
        'memory_status',
        'memory_session',
        'memory_episode',
      ];

      for (const toolName of skipTools) {
        const result = await service.logToolExecution({
          toolName,
          action: 'list',
          success: true,
          sessionId: 'sess-123',
        });
        expect(result).toBe(false);
      }

      expect(mockRepo.addEvent).not.toHaveBeenCalled();
    });

    it('should skip actions in the skip list', async () => {
      const activeEpisode: EpisodeWithEvents = {
        id: 'ep-123',
        name: 'Test Episode',
        scopeType: 'session',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        durationMs: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        outcomeType: null,
        parentEpisodeId: null,
        sessionId: 'sess-123',
        scopeId: 'sess-123',
        description: null,
        triggerType: null,
        triggerRef: null,
        tags: null,
        metadata: null,
        createdBy: null,
      };
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

      const service = createEpisodeAutoLoggerService(mockRepo, config);

      // Skip actions should not be logged even for significant tools
      const skipActions = ['get', 'list', 'search', 'context', 'status', 'history'];

      for (const action of skipActions) {
        service.clearDebounceState();
        const result = await service.logToolExecution({
          toolName: 'memory_guideline', // significant tool
          action,
          success: true,
          sessionId: 'sess-123',
        });
        expect(result).toBe(false);
      }

      expect(mockRepo.addEvent).not.toHaveBeenCalled();
    });

    it('should log significant actions', async () => {
      const activeEpisode: EpisodeWithEvents = {
        id: 'ep-123',
        name: 'Test Episode',
        scopeType: 'session',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        durationMs: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        outcomeType: null,
        parentEpisodeId: null,
        sessionId: 'sess-123',
        scopeId: 'sess-123',
        description: null,
        triggerType: null,
        triggerRef: null,
        tags: null,
        metadata: null,
        createdBy: null,
      };
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

      const service = createEpisodeAutoLoggerService(mockRepo, { ...config, debounceMs: 0 });

      // Significant actions should be logged
      const significantActions = ['add', 'update', 'bulk_add', 'create', 'delete'];

      for (const action of significantActions) {
        vi.clearAllMocks();
        (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

        const result = await service.logToolExecution({
          toolName: 'memory_guideline',
          action,
          success: true,
          sessionId: 'sess-123',
        });
        expect(result).toBe(true);
        expect(mockRepo.addEvent).toHaveBeenCalled();
      }
    });

    it('should debounce rapid tool calls', async () => {
      vi.useFakeTimers();

      const activeEpisode: EpisodeWithEvents = {
        id: 'ep-123',
        name: 'Test Episode',
        scopeType: 'session',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        durationMs: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        outcomeType: null,
        parentEpisodeId: null,
        sessionId: 'sess-123',
        scopeId: 'sess-123',
        description: null,
        triggerType: null,
        triggerRef: null,
        tags: null,
        metadata: null,
        createdBy: null,
      };
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

      const service = createEpisodeAutoLoggerService(mockRepo, { ...config, debounceMs: 1000 });

      // First call should log
      const result1 = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });
      expect(result1).toBe(true);

      // Second call immediately should be debounced
      const result2 = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });
      expect(result2).toBe(false);

      // Advance time past debounce
      vi.advanceTimersByTime(1100);

      // Third call should log again
      const result3 = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });
      expect(result3).toBe(true);

      expect(mockRepo.addEvent).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should include context in event data', async () => {
      const activeEpisode: EpisodeWithEvents = {
        id: 'ep-123',
        name: 'Test Episode',
        scopeType: 'session',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        durationMs: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        outcomeType: null,
        parentEpisodeId: null,
        sessionId: 'sess-123',
        scopeId: 'sess-123',
        description: null,
        triggerType: null,
        triggerRef: null,
        tags: null,
        metadata: null,
        createdBy: null,
      };
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

      const service = createEpisodeAutoLoggerService(mockRepo, config);

      await service.logToolExecution({
        toolName: 'memory_guideline',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
        context: {
          entryType: 'guideline',
          entryId: 'guid-456',
          entryName: 'Test Guideline',
        },
      });

      expect(mockRepo.addEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          episodeId: 'ep-123',
          entryType: 'guideline',
          entryId: 'guid-456',
          name: expect.stringContaining('Test Guideline'),
        })
      );
    });

    it('should infer decision event type for add action', async () => {
      const activeEpisode: EpisodeWithEvents = {
        id: 'ep-123',
        name: 'Test Episode',
        scopeType: 'session',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        durationMs: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        outcomeType: null,
        parentEpisodeId: null,
        sessionId: 'sess-123',
        scopeId: 'sess-123',
        description: null,
        triggerType: null,
        triggerRef: null,
        tags: null,
        metadata: null,
        createdBy: null,
      };
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

      const service = createEpisodeAutoLoggerService(mockRepo, config);

      await service.logToolExecution({
        toolName: 'memory_guideline',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });

      expect(mockRepo.addEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'decision',
        })
      );
    });

    it('should infer checkpoint event type for update action', async () => {
      const activeEpisode: EpisodeWithEvents = {
        id: 'ep-123',
        name: 'Test Episode',
        scopeType: 'session',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        durationMs: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        outcomeType: null,
        parentEpisodeId: null,
        sessionId: 'sess-123',
        scopeId: 'sess-123',
        description: null,
        triggerType: null,
        triggerRef: null,
        tags: null,
        metadata: null,
        createdBy: null,
      };
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

      const service = createEpisodeAutoLoggerService(mockRepo, { ...config, debounceMs: 0 });

      // First clear any previous calls
      vi.clearAllMocks();
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

      await service.logToolExecution({
        toolName: 'memory_guideline',
        action: 'update',
        success: true,
        sessionId: 'sess-123',
      });

      expect(mockRepo.addEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'checkpoint',
        })
      );
    });

    it('should handle repository errors gracefully', async () => {
      const activeEpisode: EpisodeWithEvents = {
        id: 'ep-123',
        name: 'Test Episode',
        scopeType: 'session',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        durationMs: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        outcomeType: null,
        parentEpisodeId: null,
        sessionId: 'sess-123',
        scopeId: 'sess-123',
        description: null,
        triggerType: null,
        triggerRef: null,
        tags: null,
        metadata: null,
        createdBy: null,
      };
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);
      (mockRepo.addEvent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

      const service = createEpisodeAutoLoggerService(mockRepo, config);

      // Should not throw, just return false
      const result = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });

      expect(result).toBe(false);
    });
  });

  describe('clearDebounceState', () => {
    it('should allow immediate logging after clearing', async () => {
      vi.useFakeTimers();

      const activeEpisode: EpisodeWithEvents = {
        id: 'ep-123',
        name: 'Test Episode',
        scopeType: 'session',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        durationMs: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        outcomeType: null,
        parentEpisodeId: null,
        sessionId: 'sess-123',
        scopeId: 'sess-123',
        description: null,
        triggerType: null,
        triggerRef: null,
        tags: null,
        metadata: null,
        createdBy: null,
      };
      (mockRepo.getActiveEpisode as ReturnType<typeof vi.fn>).mockResolvedValue(activeEpisode);

      const service = createEpisodeAutoLoggerService(mockRepo, { ...config, debounceMs: 10000 });

      // First call logs
      await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });

      // Second call is debounced
      const result1 = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });
      expect(result1).toBe(false);

      // Clear debounce state
      service.clearDebounceState();

      // Now should log again immediately
      const result2 = await service.logToolExecution({
        toolName: 'memory_remember',
        action: 'add',
        success: true,
        sessionId: 'sess-123',
      });
      expect(result2).toBe(true);

      expect(mockRepo.addEvent).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      const service = createEpisodeAutoLoggerService(mockRepo, config);
      const returnedConfig = service.getConfig();

      expect(returnedConfig).toEqual(config);
      expect(returnedConfig).not.toBe(config); // Should be a copy
    });
  });
});
