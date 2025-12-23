import { eq } from 'drizzle-orm';

import { getDb, getSqlite } from '../../db/connection.js';
import { sessions } from '../../db/schema.js';
import { createRepositories } from '../../core/factory/repositories.js';
import type { Repositories } from '../../core/interfaces/repositories.js';

function getRepos(): Repositories {
  return createRepositories({ db: getDb(), sqlite: getSqlite() });
}

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

export async function getObserveState(sessionId: string): Promise<{
  committedAt?: string;
  reviewedAt?: string;
  needsReviewCount?: number;
}> {
  const repos = getRepos();
  const session = await repos.sessions.getById(sessionId);
  const meta = session?.metadata ?? {};
  const observe = (meta.observe ?? {}) as Record<string, unknown>;
  return {
    committedAt: typeof observe.committedAt === 'string' ? observe.committedAt : undefined,
    reviewedAt: typeof observe.reviewedAt === 'string' ? observe.reviewedAt : undefined,
    needsReviewCount:
      typeof observe.needsReviewCount === 'number' ? observe.needsReviewCount : undefined,
  };
}

export async function setObserveReviewedAt(sessionId: string, reviewedAt: string): Promise<void> {
  const repos = getRepos();
  const session = await repos.sessions.getById(sessionId);
  const meta = session?.metadata ?? {};
  const observe = (meta.observe ?? {}) as Record<string, unknown>;
  const nextMeta: Record<string, unknown> = {
    ...meta,
    observe: { ...observe, reviewedAt },
  };
  await repos.sessions.update(sessionId, { metadata: nextMeta });
}

export interface SessionSummary {
  sessionId: string;
  projectName?: string;
  guidelines: Array<{ name: string; content: string }>;
  knowledge: Array<{ title: string; content: string }>;
  tools: Array<{ name: string; description?: string }>;
  needsReview: number;
}

export async function getSessionSummary(sessionId: string): Promise<SessionSummary> {
  const repos = getRepos();
  const session = await repos.sessions.getById(sessionId);
  const projectId = session?.projectId;
  const project = projectId ? await repos.projects.getById(projectId) : null;

  const guidelinesList = await repos.guidelines.list({ scopeType: 'session', scopeId: sessionId });
  const knowledgeList = await repos.knowledge.list({ scopeType: 'session', scopeId: sessionId });
  const toolsList = await repos.tools.list({ scopeType: 'session', scopeId: sessionId });

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
