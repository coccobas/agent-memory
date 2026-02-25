import type {
  ApiResponse,
  ApiAuthErrorResponse,
  CursorPaginationMeta,
  GuidelinesData,
  KnowledgeData,
  ToolsData,
  ExperiencesData,
  SessionsData,
  ProjectsData,
  GuidelineWithVersion,
  KnowledgeWithVersion,
  ToolWithVersion,
  ExperienceWithVersion,
  Session,
  Project,
  SearchResult,
  TranscriptSearchData,
  TranscriptListData,
  TranscriptLoadData,
  TranscriptRole,
  ProjectorStatus,
  ProjectorDrainResult,
  ProjectorEmbedResult,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
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

  projects: {
    list: async (): Promise<Project[]> => {
      const data = await apiCall<ProjectsData>('memory_project', {
        action: 'list',
      });
      return data.projects;
    },
  },

  search: async (
    query: string,
    options?: { sources?: string[]; types?: string[] }
  ): Promise<SearchResult[]> => {
    const data = await apiCall<{ results: SearchResult[] }>('memory_query', {
      action: 'search',
      query,
      limit: 20,
      ...(options?.sources && { sources: options.sources }),
      ...(options?.types && { types: options.types }),
    });
    return data.results;
  },

  transcripts: {
    list: (options?: {
      limit?: number;
      offset?: number;
      status?: string;
      projectScopeId?: string;
    }) =>
      apiCall<TranscriptListData>('memory_transcript_search', {
        action: 'list',
        limit: options?.limit ?? 20,
        ...(options?.offset !== undefined && { offset: options.offset }),
        ...(options?.status && { status: options.status }),
        ...(options?.projectScopeId && { projectScopeId: options.projectScopeId }),
      }),

    load: (transcriptId: string, options?: { fromSequence?: number; limit?: number }) =>
      apiCall<TranscriptLoadData>('memory_transcript_search', {
        action: 'load',
        transcriptId,
        ...(options?.fromSequence !== undefined && { fromSequence: options.fromSequence }),
        ...(options?.limit !== undefined && { limit: options.limit }),
      }),

    search: (
      query: string,
      options?: {
        limit?: number;
        offset?: number;
        roles?: TranscriptRole[];
        transcriptId?: string;
        contextWindow?: number;
      }
    ) =>
      apiCall<TranscriptSearchData>('memory_transcript_search', {
        action: 'search',
        query,
        limit: options?.limit ?? 20,
        ...(options?.offset !== undefined && { offset: options.offset }),
        ...(options?.roles && { roles: options.roles }),
        ...(options?.transcriptId && { transcriptId: options.transcriptId }),
        ...(options?.contextWindow !== undefined && { contextWindow: options.contextWindow }),
      }),
  },

  projector: {
    status: () => apiCall<ProjectorStatus>('memory_projector', { action: 'status' }),

    drainOnce: (limit = 100) =>
      apiCall<ProjectorDrainResult>('memory_projector', { action: 'drain_once', limit }),

    embedPending: (limit = 50) =>
      apiCall<ProjectorEmbedResult>('memory_projector', { action: 'embed_pending', limit }),
  },
};
