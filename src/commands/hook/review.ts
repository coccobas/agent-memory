import { guidelineRepo } from '../../db/repositories/guidelines.js';
import { knowledgeRepo } from '../../db/repositories/knowledge.js';
import { toolRepo } from '../../db/repositories/tools.js';
import { entryTagRepo, tagRepo } from '../../db/repositories/tags.js';

export interface ReviewCandidate {
  id: string;
  shortId: string;
  type: 'guideline' | 'knowledge' | 'tool';
  name: string;
  content: string;
}

export function getReviewCandidates(sessionId: string): ReviewCandidate[] {
  const candidates: ReviewCandidate[] = [];

  const guidelinesList = guidelineRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const g of guidelinesList) {
    if (!g.isActive) continue;
    const tags = g.id ? getEntryTags('guideline', g.id) : [];
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

  const knowledgeList = knowledgeRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const k of knowledgeList) {
    if (!k.isActive) continue;
    const tags = k.id ? getEntryTags('knowledge', k.id) : [];
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

  const toolsList = toolRepo.list({ scopeType: 'session', scopeId: sessionId });
  for (const t of toolsList) {
    if (!t.isActive) continue;
    const tags = t.id ? getEntryTags('tool', t.id) : [];
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

function getEntryTags(entryType: 'guideline' | 'knowledge' | 'tool', entryId: string): string[] {
  try {
    const tags = entryTagRepo.getTagsForEntry(entryType, entryId);
    return tags.map((t) => t.name);
  } catch {
    return [];
  }
}

export function findCandidateByShortId(
  candidates: ReviewCandidate[],
  shortId: string
): ReviewCandidate | undefined {
  return candidates.find((c) => c.shortId === shortId || c.id === shortId || c.id.startsWith(shortId));
}

export function approveCandidate(candidate: ReviewCandidate, projectId: string): boolean {
  try {
    if (candidate.type === 'guideline') {
      const original = guidelineRepo.getById(candidate.id);
      if (!original) return false;
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
      return true;
    }
    if (candidate.type === 'knowledge') {
      const original = knowledgeRepo.getById(candidate.id);
      if (!original) return false;
      knowledgeRepo.create({
        scopeType: 'project',
        scopeId: projectId,
        title: original.title,
        content: original.currentVersion?.content ?? '',
        category: original.category ?? undefined,
        source: original.currentVersion?.source ?? undefined,
      });
      knowledgeRepo.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'tool') {
      const original = toolRepo.getById(candidate.id);
      if (!original) return false;
      toolRepo.create({
        scopeType: 'project',
        scopeId: projectId,
        name: original.name,
        description: original.currentVersion?.description ?? '',
        category: original.category ?? undefined,
      });
      toolRepo.deactivate(candidate.id);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function rejectCandidate(candidate: ReviewCandidate): boolean {
  try {
    if (candidate.type === 'guideline') {
      guidelineRepo.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'knowledge') {
      knowledgeRepo.deactivate(candidate.id);
      return true;
    }
    if (candidate.type === 'tool') {
      toolRepo.deactivate(candidate.id);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function skipCandidate(candidate: ReviewCandidate): boolean {
  try {
    const candidateTag = tagRepo.getByName('candidate');
    const needsReviewTag = tagRepo.getByName('needs_review');
    if (candidateTag) {
      entryTagRepo.detach(candidate.type, candidate.id, candidateTag.id);
    }
    if (needsReviewTag) {
      entryTagRepo.detach(candidate.type, candidate.id, needsReviewTag.id);
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

