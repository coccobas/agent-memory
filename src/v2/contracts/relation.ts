/**
 * V2 domain contracts for explicit relationships between entries.
 */

import type { EntryRef } from './entry.js';

export type RelationType =
  | 'applies_to'
  | 'depends_on'
  | 'conflicts_with'
  | 'related_to'
  | 'parent_task'
  | 'subtask_of'
  | 'promoted_to';

export interface UpsertRelationRequest {
  relationId?: string;
  source: EntryRef;
  target: EntryRef;
  relationType: RelationType;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  actorId?: string | null;
}

export interface DeleteRelationRequest {
  relationId?: string;
  source?: EntryRef;
  target?: EntryRef;
  relationType?: RelationType;
  correlationId?: string;
  actorId?: string | null;
}

export interface RelationSnapshot {
  id: string;
  source: EntryRef;
  target: EntryRef;
  relationType: RelationType;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}
