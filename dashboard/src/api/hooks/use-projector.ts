import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useProjectorStatus() {
  return useQuery({
    queryKey: ['projector', 'status'],
    queryFn: () => api.projector.status(),
    refetchInterval: 5000,
  });
}

export function useDrainProjector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (limit?: number) => api.projector.drainOnce(limit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projector'] });
    },
  });
}

export function useEmbedPending() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (limit?: number) => api.projector.embedPending(limit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projector'] });
    },
  });
}
