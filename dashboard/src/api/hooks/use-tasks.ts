import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiCall } from '@/api/client';
import type { Task, TaskType, TaskSeverity, TaskUrgency, TaskStatus } from '@/api/types';

export function useTasks(scopeType = 'global', scopeId?: string) {
  return useQuery({
    queryKey: ['tasks', scopeType, scopeId],
    queryFn: () => api.tasks.list(scopeType, scopeId),
  });
}

export interface CreateTaskInput {
  title: string;
  description: string;
  taskType: TaskType;
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  severity?: TaskSeverity;
  urgency?: TaskUrgency;
  assignee?: string;
  dueDate?: string;
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiCall<{ task: Task }>('memory_task', {
        action: 'add',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string;
  taskType?: TaskType;
  severity?: TaskSeverity;
  urgency?: TaskUrgency;
  assignee?: string;
  dueDate?: string;
  changeReason?: string;
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTaskInput) =>
      apiCall<{ task: Task }>('memory_task', {
        action: 'update',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export interface UpdateTaskStatusInput {
  id: string;
  status: TaskStatus;
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: UpdateTaskStatusInput) =>
      apiCall<{ task: Task }>('memory_task', {
        action: 'update_status',
        id,
        status,
      }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      const previousTasks = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks'] });

      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) =>
        old?.map((task) => (task.id === id ? { ...task, status } : task))
      );

      return { previousTasks };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiCall<void>('memory_task', {
        action: 'deactivate',
        id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
