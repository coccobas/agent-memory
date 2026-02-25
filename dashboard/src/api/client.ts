import type {
  ApiResponse,
  ApiAuthErrorResponse,
  CursorPaginationMeta,
  OffsetPaginationMeta,
  GuidelinesData,
  KnowledgeData,
  ToolsData,
  ExperiencesData,
  SessionsData,
  ProjectsData,
  NodesData,
  EdgesData,
  EpisodesData,
  EpisodeEventsData,
  TimelineData,
  EpisodeMessagesData,
  GuidelineWithVersion,
  KnowledgeWithVersion,
  ToolWithVersion,
  ExperienceWithVersion,
  Session,
  Episode,
  Project,
  Topic,
  GraphNode,
  GraphEdge,
  LibrarianStatusData,
  LibrarianJobsData,
  LibrarianRecommendationsData,
  LibrarianRecommendationDetailData,
  LibrarianStatus,
  LibrarianJob,
  LibrarianRecommendation,
  LibrarianRecommendationDetail,
  ToolStatsData,
  SubagentStatsData,
  NotificationStatsData,
  DashboardAnalyticsData,
  SearchResult,
  Task,
  TasksData,
  TaskType,
  TaskSeverity,
  TaskUrgency,
  TaskStatus,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8787`;
const API_KEY = import.meta.env.VITE_API_KEY || '';
const MAX_LIMIT = 100;

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function isAuthError(json: unknown): json is ApiAuthErrorResponse {
  return typeof json === 'object' && json !== null && 'error' in json && !('success' in json);
}

export async function apiCall<T>(toolName: string, params: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}/v1/tools/${toolName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY && { Authorization: `Bearer ${API_KEY}` }),
    },
    body: JSON.stringify(params),
  });

  const json = await response.json();

  if (isAuthError(json)) {
    throw new ApiError(json.error, response.status, json.code);
  }

  const typedJson = json as ApiResponse<T>;
  if (!typedJson.success) {
    throw new ApiError(
      typedJson.error?.message || `API error: ${response.status}`,
      response.status,
      typedJson.error?.code
    );
  }

  return typedJson.data;
}

interface CursorPagedResponse<T> {
  items: T[];
  meta: CursorPaginationMeta;
}

async function fetchAllByCursor<T>(
  fetcher: (cursor?: string) => Promise<CursorPagedResponse<T>>
): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetcher(cursor);
    allItems.push(...response.items);
    cursor = response.meta.hasMore ? response.meta.nextCursor : undefined;
  } while (cursor);

  return allItems;
}

interface OffsetPagedResponse<T> {
  items: T[];
  meta: OffsetPaginationMeta;
}

async function fetchAllByOffset<T>(
  fetcher: (offset: number) => Promise<OffsetPagedResponse<T>>
): Promise<T[]> {
  const allItems: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await fetcher(offset);
    allItems.push(...response.items);
    hasMore = response.meta.returnedCount === response.meta.limit;
    offset += response.meta.limit;
  }

  return allItems;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeCursorMeta(meta: unknown, returnedCount: number): CursorPaginationMeta {
  const record = asRecord(meta);
  if (!record) {
    return {
      returnedCount,
      hasMore: false,
    };
  }

  return {
    returnedCount: asNumber(record.returnedCount) ?? returnedCount,
    hasMore: asBoolean(record.hasMore) ?? false,
    nextCursor: asString(record.nextCursor),
  };
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return asRecord(parsed) ?? undefined;
    } catch {
      return undefined;
    }
  }
  return asRecord(value) ?? undefined;
}

function normalizeTopic(rawTopic: unknown): Topic | null {
  const record = asRecord(rawTopic);
  if (!record) return null;

  const id = asString(record.id);
  if (!id) return null;

  const status = asString(record.status) === 'inactive' ? 'inactive' : 'active';
  const createdAt = asString(record.createdAt) ?? asString(record.created_at) ?? new Date().toISOString();
  const updatedAt = asString(record.updatedAt) ?? asString(record.updated_at) ?? createdAt;
  const name = asString(record.name) ?? `Topic ${id.slice(0, 8)}`;
  const metadata = parseMetadata(record.metadata);

  return {
    id,
    projectId: asString(record.projectId) ?? asString(record.project_id),
    name,
    description: asString(record.description),
    status,
    scopeType: asString(record.scopeType) ?? asString(record.scope_type) ?? 'project',
    scopeId: asString(record.scopeId) ?? asString(record.scope_id),
    transcriptCount: asNumber(record.transcriptCount) ?? asNumber(record.transcript_count),
    manualTranscriptCount:
      asNumber(record.manualTranscriptCount) ?? asNumber(record.manual_transcript_count),
    autoTranscriptCount: asNumber(record.autoTranscriptCount) ?? asNumber(record.auto_transcript_count),
    isActive: asBoolean(record.isActive) ?? asBoolean(record.is_active) ?? status === 'active',
    createdAt,
    updatedAt,
    metadata,
  };
}

function normalizeSession(rawSession: unknown): Session | null {
  const record = asRecord(rawSession);
  if (!record) return null;

  const id = asString(record.id);
  if (!id) return null;

  const rawStatus = asString(record.status);
  const status =
    rawStatus === 'active' || rawStatus === 'completed' || rawStatus === 'discarded' || rawStatus === 'paused'
      ? rawStatus
      : 'completed';

  return {
    id,
    projectId: asString(record.projectId) ?? asString(record.project_id),
    name: asString(record.name),
    purpose: asString(record.purpose),
    agentId: asString(record.agentId) ?? asString(record.agent_id),
    status,
    startedAt: asString(record.startedAt) ?? asString(record.started_at) ?? new Date().toISOString(),
    endedAt: asString(record.endedAt) ?? asString(record.ended_at),
    metadata: parseMetadata(record.metadata),
  };
}

function topicToLegacySession(topic: Topic): Session {
  return {
    id: topic.id,
    projectId: topic.projectId,
    name: topic.name,
    purpose: topic.description,
    status: topic.status === 'active' ? 'active' : 'completed',
    startedAt: topic.createdAt,
    endedAt: topic.status === 'active' ? undefined : topic.updatedAt,
    metadata: {
      source: 'topic_alias',
      transcriptCount: topic.transcriptCount,
      manualTranscriptCount: topic.manualTranscriptCount,
      autoTranscriptCount: topic.autoTranscriptCount,
      ...(topic.metadata ?? {}),
    },
  };
}

export const api = {
  guidelines: {
    listPage: (scopeType = 'global', scopeId?: string, cursor?: string) =>
      apiCall<GuidelinesData>('memory_guideline', {
        action: 'list',
        scopeType,
        limit: MAX_LIMIT,
        ...(scopeId && { scopeId }),
        ...(cursor && { cursor }),
      }),

    listAll: async (scopeType = 'global', scopeId?: string): Promise<GuidelineWithVersion[]> => {
      return fetchAllByCursor(async (cursor) => {
        const data = await api.guidelines.listPage(scopeType, scopeId, cursor);
        return { items: data.guidelines, meta: data.meta };
      });
    },
  },

  knowledge: {
    listPage: (scopeType = 'global', scopeId?: string, cursor?: string) =>
      apiCall<KnowledgeData>('memory_knowledge', {
        action: 'list',
        scopeType,
        limit: MAX_LIMIT,
        ...(scopeId && { scopeId }),
        ...(cursor && { cursor }),
      }),

    listAll: async (scopeType = 'global', scopeId?: string): Promise<KnowledgeWithVersion[]> => {
      return fetchAllByCursor(async (cursor) => {
        const data = await api.knowledge.listPage(scopeType, scopeId, cursor);
        return { items: data.knowledge, meta: data.meta };
      });
    },
  },

  tools: {
    listPage: (scopeType = 'global', scopeId?: string, cursor?: string) =>
      apiCall<ToolsData>('memory_tool', {
        action: 'list',
        scopeType,
        limit: MAX_LIMIT,
        ...(scopeId && { scopeId }),
        ...(cursor && { cursor }),
      }),

    listAll: async (scopeType = 'global', scopeId?: string): Promise<ToolWithVersion[]> => {
      return fetchAllByCursor(async (cursor) => {
        const data = await api.tools.listPage(scopeType, scopeId, cursor);
        return { items: data.tools, meta: data.meta };
      });
    },
  },

  experiences: {
    listPage: (scopeType = 'global', scopeId?: string, cursor?: string) =>
      apiCall<ExperiencesData>('memory_experience', {
        action: 'list',
        scopeType,
        limit: MAX_LIMIT,
        ...(scopeId && { scopeId }),
        ...(cursor && { cursor }),
      }),

    listAll: async (scopeType = 'global', scopeId?: string): Promise<ExperienceWithVersion[]> => {
      return fetchAllByCursor(async (cursor) => {
        const data = await api.experiences.listPage(scopeType, scopeId, cursor);
        return { items: data.experiences, meta: data.meta };
      });
    },
  },

  sessions: {
    listPage: async (cursor?: string): Promise<SessionsData> => {
      const data = await apiCall<Record<string, unknown>>('memory_session', {
        action: 'list',
        limit: MAX_LIMIT,
        ...(cursor && { cursor }),
      });

      const rawSessions = Array.isArray(data.sessions) ? data.sessions : [];
      const sessions = rawSessions
        .map((session) => normalizeSession(session))
        .filter((session): session is Session => session !== null);

      if (sessions.length > 0) {
        return {
          sessions,
          meta: normalizeCursorMeta(data.meta, sessions.length),
        };
      }

      const rawTopics = Array.isArray(data.topics) ? data.topics : [];
      const topics = rawTopics
        .map((topic) => normalizeTopic(topic))
        .filter((topic): topic is Topic => topic !== null);

      return {
        sessions: topics.map(topicToLegacySession),
        meta: normalizeCursorMeta(data.meta, topics.length),
      };
    },

    listAll: async (): Promise<Session[]> => {
      return fetchAllByCursor(async (cursor) => {
        const data = await api.sessions.listPage(cursor);
        return { items: data.sessions, meta: data.meta };
      });
    },
  },

  episodes: {
    list: async (sessionId?: string): Promise<Episode[]> => {
      const data = await apiCall<EpisodesData>('memory_episode', {
        action: 'list',
        limit: MAX_LIMIT,
        ...(sessionId && { sessionId }),
      });
      return data.episodes;
    },

    getEvents: async (episodeId: string) => {
      const data = await apiCall<EpisodeEventsData>('memory_episode', {
        action: 'get_events',
        id: episodeId,
      });
      return data.events;
    },

    getTimeline: async (sessionId: string) => {
      const data = await apiCall<TimelineData>('memory_episode', {
        action: 'get_timeline',
        sessionId,
      });
      return data.timeline;
    },

    getMessages: async (episodeId: string) => {
      const data = await apiCall<EpisodeMessagesData>('memory_episode', {
        action: 'get_messages',
        id: episodeId,
      });
      return data.messages;
    },
  },

  projects: {
    list: async (): Promise<Project[]> => {
      const data = await apiCall<ProjectsData>('memory_project', {
        action: 'list',
      });
      return data.projects;
    },
  },

  graph: {
    nodesPage: (scopeType = 'global', scopeId?: string, offset = 0) =>
      apiCall<NodesData>('graph_node', {
        action: 'list',
        limit: MAX_LIMIT,
        offset,
        scopeType,
        ...(scopeId && { scopeId }),
      }),

    edgesPage: (offset = 0) =>
      apiCall<EdgesData>('graph_edge', {
        action: 'list',
        limit: MAX_LIMIT,
        offset,
      }),

    nodesAll: async (scopeType = 'global', scopeId?: string): Promise<GraphNode[]> => {
      return fetchAllByOffset(async (offset) => {
        const data = await api.graph.nodesPage(scopeType, scopeId, offset);
        return { items: data.nodes, meta: data.meta };
      });
    },

    edgesAll: async (): Promise<GraphEdge[]> => {
      return fetchAllByOffset(async (offset) => {
        const data = await api.graph.edgesPage(offset);
        return { items: data.edges, meta: data.meta };
      });
    },
  },

  librarian: {
    getStatus: async (): Promise<LibrarianStatus> => {
      const data = await apiCall<LibrarianStatusData>('memory_librarian', {
        action: 'status',
      });
      return data.status;
    },

    listJobs: async (
      status?: 'pending' | 'running' | 'completed' | 'failed'
    ): Promise<LibrarianJob[]> => {
      const data = await apiCall<LibrarianJobsData>('memory_librarian', {
        action: 'list_jobs',
        limit: MAX_LIMIT,
        ...(status && { status }),
      });
      return data.jobs;
    },

    listRecommendations: async (
      status?: 'pending' | 'approved' | 'rejected' | 'skipped'
    ): Promise<LibrarianRecommendation[]> => {
      const data = await apiCall<LibrarianRecommendationsData>('memory_librarian', {
        action: 'list_recommendations',
        limit: MAX_LIMIT,
        ...(status && { status }),
      });
      return data.recommendations;
    },

    getRecommendation: async (id: string): Promise<LibrarianRecommendationDetail> => {
      const data = await apiCall<LibrarianRecommendationDetailData>('memory_librarian', {
        action: 'show_recommendation',
        recommendationId: id,
      });
      return data.recommendation;
    },

    approveRecommendation: async (id: string, notes?: string): Promise<void> => {
      await apiCall('memory_librarian', {
        action: 'approve',
        recommendationId: id,
        ...(notes && { notes }),
      });
    },

    rejectRecommendation: async (id: string, notes?: string): Promise<void> => {
      await apiCall('memory_librarian', {
        action: 'reject',
        recommendationId: id,
        ...(notes && { notes }),
      });
    },

    skipRecommendation: async (id: string, notes?: string): Promise<void> => {
      await apiCall('memory_librarian', {
        action: 'skip',
        recommendationId: id,
        ...(notes && { notes }),
      });
    },

    runMaintenance: async (
      scopeType?: string,
      scopeId?: string,
      tasks?: string[]
    ): Promise<{ jobId: string }> => {
      const data = await apiCall<{ jobId: string }>('memory_librarian', {
        action: 'run_maintenance',
        ...(scopeType && { scopeType }),
        ...(scopeId && { scopeId }),
        ...(tasks && { tasks }),
      });
      return data;
    },

    getJobStatus: async (jobId: string): Promise<LibrarianJob> => {
      const data = await apiCall<{ job: LibrarianJob }>('memory_librarian', {
        action: 'get_job_status',
        jobId,
      });
      return data.job;
    },
  },

  analytics: {
    getToolStats: async (timeRange: 'day' | 'week' | 'month' = 'week'): Promise<ToolStatsData> => {
      const data = await apiCall<ToolStatsData>('memory_analytics', {
        action: 'get_tool_stats',
        timeRange,
      });
      return data;
    },

    getSubagentStats: async (
      timeRange: 'day' | 'week' | 'month' = 'week'
    ): Promise<SubagentStatsData> => {
      const data = await apiCall<SubagentStatsData>('memory_analytics', {
        action: 'get_subagent_stats',
        timeRange,
      });
      return data;
    },

    getNotificationStats: async (
      timeRange: 'day' | 'week' | 'month' = 'week'
    ): Promise<NotificationStatsData> => {
      const data = await apiCall<NotificationStatsData>('memory_analytics', {
        action: 'get_notification_stats',
        timeRange,
      });
      return data;
    },

    getDashboard: async (): Promise<DashboardAnalyticsData> => {
      const data = await apiCall<DashboardAnalyticsData>('memory_analytics', {
        action: 'get_dashboard',
      });
      return data;
    },
  },

  search: async (query: string): Promise<SearchResult[]> => {
    const data = await apiCall<{ results: SearchResult[] }>('memory_query', {
      action: 'search',
      search: query,
      limit: 20,
    });
    return data.results;
  },

  tasks: {
    list: async (scopeType = 'global', scopeId?: string): Promise<Task[]> => {
      const data = await apiCall<TasksData>('memory_task', {
        action: 'list',
        scopeType,
        limit: MAX_LIMIT,
        ...(scopeId && { scopeId }),
      });
      return data.tasks;
    },

    create: async (task: {
      title: string;
      description: string;
      taskType: TaskType;
      scopeType: string;
      scopeId?: string;
      severity?: TaskSeverity;
      urgency?: TaskUrgency;
      assignee?: string;
      dueDate?: string;
    }): Promise<Task> => {
      const data = await apiCall<{ task: Task }>('memory_task', {
        action: 'add',
        ...task,
      });
      return data.task;
    },

    update: async (id: string, updates: Partial<Task>): Promise<Task> => {
      const data = await apiCall<{ task: Task }>('memory_task', {
        action: 'update',
        id,
        ...updates,
      });
      return data.task;
    },

    updateStatus: async (id: string, status: TaskStatus): Promise<Task> => {
      const data = await apiCall<{ task: Task }>('memory_task', {
        action: 'update_status',
        id,
        status,
      });
      return data.task;
    },

    delete: async (id: string): Promise<void> => {
      await apiCall('memory_task', {
        action: 'deactivate',
        id,
      });
    },
  },

  topics: {
    list: async (options?: {
      projectId?: string;
      scopeType?: string;
      scopeId?: string;
      includeInactive?: boolean;
      limit?: number;
      offset?: number;
    }): Promise<Topic[]> => {
      const data = await apiCall<Record<string, unknown>>('memory_topic', {
        action: 'list',
        ...(options?.projectId && { projectId: options.projectId }),
        ...(options?.scopeType && { scopeType: options.scopeType }),
        ...(options?.scopeId && { scopeId: options.scopeId }),
        ...(options?.includeInactive !== undefined && { includeInactive: options.includeInactive }),
        ...(options?.limit !== undefined && { limit: options.limit }),
        ...(options?.offset !== undefined && { offset: options.offset }),
      });

      const topics = Array.isArray(data.topics) ? data.topics : [];
      return topics
        .map((topic) => normalizeTopic(topic))
        .filter((topic): topic is Topic => topic !== null);
    },

    get: async (id: string): Promise<Topic> => {
      const data = await apiCall<Record<string, unknown>>('memory_topic', {
        action: 'get',
        id,
      });

      const topic = normalizeTopic(data.topic);
      if (!topic) {
        throw new ApiError(`Invalid topic payload for id ${id}`, 500);
      }
      return topic;
    },

    create: async (input: {
      name: string;
      description?: string;
      status?: 'active' | 'inactive';
      scopeType?: string;
      scopeId?: string;
      projectId?: string;
      metadata?: Record<string, unknown>;
    }): Promise<Topic> => {
      const data = await apiCall<Record<string, unknown>>('memory_topic', {
        action: 'create',
        ...input,
      });
      const topic = normalizeTopic(data.topic);
      if (!topic) {
        throw new ApiError('Invalid topic payload from create', 500);
      }
      return topic;
    },

    update: async (
      id: string,
      updates: {
        name?: string;
        description?: string;
        status?: 'active' | 'inactive';
        metadata?: Record<string, unknown>;
      }
    ): Promise<Topic> => {
      const data = await apiCall<Record<string, unknown>>('memory_topic', {
        action: 'update',
        id,
        ...updates,
      });
      const topic = normalizeTopic(data.topic);
      if (!topic) {
        throw new ApiError(`Invalid topic payload from update for id ${id}`, 500);
      }
      return topic;
    },

    deactivate: async (id: string): Promise<void> => {
      await apiCall('memory_topic', {
        action: 'deactivate',
        id,
      });
    },

    assignTranscript: async (transcriptId: string, topicId: string): Promise<void> => {
      await apiCall('memory_topic', {
        action: 'assign',
        transcriptId,
        topicId,
      });
    },

    moveTranscript: async (
      transcriptId: string,
      targetTopicId: string,
      sourceTopicId?: string
    ): Promise<void> => {
      await apiCall('memory_topic', {
        action: 'move',
        transcriptId,
        targetTopicId,
        ...(sourceTopicId && { sourceTopicId }),
      });
    },

    merge: async (sourceTopicId: string, targetTopicId: string): Promise<Topic | null> => {
      const data = await apiCall<Record<string, unknown>>('memory_topic', {
        action: 'merge',
        sourceTopicId,
        targetTopicId,
      });

      if (!data.topic) return null;
      return normalizeTopic(data.topic);
    },
  },
};
