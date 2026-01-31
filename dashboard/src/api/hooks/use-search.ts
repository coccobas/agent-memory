import { useQuery } from '@tanstack/react-query';
import { api } from '../client';

export function useGlobalSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.search(query),
    enabled: enabled && query.length >= 2,
    staleTime: 1000 * 60,
  });
}
