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

// =============================================================================
// memory_context Minto formatter
// =============================================================================

export interface ContextMintoInput {
  purpose: string;
  scopeType: string;
  scopeId?: string | null;
  entryCounts: {
    guidelines: number;
    knowledge: number;
    tools: number;
    experiences: number;
  };
  tokensUsed?: number;
  tokenBudget?: number;
  topEntries?: {
    guidelines?: Array<{ name: string; content?: string }>;
    knowledge?: Array<{ title: string; content?: string }>;
    tools?: Array<{ name: string; description?: string }>;
  };
  stalenessWarnings?: Array<{ entryType: string; reason: string }>;
}

export function formatContextMinto(input: ContextMintoInput): string {
  const { guidelines, knowledge, tools, experiences } = input.entryCounts;
  const total = guidelines + knowledge + tools + experiences;

  // Lead with the answer
  const budgetInfo =
    input.tokensUsed !== undefined && input.tokenBudget !== undefined
      ? ` (${input.tokensUsed}/${input.tokenBudget} tokens)`
      : '';
  const answer = `${total} entries for ${input.purpose}${budgetInfo}`;

  const sections: MintoSection[] = [];

  // Breakdown section
  const breakdownItems: string[] = [];
  if (guidelines > 0) breakdownItems.push(`${guidelines} guidelines`);
  if (knowledge > 0) breakdownItems.push(`${knowledge} knowledge`);
  if (tools > 0) breakdownItems.push(`${tools} tools`);
  if (experiences > 0) breakdownItems.push(`${experiences} experiences`);
  if (breakdownItems.length > 0) {
    sections.push({ heading: 'Breakdown', items: breakdownItems });
  }

  // Top entries preview (if provided)
  if (input.topEntries) {
    const previewItems: string[] = [];
    if (input.topEntries.guidelines?.length) {
      for (const g of input.topEntries.guidelines.slice(0, 3)) {
        previewItems.push(`[G] ${g.name}`);
      }
    }
    if (input.topEntries.knowledge?.length) {
      for (const k of input.topEntries.knowledge.slice(0, 3)) {
        previewItems.push(`[K] ${k.title}`);
      }
    }
    if (input.topEntries.tools?.length) {
      for (const t of input.topEntries.tools.slice(0, 3)) {
        previewItems.push(`[T] ${t.name}`);
      }
    }
    if (previewItems.length > 0) {
      sections.push({ heading: 'Top Entries', items: previewItems });
    }
  }

  // Staleness warnings
  if (input.stalenessWarnings && input.stalenessWarnings.length > 0) {
    const warningItems = input.stalenessWarnings
      .slice(0, 3)
      .map((w) => `⚠️ ${w.entryType}: ${w.reason}`);
    sections.push({ heading: 'Warnings', items: warningItems });
  }

  return formatMinto({ answer, sections });
}

// =============================================================================
// memory_status Minto formatter
// =============================================================================

export interface StatusMintoInput {
  project: { id: string; name: string } | null;
  session: { id: string; name: string; status: string } | null;
  counts: {
    guidelines: number;
    knowledge: number;
    tools: number;
    sessions: number;
  };
  health?: { score: number; grade: string } | null;
  graph?: { nodes: number; edges: number } | null;
  librarian?: { pendingRecommendations: number } | null;
  episode?: { id: string; name: string; status: string } | null;
}

export function formatStatusMinto(input: StatusMintoInput): string {
  // Lead with health/project status
  const healthStr = input.health ? ` | Health: ${input.health.grade} (${input.health.score}%)` : '';
  const projectName = input.project?.name ?? 'No project';
  const sessionStr = input.session ? ` → ${input.session.name}` : '';
  const answer = `${projectName}${sessionStr}${healthStr}`;

  const sections: MintoSection[] = [];

  // Memory counts
  const { guidelines, knowledge, tools, sessions } = input.counts;
  const total = guidelines + knowledge + tools;
  if (total > 0) {
    const countItems: string[] = [];
    if (guidelines > 0) countItems.push(`${guidelines} guidelines`);
    if (knowledge > 0) countItems.push(`${knowledge} knowledge`);
    if (tools > 0) countItems.push(`${tools} tools`);
    countItems.push(`${sessions} sessions`);
    sections.push({ heading: 'Memory', items: countItems });
  }

  // Status items
  const statusItems: string[] = [];
  if (input.episode) {
    statusItems.push(`Episode: ${input.episode.name} (${input.episode.status})`);
  }
  if (input.graph && (input.graph.nodes > 0 || input.graph.edges > 0)) {
    statusItems.push(`Graph: ${input.graph.nodes} nodes, ${input.graph.edges} edges`);
  }
  if (input.librarian && input.librarian.pendingRecommendations > 0) {
    statusItems.push(`${input.librarian.pendingRecommendations} pending recommendations`);
  }
  if (statusItems.length > 0) {
    sections.push({ heading: 'Status', items: statusItems });
  }

  return formatMinto({ answer, sections });
}

// =============================================================================
// memory_onboard Minto formatter
// =============================================================================

export interface OnboardMintoInput {
  dryRun: boolean;
  project: { name: string; created: boolean; existed: boolean };
  techStack: {
    languages: Array<{ name: string }>;
    frameworks: Array<{ name: string }>;
    runtimes: Array<{ name: string }>;
  };
  importedDocs: Array<{ path: string; type: string }>;
  seededGuidelines: Array<{ name: string; category: string }>;
  warnings: string[];
  nextSteps: string[];
}

