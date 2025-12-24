/**
 * Import service for memory entries
 *
 * Supports importing entries from JSON, YAML, and Markdown formats
 */

import { config } from '../config/index.js';
import type {
  IToolRepository,
  CreateToolInput,
  UpdateToolInput,
  IGuidelineRepository,
  CreateGuidelineInput,
  UpdateGuidelineInput,
  IKnowledgeRepository,
  CreateKnowledgeInput,
  UpdateKnowledgeInput,
  ITagRepository,
  IEntryTagRepository,
} from '../core/interfaces/repositories.js';
import type { ScopeType } from '../db/schema.js';

// Security: Maximum import content size to prevent DoS attacks
const MAX_IMPORT_CONTENT_SIZE = config.validation.contentMaxLength * 10; // 10x content limit (~500KB default)

/**
 * Import service dependencies
 */
export interface ImportServiceDeps {
  toolRepo: IToolRepository;
  guidelineRepo: IGuidelineRepository;
  knowledgeRepo: IKnowledgeRepository;
  tagRepo: ITagRepository;
  entryTagRepo: IEntryTagRepository;
}

/**
 * Import service interface
 */
export interface ImportService {
  importFromJson(content: string, options?: ImportOptions): Promise<ImportResult>;
  importFromYaml(content: string, options?: ImportOptions): Promise<ImportResult>;
  importFromMarkdown(content: string, options?: ImportOptions): Promise<ImportResult>;
  importFromOpenAPI(content: string, options?: ImportOptions): Promise<ImportResult>;
}

/**
 * Create an import service with injected dependencies
 */
export function createImportService(deps: ImportServiceDeps): ImportService {
  return {
    async importFromJson(content: string, options: ImportOptions = {}): Promise<ImportResult> {
      return importFromJsonImpl(deps, content, options);
    },
    async importFromYaml(content: string, options: ImportOptions = {}): Promise<ImportResult> {
      return importFromYamlImpl(content, options);
    },
    async importFromMarkdown(content: string, options: ImportOptions = {}): Promise<ImportResult> {
      return importFromMarkdownImpl(content, options);
    },
    async importFromOpenAPI(content: string, options: ImportOptions = {}): Promise<ImportResult> {
      return importFromOpenAPIImpl(deps, content, options);
    },
  };
}

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

type ConflictStrategy = 'skip' | 'update' | 'replace' | 'error';

interface ImportContext {
  conflictStrategy: ConflictStrategy;
  importedBy?: string;
  mapScope: (scopeType: ScopeType, scopeId?: string | null) => { type: ScopeType; id?: string };
}

/**
 * Attach tags to an entry
 */
async function attachTagsToEntry(
  tagRepo: ITagRepository,
  entryTagRepo: IEntryTagRepository,
  entryType: 'tool' | 'guideline' | 'knowledge',
  entryId: string,
  tags?: string[]
): Promise<void> {
  if (!tags) return;
  for (const tagName of tags) {
    const tag = await tagRepo.getOrCreate(tagName);
    await entryTagRepo.attach({ entryType, entryId, tagId: tag.id });
  }
}

/**
 * Import a single tool entry
 */
async function importToolEntry(
  deps: ImportServiceDeps,
  toolData: ImportEntry,
  context: ImportContext
): Promise<{ status: 'created' | 'updated' | 'skipped' | 'error'; error?: string }> {
  if (!toolData.name) {
    return { status: 'error', error: 'Tool name is required' };
  }

  const scope = context.mapScope(toolData.scopeType, toolData.scopeId);
  const existing = await deps.toolRepo.getByName(toolData.name, scope.type, scope.id || undefined);

  if (existing) {
    if (context.conflictStrategy === 'skip') {
      return { status: 'skipped' };
    } else if (context.conflictStrategy === 'error') {
      return { status: 'error', error: 'Tool already exists' };
    } else {
      // Update existing
      const updateInput: UpdateToolInput = {
        description: toolData.currentVersion?.description,
        parameters: toolData.currentVersion?.parameters,
        examples: toolData.currentVersion?.examples,
        constraints: toolData.currentVersion?.constraints,
        changeReason: 'Imported update',
        updatedBy: context.importedBy,
      };
      await deps.toolRepo.update(existing.id, updateInput);
      await attachTagsToEntry(deps.tagRepo, deps.entryTagRepo, 'tool', existing.id, toolData.tags);
      return { status: 'updated' };
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
      createdBy: context.importedBy,
    };
    const created = await deps.toolRepo.create(createInput);
    await attachTagsToEntry(deps.tagRepo, deps.entryTagRepo, 'tool', created.id, toolData.tags);
    return { status: 'created' };
  }
}

