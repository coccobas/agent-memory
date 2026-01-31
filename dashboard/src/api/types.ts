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

// Episode
export interface Episode {
  id: string;
  sessionId?: string;
  name: string;
  description?: string;
  status: 'planned' | 'active' | 'completed' | 'failed' | 'cancelled';
  outcome?: string;
  outcomeType?: 'success' | 'partial' | 'failure' | 'abandoned';
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  triggerType?: string;
  createdAt: string;
  isActive: boolean;
}

// Episode Event
export interface EpisodeEvent {
  id: string;
  episodeId: string;
  eventType: 'started' | 'checkpoint' | 'decision' | 'error' | 'completed';
  name: string;
  description?: string;
  occurredAt: string;
  sequenceNum: number;
  entryType?: string;
  entryId?: string;
  data?: Record<string, unknown>;
}

// Timeline Entry
export interface TimelineEntry {
  timestamp: string;
  type: 'episode_start' | 'episode_end' | 'event';
  name: string;
  description?: string;
  episodeId: string;
  eventId?: string;
  entryType?: string;
  entryId?: string;
  data?: Record<string, unknown>;
}

// Project
export interface Project {
  id: string;
  name: string;
  description?: string;
  rootPath?: string;
  createdAt: string;
}

// Graph entities (no version pattern)
export interface GraphNode {
  id: string;
  name: string;
  nodeTypeName: string;
  properties?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  edgeTypeName: string;
  weight?: number;
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

export interface NodesData {
  nodes: GraphNode[];
  meta: OffsetPaginationMeta;
}

export interface EdgesData {
  edges: GraphEdge[];
  meta: OffsetPaginationMeta;
}

export interface EpisodesData {
  episodes: Episode[];
  count: number;
}

export interface EpisodeEventsData {
  events: EpisodeEvent[];
  count: number;
}

export interface TimelineData {
  timeline: TimelineEntry[];
  count: number;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolsUsed?: string[] | null;
}

export interface EpisodeMessagesData {
  episodeId: string;
  messages: ConversationMessage[];
  count: number;
}

// =============================================================
// LIBRARIAN TYPES
// =============================================================

export interface LibrarianTaskDetail {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
}

export interface LibrarianJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: string;
  currentTask?: string;
  completedTasks?: number;
  totalTasks?: number;
  scopeType?: string;
  scopeId?: string;
  initiatedBy?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  tasks: LibrarianTaskDetail[] | string[];
  results?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
}

export interface LibrarianRecommendation {
  id: string;
  title: string;
  type: 'strategy' | 'skill';
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  confidence: number;
  patternCount: number;
  createdAt: string;
  expiresAt?: string;
  pattern?: string;
  sourceExperiences?: string[];
}

export interface LibrarianServiceStatus {
  enabled: boolean;
  pendingRecommendations: number;
  config: {
    schedule: string;
    triggerOnSessionEnd: boolean;
  };
}

export interface LibrarianSchedulerStatus {
  running: boolean;
  schedule?: string | null;
  nextRun?: string | null;
}

export interface LibrarianStatus {
  service: LibrarianServiceStatus;
  scheduler: LibrarianSchedulerStatus;
  maintenanceJobs: {
    running: LibrarianJob[];
    recent: LibrarianJob[];
  };
}

export interface LibrarianStatusData {
  status: LibrarianStatus;
}

export interface LibrarianJobsData {
  jobs: LibrarianJob[];
  count: number;
}

export interface LibrarianRecommendationsData {
  recommendations: LibrarianRecommendation[];
  total: number;
}

export interface LibrarianRecommendationDetail {
  id: string;
  title: string;
  type: 'strategy' | 'skill';
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  confidence: number;
  patternCount: number;
  createdAt: string;
  expiresAt?: string;
  pattern?: string;
  sourceExperiences?: Array<{
    id: string;
    title: string;
    outcome?: string;
  }>;
}

export interface LibrarianRecommendationDetailData {
  recommendation: LibrarianRecommendationDetail;
}

// =============================================================
// ANALYTICS TYPES
// =============================================================

export interface ToolStatEntry {
  toolName: string;
  successCount: number;
  failureCount: number;
  partialCount: number;
  totalCount: number;
  successRate: number;
}

export interface ToolStatsData {
  byTool: ToolStatEntry[];
  totals: {
    success: number;
    failure: number;
    partial: number;
    total: number;
  };
}

export interface SubagentStatEntry {
  subagentType: string;
  totalInvocations: number;
  avgDurationMs?: number;
}

export interface SubagentStatsData {
  bySubagent: SubagentStatEntry[];
  totals: {
    totalInvocations: number;
  };
}

export interface NotificationStatEntry {
  severity: 'error' | 'warning' | 'info';
  count: number;
}

export interface NotificationStatsData {
  bySeverity: NotificationStatEntry[];
  totals: {
    error: number;
    warning: number;
    info: number;
    total: number;
  };
}

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
// SEARCH TYPES
// =============================================================

export interface SearchResult {
  type: 'guideline' | 'knowledge' | 'tool' | 'experience';
  id: string;
  title?: string;
  name?: string;
  snippet?: string;
  score: number;
}

export interface SearchData {
  results: SearchResult[];
  total: number;
}
