import { useQuery } from '@tanstack/react-query';
import { api } from '../client';

export function useToolStats(timeRange: 'day' | 'week' | 'month' = 'week') {
  return useQuery({
    queryKey: ['analytics', 'tools', timeRange],
    queryFn: () => api.analytics.getToolStats(timeRange),
  });
}

export function useSubagentStats(timeRange: 'day' | 'week' | 'month' = 'week') {
  return useQuery({
    queryKey: ['analytics', 'subagents', timeRange],
    queryFn: () => api.analytics.getSubagentStats(timeRange),
  });
}

export function useNotificationStats(timeRange: 'day' | 'week' | 'month' = 'week') {
  return useQuery({
    queryKey: ['analytics', 'notifications', timeRange],
    queryFn: () => api.analytics.getNotificationStats(timeRange),
  });
}

export function useDashboardAnalytics() {
  return useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.analytics.getDashboard(),
  });
}