/**
 * Import a single guideline entry
 */
async function importGuidelineEntry(
  deps: ImportServiceDeps,
  guidelineData: ImportEntry,
  context: ImportContext
): Promise<{ status: 'created' | 'updated' | 'skipped' | 'error'; error?: string }> {
  if (!guidelineData.name) {
    return { status: 'error', error: 'Guideline name is required' };
  }

  if (!guidelineData.currentVersion?.content) {
    return { status: 'error', error: 'Guideline content is required' };
  }

  const scope = context.mapScope(guidelineData.scopeType, guidelineData.scopeId);
  const existing = await deps.guidelineRepo.getByName(
    guidelineData.name,
    scope.type,
    scope.id || undefined
  );

  if (existing) {
    if (context.conflictStrategy === 'skip') {
      return { status: 'skipped' };
    } else if (context.conflictStrategy === 'error') {
      return { status: 'error', error: 'Guideline already exists' };
    } else {
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
        updatedBy: context.importedBy,
      };
      await deps.guidelineRepo.update(existing.id, updateInput);
      await attachTagsToEntry(
        deps.tagRepo,
        deps.entryTagRepo,
        'guideline',
        existing.id,
        guidelineData.tags
      );
      return { status: 'updated' };
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
      createdBy: context.importedBy,
    };
    const created = await deps.guidelineRepo.create(createInput);
    await attachTagsToEntry(
      deps.tagRepo,
      deps.entryTagRepo,
      'guideline',
      created.id,
      guidelineData.tags
    );
    return { status: 'created' };
  }
}

/**
 * Import a single knowledge entry
 */
async function importKnowledgeEntry(
  deps: ImportServiceDeps,
  knowledgeData: ImportEntry,
  context: ImportContext
): Promise<{ status: 'created' | 'updated' | 'skipped' | 'error'; error?: string }> {
  if (!knowledgeData.title) {
    return { status: 'error', error: 'Knowledge title is required' };
  }

  if (!knowledgeData.currentVersion?.content) {
    return { status: 'error', error: 'Knowledge content is required' };
  }

  const scope = context.mapScope(knowledgeData.scopeType, knowledgeData.scopeId);
  const existing = await deps.knowledgeRepo.getByTitle(
    knowledgeData.title,
    scope.type,
    scope.id || undefined
  );

  if (existing) {
    if (context.conflictStrategy === 'skip') {
      return { status: 'skipped' };
    } else if (context.conflictStrategy === 'error') {
      return { status: 'error', error: 'Knowledge entry already exists' };
    } else {
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
        updatedBy: context.importedBy,
      };
      await deps.knowledgeRepo.update(existing.id, updateInput);
      await attachTagsToEntry(
        deps.tagRepo,
        deps.entryTagRepo,
        'knowledge',
        existing.id,
        knowledgeData.tags
      );
      return { status: 'updated' };
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
      createdBy: context.importedBy,
    };
    const created = await deps.knowledgeRepo.create(createInput);
    await attachTagsToEntry(
      deps.tagRepo,
      deps.entryTagRepo,
      'knowledge',
      created.id,
      knowledgeData.tags
    );
    return { status: 'created' };
  }
}

/**
 * Process import result and update counters
 */
