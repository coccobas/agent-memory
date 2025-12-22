import { inArray } from 'drizzle-orm';
import {
  toolVersions,
  guidelineVersions,
  knowledgeVersions,
  type ToolVersion,
  type GuidelineVersion,
  type KnowledgeVersion,
} from '../../db/schema.js';

type Db = ReturnType<typeof import('../../db/connection.js').getDb>;

export function loadVersionsBatched(
  db: Db,
  toolIds: string[],
  guidelineIds: string[],
  knowledgeIds: string[]
): {
  tools: Map<string, { current: ToolVersion; history: ToolVersion[] }>;
  guidelines: Map<string, { current: GuidelineVersion; history: GuidelineVersion[] }>;
  knowledge: Map<string, { current: KnowledgeVersion; history: KnowledgeVersion[] }>;
} {
  const result = {
    tools: new Map<string, { current: ToolVersion; history: ToolVersion[] }>(),
    guidelines: new Map<string, { current: GuidelineVersion; history: GuidelineVersion[] }>(),
    knowledge: new Map<string, { current: KnowledgeVersion; history: KnowledgeVersion[] }>(),
  };

  if (toolIds.length > 0) {
    const versions = db
      .select()
      .from(toolVersions)
      .where(inArray(toolVersions.toolId, toolIds))
      .all();

    const map = new Map<string, ToolVersion[]>();
    for (const v of versions) {
      const list = map.get(v.toolId) ?? [];
      list.push(v);
      map.set(v.toolId, list);
    }

    for (const [id, list] of map) {
      list.sort((a, b) => b.versionNum - a.versionNum);
      if (list[0]) {
        result.tools.set(id, { current: list[0], history: list });
      }
    }
  }

  if (guidelineIds.length > 0) {
    const versions = db
      .select()
      .from(guidelineVersions)
      .where(inArray(guidelineVersions.guidelineId, guidelineIds))
      .all();

    const map = new Map<string, GuidelineVersion[]>();
    for (const v of versions) {
      const list = map.get(v.guidelineId) ?? [];
      list.push(v);
      map.set(v.guidelineId, list);
    }

    for (const [id, list] of map) {
      list.sort((a, b) => b.versionNum - a.versionNum);
      if (list[0]) {
        result.guidelines.set(id, { current: list[0], history: list });
      }
    }
  }

  if (knowledgeIds.length > 0) {
    const versions = db
      .select()
      .from(knowledgeVersions)
      .where(inArray(knowledgeVersions.knowledgeId, knowledgeIds))
      .all();

    const map = new Map<string, KnowledgeVersion[]>();
    for (const v of versions) {
      const list = map.get(v.knowledgeId) ?? [];
      list.push(v);
      map.set(v.knowledgeId, list);
    }

    for (const [id, list] of map) {
      list.sort((a, b) => b.versionNum - a.versionNum);
      if (list[0]) {
        result.knowledge.set(id, { current: list[0], history: list });
      }
    }
  }

  return result;
}
