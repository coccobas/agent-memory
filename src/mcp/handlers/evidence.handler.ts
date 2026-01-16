/**
 * Evidence handlers
 *
 * Handlers for immutable evidence artifacts.
 * Evidence is IMMUTABLE - no update action is provided.
 * Only creation, reading, and deactivation (soft-delete) are allowed.
 */

import type { EvidenceType } from '../../db/schema/evidence.js';
import type { ScopeType } from '../../db/schema.js';
import type { AppContext } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isBoolean,
  isScopeType,
  isArray,
  isObject,
  isArrayOfStrings,
} from '../../utils/type-guards.js';
import {
  createValidationError,
  createNotFoundError,
  createPermissionError,
} from '../../core/errors.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { logAction } from '../../services/audit.service.js';

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard for evidence types
 */
function isEvidenceType(value: unknown): value is EvidenceType {
  return (
    isString(value) &&
    [
      'screenshot',
      'log',
      'snippet',
      'output',
      'benchmark',
      'link',
      'document',
      'quote',
      'other',
    ].includes(value)
  );
}

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Input for creating evidence
 */
export interface CreateEvidenceInput {
  scopeType: ScopeType;
  scopeId?: string;
  title: string;
  description?: string;
  evidenceType: EvidenceType;

  // Content sources (one required)
  content?: string;
  filePath?: string;
  url?: string;

  // File metadata
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  checksum?: string;

  // Snippet fields
  language?: string;
  sourceFile?: string;
  startLine?: number;
  endLine?: number;

  // Benchmark fields
  metric?: string;
  value?: number;
  unit?: string;
  baseline?: number;

  // Provenance
  source?: string;
  capturedAt: string;
  capturedBy?: string;

  // Flexible storage
  tags?: string[];
  metadata?: Record<string, unknown>;

  createdBy?: string;
}

/**
 * Evidence record from repository
 */
export interface Evidence {
  id: string;
  scopeType: ScopeType;
  scopeId: string | null;
  title: string;
  description: string | null;
  evidenceType: EvidenceType;
  content: string | null;
  filePath: string | null;
  url: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  checksum: string | null;
  language: string | null;
  sourceFile: string | null;
  startLine: number | null;
  endLine: number | null;
  metric: string | null;
  value: number | null;
  unit: string | null;
  baseline: number | null;
  source: string | null;
  capturedAt: string;
  capturedBy: string | null;
  tags: string | null;
  metadata: string | null;
  createdAt: string;
  createdBy: string | null;
  isActive: boolean;
}

/**
 * List filter for evidence
 */
export interface ListEvidenceFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  evidenceType?: EvidenceType;
  source?: string;
  includeInactive?: boolean;
  inherit?: boolean;
}

/**
 * Evidence repository interface
 */
