import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LocalEventAdapter,
  createLocalEventAdapter,
} from '../../src/core/adapters/local-event.adapter.js';
import { createEventBus } from '../../src/utils/events.js';

describe('LocalEventAdapter', () => {
  let adapter: LocalEventAdapter;

  beforeEach(() => {
    // Create a fresh EventBus for each test
    const eventBus = createEventBus();
    adapter = new LocalEventAdapter(eventBus);
  });

  describe('subscribe', () => {
    it('should register a handler', () => {
      const handler = vi.fn();
      const unsubscribe = adapter.subscribe(handler);

      expect(typeof unsubscribe).toBe('function');
      expect(adapter.subscriberCount()).toBe(1);
    });

    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = adapter.subscribe(handler);

      expect(adapter.subscriberCount()).toBe(1);
      unsubscribe();
      expect(adapter.subscriberCount()).toBe(0);
    });

    it('should allow multiple subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      adapter.subscribe(handler1);
      adapter.subscribe(handler2);
      adapter.subscribe(handler3);

      expect(adapter.subscriberCount()).toBe(3);
    });
  });

  describe('emit', () => {
    it('should call subscribed handlers', () => {
      const handler = vi.fn();
      adapter.subscribe(handler);

      const event = {
        type: 'entry_created' as const,
        entryType: 'tool' as const,
        entryId: 'test-id',
        timestamp: new Date().toISOString(),
      };

      adapter.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should call all subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      adapter.subscribe(handler1);
      adapter.subscribe(handler2);

      const event = {
        type: 'entry_updated' as const,
        entryType: 'guideline' as const,
        entryId: 'guide-id',
        timestamp: new Date().toISOString(),
      };

      adapter.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should not call unsubscribed handlers', () => {
      const handler = vi.fn();
      const unsubscribe = adapter.subscribe(handler);

      unsubscribe();

      const event = {
        type: 'entry_deleted' as const,
        entryType: 'knowledge' as const,
        entryId: 'know-id',
        timestamp: new Date().toISOString(),
      };

      adapter.emit(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should work with various event types', () => {
      const handler = vi.fn();
      adapter.subscribe(handler);

      const events = [
        { type: 'entry_created' as const, entryType: 'tool' as const, entryId: '1', timestamp: new Date().toISOString() },
        { type: 'entry_updated' as const, entryType: 'guideline' as const, entryId: '2', timestamp: new Date().toISOString() },
        { type: 'entry_deleted' as const, entryType: 'knowledge' as const, entryId: '3', timestamp: new Date().toISOString() },
      ];

      for (const event of events) {
        adapter.emit(event);
      }

      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe('clear', () => {
    it('should remove all subscribers', () => {
      adapter.subscribe(() => {});
      adapter.subscribe(() => {});
      adapter.subscribe(() => {});

      expect(adapter.subscriberCount()).toBe(3);

      adapter.clear();

      expect(adapter.subscriberCount()).toBe(0);
    });

    it('should work on empty adapter', () => {
      adapter.clear();
      expect(adapter.subscriberCount()).toBe(0);
    });
  });

  describe('subscriberCount', () => {
    it('should return 0 for new adapter', () => {
      expect(adapter.subscriberCount()).toBe(0);
    });

    it('should increment with subscriptions', () => {
      adapter.subscribe(() => {});
      expect(adapter.subscriberCount()).toBe(1);

      adapter.subscribe(() => {});
      expect(adapter.subscriberCount()).toBe(2);
    });

    it('should decrement with unsubscriptions', () => {
      const unsubscribe1 = adapter.subscribe(() => {});
      const unsubscribe2 = adapter.subscribe(() => {});

      expect(adapter.subscriberCount()).toBe(2);

      unsubscribe1();
      expect(adapter.subscriberCount()).toBe(1);

      unsubscribe2();
      expect(adapter.subscriberCount()).toBe(0);
    });
  });
});

describe('createLocalEventAdapter', () => {
  it('should create an adapter', () => {
    const adapter = createLocalEventAdapter();
    expect(adapter).toBeDefined();
    // createLocalEventAdapter returns IEventAdapter, not LocalEventAdapter directly
    expect(adapter.subscribe).toBeDefined();
    expect(adapter.emit).toBeDefined();
  });

  it('should create a working adapter', () => {
    const adapter = createLocalEventAdapter();
    const handler = vi.fn();

    adapter.subscribe(handler);

    const event = {
      entryType: 'tool' as const,
      entryId: 'test-id',
      scopeType: 'project' as const,
      scopeId: 'proj-1',
      action: 'create' as const,
    };

    adapter.emit(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should create independent adapters', () => {
    // Each createLocalEventAdapter call creates a NEW EventBus, so they're independent
    const adapter1 = createLocalEventAdapter();
    const adapter2 = createLocalEventAdapter();

    const handler = vi.fn();
    adapter1.subscribe(handler);

    // adapter2 has its own EventBus, so it should have 0 subscribers
    expect(adapter2.subscriberCount()).toBe(0);
    expect(adapter1.subscriberCount()).toBe(1);
  });
});
