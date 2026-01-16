/**
 * Project Summary Service
 *
 * Generates and maintains pre-computed summaries of project memory.
 * Summaries are stored as knowledge entries with a special tag for fast retrieval.
 *
 * This reduces tool calls by providing a single entry that summarizes
 * all knowledge, guidelines, and tools for a project.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';
import { guidelines, knowledge, knowledgeVersions, tools, tags, entryTags } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('summary');

// =============================================================================
// TYPES
// =============================================================================

export interface CategorySummary {
  category: string;
  count: number;
  entries: Array<{
    id: string;
    name: string;
    priority?: number;
  }>;
}

export interface ProjectSummary {
  projectId: string;
  projectName?: string;
  generatedAt: string;
  totals: {
    guidelines: number;
    knowledge: number;
    tools: number;
  };
  guidelinesByCategory: CategorySummary[];
  knowledgeByCategory: CategorySummary[];
  toolsByCategory: CategorySummary[];
  topGuidelines: Array<{
    id: string;
    name: string;
    priority: number;
    category?: string;
  }>;
  recentKnowledge: Array<{
    id: string;
    title: string;
    category?: string;
    createdAt: string;
  }>;
}

export interface GenerateSummaryParams {
  projectId: string;
  projectName?: string;
  maxEntriesPerCategory?: number;
  maxTopGuidelines?: number;
  maxRecentKnowledge?: number;
}

export interface GenerateSummaryResult {
  summary: ProjectSummary;
  stored: boolean;
  knowledgeId?: string;
  error?: string;
}

// Tag used to identify summary entries
const SUMMARY_TAG = 'project-summary';
const SUMMARY_TITLE_PREFIX = 'Project Summary:';

// =============================================================================
// SUMMARY GENERATION
// =============================================================================

/**
 * Generate a project summary
 */
export async function generateProjectSummary(
  db: BetterSQLite3Database<typeof schema>,
  params: GenerateSummaryParams
): Promise<ProjectSummary> {
  const {
    projectId,
    projectName,
    maxEntriesPerCategory = 5,
    maxTopGuidelines = 10,
    maxRecentKnowledge = 10,
  } = params;

  logger.debug({ projectId }, 'Generating project summary');

  // Get guideline counts and top entries by category
  const guidelinesByCategory = await getGuidelinesByCategory(db, projectId, maxEntriesPerCategory);

  // Get knowledge counts and entries by category
  const knowledgeByCategory = await getKnowledgeByCategory(db, projectId, maxEntriesPerCategory);

  // Get tool counts and entries by category
  const toolsByCategory = await getToolsByCategory(db, projectId, maxEntriesPerCategory);

  // Get top guidelines by priority
  const topGuidelines = await getTopGuidelines(db, projectId, maxTopGuidelines);

  // Get recent knowledge entries
  const recentKnowledge = await getRecentKnowledge(db, projectId, maxRecentKnowledge);

  // Calculate totals
  const totals = {
    guidelines: guidelinesByCategory.reduce((sum, cat) => sum + cat.count, 0),
    knowledge: knowledgeByCategory.reduce((sum, cat) => sum + cat.count, 0),
    tools: toolsByCategory.reduce((sum, cat) => sum + cat.count, 0),
  };

  const summary: ProjectSummary = {
    projectId,
    projectName,
    generatedAt: new Date().toISOString(),
    totals,
    guidelinesByCategory,
    knowledgeByCategory,
    toolsByCategory,
    topGuidelines,
    recentKnowledge,
  };

  logger.info(
    {
      projectId,
      guidelines: totals.guidelines,
      knowledge: totals.knowledge,
      tools: totals.tools,
    },
    'Project summary generated'
  );

  return summary;
}

/**
 * Generate and store a project summary as a knowledge entry
 */
