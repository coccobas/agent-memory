/**
 * Export service for memory entries
 *
 * Supports exporting entries to JSON, Markdown, and YAML formats
 */

import type { DbClient } from '../db/connection.js';

// Security: Maximum entries to export per type to prevent memory exhaustion
const MAX_EXPORT_ENTRIES_PER_TYPE = 5000;
import {
  tools,
  guidelines,
  knowledge,
  toolVersions,
  guidelineVersions,
  knowledgeVersions,
  entryTags,
  tags,
  entryRelations,
  type ToolVersion,
  type GuidelineVersion,
  type KnowledgeVersion,
  type ScopeType,
} from '../db/schema.js';
import { eq, and, isNull, inArray } from 'drizzle-orm';

export interface ExportOptions {
  types?: ('tools' | 'guidelines' | 'knowledge')[];
  scopeType?: ScopeType;
  scopeId?: string;
  tags?: string[];
  format?: 'json' | 'markdown' | 'yaml' | 'openapi';
  includeVersions?: boolean;
  includeInactive?: boolean;
}

export interface ExportResult {
  format: 'json' | 'markdown' | 'yaml' | 'openapi';
  content: string;
  metadata: {
    exportedAt: string;
    entryCount: number;
    types: string[];
    scopeType?: ScopeType;
    scopeId?: string;
  };
}

interface ExportedTool {
  id: string;
  scopeType: string;
  scopeId: string | null;
  name: string;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
  currentVersion?: ToolVersion;
  versions?: ToolVersion[];
  tags: string[];
  relations: Array<{
    targetType: string;
    targetId: string;
    relationType: string;
  }>;
}

interface ExportedGuideline {
  id: string;
  scopeType: string;
  scopeId: string | null;
  name: string;
  category: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
  currentVersion?: GuidelineVersion;
  versions?: GuidelineVersion[];
  tags: string[];
  relations: Array<{
    targetType: string;
    targetId: string;
    relationType: string;
  }>;
}

interface ExportedKnowledge {
  id: string;
  scopeType: string;
  scopeId: string | null;
  title: string;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
  currentVersion?: KnowledgeVersion;
  versions?: KnowledgeVersion[];
  tags: string[];
  relations: Array<{
    targetType: string;
    targetId: string;
    relationType: string;
  }>;
}

interface ExportData {
  version: string;
  exportedAt: string;
  metadata: {
    types: string[];
    scopeType?: ScopeType;
    scopeId?: string;
  };
  entries: {
    tools: ExportedTool[];
    guidelines: ExportedGuideline[];
    knowledge: ExportedKnowledge[];
  };
}

/**
 * Batch fetch tags for entries of a given type
 */
function batchFetchTags(
  db: DbClient,
  entryType: 'tool' | 'guideline' | 'knowledge',
  entryIds: string[]
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (entryIds.length === 0) return result;

  const rows = db
    .select({
      entryId: entryTags.entryId,
      tagName: tags.name,
    })
    .from(entryTags)
    .innerJoin(tags, eq(entryTags.tagId, tags.id))
    .where(and(eq(entryTags.entryType, entryType), inArray(entryTags.entryId, entryIds)))
    .all();

  for (const row of rows) {
    const existing = result.get(row.entryId) ?? [];
    existing.push(row.tagName);
    result.set(row.entryId, existing);
  }

  return result;
}

/**
 * Batch fetch relations for entries of a given type
 */
function batchFetchRelations(
  db: DbClient,
  sourceType: 'tool' | 'guideline' | 'knowledge',
  sourceIds: string[]
): Map<string, Array<{ targetType: string; targetId: string; relationType: string }>> {
  const result = new Map<
    string,
    Array<{ targetType: string; targetId: string; relationType: string }>
  >();
  if (sourceIds.length === 0) return result;

  const rows = db
    .select()
    .from(entryRelations)
    .where(
      and(eq(entryRelations.sourceType, sourceType), inArray(entryRelations.sourceId, sourceIds))
    )
    .all();

  for (const row of rows) {
    const existing = result.get(row.sourceId) ?? [];
    existing.push({
      targetType: row.targetType,
      targetId: row.targetId,
      relationType: row.relationType,
    });
    result.set(row.sourceId, existing);
  }

  return result;
}

