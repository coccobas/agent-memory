/**
 * V2 domain contracts for memory entries.
 *
 * This is the canonical write/read shape for a clean restart.
 * Every ingestion lane should normalize into these types first.
 */

export type ScopeType = 'global' | 'org' | 'project' | 'session';

export type EntryType = 'guideline' | 'knowledge' | 'tool' | 'experience';

export type EntrySource =
  | 'remember'
  | 'observe_extract'
  | 'observe_commit'
  | 'hook_capture'
  | 'import';

export interface ScopeRef {
  type: ScopeType;
  id: string | null;
}

export interface EntryRef {
  type: EntryType;
  id: string;
}

interface BaseEntryData {
  type: EntryType;
  scope: ScopeRef;
  content: string;
  source: EntrySource;
  category?: string;
  confidence?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface GuidelineEntryData extends BaseEntryData {
  type: 'guideline';
  title: string;
  priority?: number;
  rationale?: string;
}

export interface KnowledgeEntryData extends BaseEntryData {
  type: 'knowledge';
  title: string;
  citation?: string;
}

export interface ToolEntryData extends BaseEntryData {
  type: 'tool';
  title: string;
  usage?: string;
}

export interface ExperienceEntryData extends BaseEntryData {
  type: 'experience';
  title: string;
  scenario?: string;
  outcome?: string;
}

export type EntryData =
  | GuidelineEntryData
  | KnowledgeEntryData
  | ToolEntryData
  | ExperienceEntryData;

export interface CreateScopeRequest {
  type: ScopeType;
  id: string | null;
  parentScopeId?: string;
  label?: string;
}

export interface ScopeSnapshot {
  id: string;
  type: ScopeType;
  externalId: string | null;
  parentScopeId: string | null;
  label: string | null;
  isArchived: boolean;
}

export interface UpsertEntryRequest {
  entryId?: string;
  expectedVersion?: number;
  data: EntryData;
  correlationId?: string;
  actorId?: string | null;
}

export interface DeleteEntryRequest {
  ref: EntryRef;
  reason?: string;
  correlationId?: string;
  actorId?: string | null;
}

export interface EntrySnapshot {
  ref: EntryRef;
  scope: ScopeRef;
  title: string;
  content: string;
  category: string | null;
  confidence: number | null;
  tags: string[];
  source: EntrySource;
  version: number;
  priority: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}
