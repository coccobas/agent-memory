/**
 * Evidence Repository
 *
 * Manages immutable artifacts that support memory entries.
 * Evidence is IMMUTABLE - once created, it cannot be modified, only deactivated.
 *
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { transactionWithRetry } from '../connection.js';
import {
  evidence,
  type Evidence,
  type NewEvidence,
  type ScopeType,
  type EvidenceType,
} from '../schema.js';
import { type PaginationOptions } from './base.js';
import { normalizePagination, buildScopeConditions } from './entry-utils.js';
import type { DatabaseDeps } from '../../core/types.js';
import { createNotFoundError } from '../../core/errors.js';

// =============================================================================
// TYPES
// =============================================================================

/** Input for creating new evidence */
export interface CreateEvidenceInput {
  scopeType: ScopeType;
  scopeId?: string;
  title: string;
  description?: string;
  evidenceType: EvidenceType;

  // Content sources (mutually exclusive)
  content?: string;
  filePath?: string;
  url?: string;

  // File metadata
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  checksum?: string;

  // Code snippet fields
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
  capturedAt?: string;
  capturedBy?: string;

  // Flexible storage
  tags?: string[];
  metadata?: Record<string, unknown>;

  // Audit
  createdBy?: string;
}

/** Filter for listing evidence */
export interface ListEvidenceFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  evidenceType?: EvidenceType;
  includeInactive?: boolean;
}

// =============================================================================
// INTERFACE
// =============================================================================

export interface IEvidenceRepository {
  /** Create new evidence (immutable once created) */
  create(input: CreateEvidenceInput): Promise<Evidence>;

  /** Get evidence by ID */
  getById(id: string): Promise<Evidence | undefined>;

  /** List evidence with filtering and pagination */
  list(filter?: ListEvidenceFilter, options?: PaginationOptions): Promise<Evidence[]>;

  /** Deactivate evidence (soft-delete - NO actual deletion allowed) */
  deactivate(id: string): Promise<boolean>;

  /** List evidence by type */
  listByType(
    evidenceType: EvidenceType,
    filter?: Omit<ListEvidenceFilter, 'evidenceType'>,
    options?: PaginationOptions
  ): Promise<Evidence[]>;

  /** List evidence by source */
  listBySource(
    source: string,
    filter?: ListEvidenceFilter,
    options?: PaginationOptions
  ): Promise<Evidence[]>;

  /** Find evidence by URL (for deduplication) */
  getByUrl(url: string): Promise<Evidence | undefined>;

  /** Find evidence by file path (for deduplication) */
  getByFilePath(filePath: string): Promise<Evidence | undefined>;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a prefixed evidence ID
 */
function generateEvidenceId(): string {
  return `ev_${nanoid()}`;
}

// =============================================================================
// EVIDENCE REPOSITORY FACTORY
// =============================================================================

/**
 * Create an evidence repository with injected database dependencies
 */
export function createEvidenceRepository(deps: DatabaseDeps): IEvidenceRepository {
  const { db, sqlite } = deps;

  const repo: IEvidenceRepository = {
    async create(input: CreateEvidenceInput): Promise<Evidence> {
      return await transactionWithRetry(sqlite, () => {
        const id = generateEvidenceId();
        const now = new Date().toISOString();

        const entry: NewEvidence = {
          id,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          title: input.title,
          description: input.description,
          evidenceType: input.evidenceType,

          // Content sources
          content: input.content,
          filePath: input.filePath,
          url: input.url,

          // File metadata
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          checksum: input.checksum,

          // Code snippet fields
          language: input.language,
          sourceFile: input.sourceFile,
          startLine: input.startLine,
          endLine: input.endLine,

          // Benchmark fields
          metric: input.metric,
          value: input.value,
          unit: input.unit,
          baseline: input.baseline,

          // Provenance
          source: input.source,
          capturedAt: input.capturedAt ?? now,
          capturedBy: input.capturedBy,

          // Flexible storage (JSON serialized)
          tags: input.tags ? JSON.stringify(input.tags) : null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,

          // Audit
          createdAt: now,
          createdBy: input.createdBy,
          isActive: true,
        };

        db.insert(evidence).values(entry).run();

        const created = db.select().from(evidence).where(eq(evidence.id, id)).get();

        if (!created) {
          throw createNotFoundError('evidence', id);
        }

        return created;
      });
    },

    async getById(id: string): Promise<Evidence | undefined> {
      return db.select().from(evidence).where(eq(evidence.id, id)).get();
    },

    async list(
      filter: ListEvidenceFilter = {},
      options: PaginationOptions = {}
    ): Promise<Evidence[]> {
      const { limit, offset } = normalizePagination(options);

      // Build conditions using shared utility + evidence-specific conditions
      const conditions = buildScopeConditions(evidence, filter);

      if (filter.evidenceType !== undefined) {
        conditions.push(eq(evidence.evidenceType, filter.evidenceType));
      }

      let query = db.select().from(evidence);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      return query.orderBy(desc(evidence.createdAt)).limit(limit).offset(offset).all();
    },

    async deactivate(id: string): Promise<boolean> {
      const result = db
        .update(evidence)
        .set({ isActive: false })
        .where(eq(evidence.id, id))
        .run();

      return result.changes > 0;
    },

    async listByType(
      evidenceType: EvidenceType,
      filter: Omit<ListEvidenceFilter, 'evidenceType'> = {},
      options: PaginationOptions = {}
    ): Promise<Evidence[]> {
      return repo.list({ ...filter, evidenceType }, options);
    },

    async listBySource(
      source: string,
      filter: ListEvidenceFilter = {},
      options: PaginationOptions = {}
    ): Promise<Evidence[]> {
      const { limit, offset } = normalizePagination(options);

      const conditions = buildScopeConditions(evidence, filter);
      conditions.push(eq(evidence.source, source));

      if (filter.evidenceType !== undefined) {
        conditions.push(eq(evidence.evidenceType, filter.evidenceType));
      }

      let query = db.select().from(evidence);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      return query.orderBy(desc(evidence.createdAt)).limit(limit).offset(offset).all();
    },

    async getByUrl(url: string): Promise<Evidence | undefined> {
      return db
        .select()
        .from(evidence)
        .where(and(eq(evidence.url, url), eq(evidence.isActive, true)))
        .get();
    },

    async getByFilePath(filePath: string): Promise<Evidence | undefined> {
      return db
        .select()
        .from(evidence)
        .where(and(eq(evidence.filePath, filePath), eq(evidence.isActive, true)))
        .get();
    },
  };

  return repo;
}
