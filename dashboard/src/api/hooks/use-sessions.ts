import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Session } from '@/api/types';

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async (): Promise<Session[]> => {
      return api.sessions.listAll();
    },
  });
}
