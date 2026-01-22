import { eq, and, desc, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { transactionWithRetry } from '../connection.js';
import {
  maintenanceJobs,
  type MaintenanceJobRecord,
  type NewMaintenanceJobRecord,
  type MaintenanceJobStatus,
  type StoredJobProgress,
  type StoredTaskProgress,
} from '../schema.js';
import type { ScopeType } from '../schema.js';
import { type PaginationOptions } from './base.js';
import { normalizePagination } from './entry-utils.js';
import type { DatabaseDeps } from '../../core/types.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('maintenance-jobs-repository');

export interface CreateMaintenanceJobInput {
  scopeType: ScopeType;
  scopeId?: string;
  tasks?: string[];
  dryRun?: boolean;
  initiatedBy?: string;
  configOverrides?: Record<string, unknown>;
}

export interface UpdateMaintenanceJobInput {
  status?: MaintenanceJobStatus;
  progress?: StoredJobProgress;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ListMaintenanceJobsFilter {
  status?: MaintenanceJobStatus;
  scopeType?: ScopeType;
  scopeId?: string;
}

export interface IMaintenanceJobRepository {
  create(input: CreateMaintenanceJobInput): Promise<MaintenanceJobRecord>;
  getById(id: string): Promise<MaintenanceJobRecord | undefined>;
  list(
    filter?: ListMaintenanceJobsFilter,
    options?: PaginationOptions
  ): Promise<MaintenanceJobRecord[]>;
  update(id: string, input: UpdateMaintenanceJobInput): Promise<MaintenanceJobRecord | undefined>;
  updateTaskProgress(
    jobId: string,
    taskName: string,
    update: Partial<StoredTaskProgress>
  ): Promise<MaintenanceJobRecord | undefined>;
  delete(id: string): Promise<boolean>;
  deleteOlderThan(cutoffDate: string): Promise<number>;
  getRunningJobs(): Promise<MaintenanceJobRecord[]>;
  countByStatus(status: MaintenanceJobStatus): Promise<number>;
}

function generateJobId(): string {
  return `job_${uuidv4().slice(0, 8)}`;
}

function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson<T>(json: string | null): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    logger.warn({ jsonLength: json.length }, 'Failed to parse JSON');
    return undefined;
  }
}

