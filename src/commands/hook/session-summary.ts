import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { getSessionSummary } from './session.js';

export async function writeSessionSummaryFile(
  sessionId: string,
  cwd: string
): Promise<{ path: string; itemCount: number }> {
  const summary = await getSessionSummary(sessionId);
  const itemCount = summary.guidelines.length + summary.knowledge.length + summary.tools.length;

  const truncate = (s: string, len: number) => (s.length > len ? s.slice(0, len) + '...' : s);
  const timestamp = new Date().toISOString();

  let md = `# Session Summary\n\n`;
  md += `**Session:** \`${sessionId.slice(0, 8)}…\`\n`;
  if (summary.projectName) {
    md += `**Project:** ${summary.projectName}\n`;
  }
  md += `**Updated:** ${timestamp}\n\n`;

  md += `## Stored Entries\n\n`;

  md += `### Guidelines (${summary.guidelines.length})\n`;
  if (summary.guidelines.length === 0) {
    md += `_(none)_\n\n`;
  } else {
    for (const g of summary.guidelines) {
      md += `- **${g.name}** – ${truncate(g.content.replace(/\n/g, ' '), 80)}\n`;
    }
    md += `\n`;
  }

  md += `### Knowledge (${summary.knowledge.length})\n`;
  if (summary.knowledge.length === 0) {
    md += `_(none)_\n\n`;
  } else {
    for (const k of summary.knowledge) {
      md += `- **${k.title}** – ${truncate(k.content.replace(/\n/g, ' '), 80)}\n`;
    }
    md += `\n`;
  }

  md += `### Tools (${summary.tools.length})\n`;
  if (summary.tools.length === 0) {
    md += `_(none)_\n\n`;
  } else {
    for (const t of summary.tools) {
      md += `- **${t.name}**${t.description ? ` – ${truncate(t.description, 60)}` : ''}\n`;
    }
    md += `\n`;
  }

  if (summary.needsReview > 0) {
    md += `## Needs Review (${summary.needsReview})\n`;
    md += '_Items tagged as `candidate` require human review_\n';
  }

  const summaryPath = resolve(cwd, '.claude', 'session-summary.md');
  const summaryDir = dirname(summaryPath);
  if (!existsSync(summaryDir)) {
    mkdirSync(summaryDir, { recursive: true });
  }
  writeFileSync(summaryPath, md, 'utf8');

  return { path: summaryPath, itemCount };
}

export async function formatSessionSummary(sessionId: string): Promise<string[]> {
  const summary = await getSessionSummary(sessionId);
  const lines: string[] = [];

  lines.push(`\n📋 Session Summary (${sessionId.slice(0, 8)}…)`);
  if (summary.projectName) {
    lines.push(`   Project: ${summary.projectName}`);
  }
  lines.push('');

  if (summary.guidelines.length > 0) {
    lines.push(`   Guidelines (${summary.guidelines.length}):`);
    for (const g of summary.guidelines.slice(0, 5)) {
      lines.push(`   • ${g.name}`);
    }
    if (summary.guidelines.length > 5) {
      lines.push(`   ... and ${summary.guidelines.length - 5} more`);
    }
  }

  if (summary.knowledge.length > 0) {
    lines.push(`   Knowledge (${summary.knowledge.length}):`);
    for (const k of summary.knowledge.slice(0, 5)) {
      lines.push(`   • ${k.title}`);
    }
    if (summary.knowledge.length > 5) {
      lines.push(`   ... and ${summary.knowledge.length - 5} more`);
    }
  }

  if (summary.tools.length > 0) {
    lines.push(`   Tools (${summary.tools.length}):`);
    for (const t of summary.tools.slice(0, 5)) {
      lines.push(`   • ${t.name}`);
    }
    if (summary.tools.length > 5) {
      lines.push(`   ... and ${summary.tools.length - 5} more`);
    }
  }

  if (summary.needsReview > 0) {
    lines.push(`\n   ⚠ ${summary.needsReview} item(s) need review`);
  }
  lines.push('');

  return lines;
}

export async function formatSessionSummaryStderr(sessionId: string): Promise<void> {
  const lines = await formatSessionSummary(sessionId);
  for (const line of lines) console.error(line);
}
