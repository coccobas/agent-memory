/**
 * Review Handler
 *
 * MCP tool for reviewing candidate memory entries from a session.
 * Allows listing, approving, rejecting, and skipping candidates.
 */

import { createValidationError } from '../../core/errors.js';
import type { AppContext } from '../../core/context.js';

interface ReviewCandidate {
  id: string;
  shortId: string;
  type: 'guideline' | 'knowledge' | 'tool';
  name: string;
  content: string;
}

interface ListParams {
  sessionId: string;
}

interface ActionParams {
  sessionId: string;
  entryId: string;
  projectId?: string;
}

function getCandidates(context: AppContext, sessionId: string): ReviewCandidate[] {
  const { guidelines: guidelineRepo, knowledge: knowledgeRepo, tools: toolRepo, entryTags: entryTagRepo } = context.repos;
  const candidates: ReviewCandidate[] = [];

  // Get guidelines from session scope
  const guidelines = guidelineRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const g of guidelines) {
    if (!g.isActive) continue;
    const tags = entryTagRepo.getTagsForEntry('guideline', g.id);
    const tagNames = tags.map((t) => t.name);
    if (tagNames.includes('candidate') || tagNames.includes('needs_review')) {
      candidates.push({
        id: g.id,
        shortId: g.id.slice(0, 6),
        type: 'guideline',
        name: g.name,
        content: g.currentVersion?.content ?? '',
      });
    }
  }

  // Get knowledge from session scope
  const knowledgeList = knowledgeRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const k of knowledgeList) {
    if (!k.isActive) continue;
    const tags = entryTagRepo.getTagsForEntry('knowledge', k.id);
    const tagNames = tags.map((t) => t.name);
    if (tagNames.includes('candidate') || tagNames.includes('needs_review')) {
      candidates.push({
        id: k.id,
        shortId: k.id.slice(0, 6),
        type: 'knowledge',
        name: k.title,
        content: k.currentVersion?.content ?? '',
      });
    }
  }

  // Get tools from session scope
  const tools = toolRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const t of tools) {
    if (!t.isActive) continue;
    const tags = entryTagRepo.getTagsForEntry('tool', t.id);
    const tagNames = tags.map((tag) => tag.name);
    if (tagNames.includes('candidate') || tagNames.includes('needs_review')) {
      candidates.push({
        id: t.id,
        shortId: t.id.slice(0, 6),
        type: 'tool',
        name: t.name,
        content: t.currentVersion?.description ?? '',
      });
    }
  }

  return candidates;
}

function findCandidate(context: AppContext, sessionId: string, entryId: string): ReviewCandidate | undefined {
  const candidates = getCandidates(context, sessionId);
  return candidates.find(
    (c) => c.id === entryId || c.shortId === entryId || c.id.startsWith(entryId)
  );
}

function list(context: AppContext, params: ListParams) {
  const { sessions: sessionRepo, projects: projectRepo } = context.repos;

  if (!params.sessionId) {
    throw createValidationError('sessionId', 'is required', 'Provide the session ID');
  }

  const candidates = getCandidates(context, params.sessionId);

  // Get session info
  const session = sessionRepo.getById(params.sessionId);
  const projectId = session?.projectId;
  const project = projectId ? projectRepo.getById(projectId) : null;

  return {
    success: true,
    sessionId: params.sessionId,
    projectId: projectId ?? null,
    projectName: project?.name ?? null,
    candidates: candidates.map((c) => ({
      id: c.id,
      shortId: c.shortId,
      type: c.type,
      name: c.name,
      contentPreview: c.content.slice(0, 100) + (c.content.length > 100 ? '...' : ''),
    })),
    count: candidates.length,
    hint:
      candidates.length > 0
        ? 'Use approve/reject/skip with entryId to act on candidates'
        : 'No candidates to review',
  };
}

function show(context: AppContext, params: ActionParams) {
  if (!params.sessionId) {
    throw createValidationError('sessionId', 'is required', 'Provide the session ID');
  }
  if (!params.entryId) {
    throw createValidationError('entryId', 'is required', 'Provide the entry ID or short ID');
  }

  const candidate = findCandidate(context, params.sessionId, params.entryId);
  if (!candidate) {
    return {
      success: false,
      message: `Entry not found: ${params.entryId}`,
    };
  }

  return {
    success: true,
    entry: {
      id: candidate.id,
      shortId: candidate.shortId,
      type: candidate.type,
      name: candidate.name,
      content: candidate.content,
    },
  };
}

