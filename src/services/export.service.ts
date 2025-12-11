/**
 * Export service for memory entries
 *
 * Supports exporting entries to JSON, Markdown, and YAML formats
 */

import { getDb } from '../db/connection.js';
import {
  tools,
  guidelines,
  knowledge,
  toolVersions,
  guidelineVersions,
  knowledgeVersions,
  type ToolVersion,
  type GuidelineVersion,
  type KnowledgeVersion,
  type ScopeType,
} from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { entryTagRepo, entryRelationRepo } from '../db/repositories/tags.js';

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
 * Query and structure entries for export
 */
function queryEntries(options: ExportOptions): ExportData {
  const db = getDb();
  const types = options.types || ['tools', 'guidelines', 'knowledge'];
  const entries: ExportData['entries'] = {
    tools: [],
    guidelines: [],
    knowledge: [],
  };

  // Export tools
  if (types.includes('tools')) {
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

    const toolList = query.all();

    for (const tool of toolList) {
      const versions = db.select().from(toolVersions).where(eq(toolVersions.toolId, tool.id)).all();

      const currentVersion = versions.find((v) => v.id === tool.currentVersionId);
      const entryTags = entryTagRepo.getTagsForEntry('tool', tool.id);
      const relations = entryRelationRepo.list({
        sourceType: 'tool',
        sourceId: tool.id,
      });

      // Filter by tags if specified
      if (options.tags && options.tags.length > 0) {
        const tagNames = entryTags.map((t) => t.name.toLowerCase());
        const hasRequiredTag = options.tags.some((tag) => tagNames.includes(tag.toLowerCase()));
        if (!hasRequiredTag) continue;
      }

      entries.tools.push({
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
        tags: entryTags.map((t) => t.name),
        relations: relations.map((r) => ({
          targetType: r.targetType,
          targetId: r.targetId,
          relationType: r.relationType,
        })),
      });
    }
  }

  // Export guidelines
  if (types.includes('guidelines')) {
    const conditions = [];

    if (options.scopeType) {
      if (options.scopeId === null || options.scopeId === undefined) {
        conditions.push(
          and(eq(guidelines.scopeType, options.scopeType), isNull(guidelines.scopeId))
        );
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

    const guidelineList = query.all();

    for (const guideline of guidelineList) {
      const versions = db
        .select()
        .from(guidelineVersions)
        .where(eq(guidelineVersions.guidelineId, guideline.id))
        .all();

      const currentVersion = versions.find((v) => v.id === guideline.currentVersionId);
      const entryTags = entryTagRepo.getTagsForEntry('guideline', guideline.id);
      const relations = entryRelationRepo.list({
        sourceType: 'guideline',
        sourceId: guideline.id,
      });

      // Filter by tags if specified
      if (options.tags && options.tags.length > 0) {
        const tagNames = entryTags.map((t) => t.name.toLowerCase());
        const hasRequiredTag = options.tags.some((tag) => tagNames.includes(tag.toLowerCase()));
        if (!hasRequiredTag) continue;
      }

      entries.guidelines.push({
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
        tags: entryTags.map((t) => t.name),
        relations: relations.map((r) => ({
          targetType: r.targetType,
          targetId: r.targetId,
          relationType: r.relationType,
        })),
      });
    }
  }

  // Export knowledge
  if (types.includes('knowledge')) {
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

    const knowledgeList = query.all();

    for (const know of knowledgeList) {
      const versions = db
        .select()
        .from(knowledgeVersions)
        .where(eq(knowledgeVersions.knowledgeId, know.id))
        .all();

      const currentVersion = versions.find((v) => v.id === know.currentVersionId);
      const entryTags = entryTagRepo.getTagsForEntry('knowledge', know.id);
      const relations = entryRelationRepo.list({
        sourceType: 'knowledge',
        sourceId: know.id,
      });

      // Filter by tags if specified
      if (options.tags && options.tags.length > 0) {
        const tagNames = entryTags.map((t) => t.name.toLowerCase());
        const hasRequiredTag = options.tags.some((tag) => tagNames.includes(tag.toLowerCase()));
        if (!hasRequiredTag) continue;
      }

      entries.knowledge.push({
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
        tags: entryTags.map((t) => t.name),
        relations: relations.map((r) => ({
          targetType: r.targetType,
          targetId: r.targetId,
          relationType: r.relationType,
        })),
      });
    }
  }

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    metadata: {
      types,
      scopeType: options.scopeType,
      scopeId: options.scopeId,
    },
    entries,
  };
}

/**
 * Export entries to JSON format
 */
export function exportToJson(options: ExportOptions = {}): ExportResult {
  const data = queryEntries(options);
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
 * Export entries to Markdown format
 */
export function exportToMarkdown(options: ExportOptions = {}): ExportResult {
  const data = queryEntries(options);
  let markdown = `# Agent Memory Export\n\n`;
  markdown += `**Exported:** ${data.exportedAt}\n`;

  const entryCount =
    data.entries.tools.length + data.entries.guidelines.length + data.entries.knowledge.length;
  markdown += `**Entries:** ${entryCount}\n`;

  if (data.metadata.scopeType) {
    markdown += `**Scope:** ${data.metadata.scopeType}${data.metadata.scopeId ? ` / ${data.metadata.scopeId}` : ''}\n`;
  }
  markdown += `\n`;

  if (data.entries.tools.length > 0) {
    markdown += `## Tools (${data.entries.tools.length})\n\n`;
    for (const tool of data.entries.tools) {
      markdown += `### ${tool.name}\n\n`;
      markdown += `- **ID:** \`${tool.id}\`\n`;
      markdown += `- **Scope:** ${tool.scopeType}${tool.scopeId ? ` / ${tool.scopeId}` : ''}\n`;
      if (tool.category) markdown += `- **Category:** ${tool.category}\n`;
      if (tool.currentVersion?.description) {
        markdown += `- **Description:** ${tool.currentVersion.description}\n`;
      }
      if (tool.tags.length > 0) {
        markdown += `- **Tags:** ${tool.tags.map((t) => `\`${t}\``).join(', ')}\n`;
      }
      if (tool.currentVersion?.parameters) {
        markdown += `- **Parameters:** \`${JSON.stringify(tool.currentVersion.parameters)}\`\n`;
      }
      markdown += `\n`;
    }
  }

  if (data.entries.guidelines.length > 0) {
    markdown += `## Guidelines (${data.entries.guidelines.length})\n\n`;
    for (const guideline of data.entries.guidelines) {
      markdown += `### ${guideline.name}\n\n`;
      markdown += `- **ID:** \`${guideline.id}\`\n`;
      markdown += `- **Scope:** ${guideline.scopeType}${guideline.scopeId ? ` / ${guideline.scopeId}` : ''}\n`;
      markdown += `- **Priority:** ${guideline.priority}\n`;
      if (guideline.category) markdown += `- **Category:** ${guideline.category}\n`;
      if (guideline.currentVersion?.content) {
        markdown += `\n**Content:**\n\n${guideline.currentVersion.content}\n\n`;
      }
      if (guideline.currentVersion?.rationale) {
        markdown += `**Rationale:** ${guideline.currentVersion.rationale}\n\n`;
      }
      if (guideline.tags.length > 0) {
        markdown += `**Tags:** ${guideline.tags.map((t) => `\`${t}\``).join(', ')}\n\n`;
      }
    }
  }

  if (data.entries.knowledge.length > 0) {
    markdown += `## Knowledge (${data.entries.knowledge.length})\n\n`;
    for (const know of data.entries.knowledge) {
      markdown += `### ${know.title}\n\n`;
      markdown += `- **ID:** \`${know.id}\`\n`;
      markdown += `- **Scope:** ${know.scopeType}${know.scopeId ? ` / ${know.scopeId}` : ''}\n`;
      if (know.category) markdown += `- **Category:** ${know.category}\n`;
      if (know.currentVersion?.content) {
        markdown += `\n**Content:**\n\n${know.currentVersion.content}\n\n`;
      }
      if (know.currentVersion?.source) {
        markdown += `**Source:** ${know.currentVersion.source}\n\n`;
      }
      if (know.tags.length > 0) {
        markdown += `**Tags:** ${know.tags.map((t) => `\`${t}\``).join(', ')}\n\n`;
      }
    }
  }

  return {
    format: 'markdown',
    content: markdown,
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
export function exportToYaml(options: ExportOptions = {}): ExportResult {
  const data = queryEntries(options);
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
export function exportToOpenAPI(options: ExportOptions = {}): ExportResult {
  const data = queryEntries({ ...options, types: ['tools'] }); // Only tools for OpenAPI
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





