/**
 * Local Event Adapter
 *
 * Wraps an EventBus instance behind the IEventAdapter interface.
 * EventBus is injected via constructor for proper dependency injection.
 */

import type { IEventAdapter, EntryChangedEvent } from './interfaces.js';
import { EventBus, createEventBus } from '../../utils/events.js';

/**
 * Local event adapter implementation.
 * Wraps an injected EventBus instance.
 */
export class LocalEventAdapter implements IEventAdapter<EntryChangedEvent> {
  constructor(private readonly eventBus: EventBus) {}

  subscribe(handler: (event: EntryChangedEvent) => void): () => void {
    return this.eventBus.subscribe(handler);
  }

  emit(event: EntryChangedEvent): void {
    this.eventBus.emit(event);
  }

  clear(): void {
    this.eventBus.clear();
  }

  subscriberCount(): number {
    return this.eventBus.subscriberCount();
  }
}

/**
 * Create a local event adapter with a new EventBus instance.
 * Prefer using constructor injection for testability.
 */
export function createLocalEventAdapter(): IEventAdapter<EntryChangedEvent> {
  return new LocalEventAdapter(createEventBus());
}