function approve(context: AppContext, params: ActionParams) {
  const { guidelines: guidelineRepo, knowledge: knowledgeRepo, tools: toolRepo, sessions: sessionRepo } = context.repos;

  if (!params.sessionId) {
    throw createValidationError('sessionId', 'is required', 'Provide the session ID');
  }
  if (!params.entryId) {
    throw createValidationError('entryId', 'is required', 'Provide the entry ID or short ID');
  }

  // Get project ID from params or session
  let projectId = params.projectId;
  if (!projectId) {
    const session = sessionRepo.getById(params.sessionId);
    projectId = session?.projectId ?? undefined;
  }

  if (!projectId) {
    throw createValidationError(
      'projectId',
      'is required for approve action',
      'Provide projectId or ensure session has a linked project'
    );
  }

  const candidate = findCandidate(context, params.sessionId, params.entryId);
  if (!candidate) {
    return {
      success: false,
      message: `Entry not found: ${params.entryId}`,
    };
  }

  try {
    if (candidate.type === 'guideline') {
      const original = guidelineRepo.getById(candidate.id);
      if (!original) return { success: false, message: 'Guideline not found' };

      guidelineRepo.create({
        scopeType: 'project',
        scopeId: projectId,
        name: original.name,
        content: original.currentVersion?.content ?? '',
        category: original.category ?? undefined,
        priority: original.priority ?? undefined,
        rationale: original.currentVersion?.rationale ?? undefined,
      });
      guidelineRepo.deactivate(candidate.id);
    } else if (candidate.type === 'knowledge') {
      const original = knowledgeRepo.getById(candidate.id);
      if (!original) return { success: false, message: 'Knowledge not found' };

      knowledgeRepo.create({
        scopeType: 'project',
        scopeId: projectId,
        title: original.title,
        content: original.currentVersion?.content ?? '',
        category: original.category ?? undefined,
        source: original.currentVersion?.source ?? undefined,
      });
      knowledgeRepo.deactivate(candidate.id);
    } else if (candidate.type === 'tool') {
      const original = toolRepo.getById(candidate.id);
      if (!original) return { success: false, message: 'Tool not found' };

      toolRepo.create({
        scopeType: 'project',
        scopeId: projectId,
        name: original.name,
        description: original.currentVersion?.description ?? undefined,
        category: original.category ?? undefined,
      });
      toolRepo.deactivate(candidate.id);
    }

    return {
      success: true,
      message: `Approved: ${candidate.name} → promoted to project scope`,
      entry: {
        id: candidate.id,
        type: candidate.type,
        name: candidate.name,
      },
      projectId,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to approve: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function reject(context: AppContext, params: ActionParams) {
  const { guidelines: guidelineRepo, knowledge: knowledgeRepo, tools: toolRepo } = context.repos;

  if (!params.sessionId) {
    throw createValidationError('sessionId', 'is required', 'Provide the session ID');
  }
  if (!params.entryId) {
    throw createValidationError('entryId', 'is required', 'Provide the entry ID or short ID');
  }

  const candidate = findCandidate(context, params.sessionId, params.entryId);
  if (!candidate) {
    return {
      success: false,
      message: `Entry not found: ${params.entryId}`,
    };
  }

  try {
    if (candidate.type === 'guideline') {
      guidelineRepo.deactivate(candidate.id);
    } else if (candidate.type === 'knowledge') {
      knowledgeRepo.deactivate(candidate.id);
    } else if (candidate.type === 'tool') {
      toolRepo.deactivate(candidate.id);
    }

    return {
      success: true,
      message: `Rejected: ${candidate.name} → deactivated`,
      entry: {
        id: candidate.id,
        type: candidate.type,
        name: candidate.name,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to reject: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function skip(context: AppContext, params: ActionParams) {
  const { tags: tagRepo, entryTags: entryTagRepo } = context.repos;

  if (!params.sessionId) {
    throw createValidationError('sessionId', 'is required', 'Provide the session ID');
  }
  if (!params.entryId) {
    throw createValidationError('entryId', 'is required', 'Provide the entry ID or short ID');
  }

  const candidate = findCandidate(context, params.sessionId, params.entryId);
  if (!candidate) {
    return {
      success: false,
      message: `Entry not found: ${params.entryId}`,
    };
  }

  try {
    // Remove review tags
    const candidateTag = tagRepo.getByName('candidate');
    const needsReviewTag = tagRepo.getByName('needs_review');

    if (candidateTag) {
      try {
        entryTagRepo.detach(candidate.type, candidate.id, candidateTag.id);
      } catch {
        // Ignore if not attached
      }
    }
    if (needsReviewTag) {
      try {
        entryTagRepo.detach(candidate.type, candidate.id, needsReviewTag.id);
      } catch {
        // Ignore if not attached
      }
    }

    return {
      success: true,
      message: `Skipped: ${candidate.name} → removed from review queue`,
      entry: {
        id: candidate.id,
        type: candidate.type,
        name: candidate.name,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to skip: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export const reviewHandlers = {
  list,
  show,
  approve,
  reject,
  skip,
};
