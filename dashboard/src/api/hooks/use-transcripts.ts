import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { TranscriptRole } from '@/api/types';

export interface TranscriptSearchOptions {
  limit?: number;
  offset?: number;
  roles?: TranscriptRole[];
  transcriptId?: string;
  contextWindow?: number;
}

export function useTranscriptSearch(
  query: string,
  options?: TranscriptSearchOptions,
  enabled = true
) {
  return useQuery({
    queryKey: ['transcripts', 'search', query, options],
    queryFn: () => api.transcripts.search(query, options),
    enabled: enabled && query.length >= 2,
    staleTime: 1000 * 60,
  });
}

export function useTranscriptList(
  options?: { limit?: number; offset?: number; status?: string; projectScopeId?: string },
  enabled = true
) {
  return useQuery({
    queryKey: ['transcripts', 'list', options],
    queryFn: () => api.transcripts.list(options),
    enabled,
    staleTime: 1000 * 30,
  });
}

export function useTranscriptLoad(
  transcriptId: string | null,
  options?: { fromSequence?: number; limit?: number }
) {
  return useQuery({
    queryKey: ['transcripts', 'load', transcriptId, options],
    queryFn: () => api.transcripts.load(transcriptId!, options),
    enabled: transcriptId !== null,
    staleTime: 1000 * 60 * 5,
  });
}
