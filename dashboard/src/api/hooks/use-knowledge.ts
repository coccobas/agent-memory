import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { flattenKnowledge } from '@/api/transforms';
import type { Knowledge } from '@/api/types';

export function useKnowledge(scopeType = 'global', scopeId?: string) {
  return useQuery({
    queryKey: ['knowledge', scopeType, scopeId],
    queryFn: async (): Promise<Knowledge[]> => {
      const items = await api.knowledge.listAll(scopeType, scopeId);
      return items.map(flattenKnowledge);
    },
  });
}
