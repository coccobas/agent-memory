/**
 * Experience Repository
 *
 * Manages experiential memory - learned patterns from past interactions.
 * Factory function that accepts DatabaseDeps for dependency injection.
 */

import { eq, and, desc, asc } from 'drizzle-orm';
import { transactionWithRetry } from '../connection.js';
import {
  experiences,
  experienceVersions,
  experienceTrajectorySteps,
  tools,
  toolVersions,
  entryRelations,
  type NewExperience,
  type ExperienceVersion,
  type NewExperienceVersion,
  type ExperienceTrajectoryStep,
  type NewExperienceTrajectoryStep,
  type ScopeType,
  type NewTool,
  type NewToolVersion,
  type NewEntryRelation,
} from '../schema.js';
import {
  generateId,
  type PaginationOptions,
  cascadeDeleteRelatedRecordsWithDb,
  asyncVectorCleanup,
  checkAndLogConflictWithDb,
} from './base.js';
import { generateEmbeddingAsync, extractTextForEmbedding } from './embedding-hooks.js';
import {
  normalizePagination,
  buildScopeConditions,
  batchFetchVersionsWithDb,
  attachVersions,
  buildExactScopeConditions,
  buildGlobalScopeConditions,
} from './entry-utils.js';
import type { DatabaseDeps } from '../../core/types.js';
import type {
  IExperienceRepository,
  CreateExperienceInput,
  UpdateExperienceInput,
  ListExperiencesFilter,
  ExperienceWithVersion,
  TrajectoryStepInput,
  PromoteExperienceInput,
  RecordOutcomeInput,
  PromoteToSkillResult,
} from '../../core/interfaces/repositories.js';
import {
  createNotFoundError,
  createValidationError,
  createConflictError,
} from '../../core/errors.js';

// Re-export types for backward compatibility
export type {
  CreateExperienceInput,
  UpdateExperienceInput,
  ListExperiencesFilter,
  ExperienceWithVersion,
  TrajectoryStepInput,
  PromoteExperienceInput,
  RecordOutcomeInput,
  PromoteToSkillResult,
} from '../../core/interfaces/repositories.js';

// =============================================================================
// EXPERIENCE REPOSITORY FACTORY
// =============================================================================

/**
 * Create an experience repository with injected database dependencies
 */
