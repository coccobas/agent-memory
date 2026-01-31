import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { flattenGuideline } from '@/api/transforms';
import type { Guideline } from '@/api/types';

export function useGuidelines(scopeType = 'global', scopeId?: string) {
  return useQuery({
    queryKey: ['guidelines', scopeType, scopeId],
    queryFn: async (): Promise<Guideline[]> => {
      const items = await api.guidelines.listAll(scopeType, scopeId);
      return items.map(flattenGuideline);
    },
  });
}