/**
 * Check if entry has required tag (case-insensitive)
 */
function hasRequiredTag(entryTags: string[], requiredTags: string[]): boolean {
  if (requiredTags.length === 0) return true;
  const tagNamesLower = entryTags.map((t) => t.toLowerCase());
  return requiredTags.some((tag) => tagNamesLower.includes(tag.toLowerCase()));
}

/**
 * Query tools for export
 */
function queryToolsForExport(db: DbClient, options: ExportOptions): ExportedTool[] {
  const conditions = [];

  if (options.scopeType) {
    if (options.scopeId === null || options.scopeId === undefined) {
      conditions.push(and(eq(tools.scopeType, options.scopeType), isNull(tools.scopeId)));
    } else {
      conditions.push(
        and(eq(tools.scopeType, options.scopeType), eq(tools.scopeId, options.scopeId))
      );
    }
  }

  if (!options.includeInactive) {
    conditions.push(eq(tools.isActive, true));
  }

  let query = db.select().from(tools);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const toolList = query.limit(MAX_EXPORT_ENTRIES_PER_TYPE).all();
  const toolIds = toolList.map((t: { id: string }) => t.id);

  // Batch fetch versions, tags, and relations
  const allVersions =
    toolIds.length > 0
      ? db.select().from(toolVersions).where(inArray(toolVersions.toolId, toolIds)).all()
      : [];
  const versionsByToolId = new Map<string, ToolVersion[]>();
  for (const v of allVersions) {
    const existing = versionsByToolId.get(v.toolId) ?? [];
    existing.push(v);
    versionsByToolId.set(v.toolId, existing);
  }

  const tagsByEntryId = batchFetchTags(db, 'tool', toolIds);
  const relationsByEntryId = batchFetchRelations(db, 'tool', toolIds);

  const result: ExportedTool[] = [];
  for (const tool of toolList) {
    const versions = versionsByToolId.get(tool.id) ?? [];
    const currentVersion = versions.find((v) => v.id === tool.currentVersionId);
    const toolTagNames = tagsByEntryId.get(tool.id) ?? [];
    const relations = relationsByEntryId.get(tool.id) ?? [];

    if (!hasRequiredTag(toolTagNames, options.tags ?? [])) continue;

    result.push({
      id: tool.id,
      scopeType: tool.scopeType,
      scopeId: tool.scopeId,
      name: tool.name,
      category: tool.category,
      isActive: tool.isActive,
      createdAt: tool.createdAt,
      createdBy: tool.createdBy,
      currentVersion,
      versions: options.includeVersions ? versions : undefined,
      tags: toolTagNames,
      relations,
    });
  }

  return result;
}

/**
 * Query guidelines for export
 */
