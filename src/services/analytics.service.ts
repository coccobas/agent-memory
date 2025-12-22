/**
 * Analytics service for usage statistics and trends
 *
 * Aggregates data from the audit log to provide insights into system usage.
 */

import { getDb, type DbClient } from '../db/connection.js';
import { auditLog, entryTags, tags } from '../db/schema.js';
import { eq, and, gte, lte, sql, desc, count, isNotNull, type SQL } from 'drizzle-orm';
import type { ScopeType, EntryType } from '../db/schema.js';

export interface UsageStatsParams {
  scopeType?: ScopeType;
  scopeId?: string;
  startDate?: string;
  endDate?: string;
}

export interface UsageStats {
  mostQueriedEntries: Array<{ entryId: string; entryType: EntryType; queryCount: number }>;
  queryFrequency: Array<{ date: string; count: number }>;
  tagPopularity: Array<{ tagId: string; tagName: string; usageCount: number }>;
  scopeUsage: Record<ScopeType, number>;
  searchQueries: Array<{ query: string; count: number }>;
  actionBreakdown: Array<{ action: string; count: number }>;
  entryTypeBreakdown: Array<{ entryType: EntryType | null; count: number }>;
}

export interface TrendData {
  date: string;
  queries: number;
  creates: number;
  updates: number;
  deletes: number;
  total: number;
}