export async function generateAndStoreSummary(
  db: BetterSQLite3Database<typeof schema>,
  params: GenerateSummaryParams
): Promise<GenerateSummaryResult> {
  const summary = await generateProjectSummary(db, params);

  try {
    // Check if summary entry already exists
    const existingSummary = await findExistingSummary(db, params.projectId);

    const summaryContent = formatSummaryAsMarkdown(summary);
    const summaryTitle = `${SUMMARY_TITLE_PREFIX} ${params.projectName || params.projectId}`;

    if (existingSummary) {
      // Update existing summary by creating a new version
      const versionId = generateId();
      const now = new Date().toISOString();

      // Get the current version number
      const currentVersion = await db
        .select({ versionNum: knowledgeVersions.versionNum })
        .from(knowledgeVersions)
        .where(eq(knowledgeVersions.knowledgeId, existingSummary.id))
        .orderBy(sql`${knowledgeVersions.versionNum} DESC`)
        .limit(1);

      const newVersionNum = (currentVersion[0]?.versionNum ?? 0) + 1;

      // Create new version
      await db.insert(knowledgeVersions).values({
        id: versionId,
        knowledgeId: existingSummary.id,
        versionNum: newVersionNum,
        content: summaryContent,
        source: 'summary-service',
        confidence: 1.0,
        createdAt: now,
        createdBy: 'summary-service',
        changeReason: 'Summary regenerated',
      });

      // Update currentVersionId
      await db
        .update(knowledge)
        .set({ currentVersionId: versionId })
        .where(eq(knowledge.id, existingSummary.id));

      logger.debug({ knowledgeId: existingSummary.id }, 'Updated existing project summary');

      return {
        summary,
        stored: true,
        knowledgeId: existingSummary.id,
      };
    } else {
      // Create new summary entry with version
      const id = generateId();
      const versionId = generateId();
      const now = new Date().toISOString();

      // Create knowledge entry (without content - that goes in version)
      await db.insert(knowledge).values({
        id,
        scopeType: 'project',
        scopeId: params.projectId,
        title: summaryTitle,
        category: 'reference',
        currentVersionId: null,
        isActive: true,
        createdAt: now,
        createdBy: 'summary-service',
      });

      // Create the version with content
      await db.insert(knowledgeVersions).values({
        id: versionId,
        knowledgeId: id,
        versionNum: 1,
        content: summaryContent,
        source: 'summary-service',
        confidence: 1.0,
        createdAt: now,
        createdBy: 'summary-service',
        changeReason: 'Initial summary',
      });

      // Update currentVersionId
      await db.update(knowledge).set({ currentVersionId: versionId }).where(eq(knowledge.id, id));

      // Tag it for easy retrieval
      await ensureSummaryTag(db);
      await attachSummaryTag(db, id);

      logger.debug({ knowledgeId: id }, 'Created new project summary');

      return {
        summary,
        stored: true,
        knowledgeId: id,
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg, projectId: params.projectId }, 'Failed to store summary');

    return {
      summary,
      stored: false,
      error: errorMsg,
    };
  }
}

/**
 * Get stored summary for a project
 */
export async function getStoredSummary(
  db: BetterSQLite3Database<typeof schema>,
  projectId: string
): Promise<ProjectSummary | null> {
  const existing = await findExistingSummary(db, projectId);
  if (!existing) {
    return null;
  }

  // Parse the stored markdown back to summary object
  // For simplicity, we regenerate instead of parsing
  return null;
}

/**
 * Get summary or generate if not exists/stale
 */
export async function getOrGenerateSummary(
  db: BetterSQLite3Database<typeof schema>,
  params: GenerateSummaryParams,
  maxAgeMs: number = 3600000 // 1 hour default
): Promise<GenerateSummaryResult> {
  const existing = await findExistingSummary(db, params.projectId);

  if (existing) {
    const lastUpdated = new Date(existing.latestVersionAt || existing.createdAt).getTime();
    const age = Date.now() - lastUpdated;

    if (age < maxAgeMs) {
      // Return cached summary (regenerate to get structured data)
      const summary = await generateProjectSummary(db, params);
      return {
        summary,
        stored: true,
        knowledgeId: existing.id,
      };
    }
  }

  // Generate fresh summary
  return generateAndStoreSummary(db, params);
}

// =============================================================================
// HELPERS
// =============================================================================

