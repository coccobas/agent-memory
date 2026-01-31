import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useEpisodes(sessionId?: string) {
  return useQuery({
    queryKey: ['episodes', sessionId],
    queryFn: () => api.episodes.list(sessionId),
  });
}

export function useEpisodeEvents(episodeId: string | null) {
  return useQuery({
    queryKey: ['episode-events', episodeId],
    queryFn: () => api.episodes.getEvents(episodeId!),
    enabled: !!episodeId,
  });
}

export function useSessionTimeline(sessionId: string | null) {
  return useQuery({
    queryKey: ['session-timeline', sessionId],
    queryFn: () => api.episodes.getTimeline(sessionId!),
    enabled: !!sessionId,
  });
}

export function useEpisodeMessages(episodeId: string | null) {
  return useQuery({
    queryKey: ['episode-messages', episodeId],
    queryFn: () => api.episodes.getMessages(episodeId!),
    enabled: !!episodeId,
  });
}
