/**
 * Import service for memory entries
 *
 * Supports importing entries from JSON, YAML, and Markdown formats
 */

import { toolRepo, type CreateToolInput, type UpdateToolInput } from '../db/repositories/tools.js';
import {
  guidelineRepo,
  type CreateGuidelineInput,
  type UpdateGuidelineInput,
} from '../db/repositories/guidelines.js';
import {
  knowledgeRepo,
  type CreateKnowledgeInput,
  type UpdateKnowledgeInput,
} from '../db/repositories/knowledge.js';
import { entryTagRepo, tagRepo } from '../db/repositories/tags.js';
import type { ScopeType } from '../db/schema.js';

export interface ImportOptions {
  conflictStrategy?: 'skip' | 'update' | 'replace' | 'error';
  scopeMapping?: Record<string, { type: ScopeType; id?: string }>;
  generateNewIds?: boolean;
  importedBy?: string;
}

export interface ImportResult {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ entry: string; error: string }>;
  details: {
    tools: { created: number; updated: number; skipped: number };
    guidelines: { created: number; updated: number; skipped: number };
    knowledge: { created: number; updated: number; skipped: number };
  };
}

interface ImportEntry {
  id?: string;
  scopeType: ScopeType;
  scopeId?: string | null;
  name?: string;
  title?: string;
  category?: string | null;
  priority?: number;
  isActive?: boolean;
  currentVersion?: {
    description?: string;
    content?: string;
    rationale?: string;
    source?: string;
    parameters?: Record<string, unknown>;
    examples?: Array<Record<string, unknown>>;
    constraints?: string;
    confidence?: number;
    validUntil?: string;
  };
  tags?: string[];
  relations?: Array<{
    targetType: string;
    targetId: string;
    relationType: string;
  }>;
}

interface ImportData {
  version?: string;
  exportedAt?: string;
  metadata?: {
    types?: string[];
    scopeType?: ScopeType;
    scopeId?: string;
  };
  entries: {
    tools?: ImportEntry[];
    guidelines?: ImportEntry[];
    knowledge?: ImportEntry[];
  };
}

/**
 * Import from JSON format
 */
