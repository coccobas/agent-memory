import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiCall } from '../client';

// =============================================================
// MUTATION INPUT TYPES
// =============================================================

export interface CreateGuidelineInput {
  name: string;
  content: string;
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  category?: string;
  priority?: number;
  rationale?: string;
}

export interface UpdateGuidelineInput {
  id: string;
  content?: string;
  category?: string;
  priority?: number;
  rationale?: string;
  changeReason?: string;
}

export interface CreateKnowledgeInput {
  title: string;
  content: string;
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  category: 'decision' | 'fact' | 'context' | 'reference';
  confidence?: number;
  source?: string;
}

export interface UpdateKnowledgeInput {
  id: string;
  title?: string;
  content?: string;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  confidence?: number;
  source?: string;
  changeReason?: string;
}

export interface CreateToolInput {
  name: string;
  description?: string;
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  category: 'mcp' | 'cli' | 'function' | 'api';
  parameters?: Record<string, unknown>;
  constraints?: string;
}

export interface UpdateToolInput {
  id: string;
  description?: string;
  category?: 'mcp' | 'cli' | 'function' | 'api';
  parameters?: Record<string, unknown>;
  constraints?: string;
  changeReason?: string;
}

export interface CreateExperienceInput {
  title: string;
  content: string;
  scopeType: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  scenario?: string;
  outcome?: string;
  level?: 'case' | 'strategy';
  confidence?: number;
}

export interface UpdateExperienceInput {
  id: string;
  title?: string;
  content?: string;
  scenario?: string;
  outcome?: string;
  level?: 'case' | 'strategy';
  confidence?: number;
  changeReason?: string;
}

// =============================================================
// MUTATION HOOKS
// =============================================================

export function useCreateGuideline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateGuidelineInput) =>
      apiCall<{ id: string }>('memory_guideline', {
        action: 'add',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidelines'] });
    },
  });
}

export function useUpdateGuideline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateGuidelineInput) =>
      apiCall<{ id: string }>('memory_guideline', {
        action: 'update',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidelines'] });
    },
  });
}

export function useDeleteGuideline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiCall<void>('memory_guideline', {
        action: 'deactivate',
        id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidelines'] });
    },
  });
}

export function useCreateKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateKnowledgeInput) =>
      apiCall<{ id: string }>('memory_knowledge', {
        action: 'add',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}

export function useUpdateKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateKnowledgeInput) =>
      apiCall<{ id: string }>('memory_knowledge', {
        action: 'update',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}

export function useDeleteKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiCall<void>('memory_knowledge', {
        action: 'deactivate',
        id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}

export function useCreateTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateToolInput) =>
      apiCall<{ id: string }>('memory_tool', {
        action: 'add',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
    },
  });
}

export function useUpdateTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateToolInput) =>
      apiCall<{ id: string }>('memory_tool', {
        action: 'update',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
    },
  });
}

export function useDeleteTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiCall<void>('memory_tool', {
        action: 'deactivate',
        id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
    },
  });
}

export function useCreateExperience() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExperienceInput) =>
      apiCall<{ id: string }>('memory_experience', {
        action: 'add',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiences'] });
    },
  });
}

export function useUpdateExperience() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateExperienceInput) =>
      apiCall<{ id: string }>('memory_experience', {
        action: 'update',
        ...input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiences'] });
    },
  });
}

export function useDeleteExperience() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiCall<void>('memory_experience', {
        action: 'deactivate',
        id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiences'] });
    },
  });
}
