import { eq } from 'drizzle-orm';

import { getDb } from '../../db/connection.js';
import { sessions } from '../../db/schema.js';
import { sessionRepo, projectRepo } from '../../db/repositories/scopes.js';
import { guidelineRepo } from '../../db/repositories/guidelines.js';
import { knowledgeRepo } from '../../db/repositories/knowledge.js';
import { toolRepo } from '../../db/repositories/tools.js';

export function ensureSessionIdExists(sessionId: string, projectId?: string): void {
  const db = getDb();
  const existing = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (existing) return;

  db.insert(sessions)
    .values({
      id: sessionId,
      projectId: projectId ?? null,
      name: 'Claude Code Session',
      purpose: 'Auto-created from Claude Code hooks',
      agentId: null,
      status: 'active',
      metadata: { source: 'claude-code' },
    })
    .run();
}

export function getObserveState(sessionId: string): {
  committedAt?: string;
  reviewedAt?: string;
  needsReviewCount?: number;
} {
  const session = sessionRepo.getById(sessionId);
  const meta = session?.metadata ?? {};
  const observe = (meta.observe ?? {}) as Record<string, unknown>;
  return {
    committedAt: typeof observe.committedAt === 'string' ? observe.committedAt : undefined,
    reviewedAt: typeof observe.reviewedAt === 'string' ? observe.reviewedAt : undefined,
    needsReviewCount:
      typeof observe.needsReviewCount === 'number' ? observe.needsReviewCount : undefined,
  };
}

export function setObserveReviewedAt(sessionId: string, reviewedAt: string): void {
  const session = sessionRepo.getById(sessionId);
  const meta = session?.metadata ?? {};
  const observe = (meta.observe ?? {}) as Record<string, unknown>;
  const nextMeta: Record<string, unknown> = {
    ...meta,
    observe: { ...observe, reviewedAt },
  };
  sessionRepo.update(sessionId, { metadata: nextMeta });
}

export interface SessionSummary {
  sessionId: string;
  projectName?: string;
  guidelines: Array<{ name: string; content: string }>;
  knowledge: Array<{ title: string; content: string }>;
  tools: Array<{ name: string; description?: string }>;
  needsReview: number;
}

export function getSessionSummary(sessionId: string): SessionSummary {
  const session = sessionRepo.getById(sessionId);
  const projectId = session?.projectId;
  const project = projectId ? projectRepo.getById(projectId) : null;

  const guidelinesList = guidelineRepo.list({ scopeType: 'session', scopeId: sessionId });
  const knowledgeList = knowledgeRepo.list({ scopeType: 'session', scopeId: sessionId });
  const toolsList = toolRepo.list({ scopeType: 'session', scopeId: sessionId });

  const meta = session?.metadata ?? {};
  const observe = (meta.observe ?? {}) as Record<string, unknown>;
  const needsReview = typeof observe.needsReviewCount === 'number' ? observe.needsReviewCount : 0;

  return {
    sessionId,
    projectName: project?.name,
    guidelines: guidelinesList.map((g) => ({
      name: g.name,
      content: g.currentVersion?.content ?? '',
    })),
    knowledge: knowledgeList.map((k) => ({
      title: k.title,
      content: k.currentVersion?.content ?? '',
    })),
    tools: toolsList.map((t) => ({
      name: t.name,
      description: t.currentVersion?.description ?? undefined,
    })),
    needsReview,
  };
}