export function importFromJson(content: string, options: ImportOptions = {}): ImportResult {
  const conflictStrategy = options.conflictStrategy || 'update';
  const result: ImportResult = {
    success: true,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    details: {
      tools: { created: 0, updated: 0, skipped: 0 },
      guidelines: { created: 0, updated: 0, skipped: 0 },
      knowledge: { created: 0, updated: 0, skipped: 0 },
    },
  };

  let data: ImportData;
  try {
    data = JSON.parse(content) as ImportData;
  } catch (error) {
    result.success = false;
    result.errors.push({
      entry: 'parsing',
      error: error instanceof Error ? error.message : 'Invalid JSON',
    });
    return result;
  }

  // Validate structure
  if (!data.entries) {
    result.success = false;
    result.errors.push({ entry: 'structure', error: 'Missing entries object' });
    return result;
  }

  // Apply scope mapping if provided
  const mapScope = (scopeType: ScopeType, scopeId?: string | null) => {
    if (options.scopeMapping) {
      const key = `${scopeType}:${scopeId || ''}`;
      const mapped = options.scopeMapping[key];
      if (mapped) {
        return { type: mapped.type, id: mapped.id };
      }
    }
    return { type: scopeType, id: scopeId };
  };

  // Import tools
  if (data.entries.tools) {
    for (const toolData of data.entries.tools) {
      try {
        if (!toolData.name) {
          result.errors.push({ entry: toolData.id || 'unknown', error: 'Tool name is required' });
          continue;
        }

        const scope = mapScope(toolData.scopeType, toolData.scopeId);

        // Check if exists
        const existing = toolRepo.getByName(toolData.name, scope.type, scope.id || undefined);

        if (existing) {
          if (conflictStrategy === 'skip') {
            result.skipped++;
            result.details.tools.skipped++;
            continue;
          } else if (conflictStrategy === 'error') {
            result.errors.push({
              entry: toolData.name,
              error: 'Tool already exists',
            });
            continue;
          } else if (conflictStrategy === 'update' || conflictStrategy === 'replace') {
            // Update existing
            const updateInput: UpdateToolInput = {
              description: toolData.currentVersion?.description,
              parameters: toolData.currentVersion?.parameters,
              examples: toolData.currentVersion?.examples,
              constraints: toolData.currentVersion?.constraints,
              changeReason: 'Imported update',
              updatedBy: options.importedBy,
            };
            toolRepo.update(existing.id, updateInput);
            result.updated++;
            result.details.tools.updated++;

            // Update tags
            if (toolData.tags) {
              for (const tagName of toolData.tags) {
                const tag = tagRepo.getOrCreate(tagName);
                entryTagRepo.attach({
                  entryType: 'tool',
                  entryId: existing.id,
                  tagId: tag.id,
                });
              }
            }
          }
        } else {
          // Create new
          const createInput: CreateToolInput = {
            scopeType: scope.type,
            scopeId: scope.id || undefined,
            name: toolData.name,
            category: toolData.category
              ? (toolData.category as 'mcp' | 'cli' | 'function' | 'api')
              : undefined,
            description: toolData.currentVersion?.description,
            parameters: toolData.currentVersion?.parameters,
            examples: toolData.currentVersion?.examples,
            constraints: toolData.currentVersion?.constraints,
            createdBy: options.importedBy,
          };
          const created = toolRepo.create(createInput);
          result.created++;
          result.details.tools.created++;

          // Attach tags
          if (toolData.tags) {
            for (const tagName of toolData.tags) {
              const tag = tagRepo.getOrCreate(tagName);
              entryTagRepo.attach({
                entryType: 'tool',
                entryId: created.id,
                tagId: tag.id,
              });
            }
          }
        }
      } catch (error) {
        result.errors.push({
          entry: toolData.name || toolData.id || 'unknown',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // Import guidelines
  if (data.entries.guidelines) {
    for (const guidelineData of data.entries.guidelines) {
      try {
        if (!guidelineData.name) {
          result.errors.push({
            entry: guidelineData.id || 'unknown',
            error: 'Guideline name is required',
          });
          continue;
        }

        if (!guidelineData.currentVersion?.content) {
          result.errors.push({
            entry: guidelineData.name,
            error: 'Guideline content is required',
          });
          continue;
        }

        const scope = mapScope(guidelineData.scopeType, guidelineData.scopeId);

        // Check if exists
        const existing = guidelineRepo.getByName(
          guidelineData.name,
          scope.type,
          scope.id || undefined
        );

        if (existing) {
          if (conflictStrategy === 'skip') {
            result.skipped++;
            result.details.guidelines.skipped++;
            continue;
          } else if (conflictStrategy === 'error') {
            result.errors.push({
              entry: guidelineData.name,
              error: 'Guideline already exists',
            });
            continue;
          } else if (conflictStrategy === 'update' || conflictStrategy === 'replace') {
            // Update existing
            const updateInput: UpdateGuidelineInput = {
              category: guidelineData.category || undefined,
              priority: guidelineData.priority,
              content: guidelineData.currentVersion.content,
              rationale: guidelineData.currentVersion.rationale,
              examples: guidelineData.currentVersion.examples as
                | { bad?: string[]; good?: string[] }
                | undefined,
              changeReason: 'Imported update',
              updatedBy: options.importedBy,
            };
            guidelineRepo.update(existing.id, updateInput);
            result.updated++;
            result.details.guidelines.updated++;

            // Update tags
            if (guidelineData.tags) {
              for (const tagName of guidelineData.tags) {
                const tag = tagRepo.getOrCreate(tagName);
                entryTagRepo.attach({
                  entryType: 'guideline',
                  entryId: existing.id,
                  tagId: tag.id,
                });
              }
            }
          }
        } else {
          // Create new
          const createInput: CreateGuidelineInput = {
            scopeType: scope.type,
            scopeId: scope.id || undefined,
            name: guidelineData.name,
            category: guidelineData.category || undefined,
            priority: guidelineData.priority || 50,
            content: guidelineData.currentVersion.content,
            rationale: guidelineData.currentVersion.rationale,
            examples: guidelineData.currentVersion.examples as
              | { bad?: string[]; good?: string[] }
              | undefined,
            createdBy: options.importedBy,
          };
          const created = guidelineRepo.create(createInput);
          result.created++;
          result.details.guidelines.created++;

          // Attach tags
          if (guidelineData.tags) {
            for (const tagName of guidelineData.tags) {
              const tag = tagRepo.getOrCreate(tagName);
              entryTagRepo.attach({
                entryType: 'guideline',
                entryId: created.id,
                tagId: tag.id,
              });
            }
          }
        }
      } catch (error) {
        result.errors.push({
          entry: guidelineData.name || guidelineData.id || 'unknown',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // Import knowledge
  if (data.entries.knowledge) {
    for (const knowledgeData of data.entries.knowledge) {
      try {
        if (!knowledgeData.title) {
          result.errors.push({
            entry: knowledgeData.id || 'unknown',
            error: 'Knowledge title is required',
          });
          continue;
        }

        if (!knowledgeData.currentVersion?.content) {
          result.errors.push({
            entry: knowledgeData.title,
            error: 'Knowledge content is required',
          });
          continue;
        }

        const scope = mapScope(knowledgeData.scopeType, knowledgeData.scopeId);

        // Check if exists
        const existing = knowledgeRepo.getByTitle(
          knowledgeData.title,
          scope.type,
          scope.id || undefined
        );

        if (existing) {
          if (conflictStrategy === 'skip') {
            result.skipped++;
            result.details.knowledge.skipped++;
            continue;
          } else if (conflictStrategy === 'error') {
            result.errors.push({
              entry: knowledgeData.title,
              error: 'Knowledge entry already exists',
            });
            continue;
          } else if (conflictStrategy === 'update' || conflictStrategy === 'replace') {
            // Update existing
            const updateInput: UpdateKnowledgeInput = {
              category: knowledgeData.category
                ? (knowledgeData.category as 'decision' | 'fact' | 'context' | 'reference')
                : undefined,
              content: knowledgeData.currentVersion.content,
              source: knowledgeData.currentVersion.source || undefined,
              confidence: knowledgeData.currentVersion.confidence,
              validUntil: knowledgeData.currentVersion.validUntil || undefined,
              changeReason: 'Imported update',
              updatedBy: options.importedBy,
            };
            knowledgeRepo.update(existing.id, updateInput);
            result.updated++;
            result.details.knowledge.updated++;

            // Update tags
            if (knowledgeData.tags) {
              for (const tagName of knowledgeData.tags) {
                const tag = tagRepo.getOrCreate(tagName);
                entryTagRepo.attach({
                  entryType: 'knowledge',
                  entryId: existing.id,
                  tagId: tag.id,
                });
              }
            }
          }
        } else {
          // Create new
          const createInput: CreateKnowledgeInput = {
            scopeType: scope.type,
            scopeId: scope.id || undefined,
            title: knowledgeData.title,
            category: knowledgeData.category
              ? (knowledgeData.category as 'decision' | 'fact' | 'context' | 'reference')
              : undefined,
            content: knowledgeData.currentVersion.content,
            source: knowledgeData.currentVersion.source || undefined,
            confidence: knowledgeData.currentVersion.confidence,
            validUntil: knowledgeData.currentVersion.validUntil,
            createdBy: options.importedBy,
          };
          const created = knowledgeRepo.create(createInput);
          result.created++;
          result.details.knowledge.created++;

          // Attach tags
          if (knowledgeData.tags) {
            for (const tagName of knowledgeData.tags) {
              const tag = tagRepo.getOrCreate(tagName);
              entryTagRepo.attach({
                entryType: 'knowledge',
                entryId: created.id,
                tagId: tag.id,
              });
            }
          }
        }
      } catch (error) {
        result.errors.push({
          entry: knowledgeData.title || knowledgeData.id || 'unknown',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return result;
}

/**
 * Import from YAML format
 */
export function importFromYaml(_content: string, _options: ImportOptions = {}): ImportResult {
  // For now, YAML import returns an error suggesting JSON
  // Full YAML parsing would require a library or more robust implementation
  return {
    success: false,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [
      {
        entry: 'import',
        error: 'YAML import not fully implemented. Please use JSON format for import.',
      },
    ],
    details: {
      tools: { created: 0, updated: 0, skipped: 0 },
      guidelines: { created: 0, updated: 0, skipped: 0 },
      knowledge: { created: 0, updated: 0, skipped: 0 },
    },
  };
}

/**
 * Import from Markdown format (limited support)
 */
export function importFromMarkdown(_content: string, _options: ImportOptions = {}): ImportResult {
  // Markdown import is not supported for now
  // Markdown is primarily an export format for human readability
  return {
    success: false,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [
      {
        entry: 'import',
        error:
          'Markdown import not supported. Markdown is for human-readable exports only. Please use JSON format for import.',
      },
    ],
    details: {
      tools: { created: 0, updated: 0, skipped: 0 },
      guidelines: { created: 0, updated: 0, skipped: 0 },
      knowledge: { created: 0, updated: 0, skipped: 0 },
    },
  };
}

/**
 * Import from OpenAPI/Swagger format
 *
 * Converts OpenAPI 3.0 specification to tool definitions.
 */
export function importFromOpenAPI(content: string, options: ImportOptions = {}): ImportResult {
  const conflictStrategy = options.conflictStrategy || 'update';
  const result: ImportResult = {
    success: true,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    details: {
      tools: { created: 0, updated: 0, skipped: 0 },
      guidelines: { created: 0, updated: 0, skipped: 0 },
      knowledge: { created: 0, updated: 0, skipped: 0 },
    },
  };

  let openApiSpec: {
    openapi?: string;
    swagger?: string;
    info?: { title?: string; version?: string };
    paths?: Record<string, Record<string, unknown>>;
  };

  try {
    openApiSpec = JSON.parse(content) as typeof openApiSpec;
  } catch (error) {
    result.success = false;
    result.errors.push({
      entry: 'parsing',
      error: error instanceof Error ? error.message : 'Invalid JSON',
    });
    return result;
  }

  // Validate OpenAPI structure
  if (!openApiSpec.paths) {
    result.success = false;
    result.errors.push({ entry: 'structure', error: 'Missing paths object in OpenAPI spec' });
    return result;
  }

  // Default scope (can be overridden by options)
  const defaultScopeType: ScopeType = 'global';
  const defaultScopeId: string | undefined = undefined;

  // Convert each path/operation to a tool
  for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
    if (typeof pathItem !== 'object' || pathItem === null) continue;

    // Process each HTTP method (post, get, put, delete, etc.)
    for (const [_method, operation] of Object.entries(pathItem)) {
      if (typeof operation !== 'object' || operation === null) continue;

      const op = operation as {
        operationId?: string;
        summary?: string;
        description?: string;
        requestBody?: {
          content?: {
            'application/json'?: {
              schema?: {
                type?: string;
                properties?: Record<string, unknown>;
                required?: string[];
              };
            };
          };
        };
        parameters?: Array<{
          name: string;
          in: string;
          schema?: { type?: string; description?: string };
          required?: boolean;
        }>;
        tags?: string[];
      };

      try {
        // Extract tool name from operationId or summary or path
        const toolName =
          op.operationId || op.summary || path.replace(/^\//, '').replace(/[^a-zA-Z0-9]/g, '_');

        if (!toolName) {
          result.errors.push({
            entry: path,
            error: 'Cannot determine tool name from OpenAPI operation',
          });
          continue;
        }

        // Extract parameters from requestBody or parameters
        const parameters: Record<string, unknown> = {};

        if (op.requestBody?.content?.['application/json']?.schema?.properties) {
          const schema = op.requestBody.content['application/json'].schema;
          if (schema.properties) {
            for (const [key, prop] of Object.entries(schema.properties)) {
              if (typeof prop === 'object' && prop !== null) {
                const propObj = prop as Record<string, unknown>;
                parameters[key] = {
                  type: propObj.type || 'string',
                  description: propObj.description || '',
                  required: schema.required?.includes(key) || false,
                  ...(propObj.default !== undefined && { default: propObj.default }),
                };
              }
            }
          }
        } else if (op.parameters) {
          // Use parameters array
          for (const param of op.parameters) {
            if (param.in === 'body' || param.in === 'query' || param.in === 'path') {
              parameters[param.name] = {
                type: param.schema?.type || 'string',
                description: param.schema?.description || '',
                required: param.required || false,
              };
            }
          }
        }

        // Check if tool exists
        const existing = toolRepo.getByName(toolName, defaultScopeType, defaultScopeId);

        if (existing) {
          if (conflictStrategy === 'skip') {
            result.skipped++;
            result.details.tools.skipped++;
            continue;
          } else if (conflictStrategy === 'error') {
            result.errors.push({
              entry: toolName,
              error: 'Tool already exists',
            });
            continue;
          } else if (conflictStrategy === 'update' || conflictStrategy === 'replace') {
            // Update existing
            const updateInput: UpdateToolInput = {
              description: op.description || op.summary || '',
              parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
              changeReason: 'Imported from OpenAPI',
              updatedBy: options.importedBy,
            };
            toolRepo.update(existing.id, updateInput);
            result.updated++;
            result.details.tools.updated++;

            // Update tags
            if (op.tags) {
              for (const tagName of op.tags) {
                const tag = tagRepo.getOrCreate(tagName);
                entryTagRepo.attach({
                  entryType: 'tool',
                  entryId: existing.id,
                  tagId: tag.id,
                });
              }
            }
          }
        } else {
          // Create new tool
          const createInput: CreateToolInput = {
            scopeType: defaultScopeType,
            scopeId: defaultScopeId,
            name: toolName,
            category: 'api',
            description: op.description || op.summary || '',
            parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
            createdBy: options.importedBy,
          };
          const created = toolRepo.create(createInput);
          result.created++;
          result.details.tools.created++;

          // Attach tags
          if (op.tags) {
            for (const tagName of op.tags) {
              const tag = tagRepo.getOrCreate(tagName);
              entryTagRepo.attach({
                entryType: 'tool',
                entryId: created.id,
                tagId: tag.id,
              });
            }
          }
        }
      } catch (error) {
        result.errors.push({
          entry: path,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return result;
}







