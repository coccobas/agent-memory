import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Project } from '@/api/types';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async (): Promise<Project[]> => {
      return api.projects.list();
    },
  });
}
