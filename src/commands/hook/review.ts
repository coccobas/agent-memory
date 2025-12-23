import { getDb, getSqlite } from '../../db/connection.js';
import { createRepositories } from '../../core/factory/repositories.js';
import type { Repositories } from '../../core/interfaces/repositories.js';

function getRepos(): Repositories {
  return createRepositories({ db: getDb(), sqlite: getSqlite() });
}

export interface ReviewCandidate {
  id: string;
  shortId: string;
  type: 'guideline' | 'knowledge' | 'tool';
  name: string;
  content: string;
}

export async function getReviewCandidates(sessionId: string): Promise<ReviewCandidate[]> {
  const repos = getRepos();
  const candidates: ReviewCandidate[] = [];

  const guidelinesList = await repos.guidelines.list({ scopeType: 'session', scopeId: sessionId });
  for (const g of guidelinesList) {
    if (!g.isActive) continue;
    const tags = g.id ? await getEntryTags(repos, 'guideline', g.id) : [];
    if (tags.includes('candidate') || tags.includes('needs_review')) {
      candidates.push({
        id: g.id,
        shortId: g.id.slice(0, 6),
        type: 'guideline',
        name: g.name,
        content: g.currentVersion?.content ?? '',
      });
    }
  }

  const knowledgeList = await repos.knowledge.list({ scopeType: 'session', scopeId: sessionId });
  for (const k of knowledgeList) {
    if (!k.isActive) continue;
    const tags = k.id ? await getEntryTags(repos, 'knowledge', k.id) : [];
    if (tags.includes('candidate') || tags.includes('needs_review')) {
      candidates.push({
        id: k.id,
        shortId: k.id.slice(0, 6),
        type: 'knowledge',
        name: k.title,
        content: k.currentVersion?.content ?? '',
      });
    }
  }

  const toolsList = await repos.tools.list({ scopeType: 'session', scopeId: sessionId });
  for (const t of toolsList) {
    if (!t.isActive) continue;
    const tags = t.id ? await getEntryTags(repos, 'tool', t.id) : [];
    if (tags.includes('candidate') || tags.includes('needs_review')) {
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

async function getEntryTags(
  repos: Repositories,
  entryType: 'guideline' | 'knowledge' | 'tool',
  entryId: string
): Promise<string[]> {
  try {
    const tags = await repos.entryTags.getTagsForEntry(entryType, entryId);
    return tags.map((t) => t.name);
  } catch {
    return [];
  }
}

export function findCandidateByShortId(
  candidates: ReviewCandidate[],
  shortId: string
): ReviewCandidate | undefined {
  return candidates.find(
    (c) => c.shortId === shortId || c.id === shortId || c.id.startsWith(shortId)
  );
}

export async function approveCandidate(candidate: ReviewCandidate, projectId: string): Promise<boolean> {
  const repos = getRepos();
  try {
    if (candidate.type === 'guideline') {
      const original = await repos.guidelines.getById(candidate.id);
      if (!original) return false;
      await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: original.name,
        content: original.currentVersion?.content ?? '',
        category: original.category ?? undefined,
        priority: original.priority ?? undefined,
        rationale: original.currentVersion?.rationale ?? undefined,
      });
      await repos.guidelines.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'knowledge') {
      const original = await repos.knowledge.getById(candidate.id);
      if (!original) return false;
      await repos.knowledge.create({
        scopeType: 'project',
        scopeId: projectId,
        title: original.title,
        content: original.currentVersion?.content ?? '',
        category: original.category ?? undefined,
        source: original.currentVersion?.source ?? undefined,
      });
      await repos.knowledge.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'tool') {
      const original = await repos.tools.getById(candidate.id);
      if (!original) return false;
      await repos.tools.create({
        scopeType: 'project',
        scopeId: projectId,
        name: original.name,
        description: original.currentVersion?.description ?? '',
        category: original.category ?? undefined,
      });
      await repos.tools.deactivate(candidate.id);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function rejectCandidate(candidate: ReviewCandidate): Promise<boolean> {
  const repos = getRepos();
  try {
    if (candidate.type === 'guideline') {
      await repos.guidelines.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'knowledge') {
      await repos.knowledge.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'tool') {
      await repos.tools.deactivate(candidate.id);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function skipCandidate(candidate: ReviewCandidate): Promise<boolean> {
  const repos = getRepos();
  try {
    const candidateTag = await repos.tags.getByName('candidate');
    const needsReviewTag = await repos.tags.getByName('needs_review');
    if (candidateTag) {
      await repos.entryTags.detach(candidate.type, candidate.id, candidateTag.id);
    }
    if (needsReviewTag) {
      await repos.entryTags.detach(candidate.type, candidate.id, needsReviewTag.id);
    }
    return true;
  } catch {
    return false;
  }
}

export function formatCandidateList(candidates: ReviewCandidate[]): string[] {
  const lines: string[] = [];
  if (candidates.length === 0) {
    lines.push('\n📋 No candidates to review\n');
    return lines;
  }
  lines.push(`\n📋 Review Candidates (${candidates.length})\n`);
  for (const c of candidates) {
    const truncated = c.content.replace(/\n/g, ' ').slice(0, 50);
    lines.push(`  ${c.shortId}  [${c.type}] ${c.name}`);
    lines.push(`         ${truncated}${c.content.length > 50 ? '…' : ''}`);
  }
  lines.push('\nCommands: !am approve <id> | !am reject <id> | !am skip <id> | !am show <id>\n');
  return lines;
}

export function formatCandidateDetail(candidate: ReviewCandidate): string[] {
  const lines: string[] = [];
  lines.push(`\n📄 ${candidate.type.toUpperCase()}: ${candidate.name}`);
  lines.push(`   ID: ${candidate.id}`);
  lines.push(`   ───────────────────────────────────`);
  const contentLines = candidate.content.split('\n');
  for (const line of contentLines.slice(0, 20)) {
    lines.push(`   ${line}`);
  }
  if (contentLines.length > 20) {
    lines.push(`   ... (${contentLines.length - 20} more lines)`);
  }
  lines.push('');
  return lines;
}
