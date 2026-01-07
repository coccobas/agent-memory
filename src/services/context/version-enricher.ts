/**
 * Version Content Enricher
 *
 * Enriches query results with version content data for hierarchical context display.
 * This allows snippet extraction from the actual content stored in version tables.
 */

import { inArray } from 'drizzle-orm';
import {
  toolVersions,
  guidelineVersions,
  knowledgeVersions,
  experienceVersions,
  type ToolVersion,
  type GuidelineVersion,
  type KnowledgeVersion,
  type ExperienceVersion,
} from '../../db/schema.js';
import type { DbClient } from '../../db/connection.js';
import type { QueryResultItem } from '../query/pipeline.js';

/**
 * Enrich query results with version content
 *
 * Batch-fetches version content for all result items and attaches it to each item.
 * This enables snippet extraction in the hierarchical formatter.
 *
 * @param results - Query result items without version data
 * @param db - Database client for fetching versions
 * @returns Results with version data attached
 */
export function enrichResultsWithVersionContent(
  results: QueryResultItem[],
  db: DbClient
): QueryResultItem[] {
  if (results.length === 0) return results;

  // Collect version IDs by type
  const toolVersionIds: string[] = [];
  const guidelineVersionIds: string[] = [];
  const knowledgeVersionIds: string[] = [];
  const experienceVersionIds: string[] = [];

  for (const r of results) {
    if (r.type === 'tool' && r.tool.currentVersionId) {
      toolVersionIds.push(r.tool.currentVersionId);
    } else if (r.type === 'guideline' && r.guideline.currentVersionId) {
      guidelineVersionIds.push(r.guideline.currentVersionId);
    } else if (r.type === 'knowledge' && r.knowledge.currentVersionId) {
      knowledgeVersionIds.push(r.knowledge.currentVersionId);
    } else if (r.type === 'experience' && r.experience.currentVersionId) {
      experienceVersionIds.push(r.experience.currentVersionId);
    }
  }

  // Batch fetch all versions
  const toolVersionsMap = fetchVersions<ToolVersion>(db, toolVersions, toolVersionIds);
  const guidelineVersionsMap = fetchVersions<GuidelineVersion>(db, guidelineVersions, guidelineVersionIds);
  const knowledgeVersionsMap = fetchVersions<KnowledgeVersion>(db, knowledgeVersions, knowledgeVersionIds);
  const experienceVersionsMap = fetchVersions<ExperienceVersion>(db, experienceVersions, experienceVersionIds);

  // Attach versions to results
  return results.map((r): QueryResultItem => {
    if (r.type === 'tool' && r.tool.currentVersionId) {
      return { ...r, version: toolVersionsMap.get(r.tool.currentVersionId) };
    } else if (r.type === 'guideline' && r.guideline.currentVersionId) {
      return { ...r, version: guidelineVersionsMap.get(r.guideline.currentVersionId) };
    } else if (r.type === 'knowledge' && r.knowledge.currentVersionId) {
      return { ...r, version: knowledgeVersionsMap.get(r.knowledge.currentVersionId) };
    } else if (r.type === 'experience' && r.experience.currentVersionId) {
      return { ...r, version: experienceVersionsMap.get(r.experience.currentVersionId) };
    }
    return r;
  });
}

/**
 * Fetch versions by IDs from a version table
 */
function fetchVersions<TVersion extends { id: string }>(
  db: DbClient,
  versionTable: { id: unknown },
  versionIds: string[]
): Map<string, TVersion> {
  if (versionIds.length === 0) {
    return new Map();
  }

  const versions = db
    .select()
    .from(versionTable as never)
    .where(inArray(versionTable.id as never, versionIds))
    .all() as TVersion[];

  return new Map(versions.map((v) => [v.id, v]));
}
