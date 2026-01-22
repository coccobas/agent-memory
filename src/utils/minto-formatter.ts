/**
 * Minto Pyramid Formatter
 *
 * Structures output following the Minto Pyramid Principle:
 * 1. Lead with the answer/conclusion
 * 2. Group supporting details into MECE categories
 * 3. Allow users to stop reading when satisfied
 */

export interface MintoSection {
  heading: string;
  items: string[];
}

export interface MintoOutput {
  answer: string;
  sections?: MintoSection[];
  details?: string;
}

export function formatMinto(output: MintoOutput): string {
  const lines: string[] = [];

  lines.push(output.answer);
  lines.push('─'.repeat(Math.min(60, output.answer.length)));

  if (output.sections && output.sections.length > 0) {
    lines.push('');
    for (const section of output.sections) {
      lines.push(`**${section.heading}**`);
      for (const item of section.items) {
        lines.push(`  • ${item}`);
      }
    }
  }

  if (output.details) {
    lines.push('');
    lines.push(output.details);
  }

  return lines.join('\n');
}

export interface QuickstartMintoInput {
  projectName: string | null;
  sessionName: string | null;
  sessionAction: 'created' | 'resumed' | 'none' | 'error';
  episodeName: string | null;
  entryCounts: { guidelines: number; knowledge: number; tools: number; experiences: number };
  healthScore?: number;
  healthGrade?: string;
  pendingTasks?: number;
  pendingRecommendations?: number;
  staleCodeWarning?: string;
}

export function formatQuickstartMinto(input: QuickstartMintoInput): string {
  const sessionStatus =
    input.sessionAction === 'resumed'
      ? 'resumed'
      : input.sessionAction === 'created'
        ? 'started'
        : 'no session';

  const answer = input.staleCodeWarning
    ? `⚠️ ${input.staleCodeWarning}`
    : `Ready: ${input.projectName ?? 'unknown'} | ${input.sessionName ?? 'no session'} (${sessionStatus})`;

  const sections: MintoSection[] = [];

  const contextItems: string[] = [];
  const { guidelines, knowledge, tools, experiences } = input.entryCounts;
  const total = guidelines + knowledge + tools + experiences;
  if (total > 0) {
    contextItems.push(
      `${total} entries loaded (${guidelines} guidelines, ${knowledge} knowledge, ${tools} tools)`
    );
  }
  if (input.episodeName) {
    contextItems.push(`Episode: ${input.episodeName}`);
  }
  if (contextItems.length > 0) {
    sections.push({ heading: 'Context', items: contextItems });
  }

  const statusItems: string[] = [];
  if (input.healthScore !== undefined && input.healthGrade) {
    statusItems.push(`Health: ${input.healthScore}/100 (${input.healthGrade})`);
  }
  if (input.pendingTasks && input.pendingTasks > 0) {
    statusItems.push(`${input.pendingTasks} pending tasks`);
  }
  if (input.pendingRecommendations && input.pendingRecommendations > 0) {
    statusItems.push(`${input.pendingRecommendations} recommendations to review`);
  }
  if (statusItems.length > 0) {
    sections.push({ heading: 'Status', items: statusItems });
  }

  return formatMinto({ answer, sections });
}
