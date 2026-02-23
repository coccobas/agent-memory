/**
 * V2 write service.
 *
 * Responsibilities:
 * - Normalize all ingestion lanes into canonical contracts
 * - Persist inside a single transaction
 * - Append outbox event in the same transaction
 */

import { randomUUID } from 'node:crypto';
import type {
  CreateScopeRequest,
  DeleteEntryRequest,
  DeleteRelationRequest,
  EntrySnapshot,
  RelationSnapshot,
  ScopeSnapshot,
  UpsertEntryRequest,
  UpsertRelationRequest,
} from '../contracts/index.js';
import {
  createEntryDeletedEvent,
  createEntryUpsertedEvent,
  createRelationDeletedEvent,
  createRelationUpsertedEvent,
} from '../contracts/index.js';
import type { WriteUnitOfWork } from './ports.js';

export interface MemoryWriteServiceDeps {
  uow: WriteUnitOfWork;
  idGenerator?: () => string;
  clock?: () => Date;
}

function defaultIdGenerator(): string {
  return randomUUID();
}

function defaultClock(): Date {
  return new Date();
}

export class MemoryWriteService {
  private readonly uow: WriteUnitOfWork;
  private readonly nextId: () => string;
  private readonly now: () => Date;

  constructor(deps: MemoryWriteServiceDeps) {
    this.uow = deps.uow;
    this.nextId = deps.idGenerator ?? defaultIdGenerator;
    this.now = deps.clock ?? defaultClock;
  }

  async upsertEntry(request: UpsertEntryRequest): Promise<EntrySnapshot> {
    return this.uow.runInTransaction((tx) => {
      const snapshot = tx.upsertEntry(request);
      const occurredAt = this.now().toISOString();

      tx.appendOutbox([
        createEntryUpsertedEvent({
          eventId: this.nextId(),
          occurredAt,
          actorId: request.actorId,
          correlationId: request.correlationId,
          snapshot,
        }),
      ]);

      return snapshot;
    });
  }

  async deleteEntry(request: DeleteEntryRequest): Promise<EntrySnapshot | null> {
    return this.uow.runInTransaction((tx) => {
      const snapshot = tx.deleteEntry(request);
      if (!snapshot) {
        return null;
      }

      const occurredAt = this.now().toISOString();

      tx.appendOutbox([
        createEntryDeletedEvent({
          eventId: this.nextId(),
          occurredAt,
          actorId: request.actorId,
          correlationId: request.correlationId,
          ref: request.ref,
          reason: request.reason,
        }),
      ]);

      return snapshot;
    });
  }

  async upsertRelation(request: UpsertRelationRequest): Promise<RelationSnapshot> {
    return this.uow.runInTransaction((tx) => {
      const snapshot = tx.upsertRelation(request);
      const occurredAt = this.now().toISOString();

      tx.appendOutbox([
        createRelationUpsertedEvent({
          eventId: this.nextId(),
          occurredAt,
          actorId: request.actorId,
          correlationId: request.correlationId,
          snapshot,
        }),
      ]);

      return snapshot;
    });
  }

  async deleteRelation(request: DeleteRelationRequest): Promise<RelationSnapshot | null> {
    return this.uow.runInTransaction((tx) => {
      const snapshot = tx.deleteRelation(request);
      if (!snapshot) {
        return null;
      }

      const occurredAt = this.now().toISOString();
      tx.appendOutbox([
        createRelationDeletedEvent({
          eventId: this.nextId(),
          occurredAt,
          actorId: request.actorId,
          correlationId: request.correlationId,
          relationId: snapshot.id,
        }),
      ]);

      return snapshot;
    });
  }

  async createScope(request: CreateScopeRequest): Promise<ScopeSnapshot> {
    return this.uow.runInTransaction((tx) => {
      return tx.createScope(request);
    });
  }

  async archiveScope(scopeId: string): Promise<ScopeSnapshot | null> {
    return this.uow.runInTransaction((tx) => {
      return tx.archiveScope(scopeId);
    });
  }
}
