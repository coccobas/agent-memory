import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useLibrarianStatus() {
  return useQuery({
    queryKey: ['librarian-status'],
    queryFn: () => api.librarian.getStatus(),
    refetchInterval: 30000,
  });
}

export function useLibrarianJobs(status?: 'pending' | 'running' | 'completed' | 'failed') {
  return useQuery({
    queryKey: ['librarian-jobs', status],
    queryFn: () => api.librarian.listJobs(status),
    refetchInterval: (query) => {
      const jobs = query.state.data;
      const hasRunningJobs = jobs?.some(
        (job) => job.status === 'running' || job.status === 'pending'
      );
      return hasRunningJobs ? 3000 : false;
    },
  });
}

export function useLibrarianRecommendations(
  status?: 'pending' | 'approved' | 'rejected' | 'skipped'
) {
  return useQuery({
    queryKey: ['librarian-recommendations', status],
    queryFn: () => api.librarian.listRecommendations(status),
  });
}

export function useLibrarianRecommendation(id: string | null) {
  return useQuery({
    queryKey: ['librarian-recommendation', id],
    queryFn: () => api.librarian.getRecommendation(id!),
    enabled: !!id,
  });
}

export function useApproveRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.librarian.approveRecommendation(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['librarian-recommendations'],
      });
      queryClient.invalidateQueries({ queryKey: ['librarian-status'] });
    },
  });
}

export function useRejectRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.librarian.rejectRecommendation(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['librarian-recommendations'],
      });
      queryClient.invalidateQueries({ queryKey: ['librarian-status'] });
    },
  });
}

export function useSkipRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.librarian.skipRecommendation(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['librarian-recommendations'],
      });
      queryClient.invalidateQueries({ queryKey: ['librarian-status'] });
    },
  });
}

export function useRunMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      scopeType,
      scopeId,
      tasks,
    }: {
      scopeType?: string;
      scopeId?: string;
      tasks?: string[];
    }) => api.librarian.runMaintenance(scopeType, scopeId, tasks),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['librarian-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['librarian-status'] });
    },
  });
}

export function useJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['librarian-job', jobId],
    queryFn: () => api.librarian.getJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const job = query.state.data;
      if (job?.status === 'running' || job?.status === 'pending') {
        return 2000;
      }
      return false;
    },
  });
}