async function getGuidelinesByCategory(
  db: BetterSQLite3Database<typeof schema>,
  projectId: string,
  maxPerCategory: number
): Promise<CategorySummary[]> {
  // Get category counts
  const categoryCounts = await db
    .select({
      category: guidelines.category,
      count: sql<number>`COUNT(*)`,
    })
    .from(guidelines)
    .where(
      and(
        eq(guidelines.scopeType, 'project'),
        eq(guidelines.scopeId, projectId),
        eq(guidelines.isActive, true)
      )
    )
    .groupBy(guidelines.category);

  const result: CategorySummary[] = [];

  for (const { category, count } of categoryCounts) {
    // Get top entries for this category
    const categoryCondition = category
      ? eq(guidelines.category, category)
      : sql`${guidelines.category} IS NULL`;

    const entries = await db
      .select({
        id: guidelines.id,
        name: guidelines.name,
        priority: guidelines.priority,
      })
      .from(guidelines)
      .where(
        and(
          eq(guidelines.scopeType, 'project'),
          eq(guidelines.scopeId, projectId),
          eq(guidelines.isActive, true),
          categoryCondition
        )
      )
      .orderBy(sql`${guidelines.priority} DESC`)
      .limit(maxPerCategory);

    result.push({
      category: category || 'uncategorized',
      count,
      entries,
    });
  }

  return result.sort((a, b) => b.count - a.count);
}

async function getKnowledgeByCategory(
  db: BetterSQLite3Database<typeof schema>,
  projectId: string,
  maxPerCategory: number
): Promise<CategorySummary[]> {
  const categoryCounts = await db
    .select({
      category: knowledge.category,
      count: sql<number>`COUNT(*)`,
    })
    .from(knowledge)
    .where(
      and(
        eq(knowledge.scopeType, 'project'),
        eq(knowledge.scopeId, projectId),
        eq(knowledge.isActive, true)
      )
    )
    .groupBy(knowledge.category);

  const result: CategorySummary[] = [];

  for (const { category, count } of categoryCounts) {
    const categoryCondition = category
      ? eq(knowledge.category, category)
      : sql`${knowledge.category} IS NULL`;

    const entries = await db
      .select({
        id: knowledge.id,
        name: knowledge.title,
      })
      .from(knowledge)
      .where(
        and(
          eq(knowledge.scopeType, 'project'),
          eq(knowledge.scopeId, projectId),
          eq(knowledge.isActive, true),
          categoryCondition
        )
      )
      .orderBy(sql`${knowledge.createdAt} DESC`)
      .limit(maxPerCategory);

    result.push({
      category: category || 'uncategorized',
      count,
      entries,
    });
  }

  return result.sort((a, b) => b.count - a.count);
}

async function getToolsByCategory(
  db: BetterSQLite3Database<typeof schema>,
  projectId: string,
  maxPerCategory: number
): Promise<CategorySummary[]> {
  const categoryCounts = await db
    .select({
      category: tools.category,
      count: sql<number>`COUNT(*)`,
    })
    .from(tools)
    .where(
      and(eq(tools.scopeType, 'project'), eq(tools.scopeId, projectId), eq(tools.isActive, true))
    )
    .groupBy(tools.category);

  const result: CategorySummary[] = [];

  for (const { category, count } of categoryCounts) {
    const categoryCondition = category
      ? eq(tools.category, category)
      : sql`${tools.category} IS NULL`;

    const entries = await db
      .select({
        id: tools.id,
        name: tools.name,
      })
      .from(tools)
      .where(
        and(
          eq(tools.scopeType, 'project'),
          eq(tools.scopeId, projectId),
          eq(tools.isActive, true),
          categoryCondition
        )
      )
      .limit(maxPerCategory);

    result.push({
      category: category || 'uncategorized',
      count,
      entries,
    });
  }

  return result.sort((a, b) => b.count - a.count);
}

async function getTopGuidelines(
  db: BetterSQLite3Database<typeof schema>,
  projectId: string,
  limit: number
): Promise<Array<{ id: string; name: string; priority: number; category?: string }>> {
  const rows = await db
    .select({
      id: guidelines.id,
      name: guidelines.name,
      priority: guidelines.priority,
      category: guidelines.category,
    })
    .from(guidelines)
    .where(
      and(
        eq(guidelines.scopeType, 'project'),
        eq(guidelines.scopeId, projectId),
        eq(guidelines.isActive, true)
      )
    )
    .orderBy(sql`${guidelines.priority} DESC`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    priority: r.priority ?? 50,
    category: r.category ?? undefined,
  }));
}

async function getRecentKnowledge(
  db: BetterSQLite3Database<typeof schema>,
  projectId: string,
  limit: number
): Promise<Array<{ id: string; title: string; category?: string; createdAt: string }>> {
  const rows = await db
    .select({
      id: knowledge.id,
      title: knowledge.title,
      category: knowledge.category,
      createdAt: knowledge.createdAt,
    })
    .from(knowledge)
    .where(
      and(
        eq(knowledge.scopeType, 'project'),
        eq(knowledge.scopeId, projectId),
        eq(knowledge.isActive, true)
      )
    )
    .orderBy(sql`${knowledge.createdAt} DESC`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category ?? undefined,
    createdAt: r.createdAt,
  }));
}

