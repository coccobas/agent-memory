/**
 * Recommendation Store
 *
 * CRUD operations for librarian-generated promotion recommendations.
 * Manages the lifecycle of recommendations from creation to approval/rejection.
 *
 * NOTE: Non-null assertions used for Drizzle ORM query builder results
 * (and/or operations) after conditional construction.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { eq, and, desc, sql, inArray, lt, or, isNull, type SQL } from 'drizzle-orm';
import { transactionWithRetry } from '../../../db/connection.js';
import {
  recommendations,
  recommendationSources,
  type Recommendation,
  type NewRecommendation,
  type RecommendationSource,
  type NewRecommendationSource,
  type RecommendationStatus,
  type RecommendationType,
  type ScopeType,
} from '../../../db/schema.js';
import { generateId, type PaginationOptions } from '../../../db/repositories/base.js';
import { normalizePagination } from '../../../db/repositories/entry-utils.js';
import type { DatabaseDeps } from '../../../core/types.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateRecommendationInput {
  scopeType: ScopeType;
  scopeId?: string;
  type: RecommendationType;
  title: string;
  pattern?: string;
  applicability?: string;
  contraindications?: string;
  rationale?: string;
  confidence: number;
  patternCount?: number;
  exemplarExperienceId?: string;
  sourceExperienceIds: string[];
  analysisRunId?: string;
  analysisVersion?: string;
  expiresAt?: string;
  createdBy?: string;
}

export interface UpdateRecommendationInput {
  status?: RecommendationStatus;
  title?: string;
  pattern?: string;
  applicability?: string;
  contraindications?: string;
  rationale?: string;
  confidence?: number;
  reviewedBy?: string;
  reviewNotes?: string;
  promotedExperienceId?: string;
  promotedToolId?: string;
}

export interface ListRecommendationsFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  status?: RecommendationStatus | RecommendationStatus[];
  type?: RecommendationType;
  minConfidence?: number;
  analysisRunId?: string;
  includeExpired?: boolean;
  inherit?: boolean;
}

export interface RecommendationWithSources extends Recommendation {
  sources?: RecommendationSource[];
}

export interface IRecommendationStore {
  create(input: CreateRecommendationInput): Promise<RecommendationWithSources>;
  getById(id: string, includeSources?: boolean): Promise<RecommendationWithSources | undefined>;
  list(
    filter?: ListRecommendationsFilter,
    options?: PaginationOptions
  ): Promise<RecommendationWithSources[]>;
  update(id: string, input: UpdateRecommendationInput): Promise<Recommendation | undefined>;
  approve(
    id: string,
    approvedBy: string,
    promotedExperienceId?: string,
    promotedToolId?: string,
    notes?: string
  ): Promise<Recommendation | undefined>;
  reject(id: string, rejectedBy: string, notes?: string): Promise<Recommendation | undefined>;
  skip(id: string, skippedBy: string, notes?: string): Promise<Recommendation | undefined>;
  expire(id: string): Promise<Recommendation | undefined>;
  expireStale(beforeDate?: string): Promise<number>;
  delete(id: string): Promise<boolean>;
  count(filter?: ListRecommendationsFilter): Promise<number>;
}

// =============================================================================
// RECOMMENDATION STORE FACTORY
// =============================================================================

/**
 * Create a recommendation store with injected database dependencies
 */
