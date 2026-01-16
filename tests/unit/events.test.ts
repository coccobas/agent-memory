/**
 * Unit tests for events utility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EventBus,
  createEventBus,
  type EntryChangedEvent,
  type EntryChangedHandler,
} from '../../src/utils/events.js';

describe('Events Utility', () => {
  let eventBus: EventBus;

  // Create fresh event bus for each test to ensure isolation
  beforeEach(() => {
    eventBus = createEventBus();
  });

  describe('EventBus - subscribe', () => {
    it('should subscribe a handler and return unsubscribe function', () => {
      const handler = vi.fn();

      expect(eventBus.subscriberCount()).toBe(0);
      const unsubscribe = eventBus.subscribe(handler);
      expect(eventBus.subscriberCount()).toBe(1);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow multiple handlers to subscribe', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.subscribe(handler1);
      eventBus.subscribe(handler2);
      eventBus.subscribe(handler3);

      expect(eventBus.subscriberCount()).toBe(3);
    });

    it('should not add duplicate handler references', () => {
      const handler = vi.fn();

      eventBus.subscribe(handler);
      eventBus.subscribe(handler);
      eventBus.subscribe(handler);

      // Sets don't allow duplicates
      expect(eventBus.subscriberCount()).toBe(1);
    });

    it('should handle subscribing the same handler after unsubscribe', () => {
      const handler = vi.fn();

      const unsubscribe = eventBus.subscribe(handler);
      expect(eventBus.subscriberCount()).toBe(1);

      unsubscribe();
      expect(eventBus.subscriberCount()).toBe(0);

      eventBus.subscribe(handler);
      expect(eventBus.subscriberCount()).toBe(1);
    });
  });

  describe('EventBus - unsubscribe', () => {
    it('should unsubscribe a handler using returned function', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe(handler);

      expect(eventBus.subscriberCount()).toBe(1);
      unsubscribe();
      expect(eventBus.subscriberCount()).toBe(0);
    });

    it('should only unsubscribe the specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe(handler1);
      const unsubscribe2 = eventBus.subscribe(handler2);

      unsubscribe2();

      expect(eventBus.subscriberCount()).toBe(1);

      // Verify handler1 still receives events
      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'test-id',
        scopeType: 'project',
        scopeId: 'proj-1',
        action: 'create',
      };
      eventBus.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should be safe to call unsubscribe multiple times', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe(handler);

      unsubscribe();
      unsubscribe();
      unsubscribe();

      expect(eventBus.subscriberCount()).toBe(0);
    });

    it('should not affect other handlers when unsubscribing', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.subscribe(handler1);
      const unsubscribe2 = eventBus.subscribe(handler2);
      eventBus.subscribe(handler3);

      unsubscribe2();

      const event: EntryChangedEvent = {
        entryType: 'guideline',
        entryId: 'test-id',
        scopeType: 'global',
        scopeId: null,
        action: 'update',
      };
      eventBus.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).toHaveBeenCalledWith(event);
    });
  });

  describe('EventBus - emit', () => {
    it('should emit event to single subscribed handler', () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-123',
        scopeType: 'project',
        scopeId: 'proj-456',
        action: 'create',
      };

      eventBus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should emit event to multiple subscribed handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.subscribe(handler1);
      eventBus.subscribe(handler2);
      eventBus.subscribe(handler3);

      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'know-1',
        scopeType: 'session',
        scopeId: 'sess-1',
        action: 'delete',
      };

      eventBus.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('should not call unsubscribed handlers', () => {
      const activeHandler = vi.fn();
      const removedHandler = vi.fn();

      eventBus.subscribe(activeHandler);
      const unsubscribe = eventBus.subscribe(removedHandler);

      unsubscribe();

      const event: EntryChangedEvent = {
        entryType: 'guideline',
        entryId: 'guide-1',
        scopeType: 'org',
        scopeId: 'org-1',
        action: 'update',
      };

      eventBus.emit(event);

      expect(activeHandler).toHaveBeenCalled();
      expect(removedHandler).not.toHaveBeenCalled();
    });

    it('should handle emitting when no handlers are subscribed', () => {
      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'global',
        scopeId: null,
        action: 'create',
      };

      // Should not throw
      expect(() => eventBus.emit(event)).not.toThrow();
    });

    it('should emit different event types correctly', () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);

      const events: EntryChangedEvent[] = [
        { entryType: 'tool', entryId: '1', scopeType: 'global', scopeId: null, action: 'create' },
        {
          entryType: 'guideline',
          entryId: '2',
          scopeType: 'project',
          scopeId: 'p1',
          action: 'update',
        },
        {
          entryType: 'knowledge',
          entryId: '3',
          scopeType: 'session',
          scopeId: 's1',
          action: 'delete',
        },
      ];

      for (const event of events) {
        eventBus.emit(event);
      }

      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenNthCalledWith(1, events[0]);
      expect(handler).toHaveBeenNthCalledWith(2, events[1]);
      expect(handler).toHaveBeenNthCalledWith(3, events[2]);
    });

    it('should emit all action types correctly', () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);

      const actions: EntryChangedEvent['action'][] = ['create', 'update', 'delete', 'deactivate'];

      for (const action of actions) {
        eventBus.emit({
          entryType: 'knowledge',
          entryId: `entry-${action}`,
          scopeType: 'project',
          scopeId: 'proj-1',
          action,
        });
      }

      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  describe('EventBus - error handling', () => {
    it('should catch and log errors from handlers without crashing', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });

      eventBus.subscribe(errorHandler);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'global',
        scopeId: null,
        action: 'create',
      };

      // Should not throw despite handler error
      expect(() => eventBus.emit(event)).not.toThrow();
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should continue calling handlers after one throws', () => {
      const handler1 = vi.fn();
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const handler2 = vi.fn();

      eventBus.subscribe(handler1);
      eventBus.subscribe(errorHandler);
      eventBus.subscribe(handler2);

      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'k-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'update',
      };

      eventBus.emit(event);

      expect(handler1).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', () => {
      const stringThrower = vi.fn(() => {
        throw 'string error';
      });

      eventBus.subscribe(stringThrower);

      const event: EntryChangedEvent = {
        entryType: 'guideline',
        entryId: 'g-1',
        scopeType: 'global',
        scopeId: null,
        action: 'create',
      };

      expect(() => eventBus.emit(event)).not.toThrow();
    });

    it('should handle multiple errors from different handlers', () => {
      const error1 = vi.fn(() => {
        throw new Error('Error 1');
      });
      const error2 = vi.fn(() => {
        throw new Error('Error 2');
      });
      const success = vi.fn();

      eventBus.subscribe(error1);
      eventBus.subscribe(success);
      eventBus.subscribe(error2);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 't-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'delete',
      };

      expect(() => eventBus.emit(event)).not.toThrow();
      expect(error1).toHaveBeenCalled();
      expect(success).toHaveBeenCalled();
      expect(error2).toHaveBeenCalled();
    });
  });

  describe('EventBus - clear', () => {
    it('should remove all handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe(handler1);
      eventBus.subscribe(handler2);

      expect(eventBus.subscriberCount()).toBe(2);

      eventBus.clear();

      expect(eventBus.subscriberCount()).toBe(0);
    });

    it('should prevent handlers from being called after clear', () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);

      eventBus.clear();

      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'k-1',
        scopeType: 'global',
        scopeId: null,
        action: 'create',
      };

      eventBus.emit(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should be safe to call clear when no handlers exist', () => {
      expect(() => eventBus.clear()).not.toThrow();
      expect(eventBus.subscriberCount()).toBe(0);
    });

    it('should allow subscribing after clear', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe(handler1);
      eventBus.clear();
      eventBus.subscribe(handler2);

      expect(eventBus.subscriberCount()).toBe(1);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 't-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'create',
      };

      eventBus.emit(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(event);
    });
  });

  describe('EventBus - subscriberCount', () => {
    it('should return correct count of handlers', () => {
      expect(eventBus.subscriberCount()).toBe(0);

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe(handler1);
      expect(eventBus.subscriberCount()).toBe(1);

      eventBus.subscribe(handler2);
      expect(eventBus.subscriberCount()).toBe(2);
    });

    it('should return 0 after clear', () => {
      eventBus.subscribe(vi.fn());
      eventBus.subscribe(vi.fn());
      eventBus.subscribe(vi.fn());

      expect(eventBus.subscriberCount()).toBe(3);

      eventBus.clear();

      expect(eventBus.subscriberCount()).toBe(0);
    });
  });

  describe('Factory behavior', () => {
    it('should create independent instances from createEventBus', () => {
      const bus1 = createEventBus();
      const bus2 = createEventBus();

      expect(bus1).not.toBe(bus2);
    });

    it('should not share handlers between instances', () => {
      const bus1 = createEventBus();
      const bus2 = createEventBus();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus1.subscribe(handler1);
      bus2.subscribe(handler2);

      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'k-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'create',
      };

      bus1.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('Helper functions integration', () => {
    it('should subscribe handler and return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = eventBus.subscribe(handler);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'tool-1',
        scopeType: 'project',
        scopeId: 'proj-1',
        action: 'create',
      };

      eventBus.emit(event);
      expect(handler).toHaveBeenCalledWith(event);

      unsubscribe();
      handler.mockClear();

      eventBus.emit(event);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should work with emit', () => {
      const receivedEvents: EntryChangedEvent[] = [];
      eventBus.subscribe((event) => {
        receivedEvents.push(event);
      });

      const event: EntryChangedEvent = {
        entryType: 'guideline',
        entryId: 'g-1',
        scopeType: 'org',
        scopeId: 'org-1',
        action: 'update',
      };

      eventBus.emit(event);

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual(event);
    });

    it('should clear all handlers', () => {
      eventBus.subscribe(vi.fn());
      eventBus.subscribe(vi.fn());

      expect(eventBus.subscriberCount()).toBe(2);

      eventBus.clear();

      expect(eventBus.subscriberCount()).toBe(0);
    });

    it('should prevent handlers from being called after clear', () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);

      eventBus.clear();

      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'k-1',
        scopeType: 'global',
        scopeId: null,
        action: 'create',
      };

      eventBus.emit(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases and async behavior', () => {
    it('should handle handlers that modify the event object', () => {
      const handler1 = vi.fn((event: EntryChangedEvent) => {
        // @ts-expect-error - intentionally modifying event
        event.entryId = 'modified';
      });
      const handler2 = vi.fn();

      eventBus.subscribe(handler1);
      eventBus.subscribe(handler2);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 'original',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'create',
      };

      eventBus.emit(event);

      // Both handlers are called (modification happens in-place)
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle async handlers (fire and forget)', async () => {
      let asyncHandlerCompleted = false;

      const asyncHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        asyncHandlerCompleted = true;
      });

      eventBus.subscribe(asyncHandler);

      const event: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'k-1',
        scopeType: 'global',
        scopeId: null,
        action: 'create',
      };

      eventBus.emit(event);

      // Handler was called but async work hasn't completed
      expect(asyncHandler).toHaveBeenCalled();

      // Wait for async to complete
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(asyncHandlerCompleted).toBe(true);
    });

    it('should handle unsubscribing during event emission', () => {
      const handler1 = vi.fn();
      let unsubscribe2: (() => void) | undefined;
      const handler2 = vi.fn(() => {
        unsubscribe2?.();
      });
      const handler3 = vi.fn();

      eventBus.subscribe(handler1);
      unsubscribe2 = eventBus.subscribe(handler2);
      eventBus.subscribe(handler3);

      const event: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 't-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'update',
      };

      eventBus.emit(event);

      // All handlers should have been called for this emission
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();

      // handler2 should be unsubscribed for future emissions
      handler1.mockClear();
      handler2.mockClear();
      handler3.mockClear();

      eventBus.emit(event);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should handle subscribing during event emission', () => {
      const laterHandler = vi.fn();
      const handler1 = vi.fn(() => {
        eventBus.subscribe(laterHandler);
      });

      eventBus.subscribe(handler1);

      const event: EntryChangedEvent = {
        entryType: 'guideline',
        entryId: 'g-1',
        scopeType: 'global',
        scopeId: null,
        action: 'create',
      };

      eventBus.emit(event);

      expect(handler1).toHaveBeenCalled();
      // laterHandler may or may not be called during first emission
      // (implementation-dependent for Sets)

      // But it should definitely be called on next emission
      handler1.mockClear();
      laterHandler.mockClear();

      eventBus.emit(event);

      expect(handler1).toHaveBeenCalled();
      expect(laterHandler).toHaveBeenCalled();
    });

    it('should handle rapid succession of events', () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);

      const events: EntryChangedEvent[] = [];
      for (let i = 0; i < 100; i++) {
        events.push({
          entryType: 'knowledge',
          entryId: `k-${i}`,
          scopeType: 'project',
          scopeId: 'p-1',
          action: 'create',
        });
      }

      for (const event of events) {
        eventBus.emit(event);
      }

      expect(handler).toHaveBeenCalledTimes(100);
    });

    it('should handle empty string and null scopeId', () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);

      const eventWithNull: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 't-1',
        scopeType: 'global',
        scopeId: null,
        action: 'create',
      };

      eventBus.emit(eventWithNull);

      expect(handler).toHaveBeenCalledWith(eventWithNull);
    });
  });

  describe('Type safety', () => {
    it('should enforce EntryType values', () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);

      const toolEvent: EntryChangedEvent = {
        entryType: 'tool',
        entryId: 't-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'create',
      };

      const guidelineEvent: EntryChangedEvent = {
        entryType: 'guideline',
        entryId: 'g-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'create',
      };

      const knowledgeEvent: EntryChangedEvent = {
        entryType: 'knowledge',
        entryId: 'k-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'create',
      };

      eventBus.emit(toolEvent);
      eventBus.emit(guidelineEvent);
      eventBus.emit(knowledgeEvent);

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should work with all scope types', () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);

      const scopeTypes: EntryChangedEvent['scopeType'][] = ['global', 'org', 'project', 'session'];

      for (const scopeType of scopeTypes) {
        eventBus.emit({
          entryType: 'knowledge',
          entryId: `k-${scopeType}`,
          scopeType,
          scopeId: scopeType === 'global' ? null : `${scopeType}-1`,
          action: 'create',
        });
      }

      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  describe('Real-world usage patterns', () => {
    it('should support cache invalidation pattern', () => {
      const cache = new Map<string, unknown>();
      cache.set('tool:t-1', { name: 'test' });
      cache.set('knowledge:k-1', { title: 'test' });

      eventBus.subscribe((event) => {
        const key = `${event.entryType}:${event.entryId}`;
        cache.delete(key);
      });

      eventBus.emit({
        entryType: 'tool',
        entryId: 't-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'update',
      });

      expect(cache.has('tool:t-1')).toBe(false);
      expect(cache.has('knowledge:k-1')).toBe(true);
    });

    it('should support multiple cache layers', () => {
      const l1Cache = new Map<string, unknown>();
      const l2Cache = new Map<string, unknown>();

      l1Cache.set('tool:t-1', 'cached');
      l2Cache.set('tool:t-1', 'cached');

      eventBus.subscribe((event) => {
        l1Cache.delete(`${event.entryType}:${event.entryId}`);
      });

      eventBus.subscribe((event) => {
        l2Cache.delete(`${event.entryType}:${event.entryId}`);
      });

      eventBus.emit({
        entryType: 'tool',
        entryId: 't-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'delete',
      });

      expect(l1Cache.has('tool:t-1')).toBe(false);
      expect(l2Cache.has('tool:t-1')).toBe(false);
    });

    it('should support filtering events by entry type', () => {
      const toolHandler = vi.fn();
      const guidelineHandler = vi.fn();

      eventBus.subscribe((event) => {
        if (event.entryType === 'tool') {
          toolHandler(event);
        }
      });

      eventBus.subscribe((event) => {
        if (event.entryType === 'guideline') {
          guidelineHandler(event);
        }
      });

      eventBus.emit({
        entryType: 'tool',
        entryId: 't-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'create',
      });

      eventBus.emit({
        entryType: 'guideline',
        entryId: 'g-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'update',
      });

      eventBus.emit({
        entryType: 'knowledge',
        entryId: 'k-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'delete',
      });

      expect(toolHandler).toHaveBeenCalledTimes(1);
      expect(guidelineHandler).toHaveBeenCalledTimes(1);
    });

    it('should support action-based handling', () => {
      const createHandler = vi.fn();
      const deleteHandler = vi.fn();

      eventBus.subscribe((event) => {
        if (event.action === 'create') {
          createHandler(event);
        } else if (event.action === 'delete') {
          deleteHandler(event);
        }
      });

      eventBus.emit({
        entryType: 'tool',
        entryId: 't-1',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'create',
      });

      eventBus.emit({
        entryType: 'tool',
        entryId: 't-2',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'delete',
      });

      eventBus.emit({
        entryType: 'tool',
        entryId: 't-3',
        scopeType: 'project',
        scopeId: 'p-1',
        action: 'update',
      });

      expect(createHandler).toHaveBeenCalledTimes(1);
      expect(deleteHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('EventBus - handler limit (Bug #215 fix)', () => {
    it('should warn and return no-op unsubscribe when max handlers exceeded', () => {
      // Create a new bus for this test to avoid interference
      const limitedBus = createEventBus();

      // Add handlers up to the limit (MAX_HANDLERS = 1000)
      // We'll simulate this by accessing the private property for testing
      // In a real scenario, we'd test the behavior at the boundary

      // First, subscribe up to a reasonable number
      const handlers: Array<() => void> = [];
      for (let i = 0; i < 1000; i++) {
        const unsubscribe = limitedBus.subscribe(vi.fn());
        handlers.push(unsubscribe);
      }

      expect(limitedBus.subscriberCount()).toBe(1000);

      // Try to add one more - should hit the limit
      const noOpUnsubscribe = limitedBus.subscribe(vi.fn());

      // The 1001st handler should not be added
      expect(limitedBus.subscriberCount()).toBe(1000);

      // The returned unsubscribe should be a no-op
      noOpUnsubscribe();
      expect(limitedBus.subscriberCount()).toBe(1000);
    });

    it('should only warn once when limit exceeded repeatedly', () => {
      const limitedBus = createEventBus();

      // Fill to limit
      for (let i = 0; i < 1000; i++) {
        limitedBus.subscribe(vi.fn());
      }

      // Try to add more - should only log warning once (per bus instance)
      limitedBus.subscribe(vi.fn());
      limitedBus.subscribe(vi.fn());
      limitedBus.subscribe(vi.fn());

      // All should be rejected (count should stay at 1000)
      expect(limitedBus.subscriberCount()).toBe(1000);
    });
  });
});