function queryGuidelinesForExport(db: DbClient, options: ExportOptions): ExportedGuideline[] {
  const conditions = [];

  if (options.scopeType) {
    if (options.scopeId === null || options.scopeId === undefined) {
      conditions.push(and(eq(guidelines.scopeType, options.scopeType), isNull(guidelines.scopeId)));
    } else {
      conditions.push(
        and(eq(guidelines.scopeType, options.scopeType), eq(guidelines.scopeId, options.scopeId))
      );
    }
  }

  if (!options.includeInactive) {
    conditions.push(eq(guidelines.isActive, true));
  }

  let query = db.select().from(guidelines);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const guidelineList = query.limit(MAX_EXPORT_ENTRIES_PER_TYPE).all();
  const guidelineIds = guidelineList.map((g: { id: string }) => g.id);

  // Batch fetch versions, tags, and relations
  const allVersions =
    guidelineIds.length > 0
      ? db
          .select()
          .from(guidelineVersions)
          .where(inArray(guidelineVersions.guidelineId, guidelineIds))
          .all()
      : [];
  const versionsByGuidelineId = new Map<string, GuidelineVersion[]>();
  for (const v of allVersions) {
    const existing = versionsByGuidelineId.get(v.guidelineId) ?? [];
    existing.push(v);
    versionsByGuidelineId.set(v.guidelineId, existing);
  }

  const tagsByEntryId = batchFetchTags(db, 'guideline', guidelineIds);
  const relationsByEntryId = batchFetchRelations(db, 'guideline', guidelineIds);

  const result: ExportedGuideline[] = [];
  for (const guideline of guidelineList) {
    const versions = versionsByGuidelineId.get(guideline.id) ?? [];
    const currentVersion = versions.find((v) => v.id === guideline.currentVersionId);
    const guidelineTagNames = tagsByEntryId.get(guideline.id) ?? [];
    const relations = relationsByEntryId.get(guideline.id) ?? [];

    if (!hasRequiredTag(guidelineTagNames, options.tags ?? [])) continue;

    result.push({
      id: guideline.id,
      scopeType: guideline.scopeType,
      scopeId: guideline.scopeId,
      name: guideline.name,
      category: guideline.category,
      priority: guideline.priority,
      isActive: guideline.isActive,
      createdAt: guideline.createdAt,
      createdBy: guideline.createdBy,
      currentVersion,
      versions: options.includeVersions ? versions : undefined,
      tags: guidelineTagNames,
      relations,
    });
  }

  return result;
}

/**
 * Query knowledge for export
 */
function queryKnowledgeForExport(db: DbClient, options: ExportOptions): ExportedKnowledge[] {
  const conditions = [];

  if (options.scopeType) {
    if (options.scopeId === null || options.scopeId === undefined) {
      conditions.push(and(eq(knowledge.scopeType, options.scopeType), isNull(knowledge.scopeId)));
    } else {
      conditions.push(
        and(eq(knowledge.scopeType, options.scopeType), eq(knowledge.scopeId, options.scopeId))
      );
    }
  }

  if (!options.includeInactive) {
    conditions.push(eq(knowledge.isActive, true));
  }

  let query = db.select().from(knowledge);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const knowledgeList = query.limit(MAX_EXPORT_ENTRIES_PER_TYPE).all();
  const knowledgeIds = knowledgeList.map((k: { id: string }) => k.id);

  // Batch fetch versions, tags, and relations
  const allVersions =
    knowledgeIds.length > 0
      ? db
          .select()
          .from(knowledgeVersions)
          .where(inArray(knowledgeVersions.knowledgeId, knowledgeIds))
          .all()
      : [];
  const versionsByKnowledgeId = new Map<string, KnowledgeVersion[]>();
  for (const v of allVersions) {
    const existing = versionsByKnowledgeId.get(v.knowledgeId) ?? [];
    existing.push(v);
    versionsByKnowledgeId.set(v.knowledgeId, existing);
  }

  const tagsByEntryId = batchFetchTags(db, 'knowledge', knowledgeIds);
  const relationsByEntryId = batchFetchRelations(db, 'knowledge', knowledgeIds);

  const result: ExportedKnowledge[] = [];
  for (const know of knowledgeList) {
    const versions = versionsByKnowledgeId.get(know.id) ?? [];
    const currentVersion = versions.find((v) => v.id === know.currentVersionId);
    const knowledgeTagNames = tagsByEntryId.get(know.id) ?? [];
    const relations = relationsByEntryId.get(know.id) ?? [];

    if (!hasRequiredTag(knowledgeTagNames, options.tags ?? [])) continue;

    result.push({
      id: know.id,
      scopeType: know.scopeType,
      scopeId: know.scopeId,
      title: know.title,
      category: know.category,
      isActive: know.isActive,
      createdAt: know.createdAt,
      createdBy: know.createdBy,
      currentVersion,
      versions: options.includeVersions ? versions : undefined,
      tags: knowledgeTagNames,
      relations,
    });
  }

  return result;
}

/**
 * Query and structure entries for export (optimized with batch fetching)
 */
