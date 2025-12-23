/**
 * Local Event Adapter
 *
 * Wraps the existing EventBus singleton
 * behind the IEventAdapter interface.
 */

import type { IEventAdapter, EntryChangedEvent } from './interfaces.js';
import { getEventBus, resetEventBus } from '../../utils/events.js';

/**
 * Local event adapter implementation.
 * Wraps the existing in-memory EventBus singleton.
 */
export class LocalEventAdapter implements IEventAdapter<EntryChangedEvent> {
  subscribe(handler: (event: EntryChangedEvent) => void): () => void {
    return getEventBus().subscribe(handler);
  }

  emit(event: EntryChangedEvent): void {
    getEventBus().emit(event);
  }

  clear(): void {
    resetEventBus();
  }

  subscriberCount(): number {
    return getEventBus().handlerCount;
  }
}

/**
 * Create a local event adapter.
 * Uses the singleton EventBus under the hood.
 */
export function createLocalEventAdapter(): IEventAdapter<EntryChangedEvent> {
  return new LocalEventAdapter();
}
