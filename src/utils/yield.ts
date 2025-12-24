/**
 * Event-loop yielding helpers
 *
 * Use in CPU-heavy async flows to reduce event-loop starvation.
 */

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