function queryEntries(options: ExportOptions, db: DbClient): ExportData {
  const types = options.types || ['tools', 'guidelines', 'knowledge'];

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    metadata: {
      types,
      scopeType: options.scopeType,
      scopeId: options.scopeId,
    },
    entries: {
      tools: types.includes('tools') ? queryToolsForExport(db, options) : [],
      guidelines: types.includes('guidelines') ? queryGuidelinesForExport(db, options) : [],
      knowledge: types.includes('knowledge') ? queryKnowledgeForExport(db, options) : [],
    },
  };
}

/**
 * Export entries to JSON format
 */
export function exportToJson(options: ExportOptions, db: DbClient): ExportResult {
  const data = queryEntries(options, db);
  const entryCount =
    data.entries.tools.length + data.entries.guidelines.length + data.entries.knowledge.length;

  return {
    format: 'json',
    content: JSON.stringify(data, null, 2),
    metadata: {
      exportedAt: data.exportedAt,
      entryCount,
      types: data.metadata.types,
      scopeType: data.metadata.scopeType,
      scopeId: data.metadata.scopeId,
    },
  };
}

/**
 * Export entries to Markdown format (optimized: uses array.join instead of +=)
 */
export function exportToMarkdown(options: ExportOptions, db: DbClient): ExportResult {
  const data = queryEntries(options, db);
  const parts: string[] = [];

  parts.push(`# Agent Memory Export\n\n`);
  parts.push(`**Exported:** ${data.exportedAt}\n`);

  const entryCount =
    data.entries.tools.length + data.entries.guidelines.length + data.entries.knowledge.length;
  parts.push(`**Entries:** ${entryCount}\n`);

  if (data.metadata.scopeType) {
    parts.push(
      `**Scope:** ${data.metadata.scopeType}${data.metadata.scopeId ? ` / ${data.metadata.scopeId}` : ''}\n`
    );
  }
  parts.push(`\n`);

  if (data.entries.tools.length > 0) {
    parts.push(`## Tools (${data.entries.tools.length})\n\n`);
    for (const tool of data.entries.tools) {
      parts.push(`### ${tool.name}\n\n`);
      parts.push(`- **ID:** \`${tool.id}\`\n`);
      parts.push(`- **Scope:** ${tool.scopeType}${tool.scopeId ? ` / ${tool.scopeId}` : ''}\n`);
      if (tool.category) parts.push(`- **Category:** ${tool.category}\n`);
      if (tool.currentVersion?.description) {
        parts.push(`- **Description:** ${tool.currentVersion.description}\n`);
      }
      if (tool.tags.length > 0) {
        parts.push(`- **Tags:** ${tool.tags.map((t) => `\`${t}\``).join(', ')}\n`);
      }
      if (tool.currentVersion?.parameters) {
        parts.push(`- **Parameters:** \`${JSON.stringify(tool.currentVersion.parameters)}\`\n`);
      }
      parts.push(`\n`);
    }
  }

  if (data.entries.guidelines.length > 0) {
    parts.push(`## Guidelines (${data.entries.guidelines.length})\n\n`);
    for (const guideline of data.entries.guidelines) {
      parts.push(`### ${guideline.name}\n\n`);
      parts.push(`- **ID:** \`${guideline.id}\`\n`);
      parts.push(
        `- **Scope:** ${guideline.scopeType}${guideline.scopeId ? ` / ${guideline.scopeId}` : ''}\n`
      );
      parts.push(`- **Priority:** ${guideline.priority}\n`);
      if (guideline.category) parts.push(`- **Category:** ${guideline.category}\n`);
      if (guideline.currentVersion?.content) {
        parts.push(`\n**Content:**\n\n${guideline.currentVersion.content}\n\n`);
      }
      if (guideline.currentVersion?.rationale) {
        parts.push(`**Rationale:** ${guideline.currentVersion.rationale}\n\n`);
      }
      if (guideline.tags.length > 0) {
        parts.push(`**Tags:** ${guideline.tags.map((t) => `\`${t}\``).join(', ')}\n\n`);
      }
    }
  }

  if (data.entries.knowledge.length > 0) {
    parts.push(`## Knowledge (${data.entries.knowledge.length})\n\n`);
    for (const know of data.entries.knowledge) {
      parts.push(`### ${know.title}\n\n`);
      parts.push(`- **ID:** \`${know.id}\`\n`);
      parts.push(`- **Scope:** ${know.scopeType}${know.scopeId ? ` / ${know.scopeId}` : ''}\n`);
      if (know.category) parts.push(`- **Category:** ${know.category}\n`);
      if (know.currentVersion?.content) {
        parts.push(`\n**Content:**\n\n${know.currentVersion.content}\n\n`);
      }
      if (know.currentVersion?.source) {
        parts.push(`**Source:** ${know.currentVersion.source}\n\n`);
      }
      if (know.tags.length > 0) {
        parts.push(`**Tags:** ${know.tags.map((t) => `\`${t}\``).join(', ')}\n\n`);
      }
    }
  }

  return {
    format: 'markdown',
    content: parts.join(''),
    metadata: {
      exportedAt: data.exportedAt,
      entryCount,
      types: data.metadata.types,
      scopeType: data.metadata.scopeType,
      scopeId: data.metadata.scopeId,
    },
  };
}

/**
 * Export entries to YAML format
 */
export function exportToYaml(options: ExportOptions, db: DbClient): ExportResult {
  const data = queryEntries(options, db);
  const entryCount =
    data.entries.tools.length + data.entries.guidelines.length + data.entries.knowledge.length;

  // Simple YAML serialization (without external dependencies)
  const yamlLines: string[] = [];
  yamlLines.push('# Agent Memory Export');
  yamlLines.push(`version: "${data.version}"`);
  yamlLines.push(`exportedAt: "${data.exportedAt}"`);
  yamlLines.push('');
  yamlLines.push('metadata:');
  yamlLines.push(`  types: [${data.metadata.types.map((t) => `"${t}"`).join(', ')}]`);
  if (data.metadata.scopeType) {
    yamlLines.push(`  scopeType: "${data.metadata.scopeType}"`);
    if (data.metadata.scopeId) {
      yamlLines.push(`  scopeId: "${data.metadata.scopeId}"`);
    }
  }
  yamlLines.push('');
  yamlLines.push('entries:');

  // Tools
  if (data.entries.tools.length > 0) {
    yamlLines.push('  tools:');
    for (const tool of data.entries.tools) {
      yamlLines.push(`    - id: "${tool.id}"`);
      yamlLines.push(`      name: "${tool.name}"`);
      yamlLines.push(`      scopeType: "${tool.scopeType}"`);
      yamlLines.push(`      scopeId: ${tool.scopeId ? `"${tool.scopeId}"` : 'null'}`);
      if (tool.category) yamlLines.push(`      category: "${tool.category}"`);
      if (tool.currentVersion?.description) {
        yamlLines.push(
          `      description: "${tool.currentVersion.description.replace(/"/g, '\\"')}"`
        );
      }
      if (tool.tags.length > 0) {
        yamlLines.push(`      tags: [${tool.tags.map((t) => `"${t}"`).join(', ')}]`);
      }
    }
  }

  // Guidelines
  if (data.entries.guidelines.length > 0) {
    yamlLines.push('  guidelines:');
    for (const guideline of data.entries.guidelines) {
      yamlLines.push(`    - id: "${guideline.id}"`);
      yamlLines.push(`      name: "${guideline.name}"`);
      yamlLines.push(`      scopeType: "${guideline.scopeType}"`);
      yamlLines.push(`      scopeId: ${guideline.scopeId ? `"${guideline.scopeId}"` : 'null'}`);
      yamlLines.push(`      priority: ${guideline.priority}`);
      if (guideline.category) yamlLines.push(`      category: "${guideline.category}"`);
      if (guideline.currentVersion?.content) {
        yamlLines.push(
          `      content: "${guideline.currentVersion.content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
        );
      }
      if (guideline.tags.length > 0) {
        yamlLines.push(`      tags: [${guideline.tags.map((t) => `"${t}"`).join(', ')}]`);
      }
    }
  }

  // Knowledge
  if (data.entries.knowledge.length > 0) {
    yamlLines.push('  knowledge:');
    for (const know of data.entries.knowledge) {
      yamlLines.push(`    - id: "${know.id}"`);
      yamlLines.push(`      title: "${know.title}"`);
      yamlLines.push(`      scopeType: "${know.scopeType}"`);
      yamlLines.push(`      scopeId: ${know.scopeId ? `"${know.scopeId}"` : 'null'}`);
      if (know.category) yamlLines.push(`      category: "${know.category}"`);
      if (know.currentVersion?.content) {
        yamlLines.push(
          `      content: "${know.currentVersion.content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
        );
      }
      if (know.tags.length > 0) {
        yamlLines.push(`      tags: [${know.tags.map((t) => `"${t}"`).join(', ')}]`);
      }
    }
  }

  return {
    format: 'yaml',
    content: yamlLines.join('\n'),
    metadata: {
      exportedAt: data.exportedAt,
      entryCount,
      types: data.metadata.types,
      scopeType: data.metadata.scopeType,
      scopeId: data.metadata.scopeId,
    },
  };
}

