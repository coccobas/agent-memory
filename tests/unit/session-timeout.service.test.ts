/**
 * Unit tests for session timeout service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionTimeoutService,
  createSessionTimeoutService,
} from '../../src/services/session-timeout.service.js';
import type { Config } from '../../src/config/index.js';
import type { ISessionRepository } from '../../src/core/interfaces/repositories.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('SessionTimeoutService', () => {
  let mockConfig: Config;
  let mockSessionRepo: ISessionRepository;
  let service: SessionTimeoutService;

  beforeEach(() => {
    vi.useFakeTimers();

    mockConfig = {
      autoContext: {
        sessionTimeoutEnabled: true,
        sessionInactivityMs: 1000, // 1 second for testing
        sessionTimeoutCheckMs: 500, // 0.5 second check interval
      },
    } as Config;

    mockSessionRepo = {
      getById: vi.fn(),
      end: vi.fn(),
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ISessionRepository;

    service = new SessionTimeoutService(mockConfig, mockSessionRepo);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('recordActivity', () => {
    it('should record activity for a session', () => {
      service.recordActivity('session-1');

      const lastActivity = service.getLastActivity('session-1');
      expect(lastActivity).toBeDefined();
    });

    it('should update activity timestamp on subsequent calls', () => {
      service.recordActivity('session-1');
      const first = service.getLastActivity('session-1');

      vi.advanceTimersByTime(100);
      service.recordActivity('session-1');
      const second = service.getLastActivity('session-1');

      expect(second).toBeGreaterThan(first!);
    });

    it('should not record activity when service is disabled', () => {
      const disabledConfig = {
        autoContext: {
          sessionTimeoutEnabled: false,
        },
      } as Config;

      const disabledService = new SessionTimeoutService(disabledConfig, mockSessionRepo);
      disabledService.recordActivity('session-1');

      expect(disabledService.getLastActivity('session-1')).toBeUndefined();
    });

    it('should evict oldest session when at max capacity', () => {
      // Fill up to max capacity
      for (let i = 0; i < 10000; i++) {
        service.recordActivity(`session-${i}`);
      }

      // First session should exist
      expect(service.getLastActivity('session-0')).toBeDefined();

      // Add one more session
      service.recordActivity('session-new');

      // First session should have been evicted
      expect(service.getLastActivity('session-0')).toBeUndefined();
      // New session should exist
      expect(service.getLastActivity('session-new')).toBeDefined();
    });
  });

  describe('checkAndEndStaleSessions', () => {
    it('should end sessions that have been inactive', async () => {
      vi.mocked(mockSessionRepo.getById).mockResolvedValue({
        id: 'session-1',
        status: 'active',
      } as any);
      vi.mocked(mockSessionRepo.end).mockResolvedValue({ id: 'session-1' } as any);

      service.recordActivity('session-1');

      // Wait for inactivity timeout
      vi.advanceTimersByTime(1500);

      const endedCount = await service.checkAndEndStaleSessions();

      expect(endedCount).toBe(1);
      expect(mockSessionRepo.end).toHaveBeenCalledWith('session-1', 'completed');
    });

    it('should not end sessions that are still active', async () => {
      service.recordActivity('session-1');

      // Check before timeout
      vi.advanceTimersByTime(500);

      const endedCount = await service.checkAndEndStaleSessions();

      expect(endedCount).toBe(0);
      expect(mockSessionRepo.end).not.toHaveBeenCalled();
    });

    it('should not end sessions that are already not active', async () => {
      vi.mocked(mockSessionRepo.getById).mockResolvedValue({
        id: 'session-1',
        status: 'completed',
      } as any);

      service.recordActivity('session-1');
      vi.advanceTimersByTime(1500);

      const endedCount = await service.checkAndEndStaleSessions();

      expect(endedCount).toBe(0);
      expect(mockSessionRepo.end).not.toHaveBeenCalled();
    });

    it('should handle session not found gracefully', async () => {
      vi.mocked(mockSessionRepo.getById).mockResolvedValue(undefined);

      service.recordActivity('session-1');
      vi.advanceTimersByTime(1500);

      const endedCount = await service.checkAndEndStaleSessions();

      expect(endedCount).toBe(0);
      // Session should be removed from tracking
      expect(service.getLastActivity('session-1')).toBeUndefined();
    });

    it('should handle errors when ending session', async () => {
      vi.mocked(mockSessionRepo.getById).mockResolvedValue({
        id: 'session-1',
        status: 'active',
      } as any);
      vi.mocked(mockSessionRepo.end).mockRejectedValue(new Error('Database error'));

      service.recordActivity('session-1');
      vi.advanceTimersByTime(1500);

      const endedCount = await service.checkAndEndStaleSessions();

      expect(endedCount).toBe(0);
      // Session should be removed from tracking to prevent retry spam
      expect(service.getLastActivity('session-1')).toBeUndefined();
    });

    it('should return 0 when service is disabled', async () => {
      const disabledConfig = {
        autoContext: {
          sessionTimeoutEnabled: false,
        },
      } as Config;

      const disabledService = new SessionTimeoutService(disabledConfig, mockSessionRepo);
      const endedCount = await disabledService.checkAndEndStaleSessions();

      expect(endedCount).toBe(0);
    });

    it('should end multiple stale sessions', async () => {
      vi.mocked(mockSessionRepo.getById).mockResolvedValue({
        status: 'active',
      } as any);
      vi.mocked(mockSessionRepo.end).mockResolvedValue({} as any);

      service.recordActivity('session-1');
      service.recordActivity('session-2');
      service.recordActivity('session-3');

      vi.advanceTimersByTime(1500);

      const endedCount = await service.checkAndEndStaleSessions();

      expect(endedCount).toBe(3);
      expect(mockSessionRepo.end).toHaveBeenCalledTimes(3);
    });
  });

  describe('start and stop', () => {
    it('should start periodic checker without error', () => {
      // Simply verify start() doesn't throw and sets up internal state
      expect(() => service.start()).not.toThrow();

      // Calling start again should also not throw (but logs warning)
      expect(() => service.start()).not.toThrow();

      // Clean up
      service.stop();
    });

    it('should not start when disabled', () => {
      const disabledConfig = {
        autoContext: {
          sessionTimeoutEnabled: false,
        },
      } as Config;

      const disabledService = new SessionTimeoutService(disabledConfig, mockSessionRepo);
      disabledService.start();

      // Should not have started anything
      vi.advanceTimersByTime(1000);
      expect(mockSessionRepo.getById).not.toHaveBeenCalled();
    });

    it('should not start twice', () => {
      service.start();
      service.start(); // Should warn but not throw

      // Should only have one interval
      service.stop();
    });

    it('should stop the checker', () => {
      service.start();
      service.stop();

      service.recordActivity('session-1');
      vi.advanceTimersByTime(1500);

      // Should not have checked after stop
      expect(mockSessionRepo.getById).not.toHaveBeenCalled();
    });

    it('should handle stop when not started', () => {
      // Should not throw
      service.stop();
    });
  });

  describe('getLastActivity', () => {
    it('should return undefined for unknown session', () => {
      expect(service.getLastActivity('unknown')).toBeUndefined();
    });

    it('should return timestamp for tracked session', () => {
      service.recordActivity('session-1');
      const activity = service.getLastActivity('session-1');
      expect(activity).toBeDefined();
      expect(typeof activity).toBe('number');
    });
  });

  describe('createSessionTimeoutService factory', () => {
    it('should create service instance', () => {
      const instance = createSessionTimeoutService(mockConfig, mockSessionRepo);
      expect(instance).toBeInstanceOf(SessionTimeoutService);
    });
  });

  describe('default configuration', () => {
    it('should use default values when not provided', () => {
      const minimalConfig = {
        autoContext: {},
      } as Config;

      const minimalService = new SessionTimeoutService(minimalConfig, mockSessionRepo);
      minimalService.recordActivity('session-1');

      // Should work with defaults
      expect(minimalService.getLastActivity('session-1')).toBeDefined();
    });
  });

  describe('DB-based orphaned session detection', () => {
    it('should find and end orphaned stale sessions from DB', async () => {
      const staleSession = {
        id: 'orphan-session',
        status: 'active',
        startedAt: new Date(Date.now() - 2000).toISOString(),
        metadata: null,
      };

      vi.mocked(mockSessionRepo.list).mockResolvedValue([staleSession] as any);
      vi.mocked(mockSessionRepo.getById).mockResolvedValue(staleSession as any);
      vi.mocked(mockSessionRepo.end).mockResolvedValue(staleSession as any);

      const endedCount = await service.checkAndEndStaleSessions();

      expect(mockSessionRepo.list).toHaveBeenCalledWith({ status: 'active' }, { limit: 100 });
      expect(endedCount).toBe(1);
      expect(mockSessionRepo.end).toHaveBeenCalledWith('orphan-session', 'completed');
    });

    it('should use lastActivityAt from metadata when available', async () => {
      const recentActivitySession = {
        id: 'recent-session',
        status: 'active',
        startedAt: new Date(Date.now() - 2000).toISOString(),
        metadata: { lastActivityAt: new Date().toISOString() },
      };

      vi.mocked(mockSessionRepo.list).mockResolvedValue([recentActivitySession] as any);

      const endedCount = await service.checkAndEndStaleSessions();

      expect(endedCount).toBe(0);
      expect(mockSessionRepo.end).not.toHaveBeenCalled();
    });

    it('should not end sessions already tracked in memory', async () => {
      const trackedSession = {
        id: 'tracked-session',
        status: 'active',
        startedAt: new Date(Date.now() - 2000).toISOString(),
        metadata: null,
      };

      service.recordActivity('tracked-session');

      vi.mocked(mockSessionRepo.list).mockResolvedValue([trackedSession] as any);

      vi.advanceTimersByTime(500);
      const endedCount = await service.checkAndEndStaleSessions();

      expect(endedCount).toBe(0);
    });

    it('should handle DB list errors gracefully', async () => {
      vi.mocked(mockSessionRepo.list).mockRejectedValue(new Error('DB error'));

      const endedCount = await service.checkAndEndStaleSessions();

      expect(endedCount).toBe(0);
    });
  });

  describe('activity persistence to DB', () => {
    it('should persist activity to session metadata after debounce', async () => {
      vi.mocked(mockSessionRepo.update).mockResolvedValue({} as any);
      vi.mocked(mockSessionRepo.list).mockResolvedValue([]);

      service.recordActivity('session-1');

      expect(mockSessionRepo.update).not.toHaveBeenCalled();

      vi.advanceTimersByTime(30001);
      await vi.runAllTimersAsync();

      expect(mockSessionRepo.update).toHaveBeenCalledWith('session-1', {
        metadata: { lastActivityAt: expect.any(String) },
      });
    });

    it('should debounce multiple activity recordings', async () => {
      vi.mocked(mockSessionRepo.update).mockResolvedValue({} as any);
      vi.mocked(mockSessionRepo.list).mockResolvedValue([]);

      service.recordActivity('session-1');
      vi.advanceTimersByTime(10000);
      service.recordActivity('session-1');
      vi.advanceTimersByTime(10000);
      service.recordActivity('session-1');
      vi.advanceTimersByTime(30001);
      await vi.runAllTimersAsync();

      expect(mockSessionRepo.update).toHaveBeenCalledTimes(1);
    });

    it('should clear debounce timers on stop', () => {
      vi.mocked(mockSessionRepo.list).mockResolvedValue([]);

      service.recordActivity('session-1');
      service.stop();

      vi.advanceTimersByTime(30001);

      expect(mockSessionRepo.update).not.toHaveBeenCalled();
    });
  });
});
