import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { GraphNode, GraphEdge } from '@/api/types';

export function useGraphNodes(scopeType = 'global', scopeId?: string) {
  return useQuery({
    queryKey: ['graph', 'nodes', scopeType, scopeId],
    queryFn: async (): Promise<GraphNode[]> => {
      return api.graph.nodesAll(scopeType, scopeId);
    },
  });
}

export function useGraphEdges() {
  return useQuery({
    queryKey: ['graph', 'edges'],
    queryFn: async (): Promise<GraphEdge[]> => {
      return api.graph.edgesAll();
    },
  });
}