/**
 * Export tools to OpenAPI/Swagger format
 *
 * Converts tool definitions to OpenAPI 3.0 specification format.
 * Only exports tools (guidelines and knowledge are not applicable to OpenAPI).
 */
export function exportToOpenAPI(options: ExportOptions, db: DbClient): ExportResult {
  const data = queryEntries({ ...options, types: ['tools'] }, db); // Only tools for OpenAPI
  const entryCount = data.entries.tools.length;

  // Build OpenAPI 3.0 specification
  const openApiSpec: {
    openapi: string;
    info: {
      title: string;
      version: string;
      description?: string;
    };
    paths: Record<string, unknown>;
    components?: {
      schemas?: Record<string, unknown>;
    };
  } = {
    openapi: '3.0.0',
    info: {
      title: 'Agent Memory Tools',
      version: '1.0.0',
      description: `Exported from Agent Memory at ${data.exportedAt}`,
    },
    paths: {},
    components: {
      schemas: {},
    },
  };

  // Convert each tool to OpenAPI path/operation
  for (const tool of data.entries.tools) {
    if (!tool.currentVersion) continue;

    // Use tool name as path (sanitized)
    const path = `/${tool.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const operationId = tool.name.replace(/[^a-zA-Z0-9]/g, '_');

    // Build request body schema from parameters
    const requestBody: {
      description?: string;
      required?: boolean;
      content?: {
        'application/json': {
          schema: {
            type: string;
            properties?: Record<string, unknown>;
            required?: string[];
          };
        };
      };
    } = {};

    if (tool.currentVersion.parameters) {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, param] of Object.entries(tool.currentVersion.parameters)) {
        if (typeof param === 'object' && param !== null) {
          const paramObj = param as Record<string, unknown>;
          properties[key] = {
            type: paramObj.type || 'string',
            description: paramObj.description || '',
            ...(paramObj.default !== undefined && { default: paramObj.default }),
          };

          if (paramObj.required === true) {
            required.push(key);
          }
        } else {
          properties[key] = {
            type: 'string',
            description: '',
          };
        }
      }

      requestBody.description = tool.currentVersion.description || '';
      requestBody.content = {
        'application/json': {
          schema: {
            type: 'object',
            properties,
            ...(required.length > 0 && { required }),
          },
        },
      };
    }

    // Build response schema
    const responses: Record<string, unknown> = {
      '200': {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: tool.currentVersion.description || 'Tool response',
            },
          },
        },
      },
    };

    // Add operation to paths
    openApiSpec.paths[path] = {
      post: {
        operationId,
        summary: tool.name,
        description: tool.currentVersion.description || '',
        ...(Object.keys(requestBody).length > 0 && { requestBody }),
        responses,
        tags: tool.tags.length > 0 ? tool.tags : undefined,
      },
    };
  }

  return {
    format: 'openapi',
    content: JSON.stringify(openApiSpec, null, 2),
    metadata: {
      exportedAt: data.exportedAt,
      entryCount,
      types: ['tools'],
      scopeType: data.metadata.scopeType,
      scopeId: data.metadata.scopeId,
    },
  };
}