export function createRecommendationStore(deps: DatabaseDeps): IRecommendationStore {
  const { db, sqlite } = deps;

  const store: IRecommendationStore = {
    async create(input: CreateRecommendationInput): Promise<RecommendationWithSources> {
      return await transactionWithRetry(sqlite, () => {
        const recommendationId = generateId();

        // Create the recommendation entry
        const entry: NewRecommendation = {
          id: recommendationId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          type: input.type,
          status: 'pending',
          title: input.title,
          pattern: input.pattern,
          applicability: input.applicability,
          contraindications: input.contraindications,
          rationale: input.rationale,
          confidence: input.confidence,
          patternCount: input.patternCount ?? input.sourceExperienceIds.length,
          exemplarExperienceId: input.exemplarExperienceId,
          sourceExperienceIds: JSON.stringify(input.sourceExperienceIds),
          analysisRunId: input.analysisRunId,
          analysisVersion: input.analysisVersion,
          expiresAt: input.expiresAt,
          createdBy: input.createdBy,
        };

        db.insert(recommendations).values(entry).run();

        // Create source links
        const sources: RecommendationSource[] = [];
        for (const experienceId of input.sourceExperienceIds) {
          const sourceEntry: NewRecommendationSource = {
            id: generateId(),
            recommendationId,
            experienceId,
            isExemplar: experienceId === input.exemplarExperienceId,
          };
          db.insert(recommendationSources).values(sourceEntry).run();
          sources.push(sourceEntry as RecommendationSource);
        }

        return {
          ...entry,
          id: recommendationId,
          status: 'pending',
          patternCount: entry.patternCount ?? input.sourceExperienceIds.length,
          sourceExperienceIds: entry.sourceExperienceIds,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sources,
        } as RecommendationWithSources;
      });
    },

    async getById(
      id: string,
      includeSources = false
    ): Promise<RecommendationWithSources | undefined> {
      const entry = db.select().from(recommendations).where(eq(recommendations.id, id)).get();
      if (!entry) return undefined;

      if (includeSources) {
        const sources = db
          .select()
          .from(recommendationSources)
          .where(eq(recommendationSources.recommendationId, id))
          .all();
        return { ...entry, sources };
      }

      return entry;
    },

    async list(
      filter?: ListRecommendationsFilter,
      options?: PaginationOptions
    ): Promise<RecommendationWithSources[]> {
      const { limit, offset } = normalizePagination(options);
      const conditions: SQL[] = [];

      // Scope filtering
      if (filter?.scopeType) {
        if (filter.inherit) {
          // Include global + specified scope
          if (filter.scopeType === 'global') {
            conditions.push(
              and(eq(recommendations.scopeType, 'global'), isNull(recommendations.scopeId))!
            );
          } else {
            conditions.push(
              or(
                and(eq(recommendations.scopeType, 'global'), isNull(recommendations.scopeId)),
                and(
                  eq(recommendations.scopeType, filter.scopeType),
                  filter.scopeId
                    ? eq(recommendations.scopeId, filter.scopeId)
                    : isNull(recommendations.scopeId)
                )
              )!
            );
          }
        } else {
          // Exact scope match
          conditions.push(eq(recommendations.scopeType, filter.scopeType));
          if (filter.scopeId) {
            conditions.push(eq(recommendations.scopeId, filter.scopeId));
          } else if (filter.scopeType === 'global') {
            conditions.push(isNull(recommendations.scopeId));
          }
        }
      }

      // Status filtering
      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          conditions.push(inArray(recommendations.status, filter.status));
        } else {
          conditions.push(eq(recommendations.status, filter.status));
        }
      }

      // Type filtering
      if (filter?.type) {
        conditions.push(eq(recommendations.type, filter.type));
      }

      // Confidence filtering
      if (filter?.minConfidence !== undefined) {
        conditions.push(sql`${recommendations.confidence} >= ${filter.minConfidence}`);
      }

      // Analysis run filtering
      if (filter?.analysisRunId) {
        conditions.push(eq(recommendations.analysisRunId, filter.analysisRunId));
      }

      // Exclude expired unless requested
      if (!filter?.includeExpired) {
        conditions.push(
          sql`(${recommendations.expiresAt} IS NULL OR ${recommendations.expiresAt} > datetime('now'))`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      return db
        .select()
        .from(recommendations)
        .where(whereClause)
        .orderBy(desc(recommendations.confidence), desc(recommendations.createdAt))
        .limit(limit)
        .offset(offset)
        .all();
    },

    async update(
      id: string,
      input: UpdateRecommendationInput
    ): Promise<Recommendation | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = db.select().from(recommendations).where(eq(recommendations.id, id)).get();
        if (!existing) return undefined;

        const updates: Partial<Recommendation> = {
          ...input,
          updatedAt: new Date().toISOString(),
        };

        // Set reviewedAt if reviewing
        if (input.status && ['approved', 'rejected', 'skipped'].includes(input.status)) {
          updates.reviewedAt = new Date().toISOString();
        }

        db.update(recommendations).set(updates).where(eq(recommendations.id, id)).run();

        return db.select().from(recommendations).where(eq(recommendations.id, id)).get();
      });
    },

    async approve(
      id: string,
      approvedBy: string,
      promotedExperienceId?: string,
      promotedToolId?: string,
      notes?: string
    ): Promise<Recommendation | undefined> {
      return store.update(id, {
        status: 'approved',
        reviewedBy: approvedBy,
        reviewNotes: notes,
        promotedExperienceId,
        promotedToolId,
      });
    },

    async reject(
      id: string,
      rejectedBy: string,
      notes?: string
    ): Promise<Recommendation | undefined> {
      return store.update(id, {
        status: 'rejected',
        reviewedBy: rejectedBy,
        reviewNotes: notes,
      });
    },

    async skip(id: string, skippedBy: string, notes?: string): Promise<Recommendation | undefined> {
      return store.update(id, {
        status: 'skipped',
        reviewedBy: skippedBy,
        reviewNotes: notes,
      });
    },

    async expire(id: string): Promise<Recommendation | undefined> {
      return store.update(id, { status: 'expired' });
    },

    async expireStale(beforeDate?: string): Promise<number> {
      const cutoff = beforeDate ?? new Date().toISOString();

      const result = db
        .update(recommendations)
        .set({
          status: 'expired',
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(recommendations.status, 'pending'), lt(recommendations.expiresAt, cutoff)))
        .run();

      return result.changes;
    },

    async delete(id: string): Promise<boolean> {
      return await transactionWithRetry(sqlite, () => {
        // Sources are cascade-deleted via foreign key
        const result = db.delete(recommendations).where(eq(recommendations.id, id)).run();
        return result.changes > 0;
      });
    },

    async count(filter?: ListRecommendationsFilter): Promise<number> {
      const conditions: SQL[] = [];

      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          conditions.push(inArray(recommendations.status, filter.status));
        } else {
          conditions.push(eq(recommendations.status, filter.status));
        }
      }

      // Scope filtering
      if (filter?.scopeType) {
        if (filter.inherit) {
          if (filter.scopeType === 'global') {
            conditions.push(
              and(eq(recommendations.scopeType, 'global'), isNull(recommendations.scopeId))!
            );
          } else {
            conditions.push(
              or(
                and(eq(recommendations.scopeType, 'global'), isNull(recommendations.scopeId)),
                and(
                  eq(recommendations.scopeType, filter.scopeType),
                  filter.scopeId
                    ? eq(recommendations.scopeId, filter.scopeId)
                    : isNull(recommendations.scopeId)
                )
              )!
            );
          }
        } else {
          conditions.push(eq(recommendations.scopeType, filter.scopeType));
          if (filter.scopeId) {
            conditions.push(eq(recommendations.scopeId, filter.scopeId));
          } else if (filter.scopeType === 'global') {
            conditions.push(isNull(recommendations.scopeId));
          }
        }
      }

      if (!filter?.includeExpired) {
        conditions.push(
          sql`(${recommendations.expiresAt} IS NULL OR ${recommendations.expiresAt} > datetime('now'))`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const result = db
        .select({ count: sql<number>`count(*)` })
        .from(recommendations)
        .where(whereClause)
        .get();

      return result?.count ?? 0;
    },
  };

  return store;
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let storeInstance: IRecommendationStore | null = null;

/**
 * Get or create the recommendation store singleton
 */
export function getRecommendationStore(deps?: DatabaseDeps): IRecommendationStore | null {
  if (storeInstance) return storeInstance;
  if (!deps) return null;
  storeInstance = createRecommendationStore(deps);
  return storeInstance;
}

/**
 * Initialize the recommendation store with database dependencies
 */
export function initializeRecommendationStore(deps: DatabaseDeps): IRecommendationStore {
  storeInstance = createRecommendationStore(deps);
  return storeInstance;
}