/**
 * Get usage statistics from audit log
 *
 * @param params - Query parameters
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function getUsageStats(params: UsageStatsParams = {}, dbClient?: DbClient): UsageStats {
  const db = dbClient ?? getDb();
  const { scopeType, scopeId, startDate, endDate } = params;

  // Build base query conditions
  const conditions = [];
  if (scopeType) {
    conditions.push(eq(auditLog.scopeType, scopeType));
  }
  if (scopeId) {
    conditions.push(eq(auditLog.scopeId, scopeId));
  }
  if (startDate) {
    conditions.push(gte(auditLog.createdAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(auditLog.createdAt, endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Most queried entries (queries with entryId)
  const mostQueriedEntries = db
    .select({
      entryId: auditLog.entryId,
      entryType: auditLog.entryType,
      queryCount: count(),
    })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'query'), sql`${auditLog.entryId} IS NOT NULL`, whereClause))
    .groupBy(auditLog.entryId, auditLog.entryType)
    .orderBy(desc(count()))
    .limit(20)
    .all()
    .filter((row) => row.entryId !== null && row.entryType !== null)
    .map((row) => ({
      entryId: row.entryId as string,
      entryType: row.entryType as EntryType,
      queryCount: row.queryCount,
    }));

  // Query frequency by date
  const queryFrequency = db
    .select({
      date: sql<string>`DATE(${auditLog.createdAt})`,
      count: count(),
    })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'query'), whereClause))
    .groupBy(sql`DATE(${auditLog.createdAt})`)
    .orderBy(desc(sql`DATE(${auditLog.createdAt})`))
    .limit(30)
    .all()
    .map((row) => ({
      date: row.date,
      count: row.count,
    }));

  // Tag popularity (count entries with each tag)
  const tagPopularity = db
    .select({
      tagId: entryTags.tagId,
      tagName: tags.name,
      usageCount: count(),
    })
    .from(entryTags)
    .innerJoin(tags, eq(entryTags.tagId, tags.id))
    .groupBy(entryTags.tagId, tags.name)
    .orderBy(desc(count()))
    .limit(20)
    .all()
    .map((row) => ({
      tagId: row.tagId,
      tagName: row.tagName,
      usageCount: row.usageCount,
    }));

  // Scope usage breakdown
  const scopeUsageData = db
    .select({
      scopeType: auditLog.scopeType,
      count: count(),
    })
    .from(auditLog)
    .where(whereClause)
    .groupBy(auditLog.scopeType)
    .all();

  const scopeUsage: Record<ScopeType, number> = {
    global: 0,
    org: 0,
    project: 0,
    session: 0,
  };

  for (const row of scopeUsageData) {
    if (row.scopeType) {
      scopeUsage[row.scopeType] = row.count;
    }
  }

  // Search queries (extract from queryParams)
  const searchQueriesRaw = db
    .select({
      queryParams: auditLog.queryParams,
    })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'query'), sql`${auditLog.queryParams} IS NOT NULL`, whereClause))
    .limit(1000)
    .all();

  // Extract search terms from queryParams
  const searchQueryMap = new Map<string, number>();
  for (const row of searchQueriesRaw) {
    if (row.queryParams) {
      try {
        const paramsRaw: unknown =
          typeof row.queryParams === 'string' ? JSON.parse(row.queryParams) : row.queryParams;
        if (paramsRaw && typeof paramsRaw === 'object' && !Array.isArray(paramsRaw)) {
          const params = paramsRaw as Record<string, unknown>;
          const search =
            (params.search as string | undefined) || (params.query as string | undefined) || '';
          if (search && typeof search === 'string') {
            const normalized = search.trim().toLowerCase();
            if (normalized) {
              searchQueryMap.set(normalized, (searchQueryMap.get(normalized) || 0) + 1);
            }
          }
        }
      } catch {
        // Ignore invalid JSON
      }
    }
  }

  const searchQueries = Array.from(searchQueryMap.entries())
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Action breakdown
  const actionBreakdown = db
    .select({
      action: auditLog.action,
      count: count(),
    })
    .from(auditLog)
    .where(whereClause)
    .groupBy(auditLog.action)
    .orderBy(desc(count()))
    .all()
    .map((row) => ({
      action: row.action,
      count: row.count,
    }));

  // Entry type breakdown
  const entryTypeBreakdown = db
    .select({
      entryType: auditLog.entryType,
      count: count(),
    })
    .from(auditLog)
    .where(whereClause)
    .groupBy(auditLog.entryType)
    .orderBy(desc(count()))
    .all()
    .map((row) => ({
      entryType: row.entryType,
      count: row.count,
    }));

  return {
    mostQueriedEntries,
    queryFrequency,
    tagPopularity,
    scopeUsage,
    searchQueries,
    actionBreakdown,
    entryTypeBreakdown,
  };
}

/**
 * Get trend data over time
 *
 * @param params - Query parameters
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function getTrends(params: UsageStatsParams = {}, dbClient?: DbClient): TrendData[] {
  const db = dbClient ?? getDb();
  const { scopeType, scopeId, startDate, endDate } = params;

  // Build base query conditions
  const conditions = [];
  if (scopeType) {
    conditions.push(eq(auditLog.scopeType, scopeType));
  }
  if (scopeId) {
    conditions.push(eq(auditLog.scopeId, scopeId));
  }
  if (startDate) {
    conditions.push(gte(auditLog.createdAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(auditLog.createdAt, endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get daily breakdown by action
  const dailyData = db
    .select({
      date: sql<string>`DATE(${auditLog.createdAt})`,
      action: auditLog.action,
      count: count(),
    })
    .from(auditLog)
    .where(whereClause)
    .groupBy(sql`DATE(${auditLog.createdAt})`, auditLog.action)
    .orderBy(desc(sql`DATE(${auditLog.createdAt})`))
    .limit(100)
    .all();

  // Aggregate by date
  const trendMap = new Map<
    string,
    { queries: number; creates: number; updates: number; deletes: number; total: number }
  >();

  for (const row of dailyData) {
    const date = row.date;
    const existing = trendMap.get(date) || {
      queries: 0,
      creates: 0,
      updates: 0,
      deletes: 0,
      total: 0,
    };

    if (row.action === 'query') {
      existing.queries += row.count;
    } else if (row.action === 'create') {
      existing.creates += row.count;
    } else if (row.action === 'update') {
      existing.updates += row.count;
    } else if (row.action === 'delete') {
      existing.deletes += row.count;
    }
    existing.total += row.count;

    trendMap.set(date, existing);
  }

  // Convert to array and sort by date
  return Array.from(trendMap.entries())
    .map(([date, counts]) => ({
      date,
      ...counts,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30); // Last 30 days
}

/**
 * Get subtask execution analytics
 *
 * Provides insights into subtask success rates, execution times, and error patterns.
 *
 * @param params - Query parameters
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function getSubtaskStats(
  params: {
    projectId?: string;
    subtaskType?: string;
    startDate?: string;
    endDate?: string;
  },
  dbClient?: DbClient
): {
  subtasks: Array<{
    subtaskType: string;
    total: number;
    completed: number;
    failed: number;
    successRate: number;
  }>;
  totalSubtasks: number;
  completedSubtasks: number;
  failedSubtasks: number;
} {
  const db = dbClient ?? getDb();

  // Build where conditions
  const conditions = [isNotNull(auditLog.subtaskType)];

  if (params.projectId) {
    conditions.push(
      and(eq(auditLog.scopeType, 'project'), eq(auditLog.scopeId, params.projectId)) as SQL<unknown>
    );
  }

  if (params.subtaskType) {
    conditions.push(eq(auditLog.subtaskType, params.subtaskType));
  }

  if (params.startDate) {
    conditions.push(sql`${auditLog.createdAt} >= ${params.startDate}`);
  }

  if (params.endDate) {
    conditions.push(sql`${auditLog.createdAt} <= ${params.endDate}`);
  }

  // Get subtasks with execution tracking
  const subtasks = db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .all();

  // Group by subtaskType
  const subtaskTypeMap = new Map<string, { total: number; completed: number; failed: number }>();
  for (const task of subtasks) {
    if (!task.subtaskType) continue;
    const stats = subtaskTypeMap.get(task.subtaskType) || { total: 0, completed: 0, failed: 0 };
    stats.total++;
    if (task.success === true) {
      stats.completed++;
    } else if (task.success === false) {
      stats.failed++;
    }
    subtaskTypeMap.set(task.subtaskType, stats);
  }

  // Convert to array format
  const subtasksArray = Array.from(subtaskTypeMap.entries())
    .map(([subtaskType, stats]) => ({
      subtaskType,
      total: stats.total,
      completed: stats.completed,
      failed: stats.failed,
      successRate: stats.total > 0 ? stats.completed / stats.total : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Calculate totals
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter((s) => s.success === true).length;
  const failedSubtasks = subtasks.filter((s) => s.success === false).length;

  return {
    subtasks: subtasksArray,
    totalSubtasks,
    completedSubtasks,
    failedSubtasks,
  };
}
