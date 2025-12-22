/**
 * Entry-specific param types
 *
 * Tool, Guideline, and Knowledge params extend the base generic types.
 */

import type {
  BaseAddParams,
  BaseUpdateParams,
  BaseGetParams,
  BaseListParams,
  EntryIdParam,
} from './base.js';

// =============================================================================
// TOOL CATEGORY TYPE
// =============================================================================

export type ToolCategory = 'mcp' | 'cli' | 'function' | 'api';

// =============================================================================
// TOOL PARAMS
// =============================================================================

export interface ToolAddParams extends BaseAddParams {
  name: string;
  category?: ToolCategory;
  description?: string;
  parameters?: Record<string, unknown>;
  examples?: Array<Record<string, unknown>>;
  constraints?: string;
}

export interface ToolUpdateParams extends BaseUpdateParams {
  description?: string;
  parameters?: Record<string, unknown>;
  examples?: Array<Record<string, unknown>>;
  constraints?: string;
}

export interface ToolGetParams extends BaseGetParams {
  name?: string;
}

export interface ToolListParams extends BaseListParams {
  category?: ToolCategory;
}

export type ToolHistoryParams = EntryIdParam;
export type ToolDeactivateParams = EntryIdParam;

// =============================================================================
// GUIDELINE CATEGORY TYPE
// =============================================================================

// Guidelines use free-form string categories (e.g., 'security', 'code_style')
export type GuidelineCategory = string;

// =============================================================================
// GUIDELINE PARAMS
// =============================================================================

export interface GuidelineAddParams extends BaseAddParams {
  name: string;
  category?: GuidelineCategory;
  priority?: number;
  content: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
}

export interface GuidelineUpdateParams extends BaseUpdateParams {
  category?: GuidelineCategory;
  priority?: number;
  content?: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
}

export interface GuidelineGetParams extends BaseGetParams {
  name?: string;
}

export interface GuidelineListParams extends BaseListParams {
  category?: GuidelineCategory;
}

export type GuidelineHistoryParams = EntryIdParam;
export type GuidelineDeactivateParams = EntryIdParam;

// =============================================================================
// KNOWLEDGE CATEGORY TYPE
// =============================================================================

export type KnowledgeCategory = 'decision' | 'fact' | 'context' | 'reference';

// =============================================================================
// KNOWLEDGE PARAMS
// =============================================================================

export interface KnowledgeAddParams extends BaseAddParams {
  title: string; // Note: Knowledge uses 'title' instead of 'name'
  category?: KnowledgeCategory;
  content: string;
  source?: string;
  confidence?: number;
  validUntil?: string;
}

export interface KnowledgeUpdateParams extends BaseUpdateParams {
  category?: KnowledgeCategory;
  content?: string;
  source?: string;
  confidence?: number;
  validUntil?: string;
}

export interface KnowledgeGetParams extends BaseGetParams {
  title?: string; // Note: Knowledge uses 'title' instead of 'name'
}

export interface KnowledgeListParams extends BaseListParams {
  category?: KnowledgeCategory;
}

export type KnowledgeHistoryParams = EntryIdParam;
export type KnowledgeDeactivateParams = EntryIdParam;
