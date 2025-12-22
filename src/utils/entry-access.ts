import type { AppContext } from '../core/context.js';
import type { EntryType, ScopeType } from '../db/schema.js';
import { checkPermission } from '../services/permission.service.js';
import { createNotFoundError, createPermissionError } from '../core/errors.js';

export function getEntryScope(
  context: AppContext,
  entryType: Exclude<EntryType, 'project'>,
  id: string
): {
  scopeType: ScopeType;
  scopeId: string | null;
} {
  const { tools: toolRepo, guidelines: guidelineRepo, knowledge: knowledgeRepo } = context.repos;

  if (entryType === 'tool') {
    const tool = toolRepo.getById(id);
    if (!tool) throw createNotFoundError('tool', id);
    return { scopeType: tool.scopeType, scopeId: tool.scopeId ?? null };
  }
  if (entryType === 'guideline') {
    const guideline = guidelineRepo.getById(id);
    if (!guideline) throw createNotFoundError('guideline', id);
    return { scopeType: guideline.scopeType, scopeId: guideline.scopeId ?? null };
  }
  const knowledge = knowledgeRepo.getById(id);
  if (!knowledge) throw createNotFoundError('knowledge', id);
  return { scopeType: knowledge.scopeType, scopeId: knowledge.scopeId ?? null };
}

export function requireEntryPermission(
  context: AppContext,
  params: {
    agentId: string;
    action: 'read' | 'write' | 'delete';
    entryType: Exclude<EntryType, 'project'>;
    entryId: string;
  }
): void {
  const { scopeType, scopeId } = getEntryScope(context, params.entryType, params.entryId);
  if (
    !checkPermission(
      params.agentId,
      params.action,
      params.entryType,
      params.entryId,
      scopeType,
      scopeId
    )
  ) {
    throw createPermissionError(params.action, params.entryType, params.entryId);
  }
}

export function requireEntryPermissionWithScope(
  context: AppContext,
  params: {
    agentId: string;
    action: 'read' | 'write' | 'delete';
    entryType: Exclude<EntryType, 'project'>;
    entryId: string;
  }
): { scopeType: ScopeType; scopeId: string | null } {
  const { scopeType, scopeId } = getEntryScope(context, params.entryType, params.entryId);
  if (
    !checkPermission(
      params.agentId,
      params.action,
      params.entryType,
      params.entryId,
      scopeType,
      scopeId
    )
  ) {
    throw createPermissionError(params.action, params.entryType, params.entryId);
  }
  return { scopeType, scopeId };
}
