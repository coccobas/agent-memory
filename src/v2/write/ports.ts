/**
 * Write-plane ports for the V2 architecture.
 *
 * Persistence and outbox are injected behind these interfaces.
 */

import type {
  CreateScopeRequest,
  DeleteEntryRequest,
  DeleteRelationRequest,
  EntrySnapshot,
  MemoryOutboxEvent,
  RelationSnapshot,
  ScopeSnapshot,
  UpsertEntryRequest,
  UpsertRelationRequest,
} from '../contracts/index.js';

export interface WriteTransaction {
  upsertEntry(request: UpsertEntryRequest): EntrySnapshot;
  deleteEntry(request: DeleteEntryRequest): EntrySnapshot | null;
  upsertRelation(request: UpsertRelationRequest): RelationSnapshot;
  deleteRelation(request: DeleteRelationRequest): RelationSnapshot | null;
  appendOutbox(events: readonly MemoryOutboxEvent[]): void;
  createScope(request: CreateScopeRequest): ScopeSnapshot;
  archiveScope(scopeId: string): ScopeSnapshot | null;
}

export interface WriteUnitOfWork {
  runInTransaction<T>(work: (tx: WriteTransaction) => T): Promise<T>;
}