export interface IEvidenceRepository {
  create(input: CreateEvidenceInput): Promise<Evidence>;
  getById(id: string): Promise<Evidence | undefined>;
  list(
    filter?: ListEvidenceFilter,
    options?: { limit?: number; offset?: number }
  ): Promise<Evidence[]>;
  listByType(
    evidenceType: EvidenceType,
    filter?: ListEvidenceFilter,
    options?: { limit?: number; offset?: number }
  ): Promise<Evidence[]>;
  listBySource(
    source: string,
    filter?: ListEvidenceFilter,
    options?: { limit?: number; offset?: number }
  ): Promise<Evidence[]>;
  deactivate(id: string): Promise<boolean>;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check permission and throw if denied
 */
function requirePermission(
  context: AppContext,
  agentId: string | undefined,
  permission: 'read' | 'write' | 'delete',
  scopeType: ScopeType,
  scopeId: string | null,
  entryId: string | null = null
): void {
  const hasPermission = context.services.permission.check(
    agentId,
    permission,
    'knowledge', // Use knowledge type for permission checks (evidence is knowledge-adjacent)
    entryId,
    scopeType,
    scopeId
  );

  if (!hasPermission) {
    throw createPermissionError(permission, 'evidence', entryId ?? undefined);
  }
}

/**
 * Get evidence repository from context
 */
function getRepo(context: AppContext): IEvidenceRepository {
  const repo = (context.repos as { evidence?: IEvidenceRepository }).evidence;
  if (!repo) {
    throw createValidationError('evidence', 'repository not available');
  }
  return repo;
}

/**
 * Validate that at least one content source is provided
 */
function validateContentSource(content?: string, filePath?: string, url?: string): void {
  if (!content && !filePath && !url) {
    throw createValidationError(
      'content|filePath|url',
      'at least one content source is required',
      'Provide content (inline text), filePath (local file), or url (external URL)'
    );
  }
}

/**
 * Parse tags from string (JSON array) or array
 */
function parseTags(evidence: Evidence): string[] {
  if (!evidence.tags) return [];
  try {
    // JSON.parse returns unknown - cast to string array
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(evidence.tags);
  } catch {
    return [];
  }
}

/**
 * Parse metadata from string (JSON object) or object
 */
function parseMetadata(evidence: Evidence): Record<string, unknown> | null {
  if (!evidence.metadata) return null;
  try {
    // JSON.parse returns unknown - cast to Record
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(evidence.metadata);
  } catch {
    return null;
  }
}

/**
 * Format evidence for response (parse JSON fields)
 */
function formatEvidence(evidence: Evidence): Record<string, unknown> {
  return {
    ...evidence,
    tags: parseTags(evidence),
    metadata: parseMetadata(evidence),
  };
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Add new evidence (immutable once created)
 */
const addHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getRepo(context);

  // Required params
  const scopeType = getRequiredParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const title = getRequiredParam(params, 'title', isString);
  const evidenceType = getRequiredParam(params, 'evidenceType', isEvidenceType);
  const agentId = getRequiredParam(params, 'agentId', isString);

  // Validate scope
  if (scopeType !== 'global' && !scopeId) {
    throw createValidationError(
      'scopeId',
      `is required for ${scopeType} scope`,
      'Provide the ID of the parent scope'
    );
  }

  // Check permission
  requirePermission(context, agentId, 'write', scopeType, scopeId ?? null);

  // Optional params
  const description = getOptionalParam(params, 'description', isString);
  const content = getOptionalParam(params, 'content', isString);
  const filePath = getOptionalParam(params, 'filePath', isString);
  const url = getOptionalParam(params, 'url', isString);

  // Validate content source
  validateContentSource(content, filePath, url);

  // File metadata
  const fileName = getOptionalParam(params, 'fileName', isString);
  const mimeType = getOptionalParam(params, 'mimeType', isString);
  const fileSize = getOptionalParam(params, 'fileSize', isNumber);
  const checksum = getOptionalParam(params, 'checksum', isString);

  // Snippet fields
  const language = getOptionalParam(params, 'language', isString);
  const sourceFile = getOptionalParam(params, 'sourceFile', isString);
  const startLine = getOptionalParam(params, 'startLine', isNumber);
  const endLine = getOptionalParam(params, 'endLine', isNumber);

  // Benchmark fields
  const metric = getOptionalParam(params, 'metric', isString);
  const value = getOptionalParam(params, 'value', isNumber);
  const unit = getOptionalParam(params, 'unit', isString);
  const baseline = getOptionalParam(params, 'baseline', isNumber);

  // Provenance
  const source = getOptionalParam(params, 'source', isString);
  const capturedAt = getOptionalParam(params, 'capturedAt', isString) ?? new Date().toISOString();
  const capturedBy = getOptionalParam(params, 'capturedBy', isString);

  // Flexible storage
  let tags: string[] | undefined;
  const tagsParam = params.tags;
  if (tagsParam !== undefined) {
    if (isArrayOfStrings(tagsParam)) {
      tags = tagsParam;
    } else if (isArray(tagsParam)) {
      // Filter to strings only
      tags = tagsParam.filter(isString);
    }
  }

  let metadata: Record<string, unknown> | undefined;
  const metadataParam = params.metadata;
  if (metadataParam !== undefined && isObject(metadataParam)) {
    metadata = metadataParam;
  }

  const createdBy = getOptionalParam(params, 'createdBy', isString) ?? agentId;

  // Create evidence
  const input: CreateEvidenceInput = {
    scopeType,
    scopeId,
    title,
    description,
    evidenceType,
    content,
    filePath,
    url,
    fileName,
    mimeType,
    fileSize,
    checksum,
    language,
    sourceFile,
    startLine,
    endLine,
    metric,
    value,
    unit,
    baseline,
    source,
    capturedAt,
    capturedBy,
    tags,
    metadata,
    createdBy,
  };

  const evidence = await repo.create(input);

  // Log audit
  logAction(
    {
      agentId,
      action: 'create',
      entryType: 'knowledge', // Using 'knowledge' for audit since evidence is knowledge-adjacent
      entryId: evidence.id,
      scopeType,
      scopeId: scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    evidence: formatEvidence(evidence),
  });
};

/**
 * Get evidence by ID
 */
const getHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getRepo(context);
  const id = getRequiredParam(params, 'id', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  const evidence = await repo.getById(id);
  if (!evidence) {
    throw createNotFoundError('evidence', id);
  }

  // Check permission
  requirePermission(context, agentId, 'read', evidence.scopeType, evidence.scopeId, evidence.id);

  // Log audit
  logAction(
    {
      agentId,
      action: 'read',
      entryType: 'knowledge',
      entryId: evidence.id,
      scopeType: evidence.scopeType,
      scopeId: evidence.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    evidence: formatEvidence(evidence),
  });
};

/**
 * List evidence with optional filters
 */
const listHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getRepo(context);
  const agentId = getOptionalParam(params, 'agentId', isString);
  const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const evidenceType = getOptionalParam(params, 'evidenceType', isEvidenceType);
  const includeInactive = getOptionalParam(params, 'includeInactive', isBoolean);
  const inherit = getOptionalParam(params, 'inherit', isBoolean);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 50;
  const offset = getOptionalParam(params, 'offset', isNumber) ?? 0;

