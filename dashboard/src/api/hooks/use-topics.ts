import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useTopics(
  scopeType = 'global',
  scopeId?: string,
  includeInactive = false
) {
  return useQuery({
    queryKey: ['topics', scopeType, scopeId, includeInactive],
    queryFn: () =>
      api.topics.list({
        scopeType,
        scopeId,
        includeInactive,
      }),
  });
}

export function useTopic(topicId: string | null) {
  return useQuery({
    queryKey: ['topic', topicId],
    queryFn: () => api.topics.get(topicId!),
    enabled: !!topicId,
  });
}

export function useCreateTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      status?: 'active' | 'inactive';
      scopeType?: string;
      scopeId?: string;
      projectId?: string;
      metadata?: Record<string, unknown>;
    }) => api.topics.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
    },
  });
}

export function useUpdateTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      id: string;
      name?: string;
      description?: string;
      status?: 'active' | 'inactive';
      metadata?: Record<string, unknown>;
    }) => {
      const { id, ...updates } = input;
      return api.topics.update(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
    },
  });
}

export function useDeleteTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.topics.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
    },
  });
}

export function useAssignTranscriptToTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { transcriptId: string; topicId: string }) =>
      api.topics.assignTranscript(input.transcriptId, input.topicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
      queryClient.invalidateQueries({ queryKey: ['episodes'] });
    },
  });
}

export function useMoveTranscriptToTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { transcriptId: string; targetTopicId: string; sourceTopicId?: string }) =>
      api.topics.moveTranscript(input.transcriptId, input.targetTopicId, input.sourceTopicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
      queryClient.invalidateQueries({ queryKey: ['episodes'] });
    },
  });
}

export function useMergeTopics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { sourceTopicId: string; targetTopicId: string }) =>
      api.topics.merge(input.sourceTopicId, input.targetTopicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
      queryClient.invalidateQueries({ queryKey: ['episodes'] });
    },
  });
}