function processImportResult(
  importResult: { status: 'created' | 'updated' | 'skipped' | 'error'; error?: string },
  entryName: string,
  result: ImportResult,
  detailKey: 'tools' | 'guidelines' | 'knowledge'
): void {
  switch (importResult.status) {
    case 'created':
      result.created++;
      result.details[detailKey].created++;
      break;
    case 'updated':
      result.updated++;
      result.details[detailKey].updated++;
      break;
    case 'skipped':
      result.skipped++;
      result.details[detailKey].skipped++;
      break;
    case 'error':
      result.errors.push({ entry: entryName, error: importResult.error || 'Unknown error' });
      break;
  }
}

/**
 * Import from JSON format (implementation)
 */
async function importFromJsonImpl(
  deps: ImportServiceDeps,
  content: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
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

  // Security: Limit import content size to prevent DoS
  if (content.length > MAX_IMPORT_CONTENT_SIZE) {
    result.success = false;
    result.errors.push({
      entry: 'import',
      error: `Import content exceeds maximum size of ${MAX_IMPORT_CONTENT_SIZE} bytes (got ${content.length})`,
    });
    return result;
  }

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

  // Create import context
  const context: ImportContext = {
    conflictStrategy: options.conflictStrategy || 'update',
    importedBy: options.importedBy,
    mapScope: (scopeType: ScopeType, scopeId?: string | null) => {
      if (options.scopeMapping) {
        const key = `${scopeType}:${scopeId || ''}`;
        const mapped = options.scopeMapping[key];
        if (mapped) {
          return { type: mapped.type, id: mapped.id };
        }
      }
      return { type: scopeType, id: scopeId ?? undefined };
    },
  };

  // Import tools
  if (data.entries.tools) {
    for (const toolData of data.entries.tools) {
      try {
        const importResult = await importToolEntry(deps, toolData, context);
        processImportResult(
          importResult,
          toolData.name || toolData.id || 'unknown',
          result,
          'tools'
        );
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
        const importResult = await importGuidelineEntry(deps, guidelineData, context);
        processImportResult(
          importResult,
          guidelineData.name || guidelineData.id || 'unknown',
          result,
          'guidelines'
        );
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
        const importResult = await importKnowledgeEntry(deps, knowledgeData, context);
        processImportResult(
          importResult,
          knowledgeData.title || knowledgeData.id || 'unknown',
          result,
          'knowledge'
        );
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
 * Import from YAML format (implementation)
 */
function importFromYamlImpl(_content: string, _options: ImportOptions = {}): ImportResult {
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
 * Import from Markdown format (implementation)
 */
function importFromMarkdownImpl(_content: string, _options: ImportOptions = {}): ImportResult {
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
 * Import from OpenAPI/Swagger format (implementation)
 *
 * Converts OpenAPI 3.0 specification to tool definitions.
 */
async function importFromOpenAPIImpl(
  deps: ImportServiceDeps,
  content: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
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

  // Security: Limit import content size to prevent DoS
  if (content.length > MAX_IMPORT_CONTENT_SIZE) {
    result.success = false;
    result.errors.push({
      entry: 'import',
      error: `Import content exceeds maximum size of ${MAX_IMPORT_CONTENT_SIZE} bytes (got ${content.length})`,
    });
    return result;
  }

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
        const existing = await deps.toolRepo.getByName(toolName, defaultScopeType, defaultScopeId);

        if (existing) {
          if (conflictStrategy === 'skip') {
            result.skipped++;
            result.details.tools.skipped++;
            continue;
          } else if (conflictStrategy === 'error') {
            result.errors.push({ entry: toolName, error: 'Tool already exists' });
            continue;
          } else {
            // Update existing
            const updateInput: UpdateToolInput = {
              description: op.description || op.summary || '',
              parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
              changeReason: 'Imported from OpenAPI',
              updatedBy: options.importedBy,
            };
            await deps.toolRepo.update(existing.id, updateInput);
            await attachTagsToEntry(deps.tagRepo, deps.entryTagRepo, 'tool', existing.id, op.tags);
            result.updated++;
            result.details.tools.updated++;
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
          const created = await deps.toolRepo.create(createInput);
          await attachTagsToEntry(deps.tagRepo, deps.entryTagRepo, 'tool', created.id, op.tags);
          result.created++;
          result.details.tools.created++;
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
