/**
 * Index-plane orchestration.
 *
 * This runner consumes outbox events and projects them into read indexes:
 * FTS, vector, entity index, graph, cache invalidation.
 */

import type { IndexProjector, OutboxSubscriber } from './ports.js';
import type { MemoryOutboxEvent } from '../contracts/index.js';

export class CompositeIndexProjector implements IndexProjector {
  readonly name = 'composite-index-projector';
  private readonly projectors: readonly IndexProjector[];

  constructor(projectors: readonly IndexProjector[]) {
    this.projectors = projectors;
  }

  async project(event: MemoryOutboxEvent): Promise<void> {
    for (const projector of this.projectors) {
      await projector.project(event);
    }
  }
}

export interface ProjectionBatchResult {
  pulled: number;
  processed: number;
  failed: number;
}

export class OutboxProjectionRunner {
  private readonly subscriber: OutboxSubscriber;
  private readonly projector: IndexProjector;

  constructor(subscriber: OutboxSubscriber, projector: IndexProjector) {
    this.subscriber = subscriber;
    this.projector = projector;
  }

  async runBatch(limit: number): Promise<ProjectionBatchResult> {
    const events = await this.subscriber.pullBatch(limit);
    if (events.length === 0) {
      return { pulled: 0, processed: 0, failed: 0 };
    }

    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const event of events) {
      try {
        await this.projector.project(event);
        succeeded.push(event.eventId);
      } catch {
        failed.push(event.eventId);
      }
    }

    if (succeeded.length > 0) {
      await this.subscriber.ack(succeeded);
    }
    if (failed.length > 0) {
      await this.subscriber.nack(failed, 'projection_failed');
    }

    return {
      pulled: events.length,
      processed: succeeded.length,
      failed: failed.length,
    };
  }
}
