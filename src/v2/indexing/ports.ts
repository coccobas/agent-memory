/**
 * Index-plane ports for outbox-driven projection.
 */

import type { MemoryOutboxEvent } from '../contracts/index.js';

export interface IndexProjector {
  name: string;
  project(event: MemoryOutboxEvent): Promise<void>;
}

export interface OutboxSubscriber {
  pullBatch(limit: number): Promise<readonly MemoryOutboxEvent[]>;
  ack(eventIds: readonly string[]): Promise<void>;
  nack(eventIds: readonly string[], reason: string): Promise<void>;
}

export interface EmbeddingWriter {
  writeEmbedding(
    entryId: string,
    model: string,
    dim: number,
    embedding: Float32Array
  ): Promise<void>;
  listPending(limit: number): Promise<readonly { entryId: string; contentHash: string }[]>;
}
