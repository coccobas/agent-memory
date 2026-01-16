import type { AppContext } from '../core/context.js';
import type { EntryType, ScopeType } from '../db/schema.js';
import { createNotFoundError, createPermissionError } from '../core/errors.js';

export async function getEntryScope(
  context: AppContext,
  entryType: Exclude<EntryType, 'project'>,
  id: string
): Promise<{
  scopeType: ScopeType;
  scopeId: string | null;
}> {
  const { tools: toolRepo, guidelines: guidelineRepo, knowledge: knowledgeRepo } = context.repos;

  if (entryType === 'tool') {
    const tool = await toolRepo.getById(id);
    if (!tool) throw createNotFoundError('tool', id);
    return { scopeType: tool.scopeType, scopeId: tool.scopeId ?? null };
  }
  if (entryType === 'guideline') {
    const guideline = await guidelineRepo.getById(id);
    if (!guideline) throw createNotFoundError('guideline', id);
    return { scopeType: guideline.scopeType, scopeId: guideline.scopeId ?? null };
  }
  const knowledge = await knowledgeRepo.getById(id);
  if (!knowledge) throw createNotFoundError('knowledge', id);
  return { scopeType: knowledge.scopeType, scopeId: knowledge.scopeId ?? null };
}

export async function requireEntryPermission(
  context: AppContext,
  params: {
    agentId: string;
    action: 'read' | 'write' | 'delete';
    entryType: Exclude<EntryType, 'project'>;
    entryId: string;
  }
): Promise<void> {
  const { scopeType, scopeId } = await getEntryScope(context, params.entryType, params.entryId);
  if (
    !context.services.permission.check(
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

export async function requireEntryPermissionWithScope(
  context: AppContext,
  params: {
    agentId: string;
    action: 'read' | 'write' | 'delete';
    entryType: Exclude<EntryType, 'project'>;
    entryId: string;
  }
): Promise<{ scopeType: ScopeType; scopeId: string | null }> {
  const { scopeType, scopeId } = await getEntryScope(context, params.entryType, params.entryId);
  if (
    !context.services.permission.check(
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