export function createExperienceRepository(deps: DatabaseDeps): IExperienceRepository {
  const { db, sqlite } = deps;

  // Helper to fetch experience with version (used within transactions)
  function getByIdSync(id: string, includeTrajectory = false): ExperienceWithVersion | undefined {
    const entry = db.select().from(experiences).where(eq(experiences.id, id)).get();
    if (!entry) return undefined;

    const currentVersion = entry.currentVersionId
      ? db
          .select()
          .from(experienceVersions)
          .where(eq(experienceVersions.id, entry.currentVersionId))
          .get()
      : undefined;

    let trajectorySteps: ExperienceTrajectoryStep[] | undefined;
    if (includeTrajectory && currentVersion) {
      trajectorySteps = db
        .select()
        .from(experienceTrajectorySteps)
        .where(eq(experienceTrajectorySteps.experienceVersionId, currentVersion.id))
        .orderBy(asc(experienceTrajectorySteps.stepNum))
        .all();
    }

    return { ...entry, currentVersion, trajectorySteps };
  }

  const repo: IExperienceRepository = {
    async create(input: CreateExperienceInput): Promise<ExperienceWithVersion> {
      return await transactionWithRetry(sqlite, () => {
        const experienceId = generateId();
        const versionId = generateId();

        // Create the experience entry
        const entry: NewExperience = {
          id: experienceId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          title: input.title,
          level: input.level ?? 'case',
          category: input.category,
          currentVersionId: versionId,
          isActive: true,
          createdBy: input.createdBy,
        };

        db.insert(experiences).values(entry).run();

        // Create the initial version
        const version: NewExperienceVersion = {
          id: versionId,
          experienceId,
          versionNum: 1,
          content: input.content,
          scenario: input.scenario,
          outcome: input.outcome,
          pattern: input.pattern,
          applicability: input.applicability,
          contraindications: input.contraindications,
          confidence: input.confidence ?? 0.5,
          source: input.source ?? 'user',
          createdBy: input.createdBy,
          changeReason: 'Initial version',
        };

        db.insert(experienceVersions).values(version).run();

        // Create trajectory steps if provided
        if (input.steps && input.steps.length > 0) {
          input.steps.forEach((step, i) => {
            const stepEntry: NewExperienceTrajectoryStep = {
              id: generateId(),
              experienceVersionId: versionId,
              stepNum: i + 1,
              action: step.action,
              observation: step.observation,
              reasoning: step.reasoning,
              toolUsed: step.toolUsed,
              success: step.success,
              timestamp: step.timestamp,
              durationMs: step.durationMs,
            };
            db.insert(experienceTrajectorySteps).values(stepEntry).run();
          });
        }

        const result = getByIdSync(experienceId, true);
        if (!result) {
          throw createConflictError('experience', `failed to create entry ${experienceId}`);
        }

        // Generate embedding asynchronously (fire-and-forget)
        const text = extractTextForEmbedding('experience', input.title, {
          content: input.content,
          scenario: input.scenario,
          pattern: input.pattern,
        });
        generateEmbeddingAsync({
          entryType: 'experience',
          entryId: experienceId,
          versionId: versionId,
          text,
        });

        return result;
      });
    },

    async getById(id: string, includeTrajectory = false): Promise<ExperienceWithVersion | undefined> {
      return getByIdSync(id, includeTrajectory);
    },

    async getByTitle(
      title: string,
      scopeType: ScopeType,
      scopeId?: string,
      inherit = true
    ): Promise<ExperienceWithVersion | undefined> {
      // First, try exact scope match
      const exactMatch = db
        .select()
        .from(experiences)
        .where(buildExactScopeConditions(experiences, experiences.title, title, scopeType, scopeId))
        .get();

      if (exactMatch) {
        const versionsMap = batchFetchVersionsWithDb<ExperienceVersion>(db, experienceVersions, [
          exactMatch.currentVersionId,
        ]);
        return attachVersions([exactMatch], versionsMap)[0];
      }

      // If not found and inherit is true, search parent scopes
      if (inherit && scopeType !== 'global') {
        const globalMatch = db
          .select()
          .from(experiences)
          .where(buildGlobalScopeConditions(experiences, experiences.title, title))
          .get();

        if (globalMatch) {
          const versionsMap = batchFetchVersionsWithDb<ExperienceVersion>(db, experienceVersions, [
            globalMatch.currentVersionId,
          ]);
          return attachVersions([globalMatch], versionsMap)[0];
        }
      }

      return undefined;
    },

    async list(
      filter: ListExperiencesFilter = {},
      options: PaginationOptions = {}
    ): Promise<ExperienceWithVersion[]> {
      const { limit, offset } = normalizePagination(options);

      // Build conditions using shared utility + experience-specific conditions
      const conditions = buildScopeConditions(experiences, filter);
      if (filter.level !== undefined) {
        conditions.push(eq(experiences.level, filter.level));
      }
      if (filter.category !== undefined) {
        conditions.push(eq(experiences.category, filter.category));
      }

      let query = db.select().from(experiences);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const entries = query.limit(limit).offset(offset).all();

      // Batch fetch versions using shared utility
      const versionsMap = batchFetchVersionsWithDb<ExperienceVersion>(
        db,
        experienceVersions,
        entries.map((e) => e.currentVersionId)
      );

      return attachVersions(entries, versionsMap);
    },

    async update(
      id: string,
      input: UpdateExperienceInput
    ): Promise<ExperienceWithVersion | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        // Get current version number
        const latestVersion = db
          .select()
          .from(experienceVersions)
          .where(eq(experienceVersions.experienceId, id))
          .orderBy(desc(experienceVersions.versionNum))
          .get();

        const newVersionNum = (latestVersion?.versionNum ?? 0) + 1;
        const newVersionId = generateId();

        // Check for conflict using shared helper
        const conflictFlag = latestVersion
          ? checkAndLogConflictWithDb(
              db,
              'experience',
              id,
              latestVersion.id,
              newVersionId,
              new Date(latestVersion.createdAt)
            )
          : false;

        // Update experience metadata if needed
        if (input.category !== undefined) {
          db.update(experiences).set({ category: input.category }).where(eq(experiences.id, id)).run();
        }

        // Create new version
        const previousVersion = existing.currentVersion;
        const newVersion: NewExperienceVersion = {
          id: newVersionId,
          experienceId: id,
          versionNum: newVersionNum,
          content: input.content ?? previousVersion?.content ?? '',
          scenario: input.scenario ?? previousVersion?.scenario,
          outcome: input.outcome ?? previousVersion?.outcome,
          pattern: input.pattern ?? previousVersion?.pattern,
          applicability: input.applicability ?? previousVersion?.applicability,
          contraindications: input.contraindications ?? previousVersion?.contraindications,
          confidence: input.confidence ?? previousVersion?.confidence ?? 0.5,
          source: previousVersion?.source,
          createdBy: input.updatedBy,
          changeReason: input.changeReason,
          conflictFlag,
        };

        db.insert(experienceVersions).values(newVersion).run();

        // Update current version pointer
        db.update(experiences)
          .set({ currentVersionId: newVersionId })
          .where(eq(experiences.id, id))
          .run();

        // Generate embedding asynchronously (fire-and-forget)
        const text = extractTextForEmbedding('experience', existing.title, {
          content: newVersion.content,
          scenario: newVersion.scenario ?? undefined,
          pattern: newVersion.pattern ?? undefined,
        });
        generateEmbeddingAsync({
          entryType: 'experience',
          entryId: id,
          versionId: newVersionId,
          text,
        });

        return getByIdSync(id);
      });
    },

    async getHistory(experienceId: string): Promise<ExperienceVersion[]> {
      return db
        .select()
        .from(experienceVersions)
        .where(eq(experienceVersions.experienceId, experienceId))
        .orderBy(asc(experienceVersions.versionNum))
        .all();
    },

    async deactivate(id: string): Promise<boolean> {
      const result = db
        .update(experiences)
        .set({ isActive: false })
        .where(eq(experiences.id, id))
        .run();
      const success = result.changes > 0;

      if (success) {
        asyncVectorCleanup('experience', id);
      }

      return success;
    },

    async reactivate(id: string): Promise<boolean> {
      const result = db.update(experiences).set({ isActive: true }).where(eq(experiences.id, id)).run();
      return result.changes > 0;
    },

    async delete(id: string): Promise<boolean> {
      const result = await transactionWithRetry(sqlite, () => {
        // Delete related records (tags, relations, embeddings, permissions)
        cascadeDeleteRelatedRecordsWithDb(db, 'experience', id);

        // Delete trajectory steps (cascade handled by FK)
        // Delete versions (cascade handled by FK)
        db.delete(experienceVersions).where(eq(experienceVersions.experienceId, id)).run();

        // Delete experience entry
        const deleteResult = db.delete(experiences).where(eq(experiences.id, id)).run();
        return deleteResult.changes > 0;
      });

      if (result) {
        asyncVectorCleanup('experience', id);
      }

      return result;
    },

    // Experience-specific operations

    async addStep(experienceId: string, step: TrajectoryStepInput): Promise<ExperienceTrajectoryStep> {
      return await transactionWithRetry(sqlite, () => {
        const experience = getByIdSync(experienceId);
        if (!experience || !experience.currentVersion) {
          throw createNotFoundError('experience', experienceId);
        }

        // Get current max step number
        const lastStep = db
          .select()
          .from(experienceTrajectorySteps)
          .where(eq(experienceTrajectorySteps.experienceVersionId, experience.currentVersion.id))
          .orderBy(desc(experienceTrajectorySteps.stepNum))
          .get();

        const nextStepNum = (lastStep?.stepNum ?? 0) + 1;

        const stepEntry: NewExperienceTrajectoryStep = {
          id: generateId(),
          experienceVersionId: experience.currentVersion.id,
          stepNum: nextStepNum,
          action: step.action,
          observation: step.observation,
          reasoning: step.reasoning,
          toolUsed: step.toolUsed,
          success: step.success,
          timestamp: step.timestamp ?? new Date().toISOString(),
          durationMs: step.durationMs,
        };

        db.insert(experienceTrajectorySteps).values(stepEntry).run();

        const created = db
          .select()
          .from(experienceTrajectorySteps)
          .where(eq(experienceTrajectorySteps.id, stepEntry.id))
          .get();

        if (!created) {
          throw createConflictError('trajectoryStep', 'failed to create step');
        }

        return created;
      });
    },

    async getTrajectory(experienceId: string): Promise<ExperienceTrajectoryStep[]> {
      const experience = getByIdSync(experienceId);
      if (!experience || !experience.currentVersion) {
        return [];
      }

      return db
        .select()
        .from(experienceTrajectorySteps)
        .where(eq(experienceTrajectorySteps.experienceVersionId, experience.currentVersion.id))
        .orderBy(asc(experienceTrajectorySteps.stepNum))
        .all();
    },

    async promote(id: string, input: PromoteExperienceInput): Promise<PromoteToSkillResult> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) {
          throw createNotFoundError('experience', id);
        }

        if (input.toLevel === 'strategy') {
          // Case → Strategy promotion
          if (existing.level !== 'case') {
            throw createValidationError('level', 'can only promote case-level experiences to strategy');
          }

          // Create new strategy experience linked to this one
          const strategyId = generateId();
          const versionId = generateId();

          const strategyEntry: NewExperience = {
            id: strategyId,
            scopeType: existing.scopeType,
            scopeId: existing.scopeId,
            title: `Strategy: ${existing.title}`,
            level: 'strategy',
            category: existing.category,
            currentVersionId: versionId,
            isActive: true,
            createdBy: input.promotedBy,
          };

          db.insert(experiences).values(strategyEntry).run();

          // Create promotion relation: case --promoted_to--> strategy
          const relationEntry: NewEntryRelation = {
            id: generateId(),
            sourceType: 'experience',
            sourceId: id,
            targetType: 'experience',
            targetId: strategyId,
            relationType: 'promoted_to',
            createdBy: input.promotedBy,
          };
          db.insert(entryRelations).values(relationEntry).run();

          const previousVersion = existing.currentVersion;
          const version: NewExperienceVersion = {
            id: versionId,
            experienceId: strategyId,
            versionNum: 1,
            content: previousVersion?.content ?? '',
            pattern: input.pattern ?? previousVersion?.pattern,
            applicability: input.applicability ?? previousVersion?.applicability,
            contraindications: input.contraindications,
            confidence: previousVersion?.confidence ?? 0.5,
            source: 'promotion',
            createdBy: input.promotedBy,
            changeReason: input.reason ?? 'Promoted from case to strategy',
          };

          db.insert(experienceVersions).values(version).run();

          const result = getByIdSync(strategyId);
          if (!result) {
            throw createConflictError('experience', 'failed to create strategy experience');
          }

          return { experience: result };
        } else if (input.toLevel === 'skill') {
          // Strategy → Skill promotion (creates linked memory_tool)
          if (existing.level !== 'strategy') {
            throw createValidationError('level', 'can only promote strategy-level experiences to skill');
          }

          if (!input.toolName) {
            throw createValidationError('toolName', 'is required for skill promotion');
          }

          // Create the linked tool
          const toolId = generateId();
          const toolVersionId = generateId();

          const newTool: NewTool = {
            id: toolId,
            scopeType: existing.scopeType,
            scopeId: existing.scopeId,
            name: input.toolName,
            category: input.toolCategory ?? 'function',
            currentVersionId: toolVersionId,
            isActive: true,
            createdBy: input.promotedBy,
          };

          db.insert(tools).values(newTool).run();

          const toolVersion: NewToolVersion = {
            id: toolVersionId,
            toolId,
            versionNum: 1,
            description:
              input.toolDescription ??
              `Skill derived from experience: ${existing.title}. ${existing.currentVersion?.content ?? ''}`,
            parameters: input.toolParameters,
            createdBy: input.promotedBy,
            changeReason: input.reason ?? 'Created from skill promotion',
          };

          db.insert(toolVersions).values(toolVersion).run();

          // Create promotion relation: strategy --promoted_to--> tool
          const relationEntry: NewEntryRelation = {
            id: generateId(),
            sourceType: 'experience',
            sourceId: id,
            targetType: 'tool',
            targetId: toolId,
            relationType: 'promoted_to',
            createdBy: input.promotedBy,
          };
          db.insert(entryRelations).values(relationEntry).run();

          const updatedExperience = getByIdSync(id);
          if (!updatedExperience) {
            throw createConflictError('experience', 'failed to update with tool link');
          }

          return {
            experience: updatedExperience,
            createdTool: {
              id: toolId,
              name: input.toolName,
              scopeType: existing.scopeType,
              scopeId: existing.scopeId,
            },
          };
        }

        throw createValidationError('toLevel', `invalid promotion level: ${input.toLevel}`);
      });
    },

    async recordOutcome(id: string, input: RecordOutcomeInput): Promise<ExperienceWithVersion | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        // Update metrics
        const newUseCount = existing.useCount + 1;
        const newSuccessCount = input.success ? existing.successCount + 1 : existing.successCount;
        const newConfidence = newSuccessCount / newUseCount;

        db.update(experiences)
          .set({
            useCount: newUseCount,
            successCount: newSuccessCount,
            lastUsedAt: new Date().toISOString(),
          })
          .where(eq(experiences.id, id))
          .run();

        // Always update confidence on current version
        if (existing.currentVersionId) {
          db.update(experienceVersions)
            .set({ confidence: newConfidence })
            .where(eq(experienceVersions.id, existing.currentVersionId))
            .run();
        }

        // If feedback provided, create a new version with updated confidence
        if (input.feedback) {
          const latestVersion = db
            .select()
            .from(experienceVersions)
            .where(eq(experienceVersions.experienceId, id))
            .orderBy(desc(experienceVersions.versionNum))
            .get();

          const newVersionNum = (latestVersion?.versionNum ?? 0) + 1;
          const newVersionId = generateId();

          const newVersion: NewExperienceVersion = {
            id: newVersionId,
            experienceId: id,
            versionNum: newVersionNum,
            content: latestVersion?.content ?? '',
            scenario: latestVersion?.scenario,
            outcome: latestVersion?.outcome,
            pattern: latestVersion?.pattern,
            applicability: latestVersion?.applicability,
            contraindications: latestVersion?.contraindications,
            confidence: newConfidence,
            source: latestVersion?.source,
            changeReason: `Outcome recorded: ${input.success ? 'success' : 'failure'}. ${input.feedback}`,
          };

          db.insert(experienceVersions).values(newVersion).run();
          db.update(experiences)
            .set({ currentVersionId: newVersionId })
            .where(eq(experiences.id, id))
            .run();
        }

        return getByIdSync(id);
      });
    },
  };

  return repo;
}
