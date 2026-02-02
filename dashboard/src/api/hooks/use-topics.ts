import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useTopics(projectId?: string) {
  return useQuery({
    queryKey: ['topics', projectId],
    queryFn: () => api.topics.list(projectId),
  });
}

export function useTopic(topicId: string | null) {
  return useQuery({
    queryKey: ['topic', topicId],
    queryFn: () => api.topics.get(topicId!),
    enabled: !!topicId,
  });
}
