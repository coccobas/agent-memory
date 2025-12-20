import { toolRepo } from '../db/repositories/tools.js';
import { guidelineRepo } from '../db/repositories/guidelines.js';
import { knowledgeRepo } from '../db/repositories/knowledge.js';
import type { EntryType, ScopeType } from '../db/schema.js';
import { checkPermission } from '../services/permission.service.js';
import { createNotFoundError, createPermissionError } from '../mcp/errors.js';

export function getEntryScope(entryType: Exclude<EntryType, 'project'>, id: string): {
  scopeType: ScopeType;
  scopeId: string | null;
} {
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

export function requireEntryPermission(params: {
  agentId: string;
  action: 'read' | 'write' | 'delete';
  entryType: Exclude<EntryType, 'project'>;
  entryId: string;
}): void {
  const { scopeType, scopeId } = getEntryScope(params.entryType, params.entryId);
  if (
    !checkPermission(params.agentId, params.action, params.entryType, params.entryId, scopeType, scopeId)
  ) {
    throw createPermissionError(params.action, params.entryType, params.entryId);
  }
}

