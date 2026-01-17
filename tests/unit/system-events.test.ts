/**
 * System Events Tests
 *
 * Tests for the memory pressure event-driven detection system.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SystemEventBus,
  createSystemEventBus,
  getSystemEventBus,
  resetSystemEventBus,
  type MemoryPressureEvent,
  type MemoryRecoveryEvent,
} from '../../src/utils/system-events.js';

describe('SystemEventBus', () => {
  let eventBus: SystemEventBus;

  beforeEach(() => {
    eventBus = createSystemEventBus();
  });

  afterEach(() => {
    eventBus.clear();
  });

  describe('subscribe', () => {
    it('should subscribe to specific event type', async () => {
      const handler = vi.fn();
      eventBus.subscribe<MemoryPressureEvent>('memory_pressure', handler);

      const event: MemoryPressureEvent = {
        type: 'memory_pressure',
        level: 'warning',
        previousLevel: 'normal',
        stats: {
          heapUsedMB: 100,
          heapTotalMB: 200,
          heapLimitMB: 256,
          utilizationPercent: 78,
        },
        timestamp: new Date().toISOString(),
      };

      await eventBus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should not call handler for different event type', async () => {
      const pressureHandler = vi.fn();
      const recoveryHandler = vi.fn();

      eventBus.subscribe<MemoryPressureEvent>('memory_pressure', pressureHandler);
      eventBus.subscribe<MemoryRecoveryEvent>('memory_recovery', recoveryHandler);

      const pressureEvent: MemoryPressureEvent = {
        type: 'memory_pressure',
        level: 'critical',
        previousLevel: 'warning',
        stats: {
          heapUsedMB: 200,
          heapTotalMB: 220,
          heapLimitMB: 256,
          utilizationPercent: 86,
        },
        timestamp: new Date().toISOString(),
      };

      await eventBus.emit(pressureEvent);

      expect(pressureHandler).toHaveBeenCalledTimes(1);
      expect(recoveryHandler).not.toHaveBeenCalled();
    });

    it('should return unsubscribe function', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe<MemoryPressureEvent>('memory_pressure', handler);

      const event: MemoryPressureEvent = {
        type: 'memory_pressure',
        level: 'warning',
        previousLevel: 'normal',
        stats: {
          heapUsedMB: 100,
          heapTotalMB: 200,
          heapLimitMB: 256,
          utilizationPercent: 78,
        },
        timestamp: new Date().toISOString(),
      };

      await eventBus.emit(event);
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      await eventBus.emit(event);
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe('subscribeAll', () => {
    it('should subscribe to all event types', async () => {
      const handler = vi.fn();
      eventBus.subscribeAll(handler);

      const pressureEvent: MemoryPressureEvent = {
        type: 'memory_pressure',
        level: 'warning',
        previousLevel: 'normal',
        stats: {
          heapUsedMB: 100,
          heapTotalMB: 200,
          heapLimitMB: 256,
          utilizationPercent: 78,
        },
        timestamp: new Date().toISOString(),
      };

      const recoveryEvent: MemoryRecoveryEvent = {
        type: 'memory_recovery',
        level: 'normal',
        previousLevel: 'warning',
        stats: {
          heapUsedMB: 80,
          heapTotalMB: 200,
          heapLimitMB: 256,
          utilizationPercent: 62,
        },
        timestamp: new Date().toISOString(),
      };

      await eventBus.emit(pressureEvent);
      await eventBus.emit(recoveryEvent);

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('emit', () => {
    it('should handle handler errors gracefully', async () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();

      eventBus.subscribe<MemoryPressureEvent>('memory_pressure', errorHandler);
      eventBus.subscribe<MemoryPressureEvent>('memory_pressure', goodHandler);

      const event: MemoryPressureEvent = {
        type: 'memory_pressure',
        level: 'warning',
        previousLevel: 'normal',
        stats: {
          heapUsedMB: 100,
          heapTotalMB: 200,
          heapLimitMB: 256,
          utilizationPercent: 78,
        },
        timestamp: new Date().toISOString(),
      };

      // Should not throw
      await expect(eventBus.emit(event)).resolves.not.toThrow();

      // Both handlers should be called
      expect(errorHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });

    it('should handle async handlers', async () => {
      const asyncHandler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      eventBus.subscribe<MemoryPressureEvent>('memory_pressure', asyncHandler);

      const event: MemoryPressureEvent = {
        type: 'memory_pressure',
        level: 'warning',
        previousLevel: 'normal',
        stats: {
          heapUsedMB: 100,
          heapTotalMB: 200,
          heapLimitMB: 256,
          utilizationPercent: 78,
        },
        timestamp: new Date().toISOString(),
      };

      await eventBus.emit(event);

      expect(asyncHandler).toHaveBeenCalled();
    });
  });

  describe('emitAsync', () => {
    it('should emit without waiting', () => {
      const handler = vi.fn();
      eventBus.subscribe<MemoryPressureEvent>('memory_pressure', handler);

      const event: MemoryPressureEvent = {
        type: 'memory_pressure',
        level: 'warning',
        previousLevel: 'normal',
        stats: {
          heapUsedMB: 100,
          heapTotalMB: 200,
          heapLimitMB: 256,
          utilizationPercent: 78,
        },
        timestamp: new Date().toISOString(),
      };

      // Should not throw and return immediately
      expect(() => eventBus.emitAsync(event)).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should track event statistics', async () => {
      const handler = vi.fn();
      eventBus.subscribe<MemoryPressureEvent>('memory_pressure', handler);
      eventBus.subscribe<MemoryRecoveryEvent>('memory_recovery', handler);

      const pressureEvent: MemoryPressureEvent = {
        type: 'memory_pressure',
        level: 'warning',
        previousLevel: 'normal',
        stats: {
          heapUsedMB: 100,
          heapTotalMB: 200,
          heapLimitMB: 256,
          utilizationPercent: 78,
        },
        timestamp: new Date().toISOString(),
      };

      const recoveryEvent: MemoryRecoveryEvent = {
        type: 'memory_recovery',
        level: 'normal',
        previousLevel: 'warning',
        stats: {
          heapUsedMB: 80,
          heapTotalMB: 200,
          heapLimitMB: 256,
          utilizationPercent: 62,
        },
        timestamp: new Date().toISOString(),
      };

      await eventBus.emit(pressureEvent);
      await eventBus.emit(recoveryEvent);

      const stats = eventBus.getStats();
      expect(stats.totalEventsEmitted).toBe(2);
      expect(stats.pressureEventCount).toBe(1);
      expect(stats.recoveryEventCount).toBe(1);
      expect(stats.handlerCount).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all handlers', async () => {
      const handler = vi.fn();
      eventBus.subscribe<MemoryPressureEvent>('memory_pressure', handler);

      eventBus.clear();

      const event: MemoryPressureEvent = {
        type: 'memory_pressure',
        level: 'warning',
        previousLevel: 'normal',
        stats: {
          heapUsedMB: 100,
          heapTotalMB: 200,
          heapLimitMB: 256,
          utilizationPercent: 78,
        },
        timestamp: new Date().toISOString(),
      };

      await eventBus.emit(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });
});

describe('singleton management', () => {
  afterEach(() => {
    resetSystemEventBus();
  });

  it('should return same instance from getSystemEventBus', () => {
    const bus1 = getSystemEventBus();
    const bus2 = getSystemEventBus();
    expect(bus1).toBe(bus2);
  });

  it('should create new instance after reset', () => {
    const bus1 = getSystemEventBus();
    resetSystemEventBus();
    const bus2 = getSystemEventBus();
    expect(bus1).not.toBe(bus2);
  });
});