  const filter: ListEvidenceFilter = {
    scopeType,
    scopeId,
    evidenceType,
    includeInactive,
    inherit,
  };

  const evidenceList = await repo.list(filter, { limit: limit + 1, offset });

  // Check if there are more results
  const hasMore = evidenceList.length > limit;
  const results = hasMore ? evidenceList.slice(0, limit) : evidenceList;

  // Filter by permission (batch would be better but keeping simple)
  const accessibleEvidence: Evidence[] = [];
  for (const evidence of results) {
    const hasPermission = context.services.permission.check(
      agentId,
      'read',
      'knowledge',
      evidence.id,
      evidence.scopeType,
      evidence.scopeId
    );
    if (hasPermission) {
      accessibleEvidence.push(evidence);
    }
  }

  return formatTimestamps({
    evidence: accessibleEvidence.map(formatEvidence),
    meta: {
      returnedCount: accessibleEvidence.length,
      hasMore,
      truncated: hasMore,
    },
  });
};

/**
 * Deactivate evidence (soft-delete)
 */
const deactivateHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getRepo(context);
  const id = getRequiredParam(params, 'id', isString);
  const agentId = getRequiredParam(params, 'agentId', isString);

  // Get existing evidence
  const evidence = await repo.getById(id);
  if (!evidence) {
    throw createNotFoundError('evidence', id);
  }

  // Check permission
  requirePermission(context, agentId, 'write', evidence.scopeType, evidence.scopeId, id);

  const success = await repo.deactivate(id);
  if (!success) {
    throw createNotFoundError('evidence', id);
  }

  // Log audit
  logAction(
    {
      agentId,
      action: 'delete',
      entryType: 'knowledge',
      entryId: id,
      scopeType: evidence.scopeType,
      scopeId: evidence.scopeId ?? null,
    },
    context.db
  );

  return { success: true };
};

/**
 * List evidence filtered by type
 */
const listByTypeHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getRepo(context);
  const evidenceType = getRequiredParam(params, 'evidenceType', isEvidenceType);
  const agentId = getOptionalParam(params, 'agentId', isString);
  const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const includeInactive = getOptionalParam(params, 'includeInactive', isBoolean);
  const inherit = getOptionalParam(params, 'inherit', isBoolean);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 50;
  const offset = getOptionalParam(params, 'offset', isNumber) ?? 0;

  const filter: ListEvidenceFilter = {
    scopeType,
    scopeId,
    includeInactive,
    inherit,
  };

  const evidenceList = await repo.listByType(evidenceType, filter, { limit: limit + 1, offset });

  // Check if there are more results
  const hasMore = evidenceList.length > limit;
  const results = hasMore ? evidenceList.slice(0, limit) : evidenceList;

  // Filter by permission
  const accessibleEvidence: Evidence[] = [];
  for (const evidence of results) {
    const hasPermission = context.services.permission.check(
      agentId,
      'read',
      'knowledge',
      evidence.id,
      evidence.scopeType,
      evidence.scopeId
    );
    if (hasPermission) {
      accessibleEvidence.push(evidence);
    }
  }

  return formatTimestamps({
    evidenceType,
    evidence: accessibleEvidence.map(formatEvidence),
    meta: {
      returnedCount: accessibleEvidence.length,
      hasMore,
      truncated: hasMore,
    },
  });
};

/**
 * List evidence filtered by source
 */
const listBySourceHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const repo = getRepo(context);
  const source = getRequiredParam(params, 'source', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);
  const scopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const includeInactive = getOptionalParam(params, 'includeInactive', isBoolean);
  const inherit = getOptionalParam(params, 'inherit', isBoolean);
  const limit = getOptionalParam(params, 'limit', isNumber) ?? 50;
  const offset = getOptionalParam(params, 'offset', isNumber) ?? 0;

  const filter: ListEvidenceFilter = {
    scopeType,
    scopeId,
    includeInactive,
    inherit,
  };

  const evidenceList = await repo.listBySource(source, filter, { limit: limit + 1, offset });

  // Check if there are more results
  const hasMore = evidenceList.length > limit;
  const results = hasMore ? evidenceList.slice(0, limit) : evidenceList;

  // Filter by permission
  const accessibleEvidence: Evidence[] = [];
  for (const evidence of results) {
    const hasPermission = context.services.permission.check(
      agentId,
      'read',
      'knowledge',
      evidence.id,
      evidence.scopeType,
      evidence.scopeId
    );
    if (hasPermission) {
      accessibleEvidence.push(evidence);
    }
  }

  return formatTimestamps({
    source,
    evidence: accessibleEvidence.map(formatEvidence),
    meta: {
      returnedCount: accessibleEvidence.length,
      hasMore,
      truncated: hasMore,
    },
  });
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * All evidence handlers
 * NOTE: No update handler - evidence is IMMUTABLE!
 */
export const evidenceHandlers = {
  add: addHandler,
  get: getHandler,
  list: listHandler,
  deactivate: deactivateHandler,
  list_by_type: listByTypeHandler,
  list_by_source: listBySourceHandler,
};
