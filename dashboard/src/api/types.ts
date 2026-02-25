// =============================================================
// BASE ENTITY TYPES (what API returns - *WithVersion pattern)
// =============================================================

// Version objects contain mutable fields
export interface GuidelineVersion {
  id: string;
  content: string;
  category?: string;
  priority?: number;
  rationale?: string;
}

export interface KnowledgeVersion {
  id: string;
  title: string;
  content: string;
  category: 'decision' | 'fact' | 'context' | 'reference';
  confidence?: number;
  source?: string;
}

export interface ToolVersion {
  id: string;
  description?: string;
  category: 'mcp' | 'cli' | 'function' | 'api';
  parameters?: Record<string, unknown>;
  constraints?: string;
}

export interface ExperienceVersion {
  id: string;
  title: string;
  content: string;
  scenario?: string;
  outcome?: string;
  level: 'case' | 'strategy';
  confidence?: number;
}

// Base entities (immutable fields + currentVersion)
export interface GuidelineWithVersion {
  id: string;
  name: string;
  scopeType: string;
  scopeId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion: GuidelineVersion;
}

export interface KnowledgeWithVersion {
  id: string;
  scopeType: string;
  scopeId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion: KnowledgeVersion;
}

export interface ToolWithVersion {
  id: string;
  name: string;
  category: 'mcp' | 'cli' | 'function' | 'api';
  scopeType: string;
  scopeId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion: ToolVersion;
}

export interface ExperienceWithVersion {
  id: string;
  scopeType: string;
  scopeId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion: ExperienceVersion;
}

// Session (no version pattern)
export interface Session {
  id: string;
  projectId?: string;
  name?: string;
  purpose?: string;
  agentId?: string;
  status: 'active' | 'completed' | 'discarded' | 'paused';
  startedAt: string;
  endedAt?: string;
  metadata?: Record<string, unknown>;
}

// Project
export interface Project {
  id: string;
  name: string;
  description?: string;
  rootPath?: string;
  createdAt: string;
}

// =============================================================
// FLATTENED TYPES (for UI display - helper transforms)
// =============================================================

export interface Guideline {
  id: string;
  name: string;
  content: string;
  category?: string;
  priority?: number;
  rationale?: string;
  isActive: boolean;
  scopeType: string;
  scopeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Knowledge {
  id: string;
  title: string;
  content: string;
  category: 'decision' | 'fact' | 'context' | 'reference';
  confidence?: number;
  source?: string;
  isActive: boolean;
  scopeType: string;
  scopeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tool {
  id: string;
  name: string;
  description?: string;
  category: 'mcp' | 'cli' | 'function' | 'api';
  parameters?: Record<string, unknown>;
  constraints?: string;
  isActive: boolean;
  scopeType: string;
  scopeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Experience {
  id: string;
  title: string;
  content: string;
  scenario?: string;
  outcome?: string;
  level: 'case' | 'strategy';
  confidence?: number;
  isActive: boolean;
  scopeType: string;
  scopeId?: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================
// PAGINATION TYPES
// =============================================================

export interface CursorPaginationMeta {
  returnedCount: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface OffsetPaginationMeta {
  returnedCount: number;
  limit: number;
  offset: number;
}

// =============================================================
// API RESPONSE WRAPPERS
// =============================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiToolErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
  };
}

export interface ApiAuthErrorResponse {
  error: string;
  code: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiToolErrorResponse;

// Tool-specific response data shapes
export interface GuidelinesData {
  guidelines: GuidelineWithVersion[];
  meta: CursorPaginationMeta;
}

export interface KnowledgeData {
  knowledge: KnowledgeWithVersion[];
  meta: CursorPaginationMeta;
}

export interface ToolsData {
  tools: ToolWithVersion[];
  meta: CursorPaginationMeta;
}

export interface ExperiencesData {
  experiences: ExperienceWithVersion[];
  meta: CursorPaginationMeta;
}

export interface SessionsData {
  sessions: Session[];
  meta: CursorPaginationMeta;
}

export interface ProjectsData {
  projects: Project[];
  meta: { returnedCount: number };
}

// =============================================================
// DASHBOARD ANALYTICS
// =============================================================

export interface DashboardAnalyticsData {
  health?: {
    score: number;
    grade: string;
  };
  summary?: {
    totalEntries: number;
    activeSessions: number;
    recentActivity: number;
  };
}

// =============================================================
// TRANSCRIPT TYPES
// =============================================================

export type TranscriptRole = 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result';

export interface TranscriptMessage {
  id: string;
  role: TranscriptRole;
  content: string;
  toolName?: string;
  timestamp?: string;
}

export interface TranscriptSnippet {
  transcriptId: string;
  transcript: {
    claudeSessionId?: string;
    projectScopeId?: string;
    createdAt?: string;
  };
  messages: TranscriptMessage[];
  matchedMessageId: string;
  score: number;
}

export interface TranscriptSearchData {
  results: TranscriptSnippet[];
  totalCount: number;
}

export type TranscriptStatus = 'active' | 'ended' | 'extracted';

export interface TranscriptRecord {
  id: string;
  claudeSessionId: string;
  sessionScopeId?: string;
  projectScopeId?: string;
  agentId?: string;
  messageCount: number;
  status: TranscriptStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptListData {
  transcripts: TranscriptRecord[];
  totalCount: number;
}

export interface TranscriptLoadData {
  transcript: TranscriptRecord | null;
  messages: TranscriptMessage[];
  totalMessages: number;
}

// =============================================================
// PROJECTOR TYPES
// =============================================================

export interface ProjectorStatus {
  projector: string;
  latestSeq: number;
  checkpointSeq: number;
  lag: number;
  pendingCount: number;
  oldestPendingAgeMs: number;
}

export interface ProjectorDrainResult extends ProjectorStatus {
  action: string;
  pulled: number;
  processed: number;
  failed: number;
}

export interface ProjectorEmbedResult extends ProjectorStatus {
  action: string;
  processed: number;
  failed: number;
  skipped: number;
  errors?: Array<{ entryId: string; error: string }>;
}

// =============================================================
// SEARCH TYPES
// =============================================================

export type EntrySource =
  | 'remember'
  | 'observe_extract'
  | 'observe_commit'
  | 'hook_capture'
  | 'import';

export interface SearchResult {
  type: 'guideline' | 'knowledge' | 'tool' | 'experience';
  id: string;
  title?: string;
  name?: string;
  snippet?: string;
  score: number;
  source?: EntrySource;
}

export interface SearchData {
  results: SearchResult[];
  total: number;
}
