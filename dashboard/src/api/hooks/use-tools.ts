import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { flattenTool } from '@/api/transforms';
import type { Tool } from '@/api/types';

export function useTools(scopeType = 'global', scopeId?: string) {
  return useQuery({
    queryKey: ['tools', scopeType, scopeId],
    queryFn: async (): Promise<Tool[]> => {
      const items = await api.tools.listAll(scopeType, scopeId);
      return items.map(flattenTool);
    },
  });
}
