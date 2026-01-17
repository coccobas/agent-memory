/**
 * Observe Commit Service
 *
 * Handles the business logic for storing client-extracted memory entries.
 * Manages auto-promotion decisions, duplicate detection, and storage orchestration.
 *
 * Note on atomicity: Individual entry storage is atomic, but the full commit
 * operation (entries + entities + relations) is not wrapped in a single transaction.
 * On partial failure, already-stored entries remain in the database.
 * This is a trade-off for the async architecture using repository abstractions.
 * Future improvement: Implement two-phase commit or compensating transactions.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { Repositories } from '../../core/interfaces/repositories.js';
import type { AppDb } from '../../core/types.js';
import { checkForDuplicates } from '../duplicate.service.js';
import { createComponentLogger } from '../../utils/logger.js';
import type { ScopeType } from '../../db/schema.js';
import type { ExtractedEntity, ExtractedRelationship } from '../extraction.service.js';
import type {
  ProcessedEntry,
  StoredEntry,
  ObserveCommitEntry,
} from '../../mcp/handlers/observe/types.js';
import {
  mergeSessionMetadata,
  ensureSessionIdExists,
  storeEntry,
  storeEntity,
  buildNameToIdMap,
  createExtractedRelations,
} from '../../mcp/handlers/observe/helpers.js';

const logger = createComponentLogger('observe.commit.service');

/**
 * Dependencies for ObserveCommitService
 */
export interface ObserveCommitServiceDeps {
  repos: Repositories;
  db: AppDb;
}

/**
 * Input for commit operation
 */
export interface CommitInput {
  sessionId: string;
  projectId?: string;
  agentId?: string;
  entries: ObserveCommitEntry[];
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  autoPromote: boolean;
  autoPromoteThreshold: number;
}

/**
 * Result of commit operation
 */
export interface CommitResult {
  stored: {
    entries: StoredEntry[];
    entities: StoredEntry[];
    relationsCreated: number;
  };
  skippedDuplicates: Array<{ type: string; name: string; scopeType: ScopeType }>;
  /** Errors encountered during commit (partial failures) */
  errors?: Array<{
    phase: 'entry' | 'entity' | 'relation' | 'metadata';
    name?: string;
    error: string;
  }>;
  /** True if commit completed with some errors (partial success) */
  partialSuccess?: boolean;
  meta: {
    sessionId: string;
    projectId: string | null;
    autoPromote: boolean;
    autoPromoteThreshold: number;
    totalReceived: number;
    entitiesReceived: number;
    relationshipsReceived: number;
    storedCount: number;
    entitiesStoredCount: number;
    relationsCreated: number;
    relationsSkipped: number;
    storedToProject: number;
    storedToSession: number;
    needsReviewCount: number;
    committedAt: string;
    reviewedAt: string | null;
  };
}

/**
 * Service for handling observe.commit business logic
 */
export class ObserveCommitService {
  private readonly repos: Repositories;
  private readonly db: AppDb;
  private readonly relationConfidenceThreshold = 0.8;

  constructor(deps: ObserveCommitServiceDeps) {
    this.repos = deps.repos;
    this.db = deps.db;
  }

