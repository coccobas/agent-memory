/**
 * Core/shared types used across transports (MCP, REST, etc).
 *
 * Keep this file free of any transport-specific concerns so that
 * adapters can be built independently.
 */

import type { ScopeType, EntryType, RelationType } from '../db/schema.js';

export interface ResponseMeta {
  totalCount: number;
  returnedCount: number;
  truncated: boolean;
  hasMore: boolean;
  nextCursor?: string;
}

export interface MemoryQueryParams {
  types?: ('tools' | 'guidelines' | 'knowledge')[];
  scope?: {
    type: ScopeType;
    id?: string;
    inherit?: boolean;
  };
  tags?: {
    include?: string[];
    require?: string[];
    exclude?: string[];
  };
  search?: string;
  relatedTo?: {
    type: EntryType;
    id: string;
    relation?: RelationType;
    depth?: number;
    direction?: 'forward' | 'backward' | 'both';
    maxResults?: number;
  };
  followRelations?: boolean;
  limit?: number;
  includeVersions?: boolean;
  includeInactive?: boolean;
  compact?: boolean;
  semanticSearch?: boolean;
  semanticThreshold?: number;
  useFts5?: boolean;
  fields?: string[];
  fuzzy?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  priority?: { min?: number; max?: number };
  regex?: boolean;
  conversationId?: string;
  messageId?: string;
  autoLinkContext?: boolean;
  recencyWeight?: number;
  decayHalfLifeDays?: number;
  decayFunction?: 'linear' | 'exponential' | 'step';
  useUpdatedAt?: boolean;
}

export interface MemoryContextParams {
  scopeType: ScopeType;
  scopeId?: string;
  inherit?: boolean;
  compact?: boolean;
  limitPerType?: number;
}

