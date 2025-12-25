/**
 * Unit tests for events utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getEventBus,
  emitEntryChanged,
  onEntryChanged,
  resetEventBus,
  type EntryChangedEvent,
  type EntryChangedHandler,
} from '../../src/utils/events.js';

describe('Events Utility', () => {
  // Clean up after each test to ensure isolation
  beforeEach(() => {
    resetEventBus();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('EventBus - subscribe', () => {
    it('should subscribe a handler and return unsubscribe function', () => {
      const bus = getEventBus();
      const handler = vi.fn();

      expect(bus.handlerCount).toBe(0);
      const unsubscribe = bus.subscribe(handler);
      expect(bus.handlerCount).toBe(1);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow multiple handlers to subscribe', () => {
      const bus = getEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.subscribe(handler1);
      bus.subscribe(handler2);
      bus.subscribe(handler3);

      expect(bus.handlerCount).toBe(3);
    });

    it('should not add duplicate handler references', () => {
      const bus = getEventBus();
      const handler = vi.fn();

      bus.subscribe(handler);
      bus.subscribe(handler);

      // Set should prevent duplicates
      expect(bus.handlerCount).toBe(1);
    });

    it('should handle subscribing the same handler after unsubscribe', () => {
      const bus = getEventBus();
      const handler = vi.fn();

      const unsubscribe1 = bus.subscribe(handler);
      expect(bus.handlerCount).toBe(1);

      unsubscribe1();
      expect(bus.handlerCount).toBe(0);

      const unsubscribe2 = bus.subscribe(handler);
      expect(bus.handlerCount).toBe(1);

      unsubscribe2();
      expect(bus.handlerCount).toBe(0);
    });
  });

  describe('EventBus - unsubscribe', () => {
    it('should unsubscribe a handler using returned function', () => {
      const bus = getEventBus();
      const handler = vi.fn();

      const unsubscribe = bus.subscribe(handler);
      expect(bus.handlerCount).toBe(1);

      unsubscribe();
      expect(bus.handlerCount).toBe(0);
    });

    it('should only unsubscribe the specific handler', () => {
      const bus = getEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      const unsub1 = bus.subscribe(handler1);
      const unsub2 = bus.subscribe(handler2);
      bus.subscribe(handler3);

      expect(bus.handlerCount).toBe(3);

      unsub1();
      expect(bus.handlerCount).toBe(2);

      unsub2();
      expect(bus.handlerCount).toBe(1);
    });

    it('should be safe to call unsubscribe multiple times', () => {
      const bus = getEventBus();
      const handler = vi.fn();

      const unsubscribe = bus.subscribe(handler);
      expect(bus.handlerCount).toBe(1);

      unsubscribe();
      expect(bus.handlerCount).toBe(0);

      unsubscribe(); // Should not throw
      expect(bus.handlerCount).toBe(0);
    });

    it('should not affect other handlers when unsubscribing', () => {
      const bus = getEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = bus.subscribe(handler1);
      bus.subscribe(handler2);

      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: '123',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      unsub1();
      bus.emit(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(event);
    });
  });

  describe('EventBus - emit', () => {
    it('should emit event to single subscribed handler', () => {
      const bus = getEventBus();
      const handler = vi.fn();
      bus.subscribe(handler);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-123',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      bus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should emit event to multiple subscribed handlers', () => {
      const bus = getEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.subscribe(handler1);
      bus.subscribe(handler2);
      bus.subscribe(handler3);

      const event: EntryChangedEvent = {
        entryType: 'guideline',
        entryId: 'guide-456',
        scopeType: 'global',
        scopeId: null,
        action: 'update',
      };

      bus.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('should not call unsubscribed handlers', () => {
      const bus = getEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = bus.subscribe(handler1);
      bus.subscribe(handler2);

      unsub1();

      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'know-789',
        scopeType: 'session',
        scopeId: 'sess1',
        action: 'delete',
      };

      bus.emit(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should handle emitting when no handlers are subscribed', () => {
      const bus = getEventBus();

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'deactivate',
      };

      expect(() => bus.emit(event)).not.toThrow();
    });

    it('should emit different event types correctly', () => {
      const bus = getEventBus();
      const handler = vi.fn();
      bus.subscribe(handler);

      const events: EntryChangedEvent[] = [
        {
          entryType: 'tool',
          entryId: '1',
          scopeType: 'project',
          scopeId: 'p1',
          action: 'create',
        },
        {
          entryType: 'guideline',
          entryId: '2',
          scopeType: 'org',
          scopeId: 'o1',
          action: 'update',
        },
        {
          entryType: 'knowledge',
          entryId: '3',
          scopeType: 'global',
          scopeId: null,
          action: 'delete',
        },
      ];

      events.forEach((event) => bus.emit(event));

      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenNthCalledWith(1, events[0]);
      expect(handler).toHaveBeenNthCalledWith(2, events[1]);
      expect(handler).toHaveBeenNthCalledWith(3, events[2]);
    });

    it('should emit all action types correctly', () => {
      const bus = getEventBus();
      const handler = vi.fn();
      bus.subscribe(handler);

      const actions: Array<'create' | 'update' | 'delete' | 'deactivate'> = [
        'create',
        'update',
        'delete',
        'deactivate',
      ];

      actions.forEach((action) => {
        const event: EntryChangedEvent = {
          entryType: 'tool',
          entryId: 'id',
          scopeType: 'project',
          scopeId: 'p1',
          action,
        };
        bus.emit(event);
      });

      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  describe('EventBus - error handling', () => {
    it('should catch and log errors from handlers without crashing', () => {
      const bus = getEventBus();
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      bus.subscribe(errorHandler);
      bus.subscribe(normalHandler);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      // Should not throw even though errorHandler throws
      expect(() => bus.emit(event)).not.toThrow();

      // Both handlers should have been called
      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
    });

    it('should continue calling handlers after one throws', () => {
      const bus = getEventBus();
      const handler1 = vi.fn();
      const errorHandler = vi.fn(() => {
        throw new Error('Middle handler error');
      });
      const handler3 = vi.fn();

      bus.subscribe(handler1);
      bus.subscribe(errorHandler);
      bus.subscribe(handler3);

      const event: EntryChangedEvent = {
        entryType: 'guideline',
        entryId: 'guide-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'update',
      };

      bus.emit(event);

      // All handlers should have been called despite error in middle one
      expect(handler1).toHaveBeenCalledWith(event);
      expect(errorHandler).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('should handle non-Error exceptions', () => {
      const bus = getEventBus();
      const handler = vi.fn(() => {
        // eslint-disable-next-line no-throw-literal
        throw 'string error';
      });

      bus.subscribe(handler);

      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'know-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      expect(() => bus.emit(event)).not.toThrow();
      expect(handler).toHaveBeenCalled();
    });

    it('should handle multiple errors from different handlers', () => {
      const bus = getEventBus();
      const errorHandler1 = vi.fn(() => {
        throw new Error('Error 1');
      });
      const errorHandler2 = vi.fn(() => {
        throw new Error('Error 2');
      });
      const normalHandler = vi.fn();

      bus.subscribe(errorHandler1);
      bus.subscribe(normalHandler);
      bus.subscribe(errorHandler2);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      expect(() => bus.emit(event)).not.toThrow();
      expect(errorHandler1).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
      expect(errorHandler2).toHaveBeenCalled();
    });
  });

  describe('EventBus - clear', () => {
    it('should remove all handlers', () => {
      const bus = getEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe(handler1);
      bus.subscribe(handler2);
      expect(bus.handlerCount).toBe(2);

      bus.clear();
      expect(bus.handlerCount).toBe(0);
    });

    it('should prevent handlers from being called after clear', () => {
      const bus = getEventBus();
      const handler = vi.fn();

      bus.subscribe(handler);
      bus.clear();

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      bus.emit(event);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should be safe to call clear when no handlers exist', () => {
      const bus = getEventBus();
      expect(bus.handlerCount).toBe(0);
      expect(() => bus.clear()).not.toThrow();
      expect(bus.handlerCount).toBe(0);
    });

    it('should allow subscribing after clear', () => {
      const bus = getEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe(handler1);
      bus.clear();
      bus.subscribe(handler2);

      expect(bus.handlerCount).toBe(1);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      bus.emit(event);
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('EventBus - handlerCount', () => {
    it('should return correct count of handlers', () => {
      const bus = getEventBus();
      expect(bus.handlerCount).toBe(0);

      const unsub1 = bus.subscribe(vi.fn());
      expect(bus.handlerCount).toBe(1);

      const unsub2 = bus.subscribe(vi.fn());
      expect(bus.handlerCount).toBe(2);

      unsub1();
      expect(bus.handlerCount).toBe(1);

      unsub2();
      expect(bus.handlerCount).toBe(0);
    });

    it('should return 0 after clear', () => {
      const bus = getEventBus();
      bus.subscribe(vi.fn());
      bus.subscribe(vi.fn());
      bus.clear();
      expect(bus.handlerCount).toBe(0);
    });
  });

  describe('Singleton behavior', () => {
    it('should return the same instance from getEventBus', () => {
      const bus1 = getEventBus();
      const bus2 = getEventBus();
      expect(bus1).toBe(bus2);
    });

    it('should share handlers across getEventBus calls', () => {
      const bus1 = getEventBus();
      const bus2 = getEventBus();
      const handler = vi.fn();

      bus1.subscribe(handler);
      expect(bus2.handlerCount).toBe(1);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      bus2.emit(event);
      expect(handler).toHaveBeenCalledWith(event);
    });
  });

  describe('Convenience functions', () => {
    describe('emitEntryChanged', () => {
      it('should emit event to subscribed handlers', () => {
        const handler = vi.fn();
        onEntryChanged(handler);

        const event: EntryChangedEvent = {
          entryType: 'knowledge',
          entryId: 'know-1',
          scopeType: 'project',
          scopeId: 'proj1',
          action: 'create',
        };

        emitEntryChanged(event);
        expect(handler).toHaveBeenCalledWith(event);
      });

      it('should work with multiple handlers', () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        onEntryChanged(handler1);
        onEntryChanged(handler2);

        const event: EntryChangedEvent = {
          entryType: 'guideline',
          entryId: 'guide-1',
          scopeType: 'global',
          scopeId: null,
          action: 'update',
        };

        emitEntryChanged(event);
        expect(handler1).toHaveBeenCalledWith(event);
        expect(handler2).toHaveBeenCalledWith(event);
      });
    });

    describe('onEntryChanged', () => {
      it('should subscribe handler and return unsubscribe function', () => {
        const handler = vi.fn();
        const bus = getEventBus();

        expect(bus.handlerCount).toBe(0);
        const unsubscribe = onEntryChanged(handler);
        expect(bus.handlerCount).toBe(1);

        unsubscribe();
        expect(bus.handlerCount).toBe(0);
      });

      it('should work with emitEntryChanged', () => {
        const handler = vi.fn();
        const unsubscribe = onEntryChanged(handler);

        const event: EntryChangedEvent = {
          entryType: 'tool',
          entryId: 'tool-1',
          scopeType: 'session',
          scopeId: 'sess1',
          action: 'delete',
        };

        emitEntryChanged(event);
        expect(handler).toHaveBeenCalledWith(event);

        unsubscribe();
        handler.mockClear();

        emitEntryChanged(event);
        expect(handler).not.toHaveBeenCalled();
      });
    });

    describe('resetEventBus', () => {
      it('should clear all handlers', () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        onEntryChanged(handler1);
        onEntryChanged(handler2);

        const bus = getEventBus();
        expect(bus.handlerCount).toBe(2);

        resetEventBus();
        expect(bus.handlerCount).toBe(0);
      });

      it('should prevent handlers from being called after reset', () => {
        const handler = vi.fn();
        onEntryChanged(handler);

        resetEventBus();

        const event: EntryChangedEvent = {
          entryType: 'tool',
          entryId: 'tool-1',
          scopeType: 'project',
          scopeId: 'proj1',
          action: 'create',
        };

        emitEntryChanged(event);
        expect(handler).not.toHaveBeenCalled();
      });
    });
  });

  describe('Edge cases and async behavior', () => {
    it('should handle handlers that modify the event object', () => {
      const bus = getEventBus();
      const handler1 = vi.fn((event: EntryChangedEvent) => {
        // Attempt to modify the event
        (event as any).modified = true;
      });
      const handler2 = vi.fn();

      bus.subscribe(handler1);
      bus.subscribe(handler2);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      bus.emit(event);

      // Both handlers should receive the same event reference
      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should handle async handlers (fire and forget)', async () => {
      const bus = getEventBus();
      const asyncHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const syncHandler = vi.fn();

      bus.subscribe(asyncHandler as EntryChangedHandler);
      bus.subscribe(syncHandler);

      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'know-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      bus.emit(event);

      // Emit is synchronous, so async handler is called but not awaited
      expect(asyncHandler).toHaveBeenCalledWith(event);
      expect(syncHandler).toHaveBeenCalledWith(event);
    });

    it('should handle unsubscribing during event emission', () => {
      const bus = getEventBus();
      let unsubscribe2: (() => void) | undefined;

      const handler1 = vi.fn(() => {
        // Unsubscribe handler2 during emission
        if (unsubscribe2) unsubscribe2();
      });
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.subscribe(handler1);
      unsubscribe2 = bus.subscribe(handler2);
      bus.subscribe(handler3);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      bus.emit(event);

      // Handler1 should be called
      expect(handler1).toHaveBeenCalledWith(event);
      // Handler2 might be called depending on Set iteration order
      // Handler3 should be called
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('should handle subscribing during event emission', () => {
      const bus = getEventBus();
      const handler2 = vi.fn();
      const handler1 = vi.fn(() => {
        // Subscribe a new handler during emission
        bus.subscribe(handler2);
      });

      bus.subscribe(handler1);

      const event: EntryChangedEvent = {
        entryType: 'guideline',
        entryId: 'guide-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'update',
      };

      bus.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      // Handler2 was added during emission, behavior is implementation-dependent
      // (Set iteration behavior when modified during iteration is not guaranteed)
      // The important thing is that handler2 is now registered
      expect(bus.handlerCount).toBe(2);

      // Handler2 should definitely be called for next emission
      handler1.mockClear();
      handler2.mockClear();
      bus.emit(event);
      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should handle rapid succession of events', () => {
      const bus = getEventBus();
      const handler = vi.fn();
      bus.subscribe(handler);

      const events: EntryChangedEvent[] = Array.from({ length: 100 }, (_, i) => ({
        entryType: 'tool',
        entryId: `tool-${i}`,
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create' as const,
      }));

      events.forEach((event) => bus.emit(event));

      expect(handler).toHaveBeenCalledTimes(100);
    });

    it('should handle empty string and null scopeId', () => {
      const bus = getEventBus();
      const handler = vi.fn();
      bus.subscribe(handler);

      const event1: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'global',
        scopeId: null,
        action: 'create',
      };

      const event2: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-2',
        scopeType: 'project',
        scopeId: '',
        action: 'update',
      };

      bus.emit(event1);
      bus.emit(event2);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, event1);
      expect(handler).toHaveBeenNthCalledWith(2, event2);
    });
  });

  describe('Type safety', () => {
    it('should enforce EntryType values', () => {
      const bus = getEventBus();
      const handler = vi.fn();
      bus.subscribe(handler);

      const validEntryTypes: Array<'tool' | 'guideline' | 'knowledge'> = [
        'tool',
        'guideline',
        'knowledge',
      ];

      validEntryTypes.forEach((entryType) => {
        const event: EntryChangedEvent = {
          entryType,
          entryId: 'id',
          scopeType: 'project',
          scopeId: 'proj1',
          action: 'create',
        };
        expect(() => bus.emit(event)).not.toThrow();
      });
    });

    it('should work with all scope types', () => {
      const bus = getEventBus();
      const handler = vi.fn();
      bus.subscribe(handler);

      const scopeTypes: Array<'global' | 'org' | 'project' | 'session'> = [
        'global',
        'org',
        'project',
        'session',
      ];

      scopeTypes.forEach((scopeType, index) => {
        const event: EntryChangedEvent = {
          entryType: 'tool',
          entryId: `id-${index}`,
          scopeType,
          scopeId: scopeType === 'global' ? null : `scope-${index}`,
          action: 'create',
        };
        bus.emit(event);
      });

      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  describe('Real-world usage patterns', () => {
    it('should support cache invalidation pattern', () => {
      const bus = getEventBus();
      const cache = new Map<string, unknown>();

      // Cache invalidation handler
      const invalidateCache = vi.fn((event: EntryChangedEvent) => {
        const cacheKey = `${event.entryType}:${event.entryId}`;
        cache.delete(cacheKey);
      });

      bus.subscribe(invalidateCache);

      // Populate cache
      cache.set('tool:tool-1', { name: 'Test Tool' });
      cache.set('knowledge:know-1', { title: 'Test Knowledge' });

      // Emit update event
      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'update',
      };

      bus.emit(event);

      expect(invalidateCache).toHaveBeenCalledWith(event);
      expect(cache.has('tool:tool-1')).toBe(false);
      expect(cache.has('knowledge:know-1')).toBe(true);
    });

    it('should support multiple cache layers', () => {
      const bus = getEventBus();
      const l1Cache = new Map();
      const l2Cache = new Map();

      const invalidateL1 = vi.fn(() => {
        l1Cache.clear();
      });

      const invalidateL2 = vi.fn(() => {
        l2Cache.clear();
      });

      bus.subscribe(invalidateL1);
      bus.subscribe(invalidateL2);

      l1Cache.set('key', 'value');
      l2Cache.set('key', 'value');

      const event: EntryChangedEvent = {
        entryType: 'guideline',
        entryId: 'guide-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'delete',
      };

      bus.emit(event);

      expect(invalidateL1).toHaveBeenCalled();
      expect(invalidateL2).toHaveBeenCalled();
      expect(l1Cache.size).toBe(0);
      expect(l2Cache.size).toBe(0);
    });

    it('should support filtering events by entry type', () => {
      const bus = getEventBus();
      const toolHandler = vi.fn();
      const knowledgeHandler = vi.fn();

      bus.subscribe((event) => {
        if (event.entryType === 'tool') {
          toolHandler(event);
        }
      });

      bus.subscribe((event) => {
        if (event.entryType === 'knowledge') {
          knowledgeHandler(event);
        }
      });

      const toolEvent: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      const knowledgeEvent: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'know-1',
        scopeType: 'project',
        scopeId: 'proj1',
        action: 'create',
      };

      bus.emit(toolEvent);
      bus.emit(knowledgeEvent);

      expect(toolHandler).toHaveBeenCalledWith(toolEvent);
      expect(toolHandler).toHaveBeenCalledTimes(1);
      expect(knowledgeHandler).toHaveBeenCalledWith(knowledgeEvent);
      expect(knowledgeHandler).toHaveBeenCalledTimes(1);
    });

    it('should support action-based handling', () => {
      const bus = getEventBus();
      const createHandler = vi.fn();
      const updateHandler = vi.fn();
      const deleteHandler = vi.fn();

      bus.subscribe((event) => {
        switch (event.action) {
          case 'create':
            createHandler(event);
            break;
          case 'update':
            updateHandler(event);
            break;
          case 'delete':
          case 'deactivate':
            deleteHandler(event);
            break;
        }
      });

      emitEntryChanged({
        entryType: 'tool',
        entryId: '1',
        scopeType: 'project',
        scopeId: 'p1',
        action: 'create',
      });

      emitEntryChanged({
        entryType: 'tool',
        entryId: '1',
        scopeType: 'project',
        scopeId: 'p1',
        action: 'update',
      });

      emitEntryChanged({
        entryType: 'tool',
        entryId: '1',
        scopeType: 'project',
        scopeId: 'p1',
        action: 'delete',
      });

      expect(createHandler).toHaveBeenCalledTimes(1);
      expect(updateHandler).toHaveBeenCalledTimes(1);
      expect(deleteHandler).toHaveBeenCalledTimes(1);
    });
  });
});
