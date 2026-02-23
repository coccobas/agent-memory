/**
 * V2 outbox event contracts.
 *
 * Write-plane commits must append one of these events in the same transaction
 * as data changes. Indexers and cache invalidation should consume only these.
 */

import type { EntryRef, EntrySnapshot } from './entry.js';
import type { RelationSnapshot } from './relation.js';

export const OUTBOX_EVENT_TYPES = {
  ENTRY_UPSERTED: 'memory.entry.upserted.v1',
  ENTRY_DELETED: 'memory.entry.deleted.v1',
  RELATION_UPSERTED: 'memory.relation.upserted.v1',
  RELATION_DELETED: 'memory.relation.deleted.v1',
} as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[keyof typeof OUTBOX_EVENT_TYPES];

interface OutboxEventEnvelope<TType extends OutboxEventType, TPayload> {
  eventId: string;
  eventType: TType;
  eventVersion: 1;
  occurredAt: string;
  aggregateType: 'entry' | 'relation';
  aggregateId: string;
  correlationId?: string;
  actorId: string | null;
  payload: TPayload;
}

interface EntryUpsertedPayload {
  snapshot: EntrySnapshot;
}

interface EntryDeletedPayload {
  ref: EntryRef;
  deletedAt: string;
  reason?: string;
}

interface RelationUpsertedPayload {
  snapshot: RelationSnapshot;
}

interface RelationDeletedPayload {
  relationId: string;
  deletedAt: string;
}

export type EntryUpsertedEvent = OutboxEventEnvelope<
  typeof OUTBOX_EVENT_TYPES.ENTRY_UPSERTED,
  EntryUpsertedPayload
>;

export type EntryDeletedEvent = OutboxEventEnvelope<
  typeof OUTBOX_EVENT_TYPES.ENTRY_DELETED,
  EntryDeletedPayload
>;

export type RelationUpsertedEvent = OutboxEventEnvelope<
  typeof OUTBOX_EVENT_TYPES.RELATION_UPSERTED,
  RelationUpsertedPayload
>;

export type RelationDeletedEvent = OutboxEventEnvelope<
  typeof OUTBOX_EVENT_TYPES.RELATION_DELETED,
  RelationDeletedPayload
>;

export type MemoryOutboxEvent =
  | EntryUpsertedEvent
  | EntryDeletedEvent
  | RelationUpsertedEvent
  | RelationDeletedEvent;

export function createEntryUpsertedEvent(args: {
  eventId: string;
  occurredAt: string;
  actorId?: string | null;
  correlationId?: string;
  snapshot: EntrySnapshot;
}): EntryUpsertedEvent {
  return {
    eventId: args.eventId,
    eventType: OUTBOX_EVENT_TYPES.ENTRY_UPSERTED,
    eventVersion: 1,
    occurredAt: args.occurredAt,
    aggregateType: 'entry',
    aggregateId: args.snapshot.ref.id,
    actorId: args.actorId ?? null,
    correlationId: args.correlationId,
    payload: {
      snapshot: args.snapshot,
    },
  };
}

export function createEntryDeletedEvent(args: {
  eventId: string;
  occurredAt: string;
  actorId?: string | null;
  correlationId?: string;
  ref: EntryRef;
  reason?: string;
}): EntryDeletedEvent {
  return {
    eventId: args.eventId,
    eventType: OUTBOX_EVENT_TYPES.ENTRY_DELETED,
    eventVersion: 1,
    occurredAt: args.occurredAt,
    aggregateType: 'entry',
    aggregateId: args.ref.id,
    actorId: args.actorId ?? null,
    correlationId: args.correlationId,
    payload: {
      ref: args.ref,
      deletedAt: args.occurredAt,
      reason: args.reason,
    },
  };
}

export function createRelationUpsertedEvent(args: {
  eventId: string;
  occurredAt: string;
  actorId?: string | null;
  correlationId?: string;
  snapshot: RelationSnapshot;
}): RelationUpsertedEvent {
  return {
    eventId: args.eventId,
    eventType: OUTBOX_EVENT_TYPES.RELATION_UPSERTED,
    eventVersion: 1,
    occurredAt: args.occurredAt,
    aggregateType: 'relation',
    aggregateId: args.snapshot.id,
    actorId: args.actorId ?? null,
    correlationId: args.correlationId,
    payload: {
      snapshot: args.snapshot,
    },
  };
}

export function createRelationDeletedEvent(args: {
  eventId: string;
  occurredAt: string;
  actorId?: string | null;
  correlationId?: string;
  relationId: string;
}): RelationDeletedEvent {
  return {
    eventId: args.eventId,
    eventType: OUTBOX_EVENT_TYPES.RELATION_DELETED,
    eventVersion: 1,
    occurredAt: args.occurredAt,
    aggregateType: 'relation',
    aggregateId: args.relationId,
    actorId: args.actorId ?? null,
    correlationId: args.correlationId,
    payload: {
      relationId: args.relationId,
      deletedAt: args.occurredAt,
    },
  };
}