async function findExistingSummary(
  db: BetterSQLite3Database<typeof schema>,
  projectId: string
): Promise<{ id: string; createdAt: string; latestVersionAt?: string } | null> {
  // Find knowledge entry with summary tag for this project
  const rows = await db
    .select({
      id: knowledge.id,
      createdAt: knowledge.createdAt,
      currentVersionId: knowledge.currentVersionId,
    })
    .from(knowledge)
    .innerJoin(entryTags, eq(knowledge.id, entryTags.entryId))
    .innerJoin(tags, eq(entryTags.tagId, tags.id))
    .where(
      and(
        eq(knowledge.scopeType, 'project'),
        eq(knowledge.scopeId, projectId),
        eq(knowledge.isActive, true),
        eq(tags.name, SUMMARY_TAG)
      )
    )
    .limit(1);

  if (!rows[0]) return null;

  // Get the latest version's createdAt to determine staleness
  let latestVersionAt: string | undefined;
  if (rows[0].currentVersionId) {
    const version = await db
      .select({ createdAt: knowledgeVersions.createdAt })
      .from(knowledgeVersions)
      .where(eq(knowledgeVersions.id, rows[0].currentVersionId))
      .limit(1);
    latestVersionAt = version[0]?.createdAt;
  }

  return {
    id: rows[0].id,
    createdAt: rows[0].createdAt,
    latestVersionAt,
  };
}

async function ensureSummaryTag(db: BetterSQLite3Database<typeof schema>): Promise<string> {
  // Check if tag exists
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, SUMMARY_TAG))
    .limit(1);

  if (existing[0]) {
    return existing[0].id;
  }

  // Create the tag
  const id = generateId();
  await db.insert(tags).values({
    id,
    name: SUMMARY_TAG,
    category: 'meta',
    description: 'Auto-generated project summary',
    isPredefined: true,
    createdAt: new Date().toISOString(),
  });

  return id;
}

async function attachSummaryTag(
  db: BetterSQLite3Database<typeof schema>,
  knowledgeId: string
): Promise<void> {
  const tag = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, SUMMARY_TAG))
    .limit(1);

  if (!tag[0]) return;

  await db
    .insert(entryTags)
    .values({
      id: generateId(),
      entryId: knowledgeId,
      entryType: 'knowledge',
      tagId: tag[0].id,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}

function formatSummaryAsMarkdown(summary: ProjectSummary): string {
  const lines: string[] = [];

  lines.push(`# Project Summary`);
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push('');

  lines.push('## Totals');
  lines.push(`- Guidelines: ${summary.totals.guidelines}`);
  lines.push(`- Knowledge: ${summary.totals.knowledge}`);
  lines.push(`- Tools: ${summary.totals.tools}`);
  lines.push('');

  if (summary.topGuidelines.length > 0) {
    lines.push('## Top Guidelines (by priority)');
    for (const g of summary.topGuidelines.slice(0, 5)) {
      lines.push(`- **${g.name}** [P: ${g.priority}] ${g.category ? `(${g.category})` : ''}`);
    }
    lines.push('');
  }

  if (summary.guidelinesByCategory.length > 0) {
    lines.push('## Guidelines by Category');
    for (const cat of summary.guidelinesByCategory) {
      lines.push(`- **${cat.category}**: ${cat.count} entries`);
    }
    lines.push('');
  }

  if (summary.knowledgeByCategory.length > 0) {
    lines.push('## Knowledge by Category');
    for (const cat of summary.knowledgeByCategory) {
      lines.push(`- **${cat.category}**: ${cat.count} entries`);
    }
    lines.push('');
  }

  if (summary.recentKnowledge.length > 0) {
    lines.push('## Recent Knowledge');
    for (const k of summary.recentKnowledge.slice(0, 5)) {
      lines.push(`- ${k.title} ${k.category ? `(${k.category})` : ''}`);
    }
    lines.push('');
  }

  if (summary.toolsByCategory.length > 0) {
    lines.push('## Tools by Category');
    for (const cat of summary.toolsByCategory) {
      lines.push(`- **${cat.category}**: ${cat.count} entries`);
    }
  }

  return lines.join('\n');
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}
