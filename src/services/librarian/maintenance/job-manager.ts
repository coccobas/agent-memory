import { v4 as uuidv4 } from 'uuid';
import { createComponentLogger } from '../../../utils/logger.js';
import type { MaintenanceRequest, MaintenanceResult } from './types.js';
import type {
  IMaintenanceJobRepository,
  MaintenanceJobRecord,
} from '../../../db/repositories/maintenance-jobs.js';
import type { StoredJobProgress, StoredTaskProgress } from '../../../db/schema/maintenance-jobs.js';

const logger = createComponentLogger('maintenance-job-manager');

export type MaintenanceJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface MaintenanceTaskProgress {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

export interface MaintenanceJob {
  id: string;
  status: MaintenanceJobStatus;
  request: MaintenanceRequest;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress: {
    currentTask?: string;
    completedTasks: number;
    totalTasks: number;
    tasks: MaintenanceTaskProgress[];
  };
  result?: MaintenanceResult;
  error?: string;
}

export interface JobManagerConfig {
  maxJobHistory: number;
  jobRetentionMs: number;
  maxConcurrentJobs: number;
}

const DEFAULT_CONFIG: JobManagerConfig = {
  maxJobHistory: 100,
  jobRetentionMs: 60 * 60 * 1000,
  maxConcurrentJobs: 1,
};

const ALL_MAINTENANCE_TASKS = [
  'consolidation',
  'forgetting',
  'graphBackfill',
  'latentPopulation',
  'tagRefinement',
  'semanticEdgeInference',
] as const;

function parseJson<T>(json: string | null | undefined): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

type MaintenanceTaskName =
  | 'consolidation'
  | 'forgetting'
  | 'graphBackfill'
  | 'latentPopulation'
  | 'tagRefinement'
  | 'semanticEdgeInference'
  | 'embeddingCleanup';

function recordToJob(record: MaintenanceJobRecord): MaintenanceJob {
  const progress = parseJson<StoredJobProgress>(record.progress) ?? {
    completedTasks: 0,
    totalTasks: 0,
    tasks: [],
  };

  const parsedTasks = parseJson<string[]>(record.requestTasks);
  const typedTasks = parsedTasks as MaintenanceTaskName[] | undefined;

  const request: MaintenanceRequest = {
    scopeType: record.requestScopeType,
    scopeId: record.requestScopeId ?? undefined,
    tasks: typedTasks,
    dryRun: record.requestDryRun ?? undefined,
    initiatedBy: record.requestInitiatedBy ?? undefined,
    configOverrides: parseJson(record.requestConfigOverrides),
  };

  return {
    id: record.id,
    status: record.status,
    request,
    createdAt: record.createdAt,
    startedAt: record.startedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    progress,
    result: parseJson<MaintenanceResult>(record.result),
    error: record.error ?? undefined,
  };
}

export class MaintenanceJobManager {
  private jobs: Map<string, MaintenanceJob> = new Map();
  private config: JobManagerConfig;
  private cleanupInterval?: NodeJS.Timeout;
  private repository: IMaintenanceJobRepository | null = null;
  private initialized = false;

  constructor(config?: Partial<JobManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cleanupInterval = setInterval(() => {
      void this.cleanup();
    }, 60_000);
  }

  setRepository(repo: IMaintenanceJobRepository): void {
    this.repository = repo;
  }

  async initialize(): Promise<void> {
    if (this.initialized || !this.repository) return;

    try {
      const runningJobs = await this.repository.list({ status: 'running' });
      const pendingJobs = await this.repository.list({ status: 'pending' });

      for (const record of [...runningJobs, ...pendingJobs]) {
        const job = recordToJob(record);
        this.jobs.set(job.id, job);
      }

      const recentCompleted = await this.repository.list({ status: 'completed' }, { limit: 20 });
      for (const record of recentCompleted) {
        const job = recordToJob(record);
        this.jobs.set(job.id, job);
      }

      this.initialized = true;
      logger.info(
        { running: runningJobs.length, pending: pendingJobs.length },
        'Loaded existing jobs from database'
      );
    } catch (error) {
      logger.warn({ error }, 'Failed to load jobs from database, starting fresh');
      this.initialized = true;
    }
  }

  async createJob(request: MaintenanceRequest): Promise<MaintenanceJob> {
    const id = `job_${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    const tasksToRun = request.tasks ?? [...ALL_MAINTENANCE_TASKS];

    const job: MaintenanceJob = {
      id,
      status: 'pending',
      request,
      createdAt: now,
      progress: {
        completedTasks: 0,
        totalTasks: tasksToRun.length,
        tasks: tasksToRun.map((name) => ({ name, status: 'pending' })),
      },
    };

    this.jobs.set(id, job);

    if (this.repository) {
      try {
        await this.repository.create({
          scopeType: request.scopeType,
          scopeId: request.scopeId,
          tasks: tasksToRun,
          dryRun: request.dryRun,
          initiatedBy: request.initiatedBy,
          configOverrides: request.configOverrides as Record<string, unknown> | undefined,
        });
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to persist job to database');
      }
    }

    logger.info({ jobId: id, tasks: tasksToRun }, 'Created maintenance job');
    this.enforceMaxHistory();
    return job;
  }

  getJob(id: string): MaintenanceJob | undefined {
    return this.jobs.get(id);
  }

  async getJobWithFallback(id: string): Promise<MaintenanceJob | undefined> {
    let job = this.jobs.get(id);
    if (job) return job;

    if (this.repository) {
      try {
        const record = await this.repository.getById(id);
        if (record) {
          job = recordToJob(record);
          this.jobs.set(id, job);
          return job;
        }
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to load job from database');
      }
    }

    return undefined;
  }

  listJobs(status?: MaintenanceJobStatus): MaintenanceJob[] {
    const jobs = Array.from(this.jobs.values());
    if (status) {
      return jobs.filter((j) => j.status === status);
    }
    return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async listJobsWithFallback(status?: MaintenanceJobStatus): Promise<MaintenanceJob[]> {
    if (this.repository) {
      try {
        const records = await this.repository.list(status ? { status } : {}, { limit: 100 });
        for (const record of records) {
          if (!this.jobs.has(record.id)) {
            this.jobs.set(record.id, recordToJob(record));
          }
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to load jobs from database');
      }
    }

    return this.listJobs(status);
  }

  getRunningJobs(): MaintenanceJob[] {
    return this.listJobs('running');
  }

  canStartJob(): boolean {
    return this.getRunningJobs().length < this.config.maxConcurrentJobs;
  }

  async startJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }

    const now = new Date().toISOString();
    job.status = 'running';
    job.startedAt = now;

    if (this.repository) {
      try {
        await this.repository.update(id, { status: 'running', startedAt: now });
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to update job status in database');
      }
    }

    logger.info({ jobId: id }, 'Job started');
  }

  async updateTaskProgress(
    jobId: string,
    taskName: string,
    update: Partial<MaintenanceTaskProgress>
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const task = job.progress.tasks.find((t) => t.name === taskName);
    if (task) {
      Object.assign(task, update);

      if (update.status === 'running') {
        job.progress.currentTask = taskName;
        task.startedAt = new Date().toISOString();
      }

      if (
        update.status === 'completed' ||
        update.status === 'failed' ||
        update.status === 'skipped'
      ) {
        task.completedAt = new Date().toISOString();
        job.progress.completedTasks = job.progress.tasks.filter(
          (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'skipped'
        ).length;
      }
    }

    if (this.repository) {
      try {
        await this.repository.updateTaskProgress(
          jobId,
          taskName,
          update as Partial<StoredTaskProgress>
        );
      } catch (error) {
        logger.warn({ jobId, taskName, error }, 'Failed to update task progress in database');
      }
    }
  }

  async completeJob(id: string, result: MaintenanceResult): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    const now = new Date().toISOString();
    job.status = 'completed';
    job.completedAt = now;
    job.result = result;
    job.progress.currentTask = undefined;

    if (this.repository) {
      try {
        await this.repository.update(id, {
          status: 'completed',
          completedAt: now,
          result: result as unknown as Record<string, unknown>,
          progress: job.progress as StoredJobProgress,
        });
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to update completed job in database');
      }
    }

    logger.info(
      {
        jobId: id,
        durationMs: result.timing.durationMs,
        completedTasks: job.progress.completedTasks,
      },
      'Job completed'
    );
  }

  async failJob(id: string, error: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    const now = new Date().toISOString();
    job.status = 'failed';
    job.completedAt = now;
    job.error = error;
    job.progress.currentTask = undefined;

    if (this.repository) {
      try {
        await this.repository.update(id, {
          status: 'failed',
          completedAt: now,
          error,
          progress: job.progress as StoredJobProgress,
        });
      } catch (error) {
        logger.warn({ jobId: id, error }, 'Failed to update failed job in database');
      }
    }

    logger.error({ jobId: id, error }, 'Job failed');
  }

  getJobSummary(id: string): {
    id: string;
    status: MaintenanceJobStatus;
    progress: string;
    currentTask?: string;
    completedTasks: number;
    totalTasks: number;
    tasks: Array<{ name: string; status: string; result?: unknown }>;
    result?: MaintenanceResult;
    error?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  } | null {
    const job = this.jobs.get(id);
    if (!job) return null;

    return {
      id: job.id,
      status: job.status,
      progress: `${job.progress.completedTasks}/${job.progress.totalTasks} tasks`,
      currentTask: job.progress.currentTask,
      completedTasks: job.progress.completedTasks,
      totalTasks: job.progress.totalTasks,
      tasks: job.progress.tasks.map((t) => ({
        name: t.name,
        status: t.status,
        result: t.result,
      })),
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const cutoff = now - this.config.jobRetentionMs;

    for (const [id, job] of this.jobs) {
      if (job.status === 'completed' || job.status === 'failed') {
        const completedAt = job.completedAt ? new Date(job.completedAt).getTime() : 0;
        if (completedAt < cutoff) {
          this.jobs.delete(id);
          logger.debug({ jobId: id }, 'Cleaned up old job from memory');
        }
      }
    }

    if (this.repository) {
      try {
        const cutoffDate = new Date(cutoff).toISOString();
        const deleted = await this.repository.deleteOlderThan(cutoffDate);
        if (deleted > 0) {
          logger.debug({ deleted }, 'Cleaned up old jobs from database');
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to clean up old jobs from database');
      }
    }
  }

  private enforceMaxHistory(): void {
    if (this.jobs.size <= this.config.maxJobHistory) return;

    const completedJobs = Array.from(this.jobs.entries())
      .filter(([, job]) => job.status === 'completed' || job.status === 'failed')
      .sort(([, a], [, b]) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const toRemove = this.jobs.size - this.config.maxJobHistory;
    for (let i = 0; i < toRemove && i < completedJobs.length; i++) {
      const entry = completedJobs[i];
      if (entry) {
        this.jobs.delete(entry[0]);
      }
    }
  }

  stop(): void {
    if (this.cleanupInterval !== undefined) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}

let instance: MaintenanceJobManager | null = null;

export function getMaintenanceJobManager(): MaintenanceJobManager {
  if (!instance) {
    instance = new MaintenanceJobManager();
  }
  return instance;
}

export function resetMaintenanceJobManager(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