  /**
   * Commit extracted entries to memory.
   *
   * Handles:
   * - Auto-promotion to project scope for high-confidence entries
   * - Duplicate detection and skipping
   * - Entry and entity storage
   * - Relation creation
   * - Session metadata updates
   */
  async commit(input: CommitInput): Promise<CommitResult> {
    const {
      sessionId,
      projectId,
      agentId,
      entries,
      entities,
      relationships,
      autoPromote,
      autoPromoteThreshold,
    } = input;

    // Ensure session exists
    await ensureSessionIdExists(this.repos, sessionId, projectId, agentId);

    const stored: StoredEntry[] = [];
    const storedEntities: StoredEntry[] = [];
    const skippedDuplicates: Array<{ type: string; name: string; scopeType: ScopeType }> = [];
    const commitErrors: Array<{
      phase: 'entry' | 'entity' | 'relation' | 'metadata';
      name?: string;
      error: string;
    }> = [];
    let storedToProject = 0;
    let storedToSession = 0;
    let needsReviewCount = 0;
    let relationsCreated = 0;
    let relationsSkipped = 0;

    // Store entries (track errors per entry for partial failure detection)
    for (const entry of entries) {
      try {
        const result = await this.processEntry(
          entry,
          sessionId,
          projectId,
          agentId,
          autoPromote,
          autoPromoteThreshold
        );

        if (result.skipped) {
          skippedDuplicates.push({
            type: entry.type,
            name: entry.name || entry.title || 'Unnamed',
            scopeType: result.targetScopeType!,
          });
          continue;
        }

        if (result.saved) {
          stored.push(result.saved);
          if (result.targetScopeType === 'project') storedToProject += 1;
          else storedToSession += 1;

          if (result.needsReview) needsReviewCount += 1;
        }
      } catch (error) {
        const entryName = entry.name || entry.title || 'Unnamed';
        const errorMsg = error instanceof Error ? error.message : String(error);
        commitErrors.push({ phase: 'entry', name: entryName, error: errorMsg });
        logger.error({ entry: entryName, error: errorMsg }, 'Failed to store entry');
      }
    }

    // Store entities (track errors per entity)
    for (const entity of entities) {
      const saved = await this.processEntity(
        entity,
        sessionId,
        projectId,
        agentId,
        autoPromote,
        autoPromoteThreshold
      );
      if (saved) {
        storedEntities.push(saved);
      } else {
        // processEntity already logs the error, just track it
        commitErrors.push({ phase: 'entity', name: entity.name, error: 'Storage failed' });
      }
    }

    // Create relations
    if (relationships.length > 0 && (stored.length > 0 || storedEntities.length > 0)) {
      try {
        const nameToIdMap = buildNameToIdMap(stored, storedEntities);
        const relationResults = await createExtractedRelations(
          this.repos,
          relationships,
          nameToIdMap,
          this.relationConfidenceThreshold
        );
        relationsCreated = relationResults.created;
        relationsSkipped = relationResults.skipped + relationResults.errors;

        // Track relation errors if any
        if (relationResults.errors > 0) {
          commitErrors.push({
            phase: 'relation',
            error: `${relationResults.errors} relation(s) failed to create`,
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        commitErrors.push({ phase: 'relation', error: errorMsg });
        logger.error({ error: errorMsg }, 'Failed to create relations');
      }
    }

    // Update session metadata (non-critical - entries already stored)
    const committedAt = new Date().toISOString();
    const reviewedAt = needsReviewCount === 0 ? committedAt : null;
    try {
      await this.updateSessionMetadata(sessionId, {
        agentId,
        autoPromote,
        autoPromoteThreshold,
        entries,
        entities,
        relationships,
        stored,
        storedEntities,
        relationsCreated,
        storedToProject,
        storedToSession,
        needsReviewCount,
        committedAt,
        reviewedAt,
      });
    } catch (error) {
      // Log but don't fail - entries are already stored successfully
      const errorMsg = error instanceof Error ? error.message : String(error);
      commitErrors.push({ phase: 'metadata', error: errorMsg });
      logger.warn(
        {
          sessionId,
          error: errorMsg,
          storedCount: stored.length,
          entitiesStoredCount: storedEntities.length,
        },
        'Failed to update session metadata after successful commit'
      );
    }

    // Determine if this was a partial success
    const hasErrors = commitErrors.length > 0;
    const hasSuccesses = stored.length > 0 || storedEntities.length > 0;
    const partialSuccess = hasErrors && hasSuccesses;

    if (partialSuccess) {
      logger.warn(
        {
          sessionId,
          storedCount: stored.length,
          entitiesStoredCount: storedEntities.length,
          errorCount: commitErrors.length,
        },
        'Commit completed with partial success - some entries failed to store'
      );
    }

    return {
      stored: {
        entries: stored,
        entities: storedEntities,
        relationsCreated,
      },
      skippedDuplicates,
      ...(commitErrors.length > 0 && { errors: commitErrors }),
      ...(partialSuccess && { partialSuccess }),
      meta: {
        sessionId,
        projectId: projectId ?? null,
        autoPromote,
        autoPromoteThreshold,
        totalReceived: entries.length,
        entitiesReceived: entities.length,
        relationshipsReceived: relationships.length,
        storedCount: stored.length,
        entitiesStoredCount: storedEntities.length,
        relationsCreated,
        relationsSkipped,
        storedToProject,
        storedToSession,
        needsReviewCount,
        committedAt,
        reviewedAt,
      },
    };
  }

  /**
   * Process a single entry: check for duplicates, store, and tag
   */
  private async processEntry(
    entry: ObserveCommitEntry,
    sessionId: string,
    projectId: string | undefined,
    agentId: string | undefined,
    autoPromote: boolean,
    autoPromoteThreshold: number
  ): Promise<{
    skipped: boolean;
    saved?: StoredEntry;
    targetScopeType?: ScopeType;
    needsReview?: boolean;
  }> {
    const wantsProject = autoPromote && entry.confidence >= autoPromoteThreshold && !!projectId;
    const targetScopeType: ScopeType = wantsProject ? 'project' : 'session';
    const targetScopeId = wantsProject ? projectId : sessionId;

    const entryName = entry.name || entry.title || 'Unnamed';
    const duplicateCheck = checkForDuplicates(
      entry.type,
      entryName,
      targetScopeType,
      targetScopeId ?? null,
      this.db
    );

    if (duplicateCheck.isDuplicate) {
      return { skipped: true, targetScopeType };
    }

    const processed: ProcessedEntry = {
      ...entry,
      isDuplicate: false,
      similarEntries: duplicateCheck.similarEntries.slice(0, 3),
      shouldStore: true,
    };

    const saved = await storeEntry(
      this.repos,
      processed,
      targetScopeType,
      targetScopeId,
      agentId,
      this.db
    );

    if (!saved) {
      return { skipped: false };
    }

    const isCandidate = targetScopeType === 'session';
    if (isCandidate) {
      await this.attachCandidateTags(saved);
    }

    // Attach suggested tags
    await this.attachSuggestedTags(saved, entry.suggestedTags);

    return {
      skipped: false,
      saved,
      targetScopeType,
      needsReview: isCandidate,
    };
  }

  /**
   * Process a single entity
   */
  private async processEntity(
    entity: ExtractedEntity,
    sessionId: string,
    projectId: string | undefined,
    agentId: string | undefined,
    autoPromote: boolean,
    autoPromoteThreshold: number
  ): Promise<StoredEntry | null> {
    const wantsProject = autoPromote && entity.confidence >= autoPromoteThreshold && !!projectId;
    const targetScopeType: ScopeType = wantsProject ? 'project' : 'session';
    const targetScopeId = wantsProject ? projectId : sessionId;

    try {
      return await storeEntity(
        this.repos,
        entity,
        targetScopeType,
        targetScopeId,
        agentId,
        this.db
      );
    } catch (error) {
      logger.warn(
        {
          entityName: entity.name,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to store entity in commit'
      );
      return null;
    }
  }

  /**
   * Attach candidate review tags to an entry
   */
  private async attachCandidateTags(saved: StoredEntry): Promise<void> {
    try {
      await this.repos.entryTags.attach({
        entryType: saved.type,
        entryId: saved.id,
        tagName: 'needs_review',
      });
      await this.repos.entryTags.attach({
        entryType: saved.type,
        entryId: saved.id,
        tagName: 'candidate',
      });
    } catch (error) {
      logger.warn(
        {
          entryType: saved.type,
          entryId: saved.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to attach candidate tags'
      );
    }
  }

  /**
   * Attach suggested tags to an entry
   */
  private async attachSuggestedTags(saved: StoredEntry, suggestedTags?: string[]): Promise<void> {
    if (!Array.isArray(suggestedTags)) return;

    for (const tagName of suggestedTags) {
      if (typeof tagName !== 'string' || !tagName.trim()) continue;
      try {
        await this.repos.entryTags.attach({
          entryType: saved.type,
          entryId: saved.id,
          tagName,
        });
      } catch {
        // best-effort
      }
    }
  }

  /**
   * Update session metadata with commit results
   */
  private async updateSessionMetadata(
    sessionId: string,
    data: {
      agentId: string | undefined;
      autoPromote: boolean;
      autoPromoteThreshold: number;
      entries: ObserveCommitEntry[];
      entities: ExtractedEntity[];
      relationships: ExtractedRelationship[];
      stored: StoredEntry[];
      storedEntities: StoredEntry[];
      relationsCreated: number;
      storedToProject: number;
      storedToSession: number;
      needsReviewCount: number;
      committedAt: string;
      reviewedAt: string | null;
    }
  ): Promise<void> {
    const nextMeta = await mergeSessionMetadata(this.repos, sessionId, {
      observe: {
        committedAt: data.committedAt,
        committedBy: data.agentId ?? null,
        autoPromote: data.autoPromote,
        autoPromoteThreshold: data.autoPromoteThreshold,
        totalReceived: data.entries.length,
        entitiesReceived: data.entities.length,
        relationshipsReceived: data.relationships.length,
        storedCount: data.stored.length,
        entitiesStoredCount: data.storedEntities.length,
        relationsCreated: data.relationsCreated,
        storedToProject: data.storedToProject,
        storedToSession: data.storedToSession,
        needsReviewCount: data.needsReviewCount,
        ...(data.reviewedAt ? { reviewedAt: data.reviewedAt } : {}),
      },
    });
    await this.repos.sessions.update(sessionId, { metadata: nextMeta });
  }
}

/**
 * Factory function to create ObserveCommitService
 */
export function createObserveCommitService(deps: ObserveCommitServiceDeps): ObserveCommitService {
  return new ObserveCommitService(deps);
}
