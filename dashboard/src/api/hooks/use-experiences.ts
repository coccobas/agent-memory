import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { flattenExperience } from '@/api/transforms';
import type { Experience } from '@/api/types';

export function useExperiences(scopeType = 'global', scopeId?: string) {
  return useQuery({
    queryKey: ['experiences', scopeType, scopeId],
    queryFn: async (): Promise<Experience[]> => {
      const items = await api.experiences.listAll(scopeType, scopeId);
      return items.map(flattenExperience);
    },
  });
}
