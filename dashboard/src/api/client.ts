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
    listPage: (cursor?: string) =>
      apiCall<SessionsData>('memory_session', {
        action: 'list',
        limit: MAX_LIMIT,
        ...(cursor && { cursor }),
      }),

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
};