export function formatOnboardMinto(input: OnboardMintoInput): string {
  const prefix = input.dryRun ? '🔍 Preview: ' : '✅ ';
  const action = input.project.created
    ? 'Created'
    : input.project.existed
      ? 'Using existing'
      : 'Setup';

  const answer = `${prefix}${action} ${input.project.name}`;

  const sections: MintoSection[] = [];

  // What was done
  const doneItems: string[] = [];
  if (input.importedDocs.length > 0) {
    doneItems.push(`${input.importedDocs.length} docs imported`);
  }
  if (input.seededGuidelines.length > 0) {
    doneItems.push(`${input.seededGuidelines.length} guidelines seeded`);
  }
  if (doneItems.length > 0) {
    sections.push({ heading: input.dryRun ? 'Would Do' : 'Done', items: doneItems });
  }

  // Tech stack
  const techItems: string[] = [];
  if (input.techStack.languages.length > 0) {
    techItems.push(`Languages: ${input.techStack.languages.map((l) => l.name).join(', ')}`);
  }
  if (input.techStack.frameworks.length > 0) {
    techItems.push(`Frameworks: ${input.techStack.frameworks.map((f) => f.name).join(', ')}`);
  }
  if (techItems.length > 0) {
    sections.push({ heading: 'Tech Stack', items: techItems });
  }

  // Warnings
  if (input.warnings.length > 0) {
    sections.push({
      heading: 'Warnings',
      items: input.warnings.slice(0, 3).map((w) => `⚠️ ${w}`),
    });
  }

  // Next steps
  if (input.nextSteps.length > 0) {
    sections.push({
      heading: 'Next',
      items: input.nextSteps.slice(0, 3).map((s) => `→ ${s}`),
    });
  }

  return formatMinto({ answer, sections });
}

// =============================================================================
// memory_query context action Minto formatter
// =============================================================================

export interface QueryContextMintoInput {
  scope: { type: string; id: string | null };
  tools: Array<{ name: string }>;
  guidelines: Array<{ name: string }>;
  knowledge: Array<{ title: string }>;
  experiences: Array<{ title?: string }>;
  contextBudget?: {
    tokensUsed: number;
    tokenBudget: number;
    stalenessWarnings?: Array<{ entryType: string; reason: string }>;
  };
}

export function formatQueryContextMinto(input: QueryContextMintoInput): string {
  const total =
    input.tools.length +
    input.guidelines.length +
    input.knowledge.length +
    input.experiences.length;

  const scopeStr = input.scope.id ? `${input.scope.type}:${input.scope.id}` : input.scope.type;
  const budgetStr = input.contextBudget
    ? ` (${input.contextBudget.tokensUsed}/${input.contextBudget.tokenBudget} tokens)`
    : '';

  const answer = `${total} entries in ${scopeStr}${budgetStr}`;

  const sections: MintoSection[] = [];

  // Breakdown by type
  const breakdownItems: string[] = [];
  if (input.guidelines.length > 0) breakdownItems.push(`${input.guidelines.length} guidelines`);
  if (input.knowledge.length > 0) breakdownItems.push(`${input.knowledge.length} knowledge`);
  if (input.tools.length > 0) breakdownItems.push(`${input.tools.length} tools`);
  if (input.experiences.length > 0) breakdownItems.push(`${input.experiences.length} experiences`);
  if (breakdownItems.length > 0) {
    sections.push({ heading: 'Breakdown', items: breakdownItems });
  }

  // Top entries preview
  const previewItems: string[] = [];
  for (const g of input.guidelines.slice(0, 2)) {
    previewItems.push(`[G] ${g.name}`);
  }
  for (const k of input.knowledge.slice(0, 2)) {
    previewItems.push(`[K] ${k.title}`);
  }
  for (const t of input.tools.slice(0, 2)) {
    previewItems.push(`[T] ${t.name}`);
  }
  if (previewItems.length > 0) {
    sections.push({ heading: 'Preview', items: previewItems });
  }

  // Staleness warnings
  if (input.contextBudget?.stalenessWarnings?.length) {
    const warningItems = input.contextBudget.stalenessWarnings
      .slice(0, 2)
      .map((w) => `⚠️ ${w.entryType}: ${w.reason}`);
    sections.push({ heading: 'Warnings', items: warningItems });
  }

  return formatMinto({ answer, sections });
}

// =============================================================================
// memory_discover Minto formatter
// =============================================================================

export interface DiscoverMintoInput {
  categories: Record<string, Array<{ name: string; description: string; visibility: string }>>;
  totalCount: number;
}

export function formatDiscoverMinto(input: DiscoverMintoInput): string {
  const answer = `🔍 ${input.totalCount} discoverable features`;

  const sections: MintoSection[] = [];

  for (const [category, tools] of Object.entries(input.categories)) {
    if (tools.length === 0) continue;

    const items = tools.slice(0, 5).map((t) => `${t.name} [${t.visibility}]`);
    if (tools.length > 5) {
      items.push(`...and ${tools.length - 5} more`);
    }
    sections.push({ heading: `${category} (${tools.length})`, items });
  }

  const details = '💡 Enable with: AGENT_MEMORY_TOOL_VISIBILITY=advanced';

  return formatMinto({ answer, sections, details });
}