export function createMaintenanceJobRepository(deps: DatabaseDeps): IMaintenanceJobRepository {
  const { db, sqlite } = deps;

  function getByIdSync(id: string): MaintenanceJobRecord | undefined {
    return db.select().from(maintenanceJobs).where(eq(maintenanceJobs.id, id)).get();
  }

  const repo: IMaintenanceJobRepository = {
    async create(input: CreateMaintenanceJobInput): Promise<MaintenanceJobRecord> {
      return await transactionWithRetry(sqlite, () => {
        const jobId = generateJobId();
        const now = new Date().toISOString();

        const tasksToRun = input.tasks ?? [
          'consolidation',
          'forgetting',
          'graphBackfill',
          'latentPopulation',
          'tagRefinement',
          'semanticEdgeInference',
        ];

        const initialProgress: StoredJobProgress = {
          completedTasks: 0,
          totalTasks: tasksToRun.length,
          tasks: tasksToRun.map((name) => ({ name, status: 'pending' })),
        };

        const entry: NewMaintenanceJobRecord = {
          id: jobId,
          status: 'pending',
          requestScopeType: input.scopeType,
          requestScopeId: input.scopeId,
          requestTasks: serializeJson(tasksToRun),
          requestDryRun: input.dryRun ?? false,
          requestInitiatedBy: input.initiatedBy,
          requestConfigOverrides: serializeJson(input.configOverrides),
          progress: serializeJson(initialProgress),
          createdAt: now,
        };

        db.insert(maintenanceJobs).values(entry).run();
        logger.info({ jobId, tasks: tasksToRun }, 'Created maintenance job in database');

        const result = getByIdSync(jobId);
        if (!result) {
          throw new Error(`Failed to create maintenance job ${jobId}`);
        }
        return result;
      });
    },

    async getById(id: string): Promise<MaintenanceJobRecord | undefined> {
      return getByIdSync(id);
    },

    async list(
      filter: ListMaintenanceJobsFilter = {},
      options: PaginationOptions = {}
    ): Promise<MaintenanceJobRecord[]> {
      const { limit, offset } = normalizePagination(options);
      const conditions: ReturnType<typeof eq>[] = [];

      if (filter.status !== undefined) {
        conditions.push(eq(maintenanceJobs.status, filter.status));
      }
      if (filter.scopeType !== undefined) {
        conditions.push(eq(maintenanceJobs.requestScopeType, filter.scopeType));
      }
      if (filter.scopeId !== undefined) {
        conditions.push(eq(maintenanceJobs.requestScopeId, filter.scopeId));
      }

      let query = db.select().from(maintenanceJobs);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      return query.orderBy(desc(maintenanceJobs.createdAt)).limit(limit).offset(offset).all();
    },

    async update(
      id: string,
      input: UpdateMaintenanceJobInput
    ): Promise<MaintenanceJobRecord | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(id);
        if (!existing) return undefined;

        const updates: Partial<NewMaintenanceJobRecord> = {};

        if (input.status !== undefined) updates.status = input.status;
        if (input.progress !== undefined) updates.progress = serializeJson(input.progress);
        if (input.result !== undefined) updates.result = serializeJson(input.result);
        if (input.error !== undefined) updates.error = input.error;
        if (input.startedAt !== undefined) updates.startedAt = input.startedAt;
        if (input.completedAt !== undefined) updates.completedAt = input.completedAt;

        db.update(maintenanceJobs).set(updates).where(eq(maintenanceJobs.id, id)).run();
        return getByIdSync(id);
      });
    },

    async updateTaskProgress(
      jobId: string,
      taskName: string,
      update: Partial<StoredTaskProgress>
    ): Promise<MaintenanceJobRecord | undefined> {
      return await transactionWithRetry(sqlite, () => {
        const existing = getByIdSync(jobId);
        if (!existing) return undefined;

        const progress = parseJson<StoredJobProgress>(existing.progress) ?? {
          completedTasks: 0,
          totalTasks: 0,
          tasks: [],
        };

        const task = progress.tasks.find((t) => t.name === taskName);
        if (task) {
          Object.assign(task, update);

          if (update.status === 'running') {
            progress.currentTask = taskName;
            task.startedAt = new Date().toISOString();
          }

          if (
            update.status === 'completed' ||
            update.status === 'failed' ||
            update.status === 'skipped'
          ) {
            task.completedAt = new Date().toISOString();
            progress.completedTasks = progress.tasks.filter(
              (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'skipped'
            ).length;
          }
        }

        db.update(maintenanceJobs)
          .set({ progress: serializeJson(progress) })
          .where(eq(maintenanceJobs.id, jobId))
          .run();

        return getByIdSync(jobId);
      });
    },

    async delete(id: string): Promise<boolean> {
      const result = db.delete(maintenanceJobs).where(eq(maintenanceJobs.id, id)).run();
      return result.changes > 0;
    },

    async deleteOlderThan(cutoffDate: string): Promise<number> {
      const oldJobs = db
        .select({ id: maintenanceJobs.id })
        .from(maintenanceJobs)
        .where(
          and(
            inArray(maintenanceJobs.status, ['completed', 'failed'])
            // SQLite string comparison works for ISO dates
            // created_at < cutoffDate
          )
        )
        .all()
        .filter((j) => {
          const job = getByIdSync(j.id);
          return job && job.completedAt && job.completedAt < cutoffDate;
        });

      let deleted = 0;
      for (const job of oldJobs) {
        const result = db.delete(maintenanceJobs).where(eq(maintenanceJobs.id, job.id)).run();
        deleted += result.changes;
      }

      if (deleted > 0) {
        logger.info({ deleted, cutoffDate }, 'Cleaned up old maintenance jobs');
      }
      return deleted;
    },

    async getRunningJobs(): Promise<MaintenanceJobRecord[]> {
      return db.select().from(maintenanceJobs).where(eq(maintenanceJobs.status, 'running')).all();
    },

    async countByStatus(status: MaintenanceJobStatus): Promise<number> {
      const result = db
        .select()
        .from(maintenanceJobs)
        .where(eq(maintenanceJobs.status, status))
        .all();
      return result.length;
    },
  };

  return repo;
}

export type {
  MaintenanceJobRecord,
  NewMaintenanceJobRecord,
  MaintenanceJobStatus,
} from '../schema.js';
